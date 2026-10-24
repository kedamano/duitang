/**
 * E2E：核心浏览 + 通知。
 * 用法: node scripts/e2e/core.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = process.env.E2E_APP || "http://127.0.0.1:5199";
const API = process.env.E2E_API || "http://127.0.0.1:3005";
const OUT = process.env.E2E_OUT || path.join(root, ".e2e-shots");

const h = await createHarness({ app: APP, api: API, outDir: OUT, port: 9241 });

try {
  // ── 首页与瀑布流 ──
  await h.open("#/");
  const cards = await h.waitFor(`document.querySelectorAll('main .break-inside-avoid').length`, { label: "首页卡片" });
  h.check("首页渲染卡片", cards > 0, `cards=${cards}`);

  const heights = await h.cdp.eval(`JSON.stringify([...document.querySelectorAll('main .break-inside-avoid')].map(e => Math.round(e.getBoundingClientRect().height)).slice(0, 6))`);
  const hs = JSON.parse(heights);
  h.check("瀑布流高度错落", new Set(hs).size > 1, heights);

  // ── 分类导航只在首页 ──
  const navOnHome = await h.cdp.eval(`document.querySelectorAll('nav button').length`);
  h.check("首页显示分类导航", navOnHome > 0, `nav=${navOnHome}`);

  // ── 详情页 ──
  const firstPostId = await h.cdp.eval(`(async () => {
    const d = await (await fetch('/api/posts?limit=1')).json();
    return d.posts[0] ? d.posts[0].id : null;
  })()`);
  await h.open("#/pin/" + firstPostId);
  const detailOk = await h.waitFor(`document.body.innerText.includes('评论区')`, { label: "详情页" });
  h.check("详情页可打开", !!detailOk);
  await h.shotPng("e2e-core-detail.png");

  // ── 通知：SSE 实时推送 ──
  await h.open("#/");
  const me = await h.login("tangyan");
  h.check("登录成功", !!me.nickname, me.nickname);

  await h.apiCall("/api/notifications", { method: "DELETE" });
  await h.open("#/");
  await h.sleep(2000);
  const badgeBefore = await h.cdp.eval(`!!document.querySelector('[data-testid="unread-badge"]')`);

  // 另一账号点赞 → 应通过 SSE 实时出现角标
  await h.cdp.eval(`(async () => {
    const other = await (await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
    const oh = { Authorization: 'Bearer ' + other.token };
    const meRes = await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
    const mine = await (await fetch('/api/posts?user_id=' + meRes.user.id + '&limit=1', { headers: oh })).json();
    const pid = mine.posts[0].id;
    if (mine.posts[0].is_liked) await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh });
    await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh });
  })()`);

  const badge = await h.waitFor(`document.querySelector('[data-testid="unread-badge"]')?.textContent || ''`, { label: "未读角标" });
  h.check("SSE 实时推送未读角标", !badgeBefore && !!badge, `badge=${badge}`);
  await h.shotPng("e2e-core-notification.png");

  // ── 通知面板 ──
  await h.cdp.eval(`document.querySelector('button[aria-label*="通知"]')?.click()`);
  const panelText = await h.waitFor(`document.body.innerText.includes('赞了你的帖子')`, { label: "通知面板" });
  h.check("通知面板显示消息", !!panelText);
  await h.shotPng("e2e-core-notifications.png");

  // ── 登录失效引导 ──
  await h.cdp.eval(`localStorage.setItem('duitang_token', 'invalid.token')`);
  await h.open("#/");
  await h.sleep(1500);
  const prompted = await h.waitFor(`document.body.innerText.includes('登录已过期') || document.body.innerText.includes('登录')`, { label: "登录引导" });
  h.check("失效 token 引导重新登录", !!prompted);
} finally {
  const ok = h.finish();
  process.exit(ok ? 0 : 1);
}
