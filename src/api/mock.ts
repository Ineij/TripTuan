/**
 * Mock data layer — easy to swap for real API.
 * All page content is sourced from the original 问小团 prototype.
 */
import type { POI, Identity, Scene, ItineraryStep } from '../types';

export const sceneMeta: Record<Scene, {
  city: string;
  desc: string;
  weather: string;
  duration: string;
}> = {
  hk: {
    city: '香港',
    desc: '5 月 23–24 日 · 周六晴 26°、周日小雨 22°，注意带伞',
    weather: '👕 短袖 + 防晒帽，傍晚海风稍凉建议带件薄外套',
    duration: '建议游玩时间：2 天 1 夜（适合带老人小孩节奏）',
  },
  bj: {
    city: '北京',
    desc: '5 月 23–24 日 · 周六晴 29°、周日多云 33°，非常适合出游',
    weather: '👨‍👩‍👧 老人长袖外套，孩子轻便短袖+遮阳帽，下午紫外线偏强',
    duration: '建议游玩时间：2 天 1 夜（适合带老人小孩节奏）',
  },
};

export const hkPOIs: POI[] = [
  { id: 'hk-1', name: '维多利亚港', type: '景点', rating: 4.7,
    desc: '世界级天然良港，白天碧海蓝天与摩登楼群同框，必打卡观景台和游船体验，随手拍都是明信片视角。建议游玩 2-3 小时。',
    duration: '2-3 小时', tags: ['免费', '夜景'] },
  { id: 'hk-2', name: '太平山顶', type: '景点', rating: 4.8,
    desc: '俯瞰维港全景的绝佳观景台，山顶缆车体验独特，凌霄阁摩天台 360° 无遮挡。山顶广场 3 楼平台为免费观景点。建议 2-3 小时，缆车 7:00-24:00。',
    price: 99, duration: '2-3 小时', tags: ['缆车', '观景'] },
  { id: 'hk-3', name: '香港迪士尼乐园', type: '景点', rating: 4.9,
    desc: '全球唯二「迷离庄园」就在这里，城堡翻新后更梦幻，小孩首选。',
    price: 639, duration: '1 整天', tags: ['亲子', '热门'] },
  { id: 'hk-4', name: '西九艺术公园', type: '景点', rating: 4.3,
    desc: '海滨草坪+艺术装置随手拍！遛娃放风筝首选，野餐垫一铺秒变都市绿洲，M+ 和故宫博物馆步行直达。建议游玩 2-3 小时。',
    duration: '2-3 小时', tags: ['亲子', '免费'] },
  { id: 'hk-5', name: '星光大道', type: '景点', rating: 4.0,
    desc: '夜幕下漫步海滨长廊，指尖划过明星掌印，维港灯光秀倒映水面，随手拍都是电影感大片！记得找李小龙铜像合影。建议 2-3 小时。',
    duration: '2-3 小时', tags: ['夜景'] },
  { id: 'hk-6', name: '尖沙咀购物', type: '景点', rating: 4.5,
    desc: '购物天堂，海港城、DFS 环球免税店汇聚全球知名品牌；维港美景，星光大道、维多利亚港夜景璀璨；交通便利，地铁尖沙咀站连接荃湾线，轻松前往主要区域。',
    duration: '半天', tags: ['购物'] },

  { id: 'hk-f1', name: '%Arabica（K11 店）', type: '美食', rating: 4.6,
    desc: '到了港岛，不饮茶就白来了～小go帮你挑了附近高分早茶店。',
    price: 88, tags: ['咖啡', '网红'] },
  { id: 'hk-f2', name: '镛记烧鹅', type: '美食', rating: 4.7,
    desc: '推荐烧鹅、叉烧等经典港式烧味，皮脆肉嫩，回味无穷。',
    price: 280, tags: ['粤菜', '老字号'] },
  { id: 'hk-f3', name: '兰芳园', type: '美食', rating: 4.5,
    desc: '港式丝袜奶茶 + 菠萝油 + 鲜炒蛋多士 + 蛋挞。',
    price: 65, tags: ['茶餐厅'] },
  { id: 'hk-f4', name: '海港城海鲜', type: '美食', rating: 4.6,
    desc: '香港经典海鲜美食，蒜香浓郁，蟹肉鲜美，搭配啤酒风味更佳。',
    price: 520, tags: ['海鲜'] },

  { id: 'hk-h1', name: '尖沙咀文华东方', type: '酒店', rating: 4.8,
    desc: '位于市中心，维港景观房，地铁尖沙咀站直达，家庭房适合带老人小孩。',
    price: 1980, tags: ['豪华', '维港景'] },
];

