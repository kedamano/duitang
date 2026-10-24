const API_BASE = '/api';

/** 登录态失效时派发的全局事件，由 AuthContext 监听并弹出登录框 */
export const AUTH_EXPIRED_EVENT = 'duitang:auth-expired';

/** 这些端点的 401 表示"账号或密码错误"，不应触发登出 */
const CREDENTIAL_PATHS = ['/auth/login', '/auth/register'];

/** 这些端点是静默恢复会话用的，401 时只清凭证、不弹登录框打扰用户 */
const SILENT_401_PATHS = ['/auth/me'];

export class AuthExpiredError extends Error {
  constructor() {
    super('登录已过期，请重新登录');
    this.name = 'AuthExpiredError';
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('duitang_token');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(API_BASE + url, { ...options, headers });

  // token 过期 / 被吊销：清掉本地凭证并通知全局，避免界面仍是"已登录"但操作全失败
  if (res.status === 401 && !CREDENTIAL_PATHS.some(p => url.startsWith(p))) {
    localStorage.removeItem('duitang_token');
    if (!SILENT_401_PATHS.some(p => url.startsWith(p))) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new AuthExpiredError();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/** my/* 列表的分页参数（后端默认 100，供个人主页一次展示） */
function pageQuery(params?: { page?: number; limit?: number }): string {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  return qs.toString();
}

export const api = {
  // ─── Auth ───
  register: (data: { username: string; nickname?: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { username: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<{ user: any; stats: any }>('/auth/me'),

  // ─── Posts ───
  getPosts: (params?: { page?: number; limit?: number; board?: string; user_id?: number; q?: string; tag?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.board) qs.set('board', params.board);
    if (params?.user_id) qs.set('user_id', String(params.user_id));
    if (params?.q) qs.set('q', params.q);
    if (params?.tag) qs.set('tag', params.tag);
    return request<{ posts: any[]; total: number; page: number; limit: number }>(`/posts?${qs}`);
  },
  getPost: (id: number) => request<{ post: any }>(`/posts/${id}`),
  createPost: (data: {
    title: string;
    description: string;
    board: string;
    images: string[];
    tags: string[];
    /** 与 images 一一对应的真实宽高，用于瀑布流错落布局 */
    sizes?: { w: number; h: number }[];
  }) => request<{ post: any }>('/posts', { method: 'POST', body: JSON.stringify(data) }),
  /** 编辑帖子（仅作者本人；只传要改的字段） */
  updatePost: (id: number, data: { title?: string; description?: string; board?: string; tags?: string[] }) =>
    request<{ post: any }>(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePost: (id: number) => request(`/posts/${id}`, { method: 'DELETE' }),

  // ─── Tags ───
  getTags: (limit = 30) => request<{ tags: { tag: string; count: number }[] }>(`/tags?limit=${limit}`),

  // ─── Notifications ───
  getNotifications: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<{ notifications: any[]; total: number; unread: number; page: number; limit: number }>(`/notifications?${qs}`);
  },
  getUnreadCount: () => request<{ count: number }>('/notifications/unread'),
  /** 不传 ids 即全部标记已读 */
  markNotificationsRead: (ids?: number[]) =>
    request<{ ok: boolean; unread: number }>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {}),
    }),

  // ─── Likes ───
  likePost: (id: number) => request<{ liked: boolean; count: number }>(`/posts/${id}/like`, { method: 'POST' }),

  // ─── Collects ───
  collectPost: (id: number) => request<{ collected: boolean; count: number }>(`/posts/${id}/collect`, { method: 'POST' }),

  // ─── Comments ───
  getComments: (postId: number) => request<{ comments: any[] }>(`/posts/${postId}/comments`),
  addComment: (postId: number, content: string) =>
    request<{ comment: any }>(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteComment: (id: number) => request(`/comments/${id}`, { method: 'DELETE' }),
  likeComment: (id: number) => request<{ liked: boolean; count: number }>(`/comments/${id}/like`, { method: 'POST' }),

  // ─── Users ───
  getUserProfile: (id: number) => request<{ user: any; stats: any; is_following: boolean }>(`/users/${id}/profile`),
  followUser: (id: number) => request<{ following: boolean }>(`/users/${id}/follow`, { method: 'POST' }),
  searchUsers: (q: string) => request<{ users: any[] }>(`/users?q=${encodeURIComponent(q)}`),

  // ─── My ───
  myCollects: (params?: { page?: number; limit?: number }) =>
    request<{ posts: any[]; total: number; page: number; limit: number }>(`/my/collects?${pageQuery(params)}`),
  myLikes: (params?: { page?: number; limit?: number }) =>
    request<{ posts: any[]; total: number; page: number; limit: number }>(`/my/likes?${pageQuery(params)}`),
  myPosts: (params?: { page?: number; limit?: number }) =>
    request<{ posts: any[]; total: number; page: number; limit: number }>(`/my/posts?${pageQuery(params)}`),

  // ─── My (continued) ───
  myFollowing: () => request<{ ids: number[] }>('/my/following'),

  /** 点赞/收藏/关注的 ID 集合（轻量，登录时同步用，免拉完整帖子体） */
  myInteractions: () =>
    request<{ liked: number[]; collected: number[]; following: number[] }>('/my/interactions'),

  // ─── Feed ──
  getFollowingFeed: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<{ posts: any[]; total: number; page: number; limit: number }>(`/feed/following?${qs}`);
  },

  // ─── Share ───
  sharePost: (id: number) => request<{ shared: boolean; count: number }>(`/posts/${id}/share`, { method: 'POST' }),
  getShareCount: (id: number) => request<{ count: number }>(`/posts/${id}/share`),

  // ─── Self update ───
  updateMe: (data: { nickname?: string; bio?: string; avatar?: string }) =>
    request<{ user: any }>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

  // ─── Upload ───
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ url: string }>('/upload', { method: 'POST', body: fd });
  },
};
