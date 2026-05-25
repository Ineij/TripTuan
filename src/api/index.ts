/**
 * API barrel + single contract surface.
 *
 * Pages should import from `../api` (this file) only. Teammate replacing the
 * mock backend changes individual function bodies in the adjacent files —
 * page imports never change.
 *
 * Each function corresponds 1:1 to a backend endpoint. Endpoint URLs and
 * payload shapes are documented in the per-file header comments
 * (content.ts / pois.ts / itinerary.ts / order.ts / board.ts / agent.ts).
 */
export * from './types';
export { USE_MOCK, request, sleep } from './http';

// chat agent — streaming
export { streamChat, sendMessage } from './agent';

// P1 chat static content
export {
  getHotels, getTips, getSpots, getSightDetail, getUserQuery, getChatScript,
} from './content';
export type { Hotel, Tip, Spot, SightDetail, SightSection } from './content';

// P3 picker
export {
  getPickerItems, defaultTransportPick, defaultSelectedItems,
} from './pois';
export type {
  Cat, Queue, HotelTier, TransportSchedule, TransportItem, POIItem, Item,
} from './pois';

// P4 / P5 itinerary
export { rerank, getPreview } from './itinerary';
export type {
  Period, ItineraryCat, DayItem, Day, RerankPayload, PreviewPayload,
} from './itinerary';

// P6 order
export { getOrderDraft, patchOrder, payOrder } from './order';
export type { OrderItemType, OrderLine, Traveler, CreateDraftReq } from './order';

// P7 / P8 board
export {
  getBoardState, checkInStation, callRide, getWeather, getNearbyRecs,
} from './board';

/**
 * Full Api shape — exported as a type only. Useful for testing /
 * dependency injection. Implementation lives across the per-domain files.
 */
import * as agent     from './agent';
import * as content   from './content';
import * as pois      from './pois';
import * as itinerary from './itinerary';
import * as order     from './order';
import * as board     from './board';

export const Api = {
  chat:      { stream: agent.streamChat, send: agent.sendMessage },
  content:   {
    hotels: content.getHotels, tips: content.getTips,
    spots: content.getSpots,   sightDetail: content.getSightDetail,
    userQuery: content.getUserQuery,
  },
  pois:      { list: pois.getPickerItems },
  itinerary: { rerank: itinerary.rerank, preview: itinerary.getPreview },
  order:     { draft: order.getOrderDraft, patch: order.patchOrder, pay: order.payOrder },
  board:     {
    state: board.getBoardState,
    checkIn: board.checkInStation,
    ride: board.callRide,
    weather: board.getWeather,
    nearby: board.getNearbyRecs,
  },
} as const;

export type ApiContract = typeof Api;
