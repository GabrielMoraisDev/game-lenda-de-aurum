/* core.js - primitivas do motor: matematica, input, audio, particulas */
(function (G) {
  'use strict';

  // sala em formato de tela larga (26x12 blocos = 416x192 px + HUD), perto do 16:9 dos monitores
  const TILE = 16, ROOM_W = 26, ROOM_H = 12;
  G.TILE = TILE;
  G.ROOM_W = ROOM_W;
  G.ROOM_H = ROOM_H;
  G.VIEW_W = ROOM_W * TILE;   // 256
  G.VIEW_H = ROOM_H * TILE;   // 176
  G.HUD_H = 32;

  /* ---------- matematica ---------- */
  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  G.overlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;

  G.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  G.mkCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return c;
  };

  G.scaleCanvas = function (src, f) {
    const c = G.mkCanvas(src.width * f, src.height * f);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  };

  /* ---------- fonte de pixel 5x7 (desenhada por codigo, sem arquivo) ---------- */
  // cada glifo: 7 linhas; '#' = pixel aceso. A largura e a da linha (fonte proporcional).
  const GLIFOS = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
    J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
    ' ': ['...', '...', '...', '...', '...', '...', '...'],
    '.': ['.', '.', '.', '.', '.', '.', '#'],
    ',': ['..', '..', '..', '..', '..', '.#', '#.'],
    ':': ['.', '#', '.', '.', '.', '#', '.'],
    ';': ['..', '.#', '..', '..', '..', '.#', '#.'],
    '!': ['#', '#', '#', '#', '#', '.', '#'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    '-': ['...', '...', '...', '###', '...', '...', '...'],
    '+': ['...', '...', '.#.', '###', '.#.', '...', '...'],
    '=': ['...', '...', '###', '...', '###', '...', '...'],
    '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
    '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
    ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
    '[': ['##', '#.', '#.', '#.', '#.', '#.', '##'],
    ']': ['##', '.#', '.#', '.#', '.#', '.#', '##'],
    "'": ['#', '#', '.', '.', '.', '.', '.'],
    '"': ['#.#', '#.#', '...', '...', '...', '...', '...'],
    '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
    '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
    '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
    '>': ['...', '#..', '.#.', '..#', '.#.', '#..', '...'],
    '<': ['...', '..#', '.#.', '#..', '.#.', '..#', '...'],
    '_': ['...', '...', '...', '...', '...', '...', '###'],
    '~': ['.....', '.....', '.#..#', '#.##.', '.....', '.....', '.....'],
    '≡': ['.....', '#####', '.....', '#####', '.....', '#####', '.....']
  };
  const FONTE_POS = {};                          // char -> [x no atlas, largura]
  let FONTE_W = 0;
  for (const ch in GLIFOS) { FONTE_POS[ch] = [FONTE_W, GLIFOS[ch][0].length]; FONTE_W += GLIFOS[ch][0].length + 1; }
  const atlasFonte = new Map();                  // cor -> canvas com todos os glifos nessa cor

  function atlasDe(cor) {
    let a = atlasFonte.get(cor);
    if (a) return a;
    a = G.mkCanvas(FONTE_W, 7);
    const x = a.getContext('2d');
    x.fillStyle = cor;
    for (const ch in GLIFOS) {
      const [ox] = FONTE_POS[ch], rows = GLIFOS[ch];
      for (let j = 0; j < 7; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] === '#') x.fillRect(ox + i, j, 1, 1);
    }
    atlasFonte.set(cor, a);
    return a;
  }
  const glifo = (ch) => FONTE_POS[ch] || FONTE_POS[ch.toUpperCase()] || FONTE_POS['?'];

  // largura em pixels de `s` na escala `e`
  G.larguraTexto = function (s, e) {
    let w = 0;
    for (const ch of s) w += glifo(ch)[1] + 1;
    return Math.max(0, w - 1) * (e || 1);
  };

  // escreve `s` com a base da letra em y (como o fillText), escala inteira e = 1, 2 ou 3
  G.textoPixel = function (c, s, x, y, cor, align, e) {
    e = e || 1;
    s = String(s);
    let px = x;
    if (align === 'center') px -= G.larguraTexto(s, e) / 2;
    else if (align === 'right') px -= G.larguraTexto(s, e);
    px = Math.round(px);
    const top = Math.round(y) - 7 * e, a = atlasDe(cor || '#fff');
    for (const ch of s) {
      const [ox, w] = glifo(ch);
      if (ch !== ' ') c.drawImage(a, ox, 0, w, 7, px, top, w * e, 7 * e);
      px += (w + 1) * e;
    }
  };

  /* ---------- armazenamento seguro (file:// pode bloquear) ---------- */
  G.store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } }
  };

  /* ---------- input ---------- */
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    KeyJ: 'attack', KeyZ: 'attack',
    Space: 'roll', KeyK: 'roll', ShiftLeft: 'roll', ShiftRight: 'roll',
    KeyX: 'special',
    KeyC: 'spin',
    KeyV: 'gold',
    KeyF: 'fire',
    Enter: 'start', NumpadEnter: 'start',
    Escape: 'pause', KeyP: 'pause',
    KeyM: 'mute', KeyN: 'multi', KeyT: 'teleporte', F3: 'debug'
  };
  const BLOCK_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F3']);

  class Input {
    constructor() {
      this.state = Object.create(null);
      this.pressed = Object.create(null);
      this.pad = Object.create(null);
      this.padPrev = Object.create(null);
      this.gp = -1;
      this.touch = false;

      addEventListener('keydown', (e) => {
        if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
        if (e.repeat) return;
        const a = KEYMAP[e.code];
        if (!a) return;
        if (!this.state[a]) this.pressed[a] = true;
        this.state[a] = true;
      });
      addEventListener('keyup', (e) => {
        const a = KEYMAP[e.code];
        if (a) this.state[a] = false;
      });
      addEventListener('blur', () => { this.state = Object.create(null); });
      addEventListener('gamepadconnected', (e) => { this.gp = e.gamepad.index; });
      addEventListener('gamepaddisconnected', () => { this.gp = -1; });
    }

    bindTouch(root) {
      if (!root || !root.querySelectorAll) return;
      const set = (act, v) => {
        if (v && !this.state[act]) this.pressed[act] = true;
        this.state[act] = v;
      };
      root.querySelectorAll('[data-act]').forEach((b) => {
        const act = b.dataset.act;
        const on = (e) => { e.preventDefault(); this.touch = true; b.classList.add('on'); set(act, true); };
        const off = (e) => { e.preventDefault(); b.classList.remove('on'); set(act, false); };
        b.addEventListener('pointerdown', on);
        b.addEventListener('pointerup', off);
        b.addEventListener('pointercancel', off);
        b.addEventListener('pointerleave', off);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
      });
    }

    poll() {
      if (this.gp < 0 || !navigator.getGamepads) return;
      const g = navigator.getGamepads()[this.gp];
      if (!g) return;
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0, dz = 0.35;
      const b = g.buttons;
      const bt = (i) => !!(b[i] && b[i].pressed);
      const now = {
        left: ax < -dz || bt(14),
        right: ax > dz || bt(15),
        up: ay < -dz || bt(12),
        down: ay > dz || bt(13),
        attack: bt(0) || bt(2),
        roll: bt(1) || bt(5),
        fire: bt(3) || bt(7),
        special: bt(6) || bt(4),
        spin: bt(5) || bt(11),
        gold: bt(10),
        start: bt(9),
        pause: bt(8)
      };
      for (const k in now) {
        const v = !!now[k];
        if (v && !this.padPrev[k]) this.pressed[k] = true;
        this.pad[k] = v;
        this.padPrev[k] = v;
      }
    }

    down(a) { return !!(this.state[a] || this.pad[a]); }
    hit(a) { return !!this.pressed[a]; }
    endFrame() { this.pressed = Object.create(null); }
  }
  G.Input = Input;

  /* ---------- audio sintetizado (sem arquivos externos) ---------- */
  const Sound = {
    ctx: null, master: null, sfx: null, musicBus: null, on: true, ready: false,

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.on = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.5;
      this.sfx.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.16;
      this.musicBus.connect(this.master);
      this.ready = true;
    },

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

    toggle() {
      this.on = !this.on;
      if (this.master) this.master.gain.value = this.on ? 0.6 : 0;
      return this.on;
    },

    tone(freq, dur, type, vol, slide, bus, at) {
      if (!this.ready || !this.on) return;
      const c = this.ctx, t0 = at || c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slide && slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(bus || this.sfx);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },

    noise(dur, vol, freq) {
      if (!this.ready || !this.on) return;
      const c = this.ctx, t0 = c.currentTime;
      const n = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = c.createBufferSource(); s.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = vol || 0.3;
      s.connect(f); f.connect(g); g.connect(this.sfx);
      s.start(t0);
    },

    play(name) {
      if (!this.ready || !this.on) return;
      const t = this.ctx.currentTime;
      switch (name) {
        case 'swing': this.noise(0.11, 0.18, 2400); this.tone(680, 0.07, 'triangle', 0.12, 0.5); break;
        case 'hit': this.tone(180, 0.09, 'square', 0.26, 0.4); this.noise(0.06, 0.18, 900); break;
        case 'hurt': this.tone(300, 0.22, 'sawtooth', 0.3, 0.3); break;
        case 'kill': this.noise(0.22, 0.3, 700); this.tone(140, 0.2, 'square', 0.22, 0.3); break;
        case 'coin': this.tone(1046, 0.06, 'square', 0.2); this.tone(1568, 0.11, 'square', 0.2, 1, null, t + 0.06); break;
        case 'heal': this.tone(523, 0.08, 'triangle', 0.25); this.tone(784, 0.14, 'triangle', 0.25, 1, null, t + 0.08); break;
        case 'key': [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, 'square', 0.22, 1, null, t + i * 0.07)); break;
        case 'door': this.tone(120, 0.3, 'sawtooth', 0.25, 1.6); break;
        case 'secret': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.24, 1, null, t + i * 0.1)); break;
        case 'boss': this.tone(90, 0.7, 'sawtooth', 0.32, 0.5); this.noise(0.6, 0.25, 300); break;
        case 'shoot': this.tone(520, 0.09, 'sawtooth', 0.16, 0.5); break;
        case 'bow': this.noise(0.12, 0.14, 900); this.tone(220, 0.18, 'triangle', 0.12, 1.6); break;
        case 'charged': this.tone(1320, 0.09, 'sine', 0.2); this.tone(1760, 0.12, 'sine', 0.16, 1, null, t + 0.07); break;
        case 'shootbig': this.noise(0.18, 0.32, 2600); this.tone(760, 0.16, 'sawtooth', 0.26, 0.35); break;
        case 'wave':
          this.noise(0.9, 0.4, 420);
          this.tone(140, 0.9, 'sine', 0.3, 5.5);
          [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.16, 1.6, null, t + i * 0.09));
          break;
        case 'spin':
          this.noise(0.3, 0.3, 1400);
          [520, 620, 740, 880].forEach((f, i) => this.tone(f, 0.1, 'sawtooth', 0.16, 0.5, null, t + i * 0.055));
          break;
        case 'gold':
          this.noise(0.2, 0.22, 3200);
          [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.2, 1, null, t + i * 0.05));
          break;
        case 'goldhit': this.tone(1320, 0.08, 'triangle', 0.18, 1.3); this.tone(1976, 0.06, 'sine', 0.12); break;
        case 'volley':
          this.noise(0.22, 0.34, 2200);
          [660, 560, 470].forEach((f, i) => this.tone(f, 0.14, 'sawtooth', 0.22, 0.4, null, t + i * 0.04));
          break;
        case 'cast': this.tone(660, 0.14, 'triangle', 0.2, 1.8); this.tone(990, 0.1, 'sine', 0.14, 1.5); break;
        case 'stairs': [392, 523, 659].forEach((f, i) => this.tone(f, 0.12, 'square', 0.2, 1, null, t + i * 0.07)); break;
        case 'menu': this.tone(660, 0.05, 'square', 0.18); break;
        case 'death': [440, 392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.28, 'sawtooth', 0.26, 1, null, t + i * 0.16)); break;
        case 'blocked': this.tone(150, 0.08, 'square', 0.18); break;
        case 'batida': this.tone(70, 0.18, 'sine', 0.5, 0.6); this.tone(62, 0.22, 'sine', 0.42, 0.6, null, t + 0.24); break;
        case 'racha': this.noise(0.9, 0.4, 700); this.tone(180, 1.1, 'sawtooth', 0.26, 0.2); break;
        case 'fire':
          this.noise(0.35, 0.3, 500);
          this.tone(220, 0.35, 'sawtooth', 0.3, 3.2);
          this.tone(880, 0.25, 'triangle', 0.18, 0.3);
          break;
        case 'nova':
          this.noise(0.8, 0.45, 260);
          this.tone(110, 0.8, 'sawtooth', 0.34, 0.25);
          [523, 392, 330].forEach((f, i) => this.tone(f, 0.4, 'square', 0.16, 0.5, null, t + i * 0.06));
          break;
      }
    }
  };
  G.Sound = Sound;

  /* ---------- musica: sequenciador com lookahead ---------- */
  const nf = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const R = -1;
  const Music = {
    name: null, step: 0, next: 0,
    tracks: {
      field: {
        spb: 0.16,
        lead: [76, R, 79, R, 81, R, 79, 76, 72, R, 74, R, 76, R, R, R,
               74, R, 72, R, 71, R, 72, 74, 76, R, R, R, R, R, R, R],
        bass: [40, R, R, R, 47, R, R, R, 45, R, R, R, 43, R, R, R,
               40, R, R, R, 47, R, R, R, 45, R, 43, R, 40, R, R, R]
      },
      dungeon: {
        spb: 0.2,
        lead: [57, R, 60, R, 58, R, R, R, 55, R, 58, R, 56, R, R, R,
               53, R, 56, R, 55, R, R, R, 52, R, R, R, R, R, R, R],
        bass: [33, R, R, R, 33, R, R, R, 31, R, R, R, 31, R, R, R,
               29, R, R, R, 29, R, R, R, 28, R, R, R, 28, R, R, R]
      },
      boss: {
        spb: 0.11,
        lead: [64, 64, 67, 64, 70, 64, 67, 64, 63, 63, 66, 63, 69, 63, 66, 63,
               62, 62, 65, 62, 68, 62, 65, 62, 61, 61, 64, 61, 67, 61, 64, 61],
        bass: [28, 28, R, 28, 28, R, 28, R, 27, 27, R, 27, 27, R, 27, R,
               26, 26, R, 26, 26, R, 26, R, 25, 25, R, 25, 25, R, 25, R]
      },
      pantano: {
        spb: 0.22,
        lead: [57, R, R, 60, 59, R, 55, R, 57, R, R, R, 52, R, 55, R,
               57, R, R, 60, 62, R, 60, 59, 57, R, R, R, R, R, R, R],
        bass: [33, R, 33, R, R, R, 31, R, 33, R, 33, R, R, R, 28, R,
               33, R, 33, R, R, R, 35, R, 33, R, R, R, 28, R, R, R]
      },
      castelo: {
        spb: 0.17,
        lead: [62, R, 62, 65, 69, R, 67, 65, 64, R, 62, R, 61, R, R, R,
               62, R, 62, 65, 69, R, 70, 69, 67, R, 65, R, 64, R, R, R],
        bass: [38, R, 38, R, 38, R, 38, R, 34, R, 34, R, 33, R, 33, R,
               38, R, 38, R, 38, R, 38, R, 34, R, 36, R, 37, R, 37, R]
      },
      // abertura: lenta, em La menor, com acordes longos (Am F C G / Am F G E)
      historia: {
        spb: 0.3, wave: 'triangle', vol: 0.2, sus: 2.4,
        lead: [76, R, R, 74, 72, R, 71, 72, 69, R, R, R, 72, R, 74, R,
               76, R, R, 79, 77, R, 76, 74, 74, R, R, R, R, R, 71, R,
               72, R, 74, 76, R, R, 81, R, 79, R, 77, R, 76, R, 72, R,
               74, R, R, 76, 74, R, 71, R, 68, R, R, R, 71, R, R, R],
        bass: [45, R, R, R, 45, R, R, R, 41, R, R, R, 41, R, R, R,
               48, R, R, R, 48, R, R, R, 43, R, R, R, 43, R, R, R,
               45, R, R, R, 45, R, R, R, 41, R, R, R, 41, R, R, R,
               43, R, R, R, 43, R, R, R, 40, R, R, R, 40, R, R, R],
        pad: { 0: [57, 60, 64], 8: [53, 57, 60], 16: [55, 60, 64], 24: [55, 59, 62],
               32: [57, 60, 64], 40: [53, 57, 60], 48: [55, 59, 62], 56: [52, 56, 59] }
      },
      // deserto: escala frigia (mi frigio), com o baixo arrastado
      deserto: {
        spb: 0.19,
        lead: [64, R, 65, R, 68, R, 67, 65, 64, R, R, 60, 62, R, 64, R,
               65, R, 68, 70, 68, R, 67, R, 65, R, 64, R, R, R, R, R],
        bass: [40, R, R, R, 41, R, R, R, 40, R, R, R, 36, R, R, R,
               40, R, R, R, 41, R, R, R, 43, R, R, R, 40, R, R, R]
      },
      // geleira: poucas notas, agudas e longas, com eco de acorde
      geleira: {
        spb: 0.26, wave: 'triangle', vol: 0.18, sus: 2.6,
        lead: [81, R, R, R, 79, R, R, 76, 74, R, R, R, 76, R, R, R,
               81, R, R, 84, 83, R, R, 79, 76, R, R, R, R, R, R, R],
        bass: [45, R, R, R, R, R, R, R, 43, R, R, R, R, R, R, R,
               41, R, R, R, R, R, R, R, 40, R, R, R, R, R, R, R],
        pad: { 0: [57, 60, 64], 8: [55, 59, 62], 16: [53, 57, 60], 24: [52, 55, 59] }
      },
      // forja: martelada de baixo, rapida e pesada
      forja: {
        spb: 0.14,
        lead: [52, 52, R, 55, 52, R, 57, R, 52, 52, R, 55, 58, R, 57, 55,
               53, 53, R, 56, 53, R, 58, R, 53, 53, R, 56, 59, R, 58, 56],
        bass: [28, 28, 28, R, 28, 28, R, 28, 28, 28, 28, R, 28, R, 28, R,
               29, 29, 29, R, 29, 29, R, 29, 29, 29, 29, R, 29, R, 29, R]
      },
      // ilhas do ceu: maior, leve, subindo
      ceu: {
        spb: 0.18, wave: 'triangle', vol: 0.2,
        lead: [72, R, 76, R, 79, R, 83, 81, 79, R, 76, R, 77, R, 79, R,
               74, R, 77, R, 81, R, 84, 83, 81, R, 79, R, R, R, R, R],
        bass: [48, R, 55, R, 52, R, 55, R, 50, R, 57, R, 53, R, 57, R,
               48, R, 55, R, 52, R, 55, R, 47, R, 54, R, 43, R, R, R]
      },
      // vazio: tons inteiros, sem centro, quase parado
      vazio: {
        spb: 0.28, wave: 'sine', vol: 0.22, sus: 3,
        lead: [70, R, R, 68, R, R, 66, R, 64, R, R, 62, R, R, 60, R,
               62, R, R, 64, R, R, 66, R, 68, R, R, R, R, R, R, R],
        bass: [34, R, R, R, R, R, R, R, 32, R, R, R, R, R, R, R,
               30, R, R, R, R, R, R, R, 32, R, R, R, R, R, R, R],
        pad: { 0: [46, 50, 54], 8: [44, 48, 52], 16: [42, 46, 50], 24: [44, 48, 52] }
      },
      win: {
        spb: 0.18,
        lead: [72, 76, 79, 84, 83, 79, 81, R, 77, 81, 84, 88, 86, 84, 83, R,
               72, 76, 79, 84, 83, 79, 81, R, 84, R, R, R, R, R, R, R],
        bass: [48, R, 55, R, 53, R, 55, R, 52, R, 55, R, 53, R, 55, R,
               48, R, 55, R, 53, R, 55, R, 48, R, R, R, R, R, R, R]
      }
    },

    // faixas em mp3 (src/music); o que nao esta aqui continua sintetizado (arenas do VS, vitoria)
    files: (function () {
      const f = { historia: 'src/music/open.mp3' };
      for (let i = 1; i <= 8; i++) f['world' + i] = 'src/music/world' + i + '.mp3';
      for (let i = 1; i <= 16; i++) f['boss' + i] = 'src/music/boss' + i + '.mp3';
      return f;
    })(),
    els: {}, el: null, VOL_ARQUIVO: 0.5,

    audio(n) {
      let a = this.els[n];
      if (!a) {
        a = new Audio(this.files[n]);
        a.loop = true;
        a.preload = 'auto';
        a.volume = this.VOL_ARQUIVO;
        this.els[n] = a;
      }
      return a;
    },

    pausaArquivo() {
      if (this.el) { this.el.pause(); this.el = null; }
    },

    set(n) {
      if (this.name === n) return;
      this.name = n;
      this.step = 0;
      this.next = Sound.ctx ? Sound.ctx.currentTime + 0.05 : 0;
      this.pausaArquivo();
      if (n && this.files[n]) {
        this.el = this.audio(n);
        this.el.currentTime = 0;
      }
    },

    stop() { this.name = null; this.pausaArquivo(); },

    update() {
      if (this.el) {
        this.el.muted = !Sound.on;
        if (this.el.paused && Sound.ready) this.el.play().catch(() => {});
        return;
      }
      if (!Sound.ready || !Sound.on || !this.name) return;
      const t = this.tracks[this.name];
      if (!t) return;
      const now = Sound.ctx.currentTime;
      if (this.next < now) this.next = now + 0.02;
      let guard = 0;
      while (this.next < now + 0.2 && guard++ < 32) {
        const i = this.step % t.lead.length;
        const l = t.lead[i], b = t.bass[i];
        if (l > 0) Sound.tone(nf(l), t.spb * (t.sus || 1.6), t.wave || 'square', t.vol || 0.22, 1, Sound.musicBus, this.next);
        if (b > 0) Sound.tone(nf(b), t.spb * 1.9, 'triangle', 0.3, 1, Sound.musicBus, this.next);
        const acorde = t.pad && t.pad[i];            // acordes longos (trilha da abertura)
        if (acorde) acorde.forEach((n) => Sound.tone(nf(n), t.spb * 8, 'sine', 0.09, 1, Sound.musicBus, this.next));
        this.next += t.spb;
        this.step++;
      }
    }
  };
  G.Music = Music;

  /* ---------- particulas: arrays tipados, swap-remove, zero alocacao ---------- */
  G.PAL = ['#ffffff', '#ffd34d', '#e84c3d', '#7fd858', '#5aa7ff',
           '#c8c8c8', '#8b5a2b', '#1a1a2e', '#b45cff', '#ff8a3d'];

  class Particles {
    constructor(max) {
      max = max || 512;
      this.max = max; this.n = 0;
      this.x = new Float32Array(max); this.y = new Float32Array(max);
      this.vx = new Float32Array(max); this.vy = new Float32Array(max);
      this.life = new Float32Array(max);
      this.col = new Uint8Array(max); this.size = new Uint8Array(max);
      this.grav = new Float32Array(max);
    }
    spawn(x, y, vx, vy, life, col, size, grav) {
      const i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
      this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
      this.life[i] = life;
      this.col[i] = col; this.size[i] = size || 1; this.grav[i] = grav || 0;
    }
    burst(x, y, count, col, speed, life, size) {
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.8);
        this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s,
          life * (0.6 + Math.random() * 0.6), col, size || 1, 0);
      }
    }
    clear() { this.n = 0; }
    update() {
      for (let i = 0; i < this.n; i++) {
        this.life[i] -= 1;
        if (this.life[i] <= 0) {
          const j = --this.n;
          this.x[i] = this.x[j]; this.y[i] = this.y[j];
          this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
          this.life[i] = this.life[j];
          this.col[i] = this.col[j]; this.size[i] = this.size[j];
          this.grav[i] = this.grav[j];
          i--; continue;
        }
        this.vy[i] += this.grav[i];
        this.vx[i] *= 0.94; this.vy[i] *= 0.94;
        this.x[i] += this.vx[i]; this.y[i] += this.vy[i];
      }
    }
    draw(ctx) {
      const pal = G.PAL;
      let cur = -1;
      for (let i = 0; i < this.n; i++) {
        const c = this.col[i];
        if (c !== cur) { ctx.fillStyle = pal[c]; cur = c; }
        const s = this.size[i];
        ctx.fillRect(this.x[i] | 0, this.y[i] | 0, s, s);
      }
    }
  }
  G.Particles = Particles;
})(window.AURUM = window.AURUM || {});
