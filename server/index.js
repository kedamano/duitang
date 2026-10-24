const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');

const db = require('./database');

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'duitang-dev-secret-key-change-in-production';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ─────────────────────────────────────────────
// 中间件
// ─────────────────────────────────────────────
app.use(pinoHttp({ logger }));
app.use(helmet());
if (FRONTEND_ORIGIN) {
  app.use(cors({ origin: FRONTEND_ORIGIN.split(',').map(x => x.trim()), credentials: true }));
} else {
  // 开发环境:仅允许本机跨域
  app.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, credentials: true }));
}
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

// 基础限流:全局限流 + 认证接口更严
const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED === '1';
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '尝试过于频繁，请稍后再试' },
});
if (!RATE_LIMIT_DISABLED) {
  app.use('/api', apiLimiter);
  app.use('/api/auth', authLimiter);
}

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: Date.now() });
});

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

function issueToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return { ...user, password_hash: undefined };
}

// ─────────────────────────────────────────────
// 用户认证
// ─────────────────────────────────────────────

// 注册
app.post('/api/auth/register', (req, res) => {
  const { username, nickname, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (username.length < 3) return res.status(400).json({ error: '用户名至少3个字符' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: '用户名已存在' });

  const hash = bcrypt.hashSync(password, 10);
  const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(username)}&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4`;
  const info = db.prepare('INSERT INTO users (username, nickname, password_hash, avatar, bio) VALUES (?, ?, ?, ?, ?)').run(
    username, nickname || username, hash, avatar, '这个人很懒，什么都没写~'
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = issueToken(user);
  res.json({ token, user: publicUser(user) });
});

// 登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = issueToken(user);
  res.json({ token, user: publicUser(user) });
});

// 当前用户信息
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const followers = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?').get(user.id).count;
  const following = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?').get(user.id).count;
  const collects = db.prepare('SELECT COUNT(*) as count FROM post_collects WHERE user_id = ?').get(user.id).count;
  const posts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = ?').get(user.id).count;

  res.json({ user: publicUser(user), stats: { followers, following, collects, posts } });
});

// ─────────────────────────────────────────────
// 文件上传
// ─────────────────────────────────────────────
require('fs').mkdirSync(UPLOAD_DIR, { recursive: true });
// 用文件头 magic bytes 校验真实类型，防伪造扩展名
const { fileTypeFromFile } = require('file-type');
const Jimp = require('jimp');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/** 生成缩略图（宽 400，等比），返回文件名；失败时返回 null 由前端回落到原图 */
const THUMB_WIDTH = 400;
async function makeThumb(filePath) {
  const ext = path.extname(filePath);
  const thumbPath = filePath.replace(ext, `_thumb.jpg`);
  const img = await Jimp.read(filePath);
  await img.resize(THUMB_WIDTH, Jimp.AUTO).quality(80).writeAsync(thumbPath);
  return path.basename(thumbPath);
}

app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '上传失败' });
  // 落盘后用 magic bytes 校验真实类型
  try {
    const type = await fileTypeFromFile(req.file.path);
    if (!ALLOWED_MIME.has(type?.mime)) {
      require('fs').unlink(req.file.path, () => {});
      return res.status(400).json({ error: '仅支持 JPG/PNG/WebP/GIF 图片' });
    }
  } catch (e) {
    require('fs').unlink(req.file.path, () => {});
    return res.status(400).json({ error: '文件校验失败' });
  }

  // 生成缩略图：卡片列表用它，详情页仍用原图
  let thumb = null;
  let width = 0, height = 0;
  try {
    const img = await Jimp.read(req.file.path);
    width = img.bitmap.width;
    height = img.bitmap.height;
    thumb = await makeThumb(req.file.path);
  } catch (e) {
    req.log?.warn?.({ err: e.message }, '缩略图生成失败，回落原图');
  }

  res.json({
    url: `/uploads/${req.file.filename}`,
    thumb: thumb ? `/uploads/${thumb}` : `/uploads/${req.file.filename}`,
    width, height,
  });
});

// ─────────────────────────────────────────────
// 帖子
// ─────────────────────────────────────────────

// 中文画板标签 → 英文 key（兼容旧客户端直接提交标签的情况）
const BOARD_ALIAS = {
  '壁纸头像': 'wallpaper', '动漫插画': 'anime', '时尚穿搭': 'fashion', '美食菜谱': 'food',
  '手工DIY': 'diy', '家居生活': 'home', '美妆造型': 'makeup', '旅行摄影': 'travel',
  '古风汉服': 'ancient', '萌宠植物': 'pet', '文字句子': 'quote', '婚纱婚礼': 'wedding',
};
function normalizeBoard(board) {
  if (!board) return '';
  return BOARD_ALIAS[board] || board;
}

// 解析 post 行内的 JSON 字段
function hydratePost(post) {
  try { post.images = JSON.parse(post.images); } catch { post.images = []; }
  try { post.tags = JSON.parse(post.tags); } catch { post.tags = []; }
  try { post.sizes = JSON.parse(post.sizes || '[]'); } catch { post.sizes = []; }
  try { post.thumbs = JSON.parse(post.thumbs || '[]'); } catch { post.thumbs = []; }
  return post;
}

/** 统一的分页参数解析（limit 上限 100） */
function parsePage(req, defaultLimit = 20) {
  const pageNum = Math.max(1, parseInt(req.query.page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit) || defaultLimit));
  return { pageNum, limitNum, offset: (pageNum - 1) * limitNum };
}

/** 从请求头解析当前用户（公开接口里可选） */
function optionalUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// ─────────────────────────────────────────────
// 消息通知
// ─────────────────────────────────────────────
/**
 * 写入一条通知。自己不通知自己。
 * like/collect/follow/comment_like 这类"可取消"的操作做去重，
 * 避免反复点赞产生重复消息；评论每条都算独立消息。
 */
/**
 * 通知偏好：user.notify_prefs 存 JSON，未列出的类型默认开启。
 * 例如 { "like": false } 表示不收点赞通知。
 */
function isNotifyTypeEnabled(userId, type) {
  const row = db.prepare('SELECT notify_prefs FROM users WHERE id = ?').get(userId);
  if (!row) return true;
  let prefs = {};
  try { prefs = JSON.parse(row.notify_prefs || '{}'); } catch { prefs = {}; }
  return prefs[type] !== false;
}

/** SSE 连接表：userId -> Set<res> */
const sseClients = new Map();

function pushNotification(userId, payload) {
  const set = sseClients.get(userId);
  if (!set || set.size === 0) return;
  const data = JSON.stringify(payload);
  for (const res of set) {
    try { res.write(`event: notification\ndata: ${data}\n\n`); } catch { /* 连接已断开 */ }
  }
}

function addNotification({ userId, actorId, type, postId = 0, commentId = 0 }) {
  if (!userId || userId === actorId) return;
  if (!isNotifyTypeEnabled(userId, type)) return;
  const dedupable = type !== 'comment' && type !== 'reply';
  if (dedupable) {
    const existing = db.prepare(
      'SELECT id FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND post_id = ? AND comment_id = ?'
    ).get(userId, actorId, type, postId, commentId);
    if (existing) return;
  }
  const info = db.prepare(
    'INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, actorId, type, postId, commentId);
  // 实时推送给在线用户（离线用户下次拉取即可）
  const unread = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId).count;
  pushNotification(userId, { id: Number(info.lastInsertRowid), type, post_id: postId, comment_id: commentId, unread });
}

/** 取消操作时撤回对应通知 */
function removeNotification({ userId, actorId, type, postId = 0, commentId = 0 }) {
  db.prepare(
    'DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND post_id = ? AND comment_id = ?'
  ).run(userId, actorId, type, postId, commentId);
}

/**
 * 为一批帖子补上当前用户的 is_liked / is_collected。
 * 用两次 IN 查询批量取，避免逐帖 COUNT 造成的 N+1。
 */
function attachInteractions(posts, req) {
  if (!posts.length) return posts;
  const user = optionalUser(req);
  if (!user) return posts;
  const ids = posts.map(p => p.id);
  const ph = ids.map(() => '?').join(',');
  const byId = new Map(posts.map(p => [p.id, p]));
  const liked = db.prepare(`SELECT post_id FROM post_likes WHERE user_id = ? AND post_id IN (${ph})`).all(user.id, ...ids);
  liked.forEach(r => { const p = byId.get(r.post_id); if (p) p.is_liked = true; });
  const collected = db.prepare(`SELECT post_id FROM post_collects WHERE user_id = ? AND post_id IN (${ph})`).all(user.id, ...ids);
  collected.forEach(r => { const p = byId.get(r.post_id); if (p) p.is_collected = true; });
  return posts;
}

// 帖子列表（分页）
app.get('/api/posts', (req, res) => {
  const { board, user_id, q, tag } = req.query;
  const { pageNum, limitNum, offset } = parsePage(req);
  const boardKey = normalizeBoard(board);

  let sql = 'SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as count FROM posts p JOIN users u ON p.author_id = u.id WHERE 1=1';
  const params = [];
  const countParams = [];
  if (boardKey) {
    sql += ' AND p.board = ?'; countSql += ' AND p.board = ?';
    params.push(boardKey); countParams.push(boardKey);
  }
  if (user_id) {
    sql += ' AND p.author_id = ?'; countSql += ' AND p.author_id = ?';
    const uid = parseInt(user_id);
    params.push(uid); countParams.push(uid);
  }
  if (tag) {
    // tags 以 JSON 数组字符串存储，带引号匹配可避免 "猫" 命中 "猫咪"
    sql += ' AND p.tags LIKE ?'; countSql += ' AND p.tags LIKE ?';
    const kw = `%"${tag}"%`;
    params.push(kw); countParams.push(kw);
  }
  if (q) {
    // 标题、描述、标签、作者昵称模糊匹配（与前端本地筛选口径保持一致）
    const cond = ' AND (p.title LIKE ? OR p.description LIKE ? OR p.tags LIKE ? OR u.nickname LIKE ?)';
    sql += cond; countSql += cond;
    const kw = '%' + q + '%';
    params.push(kw, kw, kw, kw); countParams.push(kw, kw, kw, kw);
  }
  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const posts = attachInteractions(db.prepare(sql).all(...params).map(hydratePost), req);
  const total = db.prepare(countSql).get(...countParams).count;
  res.json({ posts, total, page: pageNum, limit: limitNum });
});

// 单个帖子详情
app.get('/api/posts/:id', (req, res) => {
  const post = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  hydratePost(post);

  // 当前用户的互动状态
  const authHeader = req.headers.authorization?.replace('Bearer ', '');
  if (authHeader) {
    try {
      const user = jwt.verify(authHeader, JWT_SECRET);
      post.is_liked = !!db.prepare('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?').get(user.id, post.id);
      post.is_collected = !!db.prepare('SELECT 1 FROM post_collects WHERE user_id = ? AND post_id = ?').get(user.id, post.id);
    } catch {}
  }

  res.json({ post });
});

// 发布帖子
app.post('/api/posts', authMiddleware, (req, res) => {
  const { title, description, board, images, tags, sizes, thumbs } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题必填' });
  if (!Array.isArray(images) || images.length === 0) return res.status(400).json({ error: '至少一张图片' });

  const finalImages = images.slice(0, 9);
  const imageStr = JSON.stringify(finalImages);
  const tagStr = JSON.stringify((tags || []).slice(0, 5));
  // 缩略图与 images 一一对应；缺失时回落原图
  const thumbStr = JSON.stringify(
    Array.isArray(thumbs) && thumbs.length === finalImages.length ? thumbs : finalImages
  );
  // sizes 与 images 一一对应；缺省时存空数组，前端回落到默认比例
  const sizeStr = Array.isArray(sizes) && sizes.length === finalImages.length
    ? JSON.stringify(sizes.map(s => ({ w: Number(s?.w) || 400, h: Number(s?.h) || 300 })))
    : '[]';
  const info = db.prepare('INSERT INTO posts (author_id, title, description, board, images, tags, sizes, thumbs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    req.user.id, title.trim(), description || '', normalizeBoard(board), imageStr, tagStr, sizeStr, thumbStr
  );

  const post = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?').get(info.lastInsertRowid);
  hydratePost(post);

  res.json({ post });
});

// 编辑帖子（仅作者本人）
app.put('/api/posts/:id', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: '无权限编辑' });

  const { title, description, board, tags } = req.body;
  if (title !== undefined && (!title || !title.trim())) return res.status(400).json({ error: '标题不能为空' });

  // 只更新请求里显式给出的字段，未传的保持原值
  const next = {
    title: title !== undefined ? title.trim() : post.title,
    description: description !== undefined ? String(description) : post.description,
    board: board !== undefined ? normalizeBoard(board) : post.board,
    tags: tags !== undefined ? JSON.stringify((tags || []).slice(0, 5)) : post.tags,
  };
  db.prepare('UPDATE posts SET title = ?, description = ?, board = ?, tags = ? WHERE id = ?')
    .run(next.title, next.description, next.board, next.tags, postId);

  const updated = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?').get(postId);
  hydratePost(updated);
  res.json({ post: updated });
});

// 删除帖子
app.delete('/api/posts/:id', authMiddleware, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: '无权限删除' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  // 帖子没了，相关通知也失去意义
  db.prepare('DELETE FROM notifications WHERE post_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// 点赞
// ─────────────────────────────────────────────
app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.user.id;
  const post = db.prepare('SELECT id, author_id, likes_count FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  const existing = db.prepare('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?').get(userId, postId);
  if (existing) {
    db.prepare('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(userId, postId);
    db.prepare('UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?').run(postId);
    removeNotification({ userId: post.author_id, actorId: userId, type: 'like', postId });
    res.json({ liked: false, count: post.likes_count - 1 });
  } else {
    db.prepare('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)').run(userId, postId);
    db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId);
    addNotification({ userId: post.author_id, actorId: userId, type: 'like', postId });
    res.json({ liked: true, count: post.likes_count + 1 });
  }
});

// ─────────────────────────────────────────────
// 收藏
// ─────────────────────────────────────────────
app.post('/api/posts/:id/collect', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.user.id;
  const post = db.prepare('SELECT id, author_id, collects_count FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  const existing = db.prepare('SELECT 1 FROM post_collects WHERE user_id = ? AND post_id = ?').get(userId, postId);
  if (existing) {
    db.prepare('DELETE FROM post_collects WHERE user_id = ? AND post_id = ?').run(userId, postId);
    db.prepare('UPDATE posts SET collects_count = collects_count - 1 WHERE id = ?').run(postId);
    removeNotification({ userId: post.author_id, actorId: userId, type: 'collect', postId });
    res.json({ collected: false, count: post.collects_count - 1 });
  } else {
    db.prepare('INSERT INTO post_collects (user_id, post_id) VALUES (?, ?)').run(userId, postId);
    db.prepare('UPDATE posts SET collects_count = collects_count + 1 WHERE id = ?').run(postId);
    addNotification({ userId: post.author_id, actorId: userId, type: 'collect', postId });
    res.json({ collected: true, count: post.collects_count + 1 });
  }
});

// ─────────────────────────────────────────────
// 评论
// ─────────────────────────────────────────────

/** 给一批评论补上当前用户的 is_liked（批量 IN，避免 N+1） */
function attachCommentLikes(comments, req) {
  comments.forEach(c => { c.is_liked = false; });
  if (!comments.length) return comments;
  const user = optionalUser(req);
  if (!user) return comments;
  const ids = comments.map(c => c.id);
  const ph = ids.map(() => '?').join(',');
  const liked = new Set(
    db.prepare(`SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (${ph})`)
      .all(user.id, ...ids).map(r => r.comment_id)
  );
  comments.forEach(c => { c.is_liked = liked.has(c.id); });
  return comments;
}

const COMMENT_SELECT = 'SELECT c.*, u.nickname as author_nickname, u.avatar as author_avatar FROM comments c JOIN users u ON c.author_id = u.id';

// 获取帖子的评论（顶层分页，楼中楼内嵌前 3 条回复）
app.get('/api/posts/:id/comments', (req, res) => {
  const postId = parseInt(req.params.id);
  const { pageNum, limitNum, offset } = parsePage(req, 50);

  const tops = db.prepare(
    `${COMMENT_SELECT} WHERE c.post_id = ? AND c.parent_id = 0 ORDER BY c.created_at ASC LIMIT ? OFFSET ?`
  ).all(postId, limitNum, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM comments WHERE post_id = ? AND parent_id = 0').get(postId).count;
  const totalAll = db.prepare('SELECT COUNT(*) as count FROM comments WHERE post_id = ?').get(postId).count;

  const replies = [];
  if (tops.length) {
    for (const top of tops) {
      const rows = db.prepare(
        `${COMMENT_SELECT} WHERE c.parent_id = ? ORDER BY c.created_at ASC LIMIT 3`
      ).all(top.id);
      top.reply_count = db.prepare('SELECT COUNT(*) as count FROM comments WHERE parent_id = ?').get(top.id).count;
      top.replies = rows;
      replies.push(...rows);
    }
  }

  attachCommentLikes(tops, req);
  attachCommentLikes(replies, req);
  // 回复的目标昵称，便于前端展示"回复 @某人"
  for (const r of replies) {
    if (r.parent_id) {
      const parent = db.prepare('SELECT c.author_id, u.nickname FROM comments c JOIN users u ON c.author_id = u.id WHERE c.id = ?').get(r.parent_id);
      if (parent) r.reply_to_nickname = parent.nickname;
    }
  }

  res.json({ comments: tops, total, total_all: totalAll, page: pageNum, limit: limitNum });
});

/** 某条顶层评论的更多回复 */
app.get('/api/comments/:id/replies', (req, res) => {
  const parentId = parseInt(req.params.id);
  const { pageNum, limitNum, offset } = parsePage(req, 20);
  const rows = db.prepare(
    `${COMMENT_SELECT} WHERE c.parent_id = ? ORDER BY c.created_at ASC LIMIT ? OFFSET ?`
  ).all(parentId, limitNum, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM comments WHERE parent_id = ?').get(parentId).count;
  attachCommentLikes(rows, req);
  for (const r of rows) {
    const parent = db.prepare('SELECT u.nickname FROM comments c JOIN users u ON c.author_id = u.id WHERE c.id = ?').get(r.parent_id);
    if (parent) r.reply_to_nickname = parent.nickname;
  }
  res.json({ comments: rows, total, page: pageNum, limit: limitNum });
});

// 发布评论 / 回复
app.post('/api/posts/:id/comments', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const { content, parent_id } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });

  const post = db.prepare('SELECT id, author_id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  // 回复：父评论必须存在且属于同一帖子；只允许一层嵌套，统一挂到顶层评论下
  let parentId = 0;
  let parentComment = null;
  if (parent_id) {
    parentComment = db.prepare('SELECT id, post_id, parent_id, author_id FROM comments WHERE id = ?').get(Number(parent_id));
    if (!parentComment) return res.status(400).json({ error: '回复的评论不存在' });
    if (parentComment.post_id !== postId) return res.status(400).json({ error: '评论不属于该帖子' });
    parentId = parentComment.parent_id || parentComment.id;
  }

  const info = db.prepare('INSERT INTO comments (post_id, author_id, content, parent_id) VALUES (?, ?, ?, ?)')
    .run(postId, req.user.id, content.trim(), parentId);
  db.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').run(postId);

  if (!parentComment) {
    addNotification({
      userId: post.author_id, actorId: req.user.id, type: 'comment',
      postId, commentId: Number(info.lastInsertRowid),
    });
  } else {
    // 回复优先通知被回复的人；若帖子作者另有其人，也告知一声
    addNotification({
      userId: parentComment.author_id, actorId: req.user.id, type: 'reply',
      postId, commentId: Number(info.lastInsertRowid),
    });
    if (post.author_id !== parentComment.author_id) {
      addNotification({
        userId: post.author_id, actorId: req.user.id, type: 'comment',
        postId, commentId: Number(info.lastInsertRowid),
      });
    }
  }

  const comment = db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid);
  comment.is_liked = false;
  if (parentId) {
    const parent = db.prepare('SELECT u.nickname FROM comments c JOIN users u ON c.author_id = u.id WHERE c.id = ?').get(parentId);
    if (parent) comment.reply_to_nickname = parent.nickname;
  }
  res.json({ comment });
});

// 删除评论
app.delete('/api/comments/:id', authMiddleware, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: '评论不存在' });
  if (comment.author_id !== req.user.id) return res.status(403).json({ error: '无权限' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  db.prepare('UPDATE posts SET comments_count = comments_count - 1 WHERE id = ?').run(comment.post_id);
  // 评论被删除后，对应的通知也一并撤回
  db.prepare('DELETE FROM notifications WHERE comment_id = ?').run(comment.id);
  res.json({ ok: true });
});

// 评论点赞
app.post('/api/comments/:id/like', authMiddleware, (req, res) => {
  const commentId = parseInt(req.params.id);
  const userId = req.user.id;
  const comment = db.prepare('SELECT id, author_id, post_id, likes_count FROM comments WHERE id = ?').get(commentId);
  if (!comment) return res.status(404).json({ error: '评论不存在' });

  const existing = db.prepare('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?').get(userId, commentId);
  if (existing) {
    db.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?').run(userId, commentId);
    db.prepare('UPDATE comments SET likes_count = likes_count - 1 WHERE id = ?').run(commentId);
    removeNotification({
      userId: comment.author_id, actorId: userId, type: 'comment_like',
      postId: comment.post_id, commentId,
    });
    res.json({ liked: false, count: comment.likes_count - 1 });
  } else {
    db.prepare('INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)').run(userId, commentId);
    db.prepare('UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?').run(commentId);
    addNotification({
      userId: comment.author_id, actorId: userId, type: 'comment_like',
      postId: comment.post_id, commentId,
    });
    res.json({ liked: true, count: comment.likes_count + 1 });
  }
});

// ─────────────────────────────────────────────
// 关注
// ─────────────────────────────────────────────
app.post('/api/users/:id/follow', authMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: '不能关注自己' });

  const existing = db.prepare('SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, targetId);
  if (existing) {
    db.prepare('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, targetId);
    removeNotification({ userId: targetId, actorId: req.user.id, type: 'follow' });
    res.json({ following: false });
  } else {
    db.prepare('INSERT INTO user_follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, targetId);
    addNotification({ userId: targetId, actorId: req.user.id, type: 'follow' });
    res.json({ following: true });
  }
});

// 用户主页
app.get('/api/users/:id/profile', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const followers = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?').get(user.id).count;
  const following = db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?').get(user.id).count;
  const collects = db.prepare('SELECT COUNT(*) as count FROM post_collects WHERE user_id = ?').get(user.id).count;
  const posts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = ?').get(user.id).count;

  const authHeader = req.headers.authorization?.replace('Bearer ', '');
  let is_following = false;
  if (authHeader) {
    try {
      const me = jwt.verify(authHeader, JWT_SECRET);
      is_following = !!db.prepare('SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?').get(me.id, user.id);
    } catch {}
  }

  res.json({ user: publicUser(user), stats: { followers, following, collects, posts }, is_following });
});

/** 关注者 / 关注中 列表（分页，附带当前用户是否已关注每个人） */
function followListHandler(mode) {
  return (req, res) => {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const { pageNum, limitNum, offset } = parsePage(req);

    const base = mode === 'followers'
      ? 'FROM user_follows f JOIN users u ON f.follower_id = u.id WHERE f.following_id = ?'
      : 'FROM user_follows f JOIN users u ON f.following_id = u.id WHERE f.follower_id = ?';

    const users = db.prepare(
      `SELECT u.id, u.username, u.nickname, u.avatar, u.bio ${base} ORDER BY f.created_at DESC, u.id DESC LIMIT ? OFFSET ?`
    ).all(user.id, limitNum, offset);
    const total = db.prepare(`SELECT COUNT(*) as count ${base}`).get(user.id).count;

    users.forEach(u => { u.is_following = false; });
    const me = optionalUser(req);
    if (me && users.length) {
      const ids = users.map(u => u.id);
      const ph = ids.map(() => '?').join(',');
      const mine = new Set(
        db.prepare(`SELECT following_id FROM user_follows WHERE follower_id = ? AND following_id IN (${ph})`)
          .all(me.id, ...ids).map(r => r.following_id)
      );
      users.forEach(u => { u.is_following = mine.has(u.id); });
    }

    res.json({ users, total, page: pageNum, limit: limitNum });
  };
}
app.get('/api/users/:id/followers', followListHandler('followers'));
app.get('/api/users/:id/following', followListHandler('following'));

// ─────────────────────────────────────────────
// 标签聚合
// ─────────────────────────────────────────────

/** 热门标签（按帖子数倒序）；tags 存的是 JSON 数组字符串，这里聚合去重 */
app.get('/api/tags', (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 30));
  const rows = db.prepare('SELECT tags FROM posts').all();
  const counter = new Map();
  for (const row of rows) {
    let arr = [];
    try { arr = JSON.parse(row.tags || '[]'); } catch { arr = []; }
    if (!Array.isArray(arr)) continue;
    for (const raw of new Set(arr.map(t => String(t).trim()).filter(Boolean))) {
      counter.set(raw, (counter.get(raw) || 0) + 1);
    }
  }
  const tags = [...counter.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'))
    .slice(0, limit);
  res.json({ tags });
});

// ─────────────────────────────────────────────
// 消息通知
// ─────────────────────────────────────────────

/** 通知列表（含触发者信息与关联帖子封面） */
app.get('/api/notifications', authMiddleware, (req, res) => {
  const { pageNum, limitNum, offset } = parsePage(req);
  const rows = db.prepare(`
    SELECT n.*, u.nickname as actor_nickname, u.avatar as actor_avatar,
           p.title as post_title, p.images as post_images, p.thumbs as post_thumbs,
           c.content as comment_content
    FROM notifications n
    JOIN users u ON n.actor_id = u.id
    LEFT JOIN posts p ON n.post_id = p.id
    LEFT JOIN comments c ON n.comment_id = c.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, limitNum, offset);

  const notifications = rows.map(r => {
    let cover = '';
    try {
      // 优先缩略图，避免通知面板加载原图
      cover = JSON.parse(r.post_thumbs || '[]')[0] || JSON.parse(r.post_images || '[]')[0] || '';
    } catch { cover = ''; }
    return {
      id: r.id,
      type: r.type,
      is_read: !!r.is_read,
      created_at: r.created_at,
      post_id: r.post_id || null,
      comment_id: r.comment_id || null,
      actor: { id: r.actor_id, nickname: r.actor_nickname, avatar: r.actor_avatar },
      post_title: r.post_title || '',
      post_cover: cover,
      comment_excerpt: (r.comment_content || '').slice(0, 80),
    };
  });

  const total = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ?').get(req.user.id).count;
  const unread = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).count;
  res.json({ notifications, total, unread, page: pageNum, limit: limitNum });
});

