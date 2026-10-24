/**
 * 演示数据填充：仅在默认开发库（未设置 DB_PATH）且 posts 为空时由 database.js 调用。
 * 也可手动执行: node seed-demo.js
 */

// [board, title, description, tags, [[w,h],...]] —— 尺寸取自 picsum 实际可请求的常见比例
const DEMO_POSTS = [
  ['wallpaper', '粉色少女心壁纸', '低饱和粉紫渐变，做锁屏刚刚好', ['壁纸', '少女心'], [[400, 560]]],
  ['wallpaper', '星空银河壁纸合集', '夜里拍到的银河，压缩后依然清晰', ['壁纸', '星空'], [[400, 600], [400, 300]]],
  ['wallpaper', '云朵棉花糖系头像', '软乎乎的云，换上新头像吧', ['头像', '清新'], [[400, 400]]],
  ['pet', '慵懒午后的猫咪', '晒到太阳就会化成一摊的橘猫', ['猫咪', '萌宠'], [[400, 420]]],
  ['pet', '多肉植物养护日记', '三个月从一株变一盆的记录', ['多肉', '植物'], [[400, 300]]],
  ['travel', '复古胶片感旅行照', '京都巷子午后，胶片的颗粒感很治愈', ['旅行', '胶片'], [[400, 600]]],
  ['travel', '夕阳西下的海边', '赶在落日前到的海滩，值了', ['海边', '日落'], [[400, 500], [400, 320], [400, 460]]],
  ['travel', '京都旅行 vlog 素材', '清水寺周边的石板路与枫叶', ['京都', '旅行'], [[400, 560]]],
  ['food', '奶油蛋糕食谱分享', '零失败的家庭版草莓奶油蛋糕', ['烘焙', '蛋糕'], [[400, 380]]],
  ['food', 'ins 风沙拉碗食谱', '减脂期也能吃得好看', ['轻食', '沙拉'], [[400, 500]]],
  ['food', '草莓熊咖啡拉花', '练了两周终于成形的拉花', ['咖啡', '拉花'], [[400, 380]]],
  ['fashion', '森系女孩穿搭 inspo', '棉麻与大地色的组合最耐看', ['穿搭', '森系'], [[400, 520]]],
  ['fashion', '冬日奶茶约会穿搭', '温柔色系叠穿，保暖不臃肿', ['穿搭', '冬日'], [[400, 560]]],
  ['fashion', '奶奶灰毛衣搭配', '一件毛衣的四种穿法', ['穿搭', '秋冬'], [[400, 480]]],
  ['ancient', '汉服仙气写真', '齐胸襦裙 + 油纸伞的经典组合', ['汉服', '古风'], [[400, 640]]],
  ['ancient', '汉唐制汉服定妆照', '这次复原的是盛唐配色', ['汉服', '定妆'], [[400, 640], [400, 420]]],
  ['home', '极简风桌面布置', '把桌面清空之后效率反而高了', ['家居', '极简'], [[400, 360]]],
  ['home', '北欧风客厅设计', '白墙原木绿植，三件套搞定', ['家居', '北欧'], [[400, 540]]],
  ['home', '奶 fufu 卧室改造完成', '租房也能拥有的温柔角落', ['卧室', '改造'], [[400, 460]]],
  ['diy', '手帐素材拼贴分享', '这期的主题是秋日午后', ['手帐', '拼贴'], [[400, 430]]],
  ['diy', '可爱兔子耳朵发饰 DIY', '不织布一小时完工教程', ['DIY', '发饰'], [[400, 460]]],
  ['diy', '粘土小熊手工教程', '超轻粘土新手友好款', ['粘土', '手工'], [[400, 440]]],
  ['makeup', '日系妆容教程', '清透底妆加下垂眼睫毛', ['妆容', '日系'], [[400, 480]]],
  ['makeup', '黄金比例裸妆教程', '伪素颜的关键在三处高光', ['裸妆', '教程'], [[400, 520]]],
  ['anime', '动漫风景插画精选', '新海诚式的云层渲染练习', ['插画', '动漫'], [[400, 450]]],
  ['anime', '手绘水彩小花束', '湿画法练手，颜色没控制住但很意外', ['水彩', '手绘'], [[400, 500]]],
  ['quote', '雨天治愈系文字', '「雨会停，天会晴，没有什么会一直糟糕透顶。」', ['文字', '治愈'], [[400, 390]]],
  ['quote', '深夜摘抄第 12 期', '关于告别的七句话', ['文字', '摘抄'], [[400, 420]]],
  ['wedding', '婚礼花艺布置灵感', '白绿色系的手捧花与桌花', ['婚礼', '花艺'], [[400, 580]]],
  ['wedding', '婚纱照外景清单', '这十个取景地不容易踩雷', ['婚纱照', '外景'], [[400, 520], [400, 380]]],
];

