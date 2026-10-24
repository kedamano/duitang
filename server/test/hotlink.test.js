const { describe, it, before, after } = require('mocha');
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

// 防盗链开关在模块加载时读取，这里提前设置
process.env.UPLOAD_HOTLINK_PROTECT = '1';
process.env.UPLOAD_SIGN_SECRET = 'test-secret';
process.env.WATERMARK_TEXT = 'duitang test';
process.env.DB_PATH = path.join(__dirname, 'hotlink.sqlite');
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_DISABLED = '1';

const app = require('../index');
const { signFile, verifyFile, hotlinkGuard } = require('../upload-guard');

const auth = t => ({ Authorization: 'Bearer ' + t });

describe('Duitang API - 防盗链与水印', function () {
  let token;
  let uploadedName = null;
  const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

  before(async () => {
    const stamp = Date.now();
    token = (await request(app).post('/api/auth/register')
      .send({ username: `hl_${stamp}`, nickname: '防盗链', password: '123456' })).body.token;
  });

  after(() => {
    if (uploadedName) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, uploadedName)); } catch {}
    }
  });

  it('签名可通过校验，错误签名被拒绝', () => {
    const sign = signFile('a.jpg');
    if (!verifyFile('a.jpg', sign)) throw new Error('正确签名校验失败');
    if (verifyFile('a.jpg', '123.abc')) throw new Error('错误签名未被拒绝');
    if (verifyFile('b.jpg', sign)) throw new Error('签名未绑定文件名');
    if (verifyFile('a.jpg', '')) throw new Error('空签名未被拒绝');
  });

  it('上传返回签名与水印副本', async () => {
    const buf = await new Jimp(800, 600, 0x3366ff).getBufferAsync(Jimp.MIME_JPEG);
    const res = await request(app).post('/api/upload').set(auth(token)).attach('file', buf, 'hl.jpg');
    if (res.status !== 200) throw new Error('上传失败 status=' + res.status);
    if (!res.body.sign) throw new Error('缺少签名');
    if (!res.body.watermarked) throw new Error('缺少水印副本地址');

    uploadedName = res.body.url.replace('/uploads/', '');
    const wmName = res.body.watermarked.replace('/uploads/', '');
    if (!fs.existsSync(path.join(UPLOAD_DIR, wmName))) throw new Error('水印文件不存在');
    // 水印图应可正常读取
    const wm = await Jimp.read(path.join(UPLOAD_DIR, wmName));
    if (wm.bitmap.width !== 800) throw new Error('水印图尺寸异常');
  });

  it('未签名的图片请求被拒绝', async () => {
    const buf = await new Jimp(400, 300, 0x11aa22).getBufferAsync(Jimp.MIME_JPEG);
    const up = await request(app).post('/api/upload').set(auth(token)).attach('file', buf, 'raw.jpg');
    const name = up.body.url.replace('/uploads/', '');

    const noSign = await request(app).get(`/uploads/${name}`);
    if (noSign.status !== 403) throw new Error('无签名应 403, 实际 ' + noSign.status);

    const badSign = await request(app).get(`/uploads/${name}?sign=1.deadbeef`);
    if (badSign.status !== 403) throw new Error('错误签名应 403, 实际 ' + badSign.status);

    const good = await request(app).get(`/uploads/${name}?sign=${encodeURIComponent(signFile(name))}`);
    if (good.status !== 200) throw new Error('正确签名应 200, 实际 ' + good.status);

    try { fs.unlinkSync(path.join(UPLOAD_DIR, name)); } catch {}
  });

  it('帖子接口下发的图片地址带签名', async () => {
    const buf = await new Jimp(400, 300, 0x22bb33).getBufferAsync(Jimp.MIME_JPEG);
    const up = await request(app).post('/api/upload').set(auth(token)).attach('file', buf, 'signed.jpg');
    const post = await request(app).post('/api/posts').set(auth(token)).send({
      title: '防盗链测试', images: [up.body.url], board: 'food', tags: [],
    });
    if (!post.body.post.image_signs || !post.body.post.image_signs[0]) {
      throw new Error('帖子未下发签名: ' + JSON.stringify(post.body.post.image_signs));
    }
    // 变体也应带签名
    const signs = post.body.post.variant_signs || [];
    if (!signs.length || !signs[0].length) throw new Error('变体未下发签名');
    if (!signs[0][0].sign) throw new Error('变体签名缺失');

    const list = await request(app).get('/api/posts').query({ q: '防盗链测试' });
    const found = list.body.posts.find(p => p.id === post.body.post.id);
    if (!found) throw new Error('列表未找到帖子');
    if (!found.image_signs || !found.image_signs[0]) throw new Error('列表未下发签名');
  });

  it('防盗链中间件在缺少签名时拦截', () => {
    // 本测试文件开启了 UPLOAD_HOTLINK_PROTECT=1，无签名应被拦截
    let nextCalled = false;
    let statusCode = null;
    hotlinkGuard(
      { path: '/x.jpg', query: {}, headers: {} },
      { status: (c) => { statusCode = c; return { json: () => {} }; } },
      () => { nextCalled = true; },
    );
    if (nextCalled) throw new Error('缺少签名时不应放行');
    if (statusCode !== 403) throw new Error('应为 403, 实际 ' + statusCode);
  });
});