/** 未读数量（Header 角标轮询用，体积极小） */
app.get('/api/notifications/unread', authMiddleware, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).count;
  res.json({ count });
});

/** 标记已读：不传 ids 则全部标记 */
app.post('/api/notifications/read', authMiddleware, (req, res) => {
  const { ids } = req.body || {};
  if (Array.isArray(ids) && ids.length) {
    const ph = ids.map(() => '?').join(',');
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${ph})`)
      .run(req.user.id, ...ids.map(Number));
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
  }
  const unread = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).count;
  res.json({ ok: true, unread });
});

/** 清空全部通知 */
app.delete('/api/notifications', authMiddleware, (req, res) => {
  const info = db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true, deleted: info.changes, unread: 0 });
});

/**
 * SSE 实时通知流。
 * EventSource 无法自定义请求头，因此允许用 ?token= 传递凭证。
 */
app.get('/api/notifications/stream', (req, res) => {
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  let user;
  try { user = jwt.verify(token, JWT_SECRET); } catch {
    return res.status(401).json({ error: '未登录' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ userId: user.id })}\n\n`);

  if (!sseClients.has(user.id)) sseClients.set(user.id, new Set());
  sseClients.get(user.id).add(res);

  // 心跳，防止代理/浏览器因空闲断开
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* 已断开 */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = sseClients.get(user.id);
    if (set) {
      set.delete(res);
      if (set.size === 0) sseClients.delete(user.id);
    }
  });
});

