import Phaser from 'phaser';
import { ITEMS, LIGHT, PLAYER, VIEW_H, VIEW_W } from '../data/tuning';
import type { Player } from '../entities/Player';

export const FONT = '"Courier New", Courier, monospace';

/** HUD mínimo: pila, corazones, fusibles, botellas, objetivo y avisos. */
export class Hud {
  private g: Phaser.GameObjects.Graphics;
  private fuseText: Phaser.GameObjects.Text;
  private bottleText: Phaser.GameObjects.Text;
  private objective: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text;
  private promptText: Phaser.GameObjects.Text;
  private debugText: Phaser.GameObjects.Text;
  private blood: Phaser.GameObjects.Graphics;
  private toastLife = 0;
  private lastObjective = '';
  private objectiveFlash = 0;

  constructor(private scene: Phaser.Scene) {
    const fix = <T extends Phaser.GameObjects.GameObject & { setScrollFactor(v: number): T; setDepth(v: number): T }>(o: T) => o.setScrollFactor(0).setDepth(200);
    this.blood = fix(scene.add.graphics());
    this.g = fix(scene.add.graphics());
    const style = { fontFamily: FONT, fontSize: '16px', color: '#b9c4c4', fontStyle: 'bold' };
    this.fuseText = fix(scene.add.text(VIEW_W - 20, 18, '', style).setOrigin(1, 0));
    this.bottleText = fix(scene.add.text(VIEW_W - 20, 42, '', { ...style, fontSize: '13px', color: '#8fa0a0' }).setOrigin(1, 0));
    this.objective = fix(scene.add.text(VIEW_W / 2, VIEW_H - 26, '', { ...style, fontSize: '14px', color: '#8fa39a' }).setOrigin(0.5, 1));
    this.toastText = fix(scene.add.text(VIEW_W / 2, 80, '', { ...style, fontSize: '18px', color: '#d8d0b0', align: 'center' }).setOrigin(0.5));
    this.promptText = scene.add.text(0, 0, '', { ...style, fontSize: '12px', color: '#e8e0c0', backgroundColor: '#000000aa', padding: { x: 4, y: 2 } }).setOrigin(0.5, 1).setDepth(150);
    this.debugText = fix(scene.add.text(12, VIEW_H - 12, '', { ...style, fontSize: '11px', color: '#7fff9f' }).setOrigin(0, 1));
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

    // --- Corazones
    for (let i = 0; i < PLAYER.maxHealth; i++) {
      const hx = 26 + i * 26, hy = 56;
      this.heart(g, hx, hy, i < p.health ? 0xa83232 : 0x2a2a2a);
    }

    // --- Fusibles
    this.fuseText.setText(`FUSIBLES ${fusesPlaced + p.fusesCarried}/${ITEMS.fusesNeeded}`);
    this.fuseIcon(g, VIEW_W - 20 - this.fuseText.width - 18, 20);
    this.bottleText.setText(p.bottles > 0 ? `BOTELLAS ${p.bottles}  [Q]` : '');

    // --- Objetivo
    if (objective !== this.lastObjective) { this.lastObjective = objective; this.objectiveFlash = 2; this.objective.setText(objective); }
    this.objectiveFlash = Math.max(0, this.objectiveFlash - dt);
    this.objective.setColor(this.objectiveFlash > 0 && Math.floor(this.objectiveFlash * 4) % 2 === 0 ? '#e0e8c8' : '#7f9389');

    // --- Aviso temporal
    if (this.toastLife > 0) {
      this.toastLife -= dt;
      this.toastText.setAlpha(Math.min(1, this.toastLife));
    } else this.toastText.setAlpha(0);
  }

  /** Salpicaduras en los bordes tras el primer golpe (sin gore: manchas oscuras). */
  bloodSplat() {
    const g = this.blood;
    g.clear();
    const spots: [number, number][] = [[0, 0], [VIEW_W, 0], [0, VIEW_H], [VIEW_W, VIEW_H]];
    for (const [cx, cy] of spots) {
      for (let i = 0; i < 14; i++) {
        const r = 6 + Math.random() * 30;
        const ox = cx === 0 ? Math.random() * 90 : -Math.random() * 90;
        const oy = cy === 0 ? Math.random() * 70 : -Math.random() * 70;
        g.fillStyle(0x4a0d0d, 0.25 + Math.random() * 0.3).fillCircle(cx + ox, cy + oy, r);
      }
    }
  }

  private heart(g: Phaser.GameObjects.Graphics, x: number, y: number, c: number) {
    const px = [
      '.##.##.',
      '#######',
      '#######',
      '.#####.',
      '..###..',
      '...#...',
    ];
    g.fillStyle(0x000000, 0.6);
    px.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') g.fillRect(x + i * 3 - 9, y + j * 3 - 7, 3, 3); }));
    g.fillStyle(c);
    px.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') g.fillRect(x + i * 3 - 10, y + j * 3 - 8, 3, 3); }));
  }

  private fuseIcon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0xc9a548).fillRect(x, y + 4, 12, 8);
    g.fillStyle(0x9aa8a8).fillRect(x - 3, y + 6, 3, 4).fillRect(x + 12, y + 6, 3, 4);
  }

  destroy() {
    [this.g, this.blood, this.fuseText, this.bottleText, this.objective, this.toastText, this.promptText, this.debugText].forEach((o) => o.destroy());
  }
}
