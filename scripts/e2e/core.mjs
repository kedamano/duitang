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
  // ── 首页：每日精选为整版卡片流（作者头 + 图网格 + 操作条） ──
  await h.open("#/");
  const feedCards = await h.waitFor(`document.querySelectorAll('[data-testid="post-card"]').length`, { label: "首页帖子卡" });
  h.check("首页渲染整版帖子流", feedCards > 0, `cards=${feedCards}`);

  const feedShape = await h.cdp.eval(`(() => {
    const card = document.querySelector('[data-testid="post-card"]');
    if (!card) return { ok: false };
    const imgs = card.querySelectorAll('img').length;
    const actions = card.querySelectorAll('footer button').length;
    const author = !!card.querySelector('header img.rounded-full');
    return { ok: actions === 3 && author && imgs >= 2, imgs, actions };
  })()`);
  h.check(
    "帖子卡含作者头、图片与三栏操作条",
    feedShape.ok === true,
    JSON.stringify(feedShape),
  );

  // ── 首页导航：左侧竖排入口 + 分类下拉（桌面端） ──
  const navState = await h.cdp.eval(`(() => {
    const sidenav = document.querySelector('[data-testid="home-sidenav"]');
    const trigger = sidenav?.querySelector('[data-testid="category-trigger"]');
    const panel = document.querySelector('[data-testid="category-panel"]');
    return {
      sidenav: !!sidenav,
      entries: sidenav ? sidenav.querySelectorAll('[data-nav]').length : 0,
      trigger: trigger?.textContent?.trim().slice(0, 6) || "",
      panelClosed: !panel,
    };
  })()`);
  h.check(
    "首页左侧竖排导航（每日精选/关注 + 分类入口）",
    navState.sidenav && navState.entries === 2 && navState.panelClosed,
    JSON.stringify(navState),
  );

  // 打开分类面板 → 选「壁纸头像」→ 面板关闭且入口显示当前分类
  await h.cdp.eval(`document.querySelector('[data-testid="home-sidenav"] [data-testid="category-trigger"]').click()`);
  await h.sleep(400);
  const panelItems = await h.cdp.eval(`document.querySelectorAll('[data-testid="category-panel"] [data-nav-item]').length`);
  h.check("分类下拉面板含 12 个画板", panelItems === 12, `items=${panelItems}`);
  await h.cdp.eval(`document.querySelector('[data-nav-item="壁纸头像"]').click()`);
  await h.sleep(1200);
  const afterPick = await h.cdp.eval(`(() => {
    const trigger = document.querySelector('[data-testid="home-sidenav"] [data-testid="category-trigger"]');
    return {
      text: trigger?.textContent?.trim() || "",
      closed: !document.querySelector('[data-testid="category-panel"]'),
      cards: document.querySelectorAll('main .break-inside-avoid').length,
    };
  })()`);
  h.check(
    "选择分类后面板关闭、入口显示当前分类且列表刷新",
    afterPick.closed && afterPick.text.includes("壁纸头像") && afterPick.cards > 0,
    JSON.stringify(afterPick),
  );
  // 回到推荐，避免影响后续断言
  await h.cdp.eval(`document.querySelector('[data-testid="home-sidenav"] [data-nav="推荐"]').click()`);
  await h.sleep(1000);

  // ── 详情页 ──
  const firstPostId = await h.cdp.eval(`(async () => {
    const d = await (await fetch('/api/posts?limit=1')).json();
    return d.posts[0] ? d.posts[0].id : null;
  })()`);
  await h.open("#/pin/" + firstPostId);
  const detailOk = await h.waitFor(`document.body.innerText.includes('评论区')`, { label: "详情页" });
  h.check("详情页可打开", !!detailOk);
  await h.shotPng("e2e-core-detail.png");

  // ── 搜索（FTS5 中文二元组：2 字词也能命中） ──
  await h.open("#/");
  const searchResult = await h.cdp.eval(`(async () => {
    const hits = {};
    for (const kw of ['汉服', '壁纸', '美食']) {
      const d = await (await fetch('/api/posts?q=' + encodeURIComponent(kw) + '&limit=5')).json();
      hits[kw] = (d.posts || []).length;
    }
    return JSON.stringify(hits);
  })()`);
  const hits = JSON.parse(searchResult);
  h.check(
    "2 字中文搜索可命中（FTS5 二元组）",
    hits["汉服"] > 0 && hits["壁纸"] > 0 && hits["美食"] > 0,
    searchResult,
  );

  // 搜索不存在的词应返回空
  const emptyHit = await h.cdp.eval(`(async () => {
    const d = await (await fetch('/api/posts?q=' + encodeURIComponent('完全不存在的词组合') + '&limit=5')).json();
    return (d.posts || []).length;
  })()`);
  h.check("无结果搜索返回空列表", emptyHit === 0, `count=${emptyHit}`);

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
