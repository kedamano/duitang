const { describe, it, before } = require('mocha');
const request = require('supertest');
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.DB_PATH = path.join(__dirname, 'token-renew.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

const SECRET = process.env.JWT_SECRET || 'duitang-dev-secret-key-change-in-production';
const auth = t => ({ Authorization: 'Bearer ' + t });

describe('Duitang API - JWT 滑动续期', function () {
  let token, userId;

  before(async () => {
    const stamp = Date.now();
    const r = await request(app).post('/api/auth/register')
      .send({ username: `renew_${stamp}`, nickname: '续期用户', password: '123456' });
    token = r.body.token;
    userId = r.body.user.id;
  });

  it('新签发的 token（剩余 >1 天）不触发续期头', async () => {
    const res = await request(app).get('/api/posts').set(auth(token));
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (res.headers['x-refresh-token']) throw new Error('刚签发的 token 不应续期');
  });

  it('临期 token（剩余 <1 天）响应头下发新 token', async () => {
    // 手工签一个只剩 2 小时过期的 token
    const nearly = jwt.sign({ id: userId, username: 'renew' }, SECRET, { expiresIn: '2h' });
    const res = await request(app).get('/api/posts').set(auth(nearly));
    const fresh = res.headers['x-refresh-token'];
    if (!fresh) throw new Error('缺少 X-Refresh-Token 头');
    const decoded = jwt.decode(fresh);
    const remainDays = (decoded.exp * 1000 - Date.now()) / 86400000;
    if (remainDays < 6.5) throw new Error('新 token 有效期异常: ' + remainDays.toFixed(2) + 'd');
  });

  it('续期头里的新 token 可正常鉴权且携带用户身份', async () => {
    const nearly = jwt.sign({ id: userId, username: 'renew' }, SECRET, { expiresIn: '2h' });
    const res = await request(app).get('/api/posts').set(auth(nearly));
    const fresh = res.headers['x-refresh-token'];
    const me = await request(app).get('/api/auth/me').set(auth(fresh));
    if (me.status !== 200 || me.body.user.id !== userId) {
      throw new Error('新 token 鉴权失败: ' + JSON.stringify(me.body));
    }
  });

  it('已过期 token 不续期；公开接口忽略它，受保护接口 401', async () => {
    const expired = jwt.sign({ id: userId, username: 'renew' }, SECRET, { expiresIn: '-1s' });
    const pub = await request(app).get('/api/posts').set(auth(expired));
    if (pub.status !== 200) throw new Error('公开接口应忽略无效 token, status=' + pub.status);
    if (pub.headers['x-refresh-token']) throw new Error('过期 token 不应续期');
    const prot = await request(app).get('/api/auth/me').set(auth(expired));
    if (prot.status !== 401) throw new Error('受保护接口应 401, status=' + prot.status);
  });

  it('未登录请求不受续期逻辑影响（无公开接口报错）', async () => {
    const res = await request(app).get('/api/posts?limit=1');
    if (res.status !== 200 || !res.body.posts) throw new Error('status=' + res.status);
  });
});
