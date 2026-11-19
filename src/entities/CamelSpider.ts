import Phaser from 'phaser';
import { PLAYER, SPIDER } from '../data/tuning';
import { Audio } from '../systems/AudioEngine';
import { Pt, T } from '../systems/MapBuilder';
import { NoiseEvent } from '../systems/NoiseSystem';
import { Creature, GameCtx } from './Creature';

/**
 * Araña camello (solífugo) — "La Mordedora" (oído).
 * Ciega: solo reacciona al ruido. Corre en zigzag a ráfagas hacia el origen del sonido.
 */
export class CamelSpider extends Creature {
  readonly kind = 'spider' as const;
  readonly radius = SPIDER.radius;
  private burstPhase = 0; // tiempo dentro del ciclo ráfaga/pausa
  private zig = 1;
  private moving = false;
  private clickTimer = 0;
  private pauseLeft = 0;
  private legPhase = 0;
  private jaw = 0;
  private shakeSpot: Pt | null = null;
  heardFromPlayer = false;
  private abd: Phaser.GameObjects.Image;
  private thx: Phaser.GameObjects.Image;
  private gfxTop: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, ctx: GameCtx, x: number, y: number) {
    super(scene, ctx, x, y);
    this.gfx.setDepth(8);
    this.abd = scene.add.image(x, y, 'sabd').setDepth(8);
    this.thx = scene.add.image(x, y, 'sthx').setDepth(8);
    this.gfxTop = scene.add.graphics().setDepth(8.5);
    this.setState('PATROL');
    ctx.noise.on((e) => this.onNoise(e));
  }

  private onNoise(e: NoiseEvent) {
    if (this.state === 'FLEE' || this.state === 'SHAKE' || this.state === 'ALARM') return;
    const d = Math.hypot(e.x - this.x, e.y - this.y);
    if (d > e.radius) return;
    this.heardFromPlayer = e.source === 'player' || e.source === 'pant' || e.source === 'door' || e.source === 'pickup';
    if (this.state !== 'HUNT') { this.burstPhase = 0; this.zig = Math.random() < 0.5 ? 1 : -1; }
    this.setState('HUNT');
    this.pathTo(e.x, e.y);
  }

  /** Lo llama Game cuando el jugador se esconde habiendo corrido hace poco. */
  sniffHidden(spot: Pt, center: Pt) {
    if (this.state === 'FLEE' || this.state === 'ALARM') return;
    this.shakeSpot = spot;
    this.setState('HUNT');
    this.pathTo(center.x, center.y);
  }

  update(dt: number) {
    const ctx = this.ctx;
    const p = ctx.player;
    this.stateTime += dt;
    this.moving = false;
    let fast = false;

    if (ctx.alarmActive && this.state !== 'ALARM' && this.state !== 'FLEE') {
      this.setState('ALARM');
      this.pathTo(ctx.generatorPos.x, ctx.generatorPos.y);
    }

    switch (this.state) {
      case 'PATROL': {
        if (this.pauseLeft > 0) { this.pauseLeft -= dt; break; }
        if (this.path.length === 0 || this.pathIdx >= this.path.length) {
          // patrulla errática: puntos cercanos al azar
          const t = this.nearbyTile(8);
          this.pathTo(t.x, t.y);
        }
        if (this.followPath(dt, SPIDER.patrolSpeed, Math.sin(this.stateTime * 7) * 0.4)) {
          this.path = [];
          this.pauseLeft = Phaser.Math.FloatBetween(SPIDER.patrolPauseMin, SPIDER.patrolPauseMax);
        }
        this.moving = true;
        break;
      }
      case 'HUNT': {
        // Ráfagas de 0.6 s a gran velocidad en zigzag, pausas de 0.4 s
        this.burstPhase += dt;
        const cycle = SPIDER.burstTime + SPIDER.pauseTime;
        if (this.burstPhase >= cycle) { this.burstPhase -= cycle; this.zig *= -1; }
        if (this.burstPhase < SPIDER.burstTime) {
          const lat = this.zig * SPIDER.zigzagAmplitude * Math.sin((this.burstPhase / SPIDER.burstTime) * Math.PI);
          const arrived = this.followPath(dt, SPIDER.burstSpeed, lat);
          this.moving = true;
          fast = true;
          if (arrived) {
            if (this.shakeSpot) { this.setState('SHAKE'); Audio.lockerRattle(this.x - p.x, this.y - p.y); }
            else this.setState('LISTEN');
          }
        }
        this.tryBite();
        break;
      }
      case 'LISTEN': {
        // Silencio repentino: se ha parado a escuchar
        if (this.stateTime > SPIDER.listenTime) { this.setState('PATROL'); this.path = []; }
        this.tryBite();
        break;
      }
      case 'SHAKE': {
        // Sacude el mueble donde se esconde el jugador
        if (!p.hidden || !this.shakeSpot || p.hidden.x !== this.shakeSpot.x || p.hidden.y !== this.shakeSpot.y) {
          this.shakeSpot = null;
          this.setState('LISTEN');
          break;
        }
        if (this.stateTime >= SPIDER.shakeTime) {
          this.shakeSpot = null;
          ctx.hitPlayer('spider');
          this.flee();
        }
        break;
      }
      case 'FLEE': {
        if (this.path.length === 0 || this.pathIdx >= this.path.length) {
          const t = this.awayTile();
          this.pathTo(t.x, t.y);
        }
        this.followPath(dt, SPIDER.fleeSpeed);
        this.moving = true;
        fast = true;
        if (this.stateTime > SPIDER.fleeTime) { this.setState('PATROL'); this.path = []; }
        break;
      }
      case 'ALARM': {
        if (!ctx.alarmActive) { this.setState('PATROL'); this.path = []; break; }
        if (this.stateTime > 1.5 && (this.path.length === 0 || this.pathIdx >= this.path.length)) {
          // ronda nerviosa alrededor del generador
          const g = ctx.generatorPos;
          this.pathTo(g.x + Phaser.Math.Between(-90, 90), g.y + Phaser.Math.Between(-90, 90));
          this.stateTime = 0;
        }
        this.followPath(dt, SPIDER.burstSpeed * 0.7, Math.sin(this.stateTime * 9) * 0.6);
        this.moving = true;
        fast = true;
        this.tryBite();
        break;
      }
    }

    // Audio: chasquido seco de patas, solo audible de cerca
    if (this.moving) {
      this.clickTimer -= dt;
      if (this.clickTimer <= 0) {
        this.clickTimer = fast ? 0.07 : 0.14;
        Audio.spiderClick(this.voice, fast);
      }
      this.legPhase += dt * (fast ? 30 : 14);
    }
    this.jaw += dt * (this.state === 'HUNT' || this.state === 'SHAKE' ? 14 : 4);
    this.updateVoice(SPIDER.audioRange, 1.2);
    const d = this.distToPlayer();
    const hunting = this.state === 'HUNT' || this.state === 'SHAKE' || this.state === 'LISTEN';
    this.threat = Math.max(0, 1 - d / 300) * (hunting ? 1 : 0.6);
  }

  private tryBite() {
    const p = this.ctx.player;
    if (p.hidden) return;
    if (this.distToPlayer() > this.radius + PLAYER.radius + SPIDER.biteRange * 0.5) return;
    // Escuchando no "nota" a un jugador quieto o sigiloso aunque lo roce: hay que oírlo.
    if (this.state === 'LISTEN' && (p.mode === 'idle' || p.mode === 'sneak')) return;
    this.ctx.hitPlayer('spider');
    this.flee();
  }

  private flee() {
    this.setState('FLEE');
    const t = this.awayTile();
    this.pathTo(t.x, t.y);
  }

  private nearbyTile(radiusTiles: number): Pt {
    const m = this.ctx.map;
    const me = m.toTile(this.x, this.y);
    for (let i = 0; i < 20; i++) {
      const tx = me.x + Phaser.Math.Between(-radiusTiles, radiusTiles);
      const ty = me.y + Phaser.Math.Between(-radiusTiles, radiusTiles);
      if (m.isWalkable(tx, ty) && m.at(tx, ty) !== T.DOOR) return m.center(tx, ty);
    }
    const r = m.randomWalkable();
    return m.center(r.x, r.y);
  }

  private awayTile(): Pt {
    const p = this.ctx.player;
    let best = this.nearbyTile(10);
    let bd = -1;
    for (let i = 0; i < 14; i++) {
      const t = this.nearbyTile(10);
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d > bd) { bd = d; best = t; }
    }
    return best;
  }

  draw(time: number) {
    const g = this.gfx;
    g.clear();
    const x = this.x, y = this.y, a = this.heading;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = -sa, py = ca;
    const t = time / 1000;
    let ox = 0, oy = 0;
    if (this.state === 'SHAKE') { ox = Math.sin(t * 60) * 1.5; oy = Math.cos(t * 50) * 1.5; }
    const cx = x + ox, cy = y + oy;
    // 8 patas largas y peludas
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 4; k++) {
        const base = -0.9 + k * 0.62;
        const sw = Math.sin(this.legPhase + k * 1.7 + (side > 0 ? Math.PI : 0)) * 0.28;
        const ang = a + side * (Math.PI / 2 + base * 0.9) + sw;
        const kx = cx + Math.cos(ang) * 9, ky = cy + Math.sin(ang) * 9;
        const fx = kx + Math.cos(ang + side * 0.5) * 9, fy = ky + Math.sin(ang + side * 0.5) * 9;
        g.lineStyle(2, 0x9c8550).lineBetween(cx + px * side * 2, cy + py * side * 2, kx, ky);
        g.lineStyle(1, 0xc8ad6e).lineBetween(kx, ky, fx, fy);
      }
    }
    // Abdomen peludo y cefalotórax: sprites
    this.abd.setPosition(cx - ca * 9, cy - sa * 9).setRotation(a);
    this.thx.setPosition(cx, cy).setRotation(a);
    // Pedipalpos (parecen patas extra delante) y quelíceros, por encima del cuerpo
    const gt = this.gfxTop;
    gt.clear();
    for (let side = -1; side <= 1; side += 2) {
      const pa = a + side * 0.55 + Math.sin(t * 6 + side) * 0.12;
      gt.lineStyle(2, 0xd9c089).lineBetween(cx + ca * 4, cy + sa * 4, cx + Math.cos(pa) * 15, cy + Math.sin(pa) * 15);
    }
    // Quelíceros enormes que se abren y cierran
    const open = 0.15 + (Math.sin(this.jaw) * 0.5 + 0.5) * 0.35;
    for (let side = -1; side <= 1; side += 2) {
      const ja = a + side * open;
      const jx = cx + ca * 5 + px * side * 2, jy = cy + sa * 5 + py * side * 2;
      gt.lineStyle(4, 0x8a6c3a).lineBetween(jx, jy, jx + Math.cos(ja) * 6, jy + Math.sin(ja) * 6);
      gt.lineStyle(2, 0x2a1d10).lineBetween(jx + Math.cos(ja) * 5, jy + Math.sin(ja) * 5, jx + Math.cos(ja - side * 0.6) * 9, jy + Math.sin(ja - side * 0.6) * 9);
    }
  }

  destroy() {
    this.abd.destroy();
    this.thx.destroy();
    this.gfxTop.destroy();
    super.destroy();
  }
}
