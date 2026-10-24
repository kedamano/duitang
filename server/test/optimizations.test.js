const { describe, it, before, after } = require('mocha');
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

process.env.DB_PATH = path.join(__dirname, 'optimizations.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

async function makeImage(w, h) {
  const img = new Jimp(w, h, 0x3366ffff);
  return img.getBufferAsync(Jimp.MIME_JPEG);
}

describe('Duitang API - 缩略图链路', function () {
  let token = '';
  const created = [];
  const auth = () => ({ Authorization: 'Bearer ' + token });

  before(async () => {
    const stamp = Date.now();
    token = (await request(app).post('/api/auth/register')
      .send({ username: `thumb_${stamp}`, nickname: '缩略图', password: '123456' })).body.token;
  });

  after(() => {
    // 清理本次测试产生的上传文件
    for (const f of created) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); } catch { /* 忽略 */ }
    }
  });

  it('上传返回原图、缩略图与真实尺寸', async () => {
    const buf = await makeImage(1200, 900);
    const res = await request(app).post('/api/upload').set(auth())
      .attach('file', buf, 'shot.jpg');
    if (res.status !== 200) throw new Error('上传失败 status=' + res.status);
    if (!res.body.url || !res.body.url.startsWith('/uploads/')) throw new Error('缺少原图地址');
    if (!res.body.thumb) throw new Error('缺少缩略图地址');
    if (res.body.width !== 1200 || res.body.height !== 900) {
      throw new Error('尺寸错误: ' + res.body.width + 'x' + res.body.height);
    }
    // 变体应按宽度升序，且每档宽度符合预期
    const variants = res.body.variants || [];
    if (variants.length < 2) throw new Error('变体数量不足: ' + JSON.stringify(variants));
    const widths = variants.map(v => v.width);
    if (widths[0] !== 400 || widths[1] !== 800) throw new Error('变体宽度应为 400/800, 实际 ' + JSON.stringify(widths));
    created.push(path.basename(res.body.url), ...variants.map(v => path.basename(v.url)));
    // 缩略图文件真实存在且宽度被限制到 400
    const thumbPath = path.join(UPLOAD_DIR, path.basename(res.body.thumb));
    if (!fs.existsSync(thumbPath)) throw new Error('缩略图文件不存在');
    const thumb = await Jimp.read(thumbPath);
    if (thumb.bitmap.width !== 400) throw new Error('缩略图宽度应为 400, 实际 ' + thumb.bitmap.width);
    if (thumb.bitmap.height !== 300) throw new Error('缩略图高度应按比例缩放, 实际 ' + thumb.bitmap.height);
  });

  it('帖子保存 thumbs 并在列表返回', async () => {
    const up = await request(app).post('/api/upload').set(auth())
      .attach('file', await makeImage(800, 600), 'a.jpg');
    created.push(path.basename(up.body.url), path.basename(up.body.thumb),
      ...((up.body.variants || []).map(v => path.basename(v.url))));

    const post = await request(app).post('/api/posts').set(auth()).send({
      title: '带缩略图的帖子',
      images: [up.body.url],
      thumbs: [up.body.thumb],
      board: 'food',
      tags: ['缩略图'],
      sizes: [{ w: 800, h: 600 }],
    });
    if (!Array.isArray(post.body.post.thumbs)) throw new Error('创建响应缺少 thumbs');
    if (post.body.post.thumbs[0] !== up.body.thumb) throw new Error('thumbs 未保存');

    const list = await request(app).get('/api/posts').query({ q: '带缩略图的帖子' });
    const found = list.body.posts.find(p => p.id === post.body.post.id);
    if (!found) throw new Error('列表未找到帖子');
    if (found.thumbs[0] !== up.body.thumb) throw new Error('列表未返回 thumbs');
  });

  it('未传 thumbs 时回落为原图', async () => {
    const post = await request(app).post('/api/posts').set(auth()).send({
      title: '没有缩略图的帖子',
      images: ['/uploads/legacy.jpg'],
      board: 'food',
      tags: [],
    });
    if (post.body.post.thumbs[0] !== '/uploads/legacy.jpg') {
      throw new Error('未回落到原图: ' + JSON.stringify(post.body.post.thumbs));
    }
  });

  it('my/posts 也返回 thumbs', async () => {
    const res = await request(app).get('/api/my/posts').set(auth()).query({ limit: 10 });
    if (!res.body.posts.every(p => Array.isArray(p.thumbs))) throw new Error('my/posts 缺少 thumbs');
  });
});