// ─────────────────────────────────────────────
// 通知偏好
// ─────────────────────────────────────────────
const NOTIFY_TYPES = ['like', 'collect', 'comment', 'comment_like', 'follow', 'reply'];

app.get('/api/users/me/notify-prefs', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT notify_prefs FROM users WHERE id = ?').get(req.user.id);
  let prefs = {};
  try { prefs = JSON.parse(row?.notify_prefs || '{}'); } catch { prefs = {}; }
  res.json({ prefs, types: NOTIFY_TYPES });
});

app.patch('/api/users/me/notify-prefs', authMiddleware, (req, res) => {
  const { prefs } = req.body || {};
  if (!prefs || typeof prefs !== 'object') return res.status(400).json({ error: '参数错误' });
  const clean = {};
  for (const type of NOTIFY_TYPES) {
    if (typeof prefs[type] === 'boolean') clean[type] = prefs[type];
  }
  db.prepare('UPDATE users SET notify_prefs = ? WHERE id = ?').run(JSON.stringify(clean), req.user.id);
  res.json({ prefs: clean });
});

// 我的收藏（分页，默认 100 条以便个人主页一次展示）
app.get('/api/my/collects', authMiddleware, (req, res) => {
  const { pageNum, limitNum, offset } = parsePage(req, 100);
  const base = 'FROM post_collects pc JOIN posts p ON pc.post_id = p.id JOIN users u ON p.author_id = u.id WHERE pc.user_id = ?';
  const posts = attachInteractions(db.prepare(
    `SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar ${base} ORDER BY pc.created_at DESC LIMIT ? OFFSET ?`
  ).all(req.user.id, limitNum, offset).map(hydratePost), req);
  const total = db.prepare(`SELECT COUNT(*) as count ${base}`).get(req.user.id).count;
  res.json({ posts, total, page: pageNum, limit: limitNum });
});

