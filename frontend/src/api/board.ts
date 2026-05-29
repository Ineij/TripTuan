/**
 * Dynamic board endpoints — /p7 看板 + /p8 地图.
 *
 * Backend contract:
 *   GET  /api/board/:orderId               → BoardState
 *   POST /api/board/:orderId/checkin       body: { stationId } → void
 *   POST /api/board/:orderId/ride          body: { from, to } → RideQuote
 *   GET  /api/weather?city=hk              → WeatherForecast
 *   GET  /api/recommend/nearby             query: lat,lng,radius,type? → POI[]
 */
import { request } from './http';
import type {
  BoardState, RideQuote, WeatherForecast, POI, Scene,
} from './types';

export async function getBoardState(orderId: string): Promise<BoardState> {
  return request<BoardState>(`/api/board/${orderId}`);
}

export async function checkInStation(orderId: string, stationId: string): Promise<void> {
  await request<void>(`/api/board/${orderId}/checkin`, {
    method: 'POST',
    body: JSON.stringify({ stationId }),
  });
}

export async function callRide(
  orderId: string,
  from: string,
  to: string,
): Promise<RideQuote> {
  return request<RideQuote>(`/api/board/${orderId}/ride`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
}

export async function getWeather(scene: Scene): Promise<WeatherForecast> {
  return request<WeatherForecast>(`/api/weather?scene=${scene}`);
}

export interface PosterResult {
  status: 'ok' | 'failed' | 'error';
  imageUrl: string | null;
  title?: string;
  subtitle?: string;
  shareText?: string;
  prompt?: string;
  error?: string;
  generationStatus?: string;
}

export async function generatePoster(scene: Scene): Promise<PosterResult> {
  return request<PosterResult>('/api/poster', {
    method: 'POST',
    body: JSON.stringify({ scene }),
  });
}

export async function getNearbyRecs(
  lat: number,
  lng: number,
  type?: 'food' | 'sight' | 'coffee',
): Promise<POI[]> {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (type) q.set('type', type);
  return request<POI[]>(`/api/recommend/nearby?${q.toString()}`);
}

export interface MicroItem {
  id: string;
  name: string;
  type: string;
  rating: number;
  desc: string;
  price: number;
  tags: string[];
  photo: string;
  area: string;
  address: string;
  category_2: string;
  /** 'to_store' POIs come in-person; '外卖' can be ordered for delivery */
  mode: '外卖' | '到店';
  recommended: string[];
}

export async function getMicroRecs(scene: Scene, batch: number, limit = 5): Promise<MicroItem[]> {
  return request<MicroItem[]>(
    `/api/recommend/micro?scene=${scene}&batch=${batch}&limit=${limit}`,
  );
}
