export interface ImageCard {
  id: number;
  title: string;
  src: string;
  /** 帖子的全部图片（src 为第一张，即封面） */
  images?: string[];
  /** 与 images 一一对应的缩略图（列表卡片用，详情页仍用原图） */
  thumbs?: string[];
  /** 当前卡片应加载的地址：优先缩略图 */
  thumb?: string;
  /** 与 images 一一对应的尺寸变体，每项按宽度升序 */
  variants?: { url: string; width: number }[][];
  /** 封面图的 srcset 字符串（浏览器按需选档） */
  srcset?: string;
  width: number;
  height: number;
  author: string;
  authorId?: number;
  avatar: string;
  likes: number;
  collects: number;
  category: string;
  tags: string[];
  description?: string;
  comments?: number;
  shares?: number;
  /** 发布时间（后端 created_at，UTC 字符串），整版卡片流显示相对时间用 */
  date?: string;
  is_liked?: boolean;
  is_collected?: boolean;
}

// Using Picsum photos with deterministic seeds for variety
const makeUrl = (seed: number, w: number, h: number) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const categories = [
  { key: "all", label: "推荐" },
  { key: "wallpaper", label: "壁纸头像" },
  { key: "anime", label: "动漫插画" },
  { key: "fashion", label: "时尚穿搭" },
  { key: "food", label: "美食菜谱" },
  { key: "diy", label: "手工DIY" },
  { key: "home", label: "家居生活" },
  { key: "makeup", label: "美妆造型" },
  { key: "travel", label: "旅行摄影" },
  { key: "ancient", label: "古风汉服" },
  { key: "pet", label: "萌宠植物" },
  { key: "quote", label: "文字句子" },
  { key: "wedding", label: "婚纱婚礼" },
];

const avatarUrl = (seed: number) =>
  `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4`;

