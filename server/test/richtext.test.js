const { describe, it, before } = require('mocha');
const request = require('supertest');
const path = require('path');

process.env.DB_PATH = path.join(__dirname, 'richtext.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';
const app = require('../index');

const auth = t => ({ Authorization: 'Bearer ' + t });

describe('Duitang API - 富文本描述消毒', function () {
  let token = '';

  before(async () => {
    const stamp = Date.now();
    token = (await request(app).post('/api/auth/register')
      .send({ username: `rich_${stamp}`, nickname: '富文本', password: '123456' })).body.token;
  });

  const create = async description => request(app).post('/api/posts').set(auth(token))
    .send({ title: '富文本测试 ' + Math.random().toString(36).slice(2, 6), images: ['/uploads/r.jpg'], board: 'food', tags: [], description });

  it('保留允许的排版标签', async () => {
    const html = '<p>你好 <strong>加粗</strong> <em>斜体</em></p><ul><li>条目一</li></ul>';
    const res = await create(html);
    if (res.status !== 200) throw new Error('创建失败 status=' + res.status);
    const d = res.body.post.description;
    if (!d.includes('<strong>') || !d.includes('<em>') || !d.includes('<ul>') || !d.includes('<li>')) {
      throw new Error('允许的标签被误删: ' + d);
    }
  });

  it('剥离 script 与事件属性', async () => {
    const html = '<p onclick="alert(1)">安全</p><script>alert("xss")</script><img src=x onerror="alert(2)">';
    const res = await create(html);
    const d = res.body.post.description;
    if (/<script/i.test(d)) throw new Error('script 未被剥离: ' + d);
    if (/onclick|onerror/i.test(d)) throw new Error('事件属性未被剥离: ' + d);
    if (/<img/i.test(d)) throw new Error('img 应被移除: ' + d);
    if (!d.includes('安全')) throw new Error('正常文本被误删: ' + d);
  });

  it('链接保留但强制加 rel 与 target', async () => {
    const res = await create('<p><a href="https://example.com">站点</a></p>');
    const d = res.body.post.description;
    if (!d.includes('href="https://example.com"')) throw new Error('链接被误删: ' + d);
    if (!d.includes('rel="noopener noreferrer"')) throw new Error('缺少 rel: ' + d);
    if (!d.includes('target="_blank"')) throw new Error('缺少 target: ' + d);
  });

  it('javascript: 协议链接被剥离', async () => {
    const res = await create('<p><a href="javascript:alert(1)">点我</a></p>');
    const d = res.body.post.description;
    if (/javascript:/i.test(d)) throw new Error('危险协议未被剥离: ' + d);
    if (!d.includes('点我')) throw new Error('链接文字被误删');
  });

  it('纯文本描述原样保留（不包标签）', async () => {
    const res = await create('就是一段普通文字');
    const d = res.body.post.description;
    if (d !== '就是一段普通文字') throw new Error('纯文本被改写: ' + d);
  });

  it('编辑时同样消毒', async () => {
    const created = await create('<p>初始</p>');
    const id = created.body.post.id;
    const res = await request(app).put(`/api/posts/${id}`).set(auth(token))
      .send({ description: '<p>改后<script>alert(1)</script><b>粗</b></p>' });
    const d = res.body.post.description;
    if (/<script/i.test(d)) throw new Error('编辑时 script 未被剥离: ' + d);
    if (!d.includes('<b>粗</b>')) throw new Error('编辑时允许标签被误删: ' + d);
  });

  it('超长描述被截断到 5000 字符以内', async () => {
    const html = '<p>' + 'a'.repeat(6000) + '</p>';
    const res = await create(html);
    if (res.body.post.description.length > 5000) {
      throw new Error('描述未被截断: ' + res.body.post.description.length);
    }
  });
});
