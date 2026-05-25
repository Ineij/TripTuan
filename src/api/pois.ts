/**
 * Pickable items for /p3 — transport schedules + POIs (sight/food/hotel).
 * Moved out of src/pages/Step3_Picker.tsx so a teammate can replace the mock
 * arrays with real backend calls without touching the page.
 *
 * Backend contract:
 *   GET  /api/pois?scene=hk         → Item[]
 *   GET  /api/pois/:id              → Item
 *   POST /api/pois/transport/lookup → TransportSchedule[]  (alternate trains/flights)
 */
import { USE_MOCK, request, sleep } from './http';
import type { Scene } from './types';

export type Cat = 'all' | 'transport' | 'sight' | 'food' | 'hotel';
export type Queue = '低' | '中' | '高';
export type HotelTier = '高档型' | '豪华型' | '舒适型';

export interface TransportSchedule {
  no: string;
  dep: string;
  arr: string;
  mins: string;
  price: string;
  default?: boolean;
}

export interface TransportItem {
  id: string;
  cat: 'transport';
  mode: '高铁' | '飞机';
  direction: '去程' | '返程';
  from: string;
  to: string;
  schedules: TransportSchedule[];
}

export interface POIItem {
  id: string;
  cat: 'sight' | 'food' | 'hotel';
  name: string;
  rating: number;
  duration: string;
  price: string;
  queue: Queue;
  hotelTier?: HotelTier;
  hotelStatus?: string;
  subDesc: string;
  photoSeed: string;
  badge?: { label: string; color: 'yellow' | 'red' | 'orange' };
  preselect?: boolean;
  detail?: { tags: string[]; intro: string; tips: string[] };
  packages?: { id: string; name: string; price: string; original: string; items: string; subBadge: string }[];
}

export type Item = TransportItem | POIItem;

