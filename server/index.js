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
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

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
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ─────────────────────────────────────────────
// 帖子
// ─────────────────────────────────────────────

// 帖子列表（分页）
app.get('/api/posts', (req, res) => {
  const { page = 1, limit = 20, board, user_id, q } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  let sql = 'SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as count FROM posts p WHERE 1=1';
  const params = [];
  const countParams = [];
  if (board) {
    sql += ' AND p.board = ?'; countSql += ' AND p.board = ?';
    params.push(board); countParams.push(board);
  }
  if (user_id) {
    sql += ' AND p.author_id = ?'; countSql += ' AND p.author_id = ?';
    const uid = parseInt(user_id);
    params.push(uid); countParams.push(uid);
  }
  if (q) {
    // 标题、描述、标签模糊匹配
    sql += ' AND (p.title LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)';
    countSql += ' AND (p.title LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)';
    const kw = '%' + q + '%';
    params.push(kw, kw, kw); countParams.push(kw, kw, kw);
  }
  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const posts = db.prepare(sql).all(...params);
  posts.forEach(post => {
    try { post.images = JSON.parse(post.images); } catch { post.images = []; }
    try { post.tags = JSON.parse(post.tags); } catch { post.tags = []; }
  });

  const total = db.prepare(countSql).get(...countParams).count;
  res.json({ posts, total, page: pageNum, limit: limitNum });
});

// 单个帖子详情
app.get('/api/posts/:id', (req, res) => {
  const post = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  try { post.images = JSON.parse(post.images); } catch { post.images = []; }
  try { post.tags = JSON.parse(post.tags); } catch { post.tags = []; }

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
  const { title, description, board, images, tags } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题必填' });
  if (!images || images.length === 0) return res.status(400).json({ error: '至少一张图片' });

  const imageStr = JSON.stringify(images);
  const tagStr = JSON.stringify(tags || []);
  const info = db.prepare('INSERT INTO posts (author_id, title, description, board, images, tags) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, title, description || '', board || '', imageStr, tagStr
  );

  const post = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?').get(info.lastInsertRowid);
  try { post.images = JSON.parse(post.images); } catch { post.images = []; }
  try { post.tags = JSON.parse(post.tags); } catch { post.tags = []; }

  res.json({ post });
});

// 删除帖子
app.delete('/api/posts/:id', authMiddleware, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: '无权限删除' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// 点赞
// ─────────────────────────────────────────────
app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.user.id;
  const post = db.prepare('SELECT id, likes_count FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  const existing = db.prepare('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?').get(userId, postId);
  if (existing) {
    db.prepare('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(userId, postId);
    db.prepare('UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?').run(postId);
    res.json({ liked: false, count: post.likes_count - 1 });
  } else {
    db.prepare('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)').run(userId, postId);
    db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId);
    res.json({ liked: true, count: post.likes_count + 1 });
  }
});

// ─────────────────────────────────────────────
// 收藏
// ─────────────────────────────────────────────
app.post('/api/posts/:id/collect', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.user.id;
  const post = db.prepare('SELECT id, collects_count FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  const existing = db.prepare('SELECT 1 FROM post_collects WHERE user_id = ? AND post_id = ?').get(userId, postId);
  if (existing) {
    db.prepare('DELETE FROM post_collects WHERE user_id = ? AND post_id = ?').run(userId, postId);
    db.prepare('UPDATE posts SET collects_count = collects_count - 1 WHERE id = ?').run(postId);
    res.json({ collected: false, count: post.collects_count - 1 });
  } else {
    db.prepare('INSERT INTO post_collects (user_id, post_id) VALUES (?, ?)').run(userId, postId);
    db.prepare('UPDATE posts SET collects_count = collects_count + 1 WHERE id = ?').run(postId);
    res.json({ collected: true, count: post.collects_count + 1 });
  }
});

// ─────────────────────────────────────────────
// 评论
// ─────────────────────────────────────────────

