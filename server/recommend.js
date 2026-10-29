/**
 * 协同过滤推荐（Item-KNN，零依赖纯 SQL/JS）。
 *
 * 信号权重（隐式反馈）：收藏 3 > 点赞 2 ≈ 评论 2 > 浏览 1（每人每帖每天记 1 次）。
 * 相似度：cos(帖子A的加权用户向量, 帖子B的加权用户向量)，离线批任务算好存
 * item_similarities（每帖只留 top-K 正相似），读时零计算。
 *
 * 推荐链路（每层不足就往下兜底，保证永不空窗）：
 *   个性化 CF（用户交互过什么 → 找相似帖）
 *   → 内容相似（同标签/同画板）
 *   → 热门（近 30 天互动量）
 */
const db = require("./database");

const W = { collect: 3, like: 2, comment: 2, view: 1 };
const TOP_K = 20;          // 每帖保留的相似邻居数
const MIN_SIM_SCORE = 0.05; // 过滤噪声相似

/** 用户-帖子加权交互矩阵：Map<postId, Map<userId, weight>> */
function interactionMatrix() {
  const m = new Map();
  const add = (userId, postId, w) => {
    if (!m.has(postId)) m.set(postId, new Map());
    const users = m.get(postId);
    users.set(userId, (users.get(userId) || 0) + w);
  };
  for (const r of db.prepare("SELECT user_id, post_id FROM post_collects").all()) add(r.user_id, r.post_id, W.collect);
  for (const r of db.prepare("SELECT user_id, post_id FROM post_likes").all()) add(r.user_id, r.post_id, W.like);
  for (const r of db.prepare("SELECT author_id AS user_id, post_id FROM comments").all()) add(r.user_id, r.post_id, W.comment);
  // 浏览按「人-帖-天」去重后再计权
  for (const r of db.prepare("SELECT user_id, post_id, COUNT(DISTINCT day) AS days FROM post_views GROUP BY user_id, post_id").all()) {
    add(r.user_id, r.post_id, W.view * Math.min(r.days, 3));
  }
  return m;
}

