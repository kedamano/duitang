const { describe, it, before } = require('mocha');
const request = require('supertest');
const path = require('path');

process.env.DB_PATH = path.join(__dirname, 'recommend.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');
const db = require('../database');
const { rebuildSimilarities, recommendForUser } = require('../recommend');

const auth = t => ({ Authorization: 'Bearer ' + t });

async function makeUser(name) {
  const stamp = Date.now() + Math.random().toString(36).slice(2, 6);
  const r = await request(app).post('/api/auth/register')
    .send({ username: `${name}_${stamp}`, nickname: name, password: '123456' });
  return r.body.token;
}

async function makePost(token, title, tags = [], board = 'food') {
  const r = await request(app).post('/api/posts').set(auth(token))
    .send({ title, images: ['/uploads/r.jpg'], board, tags, sizes: [{ w: 400, h: 300 }] });
  return r.body.post.id;
}

describe('Duitang API - 协同过滤推荐', function () {
  this.timeout(20000);
  let u1, u2, u3;
  let pA, pB, pC, pD;

  before(async () => {
    // 独立运行时清掉上次残留，保证帖 id 从 1 开始、相似度表全新
    for (const t of ['item_similarities', 'post_views', 'post_likes', 'post_collects', 'comments', 'posts', 'users']) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('posts','users','comments')").run();
    u1 = await makeUser('cf_u1');
    u2 = await makeUser('cf_u2');
    u3 = await makeUser('cf_u3');
    pA = await makePost(u1, 'CF帖A', ['测试']);
    pB = await makePost(u1, 'CF帖B', ['测试']);
    pC = await makePost(u2, 'CF帖C', ['测试']);
    pD = await makePost(u3, 'CF帖D', ['无关']);
    // u1 喜欢 A、B；u2 喜欢 A、B、C → A/B 与 C 有共现，D 孤立
    await request(app).post(`/api/posts/${pA}/like`).set(auth(u1));
    await request(app).post(`/api/posts/${pB}/like`).set(auth(u1));
    await request(app).post(`/api/posts/${pA}/like`).set(auth(u2));
    await request(app).post(`/api/posts/${pB}/like`).set(auth(u2));
    await request(app).post(`/api/posts/${pC}/like`).set(auth(u2));
    rebuildSimilarities();
  });

  it('相似度重建产出共现帖对', () => {
    const rows = db.prepare('SELECT * FROM item_similarities').all();
    if (!rows.length) throw new Error('相似度表为空');
    const hasAB = rows.some(r =>
      (r.post_id === pA && r.similar_post_id === pB) || (r.post_id === pB && r.similar_post_id === pA));
    if (!hasAB) throw new Error('共现帖 A-B 未建立相似');
    // 相似度必须在 (0,1]
    for (const r of rows) if (r.score <= 0 || r.score > 1.0001) throw new Error('score 越界: ' + r.score);
  });

  it('u1 的 CF 推荐包含 C（相似邻居）且不重复已交互帖', () => {
    const uid = db.prepare("SELECT id FROM users WHERE nickname LIKE 'cf_u1%'").get().id;
    const rec = recommendForUser(uid, 10);
    if (!rec.includes(pC)) throw new Error('未推荐出相似帖 C: ' + JSON.stringify(rec));
    if (rec.includes(pA) || rec.includes(pB)) throw new Error('不应推荐已交互过的帖');
  });

  it('无交互历史用户 CF 返回空（走兜底）', async () => {
    const fresh = await makeUser('cf_newbie');
    const res = await request(app).get('/api/recommend/feed').set(auth(fresh));
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (res.body.source !== 'popular') throw new Error('冷用户应走热门兜底, 实际 ' + res.body.source);
    if (!res.body.posts.length) throw new Error('兜底不应为空');
  });

  it('个性化流：有历史用户 source=cf 且不含已交互帖', async () => {
    const res = await request(app).get('/api/recommend/feed').set(auth(u1));
    if (res.body.source !== 'cf') throw new Error('source=' + res.body.source);
    const ids = res.body.posts.map(p => p.id);
    if (ids.includes(pA) || ids.includes(pB)) throw new Error('推荐含已交互帖');
  });

  it('未登录推荐流可用（热门兜底）', async () => {
    const res = await request(app).get('/api/recommend/feed');
    if (res.status !== 200 || !res.body.posts.length) throw new Error('status=' + res.status);
    if (res.body.source !== 'popular') throw new Error('source=' + res.body.source);
  });

  it('相关推荐：CF 邻居优先，永不空窗', async () => {
    const res = await request(app).get(`/api/posts/${pA}/related`);
    if (res.status !== 200) throw new Error('status=' + res.status);
    const ids = res.body.posts.map(p => p.id);
    if (!ids.length) throw new Error('相关推荐为空');
    if (ids.includes(pA)) throw new Error('不应包含自身');
    if (!ids.includes(pB)) throw new Error('强共现帖 B 应在推荐中: ' + JSON.stringify(ids));
  });

  it('相关推荐对孤立帖走内容/热门兜底', async () => {
    const res = await request(app).get(`/api/posts/${pD}/related`);
    const ids = res.body.posts.map(p => p.id);
    if (!ids.length) throw new Error('孤立帖推荐不应为空');
    if (ids.includes(pD)) throw new Error('不应包含自身');
  });

  it('打开详情记录浏览，且每人每天去重', async () => {
    const before = db.prepare('SELECT COUNT(*) c FROM post_views WHERE post_id = ?').get(pC).c;
    await request(app).get(`/api/posts/${pC}`).set(auth(u3));
    await request(app).get(`/api/posts/${pC}`).set(auth(u3));
    const after = db.prepare('SELECT COUNT(*) c FROM post_views WHERE post_id = ?').get(pC).c;
    if (after - before !== 1) throw new Error(`同日应只记 1 条, 实际 ${after - before}`);
  });

  it('显式 view 上报接口：登录记账、匿名不报错', async () => {
    const before = db.prepare('SELECT COUNT(*) c FROM post_views WHERE post_id = ?').get(pB).c;
    const r1 = await request(app).post(`/api/posts/${pB}/view`).set(auth(u3));
    if (r1.status !== 200 || !r1.body.ok) throw new Error('status=' + r1.status);
    const r2 = await request(app).post(`/api/posts/${pB}/view`);
    if (r2.status !== 200) throw new Error('匿名上报应 200');
    const after = db.prepare('SELECT COUNT(*) c FROM post_views WHERE post_id = ?').get(pB).c;
    if (after - before !== 1) throw new Error(`应记 1 条, 实际 ${after - before}`);
  });

  it('不存在的帖子相关推荐 404', async () => {
    const res = await request(app).get('/api/posts/999999/related');
    if (res.status !== 404) throw new Error('status=' + res.status);
  });
});
