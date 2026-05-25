import type { CSSProperties, ReactNode } from 'react';

/**
 * Tag-based photo URL. Uses loremflickr.com which serves tagged Flickr photos.
 * With lock=N we get a consistent photo per (tag, lock) pair.
 */
export const photoUrl = (tag: string, w = 320, h = 320, lock = 1) =>
  `https://loremflickr.com/${w}/${h}/${encodeURIComponent(tag)}?lock=${lock}`;

/** Map a logical key → real-photo tag string (search keywords) */
const TAG_MAP: Record<string, string> = {
  // === Hong Kong attractions ===
  'victoria-harbour':  'hongkong,victoria-harbour,skyline',
  'victoria-peak':     'hongkong,victoria-peak,cityscape',
  'hk-disneyland':     'disneyland,castle,fireworks',
  'avenue-of-stars':   'hongkong,avenue-of-stars,promenade',
  'tst-harbour-city':  'hongkong,harbour-city,shopping-mall',
  'west-kowloon-park': 'hongkong,west-kowloon,park',
  // === Hong Kong food ===
  'aussie-dairy':      'hongkong,milk-tea,pineapple-bun',
  'typhoon-crab':      'crab,seafood,chinese',
  'yung-kee-goose':    'roast-goose,hongkong,michelin',
  'sweet-dynasty':     'mango,dessert,sago',
  // === Hong Kong hotels ===
  'hk-hotel-bp':       'hongkong,hotel,luxury,skyline',
  'hk-hotel-kowloon':  'hongkong,hotel,harbour-view',
  'hk-hotel-royal':    'hongkong,hotel,resort,pool',
  // === Beijing ===
  'bj-forbidden-city': 'forbiddencity,beijing,palace',
  'bj-tiananmen':      'tiananmen,beijing,square',
  'bj-summer-palace':  'summerpalace,beijing,lake',
  'bj-wangfujing':     'wangfujing,beijing,street',
  'bj-shichahai':      'shichahai,beijing,hutong',
  // === Beijing food ===
  'bj-roast-duck':     'pekingduck,beijing,restaurant',
  'bj-hotpot':         'hotpot,sichuan,chinese',
  // === Beijing hotels ===
  'bj-hotel-hilton':   'beijing,hotel,luxury,city',
  'bj-hotel-qianmen':  'beijing,hotel,traditional',
  'bj-hotel-grand':    'beijing,grand-hotel,classic',
  // === Transport ===
  'hk-train':          'highspeed-train,railway,china',
  'hk-flight':         'airplane,airport,sky',
  'bj-train':          'highspeed-train,railway,beijing',
  // === Summary highlights / chapters ===
  'hk-chapter-1':      'hongkong,trainstation,morning',
  'hk-chapter-2':      'hongkong,victoria-harbour,daytime',
  'hk-chapter-3':      'hongkong,symphony-of-lights,night',
  'hk-chapter-4':      'hongkong,shopping,harbour-city',
  'bj-chapter-1':      'beijing,flag-raising,tiananmen',
  'bj-chapter-2':      'beijing,forbiddencity,palace',
  'bj-chapter-3':      'beijing,summerpalace,boat',
  'bj-chapter-4':      'beijing,hutong,night',
};

const LOCK_MAP: Record<string, number> = {
  'hk-hotel-bp': 2, 'hk-hotel-kowloon': 5, 'hk-hotel-royal': 8,
  'bj-hotel-hilton': 3, 'bj-hotel-qianmen': 6, 'bj-hotel-grand': 9,
};

interface Props {
  seed: string;
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Photo({
  seed, width = '100%', height = '100%',
  radius = 10, children, style,
}: Props) {
  const tag = TAG_MAP[seed] ?? seed.replace(/-/g, ',');
  const lock = LOCK_MAP[seed] ?? 1;
  const url = photoUrl(tag, 480, 480, lock);

  return (
    <div
      style={{
        position: 'relative',
        width, height,
        borderRadius: radius,
        backgroundImage: `url("${url}")`,
        backgroundColor: '#e8e9ec',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
