/**
 * E2E：社区治理（举报 / 审核队列 / 拉黑 / 发现页）。
 * 用法: node scripts/e2e/moderation.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = process.env.E2E_APP || "http://127.0.0.1:5199";
const API = process.env.E2E_API || "http://127.0.0.1:3005";
const OUT = process.env.E2E_OUT || path.join(root, ".e2e-shots");

const h = await createHarness({ app: APP, api: API, outDir: OUT, port: 9244 });

try {
  await h.open("#/");
  await h.login("tangyan");

  // ── 发现页 ──
  await h.open("#/discover");
  const authors = await h.waitFor(`document.querySelectorAll('[data-testid="trending-authors"] button').length`, { label: "热门作者" });
  h.check("发现页展示热门作者", authors > 0, `authors=${authors}`);

  const tags = await h.cdp.eval(`document.querySelectorAll('[data-testid="trending-tags"] button').length`);
  h.check("发现页展示热门话题", tags > 0, `tags=${tags}`);
  await h.shotPng("e2e-mod-discover.png");

  // ── 从「更多」菜单举报 ──
  const target = JSON.parse(await h.cdp.eval(`(async () => {
    const other = await (await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
    const oh = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + other.token };
    const p = await (await fetch('/api/posts', { method:'POST', headers: oh,
      body: JSON.stringify({ title: 'E2E 举报目标', images: ['/uploads/m.jpg'], board: 'food', tags: ['e2e'] }) })).json();
    return JSON.stringify({ pid: p.post.id });
  })()`));

  await h.open("#/pin/" + target.pid);
  await h.waitFor(`!!document.querySelector('button[aria-label="更多操作"]')`, { label: "更多菜单" });
  await h.cdp.eval(`document.querySelector('button[aria-label="更多操作"]')?.click()`);
  await h.sleep(400);
  await h.cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('举报该内容'))?.click()`);
  const reportModal = await h.waitFor(`!!document.querySelector('[data-testid="report-modal"]')`, { label: "举报弹窗" });
  h.check("从详情页可打开举报弹窗", !!reportModal);
  await h.shotPng("e2e-mod-report.png");

  if (reportModal) {
    await h.cdp.eval(`[...document.querySelectorAll('[data-testid="report-modal"] button')].find(b => b.textContent.includes('垃圾广告'))?.click()`);
    await h.cdp.eval(`[...document.querySelectorAll('[data-testid="report-modal"] button')].find(b => b.textContent.includes('提交举报'))?.click()`);
    await h.sleep(1200);
    const closed = await h.cdp.eval(`!document.querySelector('[data-testid="report-modal"]')`);
    h.check("提交举报后弹窗关闭", closed);
  }

  // ── 审核队列 ──
  await h.open("#/admin/reports");
  const queue = await h.waitFor(`document.querySelectorAll('[data-testid="report-list"] > div').length`, { label: "审核队列" });
  h.check("管理员可见审核队列", queue > 0, `items=${queue}`);
  await h.shotPng("e2e-mod-admin.png");

  const hasActions = await h.cdp.eval(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === '删除内容')`);
  h.check("队列每项有处理按钮", hasActions);

  // 驳回（不删演示数据）
  await h.cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '驳回')?.click()`);
  await h.sleep(1500);
  const rejected = await h.cdp.eval(`!document.body.innerText.includes('E2E 举报目标') || document.body.innerText.includes('该状态下暂无举报')`);
  h.check("驳回后移出待处理队列", rejected);

  // ── 拉黑（从详情页菜单） ──
  await h.open("#/pin/" + target.pid);
  await h.waitFor(`!!document.querySelector('button[aria-label="更多操作"]')`, { label: "更多菜单" });
  await h.cdp.eval(`document.querySelector('button[aria-label="更多操作"]')?.click()`);
  await h.sleep(400);
  await h.cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('拉黑作者'))?.click()`);
  await h.sleep(1200);

  const blocks = await h.apiCall("/api/my/blocks");
  h.check("拉黑作者成功", (blocks?.ids || []).length > 0, JSON.stringify(blocks?.ids));

  // 拉黑后列表里看不到该帖
  const visible = await h.cdp.eval(`(async () => {
    const d = await (await fetch('/api/posts?limit=100', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
    return d.posts.some(p => p.id === ${target.pid});
  })()`);
  h.check("拉黑后看不到对方帖子", visible === false);

  // 解除拉黑并清理
  await h.cdp.eval(`(async () => {
    const ids = (await (await fetch('/api/my/blocks', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json()).ids;
    for (const id of ids) await fetch('/api/users/' + id + '/block', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } });
  })()`);
  await h.apiCall("/api/posts/" + target.pid, { method: "DELETE" });

  // ── 非管理员不能进审核页 ──
  await h.cdp.eval(`(async () => {
    const d = await (await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
    localStorage.setItem('duitang_token', d.token);
  })()`);
  await h.open("#/admin/reports");
  await h.sleep(1500);
  const denied = await h.cdp.eval(`document.body.innerText.includes('需要管理员权限') || document.body.innerText.includes('加载审核队列失败') || document.body.innerText.includes('暂无举报')`);
  h.check("非管理员进入审核页被拒绝", denied);
  await h.shotPng("e2e-mod-denied.png");

  // 恢复管理员登录
  await h.login("tangyan");
} finally {
  const ok = h.finish();
  process.exit(ok ? 0 : 1);
}
