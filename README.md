# 堆糖（duitang）— 高清图片兴趣社区

一个仿「堆糖」的图片收集社区：瀑布流浏览、收集（收藏）、点赞、评论、关注、发布图文、AI 生成配图。
前端 React 19 + Vite 7 + Tailwind CSS 4，后端 Express + SQLite（Node 内置 `node:sqlite`，零原生依赖）。

## 功能

- **首页**：错落瀑布流（按图片真实宽高分配列高）、分类导航（12 个画板）、**关注流**、关键词搜索、Banner 轮播、**热门话题（真实标签统计）**、分页加载
- **发现页**：`/#/discover` 热门作者（按近 30 天互动量）、热门话题、新鲜面孔，解决关注流冷启动
- **帖子详情**：多图浏览与大图预览（灯箱，支持 ←/→/Esc）、点赞 / 收集 / 分享（复制链接、微博）、**评论区楼中楼**（发表、回复、点赞、删除；回复默认折叠、点击展开，支持分页加载；支持 `**加粗**`、`*斜体*`、`` `行内代码` `` 等轻量格式，正文里的 @昵称 高亮并可点击跳转搜索）、关注作者、删除与编辑自己的帖子、**举报**与**拉黑作者**
- **独立分享页**：`/#/pin/<id>` 直达某条帖子，可被搜索引擎外分享
- **发布**：**富文本描述**（TipTap：加粗/斜体/删除线/小标题/列表/引用/代码/链接）、拖拽 / 点选上传图片（最多 9 张，**自动生成 400/800 两档尺寸变体**、**可拖拽排序与指定封面**）、AI 生成图片（Pollinations，经 Vite 代理）、画板与标签选择、可选归入专辑、**草稿自动保存到服务端**（换设备也能继续编辑）
- **专辑（收藏夹）**：用户自建专辑，收藏/发布时可归入；`/#/album/<id>` 专辑详情页；支持公开/私密、改名与删除
- **关注流**：导航「关注」标签展示已关注作者与自己的帖子（时间倒序、分页）；未登录显示登录引导，无关注显示空状态与去首页入口；关注标签下搜索会自动切回推荐
- **消息通知**：顶部铃铛 + 未读角标，**SSE 实时推送**（断线自动回落轮询，窗口聚焦也会刷新）；点赞 / 收藏 / 评论 / 赞评论 / 回复 / 关注 / **@提及** 都会通知对应作者（自己不通知自己，取消操作与删除评论会自动撤回），面板支持加载更多与一键清空，点击跳转到对应帖子或用户
- **通知设置**：个人菜单中可按键关闭某类通知，或设为**「仅关注的人」**（后端写入前按关注关系判定，含 SSE 推送）
- **社区治理**：帖子/评论/用户可**举报**（同一对象只保留一条待处理）；管理员有**审核队列**（`/#/admin/reports`）可删除违规内容或驳回；**拉黑**后看不到对方帖子、评论与关注流内容；**敏感词自动打码**（帖子标题/描述/评论/专辑名）
- **帖子编辑**：作者可在详情页编辑标题、富文本描述、画板与标签，保存后详情与列表就地更新，图片与尺寸保持不变
- **标签聚合页**：`/#/tag/<标签名>` 展示该标签下的图片（分页 + 相关标签推荐），卡片与详情页标签均可点击跳转
- **画板分组页**：`/#/board/<key>` 按画板浏览（分页 + 其他画板切换），可直接分享某个分类
- **个人主页**：我的发布 / 收集 / 喜欢 / **我的专辑**四个分组（服务端分页 + 加载更多）、编辑资料（头像上传、昵称、简介）、粉丝与关注列表可点击查看、查看他人主页与关注
- **账号**：用户名密码注册登录，JWT（7 天）持久会话；token 失效时自动登出并引导重新登录
- **体验**：首屏骨架屏（不再闪现空状态）、搜索防抖 300ms、列表图片懒加载 + **srcset 响应式选档**（400/800/原图）、发布页草稿自动保存与恢复、上传前 10MB 体积预检、评论区按页加载、**热搜来自真实搜索统计**
- **工程**：`npm run verify` 一键跑完 OpenAPI 生成/类型检查/前后端单测/构建，附 GitHub Actions 配置；后端测试用 `npm run test:server` **逐文件独立进程**运行（避免共享 sqlite 连接导致的原生崩溃与数据串库），每次运行前清理旧测试库
- **接口契约**：`docs/openapi.json` 由 `node scripts/gen-openapi.mjs` 从路由元数据生成（53 个接口），`src/types/api.ts` 是与之对应的前端共享类型；两者的一致性由 `src/types/api.test.ts` 守护
- **防盗链与水印**：上传时生成 400/800 两档变体与带站点水印的副本（`_wm.jpg`）；开启 `UPLOAD_HOTLINK_PROTECT=1` 后图片需带 HMAC 签名访问，签名由服务端按文件名实时下发（带过期时间，不入库）

## 快速开始

要求 Node.js ≥ 22（`node:sqlite` 内置模块）。

