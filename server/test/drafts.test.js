const { describe, it, before } = require('mocha');
const request = require('supertest');
const path = require('path');

process.env.DB_PATH = path.join(__dirname, 'drafts.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

const auth = t => ({ Authorization: 'Bearer ' + t });

async function register(name) {
  const stamp = Date.now() + Math.random().toString(36).slice(2, 6);
  const r = await request(app).post('/api/auth/register')
    .send({ username: `${name}_${stamp}`, nickname: name, password: '123456' });
  return { token: r.body.token };
}

describe('Duitang API - 服务端草稿箱', function () {
  let user, other;
  const payload = {
    title: '未完成的帖子',
    description: '<p>写到一半</p>',
    tags: ['汉服', '壁纸'],
    board: '壁纸头像',
  };

  before(async () => {
    user = await register('draft_user');
    other = await register('draft_other');
  });

  it('初始没有草稿', async () => {
    const res = await request(app).get('/api/my/draft').set(auth(user.token));
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (res.body.draft !== null) throw new Error('应返回 null, 实际 ' + JSON.stringify(res.body.draft));
  });

  it('保存后可读回', async () => {
    const save = await request(app).put('/api/my/draft').set(auth(user.token)).send({ payload });
    if (!save.body.ok) throw new Error('保存失败');

    const res = await request(app).get('/api/my/draft').set(auth(user.token));
    if (!res.body.draft) throw new Error('未读回草稿');
    if (res.body.draft.title !== payload.title) throw new Error('标题不符');
    if (res.body.draft.tags.join(',') !== payload.tags.join(',')) throw new Error('标签不符');
    if (!res.body.updated_at) throw new Error('缺少 updated_at');
  });

  it('每人一份，互不影响', async () => {
    const res = await request(app).get('/api/my/draft').set(auth(other.token));
    if (res.body.draft !== null) throw new Error('他人草稿不应可见');
  });

  it('覆盖式保存（不产生多份）', async () => {
    await request(app).put('/api/my/draft').set(auth(user.token))
      .send({ payload: { ...payload, title: '改过的标题' } });
    const res = await request(app).get('/api/my/draft').set(auth(user.token));
    if (res.body.draft.title !== '改过的标题') throw new Error('未覆盖: ' + res.body.draft.title);
  });

  it('删除草稿', async () => {
    const del = await request(app).delete('/api/my/draft').set(auth(user.token));
    if (!del.body.ok) throw new Error('删除失败');
    const res = await request(app).get('/api/my/draft').set(auth(user.token));
    if (res.body.draft !== null) throw new Error('删除后仍能读到草稿');
  });

  it('未登录不能读写草稿', async () => {
    if ((await request(app).get('/api/my/draft')).status !== 401) throw new Error('GET 应 401');
    if ((await request(app).put('/api/my/draft').send({ payload })).status !== 401) throw new Error('PUT 应 401');
    if ((await request(app).delete('/api/my/draft')).status !== 401) throw new Error('DELETE 应 401');
  });

  it('payload 非法或过大被拒绝', async () => {
    const bad = await request(app).put('/api/my/draft').set(auth(user.token)).send({});
    if (bad.status !== 400) throw new Error('缺 payload 应 400');

    const huge = await request(app).put('/api/my/draft').set(auth(user.token))
      .send({ payload: { title: 'x'.repeat(30000) } });
    if (huge.status !== 400) throw new Error('超大草稿应 400');
  });
});
