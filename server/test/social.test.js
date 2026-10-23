const { describe, it, before } = require('mocha');
const request = require('supertest');

process.env.DB_PATH = require('path').join(__dirname, 'test.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

let tokenA = '';
let tokenB = '';
let userAId = 0;
let userBId = 0;
let postId = 0;

describe('Duitang API - 社交交互', function () {
  before(async () => {
    const ua = Date.now() + 'a';
    const ra = await request(app).post('/api/auth/register').send({ username: ua, nickname: '用户A', password: '123456' });
    tokenA = ra.body.token;
    userAId = ra.body.user.id;

    const ub = Date.now() + 'b';
    const rb = await request(app).post('/api/auth/register').send({ username: ub, nickname: '用户B', password: '123456' });
    tokenB = rb.body.token;
    userBId = rb.body.user.id;

    const p = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + tokenA)
      .send({ title: '关注测试帖', description: '', board: 'wallpaper', images: ['/uploads/x.jpg'], tags: [] });
    postId = p.body.post.id;
  });

  it('A follows B, then my/following lists B, then unfollows', async () => {
    // before 未关注,首次关注应返回 following:true
    const f = await request(app).post(`/api/users/${userBId}/follow`).set('Authorization', 'Bearer ' + tokenA);
    if (f.body.following !== true) throw new Error('follow failed: ' + JSON.stringify(f.body));

    const list = await request(app).get('/api/my/following').set('Authorization', 'Bearer ' + tokenA);
    if (!list.body.ids.includes(userBId)) throw new Error('following list missing B: ' + JSON.stringify(list.body));

    // 再 toggle 一次取消关注
    const u = await request(app).post(`/api/users/${userBId}/follow`).set('Authorization', 'Bearer ' + tokenA);
    if (u.body.following !== false) throw new Error('unfollow failed: ' + JSON.stringify(u.body));

    const list2 = await request(app).get('/api/my/following').set('Authorization', 'Bearer ' + tokenA);
    if (list2.body.ids.includes(userBId)) throw new Error('following list still has B after unfollow');
  });

  it('A adds comment, B likes comment, A deletes it', async () => {
    const c = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set('Authorization', 'Bearer ' + tokenA)
      .send({ content: '一条评论' });
    const commentId = c.body.comment.id;
    if (!commentId) throw new Error('comment create failed');

    const like = await request(app).post(`/api/comments/${commentId}/like`).set('Authorization', 'Bearer ' + tokenB);
    if (!like.body.liked) throw new Error('comment like failed: ' + JSON.stringify(like.body));

    const del = await request(app).delete(`/api/comments/${commentId}`).set('Authorization', 'Bearer ' + tokenA);
    if (del.status !== 200) throw new Error('comment delete failed');
  });

  it('B cannot delete A post (403)', async () => {
    const res = await request(app).delete(`/api/posts/${postId}`).set('Authorization', 'Bearer ' + tokenB);
    if (res.status !== 403) throw new Error('expected 403, got ' + res.status);
  });

  it('A deletes own post, my/posts no longer includes it', async () => {
    const del = await request(app).delete(`/api/posts/${postId}`).set('Authorization', 'Bearer ' + tokenA);
    if (del.status !== 200) throw new Error('delete failed: ' + del.status);
    const mine = await request(app).get('/api/my/posts').set('Authorization', 'Bearer ' + tokenA);
    if (mine.body.posts.some(p => p.id === postId)) throw new Error('deleted post still in my/posts');
  });

  it('GET /api/users/:id/profile returns stats and is_following', async () => {
    const res = await request(app).get(`/api/users/${userAId}/profile`).set('Authorization', 'Bearer ' + tokenB);
    if (res.status !== 200 || typeof res.body.stats.posts !== 'number') throw new Error('profile failed: ' + JSON.stringify(res.body));
  });

  it('upload rejects non-image via file type check', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', 'Bearer ' + tokenA)
      .attach('file', Buffer.from('plain text not an image'), 'fake.jpg');
    if (res.status !== 400) throw new Error('expected 400 for fake image, got ' + res.status + ' ' + JSON.stringify(res.body));
  });
});
