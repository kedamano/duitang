/**
 * OpenAPI 3.0 规范生成器。
 * 从一份路由元数据生成规范，避免手写 YAML 与实现脱节。
 * 用法: node scripts/gen-openapi.mjs [输出路径]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = process.argv[2] || path.join(root, "docs", "openapi.json");

/** 通用响应结构 */
const errorResponse = {
  description: "错误",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
};

/**
 * 路由元数据：method, path, summary, tags, auth, query, body, response
 * 只收录对外主要接口；内部/调试接口不在此列。
 */
const routes = [
  { method: "get", path: "/api/health", tags: ["system"], summary: "健康检查", response: { type: "object", properties: { ok: { type: "boolean" }, uptime: { type: "number" } } } },

  { method: "post", path: "/api/auth/register", tags: ["auth"], summary: "注册", body: { required: true, schema: { $ref: "#/components/schemas/RegisterInput" } }, response: { $ref: "#/components/schemas/AuthResult" } },
  { method: "post", path: "/api/auth/login", tags: ["auth"], summary: "登录", body: { required: true, schema: { $ref: "#/components/schemas/LoginInput" } }, response: { $ref: "#/components/schemas/AuthResult" } },
  { method: "get", path: "/api/auth/me", tags: ["auth"], summary: "当前用户信息", auth: true, response: { type: "object", properties: { user: { $ref: "#/components/schemas/User" }, stats: { $ref: "#/components/schemas/UserStats" } } } },
  { method: "patch", path: "/api/users/me", tags: ["auth"], summary: "更新个人资料", auth: true, body: { required: true, schema: { $ref: "#/components/schemas/UpdateMeInput" } }, response: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } },
  { method: "get", path: "/api/users", tags: ["users"], summary: "搜索用户", query: [{ name: "q", in: "query", required: true, schema: { type: "string" } }], response: { type: "object", properties: { users: { type: "array", items: { $ref: "#/components/schemas/UserBrief" } } } } },
  { method: "get", path: "/api/users/{id}/profile", tags: ["users"], summary: "用户主页信息", pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object" } },
  { method: "post", path: "/api/users/{id}/follow", tags: ["users"], summary: "关注/取关", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object", properties: { following: { type: "boolean" } } } },
  { method: "post", path: "/api/users/{id}/block", tags: ["users"], summary: "拉黑/解除拉黑", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object", properties: { blocked: { type: "boolean" } } } },
  { method: "get", path: "/api/my/blocks", tags: ["users"], summary: "我的拉黑列表", auth: true, response: { type: "object", properties: { ids: { type: "array", items: { type: "integer" } } } } },

  { method: "get", path: "/api/posts", tags: ["posts"], summary: "帖子列表（分页/筛选/搜索）", query: [
    { name: "page", in: "query", schema: { type: "integer", default: 1 } },
    { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
    { name: "board", in: "query", schema: { type: "string", description: "画板英文 key" } },
    { name: "tag", in: "query", schema: { type: "string" } },
    { name: "q", in: "query", schema: { type: "string" } },
    { name: "user_id", in: "query", schema: { type: "integer" } },
  ], response: { $ref: "#/components/schemas/PostList" } },
  { method: "get", path: "/api/posts/{id}", tags: ["posts"], summary: "帖子详情", pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object", properties: { post: { $ref: "#/components/schemas/Post" } } } },
  { method: "post", path: "/api/posts", tags: ["posts"], summary: "发布帖子", auth: true, body: { required: true, schema: { $ref: "#/components/schemas/CreatePostInput" } }, response: { type: "object", properties: { post: { $ref: "#/components/schemas/Post" } } } },
  { method: "put", path: "/api/posts/{id}", tags: ["posts"], summary: "编辑帖子（仅作者）", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], body: { required: true, schema: { $ref: "#/components/schemas/UpdatePostInput" } }, response: { type: "object", properties: { post: { $ref: "#/components/schemas/Post" } } } },
  { method: "delete", path: "/api/posts/{id}", tags: ["posts"], summary: "删除帖子（仅作者）", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object", properties: { ok: { type: "boolean" } } } },
  { method: "post", path: "/api/posts/{id}/like", tags: ["interactions"], summary: "点赞/取消", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object", properties: { liked: { type: "boolean" }, count: { type: "integer" } } } },
  { method: "post", path: "/api/posts/{id}/collect", tags: ["interactions"], summary: "收藏/取消（可带 album_id 一并归入专辑）", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], body: { schema: { type: "object", properties: { album_id: { type: "integer" } } } }, response: { type: "object" } },
  { method: "post", path: "/api/posts/{id}/share", tags: ["interactions"], summary: "分享计数", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object" } },
  { method: "get", path: "/api/posts/{id}/comments", tags: ["comments"], summary: "评论列表（顶层分页 + 楼中楼）", pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], query: [{ name: "page", in: "query", schema: { type: "integer" } }, { name: "limit", in: "query", schema: { type: "integer" } }], response: { $ref: "#/components/schemas/CommentList" } },
  { method: "post", path: "/api/posts/{id}/comments", tags: ["comments"], summary: "发表评论或回复", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], body: { required: true, schema: { $ref: "#/components/schemas/CreateCommentInput" } }, response: { type: "object" } },
  { method: "get", path: "/api/comments/{id}/replies", tags: ["comments"], summary: "某评论的更多回复", pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { $ref: "#/components/schemas/CommentList" } },
  { method: "post", path: "/api/comments/{id}/like", tags: ["comments"], summary: "评论点赞", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object" } },
  { method: "delete", path: "/api/comments/{id}", tags: ["comments"], summary: "删除评论（仅作者）", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object" } },

  { method: "get", path: "/api/feed/following", tags: ["feed"], summary: "关注流", auth: true, response: { $ref: "#/components/schemas/PostList" } },
  { method: "get", path: "/api/trending", tags: ["feed"], summary: "首页聚合（热搜/话题/作者/新人）", response: { type: "object" } },
  { method: "get", path: "/api/tags", tags: ["tags"], summary: "热门标签", response: { type: "object" } },

  { method: "get", path: "/api/my/interactions", tags: ["me"], summary: "我的互动 ID 集合", auth: true, response: { type: "object" } },
  { method: "get", path: "/api/my/posts", tags: ["me"], summary: "我的发布", auth: true, response: { $ref: "#/components/schemas/PostList" } },
  { method: "get", path: "/api/my/collects", tags: ["me"], summary: "我的收藏", auth: true, response: { $ref: "#/components/schemas/PostList" } },
  { method: "get", path: "/api/my/likes", tags: ["me"], summary: "我的点赞", auth: true, response: { $ref: "#/components/schemas/PostList" } },
  { method: "get", path: "/api/my/following", tags: ["me"], summary: "我关注的人", auth: true, response: { type: "object" } },
  { method: "get", path: "/api/my/draft", tags: ["me"], summary: "读取我的草稿", auth: true, response: { type: "object" } },
  { method: "put", path: "/api/my/draft", tags: ["me"], summary: "保存我的草稿", auth: true, body: { required: true, schema: { type: "object", properties: { payload: { type: "object" } } } }, response: { type: "object" } },
  { method: "delete", path: "/api/my/draft", tags: ["me"], summary: "删除我的草稿", auth: true, response: { type: "object" } },
  { method: "get", path: "/api/my/notify-prefs", tags: ["me"], summary: "读取通知偏好", auth: true, response: { type: "object" } },
  { method: "patch", path: "/api/users/me/notify-prefs", tags: ["me"], summary: "保存通知偏好", auth: true, body: { required: true, schema: { type: "object" } }, response: { type: "object" } },

  { method: "get", path: "/api/albums/{id}", tags: ["albums"], summary: "专辑详情", pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object" } },
  { method: "post", path: "/api/albums", tags: ["albums"], summary: "创建专辑", auth: true, body: { required: true, schema: { $ref: "#/components/schemas/CreateAlbumInput" } }, response: { type: "object" } },
  { method: "patch", path: "/api/albums/{id}", tags: ["albums"], summary: "编辑专辑", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], body: { required: true, schema: { type: "object" } }, response: { type: "object" } },
  { method: "delete", path: "/api/albums/{id}", tags: ["albums"], summary: "删除专辑", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object" } },
  { method: "post", path: "/api/albums/{id}/posts", tags: ["albums"], summary: "收进专辑", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], body: { required: true, schema: { type: "object", properties: { post_id: { type: "integer" } } } }, response: { type: "object" } },
  { method: "delete", path: "/api/albums/{id}/posts/{postId}", tags: ["albums"], summary: "移出专辑", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }, { name: "postId", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object" } },
  { method: "get", path: "/api/users/{id}/albums", tags: ["albums"], summary: "某人的专辑", pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], response: { type: "object" } },
  { method: "get", path: "/api/my/albums", tags: ["albums"], summary: "我的专辑", auth: true, response: { type: "object" } },

  { method: "get", path: "/api/notifications", tags: ["notifications"], summary: "通知列表", auth: true, response: { type: "object" } },
  { method: "get", path: "/api/notifications/unread", tags: ["notifications"], summary: "未读数", auth: true, response: { type: "object", properties: { count: { type: "integer" } } } },
  { method: "post", path: "/api/notifications/read", tags: ["notifications"], summary: "标记已读", auth: true, body: { schema: { type: "object", properties: { ids: { type: "array", items: { type: "integer" } } } } }, response: { type: "object" } },
  { method: "delete", path: "/api/notifications", tags: ["notifications"], summary: "清空通知", auth: true, response: { type: "object" } },
  { method: "get", path: "/api/notifications/stream", tags: ["notifications"], summary: "SSE 实时通知流", query: [{ name: "token", in: "query", required: true, schema: { type: "string" } }], response: { type: "string", description: "text/event-stream" } },

  { method: "post", path: "/api/reports", tags: ["moderation"], summary: "提交举报", auth: true, body: { required: true, schema: { $ref: "#/components/schemas/ReportInput" } }, response: { type: "object" } },
  { method: "get", path: "/api/admin/reports", tags: ["moderation"], summary: "举报队列（管理员）", auth: true, query: [{ name: "status", in: "query", schema: { type: "string", enum: ["pending", "resolved", "rejected"] } }], response: { type: "object" } },
  { method: "post", path: "/api/admin/reports/{id}/resolve", tags: ["moderation"], summary: "处理举报（管理员）", auth: true, pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], body: { required: true, schema: { type: "object", properties: { action: { type: "string", enum: ["delete", "reject"] } } } }, response: { type: "object" } },

  { method: "post", path: "/api/upload", tags: ["upload"], summary: "上传图片", auth: true, requestBody: { content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } }, required: ["file"] } } } }, response: { $ref: "#/components/schemas/UploadResult" } },
];

