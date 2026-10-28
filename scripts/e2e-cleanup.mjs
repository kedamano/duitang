#!/usr/bin/env node
/**
 * E2E 测试数据清理：删除测试产生的帖子（标题以 E2E 开头或带 e2e 标签）
 * 及其级联数据（点赞/收藏/评论/回复/通知/专辑关联/举报/FTS 索引），
 * 再清掉 uploads 目录里没有任何帖子引用的孤儿文件。
 *
 * 用法: node scripts/e2e-cleanup.mjs        （DB_PATH 默认 server/database.sqlite）
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DB_PATH || path.join(root, "server", "database.sqlite");
const uploadsDir = process.env.UPLOAD_DIR || path.join(root, "server", "uploads");

if (!fs.existsSync(dbPath)) {
  console.log("数据库不存在，跳过清理:", dbPath);
  process.exit(0);
}

const db = new DatabaseSync(dbPath);

const isE2e = p =>
  /^E2E/.test(p.title || "") ||
  (p.tags || "").includes('"e2e"') ||
  (p.title || "").includes("社交验证") ||
  (p.title || "").includes("审核测试");

const posts = db.prepare("SELECT id, title, tags, images, thumbs, images_variants FROM posts").all();
const doomed = posts.filter(isE2e);

if (doomed.length) {
  const ids = doomed.map(p => p.id);
  const ph = ids.map(() => "?").join(",");
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM post_likes WHERE post_id IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM post_collects WHERE post_id IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE post_id IN (${ph}))`).run(...ids);
    db.prepare(`DELETE FROM comments WHERE post_id IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM notifications WHERE post_id IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM album_posts WHERE post_id IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM reports WHERE target_type IN ('post','comment') AND target_id IN (
      SELECT id FROM posts WHERE id IN (${ph})
      UNION SELECT id FROM comments WHERE post_id IN (${ph})
    )`).run(...ids);
    try { db.prepare(`DELETE FROM post_fts WHERE rowid IN (${ph})`).run(...ids); } catch { /* 无 FTS 时忽略 */ }
    db.prepare(`DELETE FROM posts WHERE id IN (${ph})`).run(...ids);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
console.log(`已删除 ${doomed.length} 条 E2E 测试帖`);

// 孤儿文件：任何帖子任何字段都不再引用的 uploads 文件
const alive = new Set();
for (const p of db.prepare("SELECT images, thumbs, images_variants FROM posts").all()) {
  for (const col of [p.images, p.thumbs, p.images_variants]) {
    for (const m of String(col || "").matchAll(/\/uploads\/([^"'\\\s,}\]]+)/g)) alive.add(decodeURIComponent(m[1]));
  }
}

let removed = 0;
if (fs.existsSync(uploadsDir)) {
  for (const f of fs.readdirSync(uploadsDir)) {
    if (alive.has(f)) continue;
    // 只删图片类文件，保守跳过未知类型
    if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(f)) continue;
    fs.unlinkSync(path.join(uploadsDir, f));
    removed++;
  }
}
console.log(`已清理 ${removed} 个孤儿上传文件`);
db.close();
