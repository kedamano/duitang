const { describe, it, before, after } = require('mocha');
const request = require('supertest');
const path = require('path');
const http = require('http');

process.env.DB_PATH = path.join(__dirname, 'advanced.sqlite');
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

describe('Duitang API - 评论楼中楼', function () {
  let a, b, c;
  let postId, rootCommentId;

  before(async () => {
    a = await register('th_a', '楼主');
    b = await register('th_b', '回复者');
    c = await register('th_c', '路人');

    postId = (await request(app).post('/api/posts').set(auth(a.token))
      .send({ title: '楼中楼测试', images: ['/uploads/t.jpg'], board: 'food', tags: [] })).body.post.id;

    rootCommentId = (await request(app).post(`/api/posts/${postId}/comments`).set(auth(b.token))
      .send({ content: '顶层评论' })).body.comment.id;
  });

  it('顶层评论 parent_id 为 0', async () => {
    const res = await request(app).get(`/api/posts/${postId}/comments`);
    const top = res.body.comments.find(x => x.id === rootCommentId);
    if (!top) throw new Error('未返回顶层评论');
    if (top.parent_id !== 0) throw new Error('顶层评论 parent_id 应为 0, 实际 ' + top.parent_id);
  });

  it('回复挂在顶层评论下并返回 reply_to_nickname', async () => {
    const res = await request(app).post(`/api/posts/${postId}/comments`).set(auth(c.token))
      .send({ content: '回复楼主', parent_id: rootCommentId });
    if (res.status !== 200) throw new Error('回复失败 status=' + res.status);
    if (res.body.comment.parent_id !== rootCommentId) throw new Error('parent_id 未设置为顶层评论');
    if (res.body.comment.reply_to_nickname !== '回复者') {
      throw new Error('reply_to_nickname 错误: ' + res.body.comment.reply_to_nickname);
    }
  });

  it('回复的回复仍挂到同一顶层（只一层嵌套）', async () => {
    const child = (await request(app).get(`/api/posts/${postId}/comments`)).body.comments
      .find(x => x.id === rootCommentId).replies[0];
    const res = await request(app).post(`/api/posts/${postId}/comments`).set(auth(a.token))
      .send({ content: '楼主的再回复', parent_id: child.id });
    if (res.body.comment.parent_id !== rootCommentId) {
      throw new Error('二级回复应归并到顶层, 实际 parent_id=' + res.body.comment.parent_id);
    }
  });

  it('列表内嵌回复并给出 reply_count', async () => {
    const res = await request(app).get(`/api/posts/${postId}/comments`);
    const top = res.body.comments.find(x => x.id === rootCommentId);
    if (top.reply_count !== 2) throw new Error('reply_count 应为 2, 实际 ' + top.reply_count);
    if (!Array.isArray(top.replies) || top.replies.length !== 2) throw new Error('内嵌回复数量错误');
    if (res.body.total_all < 3) throw new Error('total_all 应统计全部评论');
    if (res.body.total !== 1) throw new Error('total 只统计顶层评论, 实际 ' + res.body.total);
  });

  it('回复不合法父评论返回 400', async () => {
    const otherPost = (await request(app).post('/api/posts').set(auth(a.token))
      .send({ title: '另一个帖子', images: ['/uploads/o.jpg'], board: 'food', tags: [] })).body.post.id;
    const foreign = (await request(app).post(`/api/posts/${otherPost}/comments`).set(auth(b.token))
      .send({ content: '别的帖子的评论' })).body.comment.id;

    const res = await request(app).post(`/api/posts/${postId}/comments`).set(auth(c.token))
      .send({ content: '跨帖子回复', parent_id: foreign });
    if (res.status !== 400) throw new Error('expected 400, got ' + res.status);

    const missing = await request(app).post(`/api/posts/${postId}/comments`).set(auth(c.token))
      .send({ content: '回复不存在的评论', parent_id: 99999999 });
    if (missing.status !== 400) throw new Error('expected 400 for missing parent, got ' + missing.status);
  });

  it('回复通知发给被回复的人（type=reply）', async () => {
    const res = await request(app).get('/api/notifications').set(auth(b.token));
    const reply = res.body.notifications.find(n => n.type === 'reply');
    if (!reply) throw new Error('被回复者未收到 reply 通知');
    if (reply.comment_id !== rootCommentId && !reply.comment_id) throw new Error('通知缺少评论关联');
  });

  it('回复自己的评论不产生通知', async () => {
    const before = (await request(app).get('/api/notifications').set(auth(b.token))).body.total;
    const own = (await request(app).post(`/api/posts/${postId}/comments`).set(auth(b.token))
      .send({ content: '回复自己', parent_id: rootCommentId })).body.comment.id;
    const after = (await request(app).get('/api/notifications').set(auth(b.token))).body.total;
    if (after > before) throw new Error('回复自己不应产生通知');
    if (!own) throw new Error('回复创建失败');
  });

  it('/api/comments/:id/replies 可分页获取回复', async () => {
    const res = await request(app).get(`/api/comments/${rootCommentId}/replies`).query({ page: 1, limit: 1 });
    if (res.body.comments.length !== 1) throw new Error('limit 未生效');
    if (res.body.total !== 3) throw new Error('回复总数应为 3, 实际 ' + res.body.total);
  });
});

