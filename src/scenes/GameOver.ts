import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../data/tuning';
import type { Cause } from '../entities/Creature';
import { FONT } from '../systems/Hud';
import { ButtonList } from '../systems/Ui';

const CAUSE: Record<Cause, { msg: string; tip: string }> = {
  millipede: { msg: 'Te atrapó el milpiés', tip: 'Pista: mantén la luz sobre él 1,5 s y se enroscará. Úsalo para bloquear pasillos.' },
  spider: { msg: 'Te oyó la araña', tip: 'Pista: quieto o en sigilo (C) no te oye. Lanza botellas (Q) para alejarla.' },
  centipede: { msg: 'Te vio el ciempiés', tip: 'Pista: si oyes metal y la rejilla vibra, apaga la linterna. Esquiva su embestida.' },
};

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: { cause: Cause; time: number; night: number }) {
    const cx = VIEW_W / 2;
    const c = CAUSE[data.cause] ?? CAUSE.millipede;
    this.cameras.main.setBackgroundColor('#0a0303');
    this.add.text(cx, 120, 'HAS MUERTO', { fontFamily: FONT, fontSize: '72px', color: '#a83232' }).setOrigin(0.5);
    this.add.text(cx, 190, c.msg, { fontFamily: FONT, fontSize: '32px', color: '#d8c8b0' }).setOrigin(0.5);
    this.add.text(cx, 230, `Noche ${data.night} · Tiempo sobrevivido ${fmtTime(data.time)}`, { fontFamily: FONT, fontSize: '24px', color: '#8f7f76' }).setOrigin(0.5);
    this.add.text(cx, 275, c.tip, { fontFamily: FONT, fontSize: '20px', color: '#7f9389', align: 'center', wordWrap: { width: 760 } }).setOrigin(0.5);
    const list = new ButtonList(this);
    list.add(cx, 350, 'REINTENTAR', () => this.scene.start('Game', { night: data.night }));
    list.add(cx, 400, 'MENÚ PRINCIPAL', () => this.scene.start('Menu'));
    this.cameras.main.fadeIn(900, 0, 0, 0);
    void VIEW_H;
  }
}
