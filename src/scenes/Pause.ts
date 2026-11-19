import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../data/tuning';
import { Audio } from '../systems/AudioEngine';
import { FONT } from '../systems/Hud';
import { writeSave } from '../systems/Save';
import { ButtonList } from '../systems/Ui';

/** Menú de pausa con slider de volumen maestro. */
export class PauseScene extends Phaser.Scene {
  private night = 1;

  constructor() {
    super('Pause');
  }

  init(data: { night: number }) {
    this.night = data.night ?? 1;
  }

  create() {
    const cx = VIEW_W / 2;
    this.add.rectangle(cx, VIEW_H / 2, VIEW_W, VIEW_H, 0x000000, 0.75);
    this.add.text(cx, 120, 'PAUSA', { fontFamily: FONT, fontSize: '56px', color: '#c9b37a' }).setOrigin(0.5);
    const list = new ButtonList(this);
    list.add(cx, 210, 'CONTINUAR', () => this.resume());
    list.add(cx, 260, 'REINICIAR NOCHE', () => this.leave('Game', { night: this.night }));
    list.add(cx, 310, 'MENÚ PRINCIPAL', () => this.leave('Menu', {}));

    // Slider de volumen
    const sx = cx - 150, sy = 400, sw = 300;
    this.add.text(cx, sy - 30, 'VOLUMEN', { fontFamily: FONT, fontSize: '20px', color: '#8f9a96' }).setOrigin(0.5);
    const track = this.add.rectangle(cx, sy, sw, 6, 0x2a3230).setInteractive({ useHandCursor: true });
    const fill = this.add.rectangle(sx, sy, 0, 6, 0xc9b37a).setOrigin(0, 0.5);
    const knob = this.add.rectangle(sx, sy, 12, 20, 0xe6dcb8).setInteractive({ useHandCursor: true, draggable: true });
    const label = this.add.text(cx + sw / 2 + 30, sy, '', { fontFamily: FONT, fontSize: '20px', color: '#a9b4b0' }).setOrigin(0.5);
    const set = (v: number) => {
      v = Phaser.Math.Clamp(v, 0, 1);
      Audio.setVolume(v);
      knob.x = sx + v * sw;
      fill.width = v * sw;
      label.setText(`${Math.round(v * 100)}%`);
    };
    set(Audio.getVolume());
    const fromX = (x: number) => set((x - sx) / sw);
    track.on('pointerdown', (p: Phaser.Input.Pointer) => fromX(p.x));
    knob.on('drag', (p: Phaser.Input.Pointer) => fromX(p.x));
    this.input.keyboard!.on('keydown-LEFT', () => set(Audio.getVolume() - 0.05));
    this.input.keyboard!.on('keydown-RIGHT', () => set(Audio.getVolume() + 0.05));
    this.add.text(cx, sy + 30, '← → para ajustar', { fontFamily: FONT, fontSize: '16px', color: '#4a5550' }).setOrigin(0.5);

    this.input.keyboard!.on('keydown-ESC', () => this.resume());
  }

  private saveVolume() {
    writeSave({ volume: Audio.getVolume() });
  }

  private resume() {
    this.saveVolume();
    Audio.setGamePaused(false);
    this.scene.resume('Game');
    this.scene.stop();
  }

  private leave(key: string, data: object) {
    this.saveVolume();
    this.scene.stop('Game');
    this.scene.start(key, data);
  }
}
