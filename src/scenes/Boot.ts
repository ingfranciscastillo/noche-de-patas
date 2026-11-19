import Phaser from 'phaser';
import { VIEW_W } from '../data/tuning';
import { generateTextures } from '../systems/Textures';
import { Audio } from '../systems/AudioEngine';
import { FONT } from '../systems/Hud';
import { loadSave } from '../systems/Save';

/** Genera texturas mínimas y muestra el aviso de contenido. El primer click desbloquea el audio. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateTextures(this);

    const cx = VIEW_W / 2;
    this.add.text(cx, 130, 'AVISO DE CONTENIDO', { fontFamily: FONT, fontSize: '26px', color: '#c9b37a', fontStyle: 'bold' }).setOrigin(0.5);
    this.add
      .text(cx, 230, 'Contiene insectos y criaturas inquietantes,\nsustos repentinos y luces parpadeantes.', {
        fontFamily: FONT, fontSize: '18px', color: '#b9c4c4', align: 'center', lineSpacing: 8,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 320, 'Se recomienda jugar con auriculares: el sonido es tu principal herramienta.', {
        fontFamily: FONT, fontSize: '14px', color: '#7f9389', align: 'center',
      })
      .setOrigin(0.5);
    const cont = this.add.text(cx, 420, '[ Haz clic o pulsa una tecla para continuar ]', { fontFamily: FONT, fontSize: '16px', color: '#e6dcb8' }).setOrigin(0.5);
    this.tweens.add({ targets: cont, alpha: 0.3, duration: 900, yoyo: true, repeat: -1 });

    const go = () => {
      // Primer gesto del usuario: aquí (y no antes) se crea el AudioContext
      Audio.unlock();
      Audio.setVolume(loadSave().volume);
      Audio.uiStinger();
      this.scene.start('Menu');
    };
    this.input.once('pointerdown', go);
    this.input.keyboard!.once('keydown', go);
  }
}
