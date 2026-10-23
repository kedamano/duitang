const API_BASE = '/api';

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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // ─── Auth ───
  register: (data: { username: string; nickname?: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { username: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<{ user: any; stats: any }>('/auth/me'),

  // ─── Posts ───
  getPosts: (params?: { page?: number; limit?: number; board?: string; user_id?: number; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.board) qs.set('board', params.board);
    if (params?.user_id) qs.set('user_id', String(params.user_id));
    if (params?.q) qs.set('q', params.q);
    return request<{ posts: any[]; total: number; page: number; limit: number }>(`/posts?${qs}`);
  },
  getPost: (id: number) => request<{ post: any }>(`/posts/${id}`),
  createPost: (data: { title: string; description: string; board: string; images: string[]; tags: string[] }) =>
    request<{ post: any }>('/posts', { method: 'POST', body: JSON.stringify(data) }),
  deletePost: (id: number) => request(`/posts/${id}`, { method: 'DELETE' }),

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
  myCollects: () => request<{ posts: any[] }>('/my/collects'),
  myLikes: () => request<{ posts: any[] }>('/my/likes'),
  myPosts: () => request<{ posts: any[] }>('/my/posts'),

  // ─── My (continued) ───
  myFollowing: () => request<{ ids: number[] }>('/my/following'),

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
