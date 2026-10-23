const { describe, it, before } = require('mocha');
const request = require('supertest');

process.env.DB_PATH = require('path').join(__dirname, 'board-sizes.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

// 回归测试：board 中英归一化 + sizes 真实宽高持久化
describe('Duitang API - board 归一化与图片尺寸', function () {
  let token = '';

  before(async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ username: 'bs_' + Date.now(), nickname: '尺寸用户', password: '123456' });
    token = res.body.token;
  });

  it('POST /api/posts 中文画板标签被归一化为英文 key', async () => {
    const res = await request(app).post('/api/posts').set('Authorization', 'Bearer ' + token)
      .send({ title: '中文画板测试', images: ['/uploads/a.jpg'], board: '壁纸头像', tags: [] });
    if (res.body.post.board !== 'wallpaper') throw new Error('board not normalized: ' + res.body.post.board);
  });

  it('GET /api/posts?board=<中文标签> 能命中英文 key 数据', async () => {
    const res = await request(app).get('/api/posts').query({ board: '壁纸头像' });
    if (!res.body.posts.length) throw new Error('chinese board query returned nothing');
    if (res.body.posts.some(p => p.board !== 'wallpaper')) throw new Error('board filter mismatch');
  });

  it('sizes 与 images 一一对应持久化并在详情返回', async () => {
    const create = await request(app).post('/api/posts').set('Authorization', 'Bearer ' + token)
      .send({
        title: '尺寸持久化', images: ['/uploads/a.jpg', '/uploads/b.jpg'], board: 'food', tags: [],
        sizes: [{ w: 512, h: 768 }, { w: 512, h: 512 }],
      });
    const id = create.body.post.id;
    if (create.body.post.sizes.length !== 2) throw new Error('sizes not returned on create');
    const detail = await request(app).get(`/api/posts/${id}`);
    const s = detail.body.post.sizes;
    if (s[0].w !== 512 || s[0].h !== 768 || s[1].h !== 512) throw new Error('sizes mismatch: ' + JSON.stringify(s));
  });

  it('缺省 sizes 时返回空数组且不影响发布', async () => {
    const res = await request(app).post('/api/posts').set('Authorization', 'Bearer ' + token)
      .send({ title: '无尺寸', images: ['/uploads/a.jpg'], board: 'pet', tags: [] });
    if (res.status !== 200 || !Array.isArray(res.body.post.sizes)) throw new Error('default sizes failed');
  });

  it('sizes 数量与 images 不一致时安全降级为空数组', async () => {
    const res = await request(app).post('/api/posts').set('Authorization', 'Bearer ' + token)
      .send({ title: '错位尺寸', images: ['/uploads/a.jpg', '/uploads/b.jpg'], board: 'pet', tags: [], sizes: [{ w: 1, h: 1 }] });
    if (res.body.post.sizes.length !== 0) throw new Error('mismatched sizes should degrade to []');
  });

  it('images 非数组时返回 400', async () => {
    const res = await request(app).post('/api/posts').set('Authorization', 'Bearer ' + token)
      .send({ title: '坏图片字段', images: 'not-array', board: 'pet' });
    if (res.status !== 400) throw new Error('expected 400, got ' + res.status);
  });

  it('GET /api/posts/:id/comments 游客可访问（评论列表为公开读）', async () => {
    const create = await request(app).post('/api/posts').set('Authorization', 'Bearer ' + token)
      .send({ title: '游客评论', images: ['/uploads/a.jpg'], board: 'quote', tags: [] });
    const id = create.body.post.id;
    await request(app).post(`/api/posts/${id}/comments`).set('Authorization', 'Bearer ' + token)
      .send({ content: '一条游客可见评论' });
    const res = await request(app).get(`/api/posts/${id}/comments`);
    if (res.status !== 200 || res.body.comments.length !== 1) throw new Error('public comments failed');
    if (typeof res.body.comments[0].is_liked === 'undefined') throw new Error('comment missing is_liked field');
  });
});
