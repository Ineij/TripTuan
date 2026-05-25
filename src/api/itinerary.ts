/**
 * Itinerary endpoints — /p4 重排 + /p5 预览 + 重新生成 variant.
 *
 * Day-level shapes currently live inline in src/pages/Step5_Preview.tsx and
 * Step4_Rerank.tsx. Teammates: when backend is ready, return the same shape
 * here and replace the consumer imports.
 *
 * Backend contract:
 *   POST /api/itinerary/rerank        body: { scene, identity, picks[] }
 *                                     → RerankPayload
 *   POST /api/itinerary/regenerate    body: { scene, lastVariantId? }
 *                                     → RerankPayload  (different ordering)
 *   GET  /api/itinerary/preview?scene → PreviewPayload
 */
import { USE_MOCK, request, sleep } from './http';
import type { Identity, Scene } from './types';

export type Period = '出发' | '上午' | '中午' | '下午' | '晚餐' | '晚上' | '返程';
export type ItineraryCat = '交通' | '景点' | '美食' | '酒店';
export type Queue = '低' | '中' | '高';
export type HotelTier = '高档型' | '豪华型' | '舒适型';

export interface DayItem {
  period: Period;
  cat: ItineraryCat;
  name: string;
  rating: number;
  duration: string;
  price?: string;
  queue?: Queue;
  hotelTier?: HotelTier;
  note?: string;
  photoSeed: string;
}

export interface Day {
  label: string;   // 'DAY 1'
  title: string;
  items: DayItem[];
}

export interface RerankPayload {
  scene: Scene;
  variantId: string;
  days: Day[];
}

export interface PreviewPayload {
  scene: Scene;
  title: string;
  route: string;
  totalKm: string;
  days: Day[];
}

export async function rerank(
  scene: Scene,
  _identity: Identity,
  _picks: string[],
  prevVariantId?: string,
): Promise<RerankPayload> {
  if (!USE_MOCK) {
    return request<RerankPayload>('/api/itinerary/rerank', {
      method: 'POST',
      body: JSON.stringify({ scene, identity: _identity, picks: _picks, prevVariantId }),
    });
  }
  await sleep(400);
  // Mock: page currently owns the data. Teammate replaces this with a real
  // call once the rerank service is up.
  return {
    scene,
    variantId: prevVariantId ? 'v-' + Date.now() : 'v-default',
    days: [],
  };
}

export async function getPreview(scene: Scene): Promise<PreviewPayload> {
  if (!USE_MOCK) return request<PreviewPayload>(`/api/itinerary/preview?scene=${scene}`);
  await sleep(60);
  // Mock placeholder — Step5_Preview currently reads its own DAYS_BY_SCENE.
  return {
    scene,
    title: scene === 'hk' ? '香港周末漫游' : '北京家庭文化游',
    route: scene === 'hk' ? '深圳 → 香港 · 2 天 1 夜' : '河北 → 北京 · 2 天 1 夜',
    totalKm: scene === 'hk' ? '8.4' : '12.6',
    days: [],
  };
}
