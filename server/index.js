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
const sanitizeHtml = require('sanitize-html');
const { maskSensitive } = require('./sensitive-words');
const { signFile, hotlinkGuard, applyWatermark } = require('./upload-guard');
const { indexPost, removeFromIndex, searchPostIds, rebuildIndex } = require('./search-index');

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
// 防盗链中间件放在静态服务之前
app.use('/uploads', hotlinkGuard);
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
    const payload = jwt.verify(token, JWT_SECRET);
    // 管理员标记每次查库，避免权限被撤销后旧 token 仍可用
    const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(payload.id);
    if (!row) return res.status(401).json({ error: '用户不存在' });
    req.user = { ...payload, is_admin: !!row.is_admin };
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

function issueToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * 滑动续期：任何携带合法 token 的请求（含公开接口的 optionalUser 场景），
 * 只要剩余有效期不足 1 天，就用响应头下发新 token，前端透明替换。
 * 活跃用户不再被 7 天硬登出；长期不活跃者仍需重新登录，安全边界保留。
 */
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if ((payload.exp || 0) * 1000 - Date.now() < 24 * 3600 * 1000) {
        const fresh = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.id);
        if (fresh) res.setHeader('X-Refresh-Token', issueToken(fresh));
      }
    } catch { /* 无效 token 交给各接口自行处理 */ }
  }
  next();
});

function publicUser(user) {
  const { password_hash, ...rest } = user;
  return { ...rest, is_admin: !!user.is_admin };
}

/** 管理员校验（审核队列用） */
function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: '需要管理员权限' });
  next();
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

/**
 * 生成多档尺寸的变体（宽 400 缩略图 + 宽 800 中图），原图始终保留为最高档。
 * 返回 [{ url, width }...]，按宽度升序；原图小于目标宽度时不额外放大。
 */
const VARIANT_WIDTHS = [400, 800];

