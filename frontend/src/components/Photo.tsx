import type { CSSProperties, ReactNode } from 'react';

/**
 * Tag-based photo URL. Uses loremflickr.com which serves tagged Flickr photos.
 * With lock=N we get a consistent photo per (tag, lock) pair.
 */
export const photoUrl = (tag: string, w = 320, h = 320, lock = 1) =>
  `https://loremflickr.com/${w}/${h}/${encodeURIComponent(tag)}?lock=${lock}`;

/** Map a logical key → real-photo tag string (search keywords) */
const TAG_MAP: Record<string, string> = {
  // === Shenzhen attractions ===
  'sz-landmark':       'shenzhen,skyline,city',
  'sz-window-world':   'shenzhen,window-of-the-world,theme-park',
  'sz-happy-valley':   'shenzhen,happy-valley,amusement',
  'sz-sea-world':      'shenzhen,sea-world,waterfront',
  'sz-coco-park':      'shenzhen,coco-park,shopping',
  'sz-nanshan':        'shenzhen,nanshan,park',
  // === Shenzhen food ===
  'sz-seafood':        'shenzhen,seafood,restaurant',
  'sz-hotpot':         'hotpot,shenzhen,chinese',
  'sz-cantonese':      'cantonese,dim-sum,teahouse',
  'sz-snacks':         'shenzhen,street-food,market',
  // === Shenzhen hotels ===
  'sz-hotel-grand':    'shenzhen,grand-hotel,luxury',
  'sz-hotel-futian':   'shenzhen,futian,hotel,city',
  'sz-hotel-nanshan':  'shenzhen,nanshan,hotel,resort',
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
  'sz-train':          'highspeed-train,guangzhou,shenzhen',
  'sz-flight':         'airplane,airport,sky',
  'bj-train':          'highspeed-train,railway,beijing',
  'taxi':              'taxi,city,travel',
  // === Summary highlights / chapters ===
  'sz-chapter-1':      'shenzhen,train-station,morning',
  'sz-chapter-2':      'shenzhen,skyline,daytime',
  'sz-chapter-3':      'shenzhen,night-view,city',
  'sz-chapter-4':      'shenzhen,shopping,mall',
  'bj-chapter-1':      'beijing,flag-raising,tiananmen',
  'bj-chapter-2':      'beijing,forbiddencity,palace',
  'bj-chapter-3':      'beijing,summerpalace,boat',
  'bj-chapter-4':      'beijing,hutong,night',
};

const LOCK_MAP: Record<string, number> = {
  'sz-hotel-grand': 2, 'sz-hotel-futian': 5, 'sz-hotel-nanshan': 8,
  'bj-hotel-hilton': 3, 'bj-hotel-qianmen': 6, 'bj-hotel-grand': 9,
};

interface Props {
  seed: string;
  /** Direct image URL — overrides the loremflickr seed lookup when provided */
  src?: string;
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Photo({
  seed, src, width = '100%', height = '100%',
  radius = 10, children, style,
}: Props) {
  const tag = TAG_MAP[seed] ?? seed.replace(/-/g, ',');
  const lock = LOCK_MAP[seed] ?? 1;
  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  const resolvedSrc = src?.startsWith('/static/') && apiBase ? `${apiBase}${src}` : src;
  const url = resolvedSrc || photoUrl(tag, 480, 480, lock);

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
