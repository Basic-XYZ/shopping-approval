const api = require('../../utils/api');
Page({
  data: { session: null, name: '', inputCode: '', invite: null, error: '', busy: false, loading: false },
  onLoad(options) { if (options.code) this.setData({ inputCode: options.code }); },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try { const session = await api.call('session'); this.setData({ session, name: session.me.name }); }
    catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  name(e) { this.setData({ name: e.detail.value }); },
  code(e) { this.setData({ inputCode: e.detail.value.trim() }); },
  async run(action, data) {
    if (this.data.busy || this.data.loading) return;
    this.setData({ busy: true, error: '' });
    try {
      const result = await api.call(action, data);
      if (action === 'invite') this.setData({ invite: { ...result, expires: api.date(result.expiresAt) } });
      else { this.setData({ invite: null }); await this.load(); wx.showToast({ title: '已保存', icon: 'success' }); }
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ busy: false }); }
  },
  save() { return this.run('profile', { name: this.data.name }); },
  invite() { return this.run('invite', {}); },
  async bind() {
    if (this.data.busy) return;
    const answer = await wx.showModal({ title: '绑定搭档', content: '绑定后，双方可查看当前关系下的购物申请、金额和审批记录。确定继续吗？' });
    if (answer.confirm) return this.run('bind', { code: this.data.inputCode });
  },
  copy() { wx.setClipboardData({ data: this.data.invite.code }); },
  async unbind() {
    if (this.data.busy) return;
    const result = await wx.showModal({ title: '解除绑定', content: '双方将无法访问当前关系的历史申请。即使重新绑定同一人，也会开启新的独立记录。确定解绑吗？', confirmColor: '#aa343f' });
    if (result.confirm) return this.run('unbind', {});
  },
  onShareAppMessage() {
    return { title: '和我一起使用购物审批', path: this.data.invite ? `/pages/settings/index?code=${this.data.invite.code}` : '/pages/home/index' };
  }
});
