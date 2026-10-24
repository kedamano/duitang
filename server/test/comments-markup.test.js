const { describe, it, before } = require('mocha');
const request = require('supertest');
const path = require('path');

process.env.DB_PATH = path.join(__dirname, 'comments-rich.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

const auth = t => ({ Authorization: 'Bearer ' + t });

describe('Duitang API - 评论富文本标记与清洗', function () {
  let token, postId;

  before(async () => {
    const stamp = Date.now();
    token = (await request(app).post('/api/auth/register')
      .send({ username: `cr_${stamp}`, nickname: '评论富文本', password: '123456' })).body.token;
    postId = (await request(app).post('/api/posts').set(auth(token))
      .send({ title: '评论测试帖', images: ['/uploads/c.jpg'], board: 'food', tags: [] })).body.post.id;
  });

  const add = content => request(app).post(`/api/posts/${postId}/comments`).set(auth(token)).send({ content });

  it('保留行内标记（加粗/斜体/代码/@提及）', async () => {
    const res = await add('这是 **重点** 与 *强调* 以及 `code` @某人');
    const c = res.body.comment.content;
    for (const frag of ['**重点**', '*强调*', '`code`', '@某人']) {
      if (!c.includes(frag)) throw new Error(`标记被破坏: ${frag} → ${c}`);
    }
  });

  it('剥离 HTML 标签，避免原样展示', async () => {
    const res = await add('<p>带标签的评论</p><script>alert(1)</script>');
    const c = res.body.comment.content;
    if (/<[a-z]/i.test(c)) throw new Error('HTML 未被剥离: ' + c);
    if (!c.includes('带标签的评论')) throw new Error('正常文字被误删: ' + c);
  });

  it('事件属性也不会残留', async () => {
    const res = await add('<img src=x onerror="alert(1)">你好');
    const c = res.body.comment.content;
    if (/onerror|<img/i.test(c)) throw new Error('危险内容残留: ' + c);
    if (!c.includes('你好')) throw new Error('正常文字被误删');
  });

  it('敏感词仍然打码', async () => {
    const res = await add('你是傻逼');
    if (res.body.comment.content.includes('傻逼')) throw new Error('敏感词未打码');
  });

  it('超长评论被截断到 1000 字符以内', async () => {
    const res = await add('a'.repeat(1500));
    if (res.body.comment.content.length > 1000) {
      throw new Error('未截断: ' + res.body.comment.content.length);
    }
  });

  it('回复同样经过清洗', async () => {
    const top = (await add('顶层评论')).body.comment;
    const res = await request(app).post(`/api/posts/${postId}/comments`).set(auth(token))
      .send({ content: '<b>回复</b>内容', parent_id: top.id });
    const c = res.body.comment.content;
    if (/<b>/i.test(c)) throw new Error('回复 HTML 未剥离: ' + c);
    if (!c.includes('回复')) throw new Error('回复内容被误删');
  });

  it('空评论被拒绝', async () => {
    const res = await add('   ');
    if (res.status !== 400) throw new Error('空评论应 400, 实际 ' + res.status);
  });
});
