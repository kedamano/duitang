#!/usr/bin/env node
/**
 * 一键跑完全部质量关卡：类型检查 → 前端单测 → 后端单测 → 生产构建。
 * 用法: npm run verify
 * 任一关卡失败即整体失败（退出码非 0），适合本地提交前或 CI 使用。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

const steps = [
  { name: "类型检查 (tsc)", cmd: "npx", args: ["tsc", "--noEmit"], cwd: root },
  { name: "前端单测 (vitest)", cmd: "npx", args: ["vitest", "run"], cwd: root },
  { name: "后端单测 (mocha, 隔离进程)", cmd: "node", args: [path.join(root, "scripts", "run-server-tests.mjs")] },
  { name: "生产构建 (vite build)", cmd: "npm", args: ["run", "build"], cwd: root },
];

const results = [];
for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const started = Date.now();
  // Windows 上 npx/npm 是 .cmd，必须通过 shell 调用
  const res = spawnSync(step.cmd, step.args, { cwd: step.cwd, stdio: "inherit", shell: isWin });
  const ms = Date.now() - started;
  const ok = res.status === 0;
  results.push({ name: step.name, ok, ms });
  if (!ok) {
    console.error(`\n✗ ${step.name} 失败（退出码 ${res.status}）`);
    break;
  }
  console.log(`✓ ${step.name} 通过（${(ms / 1000).toFixed(1)}s）`);
}

console.log("\n──────── 验证结果 ────────");
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}  ${(r.ms / 1000).toFixed(1)}s`);
}
const allOk = results.length === steps.length && results.every(r => r.ok);
console.log(allOk ? "\n全部关卡通过" : "\n存在失败关卡");
process.exit(allOk ? 0 : 1);
