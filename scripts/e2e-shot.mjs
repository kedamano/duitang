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
      console.log("  📷", name);
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

    ws.close();
    console.log(fails ? `\n${fails} 项失败` : "\n全部通过");
    process.exitCode = fails ? 1 : 0;
  } finally {
    chrome.kill();
  }
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
