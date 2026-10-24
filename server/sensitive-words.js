/**
 * 敏感词过滤。
 * 默认词表只用于演示「有过滤能力」，真实运营应替换为完整词库或接入第三方服务。
 * 可用环境变量 SENSITIVE_WORDS="词1,词2" 覆盖。
 */
const DEFAULT_WORDS = [
  '傻逼', '操你妈', '滚你妈', '色情', '赌博', '代开发票', '加微信',
  'fuck', 'shit', 'bitch',
];

const words = (process.env.SENSITIVE_WORDS
  ? process.env.SENSITIVE_WORDS.split(',')
  : DEFAULT_WORDS
).map(w => w.trim()).filter(Boolean);

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 长词优先，避免短词先匹配导致长词只剩一半
const pattern = words.length
  ? new RegExp(words.slice().sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'gi')
  : null;

/** 是否包含敏感词 */
function hasSensitive(text) {
  if (!pattern || typeof text !== 'string' || !text) return false;
  pattern.lastIndex = 0;
  return pattern.test(text);
}

/** 把敏感词替换为等长的 * */
function maskSensitive(text) {
  if (!pattern || typeof text !== 'string' || !text) return text;
  pattern.lastIndex = 0;
  return text.replace(pattern, m => '*'.repeat(m.length));
}

module.exports = { words, hasSensitive, maskSensitive };
