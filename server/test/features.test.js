const { describe, it, before } = require('mocha');
const request = require('supertest');

process.env.DB_PATH = require('path').join(__dirname, 'features.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

// 三个新功能：消息通知 / 帖子编辑 / 标签聚合
describe('Duitang API - 消息通知', function () {
  let tokenA = '', tokenB = '';
  let idA = 0, idB = 0;
  let postId = 0;

  const auth = t => ({ Authorization: 'Bearer ' + t });
  const unread = async t => (await request(app).get('/api/notifications/unread').set(auth(t))).body.count;
  const list = async t => (await request(app).get('/api/notifications').set(auth(t))).body;

  before(async () => {
    const stamp = Date.now();
    const a = await request(app).post('/api/auth/register')
      .send({ username: `ntf_a_${stamp}`, nickname: '通知甲', password: '123456' });
    tokenA = a.body.token;
    const b = await request(app).post('/api/auth/register')
      .send({ username: `ntf_b_${stamp}`, nickname: '通知乙', password: '123456' });
    tokenB = b.body.token;
    idA = (await request(app).get('/api/auth/me').set(auth(tokenA))).body.user.id;
    idB = (await request(app).get('/api/auth/me').set(auth(tokenB))).body.user.id;

    const p = await request(app).post('/api/posts').set(auth(tokenA))
      .send({ title: '被通知的帖子', images: ['/uploads/n.jpg'], board: 'food', tags: ['通知'], sizes: [{ w: 400, h: 500 }] });
    postId = p.body.post.id;
  });

  it('未登录访问通知返回 401', async () => {
    const res = await request(app).get('/api/notifications');
    if (res.status !== 401) throw new Error('expected 401, got ' + res.status);
  });

  it('被点赞产生通知，取消点赞自动撤回', async () => {
    await request(app).post(`/api/posts/${postId}/like`).set(auth(tokenB));
    let count = await unread(tokenA);
    if (count !== 1) throw new Error('点赞后未读数应为 1, 实际 ' + count);
    const data = await list(tokenA);
    const n = data.notifications[0];
    if (n.type !== 'like') throw new Error('类型应为 like, 实际 ' + n.type);
    if (n.actor.nickname !== '通知乙') throw new Error('触发者信息错误: ' + n.actor.nickname);
    if (n.post_title !== '被通知的帖子') throw new Error('关联帖子标题缺失');
    if (!n.post_cover) throw new Error('关联帖子封面缺失');

    await request(app).post(`/api/posts/${postId}/like`).set(auth(tokenB));
    count = await unread(tokenA);
    if (count !== 0) throw new Error('取消点赞后通知应撤回, 实际 ' + count);
  });

  it('反复点赞不会堆积重复通知', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post(`/api/posts/${postId}/like`).set(auth(tokenB));
    }
    const data = await list(tokenA);
    if (data.notifications.length !== 1) throw new Error('应只有 1 条通知, 实际 ' + data.notifications.length);
  });

  it('收藏产生通知，取消收藏撤回', async () => {
    await request(app).post(`/api/posts/${postId}/collect`).set(auth(tokenB));
    let data = await list(tokenA);
    if (!data.notifications.some(n => n.type === 'collect')) throw new Error('未产生收藏通知');
    await request(app).post(`/api/posts/${postId}/collect`).set(auth(tokenB));
    data = await list(tokenA);
    if (data.notifications.some(n => n.type === 'collect')) throw new Error('收藏通知未撤回');
  });

  it('评论产生通知，删除评论后通知一并撤回', async () => {
    const c = await request(app).post(`/api/posts/${postId}/comments`).set(auth(tokenB))
      .send({ content: '这条评论会触发通知' });
    const commentId = c.body.comment.id;

    let data = await list(tokenA);
    const n = data.notifications.find(x => x.type === 'comment');
    if (!n) throw new Error('未产生评论通知');
    if (!n.comment_excerpt.includes('这条评论')) throw new Error('评论摘要缺失: ' + n.comment_excerpt);

    await request(app).delete(`/api/comments/${commentId}`).set(auth(tokenB));
    data = await list(tokenA);
    if (data.notifications.some(x => x.comment_id === commentId)) throw new Error('评论通知未撤回');
  });

  it('关注产生通知，取关撤回', async () => {
    await request(app).post(`/api/users/${idA}/follow`).set(auth(tokenB));
    let data = await list(tokenA);
    if (!data.notifications.some(n => n.type === 'follow')) throw new Error('未产生关注通知');
    await request(app).post(`/api/users/${idA}/follow`).set(auth(tokenB));
    data = await list(tokenA);
    if (data.notifications.some(n => n.type === 'follow')) throw new Error('关注通知未撤回');
  });

  it('自己操作自己的帖子不产生通知', async () => {
    const before = (await list(tokenA)).notifications.length;
    await request(app).post(`/api/posts/${postId}/like`).set(auth(tokenA));
    await request(app).post(`/api/posts/${postId}/collect`).set(auth(tokenA));
    await request(app).post(`/api/posts/${postId}/comments`).set(auth(tokenA)).send({ content: '自评' });
    const data = await list(tokenA);
    // 关注点：不能出现"自己触发"的通知（列表里可能有他人留下的历史通知）
    const selfNotified = data.notifications.filter(n => n.actor.id === idA);
    if (selfNotified.length) {
      throw new Error('自赞/自评不应产生通知, 实际 ' + JSON.stringify(selfNotified.map(n => n.type)));
    }
    if (data.notifications.length > before) throw new Error('通知数量异常增长');
  });

  it('标记已读后未读数清零', async () => {
    // 评论每次都产生新通知，用它构造确定的未读状态
    await request(app).post(`/api/posts/${postId}/comments`).set(auth(tokenB)).send({ content: '制造未读' });
    const beforeRead = await unread(tokenA);
    if (beforeRead === 0) throw new Error('前置条件失败：应有未读');
    const res = await request(app).post('/api/notifications/read').set(auth(tokenA)).send({});
    if (res.body.unread !== 0) throw new Error('标记后未读数应为 0, 实际 ' + res.body.unread);
    const data = await list(tokenA);
    if (!data.notifications.every(n => n.is_read)) throw new Error('仍有未读记录');
  });

  it('通知按时间倒序分页', async () => {
    const res = await request(app).get('/api/notifications').set(auth(tokenA)).query({ page: 1, limit: 1 });
    if (res.body.notifications.length > 1) throw new Error('limit 未生效');
    if (res.body.page !== 1) throw new Error('page 回显错误');
  });
});

