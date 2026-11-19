import Phaser from 'phaser';
import { VIEW_W } from '../data/tuning';
import { FONT } from '../systems/Hud';
import { loadSave, writeSave } from '../systems/Save';
import { ButtonList } from '../systems/Ui';
import { fmtTime } from './GameOver';

export class WinScene extends Phaser.Scene {
  constructor() {
    super('Win');
  }

  create(data: { time: number; night: number }) {
    const cx = VIEW_W / 2;
    const save = loadSave();
    const next = Math.min(3, data.night + 1);
    const newlyUnlocked = data.night < 3 && save.unlockedNight < next;
    const best = save.bestTimes[String(data.night)];
    const isBest = best === undefined || data.time < best;
    writeSave({
      unlockedNight: Math.max(save.unlockedNight, next),
      bestTimes: { ...save.bestTimes, [String(data.night)]: isBest ? data.time : best },
    });

    this.cameras.main.setBackgroundColor('#050a07');
    this.add.text(cx, 110, 'HAS ESCAPADO', { fontFamily: FONT, fontSize: '54px', color: '#8fbf7a', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, 180, `Noche ${data.night} superada en ${fmtTime(data.time)}${isBest ? '  (mejor tiempo)' : ''}`, { fontFamily: FONT, fontSize: '18px', color: '#c8d8c0' }).setOrigin(0.5);
    const msg = data.night >= 3
      ? 'Has sobrevivido a las tres noches.\nEl laboratorio queda en silencio... por ahora.'
      : newlyUnlocked ? `Noche ${next} desbloqueada.\nAlgo nuevo te espera ahí dentro.` : '';
    this.add.text(cx, 245, msg, { fontFamily: FONT, fontSize: '15px', color: '#7f9389', align: 'center', lineSpacing: 6 }).setOrigin(0.5);
    const list = new ButtonList(this);
    if (data.night < 3) list.add(cx, 330, `NOCHE ${next}`, () => this.scene.start('Game', { night: next }));
    list.add(cx, 380, 'REPETIR NOCHE', () => this.scene.start('Game', { night: data.night }));
    list.add(cx, 430, 'MENÚ PRINCIPAL', () => this.scene.start('Menu'));
    this.cameras.main.fadeIn(900, 0, 0, 0);
  }
}
