import Phaser from 'phaser';
import { ITEMS, LIGHT, PLAYER, VIEW_H, VIEW_W } from '../data/tuning';
import type { Player } from '../entities/Player';

// VT323 (OFL) empaquetada desde npm por Vite: sin peticiones externas en tiempo de ejecución.
export const FONT = '"VT323", "Courier New", monospace';

/** HUD mínimo: pila, corazones, fusibles, botellas, objetivo y avisos. */
export class Hud {
  private g: Phaser.GameObjects.Graphics;
  private fuseText: Phaser.GameObjects.Text;
  private bottleText: Phaser.GameObjects.Text;
  private objective: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text;
  private promptText: Phaser.GameObjects.Text;
  private debugText: Phaser.GameObjects.Text;
  private blood: Phaser.GameObjects.Image | null = null;
  private hearts: Phaser.GameObjects.Image[] = [];
  private lastHealth = -1;
  private lastColor = '';
  private toastLife = 0;
  private lastObjective = '';
  private objectiveFlash = 0;

  constructor(private scene: Phaser.Scene) {
    const fix = <T extends Phaser.GameObjects.GameObject & { setScrollFactor(v: number): T; setDepth(v: number): T }>(o: T) => o.setScrollFactor(0).setDepth(200);
    this.g = fix(scene.add.graphics());
    for (let i = 0; i < PLAYER.maxHealth; i++) this.hearts.push(fix(scene.add.image(16 + i * 26, 48, 'heart_on').setOrigin(0)));
    const style = { fontFamily: FONT, fontSize: '24px', color: '#b9c4c4' };
    this.fuseText = fix(scene.add.text(VIEW_W - 20, 18, '', style).setOrigin(1, 0));
    this.bottleText = fix(scene.add.text(VIEW_W - 20, 42, '', { ...style, fontSize: '20px', color: '#8fa0a0' }).setOrigin(1, 0));
    this.objective = fix(scene.add.text(VIEW_W / 2, VIEW_H - 26, '', { ...style, fontSize: '20px', color: '#8fa39a' }).setOrigin(0.5, 1));
    this.toastText = fix(scene.add.text(VIEW_W / 2, 80, '', { ...style, fontSize: '24px', color: '#d8d0b0', align: 'center' }).setOrigin(0.5));
    this.promptText = scene.add.text(0, 0, '', { ...style, fontSize: '20px', color: '#e8e0c0', backgroundColor: '#000000aa', padding: { x: 4, y: 2 } }).setOrigin(0.5, 1).setDepth(150);
    this.debugText = fix(scene.add.text(12, VIEW_H - 12, '', { ...style, fontSize: '16px', color: '#7fff9f' }).setOrigin(0, 1));
  }

  toast(msg: string, time = 3) {
    this.toastText.setText(msg).setAlpha(1);
    this.toastLife = time;
  }

  prompt(text: string | null, x = 0, y = 0) {
    if (!text) { this.promptText.setVisible(false); return; }
    this.promptText.setVisible(true).setText(text).setPosition(Math.round(x), Math.round(y));
  }

  setDebug(text: string) {
    this.debugText.setText(text);
  }

  update(dt: number, p: Player, fusesPlaced: number, objective: string) {
    const g = this.g;
    g.clear();
    // --- Pila (batería)
    const bx = 20, by = 18, bw = 54, bh = 20;
    g.fillStyle(0x000000, 0.5).fillRect(bx - 4, by - 4, bw + 14, bh + 8);
    g.lineStyle(2, 0x9aa8a8).strokeRect(bx, by, bw, bh);
    g.fillStyle(0x9aa8a8).fillRect(bx + bw, by + 6, 4, bh - 12);
    const pct = p.battery / 100;
    const col = p.battery <= LIGHT.lowBatteryFlicker ? 0xb84a3a : p.battery < 50 ? 0xc9a548 : 0x8fbf7a;
    const blinkLow = p.battery <= LIGHT.lowBatteryFlicker && Math.floor(this.scene.time.now / 400) % 2 === 0;
    if (!blinkLow) g.fillStyle(col).fillRect(bx + 3, by + 3, Math.max(0, (bw - 6) * pct), bh - 6);
    if (!p.flashlightOn) g.lineStyle(2, 0x000000, 0.8).lineBetween(bx + 2, by + bh - 2, bx + bw - 2, by + 2);

    // --- Corazones (solo cambian al recibir daño)
    if (p.health !== this.lastHealth) {
      this.lastHealth = p.health;
      this.hearts.forEach((h, i) => h.setTexture(i < p.health ? 'heart_on' : 'heart_off'));
    }

    // --- Fusibles
    this.fuseText.setText(`FUSIBLES ${fusesPlaced + p.fusesCarried}/${ITEMS.fusesNeeded}`);
    this.fuseIcon(g, VIEW_W - 20 - this.fuseText.width - 18, 20);
    this.bottleText.setText(p.bottles > 0 ? `BOTELLAS ${p.bottles}  [Q]` : '');

    // --- Objetivo
    if (objective !== this.lastObjective) { this.lastObjective = objective; this.objectiveFlash = 2; this.objective.setText(objective); }
    this.objectiveFlash = Math.max(0, this.objectiveFlash - dt);
    const objCol = this.objectiveFlash > 0 && Math.floor(this.objectiveFlash * 4) % 2 === 0 ? '#e0e8c8' : '#7f9389';
    if (objCol !== this.lastColor) { this.lastColor = objCol; this.objective.setColor(objCol); } // setColor re-renderiza el texto

    // --- Aviso temporal
    if (this.toastLife > 0) {
      this.toastLife -= dt;
      this.toastText.setAlpha(Math.min(1, this.toastLife));
    } else this.toastText.setAlpha(0);
  }

  /** Salpicaduras en los bordes tras el primer golpe (sin gore: manchas oscuras). Se hornea en una textura. */
  bloodSplat() {
    if (this.blood) return;
    const key = 'hud_blood';
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    const t = this.scene.textures.createCanvas(key, VIEW_W, VIEW_H)!;
    const c = t.context;
    const spots: [number, number][] = [[0, 0], [VIEW_W, 0], [0, VIEW_H], [VIEW_W, VIEW_H]];
    for (const [cx, cy] of spots) {
      for (let i = 0; i < 14; i++) {
        const r = 6 + Math.random() * 30;
        const ox = cx === 0 ? Math.random() * 90 : -Math.random() * 90;
        const oy = cy === 0 ? Math.random() * 70 : -Math.random() * 70;
        c.fillStyle = `rgba(74,13,13,${0.25 + Math.random() * 0.3})`;
        c.beginPath();
        c.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
        c.fill();
      }
    }
    t.refresh();
    this.blood = this.scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setDepth(199);
  }

  private fuseIcon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0xc9a548).fillRect(x, y + 4, 12, 8);
    g.fillStyle(0x9aa8a8).fillRect(x - 3, y + 6, 3, 4).fillRect(x + 12, y + 6, 3, 4);
  }

  destroy() {
    this.blood?.destroy();
    this.hearts.forEach((h) => h.destroy());
    [this.g, this.fuseText, this.bottleText, this.objective, this.toastText, this.promptText, this.debugText].forEach((o) => o.destroy());
  }
}
