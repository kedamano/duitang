import { useEffect, useState } from "react";
import { api } from "../api";

export interface TrendingData {
  searches: { tag: string; count: number }[];
  tags: { tag: string; count: number }[];
  authors: any[];
  new_users: any[];
}

// 模块级缓存：Header / 首页侧栏 / 发现页共用一次请求，避免重复拉取
let cache: TrendingData | null = null;
let inflight: Promise<TrendingData> | null = null;

async function loadTrending(): Promise<TrendingData> {
  if (cache) return cache;
  if (!inflight) {
    inflight = api.getTrending()
      .then(d => {
        cache = {
          searches: d.searches || [],
          tags: d.tags || [],
          authors: d.authors || [],
          new_users: d.new_users || [],
        };
        return cache;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** 读取首页聚合数据（带模块级缓存与失败静默回落） */
export function useTrending() {
  const [data, setData] = useState<TrendingData | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) { setData(cache); setLoading(false); return; }
    let cancelled = false;
    loadTrending()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}

/** 供测试或强制刷新使用 */
export function resetTrendingCache() {
  cache = null;
  inflight = null;
}
