/**
 * 登录态端到端截图脚本（Chrome DevTools Protocol，无需第三方依赖）
 * 用法: node scripts/e2e-shot.mjs [outDir]
 * 前置: 后端(3005) 与前端(5199) 已启动
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
    const nickname = await cdp.eval(`(async () => {
      const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username:'tangyan', password:'123456' }) });
      const d = await r.json();
      localStorage.setItem('duitang_token', d.token);
      return d.user.nickname;
    })()`);
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

    ws.close();
    console.log(fails ? `\n${fails} 项失败` : "\n全部通过");
    process.exitCode = fails ? 1 : 0;
  } finally {
    chrome.kill();
  }
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
