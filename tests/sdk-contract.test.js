'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cloud = require('../cloudfunctions/shoppingApi/node_modules/wx-server-sdk');
const { createStore } = require('../cloudfunctions/shoppingApi/store');

test('installed WeChat SDK preserves transaction return and missing document contract', async () => {
  cloud.init({ env: 'local-contract-test', throwOnNotFound: false });
  const db = cloud.database({ throwOnNotFound: false });
  // Stub only the network-facing database, retaining the actual WeChat SDK wrappers.
  const records = {};
  db._db.runTransaction = async (callback) => callback({
    collection(name) {
      return { doc(id) {
        return {
          async get() { return { data: records[`${name}/${id}`] || null }; },
          async set(data) { records[`${name}/${id}`] = { ...data, _id: id }; return { upsertedId: id }; }
        };
      } };
    }
  });
  const store = createStore(db);
  const result = await store.transaction(async (tx) => {
    assert.equal(await tx.get('users', 'missing'), null);
    await tx.set('users', 'alice', { _id: 'alice', name: 'Alice' });
    assert.equal((await tx.get('users', 'alice')).name, 'Alice');
    return { verified: true };
  });
  assert.deepEqual(result, { verified: true });
});