const HK_ITEMS: Item[] = [
  // transport
  { id: 'go-train', cat: 'transport', mode: '高铁', direction: '去程',
    from: '深圳北', to: '香港西九龙',
    schedules: [
      { no: 'G6501', dep: '09:24', arr: '09:38', mins: '14 min', price: '¥75', default: true },
      { no: 'G79',   dep: '10:20', arr: '10:38', mins: '18 min', price: '¥75' },
      { no: 'G6503', dep: '11:08', arr: '11:22', mins: '14 min', price: '¥75' },
    ] },
  { id: 'back-train', cat: 'transport', mode: '高铁', direction: '返程',
    from: '香港西九龙', to: '深圳北',
    schedules: [
      { no: 'G6534', dep: '21:30', arr: '21:44', mins: '14 min', price: '¥75', default: true },
      { no: 'G6536', dep: '22:15', arr: '22:29', mins: '14 min', price: '¥75' },
    ] },
  { id: 'go-flight', cat: 'transport', mode: '飞机', direction: '去程',
    from: '深圳宝安', to: '香港国际',
    schedules: [{ no: 'CX328', dep: '10:20', arr: '11:10', mins: '50 min', price: '¥680' }] },
  // sights
  { id: 's-harbour', cat: 'sight', name: '尖沙咀海港城', rating: 4.6, duration: '2-3 小时', price: '免费', queue: '低',
    subDesc: '一站式购物中心', photoSeed: 'tst-harbour-city', preselect: true,
    badge: { label: '购物', color: 'yellow' },
    detail: { tags: ['购物天堂', '维港旁', '免费'],
      intro: '香港最具人气的购物中心之一，海港城聚集 700+ 品牌，DFS 环球免税店、潮牌买手店一站式集齐。',
      tips: ['维港边天台观景免费拍照', '推荐 11:00 前到避开人潮', '海运戏院旁有亲子游乐区'] } },
  { id: 's-victoria', cat: 'sight', name: '维多利亚港', rating: 4.7, duration: '2-3 小时', price: '免费', queue: '低',
    subDesc: '维港夜景必打卡', photoSeed: 'victoria-harbour', preselect: true,
    detail: { tags: ['夜景', '免费', '步行可达'],
      intro: '世界三大夜景之一，每晚 20:00 幻彩咏香江灯光秀必看。星光大道沿岸都是绝佳观景位。',
      tips: ['推荐 19:30 占位', '渡轮天星小轮 ¥3 一程，便宜性价比高'] } },
  { id: 's-peak', cat: 'sight', name: '太平山顶', rating: 4.8, duration: '2-3 小时', price: '¥99', queue: '中',
    subDesc: '凌霄阁 360° 观景', photoSeed: 'victoria-peak', preselect: true,
    badge: { label: '热门', color: 'orange' },
    detail: { tags: ['观景', '缆车', '需排队'],
      intro: '俯瞰维港全景的绝佳观景台，山顶缆车体验独特，凌霄阁摩天台 360° 无遮挡。',
      tips: ['缆车 7:00-24:00 运营', '建议下午 4 点前上山，看完日落和夜景再下', '山顶广场 3 楼平台是免费观景点'] } },
  { id: 's-starave', cat: 'sight', name: '星光大道', rating: 4.0, duration: '2 小时', price: '免费', queue: '低',
    subDesc: '海滨长廊 + 明星掌印', photoSeed: 'avenue-of-stars', preselect: true,
    detail: { tags: ['免费', '夜景', '步行可达'],
      intro: '夜幕下漫步海滨长廊，指尖划过明星掌印，维港灯光秀倒映水面，随手拍都是电影感大片。',
      tips: ['李小龙铜像是必拍点', '8 点幻彩咏香江灯光秀就在这里看'] } },
  { id: 's-disney', cat: 'sight', name: '香港迪士尼乐园', rating: 4.9, duration: '全天', price: '¥639', queue: '高',
    subDesc: '全球唯二迷离庄园', photoSeed: 'hk-disneyland', preselect: true,
    badge: { label: '亲子', color: 'yellow' },
    detail: { tags: ['亲子', '全天', '需预约'],
      intro: '全球唯二「迷离庄园」就在这里，城堡翻新后更梦幻。建议早 9 点入园，玩满 12 小时。',
      tips: ['购票送早鸟手环可优先入园', '雨天部分项目关闭，可看天气调整', '提前下载迪士尼 App 看排队时间'] } },
  { id: 's-westkowloon', cat: 'sight', name: '西九艺术公园', rating: 4.3, duration: '半天', price: '免费', queue: '低',
    subDesc: '海滨草坪 + 艺术装置', photoSeed: 'west-kowloon-park',
    detail: { tags: ['亲子', '免费', '都市绿洲'],
      intro: '海滨草坪 + 艺术装置随手拍，遛娃放风筝首选，野餐垫一铺秒变都市绿洲。M+ 和故宫文化博物馆步行直达。',
      tips: ['周末有 Foodtruck 集市', '草地可野餐，记得带垫子'] } },
  // food
  { id: 'f-cha', cat: 'food', name: '港式茶餐厅（澳洲牛奶公司）', rating: 4.6, duration: '40 分钟', price: '人均 ¥80', queue: '中',
    subDesc: '港式奶茶 + 菠萝包 + 蛋挞', photoSeed: 'aussie-dairy', preselect: true,
    badge: { label: '老字号', color: 'yellow' },
    packages: [
      { id: 'p1', name: '招牌 4 件套餐', price: '¥58', original: '¥78', items: '港式丝袜奶茶 + 菠萝油 + 鲜炒蛋多士 + 蛋挞', subBadge: '一人份首选' },
      { id: 'p2', name: '双人下午茶', price: '¥118', original: '¥158', items: '2 杯奶茶 + 菠萝包 × 2 + 蛋挞 × 4', subBadge: '2 人分享' },
    ] },
  { id: 'f-crab', cat: 'food', name: '避风塘炒蟹', rating: 4.7, duration: '60 分钟', price: '人均 ¥280', queue: '高',
    subDesc: '蒜香浓郁海鲜', photoSeed: 'typhoon-crab', preselect: true,
    badge: { label: '人气', color: 'yellow' },
    packages: [
      { id: 'p1', name: '招牌避风塘蟹套餐', price: '¥288', original: '¥358', items: '避风塘炒蟹 + 蒜蓉粉丝带子 + 椒盐虾 + 时蔬', subBadge: '人气首选' },
      { id: 'p2', name: '海鲜豪华套餐', price: '¥488', original: '¥580', items: '炒蟹 + 椒盐虾 + 蒜蓉粉丝带子 + 清蒸鱼 + 时蔬', subBadge: '4 人分享' },
    ] },
  { id: 'f-goose', cat: 'food', name: '镛记烧鹅', rating: 4.8, duration: '60 分钟', price: '人均 ¥260', queue: '高',
    subDesc: '米其林港式烧味', photoSeed: 'yung-kee-goose', preselect: true,
    badge: { label: '米其林', color: 'red' },
    packages: [
      { id: 'p1', name: '招牌烧鹅套餐', price: '¥268', original: '¥328', items: '半只烧鹅 + 招牌叉烧 + 例汤 + 时蔬 + 米饭', subBadge: '推荐' },
      { id: 'p2', name: '米其林招牌全套', price: '¥468', original: '¥568', items: '一整只烧鹅 + 双拼烧味 + 例汤 + 时蔬 + 米饭', subBadge: '2-3 人分享' },
    ] },
  { id: 'f-sugar', cat: 'food', name: '糖朝糖水', rating: 4.4, duration: '30 分钟', price: '人均 ¥60', queue: '低',
    subDesc: '港式甜品老店', photoSeed: 'sweet-dynasty', preselect: true,
    packages: [
      { id: 'p1', name: '招牌糖水二选一', price: '¥38', original: '¥48', items: '杨枝甘露 / 芒果布甸 + 一份小吃', subBadge: '一人份首选' },
    ] },
  // hotel
  { id: 'h-cosmo', cat: 'hotel', name: '香港君怡酒店', rating: 4.8, duration: '尖沙咀核心地段', price: '¥1167 起 / 晚', queue: '低',
    hotelTier: '高档型', hotelStatus: '近 7 日预订热，今晚余 8 间',
    subDesc: '尖沙咀核心地段', photoSeed: 'hk-hotel-bp',
    badge: { label: '推荐', color: 'yellow' },
    detail: { tags: ['尖沙咀', '维港步行 8 分钟', '地铁直达'],
      intro: '位于尖沙咀核心商圈，距维多利亚港步行 8 分钟。客房可选高层维港景观房或市景豪华房，含双早。地铁尖沙咀站、地铁佐敦站均步行可达。',
      tips: ['含双人早餐自助', '24 小时礼宾服务 / 行李寄存', '步行 5 分钟到海港城'] } },
  { id: 'h-kowloon', cat: 'hotel', name: '香港九龙酒店', rating: 4.8, duration: '尖东海景', price: '¥1012 起 / 晚', queue: '低',
    hotelTier: '舒适型', hotelStatus: '尖东海景房紧俏，建议锁定',
    subDesc: '尖东海景，部分房型可观维港', photoSeed: 'hk-hotel-kowloon',
    detail: { tags: ['尖东', '海景房', '近地铁'],
      intro: '坐落尖东，半数房型正对维港，傍晚可在房内看灯光秀。距尖东地铁站步行 3 分钟，回机场也方便。',
      tips: ['尖东地铁站步行 3 分钟', '20 楼以上为海景房，建议预订', '健身房 24h 开放'] } },
  { id: 'h-royal', cat: 'hotel', name: '香港皇家太平洋', rating: 4.9, duration: '中港城内', price: '¥1380 起 / 晚', queue: '低',
    hotelTier: '豪华型', hotelStatus: '亲子房可订，含早餐选项',
    subDesc: '中港城内，地铁直达机场', photoSeed: 'hk-hotel-royal',
    detail: { tags: ['中港城', '机场直达', '亲子友好'],
      intro: '位于中港城内，机场快线九龙站附近，回深圳 / 机场都方便。带儿童乐园 / 露天泳池，适合带孩子。',
      tips: ['酒店设有儿童乐园 + 室外恒温泳池', '机场快线九龙站 5 分钟', '步行可达海港城商圈'] } },
];