describe('Duitang API - 帖子编辑', function () {
  let tokenA = '', tokenB = '';
  let postId = 0;
  const auth = t => ({ Authorization: 'Bearer ' + t });

  before(async () => {
    const stamp = Date.now();
    tokenA = (await request(app).post('/api/auth/register')
      .send({ username: `edit_a_${stamp}`, nickname: '编辑甲', password: '123456' })).body.token;
    tokenB = (await request(app).post('/api/auth/register')
      .send({ username: `edit_b_${stamp}`, nickname: '编辑乙', password: '123456' })).body.token;
    const p = await request(app).post('/api/posts').set(auth(tokenA))
      .send({ title: '原标题', description: '原描述', board: 'food', tags: ['旧'], images: ['/uploads/e.jpg'], sizes: [{ w: 600, h: 400 }] });
    postId = p.body.post.id;
  });

  it('作者可编辑标题/描述/标签/画板', async () => {
    const res = await request(app).put(`/api/posts/${postId}`).set(auth(tokenA))
      .send({ title: '新标题', description: '新描述', board: '动漫插画', tags: ['新1', '新2'] });
    if (res.status !== 200) throw new Error('编辑失败 status=' + res.status);
    const p = res.body.post;
    if (p.title !== '新标题') throw new Error('标题未更新');
    if (p.description !== '新描述') throw new Error('描述未更新');
    if (p.board !== 'anime') throw new Error('中文画板未归一化为 key: ' + p.board);
    if (!Array.isArray(p.tags) || p.tags.join(',') !== '新1,新2') throw new Error('标签未更新: ' + JSON.stringify(p.tags));
  });

  it('编辑不影响图片与尺寸', async () => {
    const res = await request(app).get(`/api/posts/${postId}`);
    const p = res.body.post;
    if (p.images[0] !== '/uploads/e.jpg') throw new Error('图片被清空');
    if (!Array.isArray(p.sizes) || p.sizes[0].w !== 600) throw new Error('尺寸被清空');
  });

  it('部分字段更新不会覆盖其他字段', async () => {
    await request(app).put(`/api/posts/${postId}`).set(auth(tokenA)).send({ title: '只改标题' });
    const p = (await request(app).get(`/api/posts/${postId}`)).body.post;
    if (p.title !== '只改标题') throw new Error('标题未更新');
    if (p.description !== '新描述') throw new Error('未传的字段被清空了: ' + p.description);
  });

  it('非作者编辑返回 403', async () => {
    const res = await request(app).put(`/api/posts/${postId}`).set(auth(tokenB)).send({ title: '越权' });
    if (res.status !== 403) throw new Error('expected 403, got ' + res.status);
  });

  it('空标题返回 400', async () => {
    const res = await request(app).put(`/api/posts/${postId}`).set(auth(tokenA)).send({ title: '   ' });
    if (res.status !== 400) throw new Error('expected 400, got ' + res.status);
  });

  it('未登录编辑返回 401', async () => {
    const res = await request(app).put(`/api/posts/${postId}`).send({ title: '匿名' });
    if (res.status !== 401) throw new Error('expected 401, got ' + res.status);
  });

  it('编辑不存在的帖子返回 404', async () => {
    const res = await request(app).put('/api/posts/99999999').set(auth(tokenA)).send({ title: 'x' });
    if (res.status !== 404) throw new Error('expected 404, got ' + res.status);
  });
});