```bash
# 1. 后端（默认 http://localhost:3001，首次启动自动建库并灌入演示数据）
cd server
npm install
npm run dev

# 2. 前端（另一个终端，默认 http://localhost:5173）
npm install
npm run dev
```

打开 http://localhost:5173 即可浏览；演示账号（密码均 `123456`）：
`tangyan`（糖小颜）、`tangtu`（糖小兔）、`mochi`、`lvren`、`gufeng`。

后端端口被占用时：`$env:PORT=3002; node index.js`，前端再指过去：
`$env:BACKEND_URL="http://localhost:3002"; npm run dev`。

## 项目结构

```
src/                前端
  api/              fetch 封装（JWT 头、错误规范化）
  components/       Header / 登录注册弹窗 / AI 生图弹窗 / PostDetail(共享详情组件) / MasonryGrid / NotificationBell / NotifyPrefsModal / EditPostModal / FollowListModal / ImageLightbox / Icons(统一 SVG 图标库) / AlbumPickerModal / CreateAlbumModal / RichTextEditor / RichTextContent
  context/          Auth / Collection(点赞收藏评论关注) / Toast
  hooks/            useTrending（热搜/话题/作者聚合，模块级缓存）
  pages/            HomePage / PublishPage / ProfilePage / PostDetailPage / TagPage / BoardPage / AlbumPage / DiscoverPage / AdminReportsPage
  utils/            normalizePost（后端→前端唯一转换入口）、mention（@解析与高亮）、richText（富文本消毒与摘要）、searchEvent、useDebouncedValue、formatTime、cn
server/             后端
  index.js          Express 路由（auth/posts/likes/collects/comments/follows/feed/notifications/tags/trending/albums/reports/blocks/draft/upload）
  database.js       node:sqlite 建表 + 轻量迁移（列补齐、中文 board → 英文 key）
  sensitive-words.js 敏感词表与打码（可用 SENSITIVE_WORDS 覆盖）
  upload-guard.js   上传防盗链（HMAC 签名 / Referer 校验）与水印生成
  seed-demo.js      演示数据（30 帖 / 5 用户 / 评论 / 关注），仅默认库且空表时执行
  backfill-thumbs.js 为历史上传图片补生成尺寸变体（400/800）并回填 thumbs / images_variants
  uploads/          图片上传目录（magic bytes 校验，仅 JPG/PNG/WebP/GIF）
scripts/
  smoke-e2e.mjs     对运行中后端的端到端冒烟脚本（node scripts/smoke-e2e.mjs）
  e2e-shot.mjs      旧版单文件 E2E（保留作参考，已由 scripts/e2e/ 拆分替代）
  e2e-all.mjs       跑全部 E2E 脚本（npm run test:e2e）
  e2e/harness.mjs   E2E 共享驱动（CDP 连接、登录、断言、截图、接口调用）
  e2e/core.mjs      首页 / 详情 / 通知 SSE
  e2e/publish.mjs   发布 / 富文本 / 多图 / 草稿 / 专辑 / 敏感词
  e2e/social.mjs    楼中楼 / @提及 / 关注流 / 通知偏好 / 标签画板 / 灯箱
  e2e/moderation.mjs 发现页 / 举报 / 审核队列 / 拉黑
  verify-feed.mjs   关注流页面与接口一致性校验
  verify-all.mjs    一键跑全部质量关卡（npm run verify）
  run-server-tests.mjs  后端测试隔离运行器（逐文件独立进程）
  gen-openapi.mjs   生成 docs/openapi.json
.github/workflows/ci.yml  CI 配置（安装依赖 → npm run verify）
docs/
  openapi.json      OpenAPI 3.0 规范（自动生成）
```

## 测试与构建

```bash
npm run verify        # 一键：OpenAPI 生成 → 类型检查 → 前端单测 → 后端单测 → 生产构建
npm test              # 前端 vitest（109 用例）
npm run build         # 前端生产构建（vite-plugin-singlefile → dist/index.html）
npm run test:server   # 后端 mocha + supertest（逐文件独立进程，14 个文件 / 160+ 用例）
npx tsc --noEmit      # 类型检查
node scripts/smoke-e2e.mjs [http://127.0.0.1:3001]  # 对运行中后端的端到端冒烟
```

浏览器端到端验证（需先启动前后端；反复登录会触发 auth 限流，建议用
`$env:RATE_LIMIT_DISABLED="1"` 启动后端）：

