#!/usr/bin/env node
/**
 * 数据库备份脚本：SQLite 在线快照 + 保留策略。
 *
 * 用法:
 *   node scripts/backup-db.mjs             # 备份到 server/backups/，保留最近 14 份
 *   node scripts/backup-db.mjs --out D:\bak --keep 30
 *
 * 原理: VACUUM INTO 在不阻塞读写的前提下把整个库写成一致性快照文件
 * （WAL 模式下同样安全），比直接复制 .sqlite 文件可靠。
 * 建议配合系统计划任务定时执行，例如每天一次。
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 解析参数
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const dbPath = process.env.DB_PATH || path.join(root, "server", "database.sqlite");
const outDir = path.resolve(arg("out", path.join(root, "server", "backups")));
const keep = Math.max(1, Number(arg("keep", 14)) || 14);

if (!fs.existsSync(dbPath)) {
  console.error(`数据库不存在: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// 时间戳文件名（本地时间，便于人眼排序）
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outFile = path.join(outDir, `database-${ts}.sqlite`);
const tmpFile = outFile + ".tmp";

const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  // VACUUM INTO 要求目标不存在，先写 .tmp 再改名，避免留下半截文件
  db.exec(`VACUUM INTO '${tmpFile.replace(/'/g, "''")}'`);
} finally {
  db.close();
}
fs.renameSync(tmpFile, outFile);

const sizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
console.log(`已备份: ${outFile} (${sizeMB} MB)`);

// 保留策略：按修改时间从新到旧，删除超出 keep 份的旧备份
const backups = fs
  .readdirSync(outDir)
  .filter(f => /^database-.*\.sqlite$/.test(f))
  .map(f => ({ f, t: fs.statSync(path.join(outDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

for (const old of backups.slice(keep)) {
  fs.unlinkSync(path.join(outDir, old.f));
  console.log(`清理旧备份: ${old.f}`);
}
console.log(`当前保留 ${Math.min(keep, backups.length)} 份备份于 ${outDir}`);
