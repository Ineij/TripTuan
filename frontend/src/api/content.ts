/**
 * Static content powering the P1 chat (hotels, tips, intros, spots, sight detail).
 * All endpoints are backend-driven — no inline mock arrays. The backend (with
 * the upcoming DB layer) is the single source of truth.
 */
import { request } from './http';
import type { Scene } from './types';

export interface Hotel { name: string; rating: string; price: string; seed: string }
export interface Tip { label: string; body: string }
export interface Spot { name: string; rating: number; intro: string; seed: string }
export interface SightDetail { icon: string; name: string; body: string }
export interface SightSection { period: string; items: SightDetail[] }

/* ============ Public API ============ */

export async function getHotels(scene: Scene): Promise<Hotel[]> {
  return request<Hotel[]>(`/api/hotels?scene=${scene}`);
}

export async function getTips(scene: Scene): Promise<Tip[]> {
  return request<Tip[]>(`/api/tips?scene=${scene}`);
}

export async function getSpots(scene: Scene): Promise<Spot[]> {
  return request<Spot[]>(`/api/spots?scene=${scene}`);
}

export async function getSightDetail(scene: Scene): Promise<SightSection[]> {
  return request<SightSection[]>(`/api/sight-detail?scene=${scene}`);
}

/**
 * Scene-keyed user-query phrasing shown above the chat bubble on /p1.
 * Empty string means the page should hide the bubble (or fetch from API).
 */
export function getUserQuery(_scene: Scene): string {
  return '';
}

/**
 * Bundled view-model for the streaming agent mock. Returns empty arrays —
 * the streaming endpoint at /api/chat/stream is the source of truth.
 */
export async function getChatScript(scene: Scene) {
  const [hotels, tips, spots, sightDetail] = await Promise.all([
    getHotels(scene), getTips(scene), getSpots(scene), getSightDetail(scene),
  ]);
  return {
    cityLabel: '',
    intro: '',
    spots,
    hotels,
    tips,
    sightDetail,
  };
}
