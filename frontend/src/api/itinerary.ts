/**
 * Itinerary endpoints — /p4 重排 + /p5 预览 + 重新生成 variant.
 *
 * Backend contract:
 *   POST /api/itinerary/rerank        body: { scene, identity, picks[] }
 *                                     → RerankPayload
 *   POST /api/itinerary/regenerate    body: { scene, lastVariantId? }
 *                                     → RerankPayload  (different ordering)
 *   GET  /api/itinerary/preview?scene → PreviewPayload
 */
import { request } from './http';
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
  /** Meal slot label (早餐/午餐/晚餐) when this row is a meal */
  meal?: string;
  /** True for a self-arranged meal placeholder (not a booked item) */
  selfArranged?: boolean;
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
  identity: Identity,
  picks: string[],
  prevVariantId?: string,
): Promise<RerankPayload> {
  return request<RerankPayload>('/api/itinerary/rerank', {
    method: 'POST',
    body: JSON.stringify({ scene, identity, picks, prevVariantId }),
  });
}

export async function getPreview(scene: Scene): Promise<PreviewPayload> {
  return request<PreviewPayload>(`/api/itinerary/preview?scene=${scene}`);
}
