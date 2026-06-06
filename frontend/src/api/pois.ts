/**
 * Pickable items for /p3 — transport schedules + POIs (sight/food/hotel).
 * All items come from the backend. The page is purely presentational.
 *
 * Backend contract:
 *   GET  /api/pois?scene=sz         → Item[]
 *   GET  /api/pois/:id              → Item
 *   POST /api/pois/transport/lookup → TransportSchedule[]  (alternate trains/flights)
 */
import { request } from './http';
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
  /** Original POI image URL from the source data, used when generated image is not available */
  photo?: string;
  /** Pre-generated Qwen illustration URL — present once /pois/pregenerate has run */
  imageUrl?: string;
  badge?: { label: string; color: 'yellow' | 'red' | 'orange' };
  preselect?: boolean;
  detail?: { tags: string[]; intro: string; tips: string[] };
  packages?: { id: string; name: string; price: string; original: string; items: string; subBadge: string }[];
}

export type Item = TransportItem | POIItem;

/* ============ Public API ============ */

export async function getPickerItems(scene: Scene): Promise<Item[]> {
  return request<Item[]>(`/api/pois?scene=${scene}`);
}

/**
 * Default schedule per transport item (the one flagged `default: true`).
 * Pure derivation from the items the backend returned — no mock data.
 */
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

/**
 * Initial selection set: every transport with a default schedule, plus any
 * POI marked `preselect: true` by the backend.
 */
export function defaultSelectedItems(items: Item[]): Set<string> {
  const next = new Set<string>();
  items.forEach((it) => {
    if ((it as POIItem).preselect || (it.cat === 'transport' && it.schedules.find((s) => s.default))) {
      next.add(it.id);
    }
  });
  return next;
}
