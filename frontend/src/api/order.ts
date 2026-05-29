/**
 * Order endpoints — /p6 confirm + pay + voucher.
 *
 * Backend contract:
 *   POST /api/orders/draft     body: { scene, picks[] }
 *                              → OrderDraft  (line items, total, suggested travelers)
 *   PATCH /api/orders/:id      body: { items?, travelers?, contact? }
 *                              → OrderDraft
 *   POST /api/orders/:id/pay   body: { method }                  → PaymentResult
 *   GET  /api/orders/:id       → OrderDraft
 */
import { request } from './http';
import type { Scene, OrderDraft, PaymentResult } from './types';

export type OrderItemType = '交通' | '景点' | '美食' | '酒店';

export interface OrderLine {
  id: string;
  type: OrderItemType;
  name: string;
  qty: string;
  amount: string;
  photoSeed: string;
}

export interface Traveler {
  name: string;
  idNo: string;
}

export interface CreateDraftReq {
  scene: Scene;
  picks: string[];
  travelers: Traveler[];
  contactPhone?: string;
}

export async function getOrderDraft(req: CreateDraftReq): Promise<OrderDraft> {
  return request<OrderDraft>('/api/orders/draft', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function patchOrder(
  orderId: string,
  patch: Partial<{ items: OrderLine[]; travelers: Traveler[]; contactPhone: string }>,
): Promise<OrderDraft> {
  return request<OrderDraft>(`/api/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function payOrder(
  orderId: string,
  method: 'wechat' | 'alipay' | 'meituan-balance' = 'wechat',
): Promise<PaymentResult> {
  return request<PaymentResult>(`/api/orders/${orderId}/pay`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  });
}

export async function getOrder(orderId: string): Promise<OrderDraft> {
  return request<OrderDraft>(`/api/orders/${orderId}`);
}
