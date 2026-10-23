const { describe, it, before } = require('mocha');
const request = require('supertest');

process.env.DB_PATH = require('path').join(__dirname, 'feed.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

// 关注流：只出现已关注作者与自己的帖子，按时间倒序分页
describe('Duitang API - 关注流 /api/feed/following', function () {
  let tokenA = '', tokenB = '', tokenC = '';
  let idA = 0, idB = 0, idC = 0;
  let postA = 0, postB = 0, postC = 0;

  before(async () => {
    const stamp = Date.now();
    for (const [name, set] of [['a', v => tokenA = v.token], ['b', v => tokenB = v.token], ['c', v => tokenC = v.token]]) {
      const r = await request(app).post('/api/auth/register')
        .send({ username: `feed_${name}_${stamp}`, nickname: '用户' + name.toUpperCase(), password: '123456' });
      set(r.body);
    }
    idA = (await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + tokenA)).body.user.id;
    idB = (await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + tokenB)).body.user.id;
    idC = (await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + tokenC)).body.user.id;

    const mk = async (token, title) => {
      const r = await request(app).post('/api/posts').set('Authorization', 'Bearer ' + token)
        .send({ title, images: ['/uploads/f.jpg'], board: 'food', tags: [], sizes: [{ w: 400, h: 500 }] });
      return r.body.post.id;
    };
    postA = await mk(tokenA, 'A的帖子');
    postB = await mk(tokenB, 'B的帖子');
    postC = await mk(tokenC, 'C的帖子');
  });

  it('未登录返回 401', async () => {
    const res = await request(app).get('/api/feed/following');
    if (res.status !== 401) throw new Error('expected 401, got ' + res.status);
  });

  it('无任何关注时只看到自己的帖子', async () => {
    const res = await request(app).get('/api/feed/following').set('Authorization', 'Bearer ' + tokenA);
    const ids = res.body.posts.map(p => p.id);
    if (!ids.includes(postA)) throw new Error('自己的帖子应在关注流中');
    if (ids.includes(postB) || ids.includes(postC)) throw new Error('未关注作者的帖子不应出现: ' + JSON.stringify(ids));
    if (res.body.total !== ids.length) throw new Error('total 与实际条数不一致');
  });

  it('关注 B 后看到 B 的帖子，取消关注后消失', async () => {
    await request(app).post(`/api/users/${idB}/follow`).set('Authorization', 'Bearer ' + tokenA);
    let res = await request(app).get('/api/feed/following').set('Authorization', 'Bearer ' + tokenA);
    let ids = res.body.posts.map(p => p.id);
    if (!ids.includes(postB)) throw new Error('关注后 B 的帖子未出现在流中');

    await request(app).post(`/api/users/${idB}/follow`).set('Authorization', 'Bearer ' + tokenA); // 取消关注
    res = await request(app).get('/api/feed/following').set('Authorization', 'Bearer ' + tokenA);
    ids = res.body.posts.map(p => p.id);
    if (ids.includes(postB)) throw new Error('取消关注后 B 的帖子仍在流中');
  });

  it('返回帖子已 hydrate（images/tags/sizes 为数组）', async () => {
    const res = await request(app).get('/api/feed/following').set('Authorization', 'Bearer ' + tokenA);
    const p = res.body.posts.find(x => x.id === postA);
    if (!Array.isArray(p.images) || !Array.isArray(p.tags) || !Array.isArray(p.sizes)) {
      throw new Error('字段未解析: ' + JSON.stringify({ images: p.images, tags: p.tags, sizes: p.sizes }));
    }
    if (p.sizes[0].w !== 400) throw new Error('sizes 丢失');
    if (!p.author_nickname) throw new Error('缺少作者昵称');
  });

  it('按创建时间倒序，且分页参数生效', async () => {
    // A 关注 B 与 C，共 3 篇帖子
    await request(app).post(`/api/users/${idB}/follow`).set('Authorization', 'Bearer ' + tokenA);
    await request(app).post(`/api/users/${idC}/follow`).set('Authorization', 'Bearer ' + tokenA);

    const all = await request(app).get('/api/feed/following').set('Authorization', 'Bearer ' + tokenA)
      .query({ page: 1, limit: 100 });
    if (all.body.total < 3) throw new Error('total 应至少为 3, 实际 ' + all.body.total);
    const times = all.body.posts.map(p => p.created_at);
    const sorted = [...times].sort().reverse();
    if (JSON.stringify(times) !== JSON.stringify(sorted)) throw new Error('未按时间倒序: ' + times.join('|'));

    const p1 = await request(app).get('/api/feed/following').set('Authorization', 'Bearer ' + tokenA)
      .query({ page: 1, limit: 2 });
    const p2 = await request(app).get('/api/feed/following').set('Authorization', 'Bearer ' + tokenA)
      .query({ page: 2, limit: 2 });
    if (p1.body.posts.length !== 2) throw new Error('limit 未生效: ' + p1.body.posts.length);
    if (p1.body.page !== 1 || p2.body.page !== 2) throw new Error('page 回显错误');
    const overlap = p1.body.posts.filter(x => p2.body.posts.some(y => y.id === x.id));
    if (overlap.length) throw new Error('分页结果重叠');
  });

  it('limit 超上限被夹到 100，非法 page 回落 1', async () => {
    const res = await request(app).get('/api/feed/following').set('Authorization', 'Bearer ' + tokenA)
      .query({ page: -5, limit: 9999 });
    if (res.body.limit !== 100 || res.body.page !== 1) {
      throw new Error('参数未规范化: page=' + res.body.page + ' limit=' + res.body.limit);
    }
  });
});
