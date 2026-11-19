import Phaser from 'phaser';
import { FX, LIGHT, VIEW_H, VIEW_W } from '../data/tuning';
import { GameMap, Pt } from './MapBuilder';

export interface Glow {
  x: number;
  y: number;
  r: number;
  a: number;
}

/**
 * Capa de oscuridad en espacio de pantalla, calculada en un canvas 2D a media resolución
 * (look pixel). La linterna es un polígono obtenido con raycast contra los muros.
 */
export class Lighting {
  private ctx: CanvasRenderingContext2D;
  private tex: Phaser.Textures.CanvasTexture;
  readonly image: Phaser.GameObjects.Image;
  private tintGfx: Phaser.GameObjects.Graphics;
  private grain: Phaser.GameObjects.TileSprite;
  private grainTimer = 0;
  private vignette: Phaser.GameObjects.Image;
  private sw: number;
  private sh: number;
  private s = LIGHT.lightScale;

  // Último cono calculado (para consultas de "¿está iluminado?")
  coneOn = false;
  conePoly: Pt[] = [];
  private origin: Pt = { x: 0, y: 0 };
  private angle = 0;
  private range: number = LIGHT.coneRange;
  private halfAngle = Phaser.Math.DegToRad(LIGHT.coneAngleDeg / 2);

  constructor(scene: Phaser.Scene, private map: GameMap) {
    this.sw = Math.round(VIEW_W * this.s);
    this.sh = Math.round(VIEW_H * this.s);
    if (scene.textures.exists('darkness')) scene.textures.remove('darkness');
    this.tex = scene.textures.createCanvas('darkness', this.sw, this.sh)!;
    this.ctx = this.tex.context;
    this.image = scene.add.image(0, 0, 'darkness').setOrigin(0).setScrollFactor(0).setScale(1 / this.s).setDepth(100);
    this.tintGfx = scene.add.graphics().setDepth(50).setBlendMode(Phaser.BlendModes.ADD);
    // Viñeta y grano: texturas estáticas dibujadas por WebGL (más barato que componerlas en el canvas cada frame)
    if (!scene.textures.exists('vignette')) {
      const vt = scene.textures.createCanvas('vignette', this.sw, this.sh)!;
      const vc = vt.context;
      const vg = vc.createRadialGradient(this.sw / 2, this.sh / 2, this.sh * 0.3, this.sw / 2, this.sh / 2, this.sw * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.9)');
      vc.fillStyle = vg;
      vc.fillRect(0, 0, this.sw, this.sh);
      vt.refresh();
      // Grano: un tile de ruido mayor que la pantalla; se desplaza al azar cada pocos frames
      const gw = 256, gh = 256;
      const gt = scene.textures.createCanvas('grain', gw, gh)!;
      const img = gt.context.createImageData(gw, gh);
      for (let p = 0; p < img.data.length; p += 4) {
        const v = Math.random() * 255;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 255;
      }
      gt.context.putImageData(img, 0, 0);
      gt.refresh();
    }
    this.vignette = scene.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setScale(1 / this.s).setDepth(101);
    this.grain = scene.add
      .tileSprite(0, 0, VIEW_W, VIEW_H, 'grain')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(102)
      .setAlpha(FX.grainAlpha)
      .setBlendMode(Phaser.BlendModes.MULTIPLY); // solo granula lo iluminado, no levanta los negros
  }

