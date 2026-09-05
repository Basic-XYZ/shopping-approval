'use strict';

const { createHash, randomBytes } = require('node:crypto');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const COLLECTIONS = { users: 'sa_users', invites: 'sa_invites', groups: 'sa_groups', requests: 'sa_requests' };

class BusinessError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function requireThat(condition, code, message) {
  if (!condition) throw new BusinessError(code, message);
}
function text(value, name, max, optional = false) {
  requireThat(typeof value === 'string', 'INVALID_INPUT', `${name}格式不正确`);
  const result = value.trim();
  requireThat((optional || result.length > 0) && result.length <= max, 'INVALID_INPUT', `${name}需为${optional ? 0 : 1}至${max}个字符`);
  return result;
}
function parseAmount(value) {
  requireThat(typeof value === 'string' && /^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(value), 'INVALID_AMOUNT', '金额需为正数，最多两位小数');
  const [whole, decimals = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  requireThat(cents > 0 && cents <= 100000000, 'INVALID_AMOUNT', '金额需大于0且不超过100万元');
  return cents;
}
function purchaseInput(input) {
  const link = text(input.link || '', '商品链接', 1000, true);
  if (link) {
    let url;
    try { url = new URL(link); } catch (_) { throw new BusinessError('INVALID_LINK', '请输入完整的 HTTPS 商品链接'); }
    requireThat(url.protocol === 'https:' && !url.username && !url.password, 'INVALID_LINK', '仅支持 HTTPS 商品链接');
  }
  return {
    title: text(input.title, '商品名称', 60),
    amountCents: parseAmount(input.amount),
    reason: text(input.reason, '购买理由', 500),
    link,
    category: ['daily', 'digital', 'food', 'clothing', 'other'].includes(input.category) ? input.category : 'other'
  };
}
const publicUser = (user) => ({ id: user._id, name: user.name, groupId: user.groupId || '' });

function createService(store, { clock = Date.now, token = () => randomBytes(16).toString('hex') } = {}) {
  async function user(tx, actor) {
    const me = await tx.get(COLLECTIONS.users, actor);
    requireThat(me, 'NOT_REGISTERED', '请先进入小程序首页');
    return me;
  }
  async function pair(tx, actor) {
    const me = await user(tx, actor);
    requireThat(me.groupId, 'NOT_BOUND', '请先绑定搭档');
    const group = await tx.get(COLLECTIONS.groups, me.groupId);
    requireThat(group && group.active && group.members.includes(actor), 'INVALID_PAIR', '搭档关系已失效');
    const partnerId = group.members.find((id) => id !== actor);
    const partner = await tx.get(COLLECTIONS.users, partnerId);
    requireThat(partner && partner.groupId === group._id, 'INVALID_PAIR', '搭档关系已失效');
    return { me, partner, group };
  }
  async function requestInPair(tx, actor, id) {
    const current = await pair(tx, actor);
    const request = await tx.get(COLLECTIONS.requests, text(id, '申请编号', 80));
    requireThat(request && request.groupId === current.group._id, 'NOT_FOUND', '申请不存在或无权访问');
    return { ...current, request };
  }
  function viewRequest(request, actor) {
    return { ...request, isMine: request.creatorId === actor };
  }
  async function execute(action, input, actor) {
    requireThat(typeof actor === 'string' && actor.length > 0, 'UNAUTHENTICATED', '需要微信小程序身份');
    const now = clock();
    switch (action) {
      case 'session':
        return store.transaction(async (tx) => {
          let me = await tx.get(COLLECTIONS.users, actor);
          if (!me) {
            me = { _id: actor, name: '微信用户', groupId: '', inviteHash: '', createdAt: now };
            await tx.set(COLLECTIONS.users, actor, me);
          }
          const current = me.groupId ? await pair(tx, actor) : null;
          return { me: publicUser(me), partner: current ? publicUser(current.partner) : null };
        });
      case 'profile':
        return store.transaction(async (tx) => {
          const me = await user(tx, actor);
          me.name = text(input.name, '昵称', 20);
          await tx.set(COLLECTIONS.users, actor, me);
          return publicUser(me);
        });
      case 'invite': {
        const code = token();
        const inviteHash = hash(code);
        return store.transaction(async (tx) => {
          const me = await user(tx, actor);
          requireThat(!me.groupId, 'ALREADY_BOUND', '已绑定搭档，请先解绑');
          requireThat(!me.inviteAt || now - me.inviteAt >= 60000, 'RATE_LIMITED', '请稍后再生成邀请码');
          me.inviteHash = inviteHash;
          me.inviteAt = now;
          await tx.set(COLLECTIONS.users, actor, me);
          await tx.set(COLLECTIONS.invites, inviteHash, { ownerId: actor, expiresAt: now + 86400000, used: false });
          return { code, expiresAt: now + 86400000 };
        });
      }
      case 'bind': {
        const code = text(input.code, '邀请码', 32).toLowerCase();
        requireThat(/^[0-9a-f]{32}$/.test(code), 'INVALID_INVITE', '邀请码格式不正确');
        const inviteHash = hash(code);
        const groupId = token();
        return store.transaction(async (tx) => {
          const me = await user(tx, actor);
          requireThat(!me.groupId, 'ALREADY_BOUND', '你已绑定搭档');
          const invite = await tx.get(COLLECTIONS.invites, inviteHash);
          requireThat(invite && !invite.used && invite.expiresAt > now, 'INVALID_INVITE', '邀请码已失效');
          requireThat(invite.ownerId !== actor, 'SELF_BIND', '不能绑定自己');
          const other = await user(tx, invite.ownerId);
          requireThat(!other.groupId && other.inviteHash === inviteHash, 'INVALID_INVITE', '邀请码已失效');
          const group = { _id: groupId, members: [actor, other._id].sort(), active: true, createdAt: now };
          await tx.set(COLLECTIONS.groups, groupId, group);
          for (const member of [me, other]) {
            member.groupId = groupId;
            member.inviteHash = '';
            await tx.set(COLLECTIONS.users, member._id, member);
          }
          await tx.set(COLLECTIONS.invites, inviteHash, { ...invite, used: true });
          return { me: publicUser(me), partner: publicUser(other) };
        });
      }
      case 'unbind':
        return store.transaction(async (tx) => {
          const { me, partner, group } = await pair(tx, actor);
          for (const member of [me, partner]) {
            await tx.set(COLLECTIONS.users, member._id, { ...member, groupId: '', inviteHash: '' });
          }
          await tx.set(COLLECTIONS.groups, group._id, { ...group, active: false, endedAt: now });
          return { unbound: true };
        });
      case 'create': {
        const fields = purchaseInput(input);
        const clientId = text(input.clientId, '提交编号', 80);
        const id = hash(`${actor}:${clientId}`);
        return store.transaction(async (tx) => {
          const { me, partner, group } = await pair(tx, actor);
          const existing = await tx.get(COLLECTIONS.requests, id);
          if (existing) {
            requireThat(existing.groupId === group._id, 'STALE_DRAFT', '搭档已变更，请重新创建申请');
            return viewRequest(existing, actor);
          }
          requireThat(!me.lastCreatedAt || now - me.lastCreatedAt >= 3000, 'RATE_LIMITED', '提交太频繁，请稍后再试');
          const request = { _id: id, ...fields, creatorId: actor, creatorName: me.name,
            approverId: partner._id, approverName: partner.name, groupId: group._id,
            status: 'pending', revision: 1, createdAt: now, updatedAt: now,
            history: [{ action: 'created', name: me.name, at: now, comment: '' }] };
          await tx.set(COLLECTIONS.requests, id, request);
          await tx.set(COLLECTIONS.users, actor, { ...me, lastCreatedAt: now });
          await tx.set(COLLECTIONS.groups, group._id, { ...group, updatedAt: now });
          return viewRequest(request, actor);
        });
      }
      case 'detail':
        return store.transaction(async (tx) => viewRequest((await requestInPair(tx, actor, input.id)).request, actor));
      case 'list': {
        requireThat(['pending', 'mine', 'history'].includes(input.tab), 'INVALID_INPUT', '无效列表类型');
        const offset = input.offset === undefined ? 0 : input.offset;
        requireThat(Number.isInteger(offset) && offset >= 0 && offset <= 10000, 'INVALID_INPUT', '分页参数不正确');
        const current = await store.transaction((tx) => pair(tx, actor));
        const query = { groupId: current.group._id };
        if (input.tab === 'pending') Object.assign(query, { approverId: actor, status: 'pending' });
        if (input.tab === 'mine') query.creatorId = actor;
        if (input.tab === 'history') query.status = { in: ['approved', 'rejected', 'purchased', 'cancelled'] };
        const rows = await store.list(COLLECTIONS.requests, query, offset, 21);
        // Check the relationship again before returning a page fetched outside a transaction.
        const latest = await store.transaction((tx) => pair(tx, actor));
        requireThat(latest.group._id === current.group._id, 'INVALID_PAIR', '搭档已变更，请刷新');
        return { items: rows.slice(0, 20).map((row) => viewRequest(row, actor)), hasMore: rows.length > 20 };
      }
      case 'transition':
        return store.transaction(async (tx) => {
          const { me, group, request } = await requestInPair(tx, actor, input.id);
          requireThat(input.revision === request.revision, 'STALE_VERSION', '申请已更新，请刷新后重试');
          const rules = {
            approve: ['pending', 'approved', request.approverId],
            reject: ['pending', 'rejected', request.approverId],
            purchase: ['approved', 'purchased', request.creatorId],
            cancel: ['pending', 'cancelled', request.creatorId],
            resubmit: ['rejected', 'pending', request.creatorId]
          };
          const rule = rules[input.operation];
          requireThat(rule, 'INVALID_INPUT', '无效操作');
          requireThat(rule[2] === actor, 'FORBIDDEN', '你无权执行此操作');
          requireThat(request.status === rule[0], 'INVALID_STATUS', '当前状态无法执行此操作');
          requireThat(request.history.length < 50, 'REVISION_LIMIT', '此申请操作次数已达上限，请创建新申请');
          const comment = text(input.comment || '', '审批备注', 200, input.operation !== 'reject');
          const fields = input.operation === 'resubmit' ? purchaseInput(input) : {};
          const updated = { ...request, ...fields, status: rule[1], revision: request.revision + 1,
            updatedAt: now, history: request.history.concat({ action: input.operation, name: me.name, at: now, comment }) };
          await tx.set(COLLECTIONS.requests, request._id, updated);
          // Share a write target with unbind so approval cannot commit against a closed relationship.
          await tx.set(COLLECTIONS.groups, group._id, { ...group, updatedAt: now });
          return viewRequest(updated, actor);
        });
      default:
        throw new BusinessError('INVALID_ACTION', '不支持的操作');
    }
  }
  return { execute };
}

module.exports = { createService, BusinessError, COLLECTIONS, parseAmount, hash };
