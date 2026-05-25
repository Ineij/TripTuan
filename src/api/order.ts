/**
 * Order endpoints — /p6 confirm + pay + voucher.
 *
 * Page (Step6_Order) currently owns its own ITEMS_BY_SCENE inline; teammates
 * swap that for real `getOrderDraft()` once backend is ready.
 *
 * Backend contract:
 *   POST /api/orders/draft     body: { scene, picks[] }
 *                              → OrderDraft  (line items, total, suggested travelers)
 *   PATCH /api/orders/:id      body: { items?, travelers?, contact? }
 *                              → OrderDraft
 *   POST /api/orders/:id/pay   body: { method }                  → PaymentResult
 *   GET  /api/orders/:id       → OrderDraft
 */
import { USE_MOCK, request, sleep } from './http';
import type { Scene, OrderDraft, PaymentResult } from './types';

export type OrderItemType = '交通' | '景点' | '美食' | '酒店';

export interface OrderLine {
  id: string;
  type: OrderItemType;
  name: string;
  qty: string;           // "¥75 / 人 × 1" etc
  amount: string;        // "¥75" or "免费"
  photoSeed: string;
}

export interface Traveler {
  name: string;
  idNo: string;
}

export interface CreateDraftReq {
  scene: Scene;
  picks: string[];                     // POI/item ids from /p3
  travelers: Traveler[];
  contactPhone?: string;
}

export async function getOrderDraft(req: CreateDraftReq): Promise<OrderDraft> {
  if (!USE_MOCK) {
    return request<OrderDraft>('/api/orders/draft', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }
  await sleep(120);
  // Mock placeholder — page still owns ITEMS_BY_SCENE inline.
  return {
    orderId: 'mock-' + Date.now(),
    total: 0,
    items: [],
    travelers: req.travelers,
  };
}

export async function patchOrder(
  orderId: string,
  patch: Partial<{ items: OrderLine[]; travelers: Traveler[]; contactPhone: string }>,
): Promise<OrderDraft> {
  if (!USE_MOCK) {
    return request<OrderDraft>(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }
  await sleep(80);
  return { orderId, total: 0, items: [], travelers: patch.travelers ?? [] };
}

export async function payOrder(
  orderId: string,
  method: 'wechat' | 'alipay' | 'meituan-balance' = 'wechat',
): Promise<PaymentResult> {
  if (!USE_MOCK) {
    return request<PaymentResult>(`/api/orders/${orderId}/pay`, {
      method: 'POST',
      body: JSON.stringify({ method }),
    });
  }
  await sleep(1300); // mirrors current UX delay
  return {
    orderId,
    paidAt: new Date().toISOString(),
    voucherCount: 0,
  };
}
