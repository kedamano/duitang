const { describe, it, before } = require('mocha');
const request = require('supertest');

process.env.DB_PATH = require('path').join(__dirname, 'e2e.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

// 联调测试:模拟真实用户旅程,覆盖前端 src/api 的调用链
describe('联调测试 - 完整用户旅程', function () {
  let userToken = '';
  let userId = 0;
  let postId = 0;
  let commentId = 0;

  it('1) 注册 → 登录 → 恢复会话', async () => {
    const username = 'journey_' + Date.now();
    const reg = await request(app).post('/api/auth/register').send({ username, nickname: '旅程用户', password: '123456' });
    if (reg.status !== 200) throw new Error('注册失败: ' + reg.status);
    userToken = reg.body.token;
    userId = reg.body.user.id;

    const login = await request(app).post('/api/auth/login').send({ username, password: '123456' });
    // JWT iat 精度为秒，跨秒时 token 字符串不同；应验证登录 token 可用而非字符串相等
    if (login.status !== 200 || !login.body.token) throw new Error('登录失败');
    const loginMe = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + login.body.token);
    if (loginMe.body.user.id !== userId) throw new Error('登录 token 会话用户不匹配');

    const me = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + userToken);
    if (me.body.user.id !== userId) throw new Error('会话恢复用户不匹配');
  });

  it('2) 更新简介 → profile 反映', async () => {
    await request(app).patch('/api/users/me').set('Authorization', 'Bearer ' + userToken).send({ bio: '这是我的简介' });
    const me = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + userToken);
    if (me.body.user.bio !== '这是我的简介') throw new Error('简介未更新: ' + me.body.user.bio);
  });

  it('3) 发布帖子 → 列表可搜到', async () => {
    const p = await request(app).post('/api/posts').set('Authorization', 'Bearer ' + userToken)
      .send({ title: '联调测试帖子', description: '测试描述', board: 'food', images: ['/uploads/test.jpg'], tags: ['测试', '联调'] });
    if (p.status !== 200) throw new Error('发布失败: ' + p.status);
    postId = p.body.post.id;

    const byQ = await request(app).get('/api/posts').query({ q: '联调' });
    if (!byQ.body.posts.some(x => x.id === postId)) throw new Error('搜索找不到刚发布的帖子');

    const byBoard = await request(app).get('/api/posts').query({ board: 'food' });
    if (!byBoard.body.posts.some(x => x.id === postId)) throw new Error('画板筛选找不到帖子');
  });

  it('4) 点赞 + 收藏 + 分享 计数联动', async () => {
    const like = await request(app).post(`/api/posts/${postId}/like`).set('Authorization', 'Bearer ' + userToken);
    if (like.body.count !== 1) throw new Error('点赞计数错误: ' + JSON.stringify(like.body));

    const col = await request(app).post(`/api/posts/${postId}/collect`).set('Authorization', 'Bearer ' + userToken);
    if (col.body.count !== 1) throw new Error('收藏计数错误: ' + JSON.stringify(col.body));

    const share = await request(app).post(`/api/posts/${postId}/share`).set('Authorization', 'Bearer ' + userToken);
    if (share.body.count !== 1) throw new Error('分享计数错误: ' + JSON.stringify(share.body));

    const myCollects = await request(app).get('/api/my/collects').set('Authorization', 'Bearer ' + userToken);
    if (!myCollects.body.posts.some(x => x.id === postId)) throw new Error('my/collects 缺少刚收藏的帖子');

    const myLikes = await request(app).get('/api/my/likes').set('Authorization', 'Bearer ' + userToken);
    if (!myLikes.body.posts.some(x => x.id === postId)) throw new Error('my/likes 缺少刚点赞的帖子');
  });

  it('5) 评论 → 点赞评论 → 删除评论', async () => {
    const c = await request(app).post(`/api/posts/${postId}/comments`).set('Authorization', 'Bearer ' + userToken)
      .send({ content: '联调评论' });
    commentId = c.body.comment.id;

    const list = await request(app).get(`/api/posts/${postId}/comments`);
    if (!list.body.comments.some(x => x.id === commentId)) throw new Error('评论列表缺少新评论');

    const lc = await request(app).post(`/api/comments/${commentId}/like`).set('Authorization', 'Bearer ' + userToken);
    if (lc.body.count !== 1) throw new Error('评论点赞计数错误');

    const del = await request(app).delete(`/api/comments/${commentId}`).set('Authorization', 'Bearer ' + userToken);
    if (del.status !== 200) throw new Error('删除评论失败');
  });

  it('6) my/posts 与用户主页 stats 一致', async () => {
    const mine = await request(app).get('/api/my/posts').set('Authorization', 'Bearer ' + userToken);
    if (!mine.body.posts.some(x => x.id === postId)) throw new Error('my/posts 缺少帖子');

    const profile = await request(app).get(`/api/users/${userId}/profile`);
    if (profile.body.stats.posts < 1) throw new Error('主页发布数错误: ' + JSON.stringify(profile.body.stats));
  });

  it('7) 删除帖子 → 列表消失 → my/posts 不再包含', async () => {
    const del = await request(app).delete(`/api/posts/${postId}`).set('Authorization', 'Bearer ' + userToken);
    if (del.status !== 200) throw new Error('删除帖子失败');

    const mine = await request(app).get('/api/my/posts').set('Authorization', 'Bearer ' + userToken);
    if (mine.body.posts.some(x => x.id === postId)) throw new Error('删除后 my/posts 仍含该帖子');

    const detail = await request(app).get(`/api/posts/${postId}`);
    if (detail.status !== 404) throw new Error('已删帖详情应 404, 实际 ' + detail.status);
  });
});