/** 余弦相似度（稀疏向量：Map<userId, weight>） */
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [, w] of a) na += w * w;
  for (const [u, w] of b) {
    nb += w * w;
    const aw = a.get(u);
    if (aw) dot += aw * w;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * 重建 item_similarities（全量重算）。
 * 当前规模（千级帖子）毫秒级完成；帖子更多时可按互动帖对做剪枝。
 */
function rebuildSimilarities() {
  const m = interactionMatrix();
  const ids = [...m.keys()];
  const norms = new Map(ids.map(id => [id, Math.sqrt([...m.get(id).values()].reduce((s, w) => s + w * w, 0))]));

  // 只算「共同被至少一个用户交互过」的帖对（倒排剪枝，避免全量 O(n²)）
  const userItems = new Map(); // userId -> [postId]
  for (const [postId, users] of m) {
    for (const u of users.keys()) {
      if (!userItems.has(u)) userItems.set(u, []);
      userItems.get(u).push(postId);
    }
  }
  const pairs = new Map(); // "a:b" (a<b) -> Σ 共同用户权重乘积
  for (const [u, posts] of userItems) {
    for (let i = 0; i < posts.length; i++) {
      for (let j = i + 1; j < posts.length; j++) {
        const a = Math.min(posts[i], posts[j]);
        const b = Math.max(posts[i], posts[j]);
        const key = a + ":" + b;
        const dot = (m.get(a).get(u) || 0) * (m.get(b).get(u) || 0);
        pairs.set(key, (pairs.get(key) || 0) + dot);
      }
    }
  }

  const simRows = [];
  for (const [key, dot] of pairs) {
    const [a, b] = key.split(":").map(Number);
    const na = norms.get(a), nb = norms.get(b);
    if (!na || !nb) continue;
    const s = dot / (na * nb);
    if (s >= MIN_SIM_SCORE) {
      simRows.push([a, b, s]);
    }
  }

  const del = db.prepare("DELETE FROM item_similarities");
  const ins = db.prepare(
    "INSERT OR REPLACE INTO item_similarities (post_id, similar_post_id, score) VALUES (?, ?, ?)",
  );
  db.exec("BEGIN");
  try {
    del.run();
    // 每帖保留 top-K
    const byItem = new Map();
    for (const [a, b, s] of simRows) {
      if (!byItem.has(a)) byItem.set(a, []);
      if (!byItem.has(b)) byItem.set(b, []);
      byItem.get(a).push([b, s]);
      byItem.get(b).push([a, s]);
    }
    for (const [a, list] of byItem) {
      list.sort((x, y) => y[1] - x[1]);
      for (const [b, s] of list.slice(0, TOP_K)) ins.run(a, b, s);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return byItemSize(simRows);
}

function byItemSize(rows) {
  const items = new Set();
  rows.forEach(([a, b]) => { items.add(a); items.add(b); });
  return { pairs: rows.length, items: items.size };
}

/**
 * 个性化推荐流：用户交互过的帖子 → 相似帖打分 → 排除已交互 → 排序。
 * 返回 postId 列表（可能为空，调用方走兜底）。
 */
function recommendForUser(userId, limit = 20) {
  const interacted = new Set();
  for (const r of db.prepare("SELECT post_id FROM post_likes WHERE user_id = ?").all(userId)) interacted.add(r.post_id);
  for (const r of db.prepare("SELECT post_id FROM post_collects WHERE user_id = ?").all(userId)) interacted.add(r.post_id);
  for (const r of db.prepare("SELECT DISTINCT post_id FROM post_views WHERE user_id = ?").all(userId)) interacted.add(r.post_id);

  const scores = new Map();
  const seeds = db.prepare(`
    SELECT post_id, weight FROM (
      SELECT post_id, ${W.collect} AS weight FROM post_collects WHERE user_id = ?
      UNION ALL SELECT post_id, ${W.like} FROM post_likes WHERE user_id = ?
      UNION ALL SELECT c.post_id, ${W.comment} FROM comments c WHERE c.author_id = ?
      UNION ALL SELECT v.post_id, ${W.view} FROM (SELECT DISTINCT post_id FROM post_views WHERE user_id = ?) v
    )
  `).all(userId, userId, userId, userId);

  if (!seeds.length) return [];
  const ph = seeds.map(() => "?").join(",");
  const neighbors = db.prepare(`
    SELECT post_id, similar_post_id, score FROM item_similarities
    WHERE post_id IN (${ph})
  `).all(...seeds.map(s => s.post_id));
  const seedWeight = new Map(seeds.map(s => [s.post_id, s.weight]));
  for (const n of neighbors) {
    if (interacted.has(n.similar_post_id)) continue;
    // 只推仍在库的帖子
    const s = (scores.get(n.similar_post_id) || 0) + n.score * (seedWeight.get(n.post_id) || 1);
    scores.set(n.similar_post_id, s);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit * 2)
    .filter(([id]) => db.prepare("SELECT 1 FROM posts WHERE id = ?").get(id))
    .slice(0, limit)
    .map(([id]) => id);
}

/** 内容相似兜底：同标签/同画板的近期帖 */
function contentSimilar(postId, limit = 12) {
  const post = db.prepare("SELECT board, tags FROM posts WHERE id = ?").get(postId);
  if (!post) return [];
  let tags = [];
  try { tags = JSON.parse(post.tags || "[]"); } catch { /* 忽略 */ }
  const like = tags.length
    ? `AND (board = ? OR tags LIKE ${tags.map(() => "?").join(" OR tags LIKE ")})`
    : "AND board = ?";
  const params = tags.length ? [post.board, ...tags.map(t => `%"${t}"%`)] : [post.board];
  return db.prepare(`
    SELECT id FROM posts WHERE id != ? ${like}
    ORDER BY created_at DESC LIMIT ?
  `).all(postId, ...params, limit).map(r => r.id);
}

/** 热门兜底：点赞×2 + 收藏×3（子查询避免双表 JOIN 笛卡尔积虚增） */
function popular(limit = 20, excludeIds = []) {
  const ph = excludeIds.map(() => "?").join(",");
  const excl = excludeIds.length ? `AND p.id NOT IN (${ph})` : "";
  return db.prepare(`
    SELECT p.id FROM posts p
    WHERE 1=1 ${excl}
    ORDER BY (
      (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) * 2 +
      (SELECT COUNT(*) FROM post_collects c WHERE c.post_id = p.id) * 3
    ) DESC, p.created_at DESC
    LIMIT ?
  `).all(...excludeIds, limit).map(r => r.id);
}

/** 用户交互过的全部帖子 id（推荐与补齐都要排除） */
function interactedIds(userId) {
  const s = new Set();
  for (const r of db.prepare("SELECT post_id FROM post_likes WHERE user_id = ?").all(userId)) s.add(r.post_id);
  for (const r of db.prepare("SELECT post_id FROM post_collects WHERE user_id = ?").all(userId)) s.add(r.post_id);
  for (const r of db.prepare("SELECT DISTINCT post_id FROM post_views WHERE user_id = ?").all(userId)) s.add(r.post_id);
  return [...s];
}

module.exports = { rebuildSimilarities, recommendForUser, contentSimilar, popular, interactionMatrix, interactedIds };
