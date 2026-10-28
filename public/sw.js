/**
 * 堆糖 PWA Service Worker（手写，不引插件）。
 *
 * 策略：
 * - 应用壳（HTML）：stale-while-revalidate —— 断网也能秒开上次访问的页面
 * - 图标等静态资源：cache-first（内容不变）
 * - /api 与 /uploads：network-first + 短超时回落缓存 —— 在线取最新，离线看旧数据
 * - 非 GET 一律放行不处理
 */
const VERSION = "duitang-v1";
const SHELL_CACHE = VERSION + "-shell";
const STATIC_CACHE = VERSION + "-static";
const API_CACHE = VERSION + "-api";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.add("./")).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

/** 带超时的 fetch（离线/慢网时快速失败回落缓存） */
function fetchTimeout(req, ms) {
  return Promise.race([
    fetch(req),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 应用壳：HTML 导航请求
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match("./");
        // 后台刷新壳，下次访问拿到新版
        fetch("./")
          .then(res => res.ok && cache.put("./", res.clone()))
          .catch(() => {});
        return cached || fetch("./").catch(() => cached);
      })(),
    );
    return;
  }

  // 静态图标：cache-first
  if (url.pathname.endsWith(".png") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".webmanifest")) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) {
            const c = await caches.open(STATIC_CACHE);
            c.put(req, res.clone());
          }
          return res;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  // API 与图片：network-first，2.5s 超时回落缓存
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/uploads")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetchTimeout(req, 2500);
          if (res.ok) {
            const c = await caches.open(API_CACHE);
            c.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          return cached || Response.error();
        }
      })(),
    );
  }
  // 其余同源 GET：交给浏览器默认行为
});
