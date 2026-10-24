/**
 * 登录态端到端截图脚本（Chrome DevTools Protocol，无需第三方依赖）
 * 用法: node scripts/e2e-shot.mjs [outDir]
 * 前置: 后端(3005) 与前端(5199) 已启动
 *       反复跑本脚本会触发 /api/auth 限流(30 次/15 分钟)，请用
 *       $env:RATE_LIMIT_DISABLED="1" 启动后端
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://127.0.0.1:5199";
const OUT = process.argv[2] || ".e2e-shots";
const PORT = 9223;

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  waitEvent(name, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.ws.removeEventListener("message", h); reject(new Error("timeout " + name)); }, timeout);
      const h = ev => {
        const msg = JSON.parse(ev.data);
        if (msg.method === name) { clearTimeout(t); this.ws.removeEventListener("message", h); resolve(msg.params); }
      };
      this.ws.addEventListener("message", h);
    });
  }
  async eval(js) {
    const r = await this.send("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("page eval failed: " + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

async function main() {
  // 预检：登录被限流时直接给出可执行的提示，避免后续难排查的 undefined 报错
  const pre = await fetch(APP + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "tangyan", password: "123456" }),
  });
  if (pre.status === 429) {
    throw new Error("登录接口被限流(429)。请用 $env:RATE_LIMIT_DISABLED=\"1\" 重启后端后重试。");
  }
  if (!pre.ok) throw new Error("预检登录失败 status=" + pre.status + "，请确认前后端已启动");

  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run",
    `--remote-debugging-port=${PORT}`, "--window-size=1440,1000", "about:blank",
  ], { stdio: "ignore" });

  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        if (targets.length) break;
      } catch {}
    }
    if (!targets?.length) throw new Error("chrome 调试端口未就绪");
    const page = targets.find(t => t.type === "page");

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    let fails = 0;
    const check = (name, cond, extra = "") => {
      if (cond) console.log("  √", name, extra);
      else { fails++; console.log("  ×", name, extra); }
    };

    // 打开首页并登录（写入 localStorage）
    await Promise.all([cdp.waitEvent("Page.loadEventFired"), cdp.send("Page.navigate", { url: APP + "/" })]);
    await sleep(1200);
    const loginInfo = await cdp.eval(`(async () => {
      const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username:'tangyan', password:'123456' }) });
      const d = await r.json();
      localStorage.setItem('duitang_token', d.token);
      return JSON.stringify({ nickname: d.user.nickname, token: d.token });
    })()`);
    const { nickname, token: loginToken } = JSON.parse(loginInfo);
    console.log("登录用户:", nickname);

    // 自己发布的帖子 id
    const ownPostId = await cdp.eval(`(async () => {
      const r = await fetch('/api/my/posts', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } });
      const d = await r.json();
      return d.posts[0].id;
    })()`);
    console.log("自己的帖子 id:", ownPostId);

    // 整页加载某 URL（hash 路由需 reload 才能读到 token），返回页面文本
    const open = async (hash, waitMs = 2600) => {
      await cdp.send("Page.navigate", { url: APP + "/" + hash });
      await sleep(400);
      await cdp.send("Page.reload", { ignoreCache: false });
      await sleep(waitMs);
      return cdp.eval("document.body.innerText");
    };
    const shotPng = async name => {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
      await writeFile(join(OUT, name), Buffer.from(data, "base64"));
      console.log("  [截图]", name);
    };

    // ── 个人主页（登录态）──
    let text = await open("#/profile");
    check("个人主页显示我的发布分组", text.includes("我的发布") && text.includes("我的收集") && text.includes("我的喜欢"));
    check("个人主页统计含粉丝/关注", text.includes("粉丝") && text.includes("关注"));
    await shotPng("me-profile.png");

    // ── 编辑资料弹窗 ──
    await cdp.eval(`(() => { const b = document.querySelector('button[title="编辑资料"]'); b && b.click(); })()`);
    await sleep(700);
    text = await cdp.eval("document.body.innerText");
    check("编辑资料弹窗含昵称与简介字段", text.includes("编辑资料") && text.includes("昵称") && text.includes("简介"));
    await shotPng("edit-profile.png");

    // ── 自己的帖子详情：应出现删除入口（按 author_id 判定）──
    text = await open("#/pin/" + ownPostId);
    check("自己帖子详情显示删除按钮", text.includes("删除"), `pin/${ownPostId}`);
    check("详情页显示描述与标签", text.includes("评论区"));
    await shotPng("own-post.png");

    // ── 分类筛选：动漫插画应有内容（回归 board 中英不一致缺陷）──
    await open("#/");
    await cdp.eval(`(() => { const b=[...document.querySelectorAll('nav button')].find(x=>x.textContent.trim()==='动漫插画'); b&&b.click(); })()`);
    await sleep(2200);
    text = await cdp.eval("document.body.innerText");
    check("分类「动漫插画」筛选出内容", !text.includes("暂时没有找到相关内容") && text.length > 200);
    await shotPng("board-anime.png");

    // ── 首页瀑布流：卡片高度应不一致（真实宽高生效）──
    const heights = await cdp.eval(`(() => {
      const imgs = [...document.querySelectorAll('main img')].slice(0, 12);
      return JSON.stringify(imgs.map(i => Math.round(i.getBoundingClientRect().height)));
    })()`);
    const hs = JSON.parse(heights);
    check("卡片高度存在差异（错落瀑布流）", new Set(hs).size >= 3, hs.join(","));

    // ── 搜索：关键词命中 ──
    await open("#/");
    await cdp.eval(`(() => {
      const i = document.querySelector('input[placeholder="搜索你感兴趣的内容..."]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, '汉服'); i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(2200);
    text = await cdp.eval("document.body.innerText");
    check("搜索「汉服」返回结果", text.includes("找到") && !text.includes("暂时没有找到"));
    await shotPng("search.png");

    // ── 关注流（已登录且有关注）──
    await open("#/");
    const clickNav = label => cdp.eval(`(() => {
      const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === ${JSON.stringify(label)});
      if (!b) return 'missing'; b.click(); return 'clicked';
    })()`);
    check("导航存在「关注」标签", (await clickNav("关注")) === "clicked");
    // 等待关注流真正渲染（开发服务器冷启动时模块转译较慢）
    let feedReady = false;
    for (let i = 0; i < 12 && !feedReady; i++) {
      await sleep(1000);
      text = await cdp.eval("document.body.innerText");
      feedReady = !text.includes("加载中") && (text.includes("粉色少女心壁纸") || text.includes("还没有关注任何人") || text.includes("登录后即可查看"));
    }
    check("关注流渲染出帖子", feedReady && !text.includes("还没有关注任何人") && !text.includes("登录后即可查看") && text.length > 200);
    const feedTitles = await cdp.eval(`JSON.stringify([...document.querySelectorAll('main .group p.font-medium')].slice(0,6).map(e=>e.textContent.trim()))`);
    console.log("  关注流前几条:", feedTitles);
    await shotPng("feed-following.png");

    // ── 关注标签下输入搜索：应自动切回推荐并出结果 ──
    await cdp.eval(`(() => {
      const i = document.querySelector('input[placeholder="搜索你感兴趣的内容..."]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, '蛋糕'); i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(2200);
    text = await cdp.eval("document.body.innerText");
    const activeNavNow = await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('nav button')].find(x => getComputedStyle(x).borderBottomColor.includes('224, 93, 111'));
      return b ? b.textContent.trim() : 'none';
    })()`);
    check("关注标签下搜索自动切回推荐", activeNavNow === "推荐", "当前高亮=" + activeNavNow);
    check("切回后搜索出结果", text.includes("找到") && !text.includes("暂时没有找到"));
    await shotPng("feed-search-redirect.png");
    // 清空搜索，恢复关注标签状态供后续检查
    await cdp.eval(`(() => {
      const i = document.querySelector('input[placeholder="搜索你感兴趣的内容..."]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(800);

    // ── 关注流（未登录引导态）──
    await cdp.eval("localStorage.removeItem('duitang_token')");
    await open("#/");
    await clickNav("关注");
    let logoutReady = false;
    for (let i = 0; i < 12 && !logoutReady; i++) {
      await sleep(1000);
      text = await cdp.eval("document.body.innerText");
      logoutReady = text.includes("登录后即可查看关注内容");
    }
    check("未登录点关注显示登录引导", logoutReady);
    await shotPng("feed-loggedout.png");

    // ── 关注流（已登录但无关注 → 空状态）──
    await cdp.eval(`(async () => {
      const r = await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: 'nofol_' + Date.now(), password: '123456', nickname: '路人' }) });
      const d = await r.json();
      localStorage.setItem('duitang_token', d.token);
    })()`);
    await open("#/");
    await clickNav("关注");
    let emptyReady = false;
    for (let i = 0; i < 12 && !emptyReady; i++) {
      await sleep(1000);
      text = await cdp.eval("document.body.innerText");
      emptyReady = text.includes("还没有关注任何人");
    }
    check("无关注时显示空状态与去首页入口", emptyReady && text.includes("去首页逛逛"));
    await shotPng("feed-empty.png");

    // ── 图片懒加载 ──
    await cdp.eval(`localStorage.setItem('duitang_token', ${JSON.stringify(loginToken)})`);
    await open("#/");
    let cardsReady = false;
    for (let i = 0; i < 15 && !cardsReady; i++) {
      await sleep(1000);
      cardsReady = (await cdp.eval("document.querySelectorAll('main .break-inside-avoid img').length")) > 0;
    }
    const imgStat = await cdp.eval(`(() => {
      const imgs = [...document.querySelectorAll('main .break-inside-avoid img')];
      return JSON.stringify({ total: imgs.length, lazy: imgs.filter(i => i.loading === 'lazy').length });
    })()`);
    const stat = JSON.parse(imgStat);
    check("卡片图片均启用懒加载", stat.total > 0 && stat.lazy === stat.total, `${stat.lazy}/${stat.total}`);
    await shotPng("lazy-home.png");

    // ── token 失效：操作时应弹登录框 ──
    await cdp.eval("localStorage.setItem('duitang_token', 'invalid.token.value')");
    await open("#/");
    await sleep(1500);
    await cdp.eval(`(() => {
      const b = document.querySelector('main .break-inside-avoid button');
      if (b) b.click();
    })()`);
    let loginPrompted = false;
    for (let i = 0; i < 10 && !loginPrompted; i++) {
      await sleep(800);
      text = await cdp.eval("document.body.innerText");
      loginPrompted = text.includes("登录已过期") || text.includes("登录") ;
    }
    check("失效 token 下操作会引导重新登录", loginPrompted);
    await shotPng("auth-expired.png");
    await cdp.eval(`localStorage.setItem('duitang_token', ${JSON.stringify(loginToken)})`);

    // ── 个人主页收集：渲染比例应等于接口 sizes 算出的比例 ──
    await open("#/profile?tab=collection");
    let profileReady = false;
    for (let i = 0; i < 15 && !profileReady; i++) {
      await sleep(1000);
      profileReady = (await cdp.eval(`document.querySelectorAll('div[style*="padding-bottom"]').length`)) > 0;
    }
    const ratioCheck = await cdp.eval(`(async () => {
      const r = await fetch('/api/my/collects', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } });
      const d = await r.json();
      const pads = [...document.querySelectorAll('div[style*="padding-bottom"]')]
        .map(el => Math.round(parseFloat(el.style.paddingBottom)));
      const expected = (d.posts || []).map(p => {
        const s = Array.isArray(p.sizes) ? p.sizes[0] : null;
        return s && s.w > 0 ? Math.round((s.h / s.w) * 100) : 75;
      });
      return JSON.stringify({ pads, expected, total: d.total });
    })()`);
    const rc = JSON.parse(ratioCheck);
    // 若 sizes 未解析，前端会一律回落到 75%，与接口给出的预期比例不符
    const matched = rc.expected.length > 0 && rc.expected.every(e => rc.pads.includes(e));
    check("收集页渲染比例与接口 sizes 一致", matched, `预期=${rc.expected.join(",") || "无"} 实际=${rc.pads.join(",") || "无"}`);
    await shotPng("profile-collects.png");

    // ── 标签聚合页 ──
    await open("#/tag/" + encodeURIComponent("汉服"));
    let tagReady = false;
    for (let i = 0; i < 15 && !tagReady; i++) {
      await sleep(1000);
      tagReady = (await cdp.eval(`document.querySelectorAll('main .break-inside-avoid').length`)) > 0;
    }
    const tagInfo = JSON.parse(await cdp.eval(`(() => {
      const h1 = document.querySelector('main h1');
      return JSON.stringify({
        heading: h1 ? h1.textContent.trim() : '',
        cards: document.querySelectorAll('main .break-inside-avoid').length,
        hasTagChip: !!document.querySelector('[data-testid="related-tags"]'),
      });
    })()`));
    check("标签页展示标签名与结果卡片", tagInfo.heading.includes("汉服") && tagInfo.cards > 0, JSON.stringify(tagInfo));
    check("标签页展示相关标签", tagInfo.hasTagChip);
    await shotPng("tag-page.png");

    // 点击卡片上的标签能跳转到标签页
    await open("#/tag/" + encodeURIComponent("壁纸"));
    let tag2Ready = false;
    for (let i = 0; i < 15 && !tag2Ready; i++) {
      await sleep(1000);
      tag2Ready = (await cdp.eval(`document.querySelectorAll('main .break-inside-avoid').length`)) > 0;
    }
    const tagNavOk = await cdp.eval(`(() => {
      const card = document.querySelector('main .break-inside-avoid');
      if (!card) return 'no-card';
      const tagBtn = [...card.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('#'));
      if (!tagBtn) return 'no-tag-button';
      tagBtn.click();
      return 'clicked';
    })()`);
    await sleep(2000);
    const tagAfter = await cdp.eval(`(() => { const h1 = document.querySelector('main h1'); return h1 ? h1.textContent.trim() : ''; })()`);
    check("卡片标签可点击跳转标签页", tagNavOk === "clicked" && tagAfter.startsWith("#"), `${tagNavOk} → ${tagAfter}`);

    // ── 帖子编辑 ──
    await open("#/pin/" + ownPostId);
    let editReady = false;
    for (let i = 0; i < 15 && !editReady; i++) {
      await sleep(1000);
      editReady = await cdp.eval(`!!([...document.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑'))`);
    }
    check("自己帖子详情有编辑入口", editReady);

    const originalTitle = await cdp.eval(`(() => {
      const h = [...document.querySelectorAll('h2')].map(e => e.textContent.trim()).filter(Boolean);
      return h[0] || '';
    })()`);

    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑').click()`);
    await sleep(700);
    const hasForm = await cdp.eval(`!!document.querySelector('#edit-title')`);
    check("编辑弹窗带预填内容", hasForm && (await cdp.eval(`document.querySelector('#edit-title').value`)) === originalTitle,
      "预填=" + (await cdp.eval(`document.querySelector('#edit-title')?.value || ''`)));

    const newTitle = originalTitle + "·改";
    await cdp.eval(`(() => {
      const i = document.querySelector('#edit-title');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, ${JSON.stringify(newTitle)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(300);
    await shotPng("edit-post-modal.png");
    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '保存').click()`);

    let edited = false;
    for (let i = 0; i < 12 && !edited; i++) {
      await sleep(800);
      text = await cdp.eval("document.body.innerText");
      edited = text.includes(newTitle);
    }
    check("保存后详情页标题立即更新", edited, newTitle);

    // 持久化校验（重新打开页面）
    await open("#/pin/" + ownPostId);
    let persisted = false;
    for (let i = 0; i < 12 && !persisted; i++) {
      await sleep(800);
      text = await cdp.eval("document.body.innerText");
      persisted = text.includes(newTitle);
    }
    check("刷新后编辑结果已持久化", persisted);

    // 还原标题，保持演示数据干净
    await cdp.eval(`(async () => {
      await fetch('/api/posts/${ownPostId}', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('duitang_token') },
        body: JSON.stringify({ title: ${JSON.stringify(originalTitle)} }),
      });
    })()`);

    // ── 消息通知 ──
    const notifSetup = JSON.parse(await cdp.eval(`(async () => {
      const myMe = await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
      const other = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
      const oh = { Authorization: 'Bearer ' + other.token };
      const mine = await (await fetch('/api/posts?user_id=' + myMe.user.id + '&limit=1', { headers: oh })).json();
      const pid = mine.posts[0].id;
      // 先确保未点赞状态，再点赞，保证一定产生一条通知
      if (mine.posts[0].is_liked) {
        await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh });
      }
      const r = await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh });
      const d = await r.json();
      return JSON.stringify({ ok: r.ok, postId: pid, liked: d.liked });
    })()`));
    check("他人点赞已产生通知", notifSetup.ok && notifSetup.liked, "post=" + notifSetup.postId);

    await cdp.eval(`localStorage.setItem('duitang_token', ${JSON.stringify(loginToken)})`);
    await open("#/");
    let badgeReady = false;
    for (let i = 0; i < 15 && !badgeReady; i++) {
      await sleep(1000);
      badgeReady = await cdp.eval(`!!document.querySelector('[data-testid="unread-badge"]')`);
    }
    const badgeText = await cdp.eval(`document.querySelector('[data-testid="unread-badge"]')?.textContent || ''`);
    check("铃铛显示未读角标", badgeReady, "角标=" + badgeText);
    await shotPng("notification-badge.png");

    await cdp.eval(`document.querySelector('button[aria-label*="通知"]').click()`);
    let panelReady = false;
    for (let i = 0; i < 12 && !panelReady; i++) {
      await sleep(800);
      text = await cdp.eval("document.body.innerText");
      panelReady = text.includes("赞了你的帖子");
    }
    check("通知面板显示点赞消息", panelReady);
    await shotPng("notifications.png");

    // 打开后应标记已读，角标消失
    let badgeGone = false;
    for (let i = 0; i < 10 && !badgeGone; i++) {
      await sleep(700);
      badgeGone = !(await cdp.eval(`!!document.querySelector('[data-testid="unread-badge"]')`));
    }
    check("打开面板后未读角标消失", badgeGone);

    // ── 通知清空 ──
    const clearOk = await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '清空');
      if (!b) return 'no-button';
      b.click();
      return 'clicked';
    })()`);
    let cleared = false;
    for (let i = 0; i < 10 && !cleared; i++) {
      await sleep(600);
      text = await cdp.eval("document.body.innerText");
      cleared = text.includes("还没有新消息");
    }
    check("通知面板可一键清空", clearOk === "clicked" && cleared, clearOk);

    // ── 通知未读数：窗口重新聚焦时自动刷新（无需手动打开面板）──
    await cdp.eval(`(async () => {
      const other = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
      const oh = { Authorization: 'Bearer ' + other.token };
      const me = await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
      const mine = await (await fetch('/api/posts?user_id=' + me.user.id + '&limit=1', { headers: oh })).json();
      const pid = mine.posts[0].id;
      if (mine.posts[0].is_liked) await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh });
      await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh });
    })()`);
    // 关闭面板后触发 focus，验证轮询/聚焦刷新路径
    await cdp.eval(`document.body.click()`);
    await sleep(500);
    await cdp.eval(`window.dispatchEvent(new Event('focus'))`);
    let autoBadge = false;
    for (let i = 0; i < 10 && !autoBadge; i++) {
      await sleep(700);
      autoBadge = await cdp.eval(`!!document.querySelector('[data-testid="unread-badge"]')`);
    }
    check("窗口聚焦后未读角标自动出现", autoBadge);

    // ── 粉丝/关注列表弹窗 ──
    await open("#/profile");
    let statsReady = false;
    for (let i = 0; i < 15 && !statsReady; i++) {
      await sleep(800);
      statsReady = await cdp.eval(`!!document.querySelector('button[aria-label*="查看粉丝"]')`);
    }
    check("个人主页粉丝/关注可点击", statsReady);

    // 回归：分类导航只属于首页，个人主页不应再出现（否则与页面返回栏重复）
    const profileNavCount = await cdp.eval(`document.querySelectorAll('nav button').length`);
    check("个人主页不显示首页分类导航", profileNavCount === 0, `nav=${profileNavCount}`);

    // 回归：页面返回栏吸在 Header 下方，滚动时不被 Header 盖住
    await cdp.eval(`window.scrollTo(0, 400)`);
    await sleep(600);
    const stickyBar = await cdp.eval(`(() => {
      const bar = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'sticky' && d.textContent.includes('返回'));
      if (!bar) return 'not-found';
      const r = bar.getBoundingClientRect();
      const hb = document.querySelector('header').getBoundingClientRect().bottom;
      return JSON.stringify({ top: Math.round(r.top), headerBottom: Math.round(hb) });
    })()`);
    let stickyOk = false;
    if (stickyBar !== "not-found") {
      const s = JSON.parse(stickyBar);
      stickyOk = s.top >= s.headerBottom - 1;
    }
    check("个人主页返回栏吸顶位置正确", stickyOk, stickyBar);
    await cdp.eval(`window.scrollTo(0, 0)`);
    await sleep(300);
    await cdp.eval(`document.querySelector('button[aria-label*="查看粉丝"]').click()`);
    let followModalOpen = false;
    for (let i = 0; i < 10 && !followModalOpen; i++) {
      await sleep(600);
      followModalOpen = await cdp.eval(`/粉丝（\\d+）/.test(document.body.innerText)`);
    }
    check("粉丝弹窗可打开", followModalOpen);
    await shotPng("follow-list-modal.png");
    await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await sleep(500);

    // ── 缩略图链路：上传 → 发帖 → 卡片使用 _thumb ──
    const thumbSetup = JSON.parse(await cdp.eval(`(async () => {
      const token = localStorage.getItem('duitang_token');
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 900;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#3366ff'; ctx.fillRect(0, 0, 1200, 900);
      ctx.fillStyle = '#fff'; ctx.font = '80px sans-serif'; ctx.fillText('E2E', 60, 200);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
      const fd = new FormData();
      fd.append('file', new File([blob], 'e2e.jpg', { type: 'image/jpeg' }));
      const up = await (await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd })).json();
      const created = await (await fetch('/api/posts', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ title: 'E2E 缩略图验证', images: [up.url], thumbs: [up.thumb], sizes: [{ w: up.width, h: up.height }], board: 'food', tags: ['e2etag'] }) })).json();
      return JSON.stringify({ thumb: up.thumb, url: up.url, id: created.post.id, width: up.width });
    })()`));
    check("上传返回缩略图与尺寸", !!thumbSetup.thumb && thumbSetup.thumb.includes("_w400.jpg") && thumbSetup.width === 1200,
      JSON.stringify(thumbSetup));

    await open("#/tag/e2etag");
    let thumbCardReady = false;
    for (let i = 0; i < 15 && !thumbCardReady; i++) {
      await sleep(800);
      thumbCardReady = (await cdp.eval(`document.querySelectorAll('main .break-inside-avoid img').length`)) > 0;
    }
    const cardSrc = await cdp.eval(`(() => {
      const img = document.querySelector('main .break-inside-avoid img');
      return img ? img.getAttribute('src') : '';
    })()`);
    check("列表卡片使用缩略图而非原图", cardSrc.includes("_w400.jpg"), cardSrc);
    await shotPng("thumb-card.png");

    // 清理：删除验证帖子
    await cdp.eval(`fetch('/api/posts/${thumbSetup.id}', { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })`);
    await sleep(300);

    // ── 发布页草稿保护 ──
    await open("#/publish");
    let publishReady = false;
    for (let i = 0; i < 15 && !publishReady; i++) {
      await sleep(800);
      publishReady = await cdp.eval(`!!document.querySelector('input[placeholder*="好标题"]')`);
    }
    await cdp.eval(`(() => {
      const i = document.querySelector('input[placeholder*="好标题"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, 'E2E 草稿标题');
      i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(900); // 等草稿防抖写入
    await open("#/");
    await open("#/publish");
    let draftRestored = false;
    for (let i = 0; i < 15 && !draftRestored; i++) {
      await sleep(800);
      draftRestored = await cdp.eval(`document.querySelector('input[placeholder*="好标题"]')?.value === 'E2E 草稿标题'`);
    }
    check("离开后返回能恢复发布草稿", draftRestored);
    await shotPng("publish-draft.png");
    // 清理草稿，避免影响后续使用
    await cdp.eval(`localStorage.removeItem('duitang_publish_draft')`);

    // ── 画板分组页 ──
    await open("#/board/anime");
    let boardReady = false;
    for (let i = 0; i < 15 && !boardReady; i++) {
      await sleep(800);
      boardReady = (await cdp.eval(`document.querySelectorAll('main .break-inside-avoid').length`)) > 0;
    }
    const boardInfo = JSON.parse(await cdp.eval(`(() => {
      const h1 = document.querySelector('main h1');
      return JSON.stringify({
        heading: h1 ? h1.textContent.trim() : '',
        cards: document.querySelectorAll('main .break-inside-avoid').length,
        switcher: !!document.querySelector('[data-testid="board-switcher"]'),
      });
    })()`));
    check("画板页显示中文画板名与内容", boardInfo.heading === "动漫插画" && boardInfo.cards > 0, JSON.stringify(boardInfo));
    check("画板页提供其他画板切换", boardInfo.switcher);
    await shotPng("board-page.png");

    // ── 大图预览灯箱（挑一条多图帖子）──
    const multiPostId = await cdp.eval(`(async () => {
      const data = await (await fetch('/api/posts?limit=100')).json();
      const multi = (data.posts || []).find(p => {
        if (Array.isArray(p.images)) return p.images.length > 1;
        try { return JSON.parse(p.images || '[]').length > 1; } catch { return false; }
      });
      return multi ? multi.id : null;
    })()`);
    check("存在多图帖子用于灯箱验证", !!multiPostId, String(multiPostId));

    if (multiPostId) {
      await open("#/pin/" + multiPostId);
      let detailImageReady = false;
      for (let i = 0; i < 15 && !detailImageReady; i++) {
        await sleep(800);
        detailImageReady = await cdp.eval(`!!document.querySelector('main img[alt]')`);
      }
      await cdp.eval(`document.querySelector('main img[alt]')?.click()`);
      let lightboxVisible = false;
      for (let i = 0; i < 12 && !lightboxVisible; i++) {
        await sleep(500);
        lightboxVisible = await cdp.eval(`!!document.querySelector('[data-testid="image-lightbox"]')`);
      }
      check("详情页图片可打开大图预览", lightboxVisible);

      if (lightboxVisible) {
        const counterBefore = await cdp.eval(`document.body.innerText.match(/(\\d+) \\/ (\\d+)/)?.[0] || ''`);
        const nextOk = await cdp.eval(`(() => {
          const b = document.querySelector('button[aria-label="下一张"]');
          if (!b) return 'no-next';
          b.click();
          return 'clicked';
        })()`);
        await sleep(600);
        const counterAfter = await cdp.eval(`document.body.innerText.match(/(\\d+) \\/ (\\d+)/)?.[0] || ''`);
        check("灯箱可切换下一张", nextOk === "clicked" && counterBefore !== counterAfter, `${counterBefore} → ${counterAfter}`);
        await shotPng("lightbox.png");
        await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
        await sleep(500);
        const closed = await cdp.eval(`!document.querySelector('[data-testid="image-lightbox"]')`);
        check("Esc 可关闭大图预览", closed);
      }
    }

    // ── 评论楼中楼 ──
    await open("#/pin/" + ownPostId);
    let composerReady = false;
    for (let i = 0; i < 15 && !composerReady; i++) {
      await sleep(800);
      composerReady = await cdp.eval(`!!document.querySelector('input[placeholder="说点什么吧..."]')`);
    }
    check("详情页有评论输入框", composerReady);

    const topCommentText = "E2E 顶层评论 " + Date.now();
    await cdp.eval(`(() => {
      const i = document.querySelector('input[placeholder="说点什么吧..."]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, ${JSON.stringify(topCommentText)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()`);
    let topShown = false;
    for (let i = 0; i < 10 && !topShown; i++) {
      await sleep(700);
      text = await cdp.eval("document.body.innerText");
      topShown = text.includes(topCommentText);
    }
    check("可以发表顶层评论", topShown);

    // 点"回复"并提交
    const replyText = "E2E 回复 " + Date.now();
    const replyClicked = await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === '回复').pop();
      if (!b) return 'no-reply-button';
      b.click();
      return 'clicked';
    })()`);
    await sleep(500);
    await cdp.eval(`(() => {
      const i = document.querySelector('input[aria-label="回复内容"]');
      if (!i) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, ${JSON.stringify(replyText)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(300);
    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '发送' && !b.disabled)?.click()`);
    let replyShown = false;
    for (let i = 0; i < 10 && !replyShown; i++) {
      await sleep(700);
      text = await cdp.eval("document.body.innerText");
      replyShown = text.includes(replyText);
    }
    check("可以回复评论（楼中楼）", replyClicked === "clicked" && replyShown, replyClicked);
    await shotPng("threaded-comments.png");

    // 清理：删除这条测试帖子（连带评论）避免污染
    await cdp.eval(`fetch('/api/posts/${ownPostId}/comments').then(r => r.json()).then(d => {
      return Promise.all((d.comments || []).filter(c => c.content.includes('E2E')).map(c =>
        fetch('/api/comments/' + c.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })));
    })`);

    // ── SSE 实时通知（不依赖 focus/轮询）──
    await cdp.eval(`localStorage.setItem('duitang_token', ${JSON.stringify(loginToken)})`);
    // 先清空后端通知，再重新加载页面让角标归零，确保基线干净
    await cdp.eval(`fetch('/api/notifications', { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })`);
    await sleep(600);
    await open("#/");
    await sleep(2500);
    const badgeBefore = await cdp.eval(`!!document.querySelector('[data-testid="unread-badge"]')`);

    await cdp.eval(`(async () => {
      const other = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
      const oh = { Authorization: 'Bearer ' + other.token };
      const me = await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
      const mine = await (await fetch('/api/posts?user_id=' + me.user.id + '&limit=1', { headers: oh })).json();
      const pid = mine.posts[0].id;
      if (mine.posts[0].is_liked) await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh });
      await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh });
    })()`);

    let realtimeBadge = false;
    const sseStart = Date.now();
    for (let i = 0; i < 12 && !realtimeBadge; i++) {
      await sleep(400);
      realtimeBadge = await cdp.eval(`!!document.querySelector('[data-testid="unread-badge"]')`);
    }
    check("SSE 实时推送（未触发 focus 也出现角标）", !badgeBefore && realtimeBadge, `${Date.now() - sseStart}ms`);
    await shotPng("sse-notification.png");

    // ── 通知偏好设置 ──
    // 通过头像按钮展开个人菜单（按钮内含当前昵称）
    await cdp.eval(`(() => {
      const btn = [...document.querySelectorAll('header button')].find(b => b.textContent.includes(${JSON.stringify(nickname)}));
      if (btn) btn.click();
    })()`);
    await sleep(700);
    const clickedPrefs = await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '通知设置');
      if (!b) return 'not-found';
      b.click();
      return 'clicked';
    })()`);
    await sleep(900);
    const prefsOpen = await cdp.eval(`!!document.querySelector('[role="switch"]')`);
    check("通知设置弹窗可打开", prefsOpen, clickedPrefs);

    if (prefsOpen) {
      // 关闭"点赞"通知：三态循环 开启→仅关注的人→关闭，需点两次
      await cdp.eval(`(() => {
        const s = [...document.querySelectorAll('[role="switch"]')].find(x => x.getAttribute('aria-label') === '点赞通知');
        if (s) { s.click(); s.click(); }
      })()`);
      await sleep(300);
      await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '保存')?.click()`);
      await sleep(1000);
      await shotPng("notify-prefs.png");

      // 确认偏好已生效，再验证"关闭后不再收到"
      const savedPrefs = await cdp.eval(`(async () => {
        const d = await (await fetch('/api/users/me/notify-prefs', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
        return JSON.stringify(d.prefs);
      })()`);
      check("点赞通知已保存为关闭", savedPrefs.includes('"like":false'), savedPrefs);

      // 清空通知并刷新页面，让角标基线归零（避免 UI 残留误导）
      await cdp.eval(`fetch('/api/notifications', { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })`);
      await sleep(500);
      await open("#/");
      await sleep(2200);

      await cdp.eval(`(async () => {
        const other = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
        const oh = { Authorization: 'Bearer ' + other.token };
        const me = await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
        const mine = await (await fetch('/api/posts?user_id=' + me.user.id + '&limit=1', { headers: oh })).json();
        const pid = mine.posts[0].id;
        await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh }); // 取消
        await fetch('/api/posts/' + pid + '/like', { method: 'POST', headers: oh }); // 重新点赞
      })()`);
      await sleep(2000);
      const stillNoBadge = await cdp.eval(`!!document.querySelector('[data-testid="unread-badge"]')`);
      check("关闭点赞通知后不再收到该类型消息", !stillNoBadge);

      // 恢复默认设置，避免影响手动测试
      await cdp.eval(`fetch('/api/users/me/notify-prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('duitang_token') }, body: JSON.stringify({ prefs: { like: true } }) })`);
    }

    // ── 图片多档尺寸：上传 → 发帖 → 卡片 srcset ──
    const varUpload = JSON.parse(await cdp.eval(`(async () => {
      const token = localStorage.getItem('duitang_token');
      const canvas = document.createElement('canvas');
      canvas.width = 1600; canvas.height = 900;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#2255ff'; ctx.fillRect(0, 0, 1600, 900);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
      const fd = new FormData();
      fd.append('file', new File([blob], 'v.jpg', { type: 'image/jpeg' }));
      const up = await (await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd })).json();
      return JSON.stringify({ variants: up.variants, url: up.url, width: up.width, thumb: up.thumb });
    })()`));
    check("上传返回多档尺寸变体", varUpload.variants.length === 2 && varUpload.width === 1600, JSON.stringify(varUpload.variants));

    const varPost = await cdp.eval(`(async () => {
      const token = localStorage.getItem('duitang_token');
      const r = await fetch('/api/posts', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          title: '多档尺寸验证帖', images: [${JSON.stringify(varUpload.url)}],
          thumbs: [${JSON.stringify(varUpload.thumb)}], variants: [${JSON.stringify(varUpload.variants)}],
          sizes: [{ w: 1600, h: 900 }], board: 'food', tags: ['vartag'],
        }) });
      const d = await r.json();
      return d.post ? d.post.id : null;
    })()`);
    check("带变体的帖子创建成功", !!varPost, String(varPost));

    await open("#/tag/vartag");
    let varReady = false;
    for (let i = 0; i < 15 && !varReady; i++) {
      await sleep(800);
      varReady = (await cdp.eval(`document.querySelectorAll('main .break-inside-avoid img').length`)) > 0;
    }
    const srcsetInfo = await cdp.eval(`(() => {
      const img = document.querySelector('main .break-inside-avoid img');
      return img ? JSON.stringify({ src: img.getAttribute('src'), srcset: img.getAttribute('srcset') }) : 'no-img';
    })()`);
    check("卡片使用 srcset 响应式加载", /_w400/.test(srcsetInfo) && /_w800/.test(srcsetInfo), srcsetInfo);
    await shotPng("variant-card.png");
    await cdp.eval(`fetch('/api/posts/${varPost}', { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })`);

    // ── @ 提醒 ──
    const mentionResult = await cdp.eval(`(async () => {
      const other = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'tangtu', password: '123456' }) })).json();
      const r = await fetch('/api/posts/${ownPostId}/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + other.token },
        body: JSON.stringify({ content: '@糖小颜 来围观这条帖子' }),
      });
      return r.ok;
    })()`);
    check("评论 @提及 提交成功", mentionResult);

    await cdp.eval(`document.querySelector('button[aria-label*="通知"]').click()`);
    let mentionShown = false;
    for (let i = 0; i < 12 && !mentionShown; i++) {
      await sleep(700);
      text = await cdp.eval("document.body.innerText");
      mentionShown = text.includes("提到了你");
    }
    check("评论 @提及 产生通知", mentionShown);
    await shotPng("mention-notification.png");
    await cdp.eval(`document.body.click()`);
    await sleep(500);

    // ── 通知偏好「仅关注的人」 ──
    const stranger = await cdp.eval(`(async () => {
      const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'str_' + Date.now(), nickname: '陌生人', password: '123456' }) });
      return JSON.stringify({ token: (await r.json()).token });
    })()`);
    const strangerToken = JSON.parse(stranger).token;
    const myId = JSON.parse(await cdp.eval(`(async () => {
      const me = await (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
      return JSON.stringify({ id: me.user.id });
    })()`)).id;

    // 设置 comment 仅关注的人
    await cdp.eval(`fetch('/api/users/me/notify-prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('duitang_token') }, body: JSON.stringify({ prefs: { comment: 'followers' } }) })`);

    const readUnread = async () => JSON.parse(await cdp.eval(`(async () => {
      const d = await (await fetch('/api/notifications/unread', { headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })).json();
      return JSON.stringify({ count: d.count });
    })()`)).count;

    const baseUnread = await readUnread();
    // 陌生人（未关注）评论 → 不应通知
    await cdp.eval(`fetch('/api/posts/${ownPostId}/comments', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ${JSON.stringify(strangerToken)} }, body: JSON.stringify({ content: '陌生人评论1' }) })`);
    await sleep(1500);
    const afterNoFollow = await readUnread();
    check("「仅关注的人」下非关注者评论不通知", afterNoFollow <= baseUnread, `${baseUnread}→${afterNoFollow}`);

    // 陌生人关注后再评论 → 应通知
    await cdp.eval(`fetch('/api/users/${myId}/follow', { method: 'POST', headers: { Authorization: 'Bearer ' + ${JSON.stringify(strangerToken)} } })`);
    await cdp.eval(`fetch('/api/posts/${ownPostId}/comments', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ${JSON.stringify(strangerToken)} }, body: JSON.stringify({ content: '关注者评论' }) })`);
    await sleep(1500);
    const afterFollow = await readUnread();
    check("「仅关注的人」下关注者评论触发通知", afterFollow > afterNoFollow, `${afterNoFollow}→${afterFollow}`);

    // 恢复偏好
    await cdp.eval(`fetch('/api/users/me/notify-prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('duitang_token') }, body: JSON.stringify({ prefs: { comment: true } }) })`);

    // ── 评论楼中楼折叠 ──
    const thread = JSON.parse(await cdp.eval(`(async () => {
      const token = localStorage.getItem('duitang_token');
      const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
      const post = await (await fetch('/api/posts', { method: 'POST', headers: h,
        body: JSON.stringify({ title: '楼中楼折叠验证', images: ['/uploads/x.jpg'], board: 'food', tags: ['threadtag'] }) })).json();
      const pid = post.post.id;
      const top = await (await fetch('/api/posts/' + pid + '/comments', { method: 'POST', headers: h,
        body: JSON.stringify({ content: '顶层评论' }) })).json();
      for (let i = 0; i < 3; i++) {
        await fetch('/api/posts/' + pid + '/comments', { method: 'POST', headers: h,
          body: JSON.stringify({ content: '回复内容' + (i + 1), parent_id: top.comment.id }) });
      }
      return JSON.stringify({ pid, topId: top.comment.id });
    })()`));
    check("构造带回复的帖子", !!thread.pid && !!thread.topId, JSON.stringify(thread));

    await open("#/pin/" + thread.pid);
    let threadReady = false;
    for (let i = 0; i < 15 && !threadReady; i++) {
      await sleep(800);
      threadReady = await cdp.eval(`!!document.querySelector('[data-testid="replies-${thread.topId}"]')`);
    }
    const collapsed = await cdp.eval(`(() => {
      const block = document.querySelector('[data-testid="replies-${thread.topId}"]');
      const toggle = block && block.querySelector('button');
      return JSON.stringify({
        hasToggle: !!toggle,
        toggleText: toggle ? toggle.textContent.trim() : '',
        replyVisible: block ? block.textContent.includes('回复内容1') : false,
      });
    })()`);
    const cf = JSON.parse(collapsed);
    check("楼中楼默认折叠且显示回复数", cf.hasToggle && cf.toggleText.includes("3") && !cf.replyVisible, collapsed);

    await cdp.eval(`document.querySelector('[data-testid="replies-${thread.topId}"] button').click()`);
    await sleep(600);
    const expanded = await cdp.eval(`(() => {
      const block = document.querySelector('[data-testid="replies-${thread.topId}"]');
      return block ? block.textContent.includes('回复内容1') : false;
    })()`);
    check("点击展开后显示回复内容", expanded);
    await shotPng("threaded-collapse.png");

    // 清理验证帖子与评论
    await cdp.eval(`fetch('/api/posts/${thread.pid}', { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })`);
    await sleep(300);

    // ── 专辑功能 ──
    const albumSetup = JSON.parse(await cdp.eval(`(async () => {
      const token = localStorage.getItem('duitang_token');
      const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
      const created = await (await fetch('/api/albums', { method: 'POST', headers: h,
        body: JSON.stringify({ title: 'E2E 专辑', description: '自动化验证用' }) })).json();
      const albumId = created.album.id;
      await fetch('/api/albums/' + albumId + '/posts', { method: 'POST', headers: h,
        body: JSON.stringify({ post_id: ${ownPostId} }) });
      return JSON.stringify({ albumId, title: created.album.title });
    })()`));

    await open("#/album/" + albumSetup.albumId);
    let albumReady = false;
    for (let i = 0; i < 15 && !albumReady; i++) {
      await sleep(800);
      albumReady = (await cdp.eval(`document.querySelectorAll('main .break-inside-avoid').length`)) > 0;
    }
    const albumInfo = JSON.parse(await cdp.eval(`(() => {
      const h1 = document.querySelector('main h1');
      return JSON.stringify({
        title: h1 ? h1.textContent.trim() : '',
        cards: document.querySelectorAll('main .break-inside-avoid').length,
      });
    })()`));
    check("专辑页展示标题与内部图片", albumInfo.title.includes("E2E 专辑") && albumInfo.cards > 0, JSON.stringify(albumInfo));
    await shotPng("album-page.png");

    // 个人主页「我的专辑」分组
    await open("#/profile?tab=albums");
    let albumTabReady = false;
    for (let i = 0; i < 15 && !albumTabReady; i++) {
      await sleep(700);
      albumTabReady = await cdp.eval(`!!document.querySelector('[data-testid="album-grid"]')`);
    }
    const albumTab = await cdp.eval(`(() => {
      const grid = document.querySelector('[data-testid="album-grid"]');
      return JSON.stringify({ hasGrid: !!grid, text: grid ? grid.textContent.slice(0, 60) : '' });
    })()`);
    check("个人主页有「我的专辑」并能列出专辑", albumTabReady && albumTab.includes("E2E 专辑"), albumTab);
    await shotPng("profile-albums.png");

    // 详情页「收进专辑」弹窗
    await open("#/pin/" + ownPostId);
    let collectBtnReady = false;
    for (let i = 0; i < 15 && !collectBtnReady; i++) {
      await sleep(700);
      collectBtnReady = await cdp.eval(`!!document.querySelector('button[aria-label="收进专辑"]')`);
    }
    await cdp.eval(`document.querySelector('button[aria-label="收进专辑"]')?.click()`);
    let pickerOpen = false;
    for (let i = 0; i < 10 && !pickerOpen; i++) {
      await sleep(600);
      pickerOpen = await cdp.eval(`!!document.querySelector('[data-testid="album-picker"]')`);
    }
    const pickerHasAlbum = await cdp.eval(`(() => {
      const p = document.querySelector('[data-testid="album-picker"]');
      return p ? p.textContent.includes('E2E 专辑') : false;
    })()`);
    check("详情页可打开「收进专辑」并列出专辑", collectBtnReady && pickerOpen && pickerHasAlbum, `btn=${collectBtnReady} open=${pickerOpen} listed=${pickerHasAlbum}`);
    await shotPng("album-picker.png");
    await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await sleep(400);

    // 清理验证专辑
    await cdp.eval(`fetch('/api/albums/${albumSetup.albumId}', { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })`);
    await sleep(300);

    // ── 热搜 / 发现页 ──
    const trendingApi = JSON.parse(await cdp.eval(`(async () => {
      const d = await (await fetch('/api/trending')).json();
      return JSON.stringify({
        searches: (d.searches || []).length,
        tags: (d.tags || []).length,
        authors: (d.authors || []).length,
        newUsers: (d.new_users || []).length,
      });
    })()`));
    check("trending 接口返回热搜/话题/作者/新人",
      trendingApi.searches > 0 && trendingApi.tags > 0 && trendingApi.authors > 0 && trendingApi.newUsers > 0,
      JSON.stringify(trendingApi));

    await open("#/discover");
    let discoverReady = false;
    for (let i = 0; i < 15 && !discoverReady; i++) {
      await sleep(700);
      discoverReady = await cdp.eval(`!!document.querySelector('[data-testid="trending-authors"]')`);
    }
    const discoverInfo = JSON.parse(await cdp.eval(`(() => {
      const authors = document.querySelector('[data-testid="trending-authors"]');
      const tags = document.querySelector('[data-testid="trending-tags"]');
      return JSON.stringify({
        authors: authors ? authors.querySelectorAll('button').length : 0,
        tags: tags ? tags.querySelectorAll('button').length : 0,
      });
    })()`));
    check("发现页展示热门作者与话题", discoverReady && discoverInfo.authors > 0 && discoverInfo.tags > 0, JSON.stringify(discoverInfo));
    await shotPng("discover.png");

    // 首页侧栏热门话题来自真实标签，点击可跳转标签页
    await open("#/");
    let topicsReady = false;
    for (let i = 0; i < 15 && !topicsReady; i++) {
      await sleep(700);
      topicsReady = await cdp.eval(`!!document.querySelector('[data-testid="hot-topics"]')`);
    }
    const topicsCount = await cdp.eval(`document.querySelectorAll('[data-testid="hot-topics"] button').length`);
    check("首页侧栏热门话题来自真实数据", topicsReady && topicsCount > 0, `topics=${topicsCount}`);

    const hrefAfterTopic = await cdp.eval(`(() => {
      const btn = document.querySelector('[data-testid="hot-topics"] button');
      if (!btn) return 'no-btn';
      btn.click();
      return 'clicked';
    })()`);
    await sleep(1500);
    const hashNow = await cdp.eval(`location.hash`);
    check("点击热门话题跳转标签页", hrefAfterTopic === "clicked" && hashNow.startsWith("#/tag/"), hashNow);
    await shotPng("hot-topic-nav.png");

    // ── 富文本编辑器 ──
    await open("#/publish");
    let editorReady = false;
    for (let i = 0; i < 15 && !editorReady; i++) {
      await sleep(700);
      editorReady = await cdp.eval(`!!document.querySelector('[data-testid="rich-text-editor"]')`);
    }
    check("发布页有富文本编辑器", editorReady);

    const toolbarOk = await cdp.eval(`(() => {
      const box = document.querySelector('[data-testid="rich-text-editor"]');
      if (!box) return 'no-editor';
      const labels = [...box.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
      return JSON.stringify(labels);
    })()`);
    let hasToolbar = false;
    if (toolbarOk !== "no-editor") {
      const labels = JSON.parse(toolbarOk);
      hasToolbar = ["加粗", "斜体", "小标题", "无序列表", "链接"].every(l => labels.includes(l));
    }
    check("富文本工具栏齐全", hasToolbar, toolbarOk);
    await shotPng("rich-text-editor.png");

    // 点击「加粗」应切换按钮激活态（React 状态更新需要一帧，读属性前要等待）
    const boldBefore = await cdp.eval(`(() => {
      const box = document.querySelector('[data-testid="rich-text-editor"]');
      const btn = box && [...box.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '加粗');
      if (!btn) return 'no-btn';
      btn.click();
      return btn.getAttribute('aria-pressed');
    })()`);
    await sleep(400);
    const boldAfter = await cdp.eval(`(() => {
      const box = document.querySelector('[data-testid="rich-text-editor"]');
      const btn = box && [...box.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '加粗');
      return btn ? btn.getAttribute('aria-pressed') : 'no-btn';
    })()`);
    // 复位
    await cdp.eval(`(() => {
      const box = document.querySelector('[data-testid="rich-text-editor"]');
      const btn = box && [...box.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '加粗');
      if (btn) btn.click();
    })()`);
    await sleep(200);
    check("加粗按钮可切换激活态", boldBefore !== "no-btn" && boldAfter === "true", `before=${boldBefore} after=${boldAfter}`);

    // 富文本描述端到端：服务端消毒 + 前端渲染
    const richPost = await cdp.eval(`(async () => {
      const token = localStorage.getItem('duitang_token');
      const r = await fetch('/api/posts', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          title: '富文本验证帖',
          description: '<p>正文<strong>加粗内容</strong></p><script>window.__xss = 1</script><p onclick="alert(1)">安全段落</p>',
          images: ['/uploads/r.jpg'], board: 'food', tags: ['富文本'],
        }) });
      const d = await r.json();
      return d.post ? String(d.post.id) : 'failed';
    })()`);
    check("富文本帖子创建成功", richPost !== "failed", richPost);

    if (richPost !== "failed") {
      await open("#/pin/" + richPost);
      let richReady = false;
      for (let i = 0; i < 15 && !richReady; i++) {
        await sleep(700);
        richReady = await cdp.eval(`document.body.innerText.includes('加粗内容')`);
      }
      const richDom = JSON.parse(await cdp.eval(`(() => {
        const root = document.querySelector('.rich-content');
        return JSON.stringify({
          hasStrong: !!document.querySelector('.rich-content strong'),
          strongText: document.querySelector('.rich-content strong')?.textContent || '',
          hasScript: !!document.querySelector('.rich-content script'),
          xssRan: typeof window.__xss !== 'undefined',
          hasOnclick: root ? /onclick/i.test(root.innerHTML) : false,
        });
      })()`));
      check("富文本加粗正确渲染", richReady && richDom.hasStrong && richDom.strongText.includes("加粗内容"), JSON.stringify(richDom));
      check("富文本 XSS 被阻断", !richDom.hasScript && !richDom.xssRan && !richDom.hasOnclick, JSON.stringify(richDom));
      await shotPng("rich-text-rendered.png");
      await cdp.eval(`fetch('/api/posts/${richPost}', { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('duitang_token') } })`);
      await sleep(300);
    }

    ws.close();
    console.log(fails ? `\n${fails} 项失败` : "\n全部通过");
    process.exitCode = fails ? 1 : 0;
  } finally {
    chrome.kill();
  }
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