async function makeVariants(filePath, originalWidth) {
  const ext = path.extname(filePath);
  const read = async (width) => {
    if (width >= originalWidth) return null;
    const out = filePath.replace(ext, `_w${width}.jpg`);
    const img = await Jimp.read(filePath);
    await img.resize(width, Jimp.AUTO).quality(82).writeAsync(out);
    const name = path.basename(out);
    return { url: `/uploads/${name}`, width, sign: signFile(name) };
  };
  // 各档位互相独立，并行生成（jimp 纯 JS 串行时一次上传要串 3-4 次解码）
  const results = await Promise.allSettled(VARIANT_WIDTHS.map(w => read(w)));
  const variants = [];
  results.forEach((r, i) => {
    // 单档失败不影响其他档位
    if (r.status === "fulfilled" && r.value) variants.push(r.value);
  });
  // 保持与 VARIANT_WIDTHS 相同的顺序（小档在前）
  return VARIANT_WIDTHS.map(w => variants.find(v => v.width === w)).filter(Boolean);
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

  const url = `/uploads/${req.file.filename}`;
  let width = 0, height = 0;
  let variants = [];
  let watermarked = null;
  let watermarkedSign = null;

  // 尺寸读取/变体生成与水印互不依赖，并行执行
  const mainTask = (async () => {
    const img = await Jimp.read(req.file.path);
    width = img.bitmap.width;
    height = img.bitmap.height;
    variants = await makeVariants(req.file.path, width);
  })().catch(e => {
    req.log?.warn?.({ err: e.message }, '图片尺寸变体生成失败，回落原图');
  });

  const wmTask = applyWatermark(req.file.path).then(wmFile => {
    if (wmFile) {
      watermarked = `/uploads/${wmFile}`;
      watermarkedSign = signFile(wmFile);
    }
  }).catch(e => {
    req.log?.warn?.({ err: e.message }, '水印生成失败，跳过');
  });

  await Promise.all([mainTask, wmTask]);

  res.json({
    url,
    // 兼容旧字段：thumb 指向最小档，缺失时回落原图
    thumb: variants.length ? variants[0].url : url,
    mid: variants.length > 1 ? variants[1].url : url,
    variants,
    watermarked,
    watermarked_sign: watermarkedSign,
    // 防盗链签名（前端拼到图片地址上）
    sign: signFile(req.file.filename),
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
  try { post.images_variants = JSON.parse(post.images_variants || '[]'); } catch { post.images_variants = []; }
  // 动态附加防盗链签名（不入库，按文件名实时计算）
  const signOf = url => {
    if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
    return signFile(path.basename(url));
  };
  post.image_signs = (post.images || []).map(signOf);
  post.variant_signs = (post.images_variants || []).map(list =>
    (list || []).map(v => ({ ...v, sign: signOf(v.url) })));
  return post;
}

/**
 * 清洗富文本描述：只保留排版类标签，链接强制加 rel，杜绝 <script>/on* 注入。
 * 纯文本（历史数据）原样返回，避免被包成 <p>。
 */
const RICH_TEXT_OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'pre', 'h3', 'h4'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

function cleanRichText(input) {
  if (input === undefined || input === null) return '';
  const raw = String(input);
  if (!raw.trim()) return '';
  // 不含任何标签时按纯文本处理（保留换行语义由前端处理）
  if (!/<[a-z][^>]*>/i.test(raw)) return raw.slice(0, 5000);
  return sanitizeHtml(raw, RICH_TEXT_OPTIONS).slice(0, 5000);
}

/**
 * 评论正文清洗：评论只支持纯文本 + 行内标记（**粗**、*斜*、`码`、@提及），
 * 因此把 HTML 标签整体剥掉，避免粘贴进来的标签被原样展示。
 */
function cleanCommentText(input) {
  if (input === undefined || input === null) return '';
  return String(input)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, 1000);
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
 * 取值可为 true / false / 'followers'（仅接收已关注的人发来的）。
 * 例如 { "like": false, "comment": "followers" }。
 */
function getNotifyPrefs(userId) {
  const row = db.prepare('SELECT notify_prefs FROM users WHERE id = ?').get(userId);
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.notify_prefs || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function isNotifyTypeEnabled(userId, type) {
  return getNotifyPrefs(userId)[type] !== false;
}

/** 判断某个通知是否应发送：偏好开启，且（若配置为仅关注的人）对方确实关注了我 */
function canNotify({ userId, actorId, type }) {
  const prefs = getNotifyPrefs(userId);
  if (prefs[type] === false) return false;
  if (prefs[type] === 'followers') {
    // 仅接收"关注我的人"的通知：触发者(follower) 关注了 接收者(following)
    return !!db.prepare('SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?').get(actorId, userId);
  }
  return true;
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
  // 偏好 + 关注关系判定都在写入前完成
  if (!canNotify({ userId, actorId, type })) return;
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
 * 解析评论里的 @昵称 并通知被提到的人。
 * 昵称按全角/半角 @ 匹配，长度 1-20，去除空白。
 */
function notifyMentions({ actorId, content, postId, commentId }) {
  const matches = [...content.matchAll(/@([^\s@]{1,20})/g)].map(m => m[1]);
  if (!matches.length) return [];
  const targets = db.prepare(`
    SELECT id FROM users WHERE nickname IN (${matches.map(() => '?').join(',')})
  `).all(...matches).map(u => u.id);

  const notified = [];
  for (const userId of targets) {
    if (userId === actorId) continue;
    addNotification({ userId, actorId, type: 'mention', postId, commentId });
    notified.push(userId);
  }
  return notified;
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
    // 优先走 FTS5 全文索引（中文用二元组，支持 2 字查询）；
    // 索引不可用或查询太短时回落到 LIKE 模糊匹配
    const ftsIds = searchPostIds(q);
    if (ftsIds !== null) {
      if (ftsIds.length) {
        const ph = ftsIds.map(() => '?').join(',');
        sql += ` AND p.id IN (${ph})`;
        countSql += ` AND p.id IN (${ph})`;
        params.push(...ftsIds);
        countParams.push(...ftsIds);
      } else {
        // FTS 明确无结果
        sql += ' AND 1 = 0';
        countSql += ' AND 1 = 0';
      }
    } else {
      // 回落：标题、描述、标签、作者昵称模糊匹配
      const cond = ' AND (p.title LIKE ? OR p.description LIKE ? OR p.tags LIKE ? OR u.nickname LIKE ?)';
      sql += cond; countSql += cond;
      const kw = '%' + q + '%';
      params.push(kw, kw, kw, kw); countParams.push(kw, kw, kw, kw);
    }
    // 记录搜索词用于「热搜」统计：只记首页、长度≥2，避免输入过程中的半截词刷屏
    if (pageNum === 1 && String(q).trim().length >= 2) {
      try {
        db.prepare('INSERT INTO search_queries (keyword) VALUES (?)').run(String(q).trim().slice(0, 30));
      } catch { /* 统计失败不影响搜索 */ }
    }
  }
  // 拉黑过滤：登录用户看不到被自己拉黑者的内容
  const blockedAuthors = blockedIdsFor(req);
  if (blockedAuthors.length) {
    const ph = blockedAuthors.map(() => '?').join(',');
    sql += ` AND p.author_id NOT IN (${ph})`;
    countSql += ` AND p.author_id NOT IN (${ph})`;
    params.push(...blockedAuthors);
    countParams.push(...blockedAuthors);
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
  const { title, description, board, images, tags, sizes, thumbs, variants } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题必填' });
  if (!Array.isArray(images) || images.length === 0) return res.status(400).json({ error: '至少一张图片' });

  const finalImages = images.slice(0, 9);
  const imageStr = JSON.stringify(finalImages);
  const tagStr = JSON.stringify((tags || []).slice(0, 5));
  // 缩略图与 images 一一对应；缺失时回落原图
  const thumbStr = JSON.stringify(
    Array.isArray(thumbs) && thumbs.length === finalImages.length ? thumbs : finalImages
  );
  // 尺寸变体与 images 一一对应，每项为按宽度升序的 {url,width,sign}；缺失时回落单档
  const variantStr = JSON.stringify(finalImages.map((img, i) => {
    const provided = Array.isArray(variants) ? variants[i] : null;
    if (Array.isArray(provided) && provided.length) {
      return provided.map(v => ({ url: String(v.url || ''), width: Number(v.width) || 0 }));
    }
    return [{ url: String(img), width: 0 }];
  }));
  // sizes 与 images 一一对应；缺省时存空数组，前端回落到默认比例
  const sizeStr = Array.isArray(sizes) && sizes.length === finalImages.length
    ? JSON.stringify(sizes.map(s => ({ w: Number(s?.w) || 400, h: Number(s?.h) || 300 })))
    : '[]';
  const info = db.prepare('INSERT INTO posts (author_id, title, description, board, images, tags, sizes, thumbs, images_variants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    req.user.id, maskSensitive(title.trim()), maskSensitive(cleanRichText(description)), normalizeBoard(board), imageStr, tagStr, sizeStr, thumbStr, variantStr
  );

  const post = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?').get(info.lastInsertRowid);
  hydratePost(post);
  indexPost(post);

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
    title: title !== undefined ? maskSensitive(title.trim()) : post.title,
    description: description !== undefined ? maskSensitive(cleanRichText(description)) : post.description,
    board: board !== undefined ? normalizeBoard(board) : post.board,
    tags: tags !== undefined ? JSON.stringify((tags || []).slice(0, 5)) : post.tags,
  };
  db.prepare('UPDATE posts SET title = ?, description = ?, board = ?, tags = ? WHERE id = ?')
    .run(next.title, next.description, next.board, next.tags, postId);

  const updated = db.prepare('SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?').get(postId);
  hydratePost(updated);
  indexPost(updated);
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
  removeFromIndex(Number(req.params.id));
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

  // 可选：收藏的同时收进指定专辑（只允许自己的专辑）
  const albumId = parseInt(req.body?.album_id);
  const album = albumId
    ? db.prepare('SELECT id, user_id FROM albums WHERE id = ?').get(albumId)
    : null;

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

    let addedToAlbum = false;
    if (album && album.user_id === userId) {
      db.prepare('INSERT OR IGNORE INTO album_posts (album_id, post_id) VALUES (?, ?)').run(album.id, postId);
      addedToAlbum = true;
    }
    res.json({ collected: true, count: post.collects_count + 1, added_to_album: addedToAlbum });
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

  // 拉黑过滤：不展示被自己拉黑者的评论
  const blocked = blockedIdsFor(req);
  const blockClause = blocked.length ? ` AND c.author_id NOT IN (${blocked.map(() => '?').join(',')})` : '';
  const blockArgs = blocked.length ? blocked : [];

  const tops = db.prepare(
    `${COMMENT_SELECT} WHERE c.post_id = ? AND c.parent_id = 0${blockClause} ORDER BY c.created_at ASC LIMIT ? OFFSET ?`
  ).all(postId, ...blockArgs, limitNum, offset);

  const total = db.prepare(
    `SELECT COUNT(*) as count FROM comments c WHERE c.post_id = ? AND c.parent_id = 0${blockClause}`
  ).get(postId, ...blockArgs).count;
  const totalAll = db.prepare(
    `SELECT COUNT(*) as count FROM comments c WHERE c.post_id = ?${blockClause}`
  ).get(postId, ...blockArgs).count;

  const replies = [];
  if (tops.length) {
    for (const top of tops) {
      const rows = db.prepare(
        `${COMMENT_SELECT} WHERE c.parent_id = ?${blockClause} ORDER BY c.created_at ASC LIMIT 3`
      ).all(top.id, ...blockArgs);
      top.reply_count = db.prepare(
        `SELECT COUNT(*) as count FROM comments c WHERE c.parent_id = ?${blockClause}`
      ).get(top.id, ...blockArgs).count;
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
    .run(postId, req.user.id, maskSensitive(cleanCommentText(content)), parentId);
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

  // @ 提醒：解析内容中的 @昵称 并通知被提到的人
  const mentioned = notifyMentions({
    actorId: req.user.id,
    content: content.trim(),
    postId,
    commentId: Number(info.lastInsertRowid),
  });

  const comment = db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid);
  comment.is_liked = false;
  if (parentId) {
    const parent = db.prepare('SELECT u.nickname FROM comments c JOIN users u ON c.author_id = u.id WHERE c.id = ?').get(parentId);
    if (parent) comment.reply_to_nickname = parent.nickname;
  }
  comment.mentioned_users = mentioned;
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

/**
 * 首页聚合数据：热搜词、热门话题、热门作者、新人。
 * 全部基于真实数据计算：热搜来自 search_queries 近 7 天统计，话题来自标签出现频次，
 * 作者按近 30 天作品获得的互动总量排序。
 */
app.get('/api/trending', (req, res) => {
  const searched = db.prepare(`
    SELECT keyword AS tag, COUNT(*) AS count
    FROM search_queries
    WHERE created_at >= datetime('now', '-7 day')
    GROUP BY keyword
    ORDER BY count DESC, keyword ASC
    LIMIT 8
  `).all();

  const tagRows = db.prepare('SELECT tags FROM posts').all();
  const counter = new Map();
  for (const row of tagRows) {
    let arr = [];
    try { arr = JSON.parse(row.tags || '[]'); } catch { arr = []; }
    if (!Array.isArray(arr)) continue;
    for (const raw of new Set(arr.map(t => String(t).trim()).filter(Boolean))) {
      counter.set(raw, (counter.get(raw) || 0) + 1);
    }
  }
  const hotTags = [...counter.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'))
    .slice(0, 8);

  const authors = db.prepare(`
    SELECT u.id, u.username, u.nickname, u.avatar, u.bio,
           COUNT(DISTINCT p.id) AS post_count,
           COALESCE(SUM(p.likes_count + p.collects_count + p.comments_count), 0) AS score
    FROM users u
    JOIN posts p ON p.author_id = u.id
    WHERE p.created_at >= datetime('now', '-30 day')
    GROUP BY u.id
    ORDER BY score DESC, post_count DESC
    LIMIT 6
  `).all();

  const newUsers = db.prepare(`
    SELECT id, username, nickname, avatar, bio
    FROM users ORDER BY created_at DESC, id DESC LIMIT 6
  `).all();

  // 热搜榜：搜索词优先，不足时用热门标签补齐（避免数据稀疏时列表塌成一条）
  const mergedSearches = [];
  const seenKeywords = new Set();
  for (const item of searched) {
    if (seenKeywords.has(item.tag)) continue;
    seenKeywords.add(item.tag);
    mergedSearches.push(item);
  }
  for (const item of hotTags) {
    if (mergedSearches.length >= 8) break;
    if (seenKeywords.has(item.tag)) continue;
    seenKeywords.add(item.tag);
    mergedSearches.push(item);
  }

  res.json({
    searches: mergedSearches.slice(0, 8),
    tags: hotTags,
    authors,
    new_users: newUsers,
  });
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
const NOTIFY_TYPES = ['like', 'collect', 'comment', 'comment_like', 'reply', 'follow', 'mention'];

app.get('/api/users/me/notify-prefs', authMiddleware, (req, res) => {
  res.json({ prefs: getNotifyPrefs(req.user.id), types: NOTIFY_TYPES, modes: ['true', 'false', 'followers'] });
});

app.patch('/api/users/me/notify-prefs', authMiddleware, (req, res) => {
  const { prefs } = req.body || {};
  if (!prefs || typeof prefs !== 'object') return res.status(400).json({ error: '参数错误' });
  const clean = {};
  for (const type of NOTIFY_TYPES) {
    if (typeof prefs[type] === 'boolean') clean[type] = prefs[type];
    else if (prefs[type] === 'followers') clean[type] = 'followers';
  }
  db.prepare('UPDATE users SET notify_prefs = ? WHERE id = ?').run(JSON.stringify(clean), req.user.id);
  res.json({ prefs: clean });
});

// ─────────────────────────────────────────────
// 社区治理：举报 / 审核 / 拉黑
// ─────────────────────────────────────────────
const REPORT_TARGETS = new Set(['post', 'comment', 'user']);

/** 当前用户拉黑的人（未登录返回空） */
function blockedIdsFor(req) {
  const user = optionalUser(req);
  if (!user) return [];
  return db.prepare('SELECT blocked_id FROM user_blocks WHERE blocker_id = ?').all(user.id).map(r => r.blocked_id);
}

/** 提交举报 */
app.post('/api/reports', authMiddleware, (req, res) => {
  const { target_type, target_id, reason } = req.body || {};
  if (!REPORT_TARGETS.has(target_type)) return res.status(400).json({ error: '举报对象类型不合法' });
  const targetId = parseInt(target_id);
  if (!targetId) return res.status(400).json({ error: '缺少 target_id' });

  const table = target_type === 'post' ? 'posts' : target_type === 'comment' ? 'comments' : 'users';
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(targetId)) {
    return res.status(404).json({ error: '举报对象不存在' });
  }

  // 同一用户对同一对象只保留一条待处理举报，避免刷屏
  const dup = db.prepare(
    "SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'"
  ).get(req.user.id, target_type, targetId);
  if (dup) return res.json({ ok: true, duplicated: true });

  db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)')
    .run(req.user.id, target_type, targetId, maskSensitive(String(reason || '').slice(0, 200)));
  res.json({ ok: true });
});

/** 管理员：举报队列 */
app.get('/api/admin/reports', authMiddleware, requireAdmin, (req, res) => {
  const status = ['pending', 'resolved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const { pageNum, limitNum, offset } = parsePage(req, 30);

  const rows = db.prepare(`
    SELECT r.*, u.nickname AS reporter_nickname, u.avatar AS reporter_avatar
    FROM reports r JOIN users u ON r.reporter_id = u.id
    WHERE r.status = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?
  `).all(status, limitNum, offset);

  const reports = rows.map(r => {
    let preview = '';
    let authorId = null;
    if (r.target_type === 'post') {
      const p = db.prepare('SELECT title, author_id FROM posts WHERE id = ?').get(r.target_id);
      if (p) { preview = p.title; authorId = p.author_id; }
    } else if (r.target_type === 'comment') {
      const c = db.prepare('SELECT content, author_id FROM comments WHERE id = ?').get(r.target_id);
      if (c) { preview = String(c.content).slice(0, 60); authorId = c.author_id; }
    } else {
      const u = db.prepare('SELECT nickname, id FROM users WHERE id = ?').get(r.target_id);
      if (u) { preview = u.nickname; authorId = u.id; }
    }
    return { ...r, target_preview: preview, target_author_id: authorId };
  });

  const total = db.prepare('SELECT COUNT(*) AS c FROM reports WHERE status = ?').get(status).c;
  res.json({ reports, total, page: pageNum, limit: limitNum });
});

/** 管理员：处理举报（删除内容 / 驳回） */
app.post('/api/admin/reports/:id/resolve', authMiddleware, requireAdmin, (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: '举报不存在' });
  const action = req.body?.action;
  if (!['delete', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action 只能是 delete 或 reject' });
  }

  if (action === 'delete') {
    if (report.target_type === 'post') {
      db.prepare('DELETE FROM posts WHERE id = ?').run(report.target_id);
      db.prepare('DELETE FROM notifications WHERE post_id = ?').run(report.target_id);
    } else if (report.target_type === 'comment') {
      const c = db.prepare('SELECT post_id FROM comments WHERE id = ?').get(report.target_id);
      db.prepare('DELETE FROM comments WHERE id = ?').run(report.target_id);
      if (c) db.prepare('UPDATE posts SET comments_count = MAX(comments_count - 1, 0) WHERE id = ?').run(c.post_id);
      db.prepare('DELETE FROM notifications WHERE comment_id = ?').run(report.target_id);
    }
    db.prepare("UPDATE reports SET status = 'resolved', handled_by = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(req.user.id, report.id);
  } else {
    db.prepare("UPDATE reports SET status = 'rejected', handled_by = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(req.user.id, report.id);
  }
  res.json({ ok: true, action });
});

/** 拉黑 / 解除拉黑（再次调用即解除） */
app.post('/api/users/:id/block', authMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: '不能拉黑自己' });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId)) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const existing = db.prepare('SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').get(req.user.id, targetId);
  if (existing) {
    db.prepare('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.user.id, targetId);
    return res.json({ blocked: false });
  }
  db.prepare('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)').run(req.user.id, targetId);
  res.json({ blocked: true });
});

/** 我的拉黑列表 */
app.get('/api/my/blocks', authMiddleware, (req, res) => {
  const ids = db.prepare('SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = ?').all(req.user.id).map(r => r.id);
  res.json({ ids });
});

// ─────────────────────────────────────────────
// 服务端草稿箱
// ─────────────────────────────────────────────

/** 读取我的草稿（每人一份） */
app.get('/api/my/draft', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT payload, updated_at FROM drafts WHERE user_id = ?').get(req.user.id);
  if (!row) return res.json({ draft: null });
  let payload = null;
  try { payload = JSON.parse(row.payload); } catch { payload = null; }
  res.json({ draft: payload, updated_at: row.updated_at });
});

/** 保存草稿（覆盖式，每人一份） */
app.put('/api/my/draft', authMiddleware, (req, res) => {
  const payload = req.body?.payload;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload 必填' });
  const text = JSON.stringify(payload);
  if (text.length > 20000) return res.status(400).json({ error: '草稿内容过大' });

  db.prepare(`
    INSERT INTO drafts (user_id, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
  `).run(req.user.id, text);
  res.json({ ok: true });
});

/** 删除草稿（发布成功后调用） */
app.delete('/api/my/draft', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM drafts WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// 专辑（用户自建收藏夹）
// ─────────────────────────────────────────────

/** 某用户的专辑列表（本人可见私密，他人只看公开） */
app.get('/api/users/:id/albums', (req, res) => {
  const userId = parseInt(req.params.id);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const me = optionalUser(req);
  const isSelf = me && me.id === userId;
  const { pageNum, limitNum, offset } = parsePage(req, 50);
  const where = isSelf ? 'a.user_id = ?' : 'a.user_id = ? AND a.is_public = 1';

  const albums = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM album_posts ap WHERE ap.album_id = a.id) AS post_count,
      (SELECT ap.post_id FROM album_posts ap WHERE ap.album_id = a.id ORDER BY ap.created_at DESC LIMIT 1) AS cover_post_id
    FROM albums a WHERE ${where}
    ORDER BY a.created_at DESC LIMIT ? OFFSET ?
  `).all(userId, limitNum, offset);

  for (const album of albums) {
    let cover = '';
    if (album.cover_post_id) {
      const p = db.prepare('SELECT images, thumbs FROM posts WHERE id = ?').get(album.cover_post_id);
      if (p) {
        try { cover = JSON.parse(p.thumbs || '[]')[0] || JSON.parse(p.images || '[]')[0] || ''; } catch { cover = ''; }
      }
    }
    album.cover = cover;
    album.is_public = !!album.is_public;
    delete album.cover_post_id;
  }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM albums a WHERE ${where}`).get(userId).c;
  res.json({ albums, total, page: pageNum, limit: limitNum });
});

/** 专辑详情（分页返回内部帖子） */
app.get('/api/albums/:id', (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: '专辑不存在' });

  const me = optionalUser(req);
  const isSelf = me && me.id === album.user_id;
  if (!album.is_public && !isSelf) return res.status(403).json({ error: '该专辑为私密' });

  const owner = db.prepare('SELECT id, username, nickname, avatar FROM users WHERE id = ?').get(album.user_id);
  const { pageNum, limitNum, offset } = parsePage(req, 24);

  const posts = attachInteractions(db.prepare(`
    SELECT p.*, u.nickname AS author_nickname, u.avatar AS author_avatar
    FROM album_posts ap JOIN posts p ON ap.post_id = p.id JOIN users u ON p.author_id = u.id
    WHERE ap.album_id = ? ORDER BY ap.created_at DESC LIMIT ? OFFSET ?
  `).all(album.id, limitNum, offset).map(hydratePost), req);

  const total = db.prepare('SELECT COUNT(*) AS c FROM album_posts WHERE album_id = ?').get(album.id).c;
  res.json({
    album: { ...album, is_public: !!album.is_public },
    owner,
    posts, total, page: pageNum, limit: limitNum,
    owned_by_me: !!isSelf,
  });
});

