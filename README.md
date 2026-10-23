# 堆糖（duitang）— 高清图片兴趣社区

一个仿「堆糖」的图片收集社区：瀑布流浏览、收集（收藏）、点赞、评论、关注、发布图文、AI 生成配图。
前端 React 19 + Vite 7 + Tailwind CSS 4，后端 Express + SQLite（Node 内置 `node:sqlite`，零原生依赖）。

## 功能

- **首页**：错落瀑布流（按图片真实宽高分配列高）、分类导航（12 个画板）、关键词搜索、Banner 轮播、热门话题侧栏、分页加载
- **帖子详情**：多图浏览、点赞 / 收集 / 分享（复制链接、微博）、评论区（加载、发表、点赞、删除）、关注作者、删除自己的帖子
- **独立分享页**：`/#/pin/<id>` 直达某条帖子，可被搜索引擎外分享
- **发布**：拖拽 / 点选上传图片（最多 9 张）、AI 生成图片（Pollinations，经 Vite 代理）、画板与标签选择
- **个人主页**：我的发布 / 收集 / 喜欢三个分组、编辑资料（头像上传、昵称、简介）、查看他人主页与关注
- **账号**：用户名密码注册登录，JWT（7 天）持久会话

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
  components/       Header / 登录注册弹窗 / AI 生图弹窗 / PostDetail(共享详情组件)
  context/          Auth / Collection(点赞收藏评论关注) / Toast
  pages/            HomePage / PublishPage / ProfilePage / PostDetailPage
  utils/            normalizePost（后端→前端唯一转换入口）、cn
server/             后端
  index.js          Express 路由（auth/posts/likes/collects/comments/follows/upload）
  database.js       node:sqlite 建表 + 轻量迁移（列补齐、中文 board → 英文 key）
  seed-demo.js      演示数据（30 帖 / 5 用户 / 评论 / 关注），仅默认库且空表时执行
  uploads/          图片上传目录（magic bytes 校验，仅 JPG/PNG/WebP/GIF）
scripts/
  smoke-e2e.mjs     对运行中后端的端到端冒烟脚本（node scripts/smoke-e2e.mjs）
```

## 测试与构建

```bash
npm test              # 前端 vitest（21 用例）
npm run build         # 前端生产构建（vite-plugin-singlefile → dist/index.html）
cd server && npm test # 后端 mocha + supertest（29 用例，独立测试库）
npx tsc --noEmit      # 类型检查
node scripts/smoke-e2e.mjs [http://127.0.0.1:3001]  # 对运行中后端的端到端冒烟
```

## 约定与说明

- **画板（board）统一存英文 key**（`wallpaper/anime/...`）；后端兼容中文标签入参与查询并自动归一化，旧库数据由 `database.js` 启动时迁移。
- **图片尺寸**：发布时前端测量真实宽高随 `sizes` 提交，列表/详情原样返回，用于瀑布流列高分配；历史数据缺省回落 400×300。
- **点赞/收藏/分享计数**接口返回的是**绝对总数**，前端直接覆盖基准值，不做增量叠加。
- 上传与静态资源经 `/uploads` 由后端提供；开发环境 Vite 代理 `/api` 与 `/uploads` 到后端。
- 生产部署：`npm run build` 产出单文件 `dist/index.html`，配合 `server/.env`（参考 `.env.example`，务必更换 `JWT_SECRET`、设置 `FRONTEND_ORIGIN`）。

## 开发路线（可选）

- 关注流（Following feed）与消息通知
- 画板分组页与标签聚合页
- 帖子编辑、图片九宫格详情页大图预览
- 服务端分页的个人主页收集/喜欢列表
