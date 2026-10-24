/**
 * E2E：内容创作（发布 / 富文本 / 多图 / 草稿 / 专辑）。
 * 用法: node scripts/e2e/publish.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = process.env.E2E_APP || "http://127.0.0.1:5199";
const API = process.env.E2E_API || "http://127.0.0.1:3005";
const OUT = process.env.E2E_OUT || path.join(root, ".e2e-shots");

const h = await createHarness({ app: APP, api: API, outDir: OUT, port: 9242 });

try {
  await h.open("#/");
  await h.login("tangyan");

  // ── 富文本编辑器 ──
  await h.open("#/publish");
  const editor = await h.waitFor(`!!document.querySelector('[data-testid="rich-text-editor"]')`, { label: "富文本编辑器" });
  h.check("发布页有富文本编辑器", !!editor);

  const toolbar = await h.cdp.eval(`(() => {
    const box = document.querySelector('[data-testid="rich-text-editor"]');
    if (!box) return 'no-editor';
    return JSON.stringify([...box.querySelectorAll('button')].map(b => b.getAttribute('aria-label')));
  })()`);
  const labels = JSON.parse(toolbar);
  h.check("工具栏齐全", ["加粗", "斜体", "小标题", "无序列表", "链接"].every(l => labels.includes(l)), labels.join(","));
  await h.shotPng("e2e-publish-editor.png");

  // 加粗激活态
  await h.cdp.eval(`(() => {
    const box = document.querySelector('[data-testid="rich-text-editor"]');
    [...box.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '加粗')?.click();
  })()`);
  await h.sleep(400);
  const boldPressed = await h.cdp.eval(`document.querySelector('[data-testid="rich-text-editor"] button[aria-label="加粗"]')?.getAttribute('aria-pressed')`);
  h.check("加粗可切换激活态", boldPressed === "true", `pressed=${boldPressed}`);

  // ── 富文本 XSS 防护 ──
  const richPost = await h.apiCall("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "E2E 富文本验证",
      description: '<p>正文<strong>加粗内容</strong></p><script>window.__xss=1</script><p onclick="alert(1)">安全段落</p>',
      images: ["/uploads/r.jpg"], board: "food", tags: ["e2e"],
    }),
  });
  const postId = richPost?.post?.id;
  h.check("富文本帖子创建成功", !!postId, String(postId));

  if (postId) {
    await h.open("#/pin/" + postId);
    const rendered = await h.waitFor(`document.body.innerText.includes('加粗内容')`, { label: "富文本渲染" });
    const dom = await h.cdp.eval(`JSON.stringify({
      strong: !!document.querySelector('.rich-content strong'),
      script: !!document.querySelector('.rich-content script'),
      xss: typeof window.__xss !== 'undefined',
      onclick: (document.querySelector('.rich-content')?.innerHTML || '').includes('onclick'),
    })`);
    const d = JSON.parse(dom);
    h.check("富文本加粗正确渲染", !!rendered && d.strong, dom);
    h.check("富文本 XSS 被阻断", !d.script && !d.xss && !d.onclick, dom);
    await h.shotPng("e2e-publish-richtext.png");
    await h.apiCall("/api/posts/" + postId, { method: "DELETE" });
  }

  // ── 多图排序与封面 ──
  const multi = await h.cdp.eval(`(async () => {
    const token = localStorage.getItem('duitang_token');
    const mk = async (color) => {
      const c = document.createElement('canvas');
      c.width = 400; c.height = 400;
      const ctx = c.getContext('2d');
      ctx.fillStyle = color; ctx.fillRect(0, 0, 400, 400);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      const fd = new FormData();
      fd.append('file', new File([blob], color.replace('#','') + '.jpg', { type: 'image/jpeg' }));
      return (await (await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd })).json()).url;
    };
    const a = await mk('#ff0000');
    const b = await mk('#00ff00');
    const p = await (await fetch('/api/posts', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ title: 'E2E 多图', images: [a, b], board: 'food', tags: ['e2e'] }) })).json();
    return JSON.stringify({ id: p.post.id, first: p.post.images[0] });
  })()`);
  const m = JSON.parse(multi);
  h.check("多图帖子创建成功", !!m.id, multi);

  if (m.id) {
    await h.open("#/pin/" + m.id);
    await h.waitFor(`!!document.querySelector('main img[alt]')`, { label: "详情图" });
    const switched = await h.cdp.eval(`(() => {
      const dots = [...document.querySelectorAll('button[aria-label^="查看第"]')];
      if (!dots.length) return 'no-dots';
      dots[1].click();
      return 'clicked';
    })()`);
    await h.sleep(600);
    const src = await h.cdp.eval(`document.querySelector('main img[alt]')?.getAttribute('src') || ''`);
    h.check("详情页可切换多图", switched === "clicked" && src !== m.first, `${switched} ${src}`);
    await h.apiCall("/api/posts/" + m.id, { method: "DELETE" });
  }

  // ── 服务端草稿箱 ──
  const saved = await h.apiCall("/api/my/draft", {
    method: "PUT",
    body: JSON.stringify({ payload: { title: "E2E 草稿", description: "<p>草稿</p>", tags: ["e2e"], board: "美食菜谱" } }),
  });
  h.check("服务端草稿可保存", saved?.ok === true, JSON.stringify(saved));

  await h.open("#/publish");
  const restored = await h.waitFor(`document.querySelector('input[placeholder*="好标题"]')?.value === 'E2E 草稿'`, { label: "草稿恢复" });
  h.check("发布页恢复服务端草稿", !!restored);
  await h.shotPng("e2e-publish-draft.png");
  await h.apiCall("/api/my/draft", { method: "DELETE" });

  // ── 专辑 ──
  const album = await h.apiCall("/api/albums", { method: "POST", body: JSON.stringify({ title: "E2E 专辑" }) });
  const albumId = album?.album?.id;
  h.check("可创建专辑", !!albumId, JSON.stringify(album?.album?.title));

  if (albumId) {
    const postForAlbum = await h.apiCall("/api/posts", {
      method: "POST",
      body: JSON.stringify({ title: "E2E 专辑用图", images: ["/uploads/a.jpg"], board: "food", tags: [] }),
    });
    await h.apiCall(`/api/albums/${albumId}/posts`, { method: "POST", body: JSON.stringify({ post_id: postForAlbum.post.id }) });

    await h.open("#/album/" + albumId);
    const albumCards = await h.waitFor(`document.querySelectorAll('main .break-inside-avoid').length`, { label: "专辑页" });
    h.check("专辑页展示内部图片", albumCards > 0, `cards=${albumCards}`);
    await h.shotPng("e2e-publish-album.png");

    await h.open("#/profile?tab=albums");
    const tabReady = await h.waitFor(`!!document.querySelector('[data-testid="album-grid"]')`, { label: "我的专辑" });
    h.check("个人主页有「我的专辑」分组", !!tabReady);
    await h.shotPng("e2e-publish-profile-albums.png");

    await h.apiCall("/api/albums/" + albumId, { method: "DELETE" });
    await h.apiCall("/api/posts/" + postForAlbum.post.id, { method: "DELETE" });
  }

  // ── 敏感词打码 ──
  const masked = await h.apiCall("/api/posts", {
    method: "POST",
    body: JSON.stringify({ title: "标题里有傻逼二字", images: ["/uploads/s.jpg"], board: "food", tags: [] }),
  });
  h.check("敏感词被自动打码", !masked?.post?.title?.includes("傻逼") && masked?.post?.title?.includes("**"), masked?.post?.title);
  if (masked?.post?.id) await h.apiCall("/api/posts/" + masked.post.id, { method: "DELETE" });
} finally {
  const ok = h.finish();
  process.exit(ok ? 0 : 1);
}
