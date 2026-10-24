const { describe, it, before } = require('mocha');
const request = require('supertest');
const path = require('path');

process.env.DB_PATH = path.join(__dirname, 'albums.sqlite');
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

describe('Duitang API - 专辑', function () {
  let owner, other;
  let postA, postB;

  before(async () => {
    owner = await register('alb_owner', '专辑主人');
    other = await register('alb_other', '路人');

    postA = (await request(app).post('/api/posts').set(auth(owner.token))
      .send({ title: '专辑图片A', images: ['/uploads/a.jpg'], thumbs: ['/uploads/a_w400.jpg'], board: 'food', tags: [] })).body.post.id;
    postB = (await request(app).post('/api/posts').set(auth(owner.token))
      .send({ title: '专辑图片B', images: ['/uploads/b.jpg'], thumbs: ['/uploads/b_w400.jpg'], board: 'food', tags: [] })).body.post.id;
  });

  it('创建专辑并校验必填', async () => {
    const bad = await request(app).post('/api/albums').set(auth(owner.token)).send({ title: '  ' });
    if (bad.status !== 400) throw new Error('空标题应 400, 实际 ' + bad.status);

    const res = await request(app).post('/api/albums').set(auth(owner.token))
      .send({ title: '我的美食专辑', description: '好吃的都在这' });
    if (res.status !== 200) throw new Error('创建失败 status=' + res.status);
    if (res.body.album.title !== '我的美食专辑') throw new Error('标题未保存');
    if (res.body.album.is_public !== true) throw new Error('默认应公开');
    if (res.body.album.post_count !== 0) throw new Error('新专辑条目应为 0');
  });

  it('未登录不能创建专辑', async () => {
    const res = await request(app).post('/api/albums').send({ title: '匿名专辑' });
    if (res.status !== 401) throw new Error('expected 401, got ' + res.status);
  });

  it('收进专辑后列表返回条目数与封面', async () => {
    const album = (await request(app).post('/api/albums').set(auth(owner.token))
      .send({ title: '封面测试' })).body.album;

    await request(app).post(`/api/albums/${album.id}/posts`).set(auth(owner.token)).send({ post_id: postA });
    await request(app).post(`/api/albums/${album.id}/posts`).set(auth(owner.token)).send({ post_id: postB });

    const list = await request(app).get(`/api/users/${owner.id}/albums`).set(auth(owner.token));
    const found = list.body.albums.find(a => a.id === album.id);
    if (!found) throw new Error('列表未返回专辑');
    if (found.post_count !== 2) throw new Error('条目数应为 2, 实际 ' + found.post_count);
    if (!found.cover) throw new Error('缺少封面');
    if (!found.cover.includes('_w400')) throw new Error('封面应优先用缩略图: ' + found.cover);
  });

  it('重复收进同一专辑不会重复计数', async () => {
    const album = (await request(app).post('/api/albums').set(auth(owner.token)).send({ title: '幂等测试' })).body.album;
    await request(app).post(`/api/albums/${album.id}/posts`).set(auth(owner.token)).send({ post_id: postA });
    const again = await request(app).post(`/api/albums/${album.id}/posts`).set(auth(owner.token)).send({ post_id: postA });
    if (again.body.count !== 1) throw new Error('重复添加后应为 1, 实际 ' + again.body.count);
  });

  it('专辑详情返回帖子与归属信息', async () => {
    const album = (await request(app).post('/api/albums').set(auth(owner.token)).send({ title: '详情测试' })).body.album;
    await request(app).post(`/api/albums/${album.id}/posts`).set(auth(owner.token)).send({ post_id: postA });

    const res = await request(app).get(`/api/albums/${album.id}`).set(auth(owner.token));
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (res.body.posts.length !== 1) throw new Error('应返回 1 条帖子');
    if (res.body.posts[0].id !== postA) throw new Error('帖子 id 不符');
    if (res.body.owner.nickname !== '专辑主人') throw new Error('owner 信息错误');
    if (res.body.owned_by_me !== true) throw new Error('owned_by_me 应为 true');
    if (res.body.total !== 1) throw new Error('total 应为 1');
  });

  it('移出专辑后条目数减少', async () => {
    const album = (await request(app).post('/api/albums').set(auth(owner.token)).send({ title: '移出测试' })).body.album;
    await request(app).post(`/api/albums/${album.id}/posts`).set(auth(owner.token)).send({ post_id: postA });
    const res = await request(app).delete(`/api/albums/${album.id}/posts/${postA}`).set(auth(owner.token));
    if (res.body.count !== 0) throw new Error('移出后应为 0, 实际 ' + res.body.count);
  });

  it('私密专辑不出现在他人列表，详情返回 403', async () => {
    const album = (await request(app).post('/api/albums').set(auth(owner.token))
      .send({ title: '私密专辑', is_public: false })).body.album;

    const otherList = await request(app).get(`/api/users/${owner.id}/albums`).set(auth(other.token));
    if (otherList.body.albums.some(a => a.id === album.id)) throw new Error('他人列表不应出现私密专辑');

    const otherDetail = await request(app).get(`/api/albums/${album.id}`).set(auth(other.token));
    if (otherDetail.status !== 403) throw new Error('他人访问私密专辑应 403, 实际 ' + otherDetail.status);

    const selfDetail = await request(app).get(`/api/albums/${album.id}`).set(auth(owner.token));
    if (selfDetail.status !== 200) throw new Error('本人访问私密专辑应 200');
  });

  it('非本人不能编辑/删除专辑或增删条目', async () => {
    const album = (await request(app).post('/api/albums').set(auth(owner.token)).send({ title: '权限测试' })).body.album;

    const patch = await request(app).patch(`/api/albums/${album.id}`).set(auth(other.token)).send({ title: '篡改' });
    if (patch.status !== 403) throw new Error('改他人专辑应 403');

    const add = await request(app).post(`/api/albums/${album.id}/posts`).set(auth(other.token)).send({ post_id: postA });
    if (add.status !== 403) throw new Error('往他人专辑加图应 403');

    const del = await request(app).delete(`/api/albums/${album.id}`).set(auth(other.token));
    if (del.status !== 403) throw new Error('删他人专辑应 403');
  });

  it('收藏时带上 album_id 会同时收进专辑', async () => {
    const album = (await request(app).post('/api/albums').set(auth(other.token)).send({ title: '收藏联动' })).body.album;
    const res = await request(app).post(`/api/posts/${postB}/collect`).set(auth(other.token))
      .send({ album_id: album.id });
    if (!res.body.collected) throw new Error('收藏失败');
    if (res.body.added_to_album !== true) throw new Error('未标记收进专辑');

    const detail = await request(app).get(`/api/albums/${album.id}`).set(auth(other.token));
    if (!detail.body.posts.some(p => p.id === postB)) throw new Error('专辑内未找到帖子');
  });

  it('用别人的专辑 id 收藏不会误加', async () => {
    const ownerAlbum = (await request(app).post('/api/albums').set(auth(owner.token)).send({ title: '别人的专辑' })).body.album;
    const target = (await request(app).post('/api/posts').set(auth(owner.token))
      .send({ title: '目标图', images: ['/uploads/t.jpg'], board: 'food', tags: [] })).body.post.id;

    const res = await request(app).post(`/api/posts/${target}/collect`).set(auth(other.token))
      .send({ album_id: ownerAlbum.id });
    if (res.body.added_to_album !== false) throw new Error('不应标记成功');

    const detail = await request(app).get(`/api/albums/${ownerAlbum.id}`).set(auth(owner.token));
    if (detail.body.posts.some(p => p.id === target)) throw new Error('他人专辑被误加');
  });

  it('删除专辑会级联清理关联', async () => {
    const album = (await request(app).post('/api/albums').set(auth(owner.token)).send({ title: '待删除' })).body.album;
    await request(app).post(`/api/albums/${album.id}/posts`).set(auth(owner.token)).send({ post_id: postA });

    const del = await request(app).delete(`/api/albums/${album.id}`).set(auth(owner.token));
    if (!del.body.ok) throw new Error('删除失败');

    const detail = await request(app).get(`/api/albums/${album.id}`).set(auth(owner.token));
    if (detail.status !== 404) throw new Error('删除后应 404');
  });

  it('my/albums 返回轻量列表', async () => {
    const res = await request(app).get('/api/my/albums').set(auth(owner.token));
    if (res.status !== 200) throw new Error('status=' + res.status);
    if (!Array.isArray(res.body.albums)) throw new Error('结构错误');
    if (!res.body.albums.every(a => typeof a.post_count === 'number')) throw new Error('缺少 post_count');
  });
});
