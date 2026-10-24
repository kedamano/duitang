import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { api } from "../api";
import type { ImageCard } from "../data/images";
import { normalizePost } from "../utils/normalizePost";

export interface Comment {
  id: number;
  post_id: number;
  content: string;
  author_id: number;
  author: string;          // nickname
  avatar: string;          // author avatar
  likes: number;
  liked: boolean;
  created_at: string;
}

/** 后端评论 → 前端 Comment（统一 liked / likes 字段名） */
function normalizeComment(c: any): Comment {
  const author = c.author_nickname || "匿名";
  return {
    id: c.id,
    post_id: c.post_id,
    content: c.content,
    author_id: c.author_id,
    author,
    avatar: c.author_avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(author)}&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4`,
    likes: c.likes_count || 0,
    liked: !!c.is_liked,
    created_at: c.created_at,
  };
}

interface CollectionContextType {
  comments: Record<number, Comment[]>;
  commentsLoaded: Record<number, boolean>;
  loadComments: (postId: number) => Promise<void>;
  likeCounts: Record<number, number>;
  collectCounts: Record<number, number>;
  likedIds: Set<number>;
  collectedIds: Set<number>;
  userPosts: ImageCard[];
  isLiked: (id: number) => boolean;
  isCollected: (id: number) => boolean;
  getLikeCount: (id: number, base: number) => number;
  getCollectCount: (id: number, base: number) => number;
  getCommentCount: (id: number, base?: number) => number;
  getShareCount: (id: number, base?: number) => number;
  toggleLike: (id: number) => void;
  toggleCollect: (id: number) => void;
  addComment: (postId: number, content: string) => void;
  deleteComment: (postId: number, commentId: number) => void;
  likeComment: (postId: number, commentId: number) => void;
  sharePost: (id: number) => void;
  deletePost: (id: number) => Promise<boolean>;
  isFollowing: (id: number) => boolean;
  toggleFollow: (userId: number) => void;
  getUserPosts: (userId: number) => Promise<ImageCard[]>;
  getMyCollects: () => Promise<ImageCard[]>;
  getMyLikes: () => Promise<ImageCard[]>;
  addUserPost: (post: any) => void;
  updateUserPost: (post: any) => void;
  removeUserPost: (postId: number) => void;
}

const CollectionContext = createContext<CollectionContextType | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [collectedIds, setCollectedIds] = useState<Set<number>>(new Set());
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [commentsLoaded, setCommentsLoaded] = useState<Record<number, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<number, number>>({});
  const [collectCounts, setCollectCounts] = useState<Record<number, number>>({});
  const [shareCounts, setShareCounts] = useState<Record<number, number>>({});
  const [followingIds, setFollowingIds] = useState<Set<number>>(new Set());
  const [userPosts, setUserPosts] = useState<ImageCard[]>([]);

  // 用户登录时同步互动状态；登出时清空，避免卡片仍显示"已赞/已收藏"
  useEffect(() => {
    if (!token) {
      setLikedIds(new Set());
      setCollectedIds(new Set());
      setFollowingIds(new Set());
      setUserPosts([]);
      return;
    }
    Promise.all([
      api.myInteractions(),
      api.myPosts(),
    ]).then(([interactions, postsData]) => {
      setLikedIds(new Set(interactions.liked || []));
      setCollectedIds(new Set(interactions.collected || []));
      setFollowingIds(new Set(interactions.following || []));
      setUserPosts((postsData.posts || []).map(normalizePost));
    }).catch(() => {});
  }, [token]);

  const isLiked = useCallback((id: number) => likedIds.has(id), [likedIds]);
  const isCollected = useCallback((id: number) => collectedIds.has(id), [collectedIds]);
  const isFollowing = useCallback((id: number) => followingIds.has(id), [followingIds]);

  const toggleFollow = useCallback(async (userId: number) => {
    if (!token) return;
    try {
      const data = await api.followUser(userId);
      setFollowingIds(prev => {
        const next = new Set(prev);
        if (data.following) next.add(userId); else next.delete(userId);
        return next;
      });
      showToast(data.following ? "已关注" : "已取消关注", "success");
    } catch { showToast("操作失败，请稍后重试", "error"); }
  }, [token, showToast]);

  // 后端返回的是绝对总数，直接覆盖基准值（避免 base + total 造成翻倍虚高）
  const getLikeCount = useCallback(
    (id: number, base: number) => likeCounts[id] ?? base,
    [likeCounts],
  );
  const getCollectCount = useCallback(
    (id: number, base: number) => collectCounts[id] ?? base,
    [collectCounts],
  );
  const getCommentCount = useCallback(
    (id: number, base = 0) => (commentsLoaded[id] ? (comments[id] || []).length : base),
    [comments, commentsLoaded],
  );
  const getShareCount = useCallback(
    (id: number, base = 0) => shareCounts[id] ?? base,
    [shareCounts],
  );

  const toggleLike = useCallback(async (id: number) => {
    if (!token) return;
    try {
      const data = await api.likePost(id);
      setLikedIds(prev => {
        const next = new Set(prev);
        if (data.liked) next.add(id); else next.delete(id);
        return next;
      });
      setLikeCounts(prev => ({ ...prev, [id]: data.count }));
    } catch { showToast("操作失败，请稍后重试", "error"); }
  }, [token, showToast]);

  const toggleCollect = useCallback(async (id: number) => {
    if (!token) return;
    try {
      const data = await api.collectPost(id);
      setCollectedIds(prev => {
        const next = new Set(prev);
        if (data.collected) next.add(id); else next.delete(id);
        return next;
      });
      setCollectCounts(prev => ({ ...prev, [id]: data.count }));
    } catch { showToast("操作失败，请稍后重试", "error"); }
  }, [token, showToast]);

  /** 打开详情时加载该帖评论（公开接口，游客也可浏览；写操作仍需登录） */
  const loadComments = useCallback(async (postId: number) => {
    try {
      const data = await api.getComments(postId);
      setComments(prev => ({ ...prev, [postId]: (data.comments || []).map(normalizeComment) }));
      setCommentsLoaded(prev => ({ ...prev, [postId]: true }));
    } catch { showToast("评论加载失败", "error"); }
  }, [showToast]);

  const addComment = useCallback(async (postId: number, content: string) => {
    if (!token) return;
    try {
      const data = await api.addComment(postId, content);
      const normalized = normalizeComment(data.comment);
      setComments(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), normalized],
      }));
      setCommentsLoaded(prev => ({ ...prev, [postId]: true }));
    } catch { showToast("操作失败，请稍后重试", "error"); }
  }, [token, showToast]);

  const deleteComment = useCallback(async (postId: number, commentId: number) => {
    if (!token) return;
    try {
      await api.deleteComment(commentId);
      setComments(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter(c => c.id !== commentId),
      }));
    } catch { showToast("操作失败，请稍后重试", "error"); }
  }, [token, showToast]);

  const likeComment = useCallback(async (postId: number, commentId: number) => {
    if (!token) return;
    try {
      const data = await api.likeComment(commentId);
      setComments(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).map(c =>
          c.id === commentId ? { ...c, liked: data.liked, likes: data.count } : c
        ),
      }));
    } catch { showToast("操作失败，请稍后重试", "error"); }
  }, [token, showToast]);

  const sharePost = useCallback(async (id: number) => {
    if (!token) return;
    try {
      const data = await api.sharePost(id);
      setShareCounts(prev => ({ ...prev, [id]: data.count }));
    } catch { showToast("分享失败，请稍后重试", "error"); }
  }, [token, showToast]);

  const deletePost = useCallback(async (id: number): Promise<boolean> => {
    if (!token) return false;
    try {
      await api.deletePost(id);
      setUserPosts(prev => prev.filter(p => p.id !== id));
      showToast("帖子已删除", "success");
      return true;
    } catch {
      showToast("删除失败，请稍后重试", "error");
      return false;
    }
  }, [token, showToast]);

  const getUserPosts = useCallback(async (userId: number): Promise<ImageCard[]> => {
    try {
      const data = await api.getPosts({ user_id: userId });
      return (data.posts || []).map(normalizePost);
    } catch { return []; }
  }, []);

  const getMyCollects = useCallback(async (): Promise<ImageCard[]> => {
    if (!token) return [];
    try {
      const data = await api.myCollects();
      return (data.posts || []).map(normalizePost);
    } catch { return []; }
  }, [token]);

  const getMyLikes = useCallback(async (): Promise<ImageCard[]> => {
    if (!token) return [];
    try {
      const data = await api.myLikes();
      return (data.posts || []).map(normalizePost);
    } catch { return []; }
  }, [token]);

  const addUserPost = useCallback((post: any) => {
    setUserPosts(prev => [normalizePost(post), ...prev]);
  }, []);

  /** 编辑保存后同步本地列表，避免回到首页还看到旧标题 */
  const updateUserPost = useCallback((post: any) => {
    const updated = normalizePost(post);
    setUserPosts(prev => prev.map(p => (p.id === updated.id ? { ...p, ...updated } : p)));
  }, []);

  const removeUserPost = useCallback((postId: number) => {
    setUserPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  return (
    <CollectionContext.Provider value={{
      comments, commentsLoaded, loadComments,
      likeCounts, collectCounts,
      likedIds, collectedIds, userPosts,
      isLiked, isCollected, getLikeCount, getCollectCount,
      getCommentCount, getShareCount,
      toggleLike, toggleCollect, addComment, deleteComment, likeComment, sharePost, deletePost,
      isFollowing, toggleFollow,
      getUserPosts, getMyCollects, getMyLikes, addUserPost, updateUserPost, removeUserPost,
    }}>
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollection() {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error("useCollection must be used within CollectionProvider");
  return ctx;
}