export const imageCards: ImageCard[] = [
  { id: 1,  title: "粉色少女心壁纸",           src: makeUrl(10, 400, 560), width: 400, height: 560, author: "糖小兔",   avatar: avatarUrl(1),  likes: 2341, collects: 876,  category: "wallpaper", tags: ["壁纸","少女心"] },
  { id: 2,  title: "慵懒午后的猫咪",           src: makeUrl(20, 400, 420), width: 400, height: 420, author: "晴天小猪", avatar: avatarUrl(2),  likes: 1892, collects: 543,  category: "pet",       tags: ["猫咪","萌宠"] },
  { id: 3,  title: "复古风格胶片感旅行照",     src: makeUrl(30, 400, 600), width: 400, height: 600, author: "旅行诗人", avatar: avatarUrl(3),  likes: 3120, collects: 1024, category: "travel",    tags: ["旅行","胶片"] },
  { id: 4,  title: "奶油蛋糕食谱分享",         src: makeUrl(40, 400, 380), width: 400, height: 380, author: "甜心厨房", avatar: avatarUrl(4),  likes: 987,  collects: 345,  category: "food",      tags: ["烘焙","蛋糕"] },
  { id: 5,  title: "森系女孩穿搭inspo",        src: makeUrl(50, 400, 520), width: 400, height: 520, author: "森女日记", avatar: avatarUrl(5),  likes: 4201, collects: 1567, category: "fashion",   tags: ["穿搭","森系"] },
  { id: 6,  title: "汉服仙气写真",             src: makeUrl(60, 400, 640), width: 400, height: 640, author: "华裳记",   avatar: avatarUrl(6),  likes: 5632, collects: 2100, category: "ancient",   tags: ["汉服","古风"] },
  { id: 7,  title: "极简风桌面布置",           src: makeUrl(70, 400, 360), width: 400, height: 360, author: "简约美学", avatar: avatarUrl(7),  likes: 2876, collects: 934,  category: "home",      tags: ["家居","极简"] },
  { id: 8,  title: "夕阳西下的海边",           src: makeUrl(80, 400, 500), width: 400, height: 500, author: "海浪声声", avatar: avatarUrl(8),  likes: 6712, collects: 2340, category: "travel",    tags: ["海边","日落"] },
  { id: 9,  title: "手帐素材拼贴分享",         src: makeUrl(90, 400, 430), width: 400, height: 430, author: "手帐控",   avatar: avatarUrl(9),  likes: 1234, collects: 567,  category: "diy",       tags: ["手帐","拼贴"] },
  { id: 10, title: "日系妆容教程",             src: makeUrl(100,400, 480), width: 400, height: 480, author: "美妆日记", avatar: avatarUrl(10), likes: 3456, collects: 1289, category: "makeup",    tags: ["妆容","日系"] },
  { id: 11, title: "冬日奶茶约会穿搭",        src: makeUrl(110,400, 560), width: 400, height: 560, author: "奶茶配你", avatar: avatarUrl(11), likes: 4567, collects: 1876, category: "fashion",   tags: ["穿搭","冬日"] },
  { id: 12, title: "薰衣草紫色系壁纸",         src: makeUrl(120,400, 400), width: 400, height: 400, author: "紫色幻想", avatar: avatarUrl(12), likes: 3201, collects: 987,  category: "wallpaper", tags: ["壁纸","紫色"] },
  { id: 13, title: "可爱兔子耳朵发饰DIY",      src: makeUrl(130,400, 460), width: 400, height: 460, author: "兔耳工坊", avatar: avatarUrl(13), likes: 876,  collects: 432,  category: "diy",       tags: ["DIY","发饰"] },
  { id: 14, title: "北欧风客厅设计",           src: makeUrl(140,400, 540), width: 400, height: 540, author: "北欧之家", avatar: avatarUrl(14), likes: 5432, collects: 2100, category: "home",      tags: ["家居","北欧"] },
  { id: 15, title: "雨天治愈系文字",           src: makeUrl(150,400, 390), width: 400, height: 390, author: "雨夜思绪", avatar: avatarUrl(15), likes: 7821, collects: 3450, category: "quote",     tags: ["文字","治愈"] },
  { id: 16, title: "ins风沙拉碗食谱",          src: makeUrl(160,400, 500), width: 400, height: 500, author: "轻食生活", avatar: avatarUrl(16), likes: 2134, collects: 876,  category: "food",      tags: ["轻食","沙拉"] },
  { id: 17, title: "婚礼花艺布置灵感",         src: makeUrl(170,400, 580), width: 400, height: 580, author: "花嫁物语", avatar: avatarUrl(17), likes: 4321, collects: 1654, category: "wedding",   tags: ["婚礼","花艺"] },
  { id: 18, title: "动漫风景插画精选",         src: makeUrl(180,400, 450), width: 400, height: 450, author: "绘梦师",   avatar: avatarUrl(18), likes: 9876, collects: 4320, category: "anime",     tags: ["插画","动漫"] },
  { id: 19, title: "多肉植物养护日记",         src: makeUrl(190,400, 420), width: 400, height: 420, author: "肉肉控",   avatar: avatarUrl(19), likes: 1543, collects: 678,  category: "pet",       tags: ["多肉","植物"] },
  { id: 20, title: "云朵棉花糖系头像",         src: makeUrl(200,400, 400), width: 400, height: 400, author: "云朵女孩", avatar: avatarUrl(20), likes: 5674, collects: 2345, category: "wallpaper", tags: ["头像","清新"] },
  { id: 21, title: "京都旅行vlog素材",         src: makeUrl(210,400, 560), width: 400, height: 560, author: "行走的茶", avatar: avatarUrl(21), likes: 3987, collects: 1432, category: "travel",    tags: ["京都","旅行"] },
  { id: 22, title: "奶奶灰毛衣搭配",           src: makeUrl(220,400, 480), width: 400, height: 480, author: "灰调日记", avatar: avatarUrl(22), likes: 2765, collects: 1098, category: "fashion",   tags: ["穿搭","秋冬"] },
  { id: 23, title: "粘土小熊手工教程",         src: makeUrl(230,400, 440), width: 400, height: 440, author: "粘土乐园", avatar: avatarUrl(23), likes: 1876, collects: 765,  category: "diy",       tags: ["粘土","手工"] },
  { id: 24, title: "星空银河壁纸合集",         src: makeUrl(240,400, 600), width: 400, height: 600, author: "星途远望", avatar: avatarUrl(24), likes: 8765, collects: 3456, category: "wallpaper", tags: ["壁纸","星空"] },
  { id: 25, title: "草莓熊咖啡拉花",           src: makeUrl(250,400, 380), width: 400, height: 380, author: "咖啡日常", avatar: avatarUrl(25), likes: 4532, collects: 1876, category: "food",      tags: ["咖啡","拉花"] },
  { id: 26, title: "齐汉唐制汉服定妆照",       src: makeUrl(260,400, 640), width: 400, height: 640, author: "古风世界", avatar: avatarUrl(26), likes: 6543, collects: 2876, category: "ancient",   tags: ["汉服","定妆"] },
  { id: 27, title: "黄金比例裸妆教程",         src: makeUrl(270,400, 520), width: 400, height: 520, author: "素颜女神", avatar: avatarUrl(27), likes: 5321, collects: 2109, category: "makeup",    tags: ["裸妆","教程"] },
  { id: 28, title: "奶fufu卧室改造完成",       src: makeUrl(280,400, 460), width: 400, height: 460, author: "温柔居所", avatar: avatarUrl(28), likes: 7654, collects: 3210, category: "home",      tags: ["卧室","改造"] },
];

export const hotSearches = [
  "可爱壁纸", "汉服", "穿搭", "头像", "插画", "动漫", "蛋糕", "手帐", "旅行", "猫咪"
];

/** 关注流标签（非画板，走 /feed/following 接口） */
export const FOLLOW_NAV = "关注";

/** 分类导航（"推荐" 为全部，不参与 board 存储） */
export const navCategories = [categories[0].label, FOLLOW_NAV, ...categories.slice(1).map(c => c.label)];

/** 中文标签 → 后端 board 英文 key */
export const labelToBoard: Record<string, string> = Object.fromEntries(
  categories.map(c => [c.label, c.key]),
);

/** 后端 board 英文 key → 中文标签 */
export const boardToLabel: Record<string, string> = Object.fromEntries(
  categories.map(c => [c.key, c.label]),
);

/** 可发布的画板（排除"推荐"） */
export const boardOptions = categories.filter(c => c.key !== "all").map(c => c.label);

/** 归一化任意 board 值为英文 key（兼容历史数据存了中文标签的情况） */
export function toBoardKey(board?: string | null): string {
  if (!board) return "";
  if (labelToBoard[board]) return labelToBoard[board];
  return board;
}
