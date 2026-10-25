/**
 * E2E：社交互动（评论楼中楼 / @提及 / 关注 / 通知偏好 / 标签与画板页）。
 * 用法: node scripts/e2e/social.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = process.env.E2E_APP || "http://127.0.0.1:5199";
const API = process.env.E2E_API || "http://127.0.0.1:3005";
const OUT = process.env.E2E_OUT || path.join(root, ".e2e-shots");

const h = await createHarness({ app: APP, api: API, outDir: OUT, port: 9243 });

try {
  await h.open("#/");
  await h.login("tangyan");

  // 造一条带评论的帖子：顶层评论 + 两条回复（由另一账号发出）
  const setup = JSON.parse(await h.cdp.eval(`(async () => {
    const me = await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
    const other = await (await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
    const oh = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + other.token };
    const post = await (await fetch('/api/posts', { method:'POST', headers: oh,
      body: JSON.stringify({ title: 'E2E 社交帖', images: ['/uploads/s.jpg'], board: 'food', tags: ['e2e'] }) })).json();
    const pid = post.post.id;
    const c1 = await (await fetch('/api/posts/' + pid + '/comments', { method:'POST', headers: oh,
      body: JSON.stringify({ content: '顶层评论 @糖小颜 你好' }) })).json();
    await fetch('/api/posts/' + pid + '/comments', { method:'POST', headers: oh,
      body: JSON.stringify({ content: '第一条回复', parent_id: c1.comment.id }) });
    await fetch('/api/posts/' + pid + '/comments', { method:'POST', headers: oh,
      body: JSON.stringify({ content: '第二条回复', parent_id: c1.comment.id }) });
    return JSON.stringify({ pid, cid: c1.comment.id, myId: me.user.id });
  })()`));
  h.check("社交验证帖与评论已创建", !!setup.pid, JSON.stringify(setup));

  // ── 楼中楼：回复默认折叠，可展开 ──
  await h.open("#/pin/" + setup.pid);
  await h.waitFor(`document.body.innerText.includes('顶层评论')`, { label: "评论加载" });
  const collapsed = await h.cdp.eval(`document.body.innerText.includes('展开 2 条回复')`);
  h.check("回复默认折叠", collapsed);
  const replyHidden = await h.cdp.eval(`!document.body.innerText.includes('第一条回复')`);
  h.check("折叠时回复内容不可见", replyHidden);

  await h.cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('展开 2 条回复'))?.click()`);
  await h.sleep(600);
  const expanded = await h.cdp.eval(`document.body.innerText.includes('第一条回复') && document.body.innerText.includes('第二条回复')`);
  h.check("展开后显示全部回复", expanded);
  await h.shotPng("e2e-social-threaded.png");

  // ── @提及高亮 ──
  const mention = await h.cdp.eval(`!!document.querySelector('[data-testid="mention"]')`);
  h.check("@提及高亮渲染", mention);
  await h.shotPng("e2e-social-mention.png");

  // ── 评论行内富文本（加粗/斜体/代码） ──
  const markup = await h.cdp.eval(`(async () => {
    const other = await (await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
    const oh = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + other.token };
    await fetch('/api/posts/${setup.pid}/comments', { method:'POST', headers: oh,
      body: JSON.stringify({ content: '带 **重点** 与 *强调* 以及 \`code\` 的评论' }) });
    return 'ok';
  })()`);
  await h.open("#/pin/" + setup.pid);
  const markupReady = await h.waitFor(
    `!!document.querySelector('[data-testid="comment-bold"]')`,
    { label: "评论富文本" },
  );
  const markupDom = await h.cdp.eval(`JSON.stringify({
    bold: document.querySelector('[data-testid="comment-bold"]')?.textContent || '',
    italic: !!document.querySelector('[data-testid="comment-italic"]'),
    code: document.querySelector('[data-testid="comment-code"]')?.textContent || '',
  })`);
  const md = JSON.parse(markupDom);
  h.check("评论加粗正确渲染", !!markupReady && md.bold === "重点", markupDom);
  h.check("评论斜体与代码正确渲染", md.italic && md.code === "code", markupDom);
  await h.shotPng("e2e-social-comment-markup.png");

  // ── @提及产生通知 ──
  const mentioned = await h.apiCall("/api/notifications?limit=20");
  const hasMention = (mentioned?.notifications || []).some(n => n.type === "mention");
  h.check("@提及产生通知", hasMention, `types=${(mentioned?.notifications || []).map(n => n.type).join(",")}`);

  // ── 关注与关注流（follow 是切换语义，先读初始状态保证幂等） ──
  const before = await h.apiCall("/api/users/2/profile");
  const wasFollowing = !!before?.is_following;
  const follow = await h.apiCall("/api/users/2/follow", { method: "POST" });
  h.check("可切换关注状态", follow?.following === !wasFollowing, JSON.stringify({ wasFollowing, now: follow?.following }));
  // 确保进入关注流时处于已关注状态
  if (!follow?.following) await h.apiCall("/api/users/2/follow", { method: "POST" });

  await h.open("#/");
  await h.cdp.eval(`document.querySelector('[data-nav="关注"]')?.click()`);
  const feedCards = await h.waitFor(`document.querySelectorAll('main .break-inside-avoid').length`, { label: "关注流" });
  h.check("关注流有内容", feedCards > 0, `cards=${feedCards}`);
  await h.shotPng("e2e-social-feed.png");

  // ── 通知偏好（三态） ──
  const prefs = await h.apiCall("/api/users/me/notify-prefs");
  h.check("通知偏好可读取", !!prefs?.types?.length, `types=${prefs?.types?.length}`);

  await h.open("#/");
  await h.cdp.eval(`document.querySelector('[data-testid="profile-menu-trigger"]')?.click()`);
  await h.sleep(500);
  const menuOpen = await h.cdp.eval(`!!document.querySelector('[data-testid="open-notify-prefs"]')`);
  h.check("个人菜单可打开", menuOpen);

  if (menuOpen) {
    await h.cdp.eval(`document.querySelector('[data-testid="open-notify-prefs"]')?.click()`);
    const modal = await h.waitFor(`!!document.querySelector('[data-testid="notify-prefs-modal"]')`, { label: "偏好弹窗" });
    h.check("通知偏好弹窗可打开", !!modal);
    await h.shotPng("e2e-social-prefs.png");
    await h.cdp.eval(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '关闭')?.click()`);
    await h.sleep(300);
  } else {
    h.check("通知偏好弹窗可打开", false, "个人菜单未打开");
  }

  // ── 标签页与画板页 ──
  const topTag = await h.cdp.eval(`(async () => {
    const d = await (await fetch('/api/tags?limit=1')).json();
    return d.tags?.[0]?.tag || '';
  })()`);
  h.check("可获取热门标签", !!topTag, topTag);

  await h.open("#/tag/" + encodeURIComponent(topTag));
  const tagCards = await h.waitFor(`document.querySelectorAll('main .break-inside-avoid').length`, { label: "标签页" });
  h.check("标签聚合页有内容", tagCards > 0, `tag=${topTag} cards=${tagCards}`);
  await h.shotPng("e2e-social-tag.png");

  await h.open("#/board/food");
  const boardCards = await h.waitFor(`document.querySelectorAll('main .break-inside-avoid').length`, { label: "画板页" });
  h.check("画板页有内容", boardCards > 0, `cards=${boardCards}`);

  // ── 灯箱 ──
  await h.open("#/pin/" + setup.pid);
  await h.waitFor(`!!document.querySelector('main img[alt]')`, { label: "详情图" });
  await h.cdp.eval(`document.querySelector('main img[alt]')?.click()`);
  const lightbox = await h.waitFor(`!!document.querySelector('[data-testid="lightbox"]') || document.body.innerText.includes('1 /')`, { label: "灯箱" });
  h.check("点击图片打开灯箱", !!lightbox);
  await h.shotPng("e2e-social-lightbox.png");
  await h.cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);

  // 清理
  await h.apiCall("/api/posts/" + setup.pid, { method: "DELETE" });
  await h.apiCall("/api/users/2/follow", { method: "POST" }); // 取消关注，恢复初始状态
} finally {
  const ok = h.finish();
  process.exit(ok ? 0 : 1);
}