describe('Duitang API - 通知偏好', function () {
  let a, b;
  let postId;

  before(async () => {
    a = await register('pf_a', '偏好甲');
    b = await register('pf_b', '偏好乙');
    postId = (await request(app).post('/api/posts').set(auth(a.token))
      .send({ title: '偏好测试', images: ['/uploads/p.jpg'], board: 'food', tags: [] })).body.post.id;
  });

  it('默认偏好为空对象（全部开启）', async () => {
    const res = await request(app).get('/api/users/me/notify-prefs').set(auth(a.token));
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (typeof res.body.prefs !== 'object') throw new Error('prefs 结构错误');
    if (!Array.isArray(res.body.types) || !res.body.types.includes('like')) throw new Error('缺少类型列表');
  });

  it('关闭点赞通知后不再收到点赞消息', async () => {
    await request(app).patch('/api/users/me/notify-prefs').set(auth(a.token))
      .send({ prefs: { like: false } });

    await request(app).post(`/api/posts/${postId}/like`).set(auth(b.token));
    const list = await request(app).get('/api/notifications').set(auth(a.token));
    if (list.body.notifications.some(n => n.type === 'like')) {
      throw new Error('已关闭点赞通知但仍收到消息');
    }
  });

  it('未关闭的类型仍然生效', async () => {
    await request(app).post(`/api/posts/${postId}/comments`).set(auth(b.token)).send({ content: '评论仍应通知' });
    const list = await request(app).get('/api/notifications').set(auth(a.token));
    if (!list.body.notifications.some(n => n.type === 'comment')) {
      throw new Error('评论通知被误关');
    }
  });

  it('重新开启后恢复接收', async () => {
    await request(app).patch('/api/users/me/notify-prefs').set(auth(a.token))
      .send({ prefs: { like: true } });
    await request(app).post(`/api/posts/${postId}/like`).set(auth(b.token)); // 取消点赞
    await request(app).post(`/api/posts/${postId}/like`).set(auth(b.token)); // 重新点赞
    const list = await request(app).get('/api/notifications').set(auth(a.token));
    if (!list.body.notifications.some(n => n.type === 'like')) throw new Error('重新开启后仍收不到');
  });

  it('非法参数返回 400，未知类型被忽略', async () => {
    const bad = await request(app).patch('/api/users/me/notify-prefs').set(auth(a.token)).send({ prefs: 'x' });
    if (bad.status !== 400) throw new Error('expected 400, got ' + bad.status);

    const res = await request(app).patch('/api/users/me/notify-prefs').set(auth(a.token))
      .send({ prefs: { like: false, hacked: true } });
    if (res.body.prefs.hacked !== undefined) throw new Error('未知类型未被过滤');
  });

  it('未登录访问偏好返回 401', async () => {
    const res = await request(app).get('/api/users/me/notify-prefs');
    if (res.status !== 401) throw new Error('expected 401, got ' + res.status);
  });
});