```bash
npm run test:e2e                  # 跑全部拆分后的 E2E（core / publish / social / moderation）
node scripts/e2e-all.mjs social   # 只跑指定脚本
node scripts/verify-feed.mjs      # 关注流页面与接口一致性校验
```
```

## 约定与说明

- **画板（board）统一存英文 key**（`wallpaper/anime/...`）；后端兼容中文标签入参与查询并自动归一化，旧库数据由 `database.js` 启动时迁移。
- **图片尺寸**：发布时前端测量真实宽高随 `sizes` 提交，列表/详情原样返回，用于瀑布流列高分配；历史数据缺省回落 400×300。
- **图片尺寸变体**：上传时用纯 JS 的 `jimp` 生成 400/800 两档变体（保持「零原生依赖」），原图始终保留为最高档；`posts.images_variants` 与 `images` 一一对应，前端据此拼 `srcset` 让浏览器按需选档（卡片用 400 档、详情用最高档）。缺失时回落原图。历史上传用 `node server/backfill-thumbs.js` 回填。
- **互动状态**：列表接口（`/posts`、`/feed/following`、`/my/*`）会为登录用户附带 `is_liked` / `is_collected`；登录时另用轻量接口 `/my/interactions` 同步 ID 集合，不再拉取完整帖子体。
- **通知去重**：点赞/收藏/关注/赞评论按「接收者 + 触发者 + 类型 + 目标」唯一，反复操作不会堆积；取消操作或删除评论会同步撤回对应通知。
- **实时通知**：`GET /api/notifications/stream?token=` 为 SSE 长连接，写入通知时即时推送未读数；EventSource 无法自定义请求头，因此 token 走 query。连接异常自动回落为 60s 轮询。
- **通知偏好**：`users.notify_prefs` 存 JSON，取值 `true`（全部）/ `false`（关闭）/ `"followers"`（仅关注的人），例如 `{"like":false,"comment":"followers"}`；写入通知前即拦截，因此 SSE 也不会推送被关闭或不满足关注条件的类型。
- **楼中楼**：评论只有一层嵌套，回复的回复统一挂到顶层评论下（`comments.parent_id`），列表接口给顶层评论内嵌前 3 条回复与 `reply_count`；前端默认折叠回复，点击展开，回复超过已加载部分可分页加载。
- **@ 提及**：评论正文中的 `@昵称` 会通知被提到者（类型 `mention`），前端高亮为可点击链接，点击跳转到首页并以该昵称为关键词搜索。
- **评论格式**：评论不存 HTML（因此没有 XSS 面），改支持行内标记 `**加粗**` / `*斜体*` / `` `代码` ``，与 @提及 共存；服务端会剥掉粘贴进来的 HTML 标签并截断到 1000 字。
- **富文本描述**：帖子描述用 TipTap 编辑，存 HTML；后端 `sanitize-html` 按白名单（p/br/strong/em/u/s/ul/ol/li/a/blockquote/code/pre/h3/h4）清洗并强制链接 `rel="noopener noreferrer"`，前端渲染前再用 DOMPurify 过滤一遍。历史纯文本描述按原样渲染（保留换行），不会被当 HTML 解析。
- **专辑**：`albums` + `album_posts` 两张表，同一张图可进多个专辑；私密专辑仅本人可见（列表过滤 + 详情 403）；收藏接口可带 `album_id` 一并归入（只接受自己的专辑）。
- **热搜/话题**：`search_queries` 记录首页搜索词（仅关键词、长度≥2），热搜取近 7 天统计；不足 8 条时用热门标签补齐。热门作者按近 30 天作品互动量排序。
- **搜索为何不用 FTS5**：实测 `node:sqlite` 支持 FTS5 与 trigram 分词，但 trigram 要求查询 ≥3 字符——中文最常用的 `汉服`/`壁纸`/`美食` 都是 2 字，会**搜不到结果**；`unicode61` 又不做中文分词。当前用 `LIKE '%kw%'` 在数据量未过万时更快且无召回损失，故暂不引入 FTS5。
- **点赞/收藏/分享计数**接口返回的是**绝对总数**，前端直接覆盖基准值，不做增量叠加。
- **管理员**：`users.is_admin` 标记，每次请求查库判定（权限撤销后旧 token 立即失效）；默认 `tangyan` 为管理员，可用 `ADMIN_USERNAMES="a,b"` 覆盖。
- **敏感词**：默认词表仅演示能力（`sensitive-words.js`），命中后以等长 `*` 打码；可用 `SENSITIVE_WORDS` 覆盖。生产环境应替换为完整词库或接入第三方内容安全服务。
- **拉黑**：拉黑后对方的帖子、评论与关注流内容都不再展示（服务端过滤，前端无需特殊处理）。
- **草稿箱**：`drafts` 表每人一份（唯一索引），输入停止 1.2s 后自动写入服务端；进入发布页优先恢复服务端草稿，无服务端草稿时回落到 localStorage；发布成功后自动清除。
- 上传与静态资源经 `/uploads` 由后端提供；开发环境 Vite 代理 `/api` 与 `/uploads` 到后端。
- 生产部署：`npm run build` 产出单文件 `dist/index.html`，配合 `server/.env`（参考 `.env.example`，务必更换 `JWT_SECRET`、设置 `FRONTEND_ORIGIN`）。

## 开发路线（可选）

- 图片上传后生成更多档位（如 1200/1600）与 WebP/AVIF 格式
- 评论支持图片与表情（当前为纯文本 + 行内标记）
- 对象存储 + CDN 替换本地磁盘
- 敏感词替换为完整词库或接入内容安全服务
