import Phaser from 'phaser';
import { LIGHT, PLAYER, STAMINA } from '../data/tuning';
import { Pt } from '../systems/MapBuilder';

export type MoveMode = 'idle' | 'sneak' | 'walk' | 'run';

export interface MoveIntent {
  mx: number;
  my: number;
  run: boolean;
  sneak: boolean;
}

export class Player {
  sprite: Phaser.Physics.Arcade.Image;
  private gfx: Phaser.GameObjects.Graphics;
  private staminaGfx: Phaser.GameObjects.Graphics;
  health = PLAYER.maxHealth;
  stamina = STAMINA.max;
  exhausted = false;
  battery = LIGHT.batteryStart;
  flashlightOn = true;
  private flashlightBeforeHide = true;
  fusesCarried = 0;
  bottles = 0;
  limp = 0;
  invuln = 0;
  lastRunAt = -999; // segundos de juego
  hidden: Pt | null = null; // casilla del escondite
  mode: MoveMode = 'idle';
  aim = 0;
  private staminaShow = 0;
  private lastStamina = STAMINA.max;
  private walkPhase = 0;
  private hitFlash = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Textura 'pbody' = cuadrado de 2*radio px generado en Boot; el cuerpo es un círculo exacto.
    this.sprite = scene.physics.add.image(x, y, 'pbody').setVisible(false);
    this.sprite.setCircle(PLAYER.radius);
    this.gfx = scene.add.graphics().setDepth(10);
    this.staminaGfx = scene.add.graphics().setDepth(101);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get body() { return this.sprite.body as Phaser.Physics.Arcade.Body; }

  update(dt: number, now: number, intent: MoveIntent) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.limp = Math.max(0, this.limp - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    if (this.hidden) {
      this.body.setVelocity(0, 0);
      this.mode = 'idle';
      this.regen(dt, true);
      return;
    }

    let mx = intent.mx, my = intent.my;
    const moving = mx !== 0 || my !== 0;
    if (moving) {
      const l = Math.hypot(mx, my);
      mx /= l;
      my /= l;
    }
    const canRun = !this.exhausted && this.stamina > 0;
    if (!moving) this.mode = 'idle';
    else if (intent.sneak) this.mode = 'sneak';
    else if (intent.run && canRun) this.mode = 'run';
    else this.mode = 'walk';

    let speed = this.mode === 'run' ? PLAYER.speedRun : this.mode === 'sneak' ? PLAYER.speedSneak : this.mode === 'walk' ? PLAYER.speedWalk : 0;
    if (this.limp > 0) speed *= PLAYER.limpMultiplier;
    this.body.setVelocity(mx * speed, my * speed);

    if (this.mode === 'run') {
      this.lastRunAt = now;
      this.stamina = Math.max(0, this.stamina - STAMINA.drainRun * dt);
      if (this.stamina <= 0) this.exhausted = true;
    } else this.regen(dt, this.mode === 'idle');

    if (moving) this.walkPhase += dt * (speed / 12);
  }

  private regen(dt: number, idle: boolean) {
    this.stamina = Math.min(STAMINA.max, this.stamina + (idle ? STAMINA.regenIdle : STAMINA.regenMove) * dt);
    if (this.exhausted && this.stamina >= STAMINA.recoverThreshold) this.exhausted = false;
  }

  hide(spot: Pt) {
    this.hidden = spot;
    this.flashlightBeforeHide = this.flashlightOn;
    this.flashlightOn = false;
    this.body.setVelocity(0, 0);
  }

  unhide() {
    this.hidden = null;
    this.flashlightOn = this.flashlightBeforeHide && this.battery > 0;
  }

  onHit() {
    this.hitFlash = 0.4;
  }

  draw(dt: number) {
    const g = this.gfx;
    g.clear();
    // Indicador de stamina: solo cuando cambia
    if (Math.abs(this.stamina - this.lastStamina) > 0.01) this.staminaShow = 1.2;
    this.lastStamina = this.stamina;
    this.staminaShow = Math.max(0, this.staminaShow - dt);
    const sg = this.staminaGfx;
    sg.clear();
    if (this.staminaShow > 0 && this.stamina < STAMINA.max - 0.5) {
      const a = Math.min(1, this.staminaShow * 2) * 0.75;
      const col = this.exhausted ? 0xb84a3a : 0x9fb6a8;
      sg.lineStyle(2, 0x000000, a * 0.6).beginPath().arc(this.x, this.y, 17, 0, Math.PI * 2).strokePath();
      sg.lineStyle(2, col, a).beginPath().arc(this.x, this.y, 17, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.stamina) / STAMINA.max).strokePath();
    }
    if (this.hidden) return;

    const x = Math.round(this.x), y = Math.round(this.y);
    const a = this.aim;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = -sa, py = ca; // perpendicular
    const bob = this.mode === 'idle' ? 0 : Math.sin(this.walkPhase) * 1.5;
    const blink = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0;
    if (blink) return;

    // Sombra
    g.fillStyle(0x000000, 0.4).fillEllipse(x + 1, y + 2, 20, 16);
    // Pies (alternan al caminar)
    g.fillStyle(0x1b1d1f);
    g.fillCircle(x + px * 4 + ca * bob, y + py * 4 + sa * bob, 3);
    g.fillCircle(x - px * 4 - ca * bob, y - py * 4 - sa * bob, 3);
    // Torso (chaqueta)
    const torso = this.hitFlash > 0 ? 0x7a3a34 : 0x2f4147;
    g.fillStyle(torso).fillCircle(x, y, 8);
    g.fillStyle(0x3b525a).fillCircle(x - ca * 1, y - sa * 1, 6);
    // Brazo con linterna
    const hx = x + ca * 9 + px * 4, hy = y + sa * 9 + py * 4;
    g.lineStyle(3, 0x2f4147).lineBetween(x + px * 5, y + py * 5, hx, hy);
    g.fillStyle(0x7d7f80).fillRect(hx - 2, hy - 2, 4, 4);
    if (this.flashlightOn) g.fillStyle(0xfff1c0).fillRect(hx + ca * 2 - 1, hy + sa * 2 - 1, 2, 2);
    // Cabeza
    g.fillStyle(0x2a211b).fillCircle(x - ca * 0.5, y - sa * 0.5, 5);
    g.fillStyle(0xc2a58a).fillCircle(x + ca * 1.5, y + sa * 1.5, 2.5);
  }

  destroy() {
    this.gfx.destroy();
    this.staminaGfx.destroy();
    this.sprite.destroy();
  }
}