describe('Duitang API - SSE 实时通知', function () {
  let server;
  let port;
  let a, b;
  let postId;

  before(async () => {
    a = await register('sse_a', 'SSE甲');
    b = await register('sse_b', 'SSE乙');
    postId = (await request(app).post('/api/posts').set(auth(a.token))
      .send({ title: 'SSE 测试', images: ['/uploads/s.jpg'], board: 'food', tags: [] })).body.post.id;
    server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    port = server.address().port;
  });

  after(() => { if (server) server.close(); });

  /** 建立 SSE 连接，收集事件文本 */
  const connectSSE = (token) => new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/api/notifications/stream?token=${encodeURIComponent(token)}`, res => {
      let buf = '';
      const state = { req, res, events: [], buf: () => buf, raw: '' };
      res.on('data', chunk => {
        buf += chunk.toString();
        state.raw = buf;
        const lines = buf.split('\n\n');
        buf = lines.pop() || '';
        for (const block of lines) {
          const evLine = block.split('\n').find(l => l.startsWith('event: '));
          const dataLine = block.split('\n').find(l => l.startsWith('data: '));
          if (evLine) {
            let data = null;
            if (dataLine) { try { data = JSON.parse(dataLine.slice(6)); } catch { data = dataLine.slice(6); } }
            state.events.push({ event: evLine.slice(7).trim(), data });
          }
        }
      });
      resolve(state);
    });
    req.on('error', reject);
  });

  const waitFor = async (state, predicate, ms = 4000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const hit = state.events.find(predicate);
      if (hit) return hit;
      await new Promise(r => setTimeout(r, 50));
    }
    return null;
  };

  it('无效 token 返回 401', async () => {
    const status = await new Promise(resolve => {
      http.get(`http://127.0.0.1:${port}/api/notifications/stream?token=bad`, res => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', () => resolve(0));
    });
    if (status !== 401) throw new Error('expected 401, got ' + status);
  });

  it('连接后收到 ready 事件，点赞后实时收到 notification', async () => {
    const sse = await connectSSE(a.token);
    const ready = await waitFor(sse, e => e.event === 'ready');
    if (!ready) throw new Error('未收到 ready 事件');

    await request(app).post(`/api/posts/${postId}/like`).set(auth(b.token));

    const pushed = await waitFor(sse, e => e.event === 'notification');
    if (!pushed) throw new Error('未收到实时通知');
    if (pushed.data.type !== 'like') throw new Error('推送类型错误: ' + pushed.data.type);
    if (typeof pushed.data.unread !== 'number') throw new Error('推送缺少 unread');

    sse.req.destroy();
  });

  it('关闭通知偏好后不再推送', async () => {
    await request(app).patch('/api/users/me/notify-prefs').set(auth(a.token))
      .send({ prefs: { like: false } });
    const sse = await connectSSE(a.token);
    await waitFor(sse, e => e.event === 'ready');

    await request(app).post(`/api/posts/${postId}/like`).set(auth(b.token)); // 取消
    await request(app).post(`/api/posts/${postId}/like`).set(auth(b.token)); // 再点赞

    const pushed = await waitFor(sse, e => e.event === 'notification', 1200);
    if (pushed) throw new Error('已关闭偏好却仍收到推送');

    sse.req.destroy();
    await request(app).patch('/api/users/me/notify-prefs').set(auth(a.token)).send({ prefs: { like: true } });
  });
});