describe('Duitang API - 评论分页与批量点赞状态', function () {
  let token = '', otherToken = '';
  let postId = 0;
  const commentIds = [];

  before(async () => {
    const stamp = Date.now();
    token = (await request(app).post('/api/auth/register')
      .send({ username: `cmt_${stamp}`, nickname: '评论甲', password: '123456' })).body.token;
    otherToken = (await request(app).post('/api/auth/register')
      .send({ username: `cmt2_${stamp}`, nickname: '评论乙', password: '123456' })).body.token;

    postId = (await request(app).post('/api/posts').set({ Authorization: 'Bearer ' + token }).send({
      title: '评论分页', images: ['/uploads/c.jpg'], board: 'food', tags: [],
    })).body.post.id;

    for (let i = 1; i <= 5; i++) {
      const r = await request(app).post(`/api/posts/${postId}/comments`)
        .set({ Authorization: 'Bearer ' + token }).send({ content: '第' + i + '条评论' });
      commentIds.push(r.body.comment.id);
    }
    // 给前两条点赞
    for (const id of commentIds.slice(0, 2)) {
      await request(app).post(`/api/comments/${id}/like`).set({ Authorization: 'Bearer ' + otherToken });
    }
  });

  it('分页返回评论并带 total', async () => {
    const p1 = await request(app).get(`/api/posts/${postId}/comments`).set({ Authorization: 'Bearer ' + otherToken })
      .query({ page: 1, limit: 2 });
    if (p1.body.comments.length !== 2) throw new Error('第一页应为 2 条, 实际 ' + p1.body.comments.length);
    if (p1.body.total !== 5) throw new Error('total 应为 5, 实际 ' + p1.body.total);

    const p2 = await request(app).get(`/api/posts/${postId}/comments`).set({ Authorization: 'Bearer ' + otherToken })
      .query({ page: 2, limit: 2 });
    if (p2.body.comments.length !== 2) throw new Error('第二页应为 2 条');
    const overlap = p1.body.comments.filter(c => p2.body.comments.some(x => x.id === c.id));
    if (overlap.length) throw new Error('分页结果重叠');

    const p3 = await request(app).get(`/api/posts/${postId}/comments`).set({ Authorization: 'Bearer ' + otherToken })
      .query({ page: 3, limit: 2 });
    if (p3.body.comments.length !== 1) throw new Error('第三页应为 1 条');
  });

  it('批量返回 is_liked 且逐条正确', async () => {
    const res = await request(app).get(`/api/posts/${postId}/comments`).set({ Authorization: 'Bearer ' + otherToken })
      .query({ limit: 50 });
    const liked = res.body.comments.filter(c => c.is_liked).map(c => c.id).sort();
    const expected = commentIds.slice(0, 2).sort();
    if (JSON.stringify(liked) !== JSON.stringify(expected)) {
      throw new Error(`is_liked 错误: 实际 ${JSON.stringify(liked)} 期望 ${JSON.stringify(expected)}`);
    }
  });

  it('游客查看评论时 is_liked 全为 false', async () => {
    const res = await request(app).get(`/api/posts/${postId}/comments`);
    if (res.body.comments.some(c => c.is_liked)) throw new Error('游客不应看到已赞状态');
  });
});

