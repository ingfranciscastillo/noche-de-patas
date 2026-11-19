/**
 * AudioEngine — todo el audio se sintetiza con Web Audio API (cero archivos).
 * Buses: master(volumen usuario) ← { game(pausa) ← {ambience, sfx, creatures}, ui }.
 * El AudioContext solo se crea tras la primera interacción del usuario (política de autoplay).
 */

export interface Voice {
  input: GainNode; // conecta aquí la fuente
  gain: GainNode; // volumen espacial
  pan: StereoPannerNode;
  stopFns: (() => void)[];
}

type StepKind = 'sneak' | 'walk' | 'run';

class AudioEngineImpl {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private game!: GainNode;
  private ui!: GainNode;
  private ambience!: GainNode;
  private sfx!: GainNode;
  private creatures!: GainNode;
  private noiseBuf!: AudioBuffer;
  private volume = 0.8;
  private loops: Voice[] = [];
  private ambienceNodes: (() => void)[] = [];
  private dripTimer = 2;
  private creakTimer = 6;
  private beatTimer = 0;
  private alarmStop: (() => void) | null = null;
  private humStop: (() => void) | null = null;

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Llamar SOLO desde un gesto del usuario (click/tecla). */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      const c = this.ctx;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      comp.connect(c.destination);
      this.master = c.createGain();
      this.master.connect(comp);
      this.game = this.bus(this.master);
      this.ui = this.bus(this.master);
      this.ambience = this.bus(this.game, 0.9);
      this.sfx = this.bus(this.game);
      this.creatures = this.bus(this.game);
      this.setVolume(this.volume);
      // 2 s de ruido blanco reutilizable
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private bus(dest: AudioNode, v = 1) {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  /** 0..1 lineal → curva perceptual (aprox. dB) */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (!this.ctx) return;
    const g = this.volume <= 0.001 ? 0 : Math.pow(this.volume, 2);
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.03);
  }

  getVolume() {
    return this.volume;
  }

  setGamePaused(p: boolean) {
    if (!this.ctx) return;
    this.game.gain.setTargetAtTime(p ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  private get t() {
    return this.ctx!.currentTime;
  }

  private noise(loop = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    if (!loop) s.loopStart = 0;
    return s;
  }

  /** Fuente de ruido en un punto aleatorio del buffer (evita que se repita igual). */
  private noiseShot(dest: AudioNode, dur: number, when = this.t) {
    const s = this.noise();
    s.connect(dest);
    s.start(when, Math.random() * 1.5, dur + 0.05);
    s.onended = () => s.disconnect();
    return s;
  }

  private env(g: GainNode, peak: number, attack: number, decay: number, when = this.t) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number, when = this.t) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), when + attack + decay);
    this.env(g, peak, attack, decay, when);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + attack + decay + 0.05);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  private filtered(dest: AudioNode, type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number, when = this.t) {
    const c = this.ctx!;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, peak, attack, decay, when);
    f.connect(g).connect(dest);
    const s = this.noiseShot(f, attack + decay, when);
    s.addEventListener('ended', () => { f.disconnect(); g.disconnect(); });
  }

  /** Nodo espacial temporal para un one-shot posicionado. */
  private spatialShot(pan: number, vol: number, bus: GainNode = this.sfx, life = 2) {
    const c = this.ctx!;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const g = c.createGain();
    g.gain.value = vol;
    p.connect(g).connect(bus);
    setTimeout(() => { p.disconnect(); g.disconnect(); }, life * 1000);
    return p;
  }

  /** Volumen y paneo según posición relativa al oyente. */
  static spatial(dx: number, dy: number, range: number) {
    const d = Math.hypot(dx, dy);
    const v = Math.max(0, 1 - d / range);
    return { vol: v * v, pan: Math.max(-1, Math.min(1, dx / 260)) };
  }

  // ------------------------------------------------------------------ voces de criaturas

  createVoice(): Voice | null {
    if (!this.ctx) return null;
    const c = this.ctx;
    const input = c.createGain();
    const pan = c.createStereoPanner();
    const gain = c.createGain();
    gain.gain.value = 0;
    input.connect(pan).connect(gain).connect(this.creatures);
    const v: Voice = { input, gain, pan, stopFns: [] };
    this.loops.push(v);
    return v;
  }

  setVoiceSpatial(v: Voice | null, dx: number, dy: number, range: number, extra = 1) {
    if (!v || !this.ctx) return;
    const s = AudioEngineImpl.spatial(dx, dy, range);
    v.gain.gain.setTargetAtTime(s.vol * extra, this.t, 0.08);
    v.pan.pan.setTargetAtTime(s.pan, this.t, 0.08);
  }

  /** Roce húmedo continuo del milpiés. */
  millipedeLoop(v: Voice | null) {
    if (!v || !this.ctx) return;
    const c = this.ctx;
    const src = this.noise(true);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.7;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const am = c.createGain();
    am.gain.value = 0.35;
    const lfo = c.createOscillator();
    lfo.frequency.value = 7;
    const lfoG = c.createGain();
    lfoG.gain.value = 0.25;
    lfo.connect(lfoG).connect(am.gain);
    const lfo2 = c.createOscillator();
    lfo2.frequency.value = 0.37;
    const lfo2G = c.createGain();
    lfo2G.gain.value = 500;
    lfo2.connect(lfo2G).connect(bp.frequency);
    src.connect(bp).connect(lp).connect(am).connect(v.input);
    src.start();
    lfo.start();
    lfo2.start();
    v.stopFns.push(() => { src.stop(); lfo.stop(); lfo2.stop(); src.disconnect(); am.disconnect(); });
  }

  setMillipedeActivity(v: Voice | null, moving: boolean) {
    if (!v || !this.ctx) return;
    v.input.gain.setTargetAtTime(moving ? 1 : 0.25, this.t, 0.2);
  }

  /** Chasquido seco de patas de la araña (se llama a ritmo de pasos). */
  spiderClick(v: Voice | null, fast: boolean) {
    if (!v || !this.ctx) return;
    const n = fast ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const when = this.t + i * (fast ? 0.018 : 0.03) + Math.random() * 0.01;
      this.filtered(v.input, 'highpass', 3800 + Math.random() * 2500, 2, 0.5, 0.001, 0.025, when);
    }
  }

  /** Golpeteo metálico dentro de los conductos. */
  ventKnock(dx: number, dy: number, range: number, strong = false) {
    if (!this.ctx) return;
    const s = AudioEngineImpl.spatial(dx, dy, range);
    if (s.vol < 0.01) return;
    const out = this.spatialShot(s.pan, s.vol * (strong ? 1.2 : 0.7), this.creatures);
    const n = strong ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const when = this.t + i * (0.07 + Math.random() * 0.05);
      this.filtered(out, 'bandpass', 900 + Math.random() * 500, 18, 0.8, 0.002, 0.18, when);
      this.tone(out, 'square', 260 + Math.random() * 60, 180, 0.08, 0.002, 0.08, when);
    }
  }

  /** Siseo grave del ciempiés al salir. */
  hiss(dx: number, dy: number, range: number) {
    if (!this.ctx) return;
    const s = AudioEngineImpl.spatial(dx, dy, range);
    const out = this.spatialShot(s.pan, Math.max(0.25, s.vol) * 1.1, this.creatures, 3);
    this.filtered(out, 'bandpass', 2200, 1.2, 0.5, 0.15, 1.1);
    this.filtered(out, 'lowpass', 300, 1, 0.5, 0.05, 0.9);
    this.tone(out, 'sawtooth', 70, 45, 0.12, 0.1, 0.9);
  }

  /** Repiqueteo rápido del ciempiés fuera del conducto. */
  centipedeSkitter(v: Voice | null) {
    if (!v || !this.ctx) return;
    for (let i = 0; i < 4; i++) this.filtered(v.input, 'bandpass', 2600 + Math.random() * 1600, 6, 0.3, 0.001, 0.02, this.t + i * 0.012);
  }

  /** El milpiés se enrosca: crujido de caparazón. */
  coil(dx: number, dy: number) {
    if (!this.ctx) return;
    const s = AudioEngineImpl.spatial(dx, dy, 500);
    const out = this.spatialShot(s.pan, Math.max(0.3, s.vol), this.creatures);
    for (let i = 0; i < 7; i++) this.filtered(out, 'bandpass', 1200 + Math.random() * 1500, 4, 0.5, 0.002, 0.05, this.t + i * 0.045 + Math.random() * 0.02);
    this.tone(out, 'triangle', 140, 60, 0.15, 0.01, 0.4);
  }

  lockerRattle(dx: number, dy: number) {
    if (!this.ctx) return;
    const s = AudioEngineImpl.spatial(dx, dy, 400);
    const out = this.spatialShot(s.pan, Math.max(0.5, s.vol));
    for (let i = 0; i < 10; i++) {
      const when = this.t + i * 0.12 + Math.random() * 0.04;
      this.filtered(out, 'bandpass', 500 + Math.random() * 400, 8, 0.6, 0.002, 0.12, when);
    }
  }

  stopVoice(v: Voice | null) {
    if (!v) return;
    for (const f of v.stopFns) {
      try { f(); } catch { /* ya parado */ }
    }
    v.stopFns = [];
    try { v.input.disconnect(); v.pan.disconnect(); v.gain.disconnect(); } catch { /* ok */ }
    this.loops = this.loops.filter((l) => l !== v);
  }

  // ------------------------------------------------------------------ ambiente

  startAmbience() {
    if (!this.ctx || this.ambienceNodes.length) return;
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.16, this.t, 1.5);
    lp.connect(g).connect(this.ambience);
    const oscs = [41, 41.6, 61.8].map((f, i) => {
      const o = c.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      return o;
    });
    // aire / ventilación lejana
    const air = this.noise(true);
    const airF = c.createBiquadFilter();
    airF.type = 'bandpass';
    airF.frequency.value = 420;
    airF.Q.value = 0.5;
    const airG = c.createGain();
    airG.gain.value = 0.035;
    air.connect(airF).connect(airG).connect(this.ambience);
    air.start();
    // Respiración lenta del drone
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = c.createGain();
    lfoG.gain.value = 60;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    this.ambienceNodes.push(() => {
      oscs.forEach((o) => o.stop());
      air.stop();
      lfo.stop();
      g.disconnect();
      airG.disconnect();
    });
  }

  stopAmbience() {
    this.ambienceNodes.forEach((f) => { try { f(); } catch { /* ok */ } });
    this.ambienceNodes = [];
  }

  /** Llamar cada frame en juego: goteos, crujidos y latido. threat 0..1 */
  update(dt: number, threat: number) {
    if (!this.ctx) return;
    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 2 + Math.random() * 5;
      const out = this.spatialShot(Math.random() * 1.6 - 0.8, 0.25 + Math.random() * 0.2, this.ambience);
      const f = 900 + Math.random() * 900;
      this.tone(out, 'sine', f * 1.6, f * 0.5, 0.25, 0.002, 0.12);
    }
    this.creakTimer -= dt;
    if (this.creakTimer <= 0) {
      this.creakTimer = 7 + Math.random() * 10;
      const out = this.spatialShot(Math.random() * 2 - 1, 0.18, this.ambience, 4);
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const base = 90 + Math.random() * 60;
      o.frequency.setValueAtTime(base, this.t);
      o.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.6), this.t + 1.2);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, this.t);
      g.gain.exponentialRampToValueAtTime(0.4, this.t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, this.t + 1.3);
      // modulación tipo "metal que cede"
      const am = c.createOscillator();
      am.frequency.value = 18 + Math.random() * 14;
      const amG = c.createGain();
      amG.gain.value = 0.5;
      am.connect(amG).connect(g.gain);
      o.connect(bp).connect(g).connect(out);
      o.start();
      am.start();
      o.stop(this.t + 1.4);
      am.stop(this.t + 1.4);
    }
    // Latido según amenaza
    if (threat > 0.04) {
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        this.beatTimer = 1.25 - threat * 0.85;
        const v = 0.25 + threat * 0.6;
        this.tone(this.sfx, 'sine', 62, 38, v, 0.01, 0.16);
        this.tone(this.sfx, 'sine', 55, 34, v * 0.7, 0.01, 0.14, this.t + 0.17);
      }
    } else this.beatTimer = 0;
  }

  // ------------------------------------------------------------------ efectos del jugador

  step(kind: StepKind) {
    if (!this.ctx) return;
    const vol = kind === 'run' ? 0.55 : kind === 'walk' ? 0.28 : 0.07;
    const f = kind === 'run' ? 900 : kind === 'walk' ? 650 : 420;
    const out = this.spatialShot((Math.random() - 0.5) * 0.2, vol);
    this.filtered(out, 'lowpass', f + Math.random() * 200, 1.5, 0.9, 0.003, kind === 'run' ? 0.09 : 0.07);
    this.filtered(out, 'bandpass', 2400, 3, 0.15, 0.002, 0.03); // grit
  }

  pant() {
    if (!this.ctx) return;
    const out = this.spatialShot(0, 0.32);
    this.filtered(out, 'bandpass', 1100, 1.2, 0.6, 0.15, 0.35);
    this.filtered(out, 'bandpass', 800, 1.2, 0.5, 0.12, 0.3, this.t + 0.5);
  }

  flashlightClick(on: boolean) {
    if (!this.ctx) return;
    this.filtered(this.sfx, 'highpass', on ? 3000 : 2400, 2, 0.25, 0.001, 0.03);
  }

  /** Puerta que chirría; dx/dy relativos al jugador (0,0 = la abre el jugador). */
  door(dx = 0, dy = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const sp = AudioEngineImpl.spatial(dx, dy, 600);
    if (sp.vol < 0.01) return;
    const out = this.spatialShot(sp.pan, sp.vol, this.sfx, 2);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(340, this.t);
    o.frequency.linearRampToValueAtTime(220, this.t + 0.5);
    o.frequency.linearRampToValueAtTime(410, this.t + 0.75);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(0.22, this.t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + 0.85);
    o.connect(bp).connect(g).connect(out);
    o.start();
    o.stop(this.t + 0.9);
    this.filtered(out, 'lowpass', 260, 1, 0.6, 0.005, 0.25, this.t + 0.8);
  }

  battery() {
    if (!this.ctx) return;
    this.filtered(this.sfx, 'highpass', 2500, 1, 0.3, 0.001, 0.04);
    this.tone(this.sfx, 'square', 660, 660, 0.06, 0.005, 0.08, this.t + 0.06);
    this.tone(this.sfx, 'square', 990, 990, 0.06, 0.005, 0.12, this.t + 0.15);
  }

  fuse() {
    if (!this.ctx) return;
    this.filtered(this.sfx, 'bandpass', 3000, 2, 0.5, 0.002, 0.25);
    this.tone(this.sfx, 'sawtooth', 120, 2400, 0.12, 0.01, 0.3);
    this.tone(this.sfx, 'sine', 523, 523, 0.12, 0.01, 0.4, this.t + 0.3);
  }

  pickup() {
    if (!this.ctx) return;
    this.filtered(this.sfx, 'bandpass', 1800, 4, 0.4, 0.002, 0.08);
  }

  throwWhoosh() {
    if (!this.ctx) return;
    this.filtered(this.sfx, 'bandpass', 900, 1, 0.3, 0.08, 0.2);
  }

  shatter(dx: number, dy: number) {
    if (!this.ctx) return;
    const s = AudioEngineImpl.spatial(dx, dy, 700);
    const out = this.spatialShot(s.pan, Math.max(0.35, s.vol) * 1.2);
    this.filtered(out, 'highpass', 3500, 1, 0.8, 0.002, 0.35);
    for (let i = 0; i < 6; i++) this.tone(out, 'sine', 2500 + Math.random() * 3500, 2000 + Math.random() * 2000, 0.07, 0.002, 0.15 + Math.random() * 0.2, this.t + Math.random() * 0.12);
  }

  hit() {
    if (!this.ctx) return;
    this.tone(this.sfx, 'sine', 110, 40, 0.9, 0.005, 0.35);
    this.filtered(this.sfx, 'lowpass', 900, 1, 0.9, 0.003, 0.3);
    this.filtered(this.sfx, 'bandpass', 2600, 3, 0.4, 0.003, 0.15);
  }

  death() {
    if (!this.ctx) return;
    this.hit();
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, this.t);
    o.frequency.exponentialRampToValueAtTime(30, this.t + 2.5);
    const ws = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 4); }
    ws.curve = curve;
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, this.t);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + 2.8);
    o.connect(ws).connect(g).connect(this.ui);
    o.start();
    o.stop(this.t + 3);
  }

  /** Alarma del generador: sirena durante `dur` segundos. */
  alarm(dur: number) {
    if (!this.ctx) return;
    this.stopAlarm();
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'square';
    const lfo = c.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 0.9;
    const lfoG = c.createGain();
    lfoG.gain.value = 180;
    o.frequency.value = 620;
    lfo.connect(lfoG).connect(o.frequency);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(0.09, this.t + 0.2);
    g.gain.setValueAtTime(0.09, this.t + dur - 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    o.connect(lp).connect(g).connect(this.sfx);
    o.start();
    lfo.start();
    o.stop(this.t + dur + 0.1);
    lfo.stop(this.t + dur + 0.1);
    this.alarmStop = () => { try { o.stop(); lfo.stop(); g.disconnect(); } catch { /* ok */ } };
  }

  stopAlarm() {
    this.alarmStop?.();
    this.alarmStop = null;
  }

  generatorHum() {
    if (!this.ctx || this.humStop) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 50;
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 100.4;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(0.06, this.t + 1.5);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.ambience);
    o.start();
    o2.start();
    this.humStop = () => { try { o.stop(); o2.stop(); g.disconnect(); } catch { /* ok */ } };
  }

  uiClick() {
    if (!this.ctx) return;
    this.tone(this.ui, 'square', 440, 330, 0.05, 0.002, 0.06);
  }

  uiStinger() {
    if (!this.ctx) return;
    this.tone(this.ui, 'sawtooth', 55, 52, 0.2, 0.4, 2.5);
    this.tone(this.ui, 'sawtooth', 58.3, 55, 0.18, 0.4, 2.5);
    this.filtered(this.ui, 'bandpass', 600, 2, 0.15, 1, 1.6);
  }

  win() {
    if (!this.ctx) return;
    [392, 494, 587, 784].forEach((f, i) => this.tone(this.ui, 'triangle', f, f, 0.15, 0.02, 0.9, this.t + i * 0.18));
  }

  /** Detiene todo lo que pertenece a una partida (al salir / reiniciar). */
  stopGameSounds() {
    [...this.loops].forEach((l) => this.stopVoice(l));
    this.stopAmbience();
    this.stopAlarm();
    this.humStop?.();
    this.humStop = null;
    this.beatTimer = 0;
  }
}

export const Audio = new AudioEngineImpl();
export const spatialOf = (dx: number, dy: number, range: number) => {
  const d = Math.hypot(dx, dy);
  const v = Math.max(0, 1 - d / range);
  return { vol: v * v, pan: Math.max(-1, Math.min(1, dx / 260)) };
};
