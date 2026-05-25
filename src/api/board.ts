/**
 * Dynamic board endpoints — /p7 看板 + /p8 地图.
 *
 * The board fuses several signals: itinerary progress, ride-hailing, weather,
 * nearby recommendations, voucher redemption.
 *
 * Backend contract:
 *   GET  /api/board/:orderId               → BoardState
 *   POST /api/board/:orderId/checkin       body: { stationId } → void
 *   POST /api/board/:orderId/ride          body: { from, to } → RideQuote
 *   GET  /api/weather?city=hk              → WeatherForecast
 *   GET  /api/recommend/nearby             query: lat,lng,radius,type? → POI[]
 */
import { USE_MOCK, request, sleep } from './http';
import type {
  BoardState, RideQuote, WeatherForecast, POI, Scene,
} from './types';

export async function getBoardState(orderId: string): Promise<BoardState> {
  if (!USE_MOCK) return request<BoardState>(`/api/board/${orderId}`);
  await sleep(60);
  return {
    orderId,
    currentStationId: null,
    completedStationIds: [],
    lastUpdated: new Date().toISOString(),
  };
}

export async function checkInStation(orderId: string, stationId: string): Promise<void> {
  if (!USE_MOCK) {
    await request<void>(`/api/board/${orderId}/checkin`, {
      method: 'POST', body: JSON.stringify({ stationId }),
    });
    return;
  }
  await sleep(60);
}

export async function callRide(
  orderId: string,
  from: string,
  to: string,
): Promise<RideQuote> {
  if (!USE_MOCK) {
    return request<RideQuote>(`/api/board/${orderId}/ride`, {
      method: 'POST', body: JSON.stringify({ from, to }),
    });
  }
  await sleep(200);
  return { from, to, km: 1.8, etaMin: 7, estimate: 18, carType: '美团快车' };
}

export async function getWeather(scene: Scene): Promise<WeatherForecast> {
  if (!USE_MOCK) return request<WeatherForecast>(`/api/weather?scene=${scene}`);
  await sleep(60);
  const city = scene === 'hk' ? '香港' : '北京';
  return {
    city,
    days: [
      { date: '今天', cond: '晴',   tempH: 29, tempL: 24 },
      { date: '明天', cond: '多云', tempH: 33, tempL: 25 },
      { date: '后天', cond: '雨',   tempH: 28, tempL: 23 },
    ],
  };
}

export async function getNearbyRecs(
  _lat: number,
  _lng: number,
  _type?: 'food' | 'sight' | 'coffee',
): Promise<POI[]> {
  if (!USE_MOCK) {
    return request<POI[]>(`/api/recommend/nearby?lat=${_lat}&lng=${_lng}&type=${_type ?? ''}`);
  }
  await sleep(150);
  return []; // teammate fills with real LBS results
}
