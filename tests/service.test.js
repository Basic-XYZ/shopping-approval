'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createService, parseAmount, COLLECTIONS } = require('../cloudfunctions/shoppingApi/service');
const { memoryStore } = require('./memory-store');
const purchase = { title: '降噪耳机', amount: '299.90', reason: '通勤使用', category: 'digital', link: 'https://example.com/product', clientId: 'request-1' };

async function setup() {
  const store = memoryStore();
  let time = 1700000000000;
  const service = createService(store, { clock: () => time });
  const call = (actor, action, input = {}) => service.execute(action, input, actor);
  for (const id of ['A', 'B', 'C']) await call(id, 'session');
  const invite = await call('A', 'invite');
  await call('B', 'bind', { code: invite.code });
  return { store, call, advance: (delta) => { time += delta; } };
}
const rejects = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test('amounts are exact cents; malformed, zero and excessive amounts rejected', () => {
  assert.equal(parseAmount('299.90'), 29990);
  assert.equal(parseAmount('0.01'), 1);
  for (const input of ['0', '-1', 'Infinity', 'NaN', '1e3', '01', '1.001', '1000000.01', 12]) {
    assert.throws(() => parseAmount(input), { code: 'INVALID_AMOUNT' });
  }
});
test('session initialization is idempotent and names have server validation', async () => {
  const { call } = await setup();
  assert.deepEqual(await call('A', 'session'), await call('A', 'session'));
  await rejects(call('A', 'profile', { name: ' ' }), 'INVALID_INPUT');
  await call('A', 'profile', { name: '小明' });
  assert.equal((await call('B', 'session')).partner.name, '小明');
});
test('full purchase flow: create, approve and purchase with history', async () => {
  const { call } = await setup();
  const item = await call('A', 'create', purchase);
  assert.equal(item.amountCents, 29990);
  assert.equal(item.status, 'pending');
  assert.equal((await call('B', 'list', { tab: 'pending' })).items.length, 1);
  const approved = await call('B', 'transition', { id: item._id, revision: 1, operation: 'approve' });
  const bought = await call('A', 'transition', { id: item._id, revision: approved.revision, operation: 'purchase' });
  assert.equal(bought.status, 'purchased');
  assert.deepEqual(bought.history.map((entry) => entry.action), ['created', 'approve', 'purchase']);
});
test('server rejects self approval, outsider reads and forged approver fields', async () => {
  const { call } = await setup();
  const item = await call('A', 'create', { ...purchase, approverId: 'C', status: 'approved' });
  assert.equal(item.approverId, 'B');
  assert.equal(item.status, 'pending');
  await rejects(call('A', 'transition', { id: item._id, revision: 1, operation: 'approve' }), 'FORBIDDEN');
  await rejects(call('C', 'detail', { id: item._id }), 'NOT_BOUND');
});
test('idempotent create creates one record for simultaneous retries', async () => {
  const { call, store } = await setup();
  const results = await Promise.all([call('A', 'create', purchase), call('A', 'create', purchase)]);
  assert.equal(results[0]._id, results[1]._id);
  assert.equal(Object.keys(store.snapshot()[COLLECTIONS.requests]).length, 1);
});
test('concurrent approval/rejection produces one winner', async () => {
  const { call } = await setup();
  const item = await call('A', 'create', purchase);
  const results = await Promise.allSettled(['approve', 'reject'].map((operation) => call('B', 'transition', {
    id: item._id, revision: 1, operation, comment: '暂时不需要'
  })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'STALE_VERSION');
});
test('rejection requires reason; resubmit updates validated fields and revision', async () => {
  const { call } = await setup();
  const item = await call('A', 'create', purchase);
  await rejects(call('B', 'transition', { id: item._id, revision: 1, operation: 'reject' }), 'INVALID_INPUT');
  await call('B', 'transition', { id: item._id, revision: 1, operation: 'reject', comment: '换个便宜点的' });
  await rejects(call('A', 'transition', { ...purchase, amount: '-5', id: item._id, revision: 2, operation: 'resubmit' }), 'INVALID_AMOUNT');
  const resubmitted = await call('A', 'transition', { ...purchase, amount: '199', id: item._id, revision: 2, operation: 'resubmit' });
  assert.equal(resubmitted.amountCents, 19900);
  assert.equal(resubmitted.status, 'pending');
  assert.equal(resubmitted.revision, 3);
});
test('invalid action, pagination and non-HTTPS links fail closed', async () => {
  const { call } = await setup();
  await rejects(call('A', 'anything'), 'INVALID_ACTION');
  await rejects(call('A', 'list', { tab: 'all' }), 'INVALID_INPUT');
  await rejects(call('A', 'list', { tab: 'mine', offset: -1 }), 'INVALID_INPUT');
  await rejects(call('A', 'create', { ...purchase, link: 'javascript:alert(1)' }), 'INVALID_LINK');
});
test('unbind removes access, even after binding same partner again', async () => {
  const { call, advance } = await setup();
  const item = await call('A', 'create', purchase);
  await call('A', 'unbind');
  await rejects(call('B', 'transition', { id: item._id, revision: 1, operation: 'approve' }), 'NOT_BOUND');
  advance(60001);
  const invite = await call('A', 'invite');
  await call('B', 'bind', { code: invite.code });
  await rejects(call('A', 'detail', { id: item._id }), 'NOT_FOUND');
  await rejects(call('A', 'create', purchase), 'STALE_DRAFT');
  assert.equal((await call('A', 'list', { tab: 'mine' })).items.length, 0);
});
test('binding failures rollback all writes; concurrent binding has one winner', async () => {
  const { call, store, advance } = await setup();
  await call('A', 'unbind');
  advance(60001);
  const invite = await call('A', 'invite');
  store.failAfterWrites(2);
  await assert.rejects(call('B', 'bind', { code: invite.code }), /injected/);
  assert.equal((await call('A', 'session')).partner, null);
  assert.equal((await call('B', 'session')).partner, null);
  const results = await Promise.allSettled(['B', 'C'].map((actor) => call(actor, 'bind', { code: invite.code })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});
test('invite expiration, rotation, self-binding and generation throttling', async () => {
  const { call, advance } = await setup();
  await call('A', 'unbind');
  advance(60001);
  const old = await call('A', 'invite');
  await rejects(call('A', 'bind', { code: old.code }), 'SELF_BIND');
  await rejects(call('A', 'invite'), 'RATE_LIMITED');
  advance(60001);
  const fresh = await call('A', 'invite');
  await rejects(call('B', 'bind', { code: old.code }), 'INVALID_INVITE');
  advance(86400001);
  await rejects(call('B', 'bind', { code: fresh.code }), 'INVALID_INVITE');
});
test('request pagination uses 20-item pages', async () => {
  const { call, advance } = await setup();
  for (let i = 0; i < 22; i++) { advance(3001); await call('A', 'create', { ...purchase, clientId: `page-${i}` }); }
  const first = await call('A', 'list', { tab: 'mine' });
  const second = await call('A', 'list', { tab: 'mine', offset: 20 });
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.equal(new Set(first.items.concat(second.items).map((row) => row._id)).size, 22);
});
