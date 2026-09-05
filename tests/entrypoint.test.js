'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const realService = require('../cloudfunctions/shoppingApi/service');
const source = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/shoppingApi/index.js'), 'utf8');
const appid = 'wx0123456789abcdef';
function entry(context, env = appid) {
  let received;
  const sandbox = { exports: {}, process: { env: { MINIPROGRAM_APPID: env } }, console: { error() {} },
    require(name) {
      if (name === 'wx-server-sdk') return { init() {}, database() {}, getWXContext: () => context };
      if (name === './store') return { createStore() {} };
      if (name === './service') return { ...realService, createService: () => ({ execute: async (...args) => { received = args; return { success: true }; } }) };
      throw new Error(`Unexpected import ${name}`);
    }
  };
  vm.runInNewContext(source, sandbox);
  return { main: sandbox.exports.main, received: () => received };
}
test('cloud entry rejects missing or mismatched WeChat identity and missing app configuration', async () => {
  assert.equal((await entry({}).main({ action: 'session', OPENID: 'forged', APPID: appid })).code, 'UNAUTHENTICATED');
  assert.equal((await entry({ OPENID: 'someone', APPID: 'wx1111111111111111' }).main({})).code, 'UNAUTHENTICATED');
  assert.equal((await entry({ OPENID: 'someone', APPID: appid }, '').main({})).code, 'NOT_CONFIGURED');
});
test('cloud entry derives actor from trusted context, not client fields', async () => {
  const api = entry({ OPENID: 'someone', APPID: appid });
  assert.equal((await api.main({ action: 'session', actor: 'forged' })).ok, true);
  assert.equal(api.received()[2], realService.hash(`${appid}:someone`));
});
