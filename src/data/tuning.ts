// TODO el balance del juego vive aquí. Unidades: px, px/s, segundos, 0..100 para porcentajes.

export const TILE = 32;
export const VIEW_W = 960;
export const VIEW_H = 540;

export const PLAYER = {
  radius: 9,
  speedSneak: 55,
  speedWalk: 105,
  speedRun: 175,
  limpMultiplier: 0.55,
  limpDuration: 3,
  maxHealth: 2,
  invulnAfterHit: 2.5,
  interactRange: 30,
  stepIntervalWalk: 0.42,
  stepIntervalRun: 0.28,
  stepIntervalSneak: 0.62,
};

export const STAMINA = {
  max: 100,
  drainRun: 26, // por segundo corriendo
  regenIdle: 20, // quieto
  regenMove: 7, // caminando / sigilo
  recoverThreshold: 35, // tras agotarse, no se puede correr hasta este valor
  pantInterval: 0.9,
};

export const LIGHT = {
  ambientRadius: 40,
  coneAngleDeg: 55,
  coneRange: 260,
  rays: 64,
  wallBleed: 7, // px que la luz "muerde" el muro para que se vean las paredes
  batteryDrainPerSec: 1,
  batteryPickup: 35,
  batteryStart: 100,
  lowBatteryFlicker: 20,
  darkness: 0.975, // opacidad de la oscuridad (1 = negro total)
  lightScale: 0.5, // la capa de luz se calcula a media resolución (look pixel)
};

export const NOISE = {
  idle: 0,
  sneak: 40,
  walk: 120,
  run: 280,
  interact: 160, // abrir puertas, recoger objetos
  pant: 140,
  bottle: 300,
  emitInterval: 0.25, // cada cuánto se emite el ruido continuo del movimiento
  debugLifetime: 0.5,
};

export const ITEMS = {
  fusesNeeded: 3,
  batteriesPlaced: 5,
  bottlesPlaced: 3,
  throwRange: 230,
  throwSpeed: 420,
};

export const ALARM = {
  duration: 20,
};

export const MILLIPEDE = {
  speed: 45,
  wakeDelay: 20, // segundos dormido al empezar la noche (se oye su roce lejano)
  segments: 16,
  segmentSpacing: 9,
  radius: 10,
  repathInterval: 1.0,
  approxError: 56, // "sabe aproximadamente" dónde está el jugador
  exactWithin: 140,
  lightTimeToCoil: 1.5,
  coilDuration: 5,
  coilCooldown: 20,
  coilBlockRadius: 26,
  hideWaitPatience: 9, // espera frente al escondite y luego se aburre
  retreatDuration: 10,
  stunAfterHit: 4, // tras golpear se queda quieto: margen para huir cojeando
  audioRange: 420,
};

export const SPIDER = {
  radius: 9,
  patrolSpeed: 75,
  burstSpeed: 230,
  burstTime: 0.6,
  pauseTime: 0.4,
  zigzagAmplitude: 0.85, // proporción de velocidad lateral en zigzag
  listenTime: 2.2,
  fleeTime: 6,
  fleeSpeed: 200,
  biteRange: 16,
  hideRunWindow: 4, // si corriste hace < 4 s antes de esconderte, te detecta
  shakeTime: 1.4,
  audioRange: 300,
  patrolPauseMin: 0.6,
  patrolPauseMax: 2.4,
};

export const CENTIPEDE = {
  segments: 22,
  segmentSpacing: 7,
  radius: 9,
  lightDetectRadius: 350,
  telegraphTime: 1.2,
  crawlSpeed: 150,
  lungeRange: 150,
  lungeWindup: 0.3,
  lungeSpeed: 400,
  lungeTime: 0.42,
  missStun: 2,
  loseTime: 1.2, // tras apagar la linterna, tarda esto en rendirse
  retreatSpeed: 170,
  redetectCooldown: 4,
  cooldownAfterHit: 10,
  ventMoveInterval: 14,
  hitRange: 16,
  audioRange: 380,
};

export const NIGHTS = {
  1: { millipede: true, spider: false, centipede: false, alarmAttracts: false },
  2: { millipede: true, spider: true, centipede: false, alarmAttracts: false },
  3: { millipede: true, spider: true, centipede: true, alarmAttracts: true },
} as const;

export const FX = {
  hitShakeDuration: 380,
  hitShakeIntensity: 0.012,
  aberrationTime: 0.45,
  flickerChance: 0.004, // por frame, parpadeo ocasional de la linterna
  grainAlpha: 0.07,
};

export const AUDIO = {
  defaultVolume: 0.8,
  heartbeatRange: 380,
};
