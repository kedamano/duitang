/**
 * 为已有上传图片补生成尺寸变体（400 / 800 宽），并回填 posts.thumbs 与 posts.images_variants。
 * 用法: node backfill-thumbs.js
 * 只处理指向 /uploads/ 的本地图片；外链图片自动回落原图，无需处理。
 */
const path = require('path');
const fs = require('fs');
const db = require('./database');
const Jimp = require('jimp');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const VARIANT_WIDTHS = [400, 800];

/** 生成各档变体，返回 [{url,width}] 升序（不含原图） */
async function ensureVariants(urlPath) {
  const file = path.basename(urlPath);
  const src = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(src)) return null;
  const variants = [];
  for (const width of VARIANT_WIDTHS) {
    const outName = file.replace(path.extname(file), `_w${width}.jpg`);
    const outPath = path.join(UPLOAD_DIR, outName);
    if (fs.existsSync(outPath)) {
      variants.push({ url: `/uploads/${outName}`, width });
      continue;
    }
    try {
      const img = await Jimp.read(src);
      if (width >= img.bitmap.width) continue; // 原图更小就不放大
      await img.resize(width, Jimp.AUTO).quality(82).writeAsync(outPath);
      variants.push({ url: `/uploads/${outName}`, width });
    } catch {
      /* 单档失败不影响其他档位 */
    }
  }
  return variants;
}

(async () => {
  const posts = db.prepare('SELECT id, images, thumbs, images_variants FROM posts').all();
  let touched = 0;
  let generated = 0;

  for (const post of posts) {
    let images = [];
    try { images = JSON.parse(post.images || '[]'); } catch { images = []; }
    if (!Array.isArray(images) || !images.length) continue;

    let variantsList = [];
    try { variantsList = JSON.parse(post.images_variants || '[]'); } catch { variantsList = []; }

    const nextVariants = [];
    const nextThumbs = [];
    let changed = false;

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const provided = Array.isArray(variantsList[i]) ? variantsList[i] : null;
      const width = provided?.length ? provided[provided.length - 1]?.width : 0;

      let entry;
      if (typeof img === 'string' && img.startsWith('/uploads/')) {
        const got = await ensureVariants(img);
        if (got) {
          entry = [...got, { url: img, width }];
          generated += got.length;
        } else {
          entry = [{ url: img, width }];
        }
      } else {
        // 外链图片：无法生成变体，回落原图
        entry = [{ url: img, width }];
      }

      // 只保留宽度有效且递增的档位
      const valid = entry
        .filter(v => typeof v.url === 'string' && v.url && v.width > 0)
        .sort((a, b) => a.width - b.width);
      if (!valid.length) valid.push({ url: entry[0]?.url || img, width: 0 });

      if (JSON.stringify(provided) !== JSON.stringify(valid)) changed = true;
      nextVariants.push(valid);
      nextThumbs.push(valid[0].url || img);
    }

    if (changed || nextVariants.length !== variantsList.length) {
      db.prepare('UPDATE posts SET images_variants = ?, thumbs = ? WHERE id = ?')
        .run(JSON.stringify(nextVariants), JSON.stringify(nextThumbs), post.id);
      touched++;
    }
  }

  console.log(`变体回填完成：处理 ${touched} 条帖子，新生成 ${generated} 张变体图`);
})().catch(e => {
  console.error('回填失败:', e.message);
  process.exit(1);
});
