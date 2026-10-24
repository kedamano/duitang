import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { normalizePost } from "../utils/normalizePost";
import { MasonryGrid, MasonrySkeleton } from "../components/MasonryGrid";
import { PostDetailModal } from "../components/PostDetail";
import { useToast } from "../context/ToastContext";
import { cn } from "../utils/cn";
import { Icon } from "../components/Icons";
import type { ImageCard } from "../data/images";

const PAGE_SIZE = 20;

/** 标签聚合页：/#/tag/<标签名> */
export default function TagPage() {
  const { tag = "" } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [cards, setCards] = useState<ImageCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<ImageCard | null>(null);
  const [related, setRelated] = useState<{ tag: string; count: number }[]>([]);

  const loadFirstPage = useCallback(async () => {
    if (!tag) return;
    setLoading(true);
    try {
      const [data, tagData] = await Promise.all([
        api.getPosts({ tag, limit: PAGE_SIZE, page: 1 }),
        api.getTags(20).catch(() => ({ tags: [] })),
      ]);
      const posts = (data.posts || []).map(normalizePost);
      setCards(posts);
      setTotal(data.total || 0);
      setHasMore(posts.length >= PAGE_SIZE);
      setPage(1);
      setRelated((tagData.tags || []).filter(t => t.tag !== tag).slice(0, 12));
    } catch {
      showToast("标签内容加载失败，请稍后重试", "error");
    } finally {
      setLoading(false);
    }
  }, [tag, showToast]);

  useEffect(() => { loadFirstPage(); }, [loadFirstPage]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await api.getPosts({ tag, limit: PAGE_SIZE, page: next });
      const posts = (data.posts || []).map(normalizePost);
      setCards(prev => {
        const map = new Map(prev.map(c => [c.id, c]));
        posts.forEach(c => map.set(c.id, c));
        return Array.from(map.values());
      });
      setPage(next);
      setHasMore(posts.length >= PAGE_SIZE);
    } catch {
      showToast("加载更多失败，请稍后重试", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="max-w-screen-xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-gray-400 hover:text-[#e05d6f] transition-colors flex items-center gap-1"
          >
            <Icon name="arrowLeft" className="w-4 h-4" /> 返回首页
          </button>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-800">
          <span className="text-[#e05d6f]">#</span>{tag}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {loading ? "正在加载..." : `共 ${total} 张相关图片`}
        </p>
      </div>

      {related.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2" data-testid="related-tags">
          <span className="text-xs text-gray-400">相关标签：</span>
          {related.map(t => (
            <button
              key={t.tag}
              onClick={() => navigate(`/tag/${encodeURIComponent(t.tag)}`)}
              className={cn(
                "text-xs px-3 py-1 rounded-full transition-colors",
                "bg-white text-gray-600 border border-gray-200 hover:border-[#e05d6f] hover:text-[#e05d6f]",
              )}
            >
              #{t.tag}
              <span className="text-gray-300 ml-1">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <MasonrySkeleton />
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Icon name="tag" className="w-14 h-14 text-gray-300" />
          <p className="text-gray-400 text-base">还没有打了「{tag}」标签的图片</p>
          <button
            onClick={() => navigate("/")}
            className="bg-[#e05d6f] text-white text-sm font-bold px-6 py-2.5 rounded-full hover:bg-[#c94d5e] transition-colors flex items-center gap-1.5"
          >
            去首页逛逛 <Icon name="arrowRight" className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <MasonryGrid cards={cards} onCardClick={setSelected} />
          {hasMore && (
            <div className="flex justify-center py-8">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 rounded-full bg-white border border-gray-200 text-sm text-gray-600 hover:border-[#e05d6f] hover:text-[#e05d6f] disabled:opacity-60 transition-colors"
              >
                {loadingMore ? "加载中..." : "加载更多"}
              </button>
            </div>
          )}
          {!hasMore && (
            <p className="text-center text-gray-300 text-sm pb-10 pt-4 flex items-center justify-center gap-1.5">
              — 已经到底啦 <Icon name="flower" className="w-4 h-4 inline" /> —
            </p>
          )}
        </>
      )}

      {selected && <PostDetailModal card={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
