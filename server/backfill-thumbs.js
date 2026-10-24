/**
 * 为已有上传图片补生成缩略图，并回填 posts.thumbs。
 * 用法: node backfill-thumbs.js
 * 只处理指向 /uploads/ 的本地图片；外链图片自动回落原图，无需处理。
 */
const path = require('path');
const fs = require('fs');
const db = require('./database');
const Jimp = require('jimp');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const THUMB_WIDTH = 400;

async function ensureThumb(urlPath) {
  const file = path.basename(urlPath);
  const src = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(src)) return null;
  const thumbName = file.replace(path.extname(file), '_thumb.jpg');
  const thumbPath = path.join(UPLOAD_DIR, thumbName);
  if (fs.existsSync(thumbPath)) return `/uploads/${thumbName}`;
  const img = await Jimp.read(src);
  await img.resize(THUMB_WIDTH, Jimp.AUTO).quality(80).writeAsync(thumbPath);
  return `/uploads/${thumbName}`;
}

(async () => {
  const posts = db.prepare('SELECT id, images, thumbs FROM posts').all();
  let touched = 0;
  let generated = 0;

  for (const post of posts) {
    let images = [];
    let thumbs = [];
    try { images = JSON.parse(post.images || '[]'); } catch { images = []; }
    try { thumbs = JSON.parse(post.thumbs || '[]'); } catch { thumbs = []; }
    if (!Array.isArray(images) || !images.length) continue;

    const next = [];
    let changed = false;
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (typeof img === 'string' && img.startsWith('/uploads/')) {
        const thumb = await ensureThumb(img);
        if (thumb) {
          if (thumbs[i] !== thumb) { changed = true; generated++; }
          next.push(thumb);
          continue;
        }
      }
      // 外链或处理失败：回落原图
      if (thumbs[i] !== img) changed = true;
      next.push(img);
    }

    if (changed || next.length !== thumbs.length) {
      db.prepare('UPDATE posts SET thumbs = ? WHERE id = ?').run(JSON.stringify(next), post.id);
      touched++;
    }
  }

  console.log(`缩略图回填完成：处理 ${touched} 条帖子，新生成 ${generated} 张缩略图`);
})().catch(e => {
  console.error('回填失败:', e.message);
  process.exit(1);
});
