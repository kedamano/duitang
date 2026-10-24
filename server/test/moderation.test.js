const { describe, it, before } = require('mocha');
const request = require('supertest');
const path = require('path');

process.env.DB_PATH = path.join(__dirname, 'moderation.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

const auth = t => ({ Authorization: 'Bearer ' + t });

async function register(name, nickname) {
  const stamp = Date.now() + Math.random().toString(36).slice(2, 6);
  const r = await request(app).post('/api/auth/register')
    .send({ username: `${name}_${stamp}`, nickname, password: '123456' });
  const me = await request(app).get('/api/auth/me').set(auth(r.body.token));
  return { token: r.body.token, id: me.body.user.id };
}

describe('Duitang API - 敏感词过滤', function () {
  let user;
  const authU = () => auth(user.token);

  before(async () => {
    user = await register('sw_user', '敏感词用户');
  });

  it('帖子标题中的敏感词被打码', async () => {
    const res = await request(app).post('/api/posts').set(authU())
      .send({ title: '这个傻逼真厉害', images: ['/uploads/s.jpg'], board: 'food', tags: [] });
    if (res.body.post.title.includes('傻逼')) throw new Error('敏感词未被过滤: ' + res.body.post.title);
    if (!res.body.post.title.includes('**')) throw new Error('未打码: ' + res.body.post.title);
  });

  it('帖子描述中的敏感词被打码', async () => {
    const res = await request(app).post('/api/posts').set(authU())
      .send({ title: '正常标题', description: '<p>包含 fuck 的描述</p>', images: ['/uploads/s.jpg'], board: 'food', tags: [] });
    if (res.body.post.description.includes('fuck')) throw new Error('描述敏感词未过滤: ' + res.body.post.description);
  });

  it('评论中的敏感词被打码', async () => {
    const postId = (await request(app).post('/api/posts').set(authU())
      .send({ title: '评论测试帖', images: ['/uploads/s.jpg'], board: 'food', tags: [] })).body.post.id;
    const res = await request(app).post(`/api/posts/${postId}/comments`).set(authU())
      .send({ content: '你个傻逼' });
    if (res.body.comment.content.includes('傻逼')) throw new Error('评论敏感词未过滤: ' + res.body.comment.content);
  });

  it('专辑名称的敏感词被打码', async () => {
    const res = await request(app).post('/api/albums').set(authU()).send({ title: 'fuck 专辑' });
    if (res.body.album.title.includes('fuck')) throw new Error('专辑名敏感词未过滤: ' + res.body.album.title);
  });

  it('编辑帖子时同样过滤', async () => {
    const postId = (await request(app).post('/api/posts').set(authU())
      .send({ title: '待编辑', images: ['/uploads/s.jpg'], board: 'food', tags: [] })).body.post.id;
    const res = await request(app).put(`/api/posts/${postId}`).set(authU()).send({ title: '改成 shit' });
    if (res.body.post.title.includes('shit')) throw new Error('编辑时未过滤: ' + res.body.post.title);
  });

  it('正常内容不被误伤', async () => {
    const res = await request(app).post('/api/posts').set(authU())
      .send({ title: '汉服写真分享', description: '<p>今天拍了汉服，很开心</p>', images: ['/uploads/s.jpg'], board: 'food', tags: ['汉服'] });
    if (res.body.post.title !== '汉服写真分享') throw new Error('正常标题被改写: ' + res.body.post.title);
    if (!res.body.post.description.includes('汉服')) throw new Error('正常描述被改写');
  });
});

describe('Duitang API - 举报与审核', function () {
  let reporter, author, admin, postId, commentId;

  before(async () => {
    reporter = await register('rp_user', '举报者');
    author = await register('au_user', '被举报者');
    admin = await register('ad_user', '管理员');

    // 直接把管理员标记为 is_admin（与 database.js 的默认逻辑一致）
    const db = require('../database');
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(admin.id);

    postId = (await request(app).post('/api/posts').set(auth(author.token))
      .send({ title: '待举报帖子', images: ['/uploads/r.jpg'], board: 'food', tags: [] })).body.post.id;
    commentId = (await request(app).post(`/api/posts/${postId}/comments`).set(auth(author.token))
      .send({ content: '待举报评论' })).body.comment.id;
  });

  it('可以举报帖子', async () => {
    const res = await request(app).post('/api/reports').set(auth(reporter.token))
      .send({ target_type: 'post', target_id: postId, reason: '垃圾广告' });
    if (res.status !== 200) throw new Error('举报失败 status=' + res.status);
    if (!res.body.ok) throw new Error('未返回 ok');
  });

  it('可以举报评论与用户', async () => {
    const c = await request(app).post('/api/reports').set(auth(reporter.token))
      .send({ target_type: 'comment', target_id: commentId, reason: '辱骂' });
    if (c.status !== 200) throw new Error('举报评论失败');
    const u = await request(app).post('/api/reports').set(auth(reporter.token))
      .send({ target_type: 'user', target_id: author.id, reason: '骚扰' });
    if (u.status !== 200) throw new Error('举报用户失败');
  });

  it('重复举报同一对象只保留一条待处理', async () => {
    const first = await request(app).post('/api/reports').set(auth(reporter.token))
      .send({ target_type: 'post', target_id: postId, reason: '再报一次' });
    if (first.body.duplicated !== true) throw new Error('未识别重复举报');
  });

  it('非法举报类型与不存在对象被拒绝', async () => {
    const bad = await request(app).post('/api/reports').set(auth(reporter.token))
      .send({ target_type: 'hack', target_id: 1 });
    if (bad.status !== 400) throw new Error('非法类型应 400');

    const missing = await request(app).post('/api/reports').set(auth(reporter.token))
      .send({ target_type: 'post', target_id: 99999999 });
    if (missing.status !== 404) throw new Error('不存在对象应 404');
  });

  it('未登录不能举报', async () => {
    const res = await request(app).post('/api/reports').send({ target_type: 'post', target_id: postId });
    if (res.status !== 401) throw new Error('expected 401, got ' + res.status);
  });

  it('非管理员不能查看审核队列', async () => {
    const res = await request(app).get('/api/admin/reports').set(auth(reporter.token));
    if (res.status !== 403) throw new Error('expected 403, got ' + res.status);
  });

  it('管理员能看到队列并含目标摘要', async () => {
    const res = await request(app).get('/api/admin/reports').set(auth(admin.token));
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (!res.body.reports.length) throw new Error('队列为空');
    const report = res.body.reports[0];
    if (!report.target_preview) throw new Error('缺少目标摘要');
    if (!report.reporter_nickname) throw new Error('缺少举报人信息');
  });

  it('管理员驳回举报不影响内容', async () => {
    const queue = await request(app).get('/api/admin/reports').set(auth(admin.token));
    const report = queue.body.reports.find(r => r.target_type === 'user');
    const res = await request(app).post(`/api/admin/reports/${report.id}/resolve`).set(auth(admin.token))
      .send({ action: 'reject' });
    if (res.status !== 200) throw new Error('驳回失败');
    const still = await request(app).get(`/api/users/${author.id}/profile`);
    if (still.status !== 200) throw new Error('驳回后用户不应受影响');
  });

  it('管理员删除被举报帖子', async () => {
    const queue = await request(app).get('/api/admin/reports').set(auth(admin.token));
    const report = queue.body.reports.find(r => r.target_type === 'post');
    const res = await request(app).post(`/api/admin/reports/${report.id}/resolve`).set(auth(admin.token))
      .send({ action: 'delete' });
    if (res.status !== 200) throw new Error('处理失败');
    const gone = await request(app).get(`/api/posts/${postId}`);
    if (gone.status !== 404) throw new Error('帖子应被删除，实际 ' + gone.status);
  });

  it('非法处理动作被拒绝', async () => {
    const queue = await request(app).get('/api/admin/reports').set(auth(admin.token));
    if (!queue.body.reports.length) return;
    const res = await request(app).post(`/api/admin/reports/${queue.body.reports[0].id}/resolve`).set(auth(admin.token))
      .send({ action: 'hack' });
    if (res.status !== 400) throw new Error('expected 400, got ' + res.status);
  });
});

describe('Duitang API - 用户拉黑', function () {
  let blocker, blocked, other;
  let blockedPostId;

  before(async () => {
    blocker = await register('bl_a', '拉黑者');
    blocked = await register('bl_b', '被拉黑者');
    other = await register('bl_c', '旁观者');

    blockedPostId = (await request(app).post('/api/posts').set(auth(blocked.token))
      .send({ title: '被拉黑者的帖子', images: ['/uploads/b.jpg'], board: 'food', tags: [] })).body.post.id;
  });

  it('拉黑与解除拉黑', async () => {
    const block = await request(app).post(`/api/users/${blocked.id}/block`).set(auth(blocker.token));
    if (block.body.blocked !== true) throw new Error('拉黑失败');
    const list = await request(app).get('/api/my/blocks').set(auth(blocker.token));
    if (!list.body.ids.includes(blocked.id)) throw new Error('拉黑列表缺少该用户');

    const unblock = await request(app).post(`/api/users/${blocked.id}/block`).set(auth(blocker.token));
    if (unblock.body.blocked !== false) throw new Error('解除拉黑失败');
  });

  it('不能拉黑自己', async () => {
    const res = await request(app).post(`/api/users/${blocker.id}/block`).set(auth(blocker.token));
    if (res.status !== 400) throw new Error('expected 400, got ' + res.status);
  });

  it('拉黑后看不到对方帖子', async () => {
    await request(app).post(`/api/users/${blocked.id}/block`).set(auth(blocker.token));
    const list = await request(app).get('/api/posts').set(auth(blocker.token)).query({ limit: 100 });
    if (list.body.posts.some(p => p.id === blockedPostId)) throw new Error('仍能看到被拉黑者的帖子');
    // 旁观者不受影响
    const otherList = await request(app).get('/api/posts').set(auth(other.token)).query({ limit: 100 });
    if (!otherList.body.posts.some(p => p.id === blockedPostId)) throw new Error('旁观者不应受影响');
  });

  it('拉黑后看不到对方评论', async () => {
    // 先确保处于"未拉黑"状态，再拉黑，避免受前一个用例的拉黑状态影响
    await request(app).post(`/api/users/${blocked.id}/block`).set(auth(blocker.token)); // 解除（若已拉黑）
    const commentId = (await request(app).post(`/api/posts/${blockedPostId}/comments`).set(auth(blocked.token))
      .send({ content: '被拉黑者的评论' })).body.comment.id;

    await request(app).post(`/api/users/${blocked.id}/block`).set(auth(blocker.token));
    const res = await request(app).get(`/api/posts/${blockedPostId}/comments`).set(auth(blocker.token));
    if (res.body.comments.some(c => c.id === commentId)) throw new Error('仍能看到被拉黑者的评论');
  });

  it('关注流也过滤被拉黑者', async () => {
    // 同理：先解除再关注再拉黑，保证状态确定
    await request(app).post(`/api/users/${blocked.id}/block`).set(auth(blocker.token)); // 解除
    await request(app).post(`/api/users/${blocked.id}/follow`).set(auth(blocker.token));
    await request(app).post(`/api/users/${blocked.id}/block`).set(auth(blocker.token));
    const feed = await request(app).get('/api/feed/following').set(auth(blocker.token)).query({ limit: 100 });
    if (feed.body.posts.some(p => p.id === blockedPostId)) throw new Error('关注流仍包含被拉黑者内容');
  });
});
