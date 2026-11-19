import { NOISE } from '../data/tuning';

export type NoiseSource = 'player' | 'door' | 'pickup' | 'bottle' | 'pant' | 'alarm';

export interface NoiseEvent {
  x: number;
  y: number;
  radius: number;
  source: NoiseSource;
}

type Listener = (e: NoiseEvent) => void;

/** Bus de eventos de ruido. Las criaturas que "oyen" se suscriben. */
export class NoiseSystem {
  private listeners: Listener[] = [];
  /** Ruidos recientes (para el modo debug F3). */
  recent: { e: NoiseEvent; life: number }[] = [];

  on(fn: Listener) {
    this.listeners.push(fn);
  }

  emit(x: number, y: number, radius: number, source: NoiseSource) {
    if (radius <= 0) return;
    const e = { x, y, radius, source };
    this.recent.push({ e, life: NOISE.debugLifetime });
    for (const l of this.listeners) l(e);
  }

  update(dt: number) {
    for (const r of this.recent) r.life -= dt;
    this.recent = this.recent.filter((r) => r.life > 0);
  }

  clear() {
    this.listeners = [];
    this.recent = [];
  }
}
