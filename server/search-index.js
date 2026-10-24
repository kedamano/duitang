/**
 * 全文检索索引（SQLite FTS5）。
 *
 * 背景：FTS5 自带的 trigram 分词要求查询 ≥3 字符，中文最常用的「汉服」「壁纸」
 * 都是 2 字，会直接搜不到；unicode61 又不做中文分词。
 *
 * 方案（无第三方依赖）：把中文切成**重叠二元组**后入库索引，
 * 查询时用同样规则切词，于是「汉服写真」被索引成 `汉服 服写 写真`，
 * 搜「汉服」即可命中，且仍是 FTS5 的倒排索引（不是全表 LIKE）。
 */
const db = require('./database');

/** 画板英文 key → 中文名（让用户搜「美食」也能找到美食画板的帖子） */
const BOARD_LABELS = {
  wallpaper: '壁纸头像', anime: '动漫插画', fashion: '时尚穿搭', food: '美食菜谱',
  diy: '手工DIY', home: '家居生活', makeup: '美妆造型', travel: '旅行摄影',
  ancient: '古风汉服', pet: '萌宠植物', quote: '文字句子', wedding: '婚纱婚礼',
};

/** 兼容中文名反查（历史数据可能存中文） */
function boardLabel(key) {
  if (!key) return '';
  return BOARD_LABELS[key] || key;
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/**
 * 把文本转成可索引的词串：
 * - 中文按重叠二元组切分（单字保留单字）
 * - 其他语言按空白/标点切分并小写
 */
function toSearchTerms(text) {
  if (!text) return '';
  const plain = String(text).replace(/<[^>]*>/g, ' ');
  const runs = plain.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+|[^\s\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g) || [];
  const out = [];
  for (const run of runs) {
    if (CJK.test(run)) {
      const chars = [...run];
      if (chars.length === 1) out.push(chars[0]);
      else for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
    } else {
      // 去掉纯标点片段
      const cleaned = run.replace(/[^\p{L}\p{N}_-]+/gu, ' ').trim();
      if (cleaned) out.push(...cleaned.toLowerCase().split(/\s+/).filter(Boolean));
    }
  }
  return out.join(' ');
}

/** 帖子用于索引的全文（标题 + 描述 + 标签 + 作者昵称 + 画板中文名） */
function postSearchText(post) {
  const tags = Array.isArray(post.tags) ? post.tags.join(' ') : (post.tags || '');
  return [post.title || '', post.description || '', tags, post.author_nickname || '', boardLabel(post.board)].join(' ');
}

/** 建立 / 更新某条帖子的索引 */
function indexPost(post) {
  try {
    db.prepare('DELETE FROM post_fts WHERE rowid = ?').run(post.id);
    const terms = toSearchTerms(postSearchText(post));
    if (!terms) return;
    db.prepare('INSERT INTO post_fts (rowid, terms) VALUES (?, ?)').run(post.id, terms);
  } catch {
    /* 索引失败不应影响主流程 */
  }
}

/** 删除某条帖子的索引 */
function removeFromIndex(postId) {
  try {
    db.prepare('DELETE FROM post_fts WHERE rowid = ?').run(postId);
  } catch { /* 忽略 */ }
}

/**
 * 搜索帖子 id。
 * 返回 null 表示「本次搜索不可用，调用方应回落到 LIKE」。
 * 返回数组（可能为空）表示 FTS 已给出确定结果。
 */
function searchPostIds(query, limit = 500) {
  const q = String(query || '').trim();
  if (!q) return null;
  const terms = toSearchTerms(q);
  // 单字中文会切成单字 token，FTS5 里只有二元组，命不中 → 回落到 LIKE
  if (!terms || terms.replace(/\s+/g, '').length < 2) return null;

  try {
    // 多个词之间用 AND 连接，保证「汉服 写真」要求同时命中
    const matchExpr = terms.split(/\s+/).filter(Boolean).map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ');
    const rows = db.prepare('SELECT rowid AS id FROM post_fts WHERE post_fts MATCH ? LIMIT ?').all(matchExpr, limit);
    return rows.map(r => r.id);
  } catch {
    return null;
  }
}

/** 全量重建索引（启动时若为空则自动执行；也可用 scripts/rebuild-search-index.js 手动触发） */
function rebuildIndex(force = false) {
  let count = 0;
  try {
    count = db.prepare('SELECT COUNT(*) AS c FROM post_fts').get().c;
  } catch {
    return 0;
  }
  if (count > 0 && !force) return 0;

  if (force) {
    try { db.prepare('DELETE FROM post_fts').run(); } catch { /* 忽略 */ }
  }

  const posts = db.prepare(`
    SELECT p.*, u.nickname AS author_nickname
    FROM posts p JOIN users u ON p.author_id = u.id
  `).all();
  for (const p of posts) {
    try { p.tags = JSON.parse(p.tags || '[]'); } catch { p.tags = []; }
    indexPost(p);
  }
  return posts.length;
}

module.exports = { toSearchTerms, indexPost, removeFromIndex, searchPostIds, rebuildIndex };