// 获取帖子的评论
app.get('/api/posts/:id/comments', (req, res) => {
  const postId = parseInt(req.params.id);
  const comments = db.prepare('SELECT c.*, u.nickname as author_nickname, u.avatar as author_avatar FROM comments c JOIN users u ON c.author_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC').all(postId);

  // 当前用户对评论的点赞状态
  const authHeader = req.headers.authorization?.replace('Bearer ', '');
  if (authHeader) {
    try {
      const user = jwt.verify(authHeader, JWT_SECRET);
      comments.forEach(c => {
        c.is_liked = !!db.prepare('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?').get(user.id, c.id);
      });
    } catch {}
  }

  res.json({ comments });
});

// 发布评论
app.post('/api/posts/:id/comments', authMiddleware, (req, res) => {
  const postId = parseInt(req.params.id);
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });

  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  const info = db.prepare('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)').run(postId, req.user.id, content.trim());
  db.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').run(postId);

  const comment = db.prepare('SELECT c.*, u.nickname as author_nickname, u.avatar as author_avatar FROM comments c JOIN users u ON c.author_id = u.id WHERE c.id = ?').get(info.lastInsertRowid);
  comment.is_liked = false;
  res.json({ comment });
});

// 删除评论
app.delete('/api/comments/:id', authMiddleware, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: '评论不存在' });
  if (comment.author_id !== req.user.id) return res.status(403).json({ error: '无权限' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  db.prepare('UPDATE posts SET comments_count = comments_count - 1 WHERE id = ?').run(comment.post_id);
  res.json({ ok: true });
});

// 评论点赞
app.post('/api/comments/:id/like', authMiddleware, (req, res) => {
  const commentId = parseInt(req.params.id);
  const userId = req.user.id;
  const comment = db.prepare('SELECT id, likes_count FROM comments WHERE id = ?').get(commentId);
  if (!comment) return res.status(404).json({ error: '评论不存在' });

  const existing = db.prepare('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?').get(userId, commentId);
  if (existing) {
    db.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?').run(userId, commentId);
    db.prepare('UPDATE comments SET likes_count = likes_count - 1 WHERE id = ?').run(commentId);
    res.json({ liked: false, count: comment.likes_count - 1 });
  } else {
    db.prepare('INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)').run(userId, commentId);
    db.prepare('UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?').run(commentId);
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
    res.json({ following: false });
  } else {
    db.prepare('INSERT INTO user_follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, targetId);
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

// 我的收藏
app.get('/api/my/collects', authMiddleware, (req, res) => {
  const collects = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM post_collects pc JOIN posts p ON pc.post_id = p.id JOIN users u ON p.author_id = u.id WHERE pc.user_id = ? ORDER BY pc.created_at DESC').all(req.user.id);
  collects.forEach(post => {
    try { post.images = JSON.parse(post.images); } catch { post.images = []; }
    try { post.tags = JSON.parse(post.tags); } catch { post.tags = []; }
  });
  res.json({ posts: collects });
});

// 我的点赞
app.get('/api/my/likes', authMiddleware, (req, res) => {
  const likes = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM post_likes pl JOIN posts p ON pl.post_id = p.id JOIN users u ON p.author_id = u.id WHERE pl.user_id = ? ORDER BY pl.created_at DESC').all(req.user.id);
  likes.forEach(post => {
    try { post.images = JSON.parse(post.images); } catch { post.images = []; }
    try { post.tags = JSON.parse(post.tags); } catch { post.tags = []; }
  });
  res.json({ posts: likes });
});

// 我的发布
app.get('/api/my/posts', authMiddleware, (req, res) => {
  const posts = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.author_id = ? ORDER BY p.created_at DESC').all(req.user.id);
  posts.forEach(post => {
    try { post.images = JSON.parse(post.images); } catch { post.images = []; }
    try { post.tags = JSON.parse(post.tags); } catch { post.tags = []; }
  });
  res.json({ posts });
});

// 我的关注列表
app.get('/api/my/following', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT following_id as id FROM user_follows WHERE follower_id = ?').all(req.user.id);
  res.json({ ids: rows.map(r => r.id) });
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
