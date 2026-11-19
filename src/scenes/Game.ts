import Phaser from 'phaser';
import { ALARM, FX, ITEMS, LIGHT, NIGHTS, NOISE, PLAYER, STAMINA, TILE, VIEW_H, VIEW_W } from '../data/tuning';
import { CamelSpider } from '../entities/CamelSpider';
import { Centipede } from '../entities/Centipede';
import { Cause, Creature, GameCtx } from '../entities/Creature';
import { Millipede } from '../entities/Millipede';
import { MoveIntent, Player } from '../entities/Player';
import { Audio } from '../systems/AudioEngine';
import { Hud } from '../systems/Hud';
import { Glow, Lighting } from '../systems/Lighting';
import { GameMap, Pt, T } from '../systems/MapBuilder';
import { NoiseSystem } from '../systems/NoiseSystem';

type ItemKind = 'fuse' | 'battery' | 'bottle';
interface Item { kind: ItemKind; x: number; y: number; gfx: Phaser.GameObjects.Graphics; taken: boolean; }
interface Thrown { x: number; y: number; tx: number; ty: number; vx: number; vy: number; gfx: Phaser.GameObjects.Graphics; spin: number; }

type Interactable =
  | { type: 'item'; item: Item; x: number; y: number }
  | { type: 'door'; tx: number; ty: number; x: number; y: number }
  | { type: 'hide'; spot: Pt; x: number; y: number }
  | { type: 'generator'; x: number; y: number }
  | { type: 'exitLocked'; x: number; y: number };

const NIGHT_INTRO: Record<number, string> = {
  1: 'NOCHE 1\nAlgo se arrastra por el laboratorio.\nLa luz directa lo detiene.',
  2: 'NOCHE 2\nAlgo más escucha cada paso.\nCamina en silencio (C) o lanza botellas (Q).',
  3: 'NOCHE 3\nAlgo vive en los conductos y busca la luz.\nSi la rejilla vibra... apaga la linterna.',
};

export class GameScene extends Phaser.Scene implements GameCtx {
  night = 1;
  map!: GameMap;
  player!: Player;
  lighting!: Lighting;
  noise!: NoiseSystem;
  hud!: Hud;
  creatures: Creature[] = [];
  now = 0;
  alarmActive = false;
  generatorPos: Pt = { x: 0, y: 0 };

  private items: Item[] = [];
  private thrown: Thrown[] = [];
  private shards!: Phaser.GameObjects.Graphics;
  private fusesPlaced = 0;
  private powered = false;
  private alarmTimer = 0;
  private ended = false;
  private debug = false;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private propsGfx!: Phaser.GameObjects.Graphics;
  private blockers!: Phaser.Physics.Arcade.StaticGroup;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private noiseTimer = 0;
  private stepTimer = 0;
  private pantTimer = 0;
  private flickerTime = 0;
  private flash = { r: 140, g: 0, b: 0, a: 0 };
  private aberr: Phaser.GameObjects.Image[] = [];
  private aberrTime = 0;
  private interact: Interactable | null = null;
  private camX = 0;
  private camY = 0;

  constructor() {
    super('Game');
  }

  init(data: { night?: number }) {
    // Reiniciar TODO el estado de partida aquí (la instancia de escena se reutiliza).
    this.night = Phaser.Math.Clamp(data?.night ?? 1, 1, 3);
    this.creatures = [];
    this.items = [];
    this.thrown = [];
    this.now = 0;
    this.alarmActive = false;
    this.alarmTimer = 0;
    this.fusesPlaced = 0;
    this.powered = false;
    this.ended = false;
    this.debug = false;
    this.noiseTimer = 0;
    this.stepTimer = 0;
    this.pantTimer = 0;
    this.flickerTime = 0;
    this.flash = { r: 140, g: 0, b: 0, a: 0 };
    this.aberr = [];
    this.aberrTime = 0;
    this.interact = null;
  }