export const bjPOIs: POI[] = [
  { id: 'bj-1', name: '天安门广场', type: '景点', rating: 4.9,
    desc: '提前 1 小时到达观看升旗仪式，老人小孩一起感受庄严气氛。建议 1-2 小时。',
    duration: '1-2 小时', tags: ['免费', '升旗'] },
  { id: 'bj-2', name: '故宫博物院', type: '景点', rating: 4.8,
    desc: '中轴线游览，午门→太和殿→御花园，全程平路推车友好。建议 2-3 小时，提前预约门票。',
    price: 60, duration: '2-3 小时', tags: ['门票', '老人友好'] },
  { id: 'bj-3', name: '颐和园', type: '景点', rating: 4.7,
    desc: '皇家园林，可坐船赏景，老人友好。',
    price: 30, duration: '半天', tags: ['老人友好'] },
  { id: 'bj-4', name: '王府井步行街', type: '景点', rating: 4.5,
    desc: '小吃街+大商场，老人买茶叶，孩子买冰淘儿，大家都有得玩。建议 2 小时。',
    duration: '2 小时', tags: ['购物', '小吃'] },
  { id: 'bj-5', name: '什刹海', type: '景点', rating: 4.4,
    desc: '胡同+酒吧，傍晚漫步最有北京味。',
    duration: '2 小时', tags: ['夜景'] },

  { id: 'bj-f1', name: '全聚德烤鸭', type: '美食', rating: 4.5,
    desc: '北京全聚德老字号，烤鸭+小菜套餐，孩子也喜欢。',
    price: 388, tags: ['老字号', '烤鸭'] },
  { id: 'bj-f2', name: '海底捞火锅', type: '美食', rating: 4.7,
    desc: '鸳鸯锅 + 8 道经典菜 + 主食 + 饮品。',
    price: 360, tags: ['火锅'] },

  { id: 'bj-h1', name: '北京王府井希尔顿', type: '酒店', rating: 4.8,
    desc: '位于市中心交通枢纽，地铁 1/5 号线交汇，去故宫天安门步行可达；周边餐饮丰富，对带老人小孩的家庭非常友好。',
    price: 1280, tags: ['市中心', '亲子'] },
];

export const tips: Record<Scene, string[]> = {
  hk: [
    '证件准备：从深圳前往香港需要港澳通行证和有效签注，请提前确认证件有效。',
    '货币兑换：香港使用港币，建议提前兑换或在当地 ATM 取现，大部分商家支持支付宝、微信支付。',
    '交通卡：建议购买八达通卡，方便乘坐地铁、巴士和轮渡。',
    '天气准备：5 月香港天气炎热，建议携带防晒霜、遮阳帽和墨镜，同时准备轻便外套应对室内空调。',
    '购物退税：香港为免税港，购物无需退税，但请注意部分商品可能有进口限制。',
    '迪士尼门票：建议提前在美团上预订迪士尼门票，避免现场排队。',
  ],
  bj: [
    '门票预约：故宫、天安门、国家博物馆均需要提前在官方平台或美团预约，老人小孩用身份证实名。',
    '交通建议：景点之间地铁最方便，二环内打车也便宜，老人多走平路少爬楼。',
    '老人友好：带老人优先选择有电梯/平路的景点，故宫推荐租用语音讲解器。',
    '小孩准备：带遮阳帽、补水水杯、小零食，故宫和颐和园园区较大，准备婴儿车更省力。',
    '美食提示：王府井、南锣鼓巷小吃多但贵，建议老北京胡同里的本地店性价比更高。',
    '雨天预案：周日有小雨，可改去国家博物馆/中国科技馆等室内景点，孩子玩得开心老人也不累。',
  ],
};

export const defaultIdentity: Identity = {
  partySize: 4,
  hasElder: true,
  hasKid: true,
  hasSpecial: false,
  preferences: ['亲子友好', '老人友好', '慢节奏'],
  nights: 1,
  startDate: '2026-05-23',
  endDate: '2026-05-24',
};

export const sampleItinerary: Record<Scene, ItineraryStep[]> = {
  hk: [
    { time: '09:30', title: '高铁抵港 · 西九龙站', type: '交通', duration: '20 分钟换乘地铁', done: true },
    { time: '10:30', title: '兰芳园早茶', type: '美食', duration: '约 1h · 65 元/人', done: true },
    { time: '12:00', title: '维多利亚港 + 星光大道', type: '景点', duration: '2-3h · 免费' },
    { time: '14:30', title: '海港城海鲜午餐', type: '美食', duration: '约 1.5h · 520 元/人' },
    { time: '16:30', title: '太平山顶 · 缆车 + 凌霄阁', type: '景点', duration: '2h · 99 元/人' },
    { time: '19:30', title: '幻彩咏香江灯光秀', type: '景点', duration: '15 分钟 · 免费' },
    { time: '21:00', title: '入住尖沙咀文华东方', type: '酒店', duration: '2026-05-23 入住，2026-05-24 离店' },
  ],
  bj: [
    { time: '08:00', title: '天安门广场 · 升旗仪式', type: '景点', duration: '1-2h · 免费', done: true },
    { time: '10:00', title: '故宫博物院（中轴线）', type: '景点', duration: '2-3h · 60 元/人', done: true },
    { time: '12:30', title: '全聚德烤鸭午餐', type: '美食', duration: '约 1.5h · 388 元/人' },
    { time: '14:30', title: '颐和园 · 坐船赏景', type: '景点', duration: '半天 · 30 元/人' },
    { time: '18:00', title: '王府井步行街 + 晚饭', type: '景点', duration: '2h' },
    { time: '20:00', title: '入住王府井希尔顿', type: '酒店', duration: '2026-05-23 入住，2026-05-24 离店' },
  ],
};

export const api = {
  async getPOIs(scene: Scene): Promise<POI[]> {
    await new Promise((r) => setTimeout(r, 60));
    return scene === 'hk' ? hkPOIs : bjPOIs;
  },
  async getItinerary(scene: Scene): Promise<ItineraryStep[]> {
    await new Promise((r) => setTimeout(r, 60));
    return sampleItinerary[scene];
  },
  async getTips(scene: Scene): Promise<string[]> {
    return tips[scene];
  },
};