/** 创建专辑 */
app.post('/api/albums', authMiddleware, (req, res) => {
  const { title, description, is_public } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: '专辑名称必填' });
  const info = db.prepare('INSERT INTO albums (user_id, title, description, is_public) VALUES (?, ?, ?, ?)')
    .run(
      req.user.id,
      maskSensitive(String(title).trim()).slice(0, 40),
      maskSensitive(String(description || '')).slice(0, 200),
      is_public === false ? 0 : 1,
    );
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(info.lastInsertRowid);
  res.json({ album: { ...album, is_public: !!album.is_public, post_count: 0 } });
});

/** 编辑专辑（改名 / 描述 / 公开性） */
app.patch('/api/albums/:id', authMiddleware, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: '专辑不存在' });
  if (album.user_id !== req.user.id) return res.status(403).json({ error: '无权限' });

  const { title, description, is_public } = req.body || {};
  if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: '专辑名称不能为空' });

  db.prepare('UPDATE albums SET title = ?, description = ?, is_public = ? WHERE id = ?').run(
    title !== undefined ? maskSensitive(String(title).trim()).slice(0, 40) : album.title,
    description !== undefined ? maskSensitive(String(description)).slice(0, 200) : album.description,
    is_public !== undefined ? (is_public ? 1 : 0) : album.is_public,
    album.id,
  );
  const updated = db.prepare('SELECT * FROM albums WHERE id = ?').get(album.id);
  res.json({ album: { ...updated, is_public: !!updated.is_public } });
});