  create() {
    this.map = new GameMap(this);
    if (this.textures.exists('map')) this.textures.remove('map');
    this.map.buildTexture('map');
    this.add.image(0, 0, 'map').setOrigin(0).setDepth(0);
    for (const tint of [0xff2020, 0x20ffff]) {
      this.aberr.push(this.add.image(0, 0, 'map').setOrigin(0).setDepth(1).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
    }
    const walls = this.map.buildColliders(this.physics);
    this.map.buildDoors(this.physics);
    this.map.buildVents();
    this.propsGfx = this.add.graphics().setDepth(3);
    this.shards = this.add.graphics().setDepth(3);
    this.blockers = this.physics.add.staticGroup();
    const gens = this.map.generator.map((g) => this.map.center(g.x, g.y));
    this.generatorPos = { x: gens.reduce((s, g) => s + g.x, 0) / gens.length, y: gens[0].y + TILE };

    const sp = this.map.center(this.map.spawns.P.x, this.map.spawns.P.y);
    this.player = new Player(this, sp.x, sp.y);
    this.player.aim = -Math.PI / 2;
    this.physics.add.collider(this.player.sprite, walls);
    this.physics.add.collider(this.player.sprite, this.map.doors.map((d) => d.body));
    this.physics.add.collider(this.player.sprite, this.blockers);

    this.placeItems();
    this.noise = new NoiseSystem();
    this.lighting = new Lighting(this, this.map);
    this.hud = new Hud(this);
    this.debugGfx = this.add.graphics().setDepth(150);

    // Criaturas según la noche
    const cfg = NIGHTS[this.night as 1 | 2 | 3];
    if (cfg.millipede) {
      const m = this.map.center(this.map.spawns.M.x, this.map.spawns.M.y);
      this.creatures.push(new Millipede(this, this, m.x, m.y));
    }
    if (cfg.spider) {
      const s = this.map.center(this.map.spawns.S.x, this.map.spawns.S.y);
      this.creatures.push(new CamelSpider(this, this, s.x, s.y));
    }
    if (cfg.centipede) {
      // empieza en una rejilla lejos del jugador
      const far = [...this.map.vents].sort((a, b) => Math.hypot(b.out.x - sp.x, b.out.y - sp.y) - Math.hypot(a.out.x - sp.x, a.out.y - sp.y));
      this.creatures.push(new Centipede(this, this, far[Phaser.Math.Between(0, 2)]));
    }

    // Cámara (seguimiento manual para que luz y mundo vayan en el mismo frame)
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.pxW, this.map.pxH);
    cam.setRoundPixels(true);
    this.camX = Phaser.Math.Clamp(sp.x - VIEW_W / 2, 0, this.map.pxW - VIEW_W);
    this.camY = Phaser.Math.Clamp(sp.y - VIEW_H / 2, 0, this.map.pxH - VIEW_H);
    cam.setScroll(this.camX, this.camY);
    cam.fadeIn(1200, 0, 0, 0);

    // Entrada
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,CTRL,C,E,F,Q,ESC,F3') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.leftButtonDown()) this.toggleFlashlight(); });
    kb.on('keydown-ESC', () => this.pauseGame());
    kb.on('keydown-F3', () => { this.debug = !this.debug; if (!this.debug) { this.debugGfx.clear(); this.hud.setDebug(''); } });
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);

    Audio.unlock();
    Audio.stopGameSounds();
    Audio.startAmbience();
    Audio.setGamePaused(false);

    this.hud.toast(NIGHT_INTRO[this.night], 5);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  private onBlur() {
    if (!this.ended && this.scene.isActive()) this.pauseGame();
  }

  private cleanup() {
    this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    for (const c of this.creatures) c.destroy();
    this.creatures = [];
    this.noise.clear();
    Audio.stopGameSounds();
    this.tweens.killAll();
  }

  // ---------------------------------------------------------------- GameCtx

  hitPlayer(cause: Cause) {
    const p = this.player;
    if (this.ended || p.invuln > 0) return;
    if (p.hidden) p.unhide();
    p.health--;
    p.invuln = PLAYER.invulnAfterHit;
    p.limp = PLAYER.limpDuration;
    p.onHit();
    Audio.hit();
    this.cameras.main.shake(FX.hitShakeDuration, FX.hitShakeIntensity);
    this.flash = { r: 150, g: 0, b: 0, a: 0.55 };
    this.aberrTime = FX.aberrationTime;
    if (p.health <= 0) this.die(cause);
    else {
      this.hud.bloodSplat();
      this.hud.toast('Estás herido. Un golpe más y...', 2.5);
    }
  }

  creatureOpensDoor(tx: number, ty: number) {
    const d = this.map.door(tx, ty);
    if (!d || d.open) return;
    this.map.openDoor(d);
    Audio.door(d.tx * TILE + 16 - this.player.x, d.ty * TILE + 16 - this.player.y);
  }

