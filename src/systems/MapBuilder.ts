import Phaser from 'phaser';
import { MAP_ROWS, ROOMS, RoomDef } from '../data/map';
import { TILE } from '../data/tuning';

export enum T {
  FLOOR,
  WALL,
  DOOR,
  LOCKER,
  TABLE,
  FURN,
  VENT,
  GEN,
  EXIT,
}

export interface Pt {
  x: number;
  y: number;
}

export interface Door {
  tx: number;
  ty: number;
  open: boolean;
  gfx: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Zone;
  vertical: boolean; // la puerta separa izquierda/derecha
}

export interface Vent {
  tx: number;
  ty: number;
  out: Pt; // casilla de suelo por la que sale el ciempiés (centro en px)
  gfx: Phaser.GameObjects.Graphics;
  shake: number;
}

/** Generador pseudoaleatorio determinista para el decorado. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GameMap {
  readonly w: number;
  readonly h: number;
  readonly pxW: number;
  readonly pxH: number;
  grid: T[] = [];
  candidates: Record<'f' | 'b' | 'o', Pt[]> = { f: [], b: [], o: [] };
  spawns: Record<'P' | 'M' | 'S', Pt> = { P: { x: 0, y: 0 }, M: { x: 0, y: 0 }, S: { x: 0, y: 0 } };
  doors: Door[] = [];
  vents: Vent[] = [];
  hideSpots: Pt[] = []; // casillas (tx,ty) de casilleros/mesas
  generator: Pt[] = [];
  exitTiles: Pt[] = [];
  walkableTiles: Pt[] = [];
  private doorAt = new Map<number, Door>();

  constructor(private scene: Phaser.Scene) {
    this.h = MAP_ROWS.length;
    this.w = MAP_ROWS[0].length;
    this.pxW = this.w * TILE;
    this.pxH = this.h * TILE;
    this.parse();
  }

  private parse() {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = MAP_ROWS[y][x];
        let t = T.FLOOR;
        switch (c) {
          case '#': t = T.WALL; break;
          case 'D': t = T.DOOR; break;
          case 'L': t = T.LOCKER; this.hideSpots.push({ x, y }); break;
          case 'T': t = T.TABLE; this.hideSpots.push({ x, y }); break;
          case 'k': t = T.FURN; break;
          case 'V': t = T.VENT; break;
          case 'G': t = T.GEN; this.generator.push({ x, y }); break;
          case 'X': t = T.EXIT; this.exitTiles.push({ x, y }); break;
          case 'f': case 'b': case 'o': this.candidates[c].push({ x, y }); break;
          case 'P': case 'M': case 'S': this.spawns[c] = { x, y }; break;
        }
        this.grid.push(t);
        if (t === T.FLOOR) this.walkableTiles.push({ x, y });
      }
    }
  }

  idx(tx: number, ty: number) { return ty * this.w + tx; }
  inBounds(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  at(tx: number, ty: number): T { return this.inBounds(tx, ty) ? this.grid[this.idx(tx, ty)] : T.WALL; }
  center(tx: number, ty: number): Pt { return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; }
  toTile(px: number, py: number): Pt { return { x: Math.floor(px / TILE), y: Math.floor(py / TILE) }; }

  door(tx: number, ty: number) { return this.doorAt.get(this.idx(tx, ty)); }

  /** ¿Bloquea al jugador / criaturas que caminan? */
  isSolid(tx: number, ty: number): boolean {
    const t = this.at(tx, ty);
    if (t === T.FLOOR) return false;
    if (t === T.DOOR) return !this.door(tx, ty)!.open;
    return true;
  }

  /** Para A*: las criaturas empujan las puertas cerradas. */
  isWalkable(tx: number, ty: number): boolean {
    const t = this.at(tx, ty);
    return t === T.FLOOR || t === T.DOOR;
  }

  blocksLight(tx: number, ty: number): boolean {
    const t = this.at(tx, ty);
    if (t === T.WALL || t === T.VENT || t === T.LOCKER || t === T.EXIT || t === T.GEN) return true;
    if (t === T.DOOR) return !this.door(tx, ty)!.open;
    return false;
  }

  roomAt(px: number, py: number): RoomDef | undefined {
    const { x, y } = this.toTile(px, py);
    return ROOMS.find((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
  }

  roomOfTile(tx: number, ty: number): RoomDef | undefined {
    return ROOMS.find((r) => tx >= r.x1 && tx <= r.x2 && ty >= r.y1 && ty <= r.y2);
  }

  /** DDA contra la rejilla. Devuelve distancia al primer muro que bloquea la luz (o maxDist). */
  castRay(ox: number, oy: number, angle: number, maxDist: number): number {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let tx = Math.floor(ox / TILE);
    let ty = Math.floor(oy / TILE);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (tx + 1) * TILE - ox : ox - tx * TILE) / Math.abs(dx)) : Infinity;
    let tMaxY = dy !== 0 ? ((dy > 0 ? (ty + 1) * TILE - oy : oy - ty * TILE) / Math.abs(dy)) : Infinity;
    let dist = 0;
    while (dist < maxDist) {
      if (tMaxX < tMaxY) {
        dist = tMaxX;
        tMaxX += tDeltaX;
        tx += stepX;
      } else {
        dist = tMaxY;
        tMaxY += tDeltaY;
        ty += stepY;
      }
      if (dist >= maxDist) return maxDist;
      if (this.blocksLight(tx, ty)) return dist;
    }
    return maxDist;
  }

  lineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d < 1) return true;
    return this.castRay(x1, y1, Math.atan2(y2 - y1, x2 - x1), d) >= d - 0.5;
  }

  /** Comprueba si un círculo de radio r en (x,y) choca con casillas que no puede pisar una criatura. */
  circleBlockedForCreature(x: number, y: number, r: number): boolean {
    const minX = Math.floor((x - r) / TILE), maxX = Math.floor((x + r) / TILE);
    const minY = Math.floor((y - r) / TILE), maxY = Math.floor((y + r) / TILE);
    for (let ty = minY; ty <= maxY; ty++)
      for (let tx = minX; tx <= maxX; tx++) {
        if (this.isWalkable(tx, ty)) continue;
        const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
        if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) return true;
      }
    return false;
  }

  randomWalkable(rng = Math.random): Pt {
    return this.walkableTiles[Math.floor(rng() * this.walkableTiles.length)];
  }

  // ---------------------------------------------------------------- construcción

  /** Cuerpos estáticos: tramos horizontales de casillas sólidas fusionados (las puertas aparte). */
  buildColliders(physics: Phaser.Physics.Arcade.ArcadePhysics): Phaser.GameObjects.Zone[] {
    const zones: Phaser.GameObjects.Zone[] = [];
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const t = this.at(x, y);
        if (t === T.FLOOR || t === T.DOOR) { x++; continue; }
        let x2 = x;
        while (x2 + 1 < this.w) {
          const n = this.at(x2 + 1, y);
          if (n === T.FLOOR || n === T.DOOR) break;
          x2++;
        }
        const len = x2 - x + 1;
        const z = this.scene.add.zone(x * TILE + (len * TILE) / 2, y * TILE + TILE / 2, len * TILE, TILE);
        physics.add.existing(z, true);
        zones.push(z);
        x = x2 + 1;
      }
    }
    return zones;
  }

  buildDoors(physics: Phaser.Physics.Arcade.ArcadePhysics) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.at(x, y) !== T.DOOR) continue;
        const c = this.center(x, y);
        const body = this.scene.add.zone(c.x, c.y, TILE, TILE);
        physics.add.existing(body, true);
        const vertical = this.at(x - 1, y) !== T.WALL && this.at(x + 1, y) !== T.WALL;
        const gfx = this.scene.add.graphics().setDepth(2);
        const door: Door = { tx: x, ty: y, open: false, gfx, body, vertical };
        this.doors.push(door);
        this.doorAt.set(this.idx(x, y), door);
        this.drawDoor(door);
      }
  }

  openDoor(door: Door) {
    if (door.open) return;
    door.open = true;
    (door.body.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.drawDoor(door);
  }

  drawDoor(d: Door) {
    const g = d.gfx;
    g.clear();
    const x = d.tx * TILE, y = d.ty * TILE;
    if (!d.open) {
      g.fillStyle(0x3b3a34).fillRect(x, y, TILE, TILE);
      g.fillStyle(0x4c4a40).fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      g.fillStyle(0x2a2925);
      if (d.vertical) { g.fillRect(x + 15, y + 2, 2, TILE - 4); g.fillStyle(0x8a826a).fillRect(x + 11, y + 14, 3, 4); }
      else { g.fillRect(x + 2, y + 15, TILE - 4, 2); g.fillStyle(0x8a826a).fillRect(x + 14, y + 11, 4, 3); }
      g.fillStyle(0x5b2c22).fillRect(x + 4, y + 4, 4, 2); // óxido
    } else {
      // Hoja abierta pegada al marco
      g.fillStyle(0x3b3a34);
      if (d.vertical) g.fillRect(x, y, TILE, 4);
      else g.fillRect(x, y, 4, TILE);
    }
  }

  buildVents() {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.at(x, y) !== T.VENT) continue;
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let out = this.center(x, y);
        for (const [dx, dy] of dirs) if (this.at(x + dx, y + dy) === T.FLOOR) { out = this.center(x + dx, y + dy); break; }
        const gfx = this.scene.add.graphics().setDepth(2);
        const v: Vent = { tx: x, ty: y, out, gfx, shake: 0 };
        this.vents.push(v);
        this.drawVent(v, 0);
      }
  }

  drawVent(v: Vent, time: number) {
    const g = v.gfx;
    g.clear();
    const ox = v.shake > 0 ? Math.sin(time * 0.09) * 1.6 * v.shake : 0;
    const oy = v.shake > 0 ? Math.cos(time * 0.11) * 1.2 * v.shake : 0;
    const x = v.tx * TILE + 4 + ox, y = v.ty * TILE + 4 + oy;
    g.fillStyle(0x0b0d0f).fillRect(x, y, TILE - 8, TILE - 8);
    g.fillStyle(0x6d7a80);
    for (let i = 0; i < 5; i++) g.fillRect(x, y + 1 + i * 5, TILE - 8, 2);
    g.fillStyle(0x9aa6aa).fillRect(x, y, 2, 2).fillRect(x + TILE - 10, y, 2, 2);
  }

  /** Dibuja el mapa estático completo en un canvas (pixel art procedural, sin assets). */
  buildTexture(key: string) {
    const canvas = document.createElement('canvas');
    canvas.width = this.pxW;
    canvas.height = this.pxH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const rnd = mulberry32(1337);
    const tint: Record<string, string> = {
      Cuarentena: '#17241b', 'Sala de máquinas': '#1d1f21', Enfermería: '#1a2423', Comedor: '#1d1f1c',
      Almacén: '#1c1d1a', Laboratorio: '#182222', Vestuario: '#1a1e24', Oficina: '#1d1d22', Archivo: '#1c1c1f',
      Recepción: '#1b1f25',
    };
    const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

    for (let ty = 0; ty < this.h; ty++)
      for (let tx = 0; tx < this.w; tx++) {
        const x = tx * TILE, y = ty * TILE;
        const t = this.at(tx, ty);
        const room = this.roomOfTile(tx, ty);
        const base = (room && tint[room.name]) || '#191d22';
        // Suelo bajo todo lo que no es muro
        if (t !== T.WALL && t !== T.VENT && t !== T.EXIT) {
          px(x, y, TILE, TILE, base);
          // baldosas de 16px
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(x, y, TILE, 1); ctx.fillRect(x, y, 1, TILE);
          ctx.fillRect(x + 16, y, 1, TILE); ctx.fillRect(x, y + 16, TILE, 1);
          for (let i = 0; i < 6; i++) px(x + Math.floor(rnd() * 31), y + Math.floor(rnd() * 31), 1, 1, rnd() < 0.5 ? '#232a30' : '#11151a');
          if (rnd() < 0.07) { // manchas
            ctx.fillStyle = room?.name === 'Cuarentena' ? 'rgba(80,110,50,0.25)' : 'rgba(40,30,20,0.35)';
            const r = 4 + Math.floor(rnd() * 8);
            ctx.fillRect(x + 8, y + 10, r, r - 2); ctx.fillRect(x + 6, y + 12, r + 4, r - 5);
          }
          if (rnd() < 0.05) { // grieta
            ctx.fillStyle = '#0c0f12';
            let cx = x + 4 + Math.floor(rnd() * 20), cy = y + 4 + Math.floor(rnd() * 20);
            for (let i = 0; i < 8; i++) { ctx.fillRect(cx, cy, 1, 1); cx += rnd() < 0.5 ? 1 : 0; cy += 1; }
          }
        }
        switch (t) {
          case T.WALL:
          case T.VENT:
          case T.EXIT: {
            px(x, y, TILE, TILE, '#2b333b');
            px(x, y, TILE, 3, '#3b4651');
            ctx.fillStyle = '#222930';
            for (let r = 0; r < 4; r++) {
              ctx.fillRect(x, y + 7 + r * 8, TILE, 1);
              const off = r % 2 ? 8 : 0;
              ctx.fillRect(x + off, y + r * 8, 1, 8); ctx.fillRect(x + off + 16, y + r * 8, 1, 8);
            }
            if (rnd() < 0.15) px(x + Math.floor(rnd() * 26), y + 10 + Math.floor(rnd() * 16), 4, 2, '#41503a'); // moho
            break;
          }
          case T.LOCKER: {
            px(x + 2, y + 1, TILE - 4, TILE - 2, '#2f3c45');
            px(x + 3, y + 2, TILE - 6, TILE - 4, '#3b4b55');
            ctx.fillStyle = '#1c252b';
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 7, y + 5 + i * 3, TILE - 14, 1);
            px(x + 15, y + 3, 1, TILE - 6, '#1c252b');
            px(x + 12, y + 20, 2, 4, '#8b979c'); px(x + 18, y + 20, 2, 4, '#8b979c');
            break;
          }
          case T.TABLE: {
            px(x + 1, y + 4, TILE - 2, TILE - 8, '#3d352c');
            px(x + 2, y + 5, TILE - 4, TILE - 10, '#4b4236');
            px(x + 3, y + 6, TILE - 6, 1, '#5a503f');
            px(x + 2, y + TILE - 5, 3, 3, '#241f1a'); px(x + TILE - 5, y + TILE - 5, 3, 3, '#241f1a');
            if (rnd() < 0.5) { px(x + 8, y + 9, 6, 4, '#6f7d73'); px(x + 18, y + 10, 3, 5, '#7c8a85'); } // papeles / matraces
            break;
          }
          case T.FURN: {
            px(x + 1, y + 1, TILE - 2, TILE - 2, '#272c26');
            px(x + 2, y + 2, TILE - 4, TILE - 4, '#333a31');
            ctx.fillStyle = '#1d211b';
            ctx.fillRect(x + 2, y + 11, TILE - 4, 1); ctx.fillRect(x + 2, y + 21, TILE - 4, 1);
            for (let i = 0; i < 3; i++) if (rnd() < 0.7) px(x + 4 + i * 9, y + 4 + Math.floor(rnd() * 3) * 10, 6, 5, rnd() < 0.5 ? '#4a4a3a' : '#3a4440');
            break;
          }
          case T.GEN: {
            px(x, y + 2, TILE, TILE - 4, '#1f2b25');
            px(x + 1, y + 3, TILE - 2, TILE - 6, '#2c3d33');
            ctx.fillStyle = '#16201b';
            for (let i = 0; i < 5; i++) ctx.fillRect(x + 4 + i * 5, y + 6, 2, 12);
            px(x + 6, y + 21, 20, 4, '#111');
            break;
          }
        }
      }
    // Señal de salida pintada en la pared
    for (const e of this.exitTiles) {
      const x = e.x * TILE, y = e.y * TILE;
      px(x + 1, y + 1, TILE - 2, TILE - 2, '#1b2a20');
      px(x + 3, y + 3, TILE - 6, TILE - 6, '#253a2b');
    }
    this.scene.textures.addCanvas(key, canvas);
  }
}
