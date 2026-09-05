const config = require('./config');
App({
  onLaunch() {
    if (wx.cloud) wx.cloud.init({ env: config.cloudEnv, traceUser: false });
  }
});
