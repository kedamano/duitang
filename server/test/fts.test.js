const { describe, it, before } = require('mocha');
const request = require('supertest');
const path = require('path');

process.env.DB_PATH = path.join(__dirname, 'fts.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');
const { toSearchTerms } = require('../search-index');

const auth = t => ({ Authorization: 'Bearer ' + t });

describe('Duitang API - FTS5 全文检索（中文二元组）', function () {
  let token;

  before(async () => {
    const stamp = Date.now();
    token = (await request(app).post('/api/auth/register')
      .send({ username: `fts_${stamp}`, nickname: '检索用户', password: '123456' })).body.token;

    const mk = (title, description, tags) => request(app).post('/api/posts').set(auth(token))
      .send({ title, description, images: ['/uploads/f.jpg'], board: 'food', tags: tags || [], sizes: [{ w: 400, h: 300 }] });

    await mk('汉服写真合集', '古风少女的汉服外拍记录', ['汉服', '古风']);
    await mk('美食探店日记', '这家日料真的很好吃', ['美食']);
    await mk('壁纸分享第一弹', '适合手机的高清壁纸', ['壁纸']);
  });

  it('二元组切词规则正确', () => {
    if (toSearchTerms('汉服写真') !== '汉服 服写 写真') throw new Error(toSearchTerms('汉服写真'));
    if (toSearchTerms('汉服') !== '汉服') throw new Error(toSearchTerms('汉服'));
    if (!toSearchTerms('穿搭 wallpaper').includes('wallpaper')) throw new Error('英文未保留');
  });

  it('2 字中文可搜到（trigram 做不到的场景）', async () => {
    const res = await request(app).get('/api/posts').query({ q: '汉服' });
    if (res.status !== 200) throw new Error('status=' + res.status);
    const hit = res.body.posts.find(p => p.title.includes('汉服写真合集'));
    if (!hit) throw new Error('2 字查询未命中: ' + JSON.stringify(res.body.posts.map(p => p.title)));
  });

  it('2 字中文可搜到「壁纸」「美食」', async () => {
    for (const kw of ['壁纸', '美食']) {
      const res = await request(app).get('/api/posts').query({ q: kw });
      const titles = res.body.posts.map(p => p.title).join('|');
      if (!titles.includes(kw)) throw new Error(`${kw} 未命中: ${titles}`);
    }
  });

  it('3 字以上中文可搜到', async () => {
    const res = await request(app).get('/api/posts').query({ q: '美食探店' });
    if (!res.body.posts.some(p => p.title.includes('美食探店'))) {
      throw new Error('3 字查询未命中');
    }
  });

  it('描述中的词也能搜到', async () => {
    const res = await request(app).get('/api/posts').query({ q: '日料' });
    if (!res.body.posts.some(p => p.title.includes('美食探店'))) {
      throw new Error('描述未参与索引');
    }
  });

  it('标签可搜到', async () => {
    const res = await request(app).get('/api/posts').query({ q: '古风' });
    if (!res.body.posts.some(p => p.title.includes('汉服写真'))) {
      throw new Error('标签未参与索引');
    }
  });

  it('不存在的词返回空结果而非报错', async () => {
    const res = await request(app).get('/api/posts').query({ q: '完全不存在的词汇组合' });
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (res.body.posts.length !== 0) throw new Error('应为空, 实际 ' + res.body.posts.length);
  });

  it('搜索不区分大小写匹配英文', async () => {
    await request(app).post('/api/posts').set(auth(token))
      .send({ title: 'Wallpaper Collection', images: ['/uploads/f.jpg'], board: 'food', tags: [] });
    const res = await request(app).get('/api/posts').query({ q: 'wallpaper' });
    if (!res.body.posts.some(p => p.title.includes('Wallpaper'))) {
      throw new Error('英文大小写匹配失败');
    }
  });

  it('新建的帖子立即可被搜到', async () => {
    const created = await request(app).post('/api/posts').set(auth(token))
      .send({ title: '新鲜的猫咪图', images: ['/uploads/f.jpg'], board: 'food', tags: [] });
    const res = await request(app).get('/api/posts').query({ q: '猫咪' });
    if (!res.body.posts.some(p => p.id === created.body.post.id)) {
      throw new Error('新帖未被索引');
    }
  });

  it('编辑标题后旧词搜不到、新词搜得到', async () => {
    const created = await request(app).post('/api/posts').set(auth(token))
      .send({ title: '旧词苹果', images: ['/uploads/f.jpg'], board: 'food', tags: [] });
    const id = created.body.post.id;
    await request(app).put(`/api/posts/${id}`).set(auth(token)).send({ title: '新词香蕉' });

    const oldRes = await request(app).get('/api/posts').query({ q: '苹果' });
    if (oldRes.body.posts.some(p => p.id === id)) throw new Error('旧标题仍可搜到（索引未更新）');

    const newRes = await request(app).get('/api/posts').query({ q: '香蕉' });
    if (!newRes.body.posts.some(p => p.id === id)) throw new Error('新标题搜不到（索引未更新）');
  });

  it('删除帖子后索引同步清理', async () => {
    const created = await request(app).post('/api/posts').set(auth(token))
      .send({ title: '待删除葡萄', images: ['/uploads/f.jpg'], board: 'food', tags: [] });
    const id = created.body.post.id;
    await request(app).delete(`/api/posts/${id}`).set(auth(token));
    const res = await request(app).get('/api/posts').query({ q: '葡萄' });
    if (res.body.posts.some(p => p.id === id)) throw new Error('删除后仍能搜到');
  });

  it('搜索结果仍支持画板/标签筛选与分页', async () => {
    const res = await request(app).get('/api/posts').query({ q: '汉服', board: 'food', limit: 5 });
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (res.body.limit !== 5) throw new Error('分页参数未生效');
    for (const p of res.body.posts) {
      if (p.board !== 'food') throw new Error('画板筛选失效');
    }
  });

  it('单字查询回落 LIKE 仍能命中', async () => {
    const res = await request(app).get('/api/posts').query({ q: '猫' });
    if (res.status !== 200) throw new Error('status=' + res.status);
    // 单字无法用二元组，走 LIKE 回落，应命中「猫咪」
    if (!res.body.posts.some(p => p.title.includes('猫咪'))) {
      throw new Error('单字查询回落失败');
    }
  });

  it('画板中文名可搜到（搜「美食」能出美食画板的帖子）', async () => {
    const res = await request(app).get('/api/posts').query({ q: '美食' });
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (!res.body.posts.length) throw new Error('画板名未参与索引');
    for (const p of res.body.posts) {
      if (p.board !== 'food') throw new Error('命中非美食画板的内容: ' + p.board);
    }
  });
});