const BJ_ITEMS: Item[] = [
  { id: 'bj-go-train', cat: 'transport', mode: '高铁', direction: '去程',
    from: '石家庄', to: '北京南',
    schedules: [
      { no: 'G671', dep: '08:12', arr: '09:24', mins: '1h12m', price: '¥128', default: true },
      { no: 'G673', dep: '08:58', arr: '10:10', mins: '1h12m', price: '¥128' },
      { no: 'G675', dep: '09:26', arr: '10:39', mins: '1h13m', price: '¥128' },
    ] },
  { id: 'bj-back-train', cat: 'transport', mode: '高铁', direction: '返程',
    from: '北京南', to: '石家庄',
    schedules: [
      { no: 'G672', dep: '20:18', arr: '21:32', mins: '1h14m', price: '¥128', default: true },
      { no: 'G674', dep: '21:06', arr: '22:18', mins: '1h12m', price: '¥128' },
    ] },
  { id: 'bj-tiananmen', cat: 'sight', name: '天安门广场', rating: 4.9, duration: '1.5 小时', price: '免费预约', queue: '中',
    subDesc: '国家地标，适合全家第一站合影', photoSeed: 'bj-tiananmen', preselect: true,
    badge: { label: '地标', color: 'yellow' },
    detail: { tags: ['预约入场', '老人友好', '家庭合照'],
      intro: '从北京南站打车到天安门广场，作为北京第一站最有仪式感。广场开阔，适合一家四口合影，老人孩子不需要长时间爬楼。',
      tips: ['提前准备身份证和预约码', '安检建议预留 30 分钟', '上午光线更适合拍照'] } },
  { id: 'bj-palace', cat: 'sight', name: '故宫博物院', rating: 4.8, duration: '3 小时', price: '¥60', queue: '中',
    subDesc: '午门 → 太和殿 → 御花园，中轴线轻量走法', photoSeed: 'bj-forbidden-city', preselect: true,
    badge: { label: '必去', color: 'orange' },
    detail: { tags: ['需预约', '中轴线', '文化体验'],
      intro: '故宫安排在天安门之后顺路进入，只走中轴线精华段，减少老人和孩子的步行压力。',
      tips: ['建议租讲解器', '御花园后从神武门出', '避开午后最晒时间'] } },
  { id: 'bj-wangfujing', cat: 'sight', name: '王府井步行街', rating: 4.5, duration: '2 小时', price: '免费', queue: '低',
    subDesc: '商场休息、买茶叶、孩子小吃都有', photoSeed: 'bj-wangfujing', preselect: true,
    detail: { tags: ['商场休息', '小吃', '亲子友好'],
      intro: '故宫出来后到王府井，动线短、休息点多，适合作为第一天下午的恢复站。',
      tips: ['商场里适合老人休息', '可顺路买北京伴手礼', '晚高峰打车建议提前叫车'] } },
  { id: 'bj-summer-palace', cat: 'sight', name: '颐和园泛舟', rating: 4.7, duration: '2 小时', price: '¥30', queue: '低',
    subDesc: '第二天放慢节奏，昆明湖边少走路', photoSeed: 'bj-summer-palace', preselect: true,
    badge: { label: '慢节奏', color: 'yellow' },
    detail: { tags: ['老人友好', '坐船', '湖景'],
      intro: '第二天不再堆满景点，安排颐和园泛舟和湖边散步，让家庭行程有缓冲。',
      tips: ['优先走东宫门入园', '湖边路线平缓', '如遇雨可改国家博物馆'] } },
  { id: 'bj-shichahai', cat: 'sight', name: '什刹海', rating: 4.4, duration: '1.5 小时', price: '免费', queue: '低',
    subDesc: '胡同、湖边和老北京夜色', photoSeed: 'bj-shichahai', preselect: true,
    detail: { tags: ['胡同', '夜景', '轻松收尾'],
      intro: '返程前安排什刹海，不赶路但有北京味，适合拍最后一组家庭照片。',
      tips: ['傍晚光线更好', '胡同路窄，推车需注意', '离护国寺小吃顺路'] } },
  { id: 'bj-duck', cat: 'food', name: '四季民福烤鸭', rating: 4.7, duration: '70 分钟', price: '人均 ¥160', queue: '中',
    subDesc: '家庭桌友好，烤鸭套餐适合老人孩子', photoSeed: 'bj-roast-duck', preselect: true,
    badge: { label: '人气', color: 'yellow' },
    packages: [
      { id: 'p1', name: '家庭烤鸭套餐', price: '¥388', original: '¥468', items: '半只烤鸭 + 京味小菜 + 鸭架汤 + 主食', subBadge: '一家四口首选' },
      { id: 'p2', name: '全鸭分享套餐', price: '¥588', original: '¥688', items: '一只烤鸭 + 宫保虾球 + 贝勒烤肉 + 鸭架汤', subBadge: '吃得更完整' },
    ] },
  { id: 'bj-huguosi', cat: 'food', name: '护国寺小吃', rating: 4.5, duration: '50 分钟', price: '人均 ¥45', queue: '低',
    subDesc: '豆汁、焦圈、驴打滚，第二天顺路补给', photoSeed: 'bj-roast-duck', preselect: true,
    packages: [
      { id: 'p1', name: '老北京小吃套餐', price: '¥45', original: '¥58', items: '豆汁 / 面茶 + 焦圈 + 驴打滚 + 豌豆黄', subBadge: '本地特色' },
      { id: 'p2', name: '家庭尝鲜套餐', price: '¥168', original: '¥208', items: '小吃拼盘 + 炸酱面 + 炒肝 + 甜品', subBadge: '4 人分享' },
    ] },
  { id: 'bj-hilton', cat: 'hotel', name: '北京王府井希尔顿', rating: 4.8, duration: '王府井核心地段', price: '¥1280 起 / 晚', queue: '低',
    hotelTier: '豪华型', hotelStatus: '亲子房可订，近地铁',
    subDesc: '第一天收尾近，第二天去颐和园也方便', photoSeed: 'bj-hotel-hilton',
    badge: { label: '推荐', color: 'yellow' },
    detail: { tags: ['王府井', '亲子房', '近地铁'],
      intro: '位于王府井核心区，晚上回酒店不绕路。家庭房可住 4 人，离地铁和餐饮区都近。',
      tips: ['可选双床亲子房', '步行可达王府井商圈', '第二天叫车去颐和园更方便'] } },
  { id: 'bj-qianmen-hotel', cat: 'hotel', name: '北京前门建国饭店', rating: 4.7, duration: '前门 / 大栅栏附近', price: '¥980 起 / 晚', queue: '低',
    hotelTier: '高档型', hotelStatus: '离天安门更近',
    subDesc: '适合想住老北京街区的家庭', photoSeed: 'bj-hotel-qianmen',
    detail: { tags: ['前门', '老北京', '地铁便利'],
      intro: '更靠近前门和大栅栏，适合喜欢胡同氛围的家庭。价格比王府井更稳。',
      tips: ['周边老字号多', '去天安门更近', '晚间步行街人流较多'] } },
];

const ITEMS_BY_SCENE: Record<Scene, Item[]> = { hk: HK_ITEMS, bj: BJ_ITEMS };

/* ============ Public API ============ */

export async function getPickerItems(scene: Scene): Promise<Item[]> {
  if (!USE_MOCK) return request<Item[]>(`/api/pois?scene=${scene}`);
  await sleep(60);
  return ITEMS_BY_SCENE[scene];
}

export function defaultTransportPick(items: Item[]): Record<string, string> {
  const init: Record<string, string> = {};
  items.forEach((it) => {
    if (it.cat === 'transport') {
      const def = it.schedules.find((s) => s.default);
      if (def) init[it.id] = def.no;
    }
  });
  return init;
}

export function defaultSelectedItems(items: Item[]): Set<string> {
  const next = new Set<string>();
  items.forEach((it) => {
    if ((it as POIItem).preselect || (it.cat === 'transport' && it.schedules.find((s) => s.default))) {
      next.add(it.id);
    }
  });
  return next;
}
