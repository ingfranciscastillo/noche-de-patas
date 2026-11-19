import { AUDIO } from '../data/tuning';

/** Progreso persistente en localStorage, con versión de esquema y lectura defensiva. */
const KEY = 'noche-de-patas.save';
const VERSION = 1;

export interface SaveData {
  version: number;
  unlockedNight: number; // 1..3
  volume: number; // 0..1
  bestTimes: Record<string, number>; // noche → segundos
}

const defaults = (): SaveData => ({ version: VERSION, unlockedNight: 1, volume: AUDIO.defaultVolume, bestTimes: {} });

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object' && (p.version ?? 0) <= VERSION) {
        data = {
          version: VERSION,
          unlockedNight: clampInt(p.unlockedNight, 1, 3, 1),
          volume: typeof p.volume === 'number' ? Math.max(0, Math.min(1, p.volume)) : AUDIO.defaultVolume,
          bestTimes: p.bestTimes && typeof p.bestTimes === 'object' ? p.bestTimes : {},
        };
      }
    }
  } catch {
    /* almacenamiento bloqueado o corrupto: seguimos con valores por defecto */
  }
  cache = data;
  return data;
}

export function writeSave(patch: Partial<SaveData>) {
  const d = { ...loadSave(), ...patch, version: VERSION };
  cache = d;
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* sin persistencia en modo privado: el juego sigue funcionando */
  }
}

function clampInt(v: unknown, min: number, max: number, def: number) {
  const n = typeof v === 'number' ? Math.floor(v) : def;
  return Math.max(min, Math.min(max, n));
}
