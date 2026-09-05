const api = require('../../utils/api');
Page({
  data: { item: null, error: '', busy: false, comment: '', loading: false },
  onLoad(options) { this.id = options.id; },
  onShow() { this.load(); },
  async onPullDownRefresh() { try { await this.load(); } finally { wx.stopPullDownRefresh(); } },
  async load() {
    this.setData({ loading: true, error: '' });
    try { this.setData({ item: api.decorate(await api.call('detail', { id: this.id })) }); }
    catch (error) { this.setData({ error: error.message, item: null }); }
    finally { this.setData({ loading: false }); }
  },
  comment(e) { this.setData({ comment: e.detail.value }); },
  edit() { wx.navigateTo({ url: `/pages/edit/index?id=${this.id}` }); },
  home() { wx.reLaunch({ url: '/pages/home/index' }); },
  copy() { wx.setClipboardData({ data: this.data.item.link }); },
  async act(e) {
    if (this.data.busy) return;
    const operation = e.currentTarget.dataset.action;
    if (operation === 'reject' && !this.data.comment.trim()) { this.setData({ error: '请先填写驳回理由' }); return; }
    const labels = { approve: '同意申请', reject: '驳回申请', purchase: '标记已购买', cancel: '撤回申请' };
    this.setData({ busy: true, error: '' });
    try {
      const answer = await wx.showModal({ title: labels[operation], content: `确定${labels[operation]}吗？`, confirmText: '确定' });
      if (!answer.confirm) return;
      const result = await api.call('transition', { id: this.id, revision: this.data.item.revision, operation, comment: this.data.comment });
      this.setData({ item: api.decorate(result), comment: '' });
    } catch (error) {
      if (error.code === 'STALE_VERSION') await this.load();
      this.setData({ error: error.message });
    } finally { this.setData({ busy: false }); }
  }
});