/** 删除专辑 */
app.delete('/api/albums/:id', authMiddleware, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: '专辑不存在' });
  if (album.user_id !== req.user.id) return res.status(403).json({ error: '无权限' });
  db.prepare('DELETE FROM albums WHERE id = ?').run(album.id);
  res.json({ ok: true });
});

/** 收进专辑 */
app.post('/api/albums/:id/posts', authMiddleware, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: '专辑不存在' });
  if (album.user_id !== req.user.id) return res.status(403).json({ error: '无权限' });

  const postId = parseInt(req.body?.post_id);
  if (!postId) return res.status(400).json({ error: '缺少 post_id' });
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(postId)) {
    return res.status(404).json({ error: '帖子不存在' });
  }

  db.prepare('INSERT OR IGNORE INTO album_posts (album_id, post_id) VALUES (?, ?)').run(album.id, postId);
  const count = db.prepare('SELECT COUNT(*) AS c FROM album_posts WHERE album_id = ?').get(album.id).c;
  res.json({ ok: true, count });
});

/** 移出专辑 */
app.delete('/api/albums/:id/posts/:postId', authMiddleware, (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: '专辑不存在' });
  if (album.user_id !== req.user.id) return res.status(403).json({ error: '无权限' });
  db.prepare('DELETE FROM album_posts WHERE album_id = ? AND post_id = ?').run(album.id, parseInt(req.params.postId));
  const count = db.prepare('SELECT COUNT(*) AS c FROM album_posts WHERE album_id = ?').get(album.id).c;
  res.json({ ok: true, count });
});

