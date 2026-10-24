import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { normalizePost } from "../utils/normalizePost";
import { DetailImage, DetailContent, ShareButton } from "../components/PostDetail";
import type { ImageCard } from "../data/images";

/** 独立详情页：分享链接 /#/pin/<id> 打开后可直达该帖 */
export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<ImageCard | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    const postId = parseInt(id ?? "", 10);
    if (!postId) { setStatus("missing"); return; }
    let cancelled = false;
    setStatus("loading");
    api.getPost(postId)
      .then(data => {
        if (cancelled) return;
        if (!data.post) { setStatus("missing"); return; }
        setCard(normalizePost(data.post));
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [id]);

  // 加载中：骨架
  if (status === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm flex flex-col md:flex-row min-h-[60vh]">
          <div className="md:w-1/2 bg-gray-200 animate-pulse min-h-[30vh]" />
          <div className="md:w-1/2 p-6 space-y-4">
            <div className="h-10 bg-gray-100 rounded-full animate-pulse" />
            <div className="h-5 bg-gray-100 rounded animate-pulse" />
            <div className="h-5 w-2/3 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // 帖子不存在 / 加载失败
  if (status !== "ready" || !card) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">{status === "error" ? "⚠️" : "🫥"}</div>
        <p className="text-gray-500 font-medium">
          {status === "error" ? "加载失败，请检查后端服务是否启动" : "这条内容不存在或已被删除"}
        </p>
        <button
          onClick={() => navigate("/")}
          className="bg-[#e05d6f] text-white text-sm font-bold px-6 py-2.5 rounded-full hover:bg-[#c94d5e] transition-colors"
        >
          回到首页
        </button>
      </div>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center mb-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">返回</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 flex flex-col md:flex-row md:min-h-[70vh]">
        <DetailImage card={card} overlay={<ShareButton card={card} />} />
        <DetailContent
          card={card}
          onClose={() => navigate("/")}
          onCardUpdate={post => setCard(prev => (prev ? { ...prev, ...normalizePost(post) } : prev))}
        />
      </div>
    </main>
  );
}
