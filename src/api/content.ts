/**
 * Static content powering the P1 chat (hotels, tips, intros, spots, sight detail).
 * Originally lived inline in src/pages/P1_AskXiaotuan.tsx; moved here so the page
 * is purely presentational and the teammate can swap this for a real CMS / API.
 */
import { sleep, USE_MOCK, request } from './http';
import type { Scene } from './types';

export interface Hotel { name: string; rating: string; price: string; seed: string }
export interface Tip { label: string; body: string }
export interface Spot { name: string; rating: number; intro: string; seed: string }
export interface SightDetail { icon: string; name: string; body: string }
export interface SightSection { period: string; items: SightDetail[] }

const HOTELS: Record<Scene, Hotel[]> = {
  hk: [
    { name: '香港君怡酒店', rating: '4.8 分', price: '¥1167 起', seed: 'hk-hotel-bp' },
    { name: '香港九龙酒店', rating: '4.8 分', price: '¥1012 起', seed: 'hk-hotel-kowloon' },
    { name: '香港皇家太平洋', rating: '4.9 分', price: '¥1380 起', seed: 'hk-hotel-royal' },
  ],
  bj: [
    { name: '王府井希尔顿', rating: '4.8 分', price: '¥1280 起', seed: 'bj-hotel-hilton' },
    { name: '北京前门建国', rating: '4.7 分', price: '¥980 起',  seed: 'bj-hotel-qianmen' },
    { name: '北京饭店',     rating: '4.9 分', price: '¥1620 起', seed: 'bj-hotel-grand' },
  ],
};

const TIPS: Record<Scene, Tip[]> = {
  hk: [
    { label: '证件准备',   body: '从深圳前往香港需要港澳通行证和有效签注，请提前确认证件有效' },
    { label: '货币兑换',   body: '香港使用港币，建议提前兑换或在当地 ATM 取现，大部分商家支持支付宝、微信支付' },
    { label: '交通卡',     body: '建议购买八达通卡，方便乘坐地铁、巴士和轮渡' },
    { label: '天气准备',   body: '5 月香港天气炎热，建议携带防晒霜、遮阳帽和墨镜，同时准备轻便外套应对室内空调' },
    { label: '迪士尼门票', body: '建议提前在美团上预订迪士尼门票，避免现场排队' },
    { label: '购物退税',   body: '香港为免税港，购物无需退税，但请注意部分商品可能有进口限制' },
  ],
  bj: [
    { label: '门票预约', body: '故宫、天安门、国家博物馆均需要提前在官方平台或美团预约，老人小孩用身份证实名' },
    { label: '交通建议', body: '景点之间地铁最方便，二环内打车也便宜，老人多走平路少爬楼' },
    { label: '老人友好', body: '带老人优先选择有电梯 / 平路的景点，故宫推荐租用语音讲解器' },
    { label: '小孩准备', body: '带遮阳帽、补水水杯、小零食，故宫和颐和园园区较大，准备婴儿车更省力' },
    { label: '美食提示', body: '王府井、南锣鼓巷小吃多但贵，建议老北京胡同里的本地店性价比更高' },
    { label: '雨天预案', body: '周日有小雨，可改去国家博物馆 / 中国科技馆等室内景点' },
  ],
};

const USER_QUERY: Record<Scene, string> = {
  hk: '给我推荐香港周末旅行',
  bj: '一家四口想去北京玩两天',
};

const INTRO: Record<Scene, string> = {
  hk: '小团已经为您准备了一份精彩的香港周末漫游攻略！5 月 23–24 日 · 周六晴 29°、周日多云 33°，非常适合出游。这份行程将带您体验香港的经典地标、美食文化和购物乐趣，节奏张弛有度，既有都市繁华也有海滨悠闲。',
  bj: '小团为您整理了一份北京 2 天 1 夜的家庭文化游攻略！5 月 23–24 日 · 周六晴 26°、周日小雨 22°，注意带伞。这份行程兼顾老人和孩子的节奏，从天安门升旗到颐和园泛舟，慢节奏深度体验。',
};