  addBlocker(x: number, y: number, r: number) {
    const z = this.add.zone(x, y, r * 2, r * 2);
    this.physics.add.existing(z, true);
    (z.body as Phaser.Physics.Arcade.StaticBody).setCircle(r);
    this.blockers.add(z);
    return z;
  }

  removeBlocker(z: Phaser.GameObjects.Zone) {
    this.blockers.remove(z, true, true);
  }

  // ---------------------------------------------------------------- objetos

  private placeItems() {
    const m = this.map;
    const shuffle = <V>(a: V[]) => Phaser.Utils.Array.Shuffle([...a]);
    // Fusibles: 3 en salas distintas (posiciones semialeatorias)
    const byRoom = new Map<string, Pt[]>();
    for (const c of m.candidates.f) {
      const r = m.roomOfTile(c.x, c.y)?.name ?? '?';
      byRoom.set(r, [...(byRoom.get(r) ?? []), c]);
    }
    const rooms = shuffle([...byRoom.keys()]).slice(0, ITEMS.fusesNeeded);
    for (const r of rooms) this.addItem('fuse', Phaser.Utils.Array.GetRandom(byRoom.get(r)!));
    for (const c of shuffle(m.candidates.b).slice(0, ITEMS.batteriesPlaced)) this.addItem('battery', c);
    for (const c of shuffle(m.candidates.o).slice(0, ITEMS.bottlesPlaced)) this.addItem('bottle', c);
  }

  private addItem(kind: ItemKind, t: Pt) {
    const c = this.map.center(t.x, t.y);
    const g = this.add.graphics().setDepth(4);
    const x = c.x, y = c.y;
    g.fillStyle(0x000000, 0.4).fillEllipse(x + 1, y + 4, 14, 6);
    if (kind === 'fuse') {
      g.fillStyle(0x8a6d2a).fillRect(x - 6, y - 3, 12, 6);
      g.fillStyle(0xd9b555).fillRect(x - 5, y - 2, 10, 2);
      g.fillStyle(0xaeb8b8).fillRect(x - 8, y - 2, 2, 4).fillRect(x + 6, y - 2, 2, 4);
    } else if (kind === 'battery') {
      g.fillStyle(0x3d5a3a).fillRect(x - 3, y - 6, 6, 11);
      g.fillStyle(0x6f9a5c).fillRect(x - 2, y - 5, 2, 9);
      g.fillStyle(0xaeb8b8).fillRect(x - 1, y - 8, 2, 2);
    } else {
      g.fillStyle(0x2f4a33).fillRect(x - 3, y - 3, 6, 8);
      g.fillStyle(0x2f4a33).fillRect(x - 1, y - 7, 2, 4);
      g.fillStyle(0x7fa880, 0.8).fillRect(x - 2, y - 2, 1, 5);
    }
    this.items.push({ kind, x, y, gfx: g, taken: false });
  }

  // ---------------------------------------------------------------- bucle

  update(_time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);
    if (this.ended) { this.render(dt); return; }
    this.now += dt;
    const p = this.player;
    const k = this.keys;

    // --- Movimiento
    const intent: MoveIntent = {
      mx: (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0),
      my: (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0),
      run: k.SHIFT.isDown,
      sneak: k.CTRL.isDown || k.C.isDown,
    };
    p.update(dt, this.now, intent);
    const ptr = this.input.activePointer;
    if (!p.hidden) p.aim = Math.atan2(this.camY + ptr.y - p.y, this.camX + ptr.x - p.x);

    // --- Linterna
    if (Phaser.Input.Keyboard.JustDown(k.F)) this.toggleFlashlight();
    if (p.flashlightOn) {
      p.battery = Math.max(0, p.battery - LIGHT.batteryDrainPerSec * dt);
      if (p.battery <= 0) { p.flashlightOn = false; Audio.flashlightClick(false); this.hud.toast('La linterna se ha quedado sin batería', 3); }
    }

    // --- Interacción / lanzar
    this.findInteractable();
    if (Phaser.Input.Keyboard.JustDown(k.E)) this.doInteract();
    if (Phaser.Input.Keyboard.JustDown(k.Q)) this.throwBottle();

    // --- Ruido continuo y pasos
    this.emitMovementNoise(dt);

    // --- Generador / alarma
    if (this.alarmActive) {
      this.alarmTimer -= dt;
      if (this.alarmTimer <= 0) { this.alarmActive = false; this.hud.toast('La alarma se ha callado...', 2.5); }
    }

