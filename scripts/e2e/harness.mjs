/**
 * E2E 测试共享驱动：用 CDP 驱动无头 Chrome 跑真实页面。
 * 各功能脚本（scripts/e2e/*.mjs）复用这里的连接、登录、断言与截图能力。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 极简 CDP 客户端 */
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? resolve("ERR") : resolve(m.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise(res => this.pending.set(id, { resolve: res }));
  }
  async eval(js) {
    const r = await this.send("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result.value;
  }
  waitEvent(name, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout " + name)), timeout);
      const h = ev => {
        const m = JSON.parse(ev.data);
        if (m.method === name) { clearTimeout(t); this.ws.removeEventListener("message", h); resolve(m.params); }
      };
      this.ws.addEventListener("message", h);
    });
  }
}

/** 打开浏览器并连上第一个页面 */
async function launch(port) {
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run",
    `--remote-debugging-port=${port}`, "--window-size=1440,900", "about:blank",
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (targets.length) break;
    } catch { /* 等待浏览器就绪 */ }
  }
  if (!targets?.length) { chrome.kill(); throw new Error("chrome 调试端口未就绪"); }

  const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  return { chrome, cdp, ws };
}

/**
 * 创建一个 E2E 运行环境。
 * @param {object} opts
 * @param {string} opts.app 前端地址
 * @param {string} opts.api 后端地址
 * @param {string} opts.outDir 截图输出目录
 * @param {number} opts.port 调试端口
 */
export async function createHarness({ app, api, outDir, port }) {
  const { chrome, cdp, ws } = await launch(port);
  fs.mkdirSync(outDir, { recursive: true });

  let fails = 0;
  const results = [];

  const check = (name, cond, extra = "") => {
    const ok = !!cond;
    results.push({ name, ok, extra });
    if (ok) console.log("  √", name, extra);
    else { fails++; console.log("  ×", name, extra); }
    return ok;
  };

  /** 打开页面（hash 路由） */
  const open = async hash => {
    await cdp.send("Page.navigate", { url: app + "/" + hash });
    await sleep(400);
    await cdp.send("Page.reload", {});
    await sleep(1500);
  };

  /** 打开页面但不刷新（用于 hash 内部跳转） */
  const goto = async hash => {
    await cdp.send("Page.navigate", { url: app + "/" + hash });
    await sleep(1200);
  };

  const shotPng = async name => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    const file = path.join(outDir, name);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    console.log("  [截图]", name);
  };

  /** 等待某个条件成立（轮询 DOM） */
  const waitFor = async (expr, { tries = 15, interval = 800, label = "" } = {}) => {
    for (let i = 0; i < tries; i++) {
      const v = await cdp.eval(expr);
      if (v) return v;
      await sleep(interval);
    }
    if (label) console.log("  [超时]", label);
    return null;
  };

  /** 以指定账号登录（写入 localStorage） */
  const login = async (username, password = "123456") => {
    const info = await cdp.eval(`(async () => {
      const r = await fetch('${api}/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: ${JSON.stringify(username)}, password: ${JSON.stringify(password)} }) });
      const d = await r.json();
      localStorage.setItem('duitang_token', d.token);
      return JSON.stringify({ nickname: d.user.nickname, token: d.token });
    })()`);
    return JSON.parse(info);
  };

  /** 直接调用后端接口（页面内 fetch，带当前 token） */
  const apiCall = async (path, options = {}) => {
    const raw = await cdp.eval(`(async () => {
      const token = localStorage.getItem('duitang_token');
      const res = await fetch(${JSON.stringify(api + path)}, {
        ...${JSON.stringify(options)},
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(${JSON.stringify(options.headers || {})}) },
      });
      return res.ok ? await res.text() : JSON.stringify({ __error: res.status });
    })()`);
    try { return JSON.parse(raw); } catch { return raw; }
  };

  const finish = () => {
    console.log("\n──────── 结果 ────────");
    console.log(`通过 ${results.filter(r => r.ok).length}/${results.length}`);
    if (fails) {
      console.log("失败项：");
      results.filter(r => !r.ok).forEach(r => console.log("  -", r.name, r.extra));
    }
    try { ws.close(); } catch {}
    chrome.kill();
    return fails === 0;
  };

  return { cdp, check, open, goto, shotPng, waitFor, login, apiCall, finish, sleep };
}