const SPOTS: Record<Scene, Spot[]> = {
  hk: [
    { name: '维多利亚港',     rating: 4.7, intro: '世界级天然良港，白天碧海蓝天与摩登楼群同框，夜景璀璨迷人', seed: 'victoria-harbour' },
    { name: '太平山顶',       rating: 4.8, intro: '俯瞰维港全景，山顶缆车独特，凌霄阁摩天台 360° 无遮挡', seed: 'victoria-peak' },
    { name: '香港迪士尼乐园', rating: 4.9, intro: '全球唯二「迷离庄园」就在这里，城堡翻新后更梦幻', seed: 'hk-disneyland' },
    { name: '西九艺术公园',   rating: 4.3, intro: '海滨草坪 + 艺术装置随手拍，都市绿洲', seed: 'west-kowloon-park' },
    { name: '星光大道',       rating: 4.0, intro: '夜幕下漫步海滨长廊，灯光秀倒映水面，电影感十足', seed: 'avenue-of-stars' },
  ],
  bj: [
    { name: '天安门广场',   rating: 4.9, intro: '看升旗仪式，国家地标，孩子开眼界', seed: 'bj-tiananmen' },
    { name: '故宫博物院',   rating: 4.8, intro: '中轴线游览，午门→太和殿→御花园', seed: 'bj-forbidden-city' },
    { name: '颐和园',       rating: 4.7, intro: '皇家园林，可坐船赏景，老人友好', seed: 'bj-summer-palace' },
    { name: '王府井步行街', rating: 4.5, intro: '小吃 + 大商场，老人买茶叶孩子买冰淘儿', seed: 'bj-wangfujing' },
    { name: '什刹海',       rating: 4.4, intro: '胡同 + 酒吧，傍晚漫步最有北京味', seed: 'bj-shichahai' },
  ],
};

const SIGHTS_DETAIL: Record<Scene, SightSection[]> = {
  hk: [
    { period: '下午', items: [
      { icon: '⛺', name: '天星小轮码头', body: '复古绿白渡轮穿梭维港，二层露天座位吹海风超 chill！码头旁钟楼打卡超有港味。开放时间 18:30-20:30。' },
      { icon: '🏕', name: '太平山顶',     body: '俯瞰维港全景的绝佳观景台，山顶缆车体验独特，凌霄阁摩天台 360° 无遮挡。山顶广场 3 楼平台为免费观景点。建议 2-3 小时，缆车 7:00-24:00。' },
    ] },
    { period: '晚上', items: [
      { icon: '🏕', name: '星光大道', body: '夜幕下漫步海滨长廊，指尖划过明星掌印，维港灯光秀倒映水面，随手拍都是电影感大片！记得找李小龙铜像合影。建议 2-3 小时。' },
    ] },
    { period: '晚餐', items: [
      { icon: '🍴', name: '避风塘炒蟹', body: '香港经典海鲜美食，蒜香浓郁，蟹肉鲜美，搭配啤酒风味更佳' },
      { icon: '🍴', name: '港式烧味',   body: '推荐烧鹅、叉烧等经典港式烧味，皮脆肉嫩，回味无穷' },
    ] },
  ],
  bj: [
    { period: '上午', items: [
      { icon: '🏕', name: '天安门广场', body: '提前 1 小时到达观看升旗仪式，老人小孩一起感受庄严气氛。建议 1-2 小时。' },
      { icon: '🏕', name: '故宫博物院', body: '中轴线游览，午门→太和殿→御花园，全程平路推车友好。建议 2-3 小时，提前预约门票。' },
    ] },
    { period: '下午', items: [
      { icon: '🏕', name: '颐和园',     body: '皇家园林，可坐船赏景，老人友好。万寿山看夕阳特别美。' },
    ] },
    { period: '晚餐', items: [
      { icon: '🍴', name: '全聚德烤鸭', body: '北京全聚德老字号，烤鸭+鸭三吃+小菜套餐，孩子也喜欢' },
    ] },
  ],
};

/* ============ Public API ============ */

export async function getHotels(scene: Scene): Promise<Hotel[]> {
  if (!USE_MOCK) return request<Hotel[]>(`/api/hotels?scene=${scene}`);
  await sleep(60);
  return HOTELS[scene];
}

export async function getTips(scene: Scene): Promise<Tip[]> {
  if (!USE_MOCK) return request<Tip[]>(`/api/tips?scene=${scene}`);
  await sleep(60);
  return TIPS[scene];
}

export async function getSpots(scene: Scene): Promise<Spot[]> {
  if (!USE_MOCK) return request<Spot[]>(`/api/spots?scene=${scene}`);
  await sleep(60);
  return SPOTS[scene];
}

export async function getSightDetail(scene: Scene): Promise<SightSection[]> {
  if (!USE_MOCK) return request<SightSection[]>(`/api/sight-detail?scene=${scene}`);
  await sleep(60);
  return SIGHTS_DETAIL[scene];
}

export function getUserQuery(scene: Scene): string {
  return USER_QUERY[scene];
}

/**
 * Bundled script used by the streaming agent mock.
 * In real backend this is generated by the model — the client doesn't
 * need to know about HOTELS/SPOTS/TIPS at all.
 */
export function getChatScript(scene: Scene) {
  return {
    cityLabel: scene === 'hk' ? '香港' : '北京',
    intro: INTRO[scene],
    spots: SPOTS[scene],
    hotels: HOTELS[scene],
    tips: TIPS[scene],
    sightDetail: SIGHTS_DETAIL[scene],
  };
}