describe('Duitang API - 关注/粉丝列表', function () {
  let aId = 0, bId = 0, cId = 0;
  let aToken = '', bToken = '';

  before(async () => {
    const stamp = Date.now();
    const mk = async name => {
      const r = await request(app).post('/api/auth/register')
        .send({ username: `${name}_${stamp}`, nickname: name, password: '123456' });
      const me = await request(app).get('/api/auth/me').set({ Authorization: 'Bearer ' + r.body.token });
      return { token: r.body.token, id: me.body.user.id };
    };
    const a = await mk('fol_a'), b = await mk('fol_b'), c = await mk('fol_c');
    aId = a.id; bId = b.id; cId = c.id; aToken = a.token; bToken = b.token;

    await request(app).post(`/api/users/${bId}/follow`).set({ Authorization: 'Bearer ' + aToken });
    await request(app).post(`/api/users/${cId}/follow`).set({ Authorization: 'Bearer ' + aToken });
    // B 回关 A，使 A 拥有一个粉丝
    await request(app).post(`/api/users/${aId}/follow`).set({ Authorization: 'Bearer ' + bToken });
  });

  it('关注列表返回我关注的人', async () => {
    const res = await request(app).get(`/api/users/${aId}/following`).set({ Authorization: 'Bearer ' + aToken });
    const ids = res.body.users.map(u => u.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify([bId, cId].sort())) {
      throw new Error('关注列表错误: ' + JSON.stringify(ids));
    }
    if (res.body.total !== 2) throw new Error('total 应为 2');
  });

  it('粉丝列表返回关注我的人', async () => {
    const res = await request(app).get(`/api/users/${aId}/followers`).set({ Authorization: 'Bearer ' + aToken });
    const ids = res.body.users.map(u => u.id);
    if (!ids.includes(bId)) throw new Error('粉丝列表缺少 B: ' + JSON.stringify(ids));
    if (res.body.total !== 1) throw new Error('total 应为 1, 实际 ' + res.body.total);
    // A 自己已关注 B，所以 is_following 应为 true
    const b = res.body.users.find(u => u.id === bId);
    if (b.is_following !== true) throw new Error('is_following 标记错误');
  });

  it('列表支持分页', async () => {
    const p1 = await request(app).get(`/api/users/${aId}/following`).set({ Authorization: 'Bearer ' + aToken })
      .query({ page: 1, limit: 1 });
    if (p1.body.users.length !== 1) throw new Error('limit 未生效');
    if (p1.body.total !== 2) throw new Error('total 应保持 2');
  });

  it('不存在的用户返回 404', async () => {
    const res = await request(app).get('/api/users/99999999/followers');
    if (res.status !== 404) throw new Error('expected 404, got ' + res.status);
  });
});

describe('Duitang API - 通知清空', function () {
  it('DELETE /api/notifications 清空全部', async () => {
    const stamp = Date.now();
    const a = (await request(app).post('/api/auth/register')
      .send({ username: `clr_a_${stamp}`, nickname: '清空甲', password: '123456' })).body.token;
    const b = (await request(app).post('/api/auth/register')
      .send({ username: `clr_b_${stamp}`, nickname: '清空乙', password: '123456' })).body.token;
    const postId = (await request(app).post('/api/posts').set({ Authorization: 'Bearer ' + a })
      .send({ title: '清空测试', images: ['/uploads/c.jpg'], board: 'food', tags: [] })).body.post.id;

    await request(app).post(`/api/posts/${postId}/like`).set({ Authorization: 'Bearer ' + b });
    await request(app).post(`/api/posts/${postId}/comments`).set({ Authorization: 'Bearer ' + b }).send({ content: 'hi' });

    const before = await request(app).get('/api/notifications').set({ Authorization: 'Bearer ' + a });
    if (before.body.total < 2) throw new Error('前置失败：通知数不足');

    const del = await request(app).delete('/api/notifications').set({ Authorization: 'Bearer ' + a });
    if (!del.body.ok) throw new Error('清空失败');

    const after = await request(app).get('/api/notifications').set({ Authorization: 'Bearer ' + a });
    if (after.body.total !== 0) throw new Error('清空后仍有 ' + after.body.total + ' 条');
  });
});
