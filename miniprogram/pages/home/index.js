const api = require('../../utils/api');
Page({
  data: { tab: 'pending', items: [], loading: false, error: '', session: null, hasMore: false,
    tabs: [{ value: 'pending', label: '待我审批' }, { value: 'mine', label: '我的申请' }, { value: 'history', label: '已处理' }] },
  onShow() { this.refresh(); },
  async onPullDownRefresh() { try { await this.refresh(); } finally { wx.stopPullDownRefresh(); } },
  async refresh() {
    const sequence = (this.sequence || 0) + 1;
    this.sequence = sequence;
    this.setData({ loading: true, error: '', items: [], hasMore: false });
    try {
      const session = await api.call('session');
      if (sequence !== this.sequence) return;
      this.setData({ session });
      if (session.partner) {
        const list = await api.call('list', { tab: this.data.tab, offset: 0 });
        if (sequence === this.sequence) this.setData({ items: list.items.map(api.decorate), hasMore: list.hasMore });
      }
    } catch (error) { if (sequence === this.sequence) this.setData({ error: error.message }); }
    finally { if (sequence === this.sequence) this.setData({ loading: false }); }
  },
  async onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    const sequence = this.sequence;
    this.setData({ loading: true, error: '' });
    try {
      const list = await api.call('list', { tab: this.data.tab, offset: this.data.items.length });
      if (sequence === this.sequence) this.setData({ items: this.data.items.concat(list.items.map(api.decorate)), hasMore: list.hasMore });
    } catch (error) { if (sequence === this.sequence) this.setData({ error: error.message }); }
    finally { if (sequence === this.sequence) this.setData({ loading: false }); }
  },
  selectTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); this.refresh(); },
  settings() { wx.navigateTo({ url: '/pages/settings/index' }); },
  create() { wx.navigateTo({ url: '/pages/edit/index' }); },
  detail(e) { wx.navigateTo({ url: `/pages/detail/index?id=${e.currentTarget.dataset.id}` }); }
});
