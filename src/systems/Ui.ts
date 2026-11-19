import Phaser from 'phaser';
import { Audio } from './AudioEngine';
import { FONT } from './Hud';

export interface MenuButton {
  text: Phaser.GameObjects.Text;
  enabled: boolean;
  action: () => void;
}

/**
 * Lista vertical de botones navegable con ratón y teclado (↑/↓/W/S + Enter/Espacio).
 * Siempre hay uno enfocado al abrir la pantalla.
 */
export class ButtonList {
  buttons: MenuButton[] = [];
  focus = 0;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-ENTER', () => this.activate());
    kb.on('keydown-SPACE', () => this.activate());
  }

  add(x: number, y: number, label: string, action: () => void, enabled = true, size = 32) {
    const t = this.scene.add
      .text(x, y, label, { fontFamily: FONT, fontSize: `${size}px`, color: enabled ? '#a9b4b0' : '#4a504e' })
      .setOrigin(0.5)
      .setDepth(10);
    const b: MenuButton = { text: t, enabled, action };
    const i = this.buttons.length;
    this.buttons.push(b);
    if (enabled) {
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { this.focus = i; this.refresh(); });
      t.on('pointerdown', () => { this.focus = i; this.activate(); });
    }
    if (this.buttons.length === 1 || (!this.buttons[this.focus].enabled && enabled)) this.focus = i;
    this.refresh();
    return b;
  }

  private move(d: number) {
    if (!this.buttons.length) return;
    let i = this.focus;
    for (let k = 0; k < this.buttons.length; k++) {
      i = (i + d + this.buttons.length) % this.buttons.length;
      if (this.buttons[i].enabled) break;
    }
    if (i !== this.focus) Audio.uiClick();
    this.focus = i;
    this.refresh();
  }

  private activate() {
    const b = this.buttons[this.focus];
    if (!b || !b.enabled) return;
    Audio.uiClick();
    b.action();
  }

  refresh() {
    this.buttons.forEach((b, i) => {
      const f = i === this.focus && b.enabled;
      const base = b.text.text.replace(/^[>\s]+|[<\s]+$/g, '');
      b.text.setText(f ? `> ${base} <` : base);
      b.text.setColor(!b.enabled ? '#4a504e' : f ? '#e6dcb8' : '#8f9a96');
    });
  }
}
