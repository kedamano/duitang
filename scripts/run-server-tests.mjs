#!/usr/bin/env node
/**
 * 后端测试运行器：每个测试文件在独立进程里跑。
 *
 * 为什么不用 `mocha test/*.test.js`：
 * 1) 多个测试文件各自设置 process.env.DB_PATH，但 require 缓存只会执行一次模块，
 *    导致所有文件共用同一个数据库连接，互相污染数据；
 * 2) node:sqlite 在这种共享连接下会触发原生崩溃（0xC0000409）。
 * 独立进程同时解决隔离与崩溃两个问题。
 *
 * 用法: node scripts/run-server-tests.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "server");
const testDir = path.join(serverDir, "test");
const isWin = process.platform === "win32";

const files = fs.readdirSync(testDir)
  .filter(f => f.endsWith(".test.js"))
  .sort();

if (!files.length) {
  console.error("没有找到测试文件");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

/**
 * 删除旧的测试库，保证每次运行都是干净环境。
 * 各测试文件的 DB_PATH 命名不完全等于文件名，这里按文件里声明的实际路径清理。
 */
function cleanTestDb(file) {
  const src = fs.readFileSync(path.join(testDir, file), "utf8");
  const m = src.match(/DB_PATH\s*=\s*(?:path\.join\(__dirname,\s*|require\('path'\)\.join\(__dirname,\s*)'([^']+)'/);
  const dbName = m ? m[1] : file.replace(/\.test\.js$/, ".sqlite");
  const base = path.join(testDir, dbName);
  for (const suffix of ["", "-shm", "-wal"]) {
    try { fs.unlinkSync(base + suffix); } catch { /* 不存在则忽略 */ }
  }
}

for (const file of files) {
  cleanTestDb(file);
  const started = Date.now();
  const res = spawnSync(
    isWin ? "npx.cmd" : "npx",
    ["mocha", path.join("test", file), "--timeout", "20000"],
    { cwd: serverDir, stdio: "inherit", shell: isWin },
  );
  const ms = Date.now() - started;
  if (res.status === 0) {
    passed++;
    console.log(`✓ ${file}  ${(ms / 1000).toFixed(1)}s\n`);
  } else {
    failed++;
    failures.push(file);
    console.log(`✗ ${file}  ${(ms / 1000).toFixed(1)}s  (退出码 ${res.status})\n`);
  }
}

console.log("──────── 后端测试结果 ────────");
console.log(`通过文件: ${passed}/${files.length}`);
if (failures.length) {
  console.log(`失败文件: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("全部通过");