const schemas = {
  Error: { type: "object", properties: { error: { type: "string" } } },
  UserBrief: { type: "object", properties: { id: { type: "integer" }, username: { type: "string" }, nickname: { type: "string" }, avatar: { type: "string" } } },
  User: { type: "object", properties: { id: { type: "integer" }, username: { type: "string" }, nickname: { type: "string" }, avatar: { type: "string" }, bio: { type: "string" }, is_admin: { type: "boolean" } } },
  UserStats: { type: "object", properties: { posts: { type: "integer" }, followers: { type: "integer" }, following: { type: "integer" }, collects: { type: "integer" } } },
  RegisterInput: { type: "object", required: ["username", "password"], properties: { username: { type: "string", minLength: 3 }, password: { type: "string", minLength: 6 }, nickname: { type: "string" } } },
  LoginInput: { type: "object", required: ["username", "password"], properties: { username: { type: "string" }, password: { type: "string" } } },
  AuthResult: { type: "object", properties: { token: { type: "string" }, user: { $ref: "#/components/schemas/User" } } },
  UpdateMeInput: { type: "object", properties: { nickname: { type: "string" }, bio: { type: "string" }, avatar: { type: "string" } } },
  PostSize: { type: "object", properties: { w: { type: "number" }, h: { type: "number" } } },
  Post: { type: "object", properties: {
    id: { type: "integer" }, title: { type: "string" }, description: { type: "string" },
    board: { type: "string" }, images: { type: "array", items: { type: "string" } },
    thumbs: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } },
    sizes: { type: "array", items: { $ref: "#/components/schemas/PostSize" } },
    likes_count: { type: "integer" }, collects_count: { type: "integer" }, comments_count: { type: "integer" }, shares_count: { type: "integer" },
    author_id: { type: "integer" }, author_nickname: { type: "string" }, author_avatar: { type: "string" },
    is_liked: { type: "boolean" }, is_collected: { type: "boolean" },
  } },
  PostList: { type: "object", properties: { posts: { type: "array", items: { $ref: "#/components/schemas/Post" } }, total: { type: "integer" }, page: { type: "integer" }, limit: { type: "integer" } } },
  CreatePostInput: { type: "object", required: ["title", "images"], properties: {
    title: { type: "string" }, description: { type: "string" }, board: { type: "string" },
    images: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 9 },
    tags: { type: "array", items: { type: "string" }, maxItems: 5 },
    sizes: { type: "array", items: { $ref: "#/components/schemas/PostSize" } },
    thumbs: { type: "array", items: { type: "string" } },
  } },
  UpdatePostInput: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, board: { type: "string" }, tags: { type: "array", items: { type: "string" } } } },
  Comment: { type: "object", properties: {
    id: { type: "integer" }, post_id: { type: "integer" }, content: { type: "string" },
    author_id: { type: "integer" }, author_nickname: { type: "string" }, author_avatar: { type: "string" },
    likes_count: { type: "integer" }, is_liked: { type: "boolean" },
    parent_id: { type: "integer" }, reply_count: { type: "integer" }, replies: { type: "array", items: { $ref: "#/components/schemas/Comment" } },
  } },
  CommentList: { type: "object", properties: { comments: { type: "array", items: { $ref: "#/components/schemas/Comment" } }, total: { type: "integer" }, total_all: { type: "integer" }, page: { type: "integer" }, limit: { type: "integer" } } },
  CreateCommentInput: { type: "object", required: ["content"], properties: { content: { type: "string" }, parent_id: { type: "integer" } } },
  CreateAlbumInput: { type: "object", required: ["title"], properties: { title: { type: "string", maxLength: 40 }, description: { type: "string", maxLength: 200 }, is_public: { type: "boolean" } } },
  Album: { type: "object", properties: { id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, is_public: { type: "boolean" }, post_count: { type: "integer" }, cover: { type: "string" }, created_at: { type: "string" } } },
  AlbumList: { type: "object", properties: { albums: { type: "array", items: { $ref: "#/components/schemas/Album" } }, total: { type: "integer" }, page: { type: "integer" }, limit: { type: "integer" } } },
  ReportInput: { type: "object", required: ["target_type", "target_id"], properties: { target_type: { type: "string", enum: ["post", "comment", "user"] }, target_id: { type: "integer" }, reason: { type: "string" } } },
  Report: { type: "object", properties: { id: { type: "integer" }, reporter_id: { type: "integer" }, reporter_nickname: { type: "string" }, target_type: { type: "string", enum: ["post", "comment", "user"] }, target_id: { type: "integer" }, target_preview: { type: "string" }, reason: { type: "string" }, status: { type: "string", enum: ["pending", "resolved", "rejected"] }, created_at: { type: "string" } } },
  Notification: { type: "object", properties: { id: { type: "integer" }, type: { type: "string", enum: ["like", "collect", "comment", "comment_like", "reply", "follow", "mention"] }, is_read: { type: "boolean" }, created_at: { type: "string" }, post_id: { type: "integer", nullable: true }, comment_id: { type: "integer", nullable: true }, actor: { $ref: "#/components/schemas/UserBrief" }, post_title: { type: "string" }, post_cover: { type: "string" }, comment_excerpt: { type: "string" } } },
  NotificationList: { type: "object", properties: { notifications: { type: "array", items: { $ref: "#/components/schemas/Notification" } }, total: { type: "integer" }, unread: { type: "integer" }, page: { type: "integer" }, limit: { type: "integer" } } },
  NotifyPrefs: { type: "object", properties: { prefs: { type: "object", additionalProperties: { oneOf: [{ type: "boolean" }, { type: "string", enum: ["followers"] }] } }, types: { type: "array", items: { type: "string" } } } },
  Trending: { type: "object", properties: { searches: { type: "array", items: { type: "object", properties: { tag: { type: "string" }, count: { type: "integer" } } } }, tags: { type: "array", items: { type: "object", properties: { tag: { type: "string" }, count: { type: "integer" } } } }, authors: { type: "array", items: { $ref: "#/components/schemas/UserBrief" } }, new_users: { type: "array", items: { $ref: "#/components/schemas/UserBrief" } } } },
  UploadResult: { type: "object", properties: {
    url: { type: "string" }, thumb: { type: "string" }, mid: { type: "string" },
    variants: { type: "array", items: { type: "object", properties: { url: { type: "string" }, width: { type: "number" }, sign: { type: "string" } } } },
    watermarked: { type: "string" }, sign: { type: "string" }, width: { type: "number" }, height: { type: "number" },
  } },
};

