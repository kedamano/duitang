const { describe, it, before } = require('mocha');
const request = require('supertest');

process.env.DB_PATH = require('path').join(__dirname, 'collections.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

// 我的收集/点赞/发布：sizes 解析、分页、is_liked/is_collected、轻量互动接口
describe('Duitang API - 我的列表与互动状态', function () {
  let token = '';
  let uid = 0;
  let postA = 0, postB = 0;

  before(async () => {
    const stamp = Date.now();
    const reg = await request(app).post('/api/auth/register')
      .send({ username: `col_${stamp}`, nickname: '收集测试', password: '123456' });
    token = reg.body.token;
    uid = (await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + token)).body.user.id;

    const mk = async (title, w, h) => {
      const r = await request(app).post('/api/posts').set('Authorization', 'Bearer ' + token)
        .send({ title, images: ['/uploads/x.jpg'], board: 'food', tags: ['t'], sizes: [{ w, h }] });
      return r.body.post.id;
    };
    postA = await mk('收集的帖子', 640, 480);
    postB = await mk('点赞的帖子', 300, 900);

    await request(app).post(`/api/posts/${postA}/collect`).set('Authorization', 'Bearer ' + token);
    await request(app).post(`/api/posts/${postB}/like`).set('Authorization', 'Bearer ' + token);
  });

  // 回归：此前 my/* 手写解析 images/tags，漏了 sizes，导致个人主页瀑布流退化成统一比例
  it('my/collects 与 my/likes 返回 sizes 数组', async () => {
    for (const path of ['/api/my/collects', '/api/my/likes']) {
      const res = await request(app).get(path).set('Authorization', 'Bearer ' + token);
      const target = res.body.posts.find(p => p.id === (path.endsWith('collects') ? postA : postB));
      if (!target) throw new Error(path + ' 未返回目标帖子');
      if (!Array.isArray(target.sizes) || !target.sizes.length) {
        throw new Error(path + ' 缺少 sizes: ' + JSON.stringify(target.sizes));
      }
      if (typeof target.sizes[0].w !== 'number') throw new Error(path + ' sizes 结构错误');
      if (!Array.isArray(target.images) || !Array.isArray(target.tags)) throw new Error(path + ' images/tags 未解析');
    }
  });

  it('my/posts 支持分页并返回 total', async () => {
    const res = await request(app).get('/api/my/posts').set('Authorization', 'Bearer ' + token)
      .query({ page: 1, limit: 1 });
    if (res.body.posts.length !== 1) throw new Error('limit 未生效: ' + res.body.posts.length);
    if (res.body.total !== 2) throw new Error('total 应为 2, 实际 ' + res.body.total);
    if (res.body.page !== 1 || res.body.limit !== 1) throw new Error('分页参数回显错误');

    const p2 = await request(app).get('/api/my/posts').set('Authorization', 'Bearer ' + token)
      .query({ page: 2, limit: 1 });
    if (p2.body.posts.length !== 1) throw new Error('第 2 页应为 1 条');
    if (p2.body.posts[0].id === res.body.posts[0].id) throw new Error('两页返回了同一条');
  });

  it('帖子列表为登录用户带上 is_liked / is_collected', async () => {
    const res = await request(app).get('/api/posts').set('Authorization', 'Bearer ' + token)
      .query({ user_id: uid, limit: 100 });
    const a = res.body.posts.find(p => p.id === postA);
    const b = res.body.posts.find(p => p.id === postB);
    if (!a || !b) throw new Error('列表缺少帖子');
    if (a.is_collected !== true) throw new Error('postA 应标记为已收藏');
    if (a.is_liked) throw new Error('postA 不应标记为已点赞');
    if (b.is_liked !== true) throw new Error('postB 应标记为已点赞');
    if (b.is_collected) throw new Error('postB 不应标记为已收藏');
  });

  it('游客访问列表不带任何互动标记', async () => {
    const res = await request(app).get('/api/posts').query({ user_id: uid, limit: 100 });
    const a = res.body.posts.find(p => p.id === postA);
    if (a.is_liked || a.is_collected) throw new Error('游客不应看到互动状态');
  });

  it('无效 token 访问列表按游客处理而非报错', async () => {
    const res = await request(app).get('/api/posts').set('Authorization', 'Bearer not-a-real-token')
      .query({ user_id: uid });
    if (res.status !== 200) throw new Error('应为 200, 实际 ' + res.status);
  });

  it('关注流也带 is_liked / is_collected', async () => {
    const res = await request(app).get('/api/feed/following').set('Authorization', 'Bearer ' + token)
      .query({ limit: 100 });
    const a = res.body.posts.find(p => p.id === postA);
    if (!a) throw new Error('关注流缺少自己的帖子');
    if (a.is_collected !== true) throw new Error('关注流未带上 is_collected');
  });

  it('my/interactions 返回三个 ID 集合', async () => {
    const res = await request(app).get('/api/my/interactions').set('Authorization', 'Bearer ' + token);
    if (!res.body.liked.includes(postB)) throw new Error('liked 缺少 postB');
    if (!res.body.collected.includes(postA)) throw new Error('collected 缺少 postA');
    if (!Array.isArray(res.body.following)) throw new Error('following 应为数组');
  });

  it('搜索可命中作者昵称', async () => {
    const res = await request(app).get('/api/posts').query({ q: '收集测试', limit: 100 });
    if (!res.body.posts.some(p => p.id === postA || p.id === postB)) {
      throw new Error('按作者昵称搜索未命中');
    }
  });

  it('未登录访问 my/interactions 返回 401', async () => {
    const res = await request(app).get('/api/my/interactions');
    if (res.status !== 401) throw new Error('expected 401, got ' + res.status);
  });
});