    // --- Criaturas
    this.noise.update(dt);
    for (const c of this.creatures) c.update(dt);
    this.updateThrown(dt);

    // --- Salida
    if (this.powered && !p.hidden) {
      for (const e of this.map.exitTiles) {
        const c = this.map.center(e.x, e.y);
        if (Math.hypot(c.x - p.x, c.y - p.y) < 34) { this.win(); break; }
      }
    }

    const threat = this.creatures.reduce((m, c) => Math.max(m, c.threat), 0);
    Audio.update(dt, threat);
    this.render(dt);
  }

  private render(dt: number) {
    const p = this.player;
    const cam = this.cameras.main;
    // Cámara: sigue con suavizado y un poco de anticipación hacia donde apuntas
    const look = p.hidden ? 0 : 40;
    const tx = Phaser.Math.Clamp(p.x + Math.cos(p.aim) * look - VIEW_W / 2, 0, this.map.pxW - VIEW_W);
    const ty = Phaser.Math.Clamp(p.y + Math.sin(p.aim) * look - VIEW_H / 2, 0, this.map.pxH - VIEW_H);
    const k = 1 - Math.exp(-dt * 7);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    cam.setScroll(Math.round(this.camX), Math.round(this.camY));

    p.draw(dt);
    for (const c of this.creatures) c.draw(this.time.now);
    for (const v of this.map.vents) if (v.shake > 0 || v.gfx.getData('s')) { this.map.drawVent(v, this.time.now); v.gfx.setData('s', v.shake > 0); }
    this.drawProps();

    // Parpadeo de la linterna
    let intensity = 1;
    if (p.battery < LIGHT.lowBatteryFlicker) intensity = 0.55 + (p.battery / LIGHT.lowBatteryFlicker) * 0.45;
    const chance = FX.flickerChance * (p.battery < LIGHT.lowBatteryFlicker ? 5 : 1);
    if (this.flickerTime <= 0 && Math.random() < chance) this.flickerTime = 0.12 + Math.random() * 0.4;
    if (this.flickerTime > 0) { this.flickerTime -= dt; intensity *= Math.random() < 0.5 ? 0.15 : 0.9; }

    // Efectos de pantalla
    this.flash.a = Math.max(0, this.flash.a - dt * 0.9);
    let overlay: { r: number; g: number; b: number; a: number } | null = this.flash.a > 0 ? this.flash : null;
    if (!overlay && p.hidden) overlay = { r: 0, g: 0, b: 0, a: 0.35 };
    if (!overlay && this.alarmActive) overlay = { r: 120, g: 10, b: 0, a: 0.08 + 0.08 * Math.sin(this.now * 7) };
    this.aberrTime = Math.max(0, this.aberrTime - dt);
    const ab = this.aberrTime / FX.aberrationTime;
    const off = 4 * ab;
    this.aberr[0].setAlpha(0.5 * ab).setPosition(-off, 0);
    this.aberr[1].setAlpha(0.5 * ab).setPosition(off, 0);

    this.lighting.update(dt, cam, p.x, p.y, p.aim, p.flashlightOn && !p.hidden, intensity, this.glows(), overlay);

    // HUD y ayudas
    this.hud.update(dt, p, this.fusesPlaced, this.objectiveText());
    const it = this.interact;
    if (p.hidden) this.hud.prompt('[E] Salir del escondite', p.x, p.y - 20);
    else if (it) this.hud.prompt(this.promptFor(it), it.x, it.y - 18);
    else this.hud.prompt(null);
    if (this.debug) this.drawDebug();
  }

  private glows(): Glow[] {
    const t = this.now;
    const out: Glow[] = [];
    for (const it of this.items) {
      if (it.taken) continue;
      if (it.kind === 'fuse') out.push({ x: it.x, y: it.y, r: 14, a: 0.25 + 0.2 * Math.max(0, Math.sin(t * 2 + it.x)) });
      else if (it.kind === 'battery') out.push({ x: it.x, y: it.y, r: 10, a: 0.12 + 0.1 * Math.max(0, Math.sin(t * 1.5 + it.y)) });
    }
    for (const e of this.map.exitTiles) {
      const c = this.map.center(e.x, e.y);
      out.push({ x: c.x, y: c.y - 8, r: 34, a: this.powered ? 0.55 : 0.3 });
    }
    out.push({ x: this.generatorPos.x, y: this.generatorPos.y - TILE, r: this.powered ? 60 : 22, a: this.powered ? 0.45 : 0.18 });
    return out;
  }

  private drawProps() {
    const g = this.propsGfx;
    g.clear();
    const t = this.now;
    // Señal de salida (roja = cerrada, verde = abierta)
    const on = this.powered ? 0x3fd06a : Math.floor(t * 1.2) % 2 ? 0xa02020 : 0x601010;
    for (const e of this.map.exitTiles) {
      const x = e.x * TILE, y = e.y * TILE;
      g.fillStyle(on).fillRect(x + 4, y + 4, TILE - 8, 6);
      g.fillStyle(0x101010).fillRect(x + 6, y + 6, TILE - 12, 2);
    }
    // Generador: luces de fusibles
    const gx = this.map.generator[0].x * TILE, gy = this.map.generator[0].y * TILE;
    for (let i = 0; i < ITEMS.fusesNeeded; i++) {
      const lit = i < this.fusesPlaced;
      g.fillStyle(lit ? (this.powered ? 0x4fe07a : 0xd9b555) : 0x301818).fillRect(gx + 10 + i * 16, gy + 6, 8, 5);
    }
    if (this.powered) {
      const blink = Math.floor(t * 4) % 2 === 0;
      g.fillStyle(blink && this.alarmActive ? 0xff3030 : 0x2a8a4a).fillRect(gx + 28, gy + 22, 8, 3);
    }
  }

  private objectiveText() {
    const p = this.player;
    if (this.powered) return this.alarmActive ? '¡ALARMA! Algo viene al generador. Escapa por Recepción.' : 'La salida de Recepción está abierta. ¡Escapa!';
    if (p.fusesCarried > 0) return `Coloca los fusibles en el generador (Sala de máquinas)`;
    return `Encuentra los fusibles (${this.fusesPlaced + p.fusesCarried}/${ITEMS.fusesNeeded})`;
  }

  // ---------------------------------------------------------------- acciones

  private toggleFlashlight() {
    const p = this.player;
    if (this.ended || p.hidden) return;
    if (p.battery <= 0) { this.hud.toast('Sin batería', 1.5); return; }
    p.flashlightOn = !p.flashlightOn;
    Audio.flashlightClick(p.flashlightOn);
  }

  private emitMovementNoise(dt: number) {
    const p = this.player;
    this.noiseTimer -= dt;
    if (this.noiseTimer <= 0) {
      this.noiseTimer = NOISE.emitInterval;
      const r = p.hidden ? 0 : NOISE[p.mode];
      if (r > 0) this.noise.emit(p.x, p.y, r, 'player');
    }
    if (p.mode !== 'idle') {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        const kind = p.mode === 'run' ? 'run' : p.mode === 'sneak' ? 'sneak' : 'walk';
        this.stepTimer = kind === 'run' ? PLAYER.stepIntervalRun : kind === 'sneak' ? PLAYER.stepIntervalSneak : PLAYER.stepIntervalWalk;
        if (p.limp > 0) this.stepTimer *= 1.4;
        Audio.step(kind);
      }
    } else this.stepTimer = 0.05;
    // Jadeo audible al agotarse
    if (p.exhausted) {
      this.pantTimer -= dt;
      if (this.pantTimer <= 0) {
        this.pantTimer = STAMINA.pantInterval;
        Audio.pant();
        this.noise.emit(p.x, p.y, NOISE.pant, 'pant');
      }
    } else this.pantTimer = 0;
  }

  private findInteractable() {
    const p = this.player;
    this.interact = null;
    if (p.hidden) return;
    let best: Interactable | null = null;
    let bd = Infinity;
    const consider = (i: Interactable, d: number, max: number) => { if (d < max && d < bd) { bd = d; best = i; } };
    for (const it of this.items) if (!it.taken) consider({ type: 'item', item: it, x: it.x, y: it.y }, Math.hypot(it.x - p.x, it.y - p.y), 26);
    const me = this.map.toTile(p.x, p.y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const tx = me.x + dx, ty = me.y + dy;
        const t = this.map.at(tx, ty);
        const c = this.map.center(tx, ty);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (t === T.DOOR && !this.map.door(tx, ty)!.open) consider({ type: 'door', tx, ty, x: c.x, y: c.y }, d, 38);
        if (t === T.LOCKER || t === T.TABLE) consider({ type: 'hide', spot: { x: tx, y: ty }, x: c.x, y: c.y }, d + 4, 38);
        if (t === T.EXIT && !this.powered) consider({ type: 'exitLocked', x: c.x, y: c.y }, d, 40);
      }
    const gd = Math.hypot(this.generatorPos.x - p.x, this.generatorPos.y - TILE - p.y);
    consider({ type: 'generator', x: this.generatorPos.x, y: this.generatorPos.y - TILE }, gd, 50);
    this.interact = best;
  }

  private promptFor(i: Interactable): string {
    switch (i.type) {
      case 'item': return i.item.kind === 'fuse' ? '[E] Coger fusible' : i.item.kind === 'battery' ? '[E] Coger pila' : '[E] Coger botella';
      case 'door': return '[E] Abrir puerta (ruido)';
      case 'hide': return this.map.at(i.spot.x, i.spot.y) === T.LOCKER ? '[E] Esconderse en el casillero' : '[E] Esconderse bajo la mesa';
      case 'generator':
        if (this.powered) return 'Generador en marcha';
        return this.player.fusesCarried > 0 ? `[E] Colocar fusibles (${this.fusesPlaced}/${ITEMS.fusesNeeded})` : `Generador: faltan ${ITEMS.fusesNeeded - this.fusesPlaced} fusibles`;
      case 'exitLocked': return 'Salida bloqueada: sin energía';
    }
  }

  private doInteract() {
    const p = this.player;
    if (p.hidden) {
      p.unhide();
      this.noise.emit(p.x, p.y, NOISE.sneak, 'player');
      return;
    }
    const i = this.interact;
    if (!i) return;
    switch (i.type) {
      case 'item': {
        const it = i.item;
        it.taken = true;
        it.gfx.destroy();
        this.noise.emit(p.x, p.y, NOISE.interact, 'pickup');
        if (it.kind === 'fuse') { p.fusesCarried++; Audio.fuse(); this.hud.toast(`Fusible encontrado (${this.fusesPlaced + p.fusesCarried}/${ITEMS.fusesNeeded})`, 2.5); }
        else if (it.kind === 'battery') { p.battery = Math.min(100, p.battery + LIGHT.batteryPickup); Audio.battery(); this.hud.toast('+35% batería', 1.8); }
        else { p.bottles++; Audio.pickup(); this.hud.toast('Botella: pulsa Q para lanzarla y hacer ruido lejos', 3); }
        break;
      }
      case 'door': {
        const d = this.map.door(i.tx, i.ty)!;
        this.map.openDoor(d);
        Audio.door();
        this.noise.emit(i.x, i.y, NOISE.interact, 'door');
        break;
      }
      case 'hide': {
        p.hide(i.spot);
        Audio.flashlightClick(false);
        // La araña huele el escondite si corriste hace poco
        if (this.now - p.lastRunAt < 4) {
          const c = this.map.center(i.spot.x, i.spot.y);
          for (const cr of this.creatures) if (cr instanceof CamelSpider && Math.hypot(cr.x - p.x, cr.y - p.y) < 520) cr.sniffHidden(i.spot, c);
        }
        break;
      }
      case 'generator': {
        if (this.powered || p.fusesCarried === 0) return;
        this.fusesPlaced += p.fusesCarried;
        p.fusesCarried = 0;
        Audio.fuse();
        this.noise.emit(this.generatorPos.x, this.generatorPos.y, NOISE.interact, 'pickup');
        if (this.fusesPlaced >= ITEMS.fusesNeeded) this.powerUp();
        else this.hud.toast(`Fusibles colocados: ${this.fusesPlaced}/${ITEMS.fusesNeeded}`, 2.5);
        break;
      }
      case 'exitLocked':
        this.hud.toast('La puerta no tiene corriente. Reactiva el generador.', 2.5);
        break;
    }
  }

  private powerUp() {
    this.powered = true;
    Audio.generatorHum();
    const cfg = NIGHTS[this.night as 1 | 2 | 3];
    if (cfg.alarmAttracts) {
      this.alarmActive = true;
      this.alarmTimer = ALARM.duration;
      Audio.alarm(ALARM.duration);
      this.noise.emit(this.generatorPos.x, this.generatorPos.y, 5000, 'alarm');
      this.cameras.main.shake(500, 0.004);
      this.hud.toast('¡ALARMA! Todo lo que hay aquí viene hacia el generador.\nCorre a la salida de Recepción.', 4);
    } else {
      this.hud.toast('El generador arranca. La salida de Recepción está abierta.', 4);
    }
  }

  private throwBottle() {
    const p = this.player;
    if (p.hidden || p.bottles <= 0) return;
    p.bottles--;
    const ptr = this.input.activePointer;
    const wx = this.camX + ptr.x, wy = this.camY + ptr.y;
    const a = Math.atan2(wy - p.y, wx - p.x);
    const want = Math.min(ITEMS.throwRange, Math.hypot(wx - p.x, wy - p.y));
    const free = this.map.castRay(p.x, p.y, a, want);
    const dist = Math.max(10, free - 10);
    const tx = p.x + Math.cos(a) * dist, ty = p.y + Math.sin(a) * dist;
    const g = this.add.graphics().setDepth(9);
    this.thrown.push({ x: p.x, y: p.y, tx, ty, vx: Math.cos(a) * ITEMS.throwSpeed, vy: Math.sin(a) * ITEMS.throwSpeed, gfx: g, spin: 0 });
    Audio.throwWhoosh();
  }

  private updateThrown(dt: number) {
    for (const b of this.thrown) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.spin += dt * 20;
      const remaining = (b.tx - b.x) * b.vx + (b.ty - b.y) * b.vy;
      b.gfx.clear().fillStyle(0x3f6a45).fillRect(b.x - 3 + Math.cos(b.spin) * 2, b.y - 3 + Math.sin(b.spin) * 2, 5, 5);
      if (remaining <= 0) {
        b.gfx.destroy();
        b.vx = 0;
        this.noise.emit(b.tx, b.ty, NOISE.bottle, 'bottle');
        Audio.shatter(b.tx - this.player.x, b.ty - this.player.y);
        for (let i = 0; i < 7; i++) this.shards.fillStyle(0x6f9a7a, 0.8).fillRect(b.tx + Phaser.Math.Between(-7, 7), b.ty + Phaser.Math.Between(-7, 7), 2, 1);
      }
    }
    this.thrown = this.thrown.filter((b) => b.vx !== 0);
  }

  // ---------------------------------------------------------------- fin

  private die(cause: Cause) {
    this.ended = true;
    Audio.death();
    this.player.body.setVelocity(0, 0);
    this.cameras.main.fadeOut(1400, 30, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameOver', { cause, time: this.now, night: this.night });
    });
  }

  private win() {
    this.ended = true;
    this.player.body.setVelocity(0, 0);
    Audio.win();
    this.cameras.main.fadeOut(1400, 200, 220, 210);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('Win', { time: this.now, night: this.night });
    });
  }

  private pauseGame() {
    if (this.ended || !this.scene.isActive()) return;
    Audio.setGamePaused(true);
    this.scene.launch('Pause', { night: this.night });
    this.scene.pause();
  }

  // ---------------------------------------------------------------- debug (F3)

  private drawDebug() {
    const g = this.debugGfx;
    g.clear();
    for (const r of this.noise.recent) {
      const a = r.life / NOISE.debugLifetime;
      const col = r.e.source === 'bottle' ? 0x66ccff : r.e.source === 'alarm' ? 0xff3333 : 0xffee55;
      g.lineStyle(1, col, a).strokeCircle(r.e.x, r.e.y, Math.min(r.e.radius, 2000));
    }
    if (this.lighting.conePoly.length) {
      g.lineStyle(1, 0xffffff, 0.3).beginPath().moveTo(this.player.x, this.player.y);
      for (const pt of this.lighting.conePoly) g.lineTo(pt.x, pt.y);
      g.closePath().strokePath();
    }
    for (const c of this.creatures) c.debugDraw(g);
    g.lineStyle(1, 0x00ff88, 0.6).strokeCircle(this.player.x, this.player.y, PLAYER.radius);
    for (const v of this.map.vents) g.lineStyle(1, 0x8888ff, 0.5).strokeRect(v.tx * TILE, v.ty * TILE, TILE, TILE);
    const lines = [
      `FPS ${this.game.loop.actualFps.toFixed(0)}  t=${this.now.toFixed(0)}s  noche ${this.night}`,
      `modo ${this.player.mode} stamina ${this.player.stamina.toFixed(0)} bat ${this.player.battery.toFixed(0)}%`,
      ...this.creatures.map((c) => `${c.kind}: ${c.state} amenaza ${c.threat.toFixed(2)}`),
    ];
    this.hud.setDebug(lines.join('\n'));
  }
}
