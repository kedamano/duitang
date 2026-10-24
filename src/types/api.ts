/**
 * 前后端共享的 API 类型定义。
 *
 * 这些类型与 docs/openapi.json 中的 schemas 一一对应，
 * 由 scripts/gen-openapi.mjs 的元数据派生而来（手工维护时请同步两边）。
 * 后端为纯 JS，运行时无法校验；这里的类型是编译期的前后端契约。
 */

export interface ApiError {
  error: string;
}

export interface UserBrief {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
}

export interface User extends UserBrief {
  bio: string;
  is_admin?: boolean;
  posts?: number;
  followers?: number;
  following?: number;
  collections?: number;
}

export interface UserStats {
  posts: number;
  followers: number;
  following: number;
  collects: number;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface PostSize {
  w: number;
  h: number;
}

export interface ImageVariant {
  url: string;
  width: number;
  /** 防盗链签名（服务端动态下发，不入库） */
  sign?: string | null;
}

export interface Post {
  id: number;
  title: string;
  description: string;
  board: string;
  images: string[];
  thumbs: string[];
  tags: string[];
  sizes: PostSize[];
  likes_count: number;
  collects_count: number;
  comments_count: number;
  shares_count: number;
  author_id: number;
  author_nickname: string;
  author_avatar: string;
  is_liked?: boolean;
  is_collected?: boolean;
  image_signs?: (string | null)[];
  variant_signs?: ImageVariant[][];
}

export interface PostList {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
}

export interface Comment {
  id: number;
  post_id: number;
  content: string;
  author_id: number;
  author_nickname: string;
  author_avatar: string;
  likes_count: number;
  is_liked: boolean;
  parent_id: number;
  reply_count?: number;
  replies?: Comment[];
  reply_to_nickname?: string;
}

export interface CommentList {
  comments: Comment[];
  total: number;
  total_all?: number;
  page: number;
  limit: number;
}

export interface Album {
  id: number;
  title: string;
  description: string;
  is_public: boolean;
  /** 专辑内图片数（列表接口返回） */
  post_count?: number;
  cover?: string;
  created_at?: string;
}

export interface AlbumList {
  albums: Album[];
  total: number;
  page: number;
  limit: number;
}

export interface AlbumDetail {
  album: Album;
  owner: UserBrief;
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  owned_by_me: boolean;
}

export interface Notification {
  id: number;
  type: "like" | "collect" | "comment" | "comment_like" | "reply" | "follow" | "mention";
  is_read: boolean;
  created_at: string;
  post_id: number | null;
  comment_id: number | null;
  actor: UserBrief;
  post_title: string;
  post_cover: string;
  comment_excerpt: string;
}

export interface NotificationList {
  notifications: Notification[];
  total: number;
  unread: number;
  page: number;
  limit: number;
}

export interface Report {
  id: number;
  reporter_id: number;
  reporter_nickname: string;
  target_type: "post" | "comment" | "user";
  target_id: number;
  target_preview: string;
  reason: string;
  status: "pending" | "resolved" | "rejected";
  created_at: string;
}

export interface NotifyPrefs {
  prefs: Record<string, boolean | "followers">;
  types: string[];
}

export interface Trending {
  searches: { tag: string; count: number }[];
  tags: { tag: string; count: number }[];
  authors: (UserBrief & { post_count: number; score: number })[];
  new_users: UserBrief[];
}

export interface UploadResult {
  url: string;
  thumb: string;
  mid: string;
  variants: ImageVariant[];
  watermarked?: string | null;
  sign?: string;
  width: number;
  height: number;
}

/** 分页查询参数 */
export interface PageQuery {
  page?: number;
  limit?: number;
}
