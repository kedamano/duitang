import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import { cn } from "../utils/cn";
import type { ImageCard } from "../data/images";

type Tab = "posts" | "collection" | "likes";

function MiniCard({ card, onCardClick }: { card: ImageCard; onCardClick?: (card: ImageCard) => void }) {
  const { user, setShowLogin } = useAuth();
  const { isLiked, toggleLike, isCollected, toggleCollect, getLikeCount, getCollectCount } = useCollection();
  const liked = isLiked(card.id);
  const collected = isCollected(card.id);
  const likeCount = getLikeCount(card.id, card.likes);
  const collectCount = getCollectCount(card.id, card.collects);
  const aspectRatio = (card.height / card.width) * 100;

  return (
    <div
      className="group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
      onClick={() => onCardClick?.(card)}
    >
      <div className="relative overflow-hidden bg-gray-100" style={{ paddingBottom: `${aspectRatio}%` }}>
        <img
          src={card.src}
          alt={card.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300" />
        {/* Collect badge */}
        <button
          onClick={e => { e.stopPropagation(); if (!user) { setShowLogin(true); return; } toggleCollect(card.id); }}
          className={cn(
            "absolute top-2 right-2 flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-medium shadow-md",
            "opacity-0 group-hover:opacity-100 transition-all duration-200",
            collected ? "bg-[#e05d6f] text-white" : "bg-white/90 text-gray-700 hover:bg-[#e05d6f] hover:text-white",
          )}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill={collected ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          {collectCount}
        </button>
        {/* Like badge */}
        <button
          onClick={e => { e.stopPropagation(); if (!user) { setShowLogin(true); return; } toggleLike(card.id); }}
          className={cn(
            "absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-md",
            "opacity-0 group-hover:opacity-100 transition-all duration-200",
            liked ? "bg-[#e05d6f] text-white" : "bg-white/90 text-gray-700",
          )}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {likeCount}
        </button>
      </div>
      <div className="p-2.5">
        <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-snug">{card.title}</p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, setShowLogin, updateUser } = useAuth();
  const { showToast } = useToast();
  const { userPosts, getMyCollects, getMyLikes, getUserPosts, isFollowing, toggleFollow } = useCollection();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    (tabParam === "collection" ? "collection" : tabParam === "likes" ? "likes" : "posts") as Tab
  );
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [selectedCard, setSelectedCard] = useState<ImageCard | null>(null);
  const [myCollects, setMyCollects] = useState<ImageCard[]>([]);
  const [myLikes, setMyLikes] = useState<ImageCard[]>([]);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [targetPosts, setTargetPosts] = useState<ImageCard[]>([]);
  const targetUserId = searchParams.get("user");
  const isViewingOther = !!targetUserId && targetUserId !== String(user?.id ?? -1);

  useEffect(() => {
    if (user) setBio(user.bio);
  }, [user]);

  useEffect(() => {
    if (tabParam === "collection") setActiveTab("collection");
    else if (tabParam === "likes") setActiveTab("likes");
    else setActiveTab("posts");
  }, [tabParam]);

  // Fetch collects and likes when user logs in
  useEffect(() => {
    if (!user) return;
    getMyCollects().then(setMyCollects);
    getMyLikes().then(setMyLikes);
  }, [user, getMyCollects, getMyLikes]);

  // 查看他人主页:拉取资料与该用户发帖
  useEffect(() => {
    if (!isViewingOther || !targetUserId) return;
    api.getUserProfile(parseInt(targetUserId))
      .then(data => {
        if (data.user) {
          setTargetUser({ ...data.user, followers: data.stats?.followers ?? 0, following: data.stats?.following ?? 0, posts: data.stats?.posts ?? 0 });
        }
      })
      .catch(() => showToast("加载用户失败", "error"));
    getUserPosts(parseInt(targetUserId)).then(posts => setTargetPosts(posts));
  }, [isViewingOther, targetUserId, getUserPosts, showToast]);

  if (!user && !isViewingOther) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">请先登录</h2>
          <p className="text-gray-400 text-sm mb-6">登录后查看个人主页</p>
          <button onClick={() => setShowLogin(true)} className="bg-[#e05d6f] text-white font-bold text-sm px-8 py-3 rounded-full hover:bg-[#c94d5e] transition-colors">
            去登录
          </button>
        </div>
      </div>
    );
  }

  const handleSaveBio = async () => {
    try {
      const data = await api.updateMe({ bio });
      updateUser({ bio: data.user.bio });
      showToast("简介已更新", "success");
      setEditingBio(false);
    } catch {
      showToast("保存失败，请稍后重试", "error");
    }
  };

  const profileUser = isViewingOther ? targetUser : user;
  const profilePosts = isViewingOther ? targetPosts : userPosts;

  const tabs: { key: Tab; label: string; count: number }[] = isViewingOther
    ? [{ key: "posts", label: "TA的发布", count: profilePosts.length }]
    : [
      { key: "posts", label: "我的发布", count: userPosts.length },
      { key: "collection", label: "我的收集", count: myCollects.length },
      { key: "likes", label: "我的喜欢", count: myLikes.length },
    ];

  const currentCards = activeTab === "posts" ? profilePosts : activeTab === "collection" ? myCollects : myLikes;

  return (
    <div className="min-h-screen bg-[#f8f8f8] pb-20">
      {/* Back nav */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-3xl mx-auto flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">返回</span>
          </button>
          <h1 className="flex-1 text-center font-bold text-gray-800 text-sm">个人主页</h1>
          <button className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Profile header */}
      <div className="max-w-3xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Cover */}
          <div className="h-32 bg-gradient-to-r from-[#e05d6f] via-[#f0a0a8] to-[#e8b4c0] relative">
            <div className="absolute -bottom-10 left-6">
              <img src={profileUser?.avatar} alt="" className="w-20 h-20 rounded-full border-4 border-white shadow-md bg-white" />
            </div>
          </div>

          {/* Profile info */}
          <div className="pt-14 px-6 pb-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-lg">{profileUser?.nickname}</h2>
                <p className="text-xs text-gray-400 mt-0.5">@{profileUser?.username}</p>
              </div>
              {isViewingOther ? (
                <button
                  onClick={() => toggleFollow(parseInt(targetUserId!))}
                  className={cn(
                    "px-5 py-2 rounded-full text-xs font-bold transition-colors shadow-sm",
                    isFollowing(parseInt(targetUserId!))
                      ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      : "bg-[#e05d6f] text-white hover:bg-[#c94d5e]"
                  )}
                >
                  {isFollowing(parseInt(targetUserId!)) ? "已关注" : "+ 关注"}
                </button>
              ) : (
                <button
                  onClick={() => navigate("/publish")}
                  className="flex items-center gap-1.5 bg-[#e05d6f] text-white text-xs font-bold px-4 py-2 rounded-full hover:bg-[#c94d5e] transition-colors shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  发布
                </button>
              )}
            </div>

            {/* Bio */}
            {isViewingOther ? (
              <p className="text-sm text-gray-600 mt-3">{profileUser?.bio || "这个人很懒，什么都没写~"}</p>
            ) : editingBio ? (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  maxLength={100}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 text-gray-700"
                  autoFocus
                />
                <button onClick={handleSaveBio} className="px-3 py-2 bg-[#e05d6f] text-white text-xs font-bold rounded-xl">保存</button>
                <button onClick={() => { setBio(user?.bio ?? ""); setEditingBio(false); }} className="px-3 py-2 bg-gray-100 text-gray-600 text-xs rounded-xl">取消</button>
              </div>
            ) : (
              <p onClick={() => setEditingBio(true)} className="text-sm text-gray-600 mt-3 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1 -mx-2 transition-colors">
                {bio || "点击编辑简介..."}
                <svg className="w-3 h-3 inline ml-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-6 mt-4">
              <div className="text-center">
                <p className="font-bold text-gray-800">{profilePosts.length}</p>
                <p className="text-xs text-gray-400">发布</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-800">{profileUser?.followers ?? 0}</p>
                <p className="text-xs text-gray-400">粉丝</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-800">{profileUser?.following ?? 0}</p>
                <p className="text-xs text-gray-400">关注</p>
              </div>
              {!isViewingOther && (
                <div className="text-center">
                  <p className="font-bold text-gray-800">{tabs[1].count}</p>
                  <p className="text-xs text-gray-400">收集</p>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 mt-5 -mx-6 px-6">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex-1 text-center py-3 text-sm font-medium transition-all relative",
                    activeTab === tab.key ? "text-[#e05d6f]" : "text-gray-400 hover:text-gray-600",
                  )}
                >
                  {tab.label}
                  <span className="ml-1 text-xs bg-gray-100 px-1.5 py-0.5 rounded-full">{tab.count}</span>
                  {activeTab === tab.key && (
                    <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#e05d6f] rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Posts grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          {currentCards.length > 0 ? (
            currentCards.map(card => (
              <MiniCard key={card.id} card={card} onCardClick={setSelectedCard} />
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-20 gap-3">
              <div className="text-5xl">{activeTab === "collection" ? "📌" : activeTab === "likes" ? "❤️" : "📝"}</div>
              <p className="text-gray-400 text-sm">
                {activeTab === "collection"
                  ? "还没有收集内容哦，去首页逛逛吧～"
                  : activeTab === "likes"
                  ? "还没有喜欢的内容哦，去首页逛逛吧～"
                  : "还没有发布内容哦～"}
              </p>
              {activeTab === "posts" && (
                <button onClick={() => navigate("/publish")} className="text-sm text-[#e05d6f] hover:underline font-medium">
                  去发布第一篇 →
                </button>
              )}
              {(activeTab === "collection" || activeTab === "likes") && (
                <button onClick={() => navigate("/")} className="text-sm text-[#e05d6f] hover:underline font-medium">
                  去首页逛逛 →
                </button>
              )}
            </div>
          )}
        </div>

        {currentCards.length > 0 && (
          <p className="text-center text-gray-300 text-sm py-8">— 更多内容敬请期待 —</p>
        )}
      </div>

      {/* Detail modal for profile cards */}
      {selectedCard && (
        <ProfileDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}

// ─── Lightweight detail modal for profile page ───────────────────────────────
function ProfileDetailModal({ card, onClose }: { card: ImageCard; onClose: () => void }) {
  const { user, setShowLogin } = useAuth();
  const { isCollected, isLiked, toggleCollect, toggleLike, getLikeCount, getCollectCount, comments, addComment, deleteComment, likeComment, isFollowing, toggleFollow } = useCollection();

  const liked = isLiked(card.id);
  const collected = isCollected(card.id);
  const likeCount = getLikeCount(card.id, card.likes);
  const collectCount = getCollectCount(card.id, card.collects);
  const cardComments = comments[card.id] ?? [];
  const commentCount = cardComments.length;

  const [commentText, setCommentText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const requireAuth = () => {
    if (!user) { setShowLogin(true); return true; }
    return false;
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl overflow-hidden w-full max-w-3xl max-h-[95vh] shadow-2xl flex flex-col md:flex-row animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Left - Image */}
        <div className="relative md:w-1/2 bg-gray-100 flex-shrink-0 max-h-[40vh] md:max-h-full overflow-hidden">
          <img src={card.src} alt={card.title} className="w-full h-full object-cover" />
        </div>

        {/* Right - Content */}
        <div className="md:w-1/2 flex flex-col overflow-hidden">
          {/* Author */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              <img src={card.avatar} alt={card.author} className="w-10 h-10 rounded-full bg-gray-200 ring-2 ring-[#f0a0a8]" />
              <div>
                <p className="font-semibold text-gray-800 text-sm">{card.author}</p>
                <p className="text-xs text-gray-400">分享了这张图片</p>
              </div>
              {user && card.authorId && user.id !== card.authorId && (
                <button
                  onClick={() => toggleFollow(card.authorId!)}
                  className={cn(
                    "ml-2 px-3 py-1 rounded-full text-xs font-bold transition-colors",
                    isFollowing(card.authorId!)
                      ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      : "bg-[#e05d6f] text-white hover:bg-[#c94d5e]"
                  )}
                >
                  {isFollowing(card.authorId!) ? "已关注" : "+ 关注"}
                </button>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Title & tags */}
          <div className="px-4 pt-4 pb-2 shrink-0">
            <h2 className="font-bold text-gray-800 text-base mb-2">{card.title}</h2>
            <div className="flex flex-wrap gap-1.5">
              {card.tags.map(tag => (
                <span key={tag} className="text-xs bg-[#fde8eb] text-[#e05d6f] px-3 py-1 rounded-full font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <span>💬 评论区</span>
              <span className="text-xs text-gray-400 font-normal">({commentCount})</span>
            </p>
            {cardComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="text-3xl">💭</div>
                <p className="text-sm text-gray-400">还没有评论，来说点什么吧~</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cardComments.map(c => (
                  <div key={c.id}>
                    {deleteConfirmId === c.id ? (
                      <div className="flex gap-2.5">
                        <img src={c.avatar} alt={c.author} className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                        <div className="bg-red-50 rounded-2xl px-4 py-3 flex-1">
                          <p className="text-sm text-red-600 mb-2">确定删除这条评论吗？</p>
                          <div className="flex gap-2">
                            <button onClick={() => { deleteComment(card.id, c.id); setDeleteConfirmId(null); }} className="text-xs bg-red-500 text-white px-3 py-1 rounded-full hover:bg-red-600">删除</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full hover:bg-gray-300">取消</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2.5 group/comment">
                        <img src={c.avatar} alt={c.author} className="w-8 h-8 rounded-full bg-gray-100 shrink-0 ring-1 ring-gray-200" />
                        <div className="flex-1 min-w-0">
                          <div className="bg-gray-50 rounded-2xl rounded-tl-none px-3 py-2">
                            <p className="text-xs font-semibold text-gray-700 mb-0.5">{c.author}</p>
                            <p className="text-sm text-gray-600 leading-relaxed">{c.content}</p>
                          </div>
                          <div className="flex items-center gap-3 mt-1 ml-2">
                            <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</span>
                            <button
                              onClick={() => { if (!requireAuth()) likeComment(card.id, c.id); }}
                              className={cn(
                                "flex items-center gap-1 text-xs transition-colors",
                                c.liked ? "text-[#e05d6f]" : "text-gray-400 hover:text-[#e05d6f]"
                              )}
                            >
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill={c.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                              </svg>
                              {c.likes > 0 && c.likes}
                            </button>
                            {user?.username === c.author && (
                              <button
                                onClick={() => setDeleteConfirmId(c.id)}
                                className="text-xs text-gray-400 hover:text-red-400 opacity-0 group-hover/comment:opacity-100"
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom action bar */}
          <div className="border-t border-gray-100 p-3 shrink-0 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => { if (!requireAuth()) toggleLike(card.id); }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all",
                  liked
                    ? "bg-[#fde8eb] text-[#e05d6f]"
                    : "bg-gray-100 text-gray-600 hover:bg-[#fde8eb] hover:text-[#e05d6f]",
                )}
              >
                <svg className={cn("w-4 h-4 transition-transform", liked && "scale-110")} viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {likeCount}
              </button>
              <button
                onClick={() => { if (!requireAuth()) toggleCollect(card.id); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-bold transition-all",
                  collected
                    ? "bg-[#d94f60] text-white shadow-md shadow-[#e05d6f]/30"
                    : "bg-[#e05d6f] text-white hover:bg-[#c94d5e] shadow-md shadow-[#e05d6f]/30",
                )}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill={collected ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {collected ? `已收集 ${collectCount}` : `收集图片 ${collectCount}`}
              </button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && commentText.trim() && user) {
                      addComment(card.id, commentText.trim());
                      setCommentText("");
                    }
                  }}
                  placeholder="说点什么吧..."
                  maxLength={200}
                  className="w-full bg-gray-100 rounded-full px-4 py-2.5 pr-16 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 focus:bg-white text-gray-700 transition-all"
                />
                {user && (
                  <img src={user.avatar} alt="" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-200" />
                )}
              </div>
              <button
                onClick={() => {
                  if (!commentText.trim()) return;
                  if (requireAuth()) return;
                  addComment(card.id, commentText.trim());
                  setCommentText("");
                }}
                disabled={!commentText.trim()}
                className={cn(
                  "px-5 py-2.5 rounded-full text-sm font-medium transition-all",
                  commentText.trim()
                    ? "bg-[#e05d6f] text-white hover:bg-[#c94d5e] shadow-sm"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed",
                )}
              >
                发送
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
