/**
 * API-layer types. Page-data shapes live alongside their domain file
 * (pois.ts, itinerary.ts, order.ts). Cross-cutting types stay here.
 */
import type { POI, Identity, Scene, ItineraryStep, POIType } from '../types';
export type { POI, Identity, Scene, ItineraryStep, POIType };

/** Chunk emitted by the streaming chat agent. */
export type ChatChunk =
  | { kind: 'thinking'; step: string }        // 已完成酒旅相关信息查询 / 正在查询...
  | { kind: 'text';     delta: string }       // streaming text delta (append)
  | { kind: 'section';  title: string }       // 行程概览 / 住宿方案 / 小贴士 ...
  | { kind: 'spot';     name: string; rating: number; intro: string; seed: string }
  | { kind: 'tip';      label: string; body: string }
  | { kind: 'hotel';    name: string; rating: string; price: string; seed: string }
  | { kind: 'done' };

export interface RerankResult {
  scene: Scene;
  days: Array<{
    label: string;
    title: string;
    items: ItineraryStep[];
  }>;
  /** Variant index — server returns a deterministic ordering id */
  variantId: string;
}

export interface OrderDraft {
  orderId: string;
  total: number;
  items: Array<{ id: string; name: string; amount: string; qty: string }>;
  travelers: Array<{ name: string; idNo: string }>;
}

export interface PaymentResult {
  orderId: string;
  paidAt: string;     // ISO
  voucherCount: number;
}

export interface RideQuote {
  from: string;
  to: string;
  km: number;
  etaMin: number;
  estimate: number;   // ¥
  carType: string;
}

export interface WeatherForecast {
  city: string;
  days: Array<{ date: string; cond: '晴' | '雨' | '雪' | '多云'; tempH: number; tempL: number }>;
}

export interface BoardState {
  orderId: string;
  currentStationId: string | null;
  completedStationIds: string[];
  lastUpdated: string;
}

export interface ApiError {
  code: string;
  message: string;
  status?: number;
}