// 我的点赞（分页）
app.get('/api/my/likes', authMiddleware, (req, res) => {
  const { pageNum, limitNum, offset } = parsePage(req, 100);
  const base = 'FROM post_likes pl JOIN posts p ON pl.post_id = p.id JOIN users u ON p.author_id = u.id WHERE pl.user_id = ?';
  const posts = attachInteractions(db.prepare(
    `SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar ${base} ORDER BY pl.created_at DESC LIMIT ? OFFSET ?`
  ).all(req.user.id, limitNum, offset).map(hydratePost), req);
  const total = db.prepare(`SELECT COUNT(*) as count ${base}`).get(req.user.id).count;
  res.json({ posts, total, page: pageNum, limit: limitNum });
});

// 我的发布（分页）
app.get('/api/my/posts', authMiddleware, (req, res) => {
  const { pageNum, limitNum, offset } = parsePage(req, 100);
  const base = 'FROM posts p JOIN users u ON p.author_id = u.id WHERE p.author_id = ?';
  const posts = attachInteractions(db.prepare(
    `SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar ${base} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
  ).all(req.user.id, limitNum, offset).map(hydratePost), req);
  const total = db.prepare(`SELECT COUNT(*) as count ${base}`).get(req.user.id).count;
  res.json({ posts, total, page: pageNum, limit: limitNum });
});

/**
 * 当前用户的互动 ID 集合（轻量）。
 * 登录时用它同步点赞/收藏/关注状态，替代拉取两份完整帖子体。
 */
app.get('/api/my/interactions', authMiddleware, (req, res) => {
  const liked = db.prepare('SELECT post_id FROM post_likes WHERE user_id = ?').all(req.user.id).map(r => r.post_id);
  const collected = db.prepare('SELECT post_id FROM post_collects WHERE user_id = ?').all(req.user.id).map(r => r.post_id);
  const following = db.prepare('SELECT following_id FROM user_follows WHERE follower_id = ?').all(req.user.id).map(r => r.following_id);
  res.json({ liked, collected, following });
});

// 我的关注列表
app.get('/api/my/following', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT following_id as id FROM user_follows WHERE follower_id = ?').all(req.user.id);
  res.json({ ids: rows.map(r => r.id) });
});

// ─────────────────────────────────────────────
// 关注流：已关注作者 + 自己的帖子，按时间倒序分页
// ─────────────────────────────────────────────
app.get('/api/feed/following', authMiddleware, (req, res) => {
  const { pageNum, limitNum, offset } = parsePage(req);

  const posts = attachInteractions(db.prepare(`
    SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar
    FROM posts p JOIN users u ON p.author_id = u.id
    WHERE p.author_id = ?
       OR p.author_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, limitNum, offset).map(hydratePost), req);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM posts p
    WHERE p.author_id = ?
       OR p.author_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?)
  `).get(req.user.id, req.user.id).count;

  res.json({ posts, total, page: pageNum, limit: limitNum });
});

// 搜索用户
app.get('/api/users', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ users: [] });
  const users = db.prepare('SELECT id, username, nickname, avatar FROM users WHERE username LIKE ? OR nickname LIKE ? LIMIT 10').all(`%${q}%`, `%${q}%`);
  res.json({ users });
});

// 更新当前用户资料（昵称/简介/头像）
app.patch('/api/users/me', authMiddleware, (req, res) => {
  const { nickname, bio, avatar } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const updates = [];
  const params = [];
  if (nickname !== undefined) { if (!nickname.trim()) return res.status(400).json({ error: '昵称不能为空' }); updates.push('nickname = ?'); params.push(nickname.trim()); }
  if (bio !== undefined) { updates.push('bio = ?'); params.push(bio || ''); }
  if (avatar !== undefined) { updates.push('avatar = ?'); params.push(avatar); }
  if (updates.length === 0) return res.json({ user: publicUser(user) });

  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(fresh) });
});

// 分享计数
app.post('/api/posts/:id/share', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const post = db.prepare('SELECT id, shares_count FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  db.prepare('UPDATE posts SET shares_count = shares_count + 1 WHERE id = ?').run(postId);
  res.json({ shared: true, count: post.shares_count + 1 });
});

app.get('/api/posts/:id/share', (req, res) => {
  const post = db.prepare('SELECT shares_count FROM posts WHERE id = ?').get(parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  res.json({ count: post.shares_count });
});

// ─────────────────────────────────────────────
// 启动
// ─────────────────────────────────────────────
// 404
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  req.log.error({ err }, 'unhandled error');
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件不能超过 10MB' : '上传失败';
    return res.status(400).json({ error: msg });
  }
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`🚀 Duitang API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