const DEMO_COMMENTS = [
  '太好看了，收藏了！', '求原图出处～', '这个配色绝了', '已做成手机壁纸，谢谢分享',
  '教程很清晰，学到了', '氛围感拉满', '请问这是在哪儿拍的呀？', '每天都在等更新！',
];

function seed(db, { force = false } = {}) {
  const users = db.prepare('SELECT id, username FROM users').all();
  if (users.length === 0) return;

  const cols = db.prepare('PRAGMA table_info(posts)').all();
  if (!cols.some(c => c.name === 'sizes')) {
    db.exec("ALTER TABLE posts ADD COLUMN sizes TEXT DEFAULT '[]'");
  }

  // 幂等：已有内容则不重复灌入（node seed-demo.js --force 可显式追加演示内容）
  const existing = db.prepare('SELECT COUNT(*) AS c FROM posts').get().c;
  if (existing > 0 && !force) {
    console.log(`已存在 ${existing} 篇帖子，跳过演示数据灌入（如需追加请加 --force）`);
    return;
  }

  const insPost = db.prepare(
    'INSERT INTO posts (author_id, title, description, board, images, tags, sizes, likes_count, collects_count, comments_count, shares_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insComment = db.prepare(
    'INSERT INTO comments (post_id, author_id, content, likes_count, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insFollow = db.prepare('INSERT OR IGNORE INTO user_follows (follower_id, following_id) VALUES (?, ?)');

  let seedN = 100;
  const now = Date.now();
  DEMO_POSTS.forEach((row, i) => {
    const [board, title, description, tags, sizeList] = row;
    seedN += 10;
    const images = sizeList.map((_, idx) => `https://picsum.photos/seed/${seedN + idx}/400/${sizeList[idx][1]}`);
    const author = users[i % users.length];
    const likes = 200 + ((i * 137) % 4000);
    const collects = 50 + ((i * 89) % 1500);
    const shares = (i * 7) % 60;
    // 最近 30 天内分散发布时间，保证"最新"排序自然
    const createdAt = new Date(now - i * 36 * 3600 * 1000 - i * 713 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    const info = insPost.run(
      author.id, title, description, board,
      JSON.stringify(images), JSON.stringify(tags), JSON.stringify(sizeList.map(([w, h]) => ({ w, h }))),
      likes, collects, 0, shares, createdAt
    );

    // 前若干帖子配 1-3 条评论
    if (i % 3 === 0) {
      const cCount = 1 + (i % 3);
      for (let c = 0; c < cCount; c++) {
        const commenter = users[(i + c + 1) % users.length];
        insComment.run(
          info.lastInsertRowid, commenter.id,
          DEMO_COMMENTS[(i + c) % DEMO_COMMENTS.length],
          (i * 3 + c) % 9,
          createdAt
        );
      }
      db.prepare('UPDATE posts SET comments_count = ? WHERE id = ?').run(cCount, info.lastInsertRowid);
    }
  });

  // 关注关系：环形 + 交叉，让主页统计不为零
  for (let i = 0; i < users.length; i++) {
    insFollow.run(users[i].id, users[(i + 1) % users.length].id);
    if (i % 2 === 0) insFollow.run(users[i].id, users[(i + 2) % users.length].id);
  }

  console.log(`演示数据已填充: ${DEMO_POSTS.length} 篇帖子`);
}

module.exports = { seed };

// 直接运行: node seed-demo.js（复用 database.js，确保建列与 board 迁移先执行）
//              node seed-demo.js --force  在已有内容的库上追加演示数据
if (require.main === module) {
  seed(require('./database'), { force: process.argv.includes('--force') });
}
