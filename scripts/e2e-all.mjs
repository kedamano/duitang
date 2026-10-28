#!/usr/bin/env node
/**
 * 运行所有 E2E 脚本（每个脚本启动独立浏览器实例，串行执行）。
 * 用法: node scripts/e2e-all.mjs [core|publish|social|moderation ...]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const e2eDir = path.join(root, "scripts", "e2e");
const isWin = process.platform === "win32";

const scripts = (process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["core", "publish", "social", "moderation"]
).map(name => name.replace(/\.mjs$/, ""));

const APP = process.env.E2E_APP || "http://127.0.0.1:5199";
const API = process.env.E2E_API || "http://127.0.0.1:3005";

// 预检：服务必须可达，否则所有脚本都会白跑
async function preflight() {
  const check = async (label, url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      return res.ok || res.status < 500;
    } catch {
      console.error(`✗ ${label} 不可达: ${url}`);
      return false;
    }
  };
  const okApi = await check("后端", `${API}/api/health`);
  const okApp = await check("前端", APP);
  if (!okApi || !okApp) {
    console.error("\n请先启动前后端：");
    console.error('  后端: $env:PORT="3005"; $env:RATE_LIMIT_DISABLED="1"; node index.js   (在 server/)');
    console.error('  前端: $env:BACKEND_URL="http://127.0.0.1:3005"; npx vite --port 5199');
    return false;
  }
  return true;
}

if (!(await preflight())) process.exit(1);

// 测试数据清理：E2E 帖会污染「瀑布流错落」这类基于真实数据的断言，跑前后各清一次
function cleanup(label) {
  console.log(`\n[${label}] 清理 E2E 测试数据...`);
  spawnSync(process.execPath, [path.join(root, "scripts", "e2e-cleanup.mjs")], { stdio: "inherit", shell: false });
}
cleanup("开跑前");

const results = [];
for (const name of scripts) {
  const file = path.join(e2eDir, `${name}.mjs`);
  if (!fs.existsSync(file)) {
    console.error(`✗ 脚本不存在: ${file}`);
    results.push({ name, ok: false, ms: 0 });
    continue;
  }
  console.log(`\n════ ${name} ════`);
  const started = Date.now();
  const res = spawnSync(process.execPath, [file], { stdio: "inherit", shell: false });
  const ms = Date.now() - started;
  results.push({ name, ok: res.status === 0, ms });
}

console.log("\n──────── E2E 汇总 ────────");
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(12)} ${(r.ms / 1000).toFixed(1)}s`);
}
const allOk = results.every(r => r.ok);
console.log(allOk ? "\n全部通过" : "\n存在失败脚本");
process.exit(allOk ? 0 : 1);
