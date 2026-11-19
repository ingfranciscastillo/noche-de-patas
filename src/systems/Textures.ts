import Phaser from 'phaser';
import { PLAYER } from '../data/tuning';

/**
 * Texturas pequeñas generadas por código (Canvas 2D) una sola vez.
 * Usar Images (quads en lote) en vez de Graphics con círculos evita re-teselar cada frame.
 */
type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h)!;
  const c = t.context;
  c.imageSmoothingEnabled = false;
  draw(c, w, h);
  t.refresh();
}

function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  // círculo "pixel": sin antialiasing
  c.fillStyle = col;
  for (let yy = -Math.ceil(r); yy <= Math.ceil(r); yy++)
    for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++)
      if (xx * xx + yy * yy <= r * r) c.fillRect(Math.floor(x + xx), Math.floor(y + yy), 1, 1);
}

export function generateTextures(scene: Phaser.Scene) {
  make(scene, 'pbody', PLAYER.radius * 2, PLAYER.radius * 2, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });

  // Jugador visto desde arriba, mirando a +x (se rota con el ángulo de apuntado)
  make(scene, 'player', 32, 32, (c) => {
    disc(c, 17, 18, 9, 'rgba(0,0,0,0.45)');
    disc(c, 16, 16, 8, '#2f4147');
    disc(c, 15, 16, 6, '#3b525a');
    // brazo + linterna (lado derecho)
    c.fillStyle = '#2f4147'; c.fillRect(17, 19, 8, 3);
    c.fillStyle = '#7d7f80'; c.fillRect(24, 18, 4, 5);
    c.fillStyle = '#fff1c0'; c.fillRect(28, 19, 2, 3);
    disc(c, 15.5, 16, 5, '#2a211b');
    disc(c, 18, 16, 2.5, '#c2a58a');
  });

  // Milpiés: segmento (marrón rojizo, brillo húmedo) y cabeza
  for (const [key, body] of [['mseg_a', '#56200f'], ['mseg_b', '#4a1b0e']] as const) {
    make(scene, key, 16, 16, (c) => {
      disc(c, 8, 9, 7, '#2a0f09');
      disc(c, 8, 8, 6.5, body);
      disc(c, 7, 7, 3, '#7a3418');
      c.fillStyle = '#a0552e'; c.fillRect(6, 5, 2, 1);
    });
  }
  make(scene, 'mhead', 16, 16, (c) => {
    disc(c, 8, 8, 6.5, '#3a140a');
    disc(c, 9, 7, 2.5, '#5a2414');
    c.fillStyle = '#0a0302'; c.fillRect(11, 5, 1, 1); c.fillRect(11, 10, 1, 1);
  });

  // Ciempiés: placa aplanada (eje x = longitud) y cabeza
  for (const [key, body] of [['cseg_a', '#b8461c'], ['cseg_b', '#a13b16']] as const) {
    make(scene, key, 10, 12, (c) => {
      c.fillStyle = '#2a0d05'; c.fillRect(0, 1, 10, 11);
      c.fillStyle = body; c.fillRect(1, 1, 8, 10);
      c.fillStyle = '#d0682c'; c.fillRect(1, 2, 8, 1);
      c.fillStyle = '#3a120a'; c.fillRect(4, 5, 2, 2);
    });
  }
  make(scene, 'chead', 12, 12, (c) => {
    disc(c, 6, 6, 5, '#7a2a10');
    c.fillStyle = '#d0682c'; c.fillRect(6, 4, 3, 1);
  });

  // Araña camello: abdomen peludo y cefalotórax
  make(scene, 'sabd', 20, 20, (c) => {
    disc(c, 10, 10, 8, '#6e5a32');
    disc(c, 10, 10, 6.5, '#b39a5e');
    c.fillStyle = '#d8c58e';
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, r = 3 + (i % 4) * 1.5;
      c.fillRect(Math.round(10 + Math.cos(a) * r), Math.round(10 + Math.sin(a) * r), 1, 1);
    }
  });
  make(scene, 'sthx', 12, 12, (c) => {
    disc(c, 6, 6, 5.5, '#c4a66a');
    c.fillStyle = '#1a1208'; c.fillRect(8, 5, 1, 2);
  });

  // Objetos
  // Fusible de cartucho: casquillos metálicos estriados, tubo de cristal con reflejo y filamento ámbar
  make(scene, 'it_fuse', 28, 16, (c) => {
    const px = (x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    px(4, 13, 21, 2, 'rgba(0,0,0,0.45)'); // sombra
    // Tubo de cristal (x 8..19): interior oscuro azulado, bordes y reflejo
    px(8, 3, 12, 9, '#1c2a2e');
    px(8, 3, 12, 1, '#6f8e93'); // borde superior
    px(8, 11, 12, 1, '#2e4448'); // borde inferior
    px(9, 4, 10, 1, '#cfe9ea'); // reflejo principal
    px(10, 5, 4, 1, '#8fb3b6');
    px(16, 10, 3, 1, '#4f6e72'); // reflejo inferior tenue
    // Filamento en zigzag (ámbar, con núcleo brillante)
    const ys = [7, 7, 6, 6, 7, 8, 8, 7, 6, 6, 7, 7]; // hilo continuo en zigzag
    ys.forEach((y, i) => px(8 + i, y, 1, 1, i > 2 && i < 9 ? '#ffe7a8' : '#ffb347'));
    ys.forEach((y, i) => { if (i > 0 && Math.abs(y - ys[i - 1]) === 1) px(8 + i, ys[i - 1], 1, 1, '#c97a2a'); }); // antialias manual del diagonal
    // Esquinas del cristal redondeadas
    px(8, 3, 1, 1, '#0d1416'); px(19, 3, 1, 1, '#0d1416'); px(8, 11, 1, 1, '#0d1416'); px(19, 11, 1, 1, '#0d1416');
    // Casquillos (izquierda x 3..7, derecha x 20..24): latón con estrías
    for (const x0 of [3, 20]) {
      px(x0, 2, 5, 11, '#5d4a1e');
      px(x0, 3, 5, 9, '#b8913c');
      px(x0, 3, 5, 1, '#f0d27a'); // brillo superior
      px(x0, 11, 5, 1, '#7a6026');
      for (let i = 1; i < 5; i += 2) px(x0 + i, 4, 1, 7, '#8f6f2c'); // estrías
    }
    // Contactos / cuchillas en los extremos
    px(1, 6, 2, 3, '#aeb8bc'); px(1, 6, 2, 1, '#e6eef0');
    px(25, 6, 2, 3, '#aeb8bc'); px(25, 6, 2, 1, '#e6eef0');
    // Juntas oscuras entre casquillo y cristal
    px(8, 3, 1, 9, '#3a2e12'); px(19, 3, 1, 9, '#3a2e12');
  });
  // Versión pequeña para el HUD
  make(scene, 'hud_fuse', 20, 12, (c) => {
    const px = (x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    px(6, 2, 8, 8, '#1c2a2e');
    px(6, 3, 8, 1, '#cfe9ea');
    [6, 5, 5, 6, 7, 7, 6, 6].forEach((y, i) => px(6 + i, y, 1, 1, '#ffb347'));
    for (const x0 of [2, 14]) { px(x0, 1, 4, 10, '#5d4a1e'); px(x0, 2, 4, 8, '#b8913c'); px(x0, 2, 4, 1, '#f0d27a'); px(x0 + 1, 3, 1, 6, '#8f6f2c'); }
    px(0, 4, 2, 3, '#aeb8bc'); px(18, 4, 2, 3, '#aeb8bc');
  });
  make(scene, 'it_battery', 12, 18, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(2, 15, 9, 3);
    c.fillStyle = '#3d5a3a'; c.fillRect(3, 3, 6, 12);
    c.fillStyle = '#6f9a5c'; c.fillRect(4, 4, 2, 10);
    c.fillStyle = '#aeb8b8'; c.fillRect(5, 1, 2, 2);
  });
  make(scene, 'it_bottle', 12, 18, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(2, 15, 9, 3);
    c.fillStyle = '#2f4a33'; c.fillRect(3, 6, 6, 9); c.fillRect(5, 1, 2, 5);
    c.fillStyle = '#7fa880'; c.fillRect(4, 7, 1, 6);
  });

  // HUD
  const heart = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  for (const [key, col] of [['heart_on', '#a83232'], ['heart_off', '#2a2a2a']] as const) {
    make(scene, key, 22, 19, (c) => {
      heart.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(i * 3 + 1, j * 3 + 1, 3, 3); } }));
      heart.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { c.fillStyle = col; c.fillRect(i * 3, j * 3, 3, 3); } }));
    });
  }
}
