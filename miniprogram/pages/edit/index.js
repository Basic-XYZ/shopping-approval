const api = require('../../utils/api');
Page({
  data: { form: { title: '', amount: '', reason: '', link: '', category: 'daily' }, categories: api.categories,
    categoryIndex: 0, busy: false, loading: false, error: '', id: '', revision: null },
  onLoad(options) {
    this.clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    if (options.id) { this.setData({ id: options.id }); this.load(); }
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const row = api.decorate(await api.call('detail', { id: this.data.id }));
      if (!row.isMine || row.status !== 'rejected') throw new Error('只能修改自己被驳回的申请');
      this.setData({ form: { title: row.title, amount: row.amount, reason: row.reason, link: row.link, category: row.category },
        revision: row.revision, categoryIndex: api.categories.findIndex((item) => item.value === row.category) });
      wx.setNavigationBarTitle({ title: '修改申请' });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  input(e) { this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }); },
  category(e) { const index = Number(e.detail.value); this.setData({ categoryIndex: index, 'form.category': api.categories[index].value }); },
  async submit() {
    if (this.data.busy || this.data.loading) return;
    const form = this.data.form;
    if (!form.title.trim() || !form.reason.trim() || !/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(form.amount) || Number(form.amount) <= 0) {
      this.setData({ error: '请填写商品名称、购买理由和正确的金额（最多两位小数）' }); return;
    }
    this.setData({ busy: true, error: '' });
    try {
      const data = this.data.id
        ? await api.call('transition', { ...form, id: this.data.id, revision: this.data.revision, operation: 'resubmit' })
        : await api.call('create', { ...form, clientId: this.clientId });
      wx.redirectTo({ url: `/pages/detail/index?id=${data._id}` });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ busy: false }); }
  }
});
