const config = require('../config');
async function call(action, data = {}) {
  if (!wx.cloud) throw new Error('当前微信版本不支持云开发，请升级后重试');
  let response;
  try {
    response = await wx.cloud.callFunction({ name: config.functionName, data: { ...data, action } });
  } catch (_) {
    throw new Error('暂时无法连接云服务，请检查网络或联系开发者确认云环境配置');
  }
  const result = response.result;
  if (!result || !result.ok) {
    const error = new Error(result && result.message || '服务返回异常，请稍后重试');
    error.code = result && result.code;
    throw error;
  }
  return result.data;
}
const categories = [
  { value: 'daily', label: '日用生活' }, { value: 'digital', label: '数码家电' },
  { value: 'food', label: '美食饮品' }, { value: 'clothing', label: '服饰穿搭' }, { value: 'other', label: '其他' }
];
const statuses = { pending: '待审批', approved: '已同意', rejected: '已驳回', purchased: '已购买', cancelled: '已撤回' };
const actions = { created: '提交申请', approve: '同意申请', reject: '驳回申请', purchase: '标记已购买', cancel: '撤回申请', resubmit: '修改后重新提交' };
function date(value) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function decorate(row) {
  return { ...row, amount: (row.amountCents / 100).toFixed(2), statusLabel: statuses[row.status],
    categoryLabel: (categories.find((item) => item.value === row.category) || categories[4]).label,
    time: date(row.createdAt), history: (row.history || []).map((item) => ({ ...item, label: actions[item.action], time: date(item.at) })) };
}
module.exports = { call, decorate, categories, date };