/** 我的专辑（收藏时选择用，轻量） */
app.get('/api/my/albums', authMiddleware, (req, res) => {
  const albums = db.prepare(`
    SELECT a.id, a.title, a.is_public,
      (SELECT COUNT(*) FROM album_posts ap WHERE ap.album_id = a.id) AS post_count
    FROM albums a WHERE a.user_id = ? ORDER BY a.created_at DESC
  `).all(req.user.id);
  res.json({ albums: albums.map(a => ({ ...a, is_public: !!a.is_public })) });
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

  // 拉黑过滤：关注流里也不展示被自己拉黑者的内容
  const blocked = blockedIdsFor(req);
  const blockClause = blocked.length ? ` AND p.author_id NOT IN (${blocked.map(() => '?').join(',')})` : '';
  const blockArgs = blocked.length ? blocked : [];

  const posts = attachInteractions(db.prepare(`
    SELECT p.*, u.nickname as author_nickname, u.avatar as author_avatar
    FROM posts p JOIN users u ON p.author_id = u.id
    WHERE (p.author_id = ?
       OR p.author_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?))${blockClause}
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).all(req.user.id, req.user.id, ...blockArgs, limitNum, offset).map(hydratePost), req);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM posts p
    WHERE (p.author_id = ?
       OR p.author_id IN (SELECT following_id FROM user_follows WHERE follower_id = ?))${blockClause}
  `).get(req.user.id, req.user.id, ...blockArgs).count;

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
  // 首次启动或索引为空时回填全文索引
  const indexed = rebuildIndex();
  if (indexed > 0) logger.info(`已为 ${indexed} 条帖子建立全文索引`);

  app.listen(PORT, () => {
    logger.info(`Duitang API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
