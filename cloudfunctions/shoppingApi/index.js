'use strict';
const cloud = require('wx-server-sdk');
const { createService, BusinessError, hash } = require('./service');
const { createStore } = require('./store');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const service = createService(createStore(cloud.database({ throwOnNotFound: false })));

exports.main = async (event = {}) => {
  try {
    const { OPENID, APPID } = cloud.getWXContext();
    const expectedAppId = process.env.MINIPROGRAM_APPID;
    if (!expectedAppId || !/^wx[0-9a-f]{16}$/.test(expectedAppId)) {
      throw new BusinessError('NOT_CONFIGURED', '云函数尚未配置小程序 AppID');
    }
    if (!OPENID || APPID !== expectedAppId) {
      throw new BusinessError('UNAUTHENTICATED', '仅允许绑定的微信小程序访问');
    }
    const actor = hash(`${APPID}:${OPENID}`);
    const data = await service.execute(event.action, event, actor);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof BusinessError) return { ok: false, code: error.code, message: error.message };
    console.error('[shoppingApi]', error.code || error.errCode || 'INTERNAL');
    return { ok: false, code: 'INTERNAL', message: '服务暂不可用，请稍后重试' };
  }
};
