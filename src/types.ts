export type POIType = '景点' | '美食' | '酒店' | '交通';

export interface POI {
  id: string;
  name: string;
  type: POIType;
  rating: number;
  desc: string;
  price?: number;
  duration?: string;
  tags?: string[];
}

export interface Identity {
  partySize: number;
  hasElder: boolean;
  hasKid: boolean;
  hasSpecial: boolean;       // 孕妇/残疾人/其他
  preferences: string[];
  nights: number;
  startDate: string;
  endDate: string;
}

export type Scene = 'hk' | 'bj';

export interface ItineraryStep {
  time: string;
  title: string;
  type: POIType;
  duration?: string;
  desc?: string;
  done?: boolean;
}
