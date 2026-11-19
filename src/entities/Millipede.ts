import Phaser from 'phaser';
import { MILLIPEDE, PLAYER } from '../data/tuning';
import { Audio } from '../systems/AudioEngine';
import { Creature, GameCtx, SegmentChain } from './Creature';

/**
 * Milpiés gigante africano — "El Inevitable" (olfato).
 * Lento pero siempre sabe dónde está el jugador (aprox.). La luz directa 1.5 s lo enrosca 5 s.
 */
export class Millipede extends Creature {
  readonly kind = 'millipede' as const;
  readonly radius = MILLIPEDE.radius;
  private chain: SegmentChain;
  private repath = 0;
  private lightTimer = 0;
  private coilCooldown = 0;
  private coilFrom: { x: number; y: number }[] = [];
  private blocker: Phaser.GameObjects.Zone | null = null;
  private moving = false;
  private parts: Phaser.GameObjects.Image[];
  private ring: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, ctx: GameCtx, x: number, y: number) {
    super(scene, ctx, x, y);
    this.chain = new SegmentChain(MILLIPEDE.segments, MILLIPEDE.segmentSpacing, x, y, 0, -1);
    this.gfx.setDepth(7);
    // La cabeza es parts[0]; se crean de la cola a la cabeza para que la cabeza quede encima
    const imgs: Phaser.GameObjects.Image[] = [];
    for (let i = MILLIPEDE.segments - 1; i >= 0; i--) imgs[i] = scene.add.image(x, y, i === 0 ? 'mhead' : i % 2 ? 'mseg_a' : 'mseg_b').setDepth(8);
    this.parts = imgs;
    this.ring = scene.add.circle(x, y, 10).setStrokeStyle(1, 0xffd9a0).setDepth(8).setVisible(false);
    this.setState('SLEEP');
    Audio.millipedeLoop(this.voice);
  }

  update(dt: number) {
    const ctx = this.ctx;
    const p = ctx.player;
    this.stateTime += dt;
    this.coilCooldown = Math.max(0, this.coilCooldown - dt);
    this.moving = false;

    // --- La luz lo enrosca (si no está en cooldown)
    if (this.state !== 'COILED' && this.state !== 'STUNNED') {
      const lit = ctx.lighting.isLit(this.x, this.y, 6) || ctx.lighting.isLit(this.chain.pts[3].x, this.chain.pts[3].y, 6);
      if (lit && this.coilCooldown <= 0) this.lightTimer += dt;
      else this.lightTimer = Math.max(0, this.lightTimer - dt * 0.5);
      if (this.lightTimer >= MILLIPEDE.lightTimeToCoil) this.startCoil();
    }

    switch (this.state) {
      case 'SLEEP': {
        if (this.stateTime >= MILLIPEDE.wakeDelay || this.distToPlayer() < 200 || ctx.alarmActive) { this.setState('CHASE'); this.repath = 0; }
        break;
      }
      case 'CHASE': {
        if (ctx.alarmActive) { this.setState('ALARM'); break; }
        if (p.hidden) {
          const c = ctx.map.center(p.hidden.x, p.hidden.y);
          if (Math.hypot(c.x - this.x, c.y - this.y) < 46) { this.setState('WAIT'); break; }
        }
        this.repath -= dt;
        if (this.repath <= 0 || this.path.length === 0) {
          this.repath = MILLIPEDE.repathInterval;
          let tx = p.x, ty = p.y;
          if (p.hidden) {
            const c = ctx.map.center(p.hidden.x, p.hidden.y);
            tx = c.x; ty = c.y;
          } else if (this.distToPlayer() > MILLIPEDE.exactWithin) {
            // "Sabe aproximadamente": error aleatorio
            tx += (Math.random() * 2 - 1) * MILLIPEDE.approxError;
            ty += (Math.random() * 2 - 1) * MILLIPEDE.approxError;
          }
          this.pathTo(tx, ty);
        }
        this.followPath(dt, MILLIPEDE.speed);
        this.moving = true;
        this.checkHit();
        break;
      }
      case 'WAIT': {
        // Se detiene frente al escondite y espera
        if (!p.hidden) { this.setState('CHASE'); this.repath = 0; break; }
        const c = ctx.map.center(p.hidden.x, p.hidden.y);
        this.turnTowards(Math.atan2(c.y - this.y, c.x - this.x), dt * 2);
        if (this.stateTime > MILLIPEDE.hideWaitPatience) {
          // se aburre y se aleja un rato
          const far = this.farTile();
          this.pathTo(far.x, far.y);
          this.setState('RETREAT');
        }
        break;
      }
      case 'RETREAT': {
        if (ctx.alarmActive) { this.setState('ALARM'); break; }
        this.followPath(dt, MILLIPEDE.speed);
        this.moving = true;
        this.checkHit();
        if (this.stateTime > MILLIPEDE.retreatDuration) { this.setState('CHASE'); this.repath = 0; }
        break;
      }
      case 'ALARM': {
        if (!ctx.alarmActive) { this.setState('CHASE'); this.repath = 0; break; }
        this.repath -= dt;
        if (this.repath <= 0) { this.repath = 1.5; this.pathTo(ctx.generatorPos.x, ctx.generatorPos.y); }
        this.followPath(dt, MILLIPEDE.speed * 1.2);
        this.moving = true;
        this.checkHit();
        break;
      }
      case 'COILED': {
        // Animación hacia la espiral
        const k = Math.min(1, this.stateTime / 0.45);
        const pts = this.chain.pts;
        for (let i = 0; i < pts.length; i++) {
          const th = i * 0.62 + this.heading;
          const r = 3 + i * 1.05;
          const tx = this.x + Math.cos(th) * r, ty = this.y + Math.sin(th) * r;
          pts[i].x = Phaser.Math.Linear(this.coilFrom[i].x, tx, k);
          pts[i].y = Phaser.Math.Linear(this.coilFrom[i].y, ty, k);
        }
        if (this.stateTime >= MILLIPEDE.coilDuration) {
          if (this.blocker) { ctx.removeBlocker(this.blocker); this.blocker = null; }
          this.coilCooldown = MILLIPEDE.coilCooldown;
          this.lightTimer = 0;
          this.setState('CHASE');
          this.repath = 0;
        }
        break;
      }
      case 'STUNNED': {
        if (this.stateTime > MILLIPEDE.stunAfterHit) { this.setState('CHASE'); this.repath = 0; }
        break;
      }
    }
    if (this.state !== 'COILED') this.chain.follow(this.x, this.y);

    // Audio y amenaza
    Audio.setMillipedeActivity(this.voice, this.moving);
    this.updateVoice(MILLIPEDE.audioRange, 0.9);
    const d = this.distToPlayer();
    this.threat = this.state === 'COILED' ? 0.1 : Math.max(0, 1 - d / 320) * 0.8;
  }

  private startCoil() {
    this.setState('COILED');
    this.lightTimer = 0;
    this.coilFrom = this.chain.pts.map((p) => ({ x: p.x, y: p.y }));
    this.path = [];
    this.blocker = this.ctx.addBlocker(this.x, this.y, MILLIPEDE.coilBlockRadius);
    Audio.coil(this.x - this.ctx.player.x, this.y - this.ctx.player.y);
  }

  private checkHit() {
    const p = this.ctx.player;
    if (p.hidden) return;
    if (this.distToPlayer() < this.radius + PLAYER.radius + 2) {
      this.ctx.hitPlayer('millipede');
      this.setState('STUNNED');
    }
  }

  private farTile() {
    const p = this.ctx.player;
    let best = this.ctx.map.randomWalkable();
    let bd = 0;
    for (let i = 0; i < 12; i++) {
      const t = this.ctx.map.randomWalkable();
      const c = this.ctx.map.center(t.x, t.y);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d > bd && d < 700) { bd = d; best = t; }
    }
    return this.ctx.map.center(best.x, best.y);
  }

  draw(time: number) {
    const g = this.gfx;
    g.clear();
    const pts = this.chain.pts;
    const n = pts.length;
    const t = time / 1000;
    const coiled = this.state === 'COILED';
    // Patas: cientos de patitas diminutas en onda (líneas: baratas)
    g.lineStyle(1, 0xa86a48, 1);
    for (let i = n - 1; i >= 1; i--) {
      const a = this.chain.angle(i);
      const px = -Math.sin(a), py = Math.cos(a);
      const r = this.segR(i);
      for (let k = 0; k < 2; k++) {
        const wave = coiled ? 0.1 : Math.sin(t * 14 - i * 0.9 + k * 1.6) * 0.6;
        const along = (k - 0.5) * 4;
        const bx = pts[i].x + Math.cos(a) * along, by = pts[i].y + Math.sin(a) * along;
        const lx = Math.cos(a + wave) * 2.5, ly = Math.sin(a + wave) * 2.5;
        g.lineBetween(bx + px * r, by + py * r, bx + px * (r + 3) - lx, by + py * (r + 3) - ly);
        g.lineBetween(bx - px * r, by - py * r, bx - px * (r + 3) - lx, by - py * (r + 3) - ly);
      }
    }
    // Segmentos: sprites (cola debajo, cabeza encima)
    for (let i = 0; i < n; i++) {
      const s = this.segR(i) / 6.5;
      this.parts[i].setPosition(pts[i].x, pts[i].y).setScale(s).setRotation(this.chain.angle(i));
    }
    const h = pts[0];
    const ha = coiled ? this.heading : this.chain.angle(0);
    this.parts[0].setRotation(ha);
    // Antenas
    g.lineStyle(1, 0xb07a58);
    const tw = Math.sin(t * 9) * 0.25;
    g.lineBetween(h.x, h.y, h.x + Math.cos(ha - 0.5 + tw) * 11, h.y + Math.sin(ha - 0.5 + tw) * 11);
    g.lineBetween(h.x, h.y, h.x + Math.cos(ha + 0.5 - tw) * 11, h.y + Math.sin(ha + 0.5 - tw) * 11);
    // Brillo húmedo mientras la luz lo está "cargando" (feedback de que funciona)
    if (this.lightTimer > 0.1 && !coiled) {
      const k = this.lightTimer / MILLIPEDE.lightTimeToCoil;
      this.parts[0].setTint(Phaser.Display.Color.GetColor(255, 200 + 55 * k, 160 + 60 * k));
      this.ring.setVisible(true).setPosition(h.x, h.y).setScale(0.9 + k * 0.5).setAlpha(0.6 * k);
    } else {
      this.parts[0].clearTint();
      this.ring.setVisible(false);
    }
  }

  private segR(i: number) {
    const n = this.chain.pts.length;
    return i < 2 ? 6.5 : 6.5 - Math.max(0, (i - n * 0.6) / (n * 0.4)) * 3.5;
  }

  destroy() {
    if (this.blocker) this.ctx.removeBlocker(this.blocker);
    this.parts.forEach((p) => p.destroy());
    this.ring.destroy();
    super.destroy();
  }
}