describe('Duitang API - @提及与通知偏好层级', function () {
  let author, mentioner, other;
  let postId;
  const auth = t => ({ Authorization: 'Bearer ' + t });
  const unread = async t => (await request(app).get('/api/notifications/unread').set(auth(t))).body.count;

  before(async () => {
    const stamp = Date.now();
    author = await register('mt_author', '楼主甲');
    mentioner = await register('mt_mentioner', '回复者乙');
    other = await register('mt_other', '路人丙');
    postId = (await request(app).post('/api/posts').set(auth(author.token))
      .send({ title: '@提及测试', images: ['/uploads/m.jpg'], board: 'food', tags: [] })).body.post.id;
  });

  it('评论里的 @昵称 会通知被提到者', async () => {
    await request(app).post(`/api/posts/${postId}/comments`).set(auth(mentioner.token))
      .send({ content: '@楼主甲 来围观一下' });

    const data = await request(app).get('/api/notifications').set(auth(author.token));
    const mention = data.body.notifications.find(n => n.type === 'mention');
    if (!mention) throw new Error('被 @ 的人未收到 mention 通知');
    if (mention.actor.nickname !== '回复者乙') throw new Error('触发者信息错误');
    if (mention.comment_id) {
      const comment = (await request(app).get(`/api/posts/${postId}/comments`)).body.comments[0];
      if (comment.id !== mention.comment_id) throw new Error('通知关联评论错误');
    }
  });

  it('回复里的 @昵称 也会通知被提到者', async () => {
    const top = (await request(app).get(`/api/posts/${postId}/comments`)).body.comments[0];
    await request(app).post(`/api/posts/${postId}/comments`).set(auth(other.token))
      .send({ content: '@回复者乙 这条回复', parent_id: top.id });

    const data = await request(app).get('/api/notifications').set(auth(mentioner.token));
    if (!data.body.notifications.some(n => n.type === 'mention')) {
      throw new Error('被 @ 者未收到回复中的 mention 通知');
    }
  });

  it('@自己不会产生通知', async () => {
    const before = await unread(author.token);
    await request(app).post(`/api/posts/${postId}/comments`).set(auth(author.token))
      .send({ content: '@楼主甲 自问自答' });
    const after = await unread(author.token);
    if (after > before) throw new Error('@自己不应产生通知');
  });

  it('未被 @ 的用户不受影响', async () => {
    const before = await unread(other.token);
    await request(app).post(`/api/posts/${postId}/comments`).set(auth(mentioner.token))
      .send({ content: '这是一条没有 @ 的评论' });
    const after = await unread(other.token);
    if (after > before) throw new Error('未被提及者不应收到通知');
  });

  it('设置「仅关注的人」后，未关注我的人不再通知', async () => {
    // other 尚未关注 author
    await request(app).patch('/api/users/me/notify-prefs').set(auth(author.token))
      .send({ prefs: { comment: 'followers' } });

    const before = await unread(author.token);
    await request(app).post(`/api/posts/${postId}/comments`).set(auth(other.token))
      .send({ content: '非关注者的评论' });
    const after = await unread(author.token);
    if (after > before) throw new Error('未关注者评论仍触发了通知');
  });

  it('关注我的人仍能触发通知', async () => {
    await request(app).post(`/api/users/${author.id}/follow`).set(auth(other.token));
    const before = await unread(author.token);
    await request(app).post(`/api/posts/${postId}/comments`).set(auth(other.token))
      .send({ content: '关注者的评论' });
    const after = await unread(author.token);
    if (after <= before) throw new Error('关注者评论未触发通知');
  });

  it('偏好接口接受 followers 取值', async () => {
    const res = await request(app).patch('/api/users/me/notify-prefs').set(auth(author.token))
      .send({ prefs: { mention: 'followers', collect: false } });
    if (res.body.prefs.mention !== 'followers') throw new Error('mention 未保存为 followers');
    if (res.body.prefs.collect !== false) throw new Error('collect 未保存为 false');
    // 非法取值被忽略
    const bad = await request(app).patch('/api/users/me/notify-prefs').set(auth(author.token))
      .send({ prefs: { like: 'bogus' } });
    if (bad.body.prefs.like !== undefined) throw new Error('非法取值未被忽略');
    // 恢复默认
    await request(app).patch('/api/users/me/notify-prefs').set(auth(author.token))
      .send({ prefs: { comment: true, like: true, mention: true } });
  });
});

