import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../data/tuning';
import { SegmentChain } from '../entities/Creature';
import { Audio } from '../systems/AudioEngine';
import { FONT } from '../systems/Hud';
import { loadSave } from '../systems/Save';
import { ButtonList } from '../systems/Ui';

const CONTROLS = [
  ['Mover', 'WASD / flechas'],
  ['Linterna on/off', 'Click izquierdo o F'],
  ['Apuntar', 'Ratón'],
  ['Correr (ruido)', 'Shift'],
  ['Sigilo (casi silencioso)', 'C  (o Ctrl)'],
  ['Interactuar / esconderse', 'E'],
  ['Lanzar botella', 'Q'],
  ['Pausa', 'Esc'],
  ['Modo debug', 'F3'],
];

export class MenuScene extends Phaser.Scene {
  private chain!: SegmentChain;
  private bg!: Phaser.GameObjects.Graphics;
  private t = 0;
  private title!: Phaser.GameObjects.Text;
  private night = 1;
  private nightText!: Phaser.GameObjects.Text;
  private panel: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Menu');
  }

  init() {
    this.t = 0;
    this.panel = [];
  }

  create() {
    const save = loadSave();
    this.night = save.unlockedNight;
    this.bg = this.add.graphics();
    this.chain = new SegmentChain(26, 9, -100, VIEW_H * 0.75);
    const cx = VIEW_W / 2;
    this.title = this.add.text(cx, 110, 'NOCHE DE PATAS', { fontFamily: FONT, fontSize: '80px', color: '#c9b37a' }).setOrigin(0.5).setDepth(10);
    this.add.text(cx, 160, 'un laboratorio abandonado · tres fusibles · algo que se arrastra', { fontFamily: FONT, fontSize: '20px', color: '#6f8279' }).setOrigin(0.5).setDepth(10);

    this.nightText = this.add.text(cx, 330, '', { fontFamily: FONT, fontSize: '24px', color: '#a9b4b0' }).setOrigin(0.5).setDepth(10);
    const list = new ButtonList(this);
    list.add(cx, 270, 'JUGAR', () => this.play());
    list.add(cx, 330, 'NOCHE', () => this.cycleNight());
    list.add(cx, 390, 'CONTROLES', () => this.showControls());
    this.nightText.setVisible(false);
    const nightBtn = list.buttons[1];
    const refreshNight = () => {
      nightBtn.text.setText(`NOCHE ${this.night}`);
      list.refresh();
    };
    this.cycleNightLabel = refreshNight;
    refreshNight();
    this.input.keyboard!.on('keydown-LEFT', () => this.cycleNight(-1));
    this.input.keyboard!.on('keydown-RIGHT', () => this.cycleNight(1));

    const locks = save.unlockedNight > 1
      ? `← → o clic en NOCHE para cambiar · ${[1, 2, 3].map((n) => (n <= save.unlockedNight ? `Noche ${n}` : `Noche ${n} [bloqueada]`)).join('  ')}`
      : 'Noche 2 y Noche 3 bloqueadas';
    this.add.text(cx, 440, locks, { fontFamily: FONT, fontSize: '20px', color: '#5d6a64' }).setOrigin(0.5).setDepth(10);
    this.add.text(cx, VIEW_H - 22, 'Gana una noche para desbloquear la siguiente · ↑↓ Enter o ratón', { fontFamily: FONT, fontSize: '20px', color: '#4a5550' }).setOrigin(0.5).setDepth(10);
    this.cameras.main.fadeIn(800, 0, 0, 0);
  }

  private cycleNightLabel: () => void = () => {};

  private cycleNight(d = 1) {
    if (this.panel.length) return;
    const max = loadSave().unlockedNight;
    this.night = ((this.night - 1 + d + max) % max) + 1;
    this.cycleNightLabel();
  }

  private play() {
    if (this.panel.length) { this.closePanel(); return; }
    Audio.unlock();
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Game', { night: this.night }));
  }

  private showControls() {
    if (this.panel.length) { this.closePanel(); return; }
    const cx = VIEW_W / 2;
    const bg = this.add.rectangle(cx, VIEW_H / 2, 620, 420, 0x070909, 0.96).setStrokeStyle(1, 0x3a4440).setDepth(20);
    this.panel.push(bg);
    this.panel.push(this.add.text(cx, 90, 'CONTROLES', { fontFamily: FONT, fontSize: '32px', color: '#c9b37a' }).setOrigin(0.5).setDepth(21));
    CONTROLS.forEach(([a, k], i) => {
      this.panel.push(this.add.text(cx - 260, 130 + i * 26, a, { fontFamily: FONT, fontSize: '24px', color: '#a9b4b0' }).setDepth(21));
      this.panel.push(this.add.text(cx + 260, 130 + i * 26, k, { fontFamily: FONT, fontSize: '24px', color: '#e6dcb8' }).setOrigin(1, 0).setDepth(21));
    });
    this.panel.push(
      this.add
        .text(cx, 390, 'Milpiés: ilumínalo para que se enrosque.  Araña: no hagas ruido.\nCiempiés: si la rejilla vibra, apaga la linterna.\nAviso: Ctrl+W cierra la pestaña en algunos navegadores; usa C para el sigilo.', {
          fontFamily: FONT, fontSize: '20px', color: '#7f9389', align: 'center', lineSpacing: 4,
        })
        .setOrigin(0.5)
        .setDepth(21),
    );
    this.panel.push(this.add.text(cx, 450, '[ clic o Esc para cerrar ]', { fontFamily: FONT, fontSize: '20px', color: '#5d6a64' }).setOrigin(0.5).setDepth(21));
    bg.setInteractive().on('pointerdown', () => this.closePanel());
    this.input.keyboard!.once('keydown-ESC', () => this.closePanel());
  }

  private closePanel() {
    this.panel.forEach((o) => o.destroy());
    this.panel = [];
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.t += dt;
    // Un milpiés cruza el fondo, apenas visible
    const hx = ((this.t * 40) % (VIEW_W + 500)) - 150;
    const hy = VIEW_H * 0.78 + Math.sin(this.t * 0.8) * 40;
    this.chain.follow(hx, hy);
    const g = this.bg;
    g.clear();
    g.fillStyle(0x050707).fillRect(0, 0, VIEW_W, VIEW_H);
    for (let i = this.chain.pts.length - 1; i >= 0; i--) {
      const p = this.chain.pts[i];
      const a = this.chain.angle(i);
      const px = -Math.sin(a), py = Math.cos(a);
      const w = Math.sin(this.t * 12 - i) * 2;
      g.lineStyle(1, 0x2a1810).lineBetween(p.x + px * 6, p.y + py * 6, p.x + px * 10 + w, p.y + py * 10);
      g.lineBetween(p.x - px * 6, p.y - py * 6, p.x - px * 10 + w, p.y - py * 10);
      g.fillStyle(i % 2 ? 0x1e0d08 : 0x180a06).fillCircle(p.x, p.y, 6.5);
    }
    // Título con parpadeo ocasional
    this.title.setAlpha(Math.random() < 0.015 ? 0.25 : 1);
  }
}