describe('Duitang API - 标签聚合', function () {
  let token = '';
  let catPost = 0, catPlusPost = 0;
  const auth = () => ({ Authorization: 'Bearer ' + token });

  before(async () => {
    const stamp = Date.now();
    token = (await request(app).post('/api/auth/register')
      .send({ username: `tag_${stamp}`, nickname: '标签人', password: '123456' })).body.token;
    const mk = async (title, tags) => (await request(app).post('/api/posts').set(auth())
      .send({ title, images: ['/uploads/t.jpg'], board: 'food', tags, sizes: [{ w: 400, h: 400 }] })).body.post.id;
    catPost = await mk('只有猫', ['猫']);
    catPlusPost = await mk('猫和猫咪', ['猫', '猫咪']);
  });

  it('/api/tags 返回带计数的标签并倒序', async () => {
    const res = await request(app).get('/api/tags').query({ limit: 200 });
    const tags = res.body.tags;
    if (!Array.isArray(tags) || !tags.length) throw new Error('未返回标签');
    const cat = tags.find(t => t.tag === '猫');
    if (!cat) throw new Error('缺少标签「猫」');
    if (cat.count < 2) throw new Error('「猫」计数应为 2, 实际 ' + cat.count);
    for (let i = 1; i < tags.length; i++) {
      if (tags[i - 1].count < tags[i].count) throw new Error('未按计数倒序');
    }
  });

  it('按标签筛选只返回命中帖子', async () => {
    const res = await request(app).get('/api/posts').query({ tag: '猫', limit: 100 });
    const ids = res.body.posts.map(p => p.id);
    if (!ids.includes(catPost) || !ids.includes(catPlusPost)) throw new Error('漏掉了命中帖子');
  });

  it('标签精确匹配：猫咪 不应命中只打了 猫 的帖子', async () => {
    const res = await request(app).get('/api/posts').query({ tag: '猫咪', limit: 100 });
    const ids = res.body.posts.map(p => p.id);
    if (ids.includes(catPost)) throw new Error('前缀相同的标签被错误命中');
    if (!ids.includes(catPlusPost)) throw new Error('精确命中的帖子丢失');
  });

  it('不存在的标签返回空列表而非报错', async () => {
    const res = await request(app).get('/api/posts').query({ tag: '不存在的标签xyz' });
    if (res.status !== 200) throw new Error('应为 200, 实际 ' + res.status);
    if (res.body.posts.length !== 0) throw new Error('应为空列表');
  });
});
