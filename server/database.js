const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// 开启 WAL 模式
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// 用户表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 帖子表
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    board TEXT DEFAULT '',
    images TEXT NOT NULL,
    tags TEXT DEFAULT '',
    likes_count INTEGER DEFAULT 0,
    collects_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 帖子点赞表
db.exec(`
  CREATE TABLE IF NOT EXISTS post_likes (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );
`);

// 帖子收藏表
db.exec(`
  CREATE TABLE IF NOT EXISTS post_collects (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );
`);

// 评论表
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 评论点赞表
db.exec(`
  CREATE TABLE IF NOT EXISTS comment_likes (
    user_id INTEGER NOT NULL,
    comment_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, comment_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
  );
`);

// 用户关注表
db.exec(`
  CREATE TABLE IF NOT EXISTS user_follows (
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 消息通知表（user_id 为接收者，actor_id 为触发者）
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    post_id INTEGER NOT NULL DEFAULT 0,
    comment_id INTEGER NOT NULL DEFAULT 0,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 专辑（用户自建收藏夹）
db.exec(`
  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_public INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 专辑与帖子的关联（同一张图可进多个专辑）
db.exec(`
  CREATE TABLE IF NOT EXISTS album_posts (
    album_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (album_id, post_id),
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );
`);

// 搜索词记录（用于「热搜」真实数据；只记关键词，不记用户身份关联）
db.exec(`
  CREATE TABLE IF NOT EXISTS search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 内容举报（target_type: post / comment / user）
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    handled_by INTEGER,
    handled_at DATETIME,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 用户拉黑
db.exec(`
  CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 服务端草稿箱（换设备/清缓存后仍可继续编辑）
db.exec(`
  CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    payload TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 全文检索索引（FTS5 + 中文二元组，见 server/search-index.js）
// rowid 直接复用 posts.id，便于与主表关联
try {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS post_fts USING fts5(terms, tokenize='unicode61')`);
} catch (e) {
  // 某些 SQLite 构建未启用 FTS5：降级为普通表，搜索会自动回落到 LIKE
  console.warn('FTS5 不可用，全文检索将回落为 LIKE 查询:', e.message);
  db.exec(`CREATE TABLE IF NOT EXISTS post_fts (rowid INTEGER PRIMARY KEY, terms TEXT)`);
}

// 创建索引
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_board ON posts(board, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);
  CREATE INDEX IF NOT EXISTS idx_post_collects_user ON post_collects(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_albums_user ON albums(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_album_posts_album ON album_posts(album_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_search_queries_created ON search_queries(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_drafts_user ON drafts(user_id);
`);

// 轻量迁移：为旧库补齐后加的列
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`已为 ${table} 添加 ${column} 列`);
  }
}
ensureColumn('posts', 'sizes', "TEXT DEFAULT '[]'");
ensureColumn('posts', 'thumbs', "TEXT DEFAULT '[]'");
// 与 images 一一对应的尺寸变体：[{url,width}] 按宽度升序（400/800/原图）
ensureColumn('posts', 'images_variants', "TEXT DEFAULT '[]'");
// 楼中楼：回复指向父评论 id（0 表示顶层评论）
ensureColumn('comments', 'parent_id', "INTEGER NOT NULL DEFAULT 0");
// 通知偏好：JSON，按类型开关
ensureColumn('users', 'notify_prefs', "TEXT DEFAULT '{}'");
// 管理员标记（审核队列用）
ensureColumn('users', 'is_admin', "INTEGER NOT NULL DEFAULT 0");

// 历史数据迁移：早期前端把中文画板标签直接存进了 board，统一成英文 key
const BOARD_LABEL_TO_KEY = {
  '壁纸头像': 'wallpaper', '动漫插画': 'anime', '时尚穿搭': 'fashion', '美食菜谱': 'food',
  '手工DIY': 'diy', '家居生活': 'home', '美妆造型': 'makeup', '旅行摄影': 'travel',
  '古风汉服': 'ancient', '萌宠植物': 'pet', '文字句子': 'quote', '婚纱婚礼': 'wedding',
};
{
  const labeled = db.prepare("SELECT id, board FROM posts WHERE board IS NOT NULL AND board != ''").all();
  let migrated = 0;
  for (const p of labeled) {
    const key = BOARD_LABEL_TO_KEY[p.board];
    if (key && key !== p.board) {
      db.prepare('UPDATE posts SET board = ? WHERE id = ?').run(key, p.id);
      migrated++;
    }
  }
  if (migrated) console.log(`已迁移 ${migrated} 条帖子的画板字段为英文 key`);
}

// 插入初始用户（含演示账号，便于本地体验；密码统一 123456）
const seedUsers = [
  { username: 'tangyan', nickname: '糖小颜', bio: '生活需要一点甜 | 分享美好日常' },
  { username: 'tangtu', nickname: '糖小兔', bio: '壁纸收集癖，日更不偷懒' },
  { username: 'mochi', nickname: '麻薯小姐', bio: '甜品与穿搭都是本命' },
  { username: 'lvren', nickname: '旅人阿白', bio: '在路上 · 相机是我的第二双眼睛' },
  { username: 'gufeng', nickname: '故梦古风', bio: '汉服 / 水墨 / 旧时光' },
];

seedUsers.forEach((u, i) => {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
  if (existing) return;
  const hash = bcrypt.hashSync('123456', 10);
  const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${i + 1001}&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4`;
  db.prepare('INSERT INTO users (username, nickname, password_hash, avatar, bio) VALUES (?, ?, ?, ?, ?)').run(
    u.username, u.nickname, hash, avatar, u.bio
  );
});

// 管理员：默认 tangyan，可用 ADMIN_USERNAMES="a,b" 覆盖
{
  const envAdmins = process.env.ADMIN_USERNAMES;
  const admins = envAdmins
    ? envAdmins.split(',').map(s => s.trim()).filter(Boolean)
    : ['tangyan'];
  const mark = db.prepare('UPDATE users SET is_admin = 1 WHERE username = ?');
  for (const name of admins) {
    try { mark.run(name); } catch { /* 忽略 */ }
  }
}

// 仅默认开发库灌入演示内容；测试库（显式设置 DB_PATH）保持干净
if (!process.env.DB_PATH) {
  const postCount = db.prepare('SELECT COUNT(*) AS c FROM posts').get().c;
  if (postCount === 0) {
    try {
      require('./seed-demo').seed(db);
    } catch (e) {
      console.warn('演示数据填充跳过:', e.message);
    }
  }
}

console.log('SQLite 数据库已初始化 (node:sqlite)');
module.exports = db;