  private cast(ox: number, oy: number, a0: number, a1: number, rays: number, range: number): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i <= rays; i++) {
      const a = a0 + ((a1 - a0) * i) / rays;
      let d = this.map.castRay(ox, oy, a, range);
      if (d < range) d = Math.min(range, d + LIGHT.wallBleed);
      pts.push({ x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d });
    }
    return pts;
  }

  /**
   * @param intensity 0..1 (parpadeo / batería)
   */
  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera, px: number, py: number, aim: number, on: boolean, intensity: number, glows: Glow[], flash: { r: number; g: number; b: number; a: number } | null) {
    const c = this.ctx;
    const s = this.s;
    const camX = cam.scrollX, camY = cam.scrollY;
    const toS = (p: Pt) => ({ x: (p.x - camX) * s, y: (p.y - camY) * s });

    this.origin = { x: px, y: py };
    this.angle = aim;
    this.coneOn = on && intensity > 0.05;

    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.sw, this.sh);
    c.fillStyle = `rgba(0,0,0,${LIGHT.darkness})`;
    c.fillRect(0, 0, this.sw, this.sh);

    c.globalCompositeOperation = 'destination-out';
    const ps = toS(this.origin);

    // Círculo mínimo alrededor del jugador (también bloqueado por paredes)
    const amb = this.cast(px, py, 0, Math.PI * 2, 28, LIGHT.ambientRadius + 6);
    const ag = c.createRadialGradient(ps.x, ps.y, 0, ps.x, ps.y, LIGHT.ambientRadius * s);
    ag.addColorStop(0, 'rgba(0,0,0,0.92)');
    ag.addColorStop(0.6, 'rgba(0,0,0,0.6)');
    ag.addColorStop(1, 'rgba(0,0,0,0)');
    this.fillPoly(amb.map(toS), ag);

    this.tintGfx.clear();
    this.conePoly = [];
    if (this.coneOn) {
      const poly = this.cast(px, py, aim - this.halfAngle, aim + this.halfAngle, LIGHT.rays, this.range);
      this.conePoly = poly;
      const full = [this.origin, ...poly];
      const g = c.createRadialGradient(ps.x, ps.y, 4 * s, ps.x, ps.y, this.range * s);
      g.addColorStop(0, `rgba(0,0,0,${intensity})`);
      g.addColorStop(0.55, `rgba(0,0,0,${0.85 * intensity})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      this.fillPoly(full.map(toS), g);
      // Tinte cálido de la luz en el mundo
      this.tintGfx.fillStyle(0xffe2a8, 0.07 * intensity);
      this.tintGfx.fillPoints(full as unknown as Phaser.Math.Vector2[], true);
    }

    // Brillos tenues (objetos, señal de salida, generador)
    for (const gl of glows) {
      const p = toS(gl);
      const r = gl.r * s;
      if (p.x < -r || p.y < -r || p.x > this.sw + r || p.y > this.sh + r) continue;
      const gg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gg.addColorStop(0, `rgba(0,0,0,${gl.a})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gg;
      c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }

    c.globalCompositeOperation = 'source-over';
    if (flash && flash.a > 0) {
      c.fillStyle = `rgba(${flash.r},${flash.g},${flash.b},${flash.a})`;
      c.fillRect(0, 0, this.sw, this.sh);
    }

    // Grano: desplazar el tile cada 50 ms
    this.grainTimer -= dt;
    if (this.grainTimer <= 0) {
      this.grainTimer = 0.05;
      this.grain.tilePositionX = Math.floor(Math.random() * 256);
      this.grain.tilePositionY = Math.floor(Math.random() * 256);
    }

    this.tex.refresh();
  }

  private fillPoly(pts: Pt[], style: CanvasGradient | string) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    c.fillStyle = style;
    c.fill();
  }

  /** ¿El punto (mundo) está dentro del cono de la linterna y sin muros en medio? */
  isLit(x: number, y: number, margin = 0): boolean {
    if (!this.coneOn) return false;
    const dx = x - this.origin.x, dy = y - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > this.range + margin) return false;
    if (d > 12) {
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - this.angle));
      if (diff > this.halfAngle + Math.atan2(margin, Math.max(d, 1))) return false;
    }
    return this.map.lineOfSight(this.origin.x, this.origin.y, x, y);
  }

  destroy() {
    this.image.destroy();
    this.tintGfx.destroy();
    this.vignette.destroy();
    this.grain.destroy();
  }
}
