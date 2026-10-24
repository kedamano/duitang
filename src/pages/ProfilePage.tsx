import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCollection } from "../context/CollectionContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
import { cn } from "../utils/cn";
import { PostDetailModal } from "../components/PostDetail";
import FollowListModal from "../components/FollowListModal";
import { normalizePost } from "../utils/normalizePost";
import { Icon } from "../components/Icons";
import type { ImageCard } from "../data/images";

type Tab = "posts" | "collection" | "likes";

const LIST_PAGE_SIZE = 24;

function MiniCard({ card, onCardClick }: { card: ImageCard; onCardClick?: (card: ImageCard) => void }) {
  const { user, setShowLogin } = useAuth();
  const { isLiked, toggleLike, isCollected, toggleCollect, getLikeCount, getCollectCount } = useCollection();
  const liked = isLiked(card.id);
  const collected = isCollected(card.id);
  const likeCount = getLikeCount(card.id, card.likes);
  const collectCount = getCollectCount(card.id, card.collects);
  const aspectRatio = card.width > 0 && card.height > 0 ? (card.height / card.width) * 100 : 75;

  return (
    <div
      className="group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
      onClick={() => onCardClick?.(card)}
    >
      <div className="relative overflow-hidden bg-gray-100" style={{ paddingBottom: `${aspectRatio}%` }}>
        <img
          src={card.src}
          alt={card.title}
          loading="lazy"
          decoding="async"
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

// ─── 资料编辑面板（头像 + 昵称 + 简介）────────────────────────────────────────
function EditProfilePanel({ onClose }: { onClose: () => void }) {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string>(user?.avatar ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const pickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const save = async () => {
    if (!nickname.trim()) { showToast("昵称不能为空", "error"); return; }
    setSaving(true);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const uploaded = await api.upload(avatarFile);
        avatarUrl = uploaded.url;
      }
      const data = await api.updateMe({
        nickname: nickname.trim(),
        bio,
        ...(avatarUrl ? { avatar: avatarUrl } : {}),
      });
      updateUser({
        nickname: data.user.nickname,
        bio: data.user.bio ?? "",
        avatar: data.user.avatar,
      });
      showToast("资料已更新", "success");
      onClose();
    } catch (err) {
      showToast("保存失败：" + (err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-modal-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-gray-800">编辑资料</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative group"
            title="更换头像"
          >
            <img src={avatarPreview} alt="" className="w-20 h-20 rounded-full bg-gray-100 ring-2 ring-[#f0a0a8] object-cover" />
            <span className="absolute inset-0 rounded-full bg-black/40 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              更换
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={pickAvatar} className="hidden" />
          <p className="text-xs text-gray-400 mt-2">点击头像上传新图片</p>
        </div>

        {/* Nickname */}
        <label className="block text-sm font-medium text-gray-600 mb-1.5">昵称</label>
        <input
          type="text"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={20}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 text-gray-700 mb-4"
        />

        {/* Bio */}
        <label className="block text-sm font-medium text-gray-600 mb-1.5">简介</label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          maxLength={100}
          rows={3}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#e05d6f]/30 text-gray-700 resize-none mb-5"
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving || !nickname.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[#e05d6f] text-white text-sm font-bold hover:bg-[#c94d5e] transition-colors disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, setShowLogin, updateUser } = useAuth();
  const { showToast } = useToast();
  const { userPosts, getUserPosts, isFollowing, toggleFollow } = useCollection();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    (tabParam === "collection" ? "collection" : tabParam === "likes" ? "likes" : "posts") as Tab
  );
  const [bio, setBio] = useState(user?.bio ?? "");
  const [selectedCard, setSelectedCard] = useState<ImageCard | null>(null);
  const [myCollects, setMyCollects] = useState<ImageCard[]>([]);
  const [myLikes, setMyLikes] = useState<ImageCard[]>([]);
  const [collectTotal, setCollectTotal] = useState(0);
  const [likesTotal, setLikesTotal] = useState(0);
  const [loadingMoreList, setLoadingMoreList] = useState(false);
  const [followModal, setFollowModal] = useState<"followers" | "following" | null>(null);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [targetPosts, setTargetPosts] = useState<ImageCard[]>([]);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
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

  // 收集/喜欢分页加载（服务端默认只返回前 100 条，这里显式分页避免静默截断）
  useEffect(() => {
    if (!user || isViewingOther) return;
    let cancelled = false;
    api.myCollects({ page: 1, limit: LIST_PAGE_SIZE })
      .then(d => {
        if (cancelled) return;
        setMyCollects((d.posts || []).map(normalizePost));
        setCollectTotal(d.total ?? (d.posts || []).length);
      })
      .catch(() => {});
    api.myLikes({ page: 1, limit: LIST_PAGE_SIZE })
      .then(d => {
        if (cancelled) return;
        setMyLikes((d.posts || []).map(normalizePost));
        setLikesTotal(d.total ?? (d.posts || []).length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, isViewingOther]);

  const loadMoreList = async () => {
    const isCollection = activeTab === "collection";
    const list = isCollection ? myCollects : myLikes;
    const total = isCollection ? collectTotal : likesTotal;
    if (loadingMoreList || list.length >= total) return;
    setLoadingMoreList(true);
    try {
      const nextPage = Math.floor(list.length / LIST_PAGE_SIZE) + 1;
      const data = isCollection
        ? await api.myCollects({ page: nextPage, limit: LIST_PAGE_SIZE })
        : await api.myLikes({ page: nextPage, limit: LIST_PAGE_SIZE });
      const cards = (data.posts || []).map(normalizePost);
      const merge = (prev: ImageCard[]) => {
        const map = new Map(prev.map(c => [c.id, c]));
        cards.forEach(c => map.set(c.id, c));
        return Array.from(map.values());
      };
      if (isCollection) setMyCollects(merge);
      else setMyLikes(merge);
    } catch {
      showToast("加载更多失败，请稍后重试", "error");
    } finally {
      setLoadingMoreList(false);
    }
  };

  // 查看他人主页: 拉取资料与该用户发帖
  useEffect(() => {
    if (!isViewingOther || !targetUserId) return;
    const uid = parseInt(targetUserId, 10);
    if (!uid) return;
    let cancelled = false;
    api.getUserProfile(uid)
      .then(data => {
        if (cancelled) return;
        if (data.user) {
          setTargetUser({
            ...data.user,
            followers: data.stats?.followers ?? 0,
            following: data.stats?.following ?? 0,
            posts: data.stats?.posts ?? 0,
          });
        }
      })
      .catch(() => showToast("加载用户失败", "error"));
    getUserPosts(uid).then(posts => { if (!cancelled) setTargetPosts(posts); });
    return () => { cancelled = true; };
  }, [isViewingOther, targetUserId, getUserPosts, showToast]);

  if (!user && !isViewingOther) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="text-center">
          <Icon name="lock" className="w-14 h-14 mx-auto mb-4 text-gray-300" />
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
    ? [{ key: "posts", label: "TA的发布", count: targetPosts.length }]
    : [
      { key: "posts", label: "我的发布", count: userPosts.length },
      { key: "collection", label: "我的收集", count: collectTotal },
      { key: "likes", label: "我的喜欢", count: likesTotal },
    ];

  const currentCards = activeTab === "posts" ? profilePosts : activeTab === "collection" ? myCollects : myLikes;
  const postCount = isViewingOther ? (profileUser?.posts ?? profilePosts.length) : userPosts.length;

  return (
    <div className="min-h-screen bg-[#f8f8f8] pb-20">
      {/* Back nav */}
      <div className="sticky top-14 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-3xl mx-auto flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">返回</span>
          </button>
          <h1 className="flex-1 text-center font-bold text-gray-800 text-sm">个人主页</h1>
          {!isViewingOther && (
            <button
              onClick={() => setShowEditPanel(true)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              title="编辑资料"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35.39-.13.818-.018 1.193.186z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Profile header */}
      <div className="max-w-3xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Cover */}
          <div className="h-32 bg-gradient-to-r from-[#e05d6f] via-[#f0a0a8] to-[#e8b4c0] relative">
            <div className="absolute -bottom-10 left-6">
              <img src={profileUser?.avatar} alt="" className="w-20 h-20 rounded-full border-4 border-white shadow-md bg-white object-cover" />
            </div>
          </div>

          {/* Profile info */}
          <div className="pt-14 px-6 pb-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-bold text-gray-800 text-lg truncate">{profileUser?.nickname ?? "加载中..."}</h2>
                <p className="text-xs text-gray-400 mt-0.5 truncate">@{profileUser?.username}</p>
              </div>
              {isViewingOther ? (
                <button
                  onClick={() => targetUserId && toggleFollow(parseInt(targetUserId, 10))}
                  className={cn(
                    "px-5 py-2 rounded-full text-xs font-bold transition-colors shadow-sm shrink-0",
                    targetUserId && isFollowing(parseInt(targetUserId, 10))
                      ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      : "bg-[#e05d6f] text-white hover:bg-[#c94d5e]"
                  )}
                >
                  {targetUserId && isFollowing(parseInt(targetUserId, 10)) ? "已关注" : "+ 关注"}
                </button>
              ) : (
                <button
                  onClick={() => navigate("/publish")}
                  className="flex items-center gap-1.5 bg-[#e05d6f] text-white text-xs font-bold px-4 py-2 rounded-full hover:bg-[#c94d5e] transition-colors shadow-sm shrink-0"
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
                <p className="font-bold text-gray-800">{postCount}</p>
                <p className="text-xs text-gray-400">发布</p>
              </div>
              <button
                onClick={() => setFollowModal("followers")}
                className="text-center hover:opacity-70 transition-opacity"
                aria-label={`查看粉丝（${profileUser?.followers ?? 0}）`}
              >
                <p className="font-bold text-gray-800">{profileUser?.followers ?? 0}</p>
                <p className="text-xs text-gray-400">粉丝</p>
              </button>
              <button
                onClick={() => setFollowModal("following")}
                className="text-center hover:opacity-70 transition-opacity"
                aria-label={`查看关注（${profileUser?.following ?? 0}）`}
              >
                <p className="font-bold text-gray-800">{profileUser?.following ?? 0}</p>
                <p className="text-xs text-gray-400">关注</p>
              </button>
              {!isViewingOther && (
                <div className="text-center">
                  <p className="font-bold text-gray-800">{collectTotal}</p>
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
              <div className="text-5xl">
              <Icon
                name={activeTab === "collection" ? "bookmark" : activeTab === "likes" ? "heart" : "edit"}
                className="w-12 h-12 text-gray-300"
              />
            </div>
              <p className="text-gray-400 text-sm">
                {activeTab === "collection"
                  ? "还没有收集内容哦，去首页逛逛吧～"
                  : activeTab === "likes"
                  ? "还没有喜欢的内容哦，去首页逛逛吧～"
                  : "还没有发布内容哦～"}
              </p>
              {activeTab === "posts" && !isViewingOther && (
                <button onClick={() => navigate("/publish")} className="text-sm text-[#e05d6f] hover:underline font-medium flex items-center gap-1">
                  去发布第一篇 <Icon name="arrowRight" className="w-4 h-4" />
                </button>
              )}
              {(activeTab === "collection" || activeTab === "likes") && (
                <button onClick={() => navigate("/")} className="text-sm text-[#e05d6f] hover:underline font-medium flex items-center gap-1">
                  去首页逛逛 <Icon name="arrowRight" className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {currentCards.length > 0 && (activeTab === "collection" || activeTab === "likes") &&
          currentCards.length < (activeTab === "collection" ? collectTotal : likesTotal) && (
            <div className="flex justify-center py-6">
              <button
                onClick={loadMoreList}
                disabled={loadingMoreList}
                className="px-6 py-2 rounded-full bg-white border border-gray-200 text-sm text-gray-600 hover:border-[#e05d6f] hover:text-[#e05d6f] disabled:opacity-60 transition-colors"
              >
                {loadingMoreList ? "加载中..." : "加载更多"}
              </button>
            </div>
          )}

        {currentCards.length > 0 &&
          !((activeTab === "collection" || activeTab === "likes") &&
            currentCards.length < (activeTab === "collection" ? collectTotal : likesTotal)) && (
            <p className="text-center text-gray-300 text-sm py-8 flex items-center justify-center gap-1.5">
              — 已经到底啦 <Icon name="flower" className="w-4 h-4 inline" /> —
            </p>
          )}
      </div>

      {/* 编辑资料（头像 / 昵称 / 简介）*/}
      {showEditPanel && !isViewingOther && <EditPanelWrapper onClose={() => setShowEditPanel(false)} />}

      {/* 粉丝 / 关注列表 */}
      {followModal && profileUser && (
        <FollowListModal
          userId={profileUser.id}
          mode={followModal}
          onClose={() => setFollowModal(null)}
        />
      )}

      {/* Detail modal for profile cards */}
      {selectedCard && (
        <PostDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}

/** key 保证每次打开都重新初始化表单状态 */
function EditPanelWrapper({ onClose }: { onClose: () => void }) {
  return <EditProfilePanel key={Date.now()} onClose={onClose} />;
}
