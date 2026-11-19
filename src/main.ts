import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './data/tuning';
import { BootScene } from './scenes/Boot';
import { GameScene } from './scenes/Game';
import { GameOverScene } from './scenes/GameOver';
import { MenuScene } from './scenes/Menu';
import { PauseScene } from './scenes/Pause';
import { WinScene } from './scenes/Win';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  audio: { noAudio: true }, // usamos nuestro AudioEngine; así no se crea ningún AudioContext antes del primer clic
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, GameScene, PauseScene, GameOverScene, WinScene],
});

// Acceso para depuración desde la consola
(window as unknown as { game: Phaser.Game }).game = game;
