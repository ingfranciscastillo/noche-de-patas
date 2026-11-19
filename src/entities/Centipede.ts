import Phaser from 'phaser';
import { CENTIPEDE, PLAYER } from '../data/tuning';
import { Audio } from '../systems/AudioEngine';
import { Vent } from '../systems/MapBuilder';
import { Creature, GameCtx, SegmentChain } from './Creature';

/**
 * Ciempiés gigante — "El Acechador" (luz).
 * Vive en los conductos. Si ve la linterna encendida en su radio, la rejilla vibra 1.2 s y sale
 * a embestir. Apagar la linterna hace que te pierda. Tras fallar una embestida queda 2 s expuesto.
 */
export class Centipede extends Creature {
  readonly kind = 'centipede' as const;
  readonly radius = CENTIPEDE.radius;
  private chain: SegmentChain;
  vent: Vent;
  private cooldown = 3;
  private ventMove: number = CENTIPEDE.ventMoveInterval;
  private knockTimer = 3;
  private loseTimer = 0;
  private repath = 0;
  private sub: 'CRAWL' | 'WINDUP' | 'LUNGE' | 'STUN' = 'CRAWL';
  private subTime = 0;
  private lunge = { x: 0, y: 0 };
  private skitter = 0;
  private wave = 0;
  private parts: Phaser.GameObjects.Image[];
  private partsVisible = false;
  private gfxTop: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, ctx: GameCtx, vent: Vent) {
    super(scene, ctx, vent.out.x, vent.out.y);
    this.vent = vent;
    this.chain = new SegmentChain(CENTIPEDE.segments, CENTIPEDE.segmentSpacing, vent.out.x, vent.out.y);
    this.setState('DORMANT');
    this.gfx.setDepth(7);
    const imgs: Phaser.GameObjects.Image[] = [];
    for (let i = CENTIPEDE.segments - 1; i >= 0; i--) imgs[i] = scene.add.image(vent.out.x, vent.out.y, i === 0 ? 'chead' : i % 2 ? 'cseg_a' : 'cseg_b').setDepth(8).setVisible(false);
    this.parts = imgs;
    this.gfxTop = scene.add.graphics().setDepth(8.5);
  }

  get isOut() {
    return this.state === 'OUT' || this.state === 'RETREAT' || this.state === 'ALARM';
  }

  update(dt: number) {
    const ctx = this.ctx;
    const p = ctx.player;
    this.stateTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const lightOn = ctx.lighting.coneOn && !p.hidden;

    switch (this.state) {
      case 'DORMANT': {
        this.x = this.vent.out.x;
        this.y = this.vent.out.y;
        // Repiqueteo ocasional dentro de las paredes (pista de dónde está)
        this.knockTimer -= dt;
        if (this.knockTimer <= 0) {
          this.knockTimer = 3 + Math.random() * 4;
          Audio.ventKnock(this.x - p.x, this.y - p.y, CENTIPEDE.audioRange * 1.3);
        }
        this.ventMove -= dt;
        if (this.ventMove <= 0) { this.ventMove = CENTIPEDE.ventMoveInterval; this.pickVent(); }
        if (ctx.alarmActive) { this.goToAlarmVent(); this.startTelegraph(); break; }
        const vd = Math.hypot(p.x - this.vent.out.x, p.y - this.vent.out.y);
        if (this.cooldown <= 0 && lightOn && vd <= CENTIPEDE.lightDetectRadius && ctx.map.lineOfSight(this.vent.out.x, this.vent.out.y, p.x, p.y))
          this.startTelegraph();
        break;
      }
      case 'TELEGRAPH': {
        // Advertencia justa: la rejilla vibra y suena metal
        this.vent.shake = 1;
        this.knockTimer -= dt;
        if (this.knockTimer <= 0) { this.knockTimer = 0.3; Audio.ventKnock(this.x - p.x, this.y - p.y, CENTIPEDE.audioRange * 1.5, true); }
        if (!ctx.alarmActive && !lightOn) {
          // la luz se apagó a tiempo: no sale
          this.vent.shake = 0;
          this.cooldown = 1.5;
          this.setState('DORMANT');
          break;
        }
        if (this.stateTime >= CENTIPEDE.telegraphTime) {
          this.vent.shake = 0;
          this.chain.reset(this.vent.out.x, this.vent.out.y);
          Audio.hiss(this.x - p.x, this.y - p.y, CENTIPEDE.audioRange * 1.5);
          this.sub = 'CRAWL';
          this.subTime = 0;
          this.loseTimer = 0;
          this.setState(ctx.alarmActive ? 'ALARM' : 'OUT');
        }
        break;
      }
      case 'OUT': {
        if (!lightOn && this.sub !== 'LUNGE') {
          this.loseTimer += dt;
          if (this.loseTimer >= CENTIPEDE.loseTime) { this.retreat(CENTIPEDE.redetectCooldown); break; }
        } else this.loseTimer = 0;
        this.combat(dt, lightOn);
        break;
      }
      case 'ALARM': {
        if (!ctx.alarmActive) { this.retreat(CENTIPEDE.redetectCooldown); break; }
        const near = this.distToPlayer() < CENTIPEDE.lungeRange * 1.5 && lightOn;
        if (near || this.sub !== 'CRAWL') this.combat(dt, lightOn);
        else {
          this.repath -= dt;
          if (this.repath <= 0) { this.repath = 1; this.pathTo(ctx.generatorPos.x + Phaser.Math.Between(-60, 60), ctx.generatorPos.y + 50); }
          this.followPath(dt, CENTIPEDE.crawlSpeed * 0.8);
        }
        break;
      }
      case 'RETREAT': {
        if (this.followPath(dt, CENTIPEDE.retreatSpeed)) {
          this.setState('DORMANT');
        }
        break;
      }
    }

    if (this.isOut) {
      this.chain.follow(this.x, this.y);
      this.skitter -= dt;
      const moving = this.sub !== 'STUN' && this.sub !== 'WINDUP';
      if (moving && this.skitter <= 0) { this.skitter = this.sub === 'LUNGE' ? 0.03 : 0.06; Audio.centipedeSkitter(this.voice); }
      this.wave += dt * (this.sub === 'LUNGE' ? 30 : this.sub === 'STUN' ? 3 : 14);
    }
    this.updateVoice(CENTIPEDE.audioRange, 1);
    const d = this.distToPlayer();
    this.threat = this.isOut ? Math.max(0, 1 - d / 350) : this.state === 'TELEGRAPH' ? 0.7 : 0;
  }

  private combat(dt: number, lightOn: boolean) {
    const p = this.ctx.player;
    this.subTime += dt;
    const d = this.distToPlayer();
    switch (this.sub) {
      case 'CRAWL': {
        this.repath -= dt;
        if (this.repath <= 0) { this.repath = 0.4; this.pathTo(p.x, p.y); }
        this.followPath(dt, CENTIPEDE.crawlSpeed, Math.sin(this.stateTime * 8) * 0.25);
        if (lightOn && d < CENTIPEDE.lungeRange && this.ctx.map.lineOfSight(this.x, this.y, p.x, p.y)) {
          this.sub = 'WINDUP';
          this.subTime = 0;
        }
        this.checkHit();
        break;
      }
      case 'WINDUP': {
        this.turnTowards(Math.atan2(p.y - this.y, p.x - this.x), 0.3);
        if (this.subTime >= CENTIPEDE.lungeWindup) {
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          this.heading = a;
          this.lunge = { x: Math.cos(a), y: Math.sin(a) };
          this.sub = 'LUNGE';
          this.subTime = 0;
        }
        break;
      }
      case 'LUNGE': {
        const ok = this.moveFree(this.lunge.x * CENTIPEDE.lungeSpeed, this.lunge.y * CENTIPEDE.lungeSpeed, dt);
        if (this.checkHit()) return;
        if (this.subTime >= CENTIPEDE.lungeTime || !ok) {
          // Falló: queda expuesto y desorientado
          this.sub = 'STUN';
          this.subTime = 0;
        }
        break;
      }
      case 'STUN': {
        this.heading += Math.sin(this.subTime * 10) * 0.05;
        if (this.subTime >= CENTIPEDE.missStun) {
          this.sub = 'CRAWL';
          this.subTime = 0;
          this.repath = 0;
        }
        break;
      }
    }
  }

  private checkHit(): boolean {
    const p = this.ctx.player;
    if (p.hidden) return false;
    if (this.distToPlayer() < this.radius + PLAYER.radius + 2) {
      this.ctx.hitPlayer('centipede');
      this.retreat(CENTIPEDE.cooldownAfterHit);
      return true;
    }
    return false;
  }

  private retreat(cooldown: number) {
    this.cooldown = cooldown;
    this.sub = 'CRAWL';
    // al conducto más cercano
    let best = this.vent;
    let bd = Infinity;
    for (const v of this.ctx.map.vents) {
      const d = Math.hypot(v.out.x - this.x, v.out.y - this.y);
      if (d < bd) { bd = d; best = v; }
    }
    this.vent = best;
    this.pathTo(best.out.x, best.out.y);
    this.setState('RETREAT');
  }

  private startTelegraph() {
    this.setState('TELEGRAPH');
    this.knockTimer = 0;
  }

  private pickVent() {
    // Se desplaza por los conductos, con tendencia a acercarse al jugador
    const p = this.ctx.player;
    const sorted = [...this.ctx.map.vents].sort((a, b) => Math.hypot(a.out.x - p.x, a.out.y - p.y) - Math.hypot(b.out.x - p.x, b.out.y - p.y));
    const pool = sorted.slice(0, 5).filter((v) => v !== this.vent);
    this.vent = pool[Math.floor(Math.random() * pool.length)] ?? this.vent;
  }

  private goToAlarmVent() {
    const g = this.ctx.generatorPos;
    let best = this.vent, bd = Infinity;
    for (const v of this.ctx.map.vents) {
      const d = Math.hypot(v.out.x - g.x, v.out.y - g.y);
      if (d < bd) { bd = d; best = v; }
    }
    this.vent = best;
    this.x = best.out.x;
    this.y = best.out.y;
  }

  draw(time: number) {
    const g = this.gfx;
    g.clear();
    this.gfxTop.clear();
    const out = this.isOut;
    if (out !== this.partsVisible) {
      this.partsVisible = out;
      this.parts.forEach((p) => p.setVisible(out));
    }
    if (!out) return;
    const pts = this.chain.pts;
    const n = pts.length;
    const t = time / 1000;
    const stun = this.sub === 'STUN';
    // Patas amarillentas, una por lado y segmento, en onda fluida
    g.lineStyle(1, 0xe0c060, 1);
    for (let i = n - 1; i >= 1; i--) {
      const a = this.chain.angle(i);
      const sw = Math.sin(this.wave - i * 0.7) * 0.7;
      const len = 7;
      const l1 = a + Math.PI / 2 + sw, l2 = a - Math.PI / 2 - sw;
      g.lineBetween(pts[i].x, pts[i].y, pts[i].x + Math.cos(l1) * len, pts[i].y + Math.sin(l1) * len);
      g.lineBetween(pts[i].x, pts[i].y, pts[i].x + Math.cos(l2) * len, pts[i].y + Math.sin(l2) * len);
    }
    // Cuerpo aplanado naranja-rojizo (sprites)
    for (let i = 0; i < n; i++) {
      const sc = i === 0 ? 1 : 1 - (i / n) * 0.35;
      this.parts[i].setPosition(pts[i].x, pts[i].y).setRotation(this.chain.angle(i)).setScale(1, sc);
    }
    // Cabeza, antenas y forcípulas venenosas (encima)
    const gt = this.gfxTop;
    const h = pts[0];
    const a = this.state === 'OUT' || this.state === 'ALARM' ? this.heading : this.chain.angle(0);
    this.parts[0].setRotation(a);
    const tw = Math.sin(t * 11) * 0.3;
    gt.lineStyle(1, 0xd8a050);
    gt.lineBetween(h.x, h.y, h.x + Math.cos(a - 0.4 + tw) * 14, h.y + Math.sin(a - 0.4 + tw) * 14);
    gt.lineBetween(h.x, h.y, h.x + Math.cos(a + 0.4 - tw) * 14, h.y + Math.sin(a + 0.4 - tw) * 14);
    const open = this.sub === 'WINDUP' ? 0.9 : this.sub === 'LUNGE' ? 0.5 : 0.25;
    gt.lineStyle(2, 0x1a0804);
    gt.lineBetween(h.x + Math.cos(a) * 3, h.y + Math.sin(a) * 3, h.x + Math.cos(a - open) * 8, h.y + Math.sin(a - open) * 8);
    gt.lineBetween(h.x + Math.cos(a) * 3, h.y + Math.sin(a) * 3, h.x + Math.cos(a + open) * 8, h.y + Math.sin(a + open) * 8);
    if (stun) {
      // desorientado: pequeñas chispas sobre la cabeza
      gt.fillStyle(0xfff0b0, 0.8);
      for (let i = 0; i < 3; i++) {
        const sa = t * 6 + (i * Math.PI * 2) / 3;
        gt.fillRect(h.x + Math.cos(sa) * 9, h.y + Math.sin(sa) * 9, 2, 2);
      }
    }
  }

  destroy() {
    this.parts.forEach((p) => p.destroy());
    this.gfxTop.destroy();
    super.destroy();
  }
}
