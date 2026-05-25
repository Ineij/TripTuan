import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Identity, Scene } from './types';

const defaultIdentity: Identity = {
  partySize: 1,
  hasElder: false,
  hasKid: false,
  hasSpecial: false,
  preferences: ['打卡行', '爱美食'],
  nights: 1,
  startDate: '2026-05-23',
  endDate: '2026-05-24',
};

export type Weather = 'sunny' | 'rainy' | 'snowy';

interface AppState {
  scene: Scene;
  setScene: (s: Scene) => void;
  identity: Identity;
  setIdentity: (i: Identity) => void;
  selectedPOIs: Set<string>;
  setSelectedPOIs: (s: Set<string>) => void;
  togglePOI: (id: string) => void;
  /** Per-POI selected package (food only) — null = "只去店不团券" */
  poiPackages: Record<string, string | null>;
  setPoiPackage: (poiId: string, pkgId: string | null) => void;
  paid: boolean;
  setPaid: (b: boolean) => void;
  weather: Weather;
  setWeather: (w: Weather) => void;
}

const AppCtx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [scene, setScene] = useState<Scene>('hk');
  const [identity, setIdentity] = useState<Identity>(defaultIdentity);
  const [selectedPOIs, setSelectedPOIs] = useState<Set<string>>(new Set());
  const [poiPackages, setPoiPackages] = useState<Record<string, string | null>>({});
  const [paid, setPaid] = useState(false);
  const [weather, setWeather] = useState<Weather>('snowy');

  const togglePOI = (id: string) => {
    setSelectedPOIs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const setPoiPackage = (poiId: string, pkgId: string | null) =>
    setPoiPackages((prev) => ({ ...prev, [poiId]: pkgId }));

  return (
    <AppCtx.Provider
      value={{
        scene, setScene, identity, setIdentity,
        selectedPOIs, setSelectedPOIs, togglePOI,
        poiPackages, setPoiPackage,
        paid, setPaid,
        weather, setWeather,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
