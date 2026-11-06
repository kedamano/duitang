/**
 * README 截图生成脚本：用 CDP 输出 JPEG 到 docs/screenshots/
 * 用法: node scripts/gen-readme-shots.mjs
 * 前置: 后端(3005, RATE_LIMIT_DISABLED=1) 与前端(5199) 已启动
 */
import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://127.0.0.1:5199";
const OUT = join(root, "docs", "screenshots");
const PORT = 9231;
const W = 1440, H = 1000;

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
  async eval(js) {
    const r = await this.send("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const pre = await fetch(APP + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "tangyan", password: "123456" }),
  });
  if (pre.status === 429) throw new Error("登录被限流(429)，请用 RATE_LIMIT_DISABLED=1 重启后端");
  if (!pre.ok) throw new Error("预检登录失败 status=" + pre.status + "，请确认前后端已启动");

  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, "about:blank",
  ], { stdio: "ignore" });

  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        if (targets?.length) break;
      } catch {}
    }
    if (!targets?.length) throw new Error("chrome 调试端口未就绪");
    const page = targets.find(t => t.type === "page");

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    // 2x DPI，README 里看着清晰
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: W, height: H, deviceScaleFactor: 1, mobile: false,
    });

    // 登录
    await Promise.all([cdp.send("Page.navigate", { url: APP + "/" }), sleep(1500)]);
    const info = JSON.parse(await cdp.eval(`(async () => {
      const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username:'tangyan', password:'123456' }) });
      const d = await r.json();
      localStorage.setItem('duitang_token', d.token);
      return JSON.stringify({ nickname: d.user.nickname, token: d.token, id: d.user.id });
    })()`));
    console.log("登录:", info.nickname);

    const open = async (hash, waitMs = 2600) => {
      await cdp.send("Page.navigate", { url: APP + "/" + hash });
      await sleep(400);
      await cdp.send("Page.reload", {});
      await sleep(waitMs);
    };

    const shotJpg = async (name, quality = 88) => {
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "jpeg", quality, captureBeyondViewport: false,
      });
      await writeFile(join(OUT, name), Buffer.from(data, "base64"));
      console.log("  [截图]", name);
    };

    // 等某条件的通用等待
    const waitFor = async (expr, tries = 18, interval = 800) => {
      for (let i = 0; i < tries; i++) {
        const v = await cdp.eval(expr);
        if (v) return v;
        await sleep(interval);
      }
      return null;
    };

    // ── 1. 首页（推荐流，含 Banner + 三栏 + 整版卡片）──
    await open("#/");
    await waitFor(`document.querySelectorAll('[data-testid="post-card"]').length > 0`);
    await sleep(1200);
    await shotJpg("home.jpg");

    // ── 2. 首页滚到下方，展示页脚（下载卡 + 版权）──
    await cdp.eval(`(() => {
      const f = document.querySelector('[data-testid="site-footer"]');
      if (f) f.scrollIntoView({ block: 'end' });
    })()`);
    await sleep(1200);
    await shotJpg("footer.jpg");

    // ── 3. 关于页（新增的真实路由页）──
    await open("#/about");
    await waitFor(`document.getElementById('about') !== null`);
    await sleep(900);
    await shotJpg("about.jpg");

    // ── 4. 详情页（挑评论最多的帖子，便于展示楼中楼）──
    const pick = JSON.parse(await cdp.eval(`(async () => {
      const d = await (await fetch('/api/posts?limit=80')).json();
      const posts = d.posts || [];
      // 逐条查评论数，挑最多的（最多查 25 条，避免太慢）
      let best = posts[0] ? { id: posts[0].id, count: -1, imgs: 1 } : null;
      for (const p of posts.slice(0, 25)) {
        const imgs = Array.isArray(p.images) ? p.images : JSON.parse(p.images || '[]');
        const c = await (await fetch('/api/posts/' + p.id + '/comments')).json();
        const cnt = (c.comments || []).length;
        // 评论多优先，其次多图
        const score = cnt * 10 + imgs.length;
        if (best === null || score > best.count) best = { id: p.id, count: score, imgs: imgs.length, comments: cnt };
      }
      return JSON.stringify(best);
    })()`));
    console.log("详情帖:", JSON.stringify(pick));
    await open("#/pin/" + pick.id);
    await waitFor(`!!document.querySelector('main img[alt]')`);
    await sleep(1400);
    await shotJpg("detail.jpg");

    // 评论截图：挑评论最多的帖子（汉服帖，3 条评论 + 2 图），截评论栏内容
    const bestId = await cdp.eval(`(async () => {
      const d = await (await fetch('/api/posts?limit=80')).json();
      let best = null;
      for (const p of (d.posts || []).slice(0, 25)) {
        const c = await (await fetch('/api/posts/' + p.id + '/comments')).json();
        const cnt = (c.comments || []).length;
        if (best === null || cnt > best.cnt) best = { id: p.id, cnt };
      }
      return best ? best.id : null;
    })()`);
    console.log("  评论最多的帖子 id:", bestId);
    await open("#/pin/" + bestId);
    await waitFor(`document.body.innerText.includes('评论区')`, 20, 800);
    await sleep(1200);
    // 详情页是「左图右评论」双栏，评论栏自带滚动；若内容不足一屏，
    // 就用 clip 精确裁剪评论栏区域，保证截图聚焦在评论上
    const clipBox = JSON.parse(await cdp.eval(`(() => {
      const head = [...document.querySelectorAll('p')]
        .find(e => e.textContent.includes('评论区'));
      if (!head) return JSON.stringify({ ok: false });
      // 评论栏 = 标题所在的外层侧栏（含标题、评论列表、输入框）
      let side = head.parentElement;
      while (side && side !== document.body) {
        const w = side.getBoundingClientRect().width;
        if (w > 300 && w < 700) break;
        side = side.parentElement;
      }
      const r = (side || head).getBoundingClientRect();
      return JSON.stringify({
        ok: true,
        x: Math.max(0, Math.round(r.left)),
        y: Math.max(0, Math.round(r.top)),
        width: Math.round(r.width),
        height: Math.min(Math.round(r.height), window.innerHeight - Math.round(r.top)),
      });
    })()`));
    console.log("  评论栏区域:", JSON.stringify(clipBox));
    if (clipBox.ok && clipBox.width > 200 && clipBox.height > 200) {
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "jpeg", quality: 90,
        clip: { x: clipBox.x, y: clipBox.y, width: clipBox.width, height: clipBox.height, scale: 1 },
      });
      await writeFile(join(OUT, "comments.jpg"), Buffer.from(data, "base64"));
      console.log("  [截图] comments.jpg (评论栏裁剪)");
    } else {
      await shotJpg("comments.jpg");
    }

    // ── 5. 灯箱 ──
    await cdp.eval(`window.scrollTo(0,0)`);
    await sleep(400);
    await cdp.eval(`document.querySelector('main img[alt]')?.click()`);
    const lb = await waitFor(`!!document.querySelector('[data-testid="image-lightbox"]')`, 12, 500);
    if (lb) {
      await sleep(900);
      await shotJpg("lightbox.jpg");
      await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
      await sleep(500);
    } else {
      console.log("  [跳过] 灯箱未打开，沿用旧图");
    }

    // ── 6. 发布页 / 富文本编辑器 ──
    await open("#/publish");
    await waitFor(`!!document.querySelector('input[placeholder*="好标题"]')`);
    await sleep(1200);
    await shotJpg("editor.jpg");

    // ── 7. 发现页 ──
    await open("#/discover");
    await waitFor(`!!document.querySelector('[data-testid="trending-authors"]')`);
    await sleep(1100);
    await shotJpg("discover.jpg");

    // ── 8. 个人主页 ──
    await open("#/profile");
    await waitFor(`document.body.innerText.includes('我的发布')`);
    await sleep(1400);
    await shotJpg("profile.jpg");

    // ── 9. 审核队列（管理员）──
    await open("#/admin/reports");
    await waitFor(`document.body.innerText.includes('审核队列')`);
    await sleep(1100);
    await shotJpg("admin.jpg");

    // ── 10. 私信页 ──
    await open("#/messages");
    await sleep(1800);
    await shotJpg("messages.jpg");

    // ── 11. 深色模式首页（展示新暖调色板 + 对比度）──
    await open("#/");
    await cdp.eval(`document.documentElement.classList.add('dark');
      localStorage.setItem('duitang_theme', 'dark');`);
    await sleep(400);
    await cdp.send("Page.reload", {});
    await sleep(2600);
    await waitFor(`document.querySelectorAll('[data-testid="post-card"]').length > 0`);
    await sleep(1000);
    await shotJpg("home-dark.jpg");

    console.log("\n全部截图已写入", OUT);
  } finally {
    chrome.kill();
  }
}

main().catch(e => { console.error("失败:", e.message); process.exit(1); });
