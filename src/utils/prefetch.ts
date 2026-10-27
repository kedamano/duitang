import { api } from "../api";
import type { Post } from "../types/api";

/**
 * 帖子详情预取缓存。
 * 列表卡片 hover 时提前拉取详情，进入 /#/pin/<id> 时直接命中，详情页秒开。
 * 缓存 30 秒过期（列表数据可能已变化），命中即删避免陈旧数据。
 */
const TTL_MS = 30_000;
const cache = new Map<number, { data: Post; at: number }>();
const inflight = new Map<number, Promise<Post | null>>();

export function prefetchPost(id: number): void {
  if (!id || cache.has(id) || inflight.has(id)) return;
  const p = api
    .getPost(id)
    .then(d => {
      if (d?.post) cache.set(id, { data: d.post, at: Date.now() });
      return d?.post || null;
    })
    .catch(() => null) // 预取失败静默：真实请求会再试一次
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
}

/** 取出预取结果（一次性，命中即删；过期视为未命中） */
export function takePrefetchedPost(id: number): Post | null {
  const hit = cache.get(id);
  if (!hit) return null;
  cache.delete(id);
  return Date.now() - hit.at > TTL_MS ? null : hit.data;
}

/** 测试用：清空缓存 */
export function clearPrefetchCache(): void {
  cache.clear();
  inflight.clear();
}
