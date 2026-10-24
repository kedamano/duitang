/**
 * 上传资源防盗链与水印。
 *
 * 防盗链两种模式：
 * 1) 签名 URL：/uploads/xxx.jpg?sign=<hmac>，未签名或签名错误直接 403；
 * 2) Referer 校验：只允许同源或白名单来源的 Referer。
 * 两者都可通过环境变量关闭（开发环境图片直链会被前端引用，需谨慎）。
 *
 * 水印：生成时在右下角叠加站点名，作为 _wm.jpg 变体随原图一起下发。
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const SECRET = process.env.UPLOAD_SIGN_SECRET || process.env.JWT_SECRET || 'duitang-upload-secret';
const WATERMARK_TEXT = process.env.WATERMARK_TEXT || '堆糖 duitang';
const REFERER_WHITELIST = (process.env.UPLOAD_REFERER_WHITELIST || '')
  .split(',').map(s => s.trim()).filter(Boolean);

/** 是否启用防盗链（默认仅在生产启用，避免打断本地开发） */
const HOTLINK_ENABLED = process.env.UPLOAD_HOTLINK_PROTECT === '1';
const REFERER_ENABLED = process.env.UPLOAD_REFERER_CHECK === '1';

/** 生成签名（有效期默认 7 天） */
function signFile(fileName, ttlMs = 7 * 24 * 3600 * 1000) {
  const expires = Date.now() + ttlMs;
  const mac = crypto.createHmac('sha256', SECRET).update(`${fileName}:${expires}`).digest('hex');
  return `${expires}.${mac}`;
}

/** 校验签名 */
function verifyFile(fileName, sign) {
  if (!sign || !sign.includes('.')) return false;
  const [expiresStr, mac] = sign.split('.');
  const expires = Number(expiresStr);
  if (!expires || Date.now() > expires) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(`${fileName}:${expiresStr}`).digest('hex');
  // 定长比较，避免时序侧信道
  const a = Buffer.from(mac || '');
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Referer 是否在白名单内（同源也算） */
function refererAllowed(req) {
  const referer = req.headers.referer || '';
  if (!referer) return false; // 无 Referer（直接粘贴地址）一律拒绝
  try {
    const u = new URL(referer);
    const host = u.host;
    if (req.headers.host && host === req.headers.host) return true;
    return REFERER_WHITELIST.some(w => host === w || u.host.endsWith(w));
  } catch {
    return false;
  }
}

/**
 * 防盗链中间件（挂载在 express.static 之前）。
 * 未启用时直接放行。
 */
function hotlinkGuard(req, res, next) {
  if (!HOTLINK_ENABLED && !REFERER_ENABLED) return next();
  const fileName = path.basename(req.path);
  if (!fileName) return next();

  if (HOTLINK_ENABLED) {
    const sign = req.query.sign;
    if (!verifyFile(fileName, sign)) {
      return res.status(403).json({ error: '资源访问受限' });
    }
  }
  if (REFERER_ENABLED && !refererAllowed(req)) {
    return res.status(403).json({ error: '资源访问受限' });
  }
  next();
}

/**
 * 给图片叠加水印，输出到 <name>_wm.jpg。
 * 失败时返回 null（不阻断上传）。
 */
async function applyWatermark(filePath) {
  try {
    const img = await Jimp.read(filePath);
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    if (w < 120 || h < 60) return null; // 太小不值得加水印

    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    // measureText 返回 { width, height } 对象
    const measured = Jimp.measureText(font, WATERMARK_TEXT);
    const textW = typeof measured === 'number' ? measured : (measured.width || 0);
    // 图片较小时缩小字号，避免文字超出边界
    const useSmall = textW > w - 24;
    const fontSize = useSmall ? await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE).catch(() => font) : font;

    const out = filePath.replace(path.extname(filePath), '_wm.jpg');
    const x = Math.max(4, w - textW - 12);
    const y = Math.max(4, h - 44);
    // jimp 0.22 的 print 签名为 (font, x, y, text, maxWidth, maxHeight, cb)
    img.print(fontSize, x, y, WATERMARK_TEXT, w - x - 4, h - y - 4);
    await img.quality(85).writeAsync(out);
    return path.basename(out);
  } catch (e) {
    if (process.env.LOG_LEVEL !== 'silent') {
      console.warn('[watermark] 生成失败:', e.message);
    }
    return null;
  }
}

module.exports = {
  signFile,
  verifyFile,
  refererAllowed,
  hotlinkGuard,
  applyWatermark,
  WATERMARK_TEXT,
  HOTLINK_ENABLED,
  REFERER_ENABLED,
};
