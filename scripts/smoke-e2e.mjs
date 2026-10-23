// 端到端冒烟验证脚本（对运行中的后端）
// 用法: node scripts/smoke-e2e.mjs [http://127.0.0.1:3001]
const BASE = process.argv[2] || "http://127.0.0.1:3001";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  √", name, extra); }
  else { fail++; console.log("  ×", name, extra); }
};
const j = (r) => r.json();

async function main() {
  // 1) 中文 board 别名查询（旧客户端兼容）
  const zh = await j(await fetch(`${BASE}/api/posts?board=${encodeURIComponent("动漫插画")}`));
  ok("中文标签 board 查询返回 anime 帖", zh.total >= 1 && zh.posts.every(p => p.board === "anime"), `total=${zh.total}`);

  // 2) 英文 key 查询
  const en = await j(await fetch(`${BASE}/api/posts?board=wallpaper`));
  ok("英文 key board 查询正常", en.total >= 1, `total=${en.total}`);

  // 3) 帖子详情带 sizes（真实宽高）
  const det = await j(await fetch(`${BASE}/api/posts/${en.posts[0].id}`));
  ok("详情返回 sizes 数组且含 w/h", Array.isArray(det.post.sizes) && det.post.sizes[0]?.w > 0, JSON.stringify(det.post.sizes));

  // 4) 评论列表从后端可读
  const cm = await j(await fetch(`${BASE}/api/posts/32/comments`));
  ok("已发布帖子评论可加载", cm.comments.length >= 1 && cm.comments[0].author_nickname, `count=${cm.comments.length}`);

  // 5) 注册 → 点赞 → 计数为绝对值（回归"虚高"缺陷）
  const username = "e2e_" + Date.now();
  const reg = await j(await fetch(`${BASE}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "123456", nickname: "E2E验证" }),
  }));
  const auth = { Authorization: "Bearer " + reg.token };
  const baseLikes = det.post.likes_count;
  const like1 = await j(await fetch(`${BASE}/api/posts/${det.post.id}/like`, { method: "POST", headers: auth }));
  const like2 = await j(await fetch(`${BASE}/api/posts/${det.post.id}/like`, { method: "POST", headers: auth }));
  ok("点赞返回 base+1 / 取消返回 base", like1.count === baseLikes + 1 && like2.count === baseLikes, `${baseLikes} → ${like1.count} → ${like2.count}`);

  // 6) 评论点赞返回 is_liked 字段（前端 normalizeComment 依赖）
  const myComment = await j(await fetch(`${BASE}/api/posts/${det.post.id}/comments`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "端到端验证评论" }),
  }));
  const cLike = await j(await fetch(`${BASE}/api/comments/${myComment.comment.id}/like`, { method: "POST", headers: auth }));
  ok("评论点赞 toggle 计数正确", cLike.liked === true && cLike.count === 1);
  const cmList = await j(await fetch(`${BASE}/api/posts/${det.post.id}/comments`, { headers: auth }));
  const mine = cmList.comments.find(c => c.id === myComment.comment.id);
  ok("评论列表回带 is_liked 状态", mine && mine.is_liked === true);

  // 7) 发布带 sizes → 列表原样返回
  const created = await j(await fetch(`${BASE}/api/posts`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "E2E 尺寸测试", board: "壁纸头像", // 故意提交中文，验证后端归一化
      images: ["/uploads/x.jpg", "/uploads/y.jpg"], tags: ["测试"],
      sizes: [{ w: 512, h: 768 }, { w: 512, h: 512 }],
    }),
  }));
  ok("中文 board 发布被归一化为 wallpaper", created.post.board === "wallpaper", created.post.board);
  ok("sizes 原样持久化并返回", created.post.sizes?.[0]?.w === 512 && created.post.sizes?.[1]?.h === 512);

  // 8) 他人评论不可删除（权限按 id 判定，非昵称）
  const delOthers = await fetch(`${BASE}/api/comments/${cm.comments[0].id}`, { method: "DELETE", headers: auth });
  ok("删除他人评论被 403 拒绝", delOthers.status === 403, `status=${delOthers.status}`);

  // 9) 清理：删除本次测试产生的评论/帖子
  await fetch(`${BASE}/api/comments/${myComment.comment.id}`, { method: "DELETE", headers: auth });
  await fetch(`${BASE}/api/posts/${created.post.id}`, { method: "DELETE", headers: auth });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error("FATAL", e); process.exit(1); });
