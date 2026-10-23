import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { api } from "../api";
import type { ImageCard } from "../data/images";

/** Normalize backend post to ImageCard shape */
function normalizePost(p: any): ImageCard {
  const images = Array.isArray(p.images) ? p.images : (typeof p.images === 'string' ? JSON.parse(p.images) : []);
  const tags = Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? JSON.parse(p.tags) : []);
  return {
    id: p.id,
    src: images[0] || '',
    title: p.title,
    description: p.description || '',
    author: p.author_nickname || '匿名',
    authorId: p.author_id,
    avatar: p.author_avatar || '',
    tags,
    category: p.board || 'all',
    likes: p.likes_count || 0,
    collects: p.collects_count || 0,
    comments: p.comments_count || 0,
    width: 400,
    height: 300,
    is_liked: p.is_liked || false,
    is_collected: p.is_collected || false,
  };
}

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

interface CollectionContextType {
  comments: Record<number, Comment[]>;
  likeDeltas: Record<number, number>;
  collectDeltas: Record<number, number>;
  likedIds: Set<number>;
  collectedIds: Set<number>;
  userPosts: any[];
  isLiked: (id: number) => boolean;
  isCollected: (id: number) => boolean;
  getLikeCount: (id: number, base: number) => number;
  getCollectCount: (id: number, base: number) => number;
  getCommentCount: (id: number) => number;
  getShareCount: (id: number) => number;
  toggleLike: (id: number) => void;
  toggleCollect: (id: number) => void;
  addComment: (postId: number, content: string) => void;
  deleteComment: (postId: number, commentId: number) => void;
  likeComment: (postId: number, commentId: number) => void;
  sharePost: (id: number) => void;
  deletePost: (id: number) => Promise<boolean>;
  isFollowing: (id: number) => boolean;
  toggleFollow: (userId: number) => void;
  getUserPosts: (userId: number) => Promise<any[]>;
  getMyCollects: () => Promise<any[]>;
  getMyLikes: () => Promise<any[]>;
  addUserPost: (post: any) => void;
  removeUserPost: (postId: number) => void;
}

const CollectionContext = createContext<CollectionContextType | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [collectedIds, setCollectedIds] = useState<Set<number>>(new Set());
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [likeDeltas, setLikeDeltas] = useState<Record<number, number>>({});
  const [collectDeltas, setCollectDeltas] = useState<Record<number, number>>({});
  const [shareDeltas, setShareDeltas] = useState<Record<number, number>>({});
  const [followingIds, setFollowingIds] = useState<Set<number>>(new Set());
  const [userPosts, setUserPosts] = useState<ImageCard[]>([]);

  // 用户登录时，从后端同步收藏和点赞
  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.myCollects(),
      api.myLikes(),
      api.myPosts(),
      api.myFollowing(),
    ]).then(([collectsData, likesData, postsData, followingData]) => {
      setCollectedIds(new Set(collectsData.posts.map((p: any) => p.id)));
      setLikedIds(new Set(likesData.posts.map((p: any) => p.id)));
      setUserPosts((postsData.posts || []).map(normalizePost));
      setFollowingIds(new Set(followingData.ids || []));
    }).catch(() => {});
  }, [token, showToast]);

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

  const getLikeCount = useCallback((id: number, base: number) => base + (likeDeltas[id] || 0), [likeDeltas]);
  const getCollectCount = useCallback((id: number, base: number) => base + (collectDeltas[id] || 0), [collectDeltas]);
  const getCommentCount = useCallback((id: number) => (comments[id] || []).length, [comments]);
  const getShareCount = useCallback((id: number) => shareDeltas[id] || 0, [shareDeltas]);

  const toggleLike = useCallback(async (id: number) => {
    if (!token) return;
    try {
      const data = await api.likePost(id);
      setLikedIds(prev => {
        const next = new Set(prev);
        if (data.liked) next.add(id); else next.delete(id);
        return next;
      });
      setLikeDeltas(prev => ({ ...prev, [id]: data.count }));
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
      setCollectDeltas(prev => ({ ...prev, [id]: data.count }));
    } catch { showToast("操作失败，请稍后重试", "error"); }
  }, [token, showToast]);

  const addComment = useCallback(async (postId: number, content: string) => {
    if (!token) return;
    try {
      const data = await api.addComment(postId, content);
      const c = data.comment;
      const normalized: Comment = {
        id: c.id,
        post_id: c.post_id,
        content: c.content,
        author_id: c.author_id,
        author: c.author_nickname || '匿名',
        avatar: c.author_avatar || '',
        likes: c.likes_count || 0,
        liked: false,
        created_at: c.created_at,
      };
      setComments(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), normalized],
      }));
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
          c.id === commentId ? { ...c, is_liked: data.liked, likes_count: data.count } : c
        ),
      }));
    } catch { showToast("操作失败，请稍后重试", "error"); }
  }, [token, showToast]);

  const sharePost = useCallback(async (id: number) => {
    if (!token) return;
    try {
      const data = await api.sharePost(id);
      setShareDeltas(prev => ({ ...prev, [id]: data.count }));
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

  const getUserPosts = useCallback(async (userId: number) => {
    try {
      const data = await api.getPosts({ user_id: userId });
      return data.posts || [];
    } catch { return []; }
  }, []);

  const getMyCollects = useCallback(async (): Promise<ImageCard[]> => {
    if (!token) return [];
    try {
      const data = await api.myCollects();
      return (data.posts || []).map(normalizePost);
    } catch { return []; }
  }, [token, showToast]);

  const getMyLikes = useCallback(async (): Promise<ImageCard[]> => {
    if (!token) return [];
    try {
      const data = await api.myLikes();
      return (data.posts || []).map(normalizePost);
    } catch { return []; }
  }, [token, showToast]);

  const addUserPost = useCallback((post: any) => {
    setUserPosts(prev => [normalizePost(post), ...prev]);
  }, []);

  const removeUserPost = useCallback((postId: number) => {
    setUserPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  return (
    <CollectionContext.Provider value={{
      comments, likeDeltas, collectDeltas,
      likedIds, collectedIds, userPosts,
      isLiked, isCollected, getLikeCount, getCollectCount,
      getCommentCount, getShareCount,
      toggleLike, toggleCollect, addComment, deleteComment, likeComment, sharePost, deletePost,
      isFollowing, toggleFollow,
      getUserPosts, getMyCollects, getMyLikes, addUserPost, removeUserPost,
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