const paths = {};
for (const r of routes) {
  const params = [...(r.pathParams || []), ...(r.query || [])];
  const operation = {
    tags: r.tags,
    summary: r.summary,
    responses: {
      200: { description: "成功", content: { "application/json": { schema: r.response || { type: "object" } } } },
      400: errorResponse,
      401: errorResponse,
      403: errorResponse,
      404: errorResponse,
    },
  };
  if (r.auth) operation.security = [{ bearerAuth: [] }];
  if (params.length) operation.parameters = params;
  if (r.body) {
    operation.requestBody = {
      required: !!r.body.required,
      content: { "application/json": { schema: r.body.schema || { type: "object" } } },
    };
  }
  if (r.requestBody) operation.requestBody = r.requestBody;

  const p = r.path;
  paths[p] = paths[p] || {};
  paths[p][r.method] = operation;
}

const spec = {
  openapi: "3.0.3",
  info: {
    title: "堆糖 Duitang API",
    version: "1.0.0",
    description: "堆糖图片社区后端接口规范。由 scripts/gen-openapi.mjs 依据路由元数据生成。",
  },
  servers: [{ url: "http://localhost:3001", description: "本地开发" }],
  tags: [
    { name: "system", description: "系统" }, { name: "auth", description: "认证" },
    { name: "users", description: "用户" }, { name: "posts", description: "帖子" },
    { name: "interactions", description: "点赞/收藏/分享" }, { name: "comments", description: "评论与楼中楼" },
    { name: "feed", description: "信息流" }, { name: "tags", description: "标签" },
    { name: "me", description: "我的" }, { name: "albums", description: "专辑" },
    { name: "notifications", description: "通知" }, { name: "moderation", description: "举报与审核" },
    { name: "upload", description: "上传" },
  ],
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas,
  },
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(spec, null, 2) + "\n");
console.log(`OpenAPI 规范已生成: ${path.relative(root, outFile)}（${routes.length} 个接口）`);
