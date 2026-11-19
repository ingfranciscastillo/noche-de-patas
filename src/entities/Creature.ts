import Phaser from 'phaser';
import { TILE } from '../data/tuning';
import { Voice, Audio } from '../systems/AudioEngine';
import { GameMap, Pt, T } from '../systems/MapBuilder';
import { findPath } from '../systems/Pathfinding';
import { Lighting } from '../systems/Lighting';
import { NoiseSystem } from '../systems/NoiseSystem';
import type { Player } from './Player';

export type Cause = 'millipede' | 'spider' | 'centipede';

/** Lo que una criatura puede consultar/hacer del mundo. Lo implementa la escena Game. */
export interface GameCtx {
  map: GameMap;
  player: Player;
  lighting: Lighting;
  noise: NoiseSystem;
  now: number; // segundos de partida
  alarmActive: boolean;
  generatorPos: Pt;
  hitPlayer(cause: Cause): void;
  creatureOpensDoor(tx: number, ty: number): void;
  addBlocker(x: number, y: number, r: number): Phaser.GameObjects.Zone;
  removeBlocker(z: Phaser.GameObjects.Zone): void;
}

export abstract class Creature {
  x: number;
  y: number;
  heading = 0;
  state = 'IDLE';
  stateTime = 0;
  path: Pt[] = [];
  pathIdx = 0;
  pathGoal: Pt | null = null;
  protected gfx: Phaser.GameObjects.Graphics;
  protected voice: Voice | null = null;
  abstract readonly kind: Cause;
  abstract readonly radius: number;
  /** Para el latido: 0..1 cuánto amenaza ahora mismo. */
  threat = 0;

  constructor(protected scene: Phaser.Scene, protected ctx: GameCtx, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.gfx = scene.add.graphics().setDepth(8);
    this.voice = Audio.createVoice();
  }

  setState(s: string) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  distToPlayer() {
    return Math.hypot(this.ctx.player.x - this.x, this.ctx.player.y - this.y);
  }

  /** Recalcula ruta A* a una posición en px. */
  pathTo(px: number, py: number): boolean {
    const m = this.ctx.map;
    const s = m.toTile(this.x, this.y);
    const g = m.toTile(px, py);
    const p = findPath(m, s, g);
    if (!p) { this.path = []; this.pathIdx = 0; this.pathGoal = null; return false; }
    this.path = p;
    this.pathIdx = 0;
    this.pathGoal = { x: px, y: py };
    return true;
  }

  /**
   * Avanza por la ruta. `lateral` desplaza perpendicularmente (zigzag) si no choca.
   * Devuelve true al llegar al final.
   */
  followPath(dt: number, speed: number, lateral = 0): boolean {
    if (this.pathIdx >= this.path.length) {
      if (this.pathGoal) {
        // último tramo hasta el punto exacto
        const dx = this.pathGoal.x - this.x, dy = this.pathGoal.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 3 || this.ctx.map.circleBlockedForCreature(this.pathGoal.x, this.pathGoal.y, this.radius * 0.6)) return true;
        this.moveDir(dx / d, dy / d, Math.min(speed * dt, d), 0);
        return false;
      }
      return true;
    }
    const n = this.path[this.pathIdx];
    const c = this.ctx.map.center(n.x, n.y);
    const dx = c.x - this.x, dy = c.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) {
      this.pathIdx++;
      return false;
    }
    // Las criaturas empujan puertas al pasar
    if (this.ctx.map.at(n.x, n.y) === T.DOOR && d < TILE) this.ctx.creatureOpensDoor(n.x, n.y);
    this.moveDir(dx / d, dy / d, Math.min(speed * dt, d), lateral * speed * dt);
    return false;
  }

  protected moveDir(nx: number, ny: number, step: number, lat: number) {
    const m = this.ctx.map;
    let tx = this.x + nx * step, ty = this.y + ny * step;
    if (lat !== 0) {
      const lx = tx + -ny * lat, ly = ty + nx * lat;
      if (!m.circleBlockedForCreature(lx, ly, this.radius)) { tx = lx; ty = ly; }
    }
    this.x = tx;
    this.y = ty;
    this.turnTowards(Math.atan2(ny, nx), 0.25);
  }

  /** Gira el rumbo como máximo `maxStep` radianes. */
  turnTowards(target: number, maxStep: number) {
    const diff = Phaser.Math.Angle.Wrap(target - this.heading);
    this.heading += Phaser.Math.Clamp(diff, -maxStep, maxStep);
  }

  /** Movimiento libre en línea recta con choque contra muros (embestidas). Devuelve false si chocó. */
  moveFree(vx: number, vy: number, dt: number): boolean {
    const m = this.ctx.map;
    const nx = this.x + vx * dt, ny = this.y + vy * dt;
    if (m.circleBlockedForCreature(nx, ny, this.radius)) {
      // deslizar por ejes
      if (!m.circleBlockedForCreature(nx, this.y, this.radius)) { this.x = nx; return false; }
      if (!m.circleBlockedForCreature(this.x, ny, this.radius)) { this.y = ny; return false; }
      return false;
    }
    this.x = nx;
    this.y = ny;
    return true;
  }

  /** Volumen/paneo de su voz respecto al jugador. */
  protected updateVoice(range: number, extra = 1) {
    Audio.setVoiceSpatial(this.voice, this.x - this.ctx.player.x, this.y - this.ctx.player.y, range, extra);
  }

  abstract update(dt: number): void;
  abstract draw(time: number): void;

  debugDraw(g: Phaser.GameObjects.Graphics) {
    if (this.path.length) {
      g.lineStyle(1, 0xffaa00, 0.8).beginPath();
      g.moveTo(this.x, this.y);
      for (let i = this.pathIdx; i < this.path.length; i++) {
        const c = this.ctx.map.center(this.path[i].x, this.path[i].y);
        g.lineTo(c.x, c.y);
      }
      g.strokePath();
    }
    g.lineStyle(1, 0xff3333, 1).strokeCircle(this.x, this.y, this.radius);
  }

  destroy() {
    Audio.stopVoice(this.voice);
    this.voice = null;
    this.gfx.destroy();
  }
}

/** Cadena de segmentos: cada uno sigue al anterior a distancia fija. */
export class SegmentChain {
  pts: Pt[] = [];
  constructor(n: number, public spacing: number, x: number, y: number, dirX = -1, dirY = 0) {
    for (let i = 0; i < n; i++) this.pts.push({ x: x + dirX * spacing * i, y: y + dirY * spacing * i });
  }
  follow(hx: number, hy: number) {
    this.pts[0].x = hx;
    this.pts[0].y = hy;
    for (let i = 1; i < this.pts.length; i++) {
      const p = this.pts[i - 1], c = this.pts[i];
      const dx = c.x - p.x, dy = c.y - p.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      if (d > this.spacing) {
        c.x = p.x + (dx / d) * this.spacing;
        c.y = p.y + (dy / d) * this.spacing;
      }
    }
  }
  reset(x: number, y: number) {
    for (const p of this.pts) { p.x = x; p.y = y; }
  }
  /** Ángulo local del segmento i (dirección hacia el anterior). */
  angle(i: number) {
    const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(this.pts.length - 1, i === 0 ? 1 : i)];
    return Math.atan2(a.y - b.y, a.x - b.x);
  }
}