describe('Duitang API - 图片尺寸变体', function () {
  let token;
  const auth = () => ({ Authorization: 'Bearer ' + token });
  const created = [];

  before(async () => {
    const stamp = Date.now();
    token = (await request(app).post('/api/auth/register')
      .send({ username: `var_${stamp}`, nickname: '变体', password: '123456' })).body.token;
  });

  after(() => {
    const path = require('path');
    const fs = require('fs');
    const dir = path.join(__dirname, '..', 'uploads');
    for (const f of created) {
      try { fs.unlinkSync(path.join(dir, f)); } catch {}
    }
  });

  it('上传返回升序变体且原图保留', async () => {
    const Jimp = require('jimp');
    const buf = await new Jimp(1600, 900, 0x2255ff).getBufferAsync(Jimp.MIME_JPEG);
    const res = await request(app).post('/api/upload').set(auth()).attach('file', buf, 'big.jpg');
    if (res.status !== 200) throw new Error('上传失败 status=' + res.status);
    const variants = res.body.variants || [];
    if (variants.length !== 2) throw new Error('应生成 400/800 两档, 实际 ' + JSON.stringify(variants));
    if (variants[0].width !== 400 || variants[1].width !== 800) throw new Error('变体宽度错误');
    if (variants[0].url === variants[1].url) throw new Error('不同档位不能是同一文件');
    // 原图文件存在
    const fs = require('fs');
    const fsPath = require('path');
    if (!fs.existsSync(fsPath.join(__dirname, '..', 'uploads', res.body.url.replace('/uploads/', '')))) {
      throw new Error('原图文件不存在');
    }
    created.push(res.body.url.replace('/uploads/', ''), ...variants.map(v => v.url.replace('/uploads/', '')));
  });

  it('帖子保存变体并在列表返回', async () => {
    const up = await request(app).post('/api/upload').set(auth())
      .attach('file', await new (require('jimp'))(1200, 800, 0x112233).getBufferAsync('image/jpeg'), 'a.jpg');
    created.push(up.body.url.replace('/uploads/', ''), ...(up.body.variants || []).map(v => v.url.replace('/uploads/', '')));

    const post = await request(app).post('/api/posts').set(auth()).send({
      title: '变体测试帖',
      images: [up.body.url],
      thumbs: [up.body.variants[0].url],
      variants: [up.body.variants],
      sizes: [{ w: 1200, h: 800 }],
      board: 'food',
    });
    if (!Array.isArray(post.body.post.images_variants)) throw new Error('创建响应缺少 images_variants');
    if (post.body.post.images_variants[0][0].width !== 400) throw new Error('变体未按预期保存');

    const list = await request(app).get('/api/posts').query({ q: '变体测试帖' });
    const found = list.body.posts.find(p => p.id === post.body.post.id);
    if (!found) throw new Error('列表未找到帖子');
    if (found.images_variants[0][0].width !== 400) throw new Error('列表未返回变体');
  });

  it('未传变体时回落为单档原图', async () => {
    const post = await request(app).post('/api/posts').set(auth()).send({
      title: '无变体帖',
      images: ['/uploads/plain.jpg'],
      board: 'food',
    });
    const entry = post.body.post.images_variants[0];
    if (entry.length !== 1) throw new Error('应回落为单档, 实际 ' + JSON.stringify(entry));
    if (entry[0].url !== '/uploads/plain.jpg') throw new Error('变体 URL 错误');
  });
});
