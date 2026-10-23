/**
 * 关注流专项校验：对比「页面渲染的卡片标题」与「接口返回的帖子标题」是否一致
 * 用法: node scripts/verify-feed.mjs
 */
import { spawn } from "node:child_process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://127.0.0.1:5199";
const API = "http://127.0.0.1:3005";
const PORT = 9224;
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej }));
  }
  waitEvent(name, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.ws.removeEventListener("message", h); reject(new Error("timeout " + name)); }, timeout);
      const h = ev => { const m = JSON.parse(ev.data); if (m.method === name) { clearTimeout(t); this.ws.removeEventListener("message", h); resolve(m.params); } };
      this.ws.addEventListener("message", h);
    });
  }
  async eval(js) {
    const r = await this.send("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
}

async function main() {
  // 接口侧真实数据
  const login = await (await fetch(API + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "tangyan", password: "123456" }),
  })).json();
  const auth = { Authorization: "Bearer " + login.token };
  const feed = await (await fetch(API + "/api/feed/following?limit=100", { headers: auth })).json();
  const apiTitles = feed.posts.map(p => p.title);
  const apiAuthors = [...new Set(feed.posts.map(p => p.author_nickname))];
  console.log(`接口: total=${feed.total} 作者集合=${apiAuthors.join(",")}`);

  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run",
    `--remote-debugging-port=${PORT}`, "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
  let fails = 0;
  const check = (name, cond, extra = "") => {
    if (cond) console.log("  √", name, extra);
    else { fails++; console.log("  ×", name, extra); }
  };

  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
    }
    const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");

    await Promise.all([cdp.waitEvent("Page.loadEventFired"), cdp.send("Page.navigate", { url: APP + "/" })]);
    await sleep(1000);
    await cdp.eval(`localStorage.setItem('duitang_token', ${JSON.stringify(login.token)})`);

    // 直接进入 #/ 并点击关注，然后等待渲染稳定
    await cdp.send("Page.navigate", { url: APP + "/" });
    await sleep(300);
    await cdp.send("Page.reload", {});
    await sleep(2500);
    await cdp.eval(`(() => { const b=[...document.querySelectorAll('nav button')].find(x=>x.textContent.trim()==='关注'); b.click(); })()`);
    await sleep(2500);

    // 卡片标题 + 其作者行，成对取出
    const domCards = await cdp.eval(`(() => {
      const cards = [...document.querySelectorAll('main .break-inside-avoid')];
      return JSON.stringify(cards.map(c => ({
        title: c.querySelector('p.line-clamp-2')?.textContent.trim() || '',
        author: c.querySelector('span.truncate')?.textContent.trim() || '',
      })));
    })()`);
    const cards = JSON.parse(domCards);
    console.log(`页面: 卡片数=${cards.length}`);
    console.log("  前 5 张:", cards.slice(0, 5).map(c => `${c.title}(${c.author})`).join(" | "));

    check("页面卡片数与接口 total 一致", cards.length === feed.total, `dom=${cards.length} api=${feed.total}`);
    const domAuthors = [...new Set(cards.map(c => c.author))];
    const expectedAuthors = new Set(["糖小颜", ...apiAuthors]);
    check("页面作者均属于自己或被关注者", domAuthors.every(a => expectedAuthors.has(a)), "实际=" + domAuthors.join(","));
    const domTitles = cards.map(c => c.title);
    check("页面标题集合与接口一致", JSON.stringify([...domTitles].sort()) === JSON.stringify([...apiTitles].sort()));

    ws.close();
    console.log(fails ? `\n${fails} 项失败` : "\n关注流页面与接口完全一致");
    process.exitCode = fails ? 1 : 0;
  } finally {
    chrome.kill();
  }
}
main().catch(e => { console.error("FATAL", e); process.exit(1); });
