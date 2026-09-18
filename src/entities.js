/* entities.js - jogador, inimigos, chefes, projeteis, itens e baus. */
(function (G) {
  'use strict';

  const TILE = G.TILE, VIEW_W = G.VIEW_W, VIEW_H = G.VIEW_H;
  const Sound = G.Sound;
  const T = () => G.T;

  const D = 0.7071;
  const DIR_VEC = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    upleft: [-D, -D], upright: [D, -D], downleft: [-D, D], downright: [D, D]
  };
  G.DIR_VEC = DIR_VEC;

  function dirFrom(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
  }

  // facing em 8 direcoes: vira diagonal quando os dois eixos tem peso parecido
  function dir8(dx, dy) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > 0.01 && ay > 0.01 && Math.min(ax, ay) / Math.max(ax, ay) > 0.45) {
      return (dy < 0 ? 'up' : 'down') + (dx < 0 ? 'left' : 'right');
    }
    return ax > ay ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }
  G.dir8 = dir8;

  // aplica dano de um ataque do jogador `dono` em `e` (monstro ou, no VS, o oponente)
  // e guarda quem bateu, para o placar do competitivo
  G.ferir = function (g, e, dmg, dx, dy, dono) {
    if (dono) e.ultimoDono = dono;
    if (e instanceof Player) e.levaGolpe(g, dmg, dx, dy);
    else e.hurt(g, dmg, dx, dy);
  };
  // variante que ignora armadura e fases intangiveis (onda de choque, bola de fogo)
  G.ferirBruto = function (g, e, dmg, dx, dy, dono) {
    if (dono) e.ultimoDono = dono;
    if (e instanceof Player) e.levaGolpe(g, dmg, dx, dy);
    else G.Enemy.prototype.hurt.call(e, g, dmg, dx, dy);
  };
  // efeito da magia em `e`: gelo congela, fogo queima, raio paralisa
  G.aplicaElemento = function (g, e, elem, dono) {
    if (e.dead || e.escudo > 0) return;
    const tab = e instanceof Player ? EFEITO_JOGADOR : e.boss ? EFEITO_CHEFE : null;
    if (elem.id === 'gelo') {
      e.gelo = tab ? tab.gelo : GELO_T;
      e.fogo = 0;                                  // o gelo apaga o fogo
      g.particles.burst(e.cx, e.cy, 12, 4, 1.4, 20);
    } else if (elem.id === 'fogo') {
      e.fogo = tab ? tab.fogo : FOGO_T;
      e.fogoT = FOGO_TICK;
      e.fogoDono = dono;
      e.gelo = 0;                                  // e o fogo derrete o gelo
      g.particles.burst(e.cx, e.cy, 10, 9, 1.4, 18);
    } else if (elem.id === 'raio') {
      e.para = tab ? tab.raio : RAIO_T;
      g.particles.burst(e.cx, e.cy, 10, 1, 1.8, 14);
    }
  };

  // o raio pula do inimigo atingido para o mais proximo ainda nao atingido, e assim por diante
  G.raioEmCadeia = function (g, de, dmg, dono) {
    const feitos = new Set([de]), pts = [[de.cx, de.cy]];
    let atual = de;
    for (let k = 0; k < RAIO_SALTOS; k++) {
      let best = null, bd = RAIO_ALCANCE * RAIO_ALCANCE;
      for (const e of g.alvos(dono)) {
        if (feitos.has(e) || e.dead) continue;
        const d = (e.cx - atual.cx) ** 2 + (e.cy - atual.cy) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      feitos.add(best);
      pts.push([best.cx, best.cy]);
      const d = Math.sqrt(bd) || 1;
      G.ferir(g, best, dmg, (best.cx - atual.cx) / d, (best.cy - atual.cy) / d, dono);
      G.aplicaElemento(g, best, ELEMENTS[2], dono);
      atual = best;
    }
    if (pts.length > 1) { g.ents.push(new Relampago(pts)); Sound.play('goldhit'); }
  };

  const PVP_WAVE = 4, PVP_NOVA = 6;              // dano em jogador: onda e explosao (meios-coracoes)
  G.PVP_NOVA = PVP_NOVA;

  /* ================= base ================= */

  class Ent {
    constructor(x, y, w, h) {
      this.x = x; this.y = y; this.w = w; this.h = h;
      this.vx = 0; this.vy = 0;
      this.dir = 'down';
      this.anim = 0; this.hurtT = 0;
      this.dead = false;
      this.sw = 16; this.sh = 16;
      this.fly = false; this.float = 0;
      this.enemy = false; this.boss = false;
      this.z = 0;
    }
    get cx() { return this.x + this.w * 0.5; }
    get cy() { return this.y + this.h * 0.5; }
    hits(o) { return G.overlap(this.x, this.y, this.w, this.h, o.x, o.y, o.w, o.h); }
    frame() { return (this.anim >> 3) & 1; }

    sprite(S) {
      if (this.set) return S[this.set][this.dir][this.frame()];
      if (this.frames) { const a = S[this.frames]; return a[this.frame() % a.length]; }
      return null;
    }
    draw(ctx, S, tick) {
      const img = this.sprite(S);
      if (!img) return;
      if (this.hurtT > 0 && (tick & 2)) return;         // pisca ao tomar dano
      const dx = (this.cx - img.width / 2) | 0;
      const dy = this.fly
        ? (this.cy - img.height / 2 + Math.sin((tick + this.z) * 0.12) * 2) | 0
        : (this.y + this.h - img.height + 2) | 0;
      if (this.fly) {
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.fillRect((this.cx - 5) | 0, (this.y + this.h - 1) | 0, 10, 2);
      }
      if (this.alpha !== undefined && this.alpha < 1) {
        ctx.globalAlpha = this.alpha;
        ctx.drawImage(img, dx, dy);
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(img, dx, dy);
      }
    }
  }
  G.Ent = Ent;

  /* ================= jogador ================= */

  // golpe em arco: preparacao (lamina erguida), varredura de cima para baixo, recuperacao
  const ATK_WIND = 3, ATK_SWING = 7, ATK_REC = 2;
  const ATK_TIME = ATK_WIND + ATK_SWING + ATK_REC;
  // arco de 180 graus centrado na direcao encarada: comeca na vertical de cima,
  // passa pela direcao do golpe e termina na vertical de baixo
  const SWING_FROM = -Math.PI / 2, SWING_TO = Math.PI / 2;
  const BLADE_HITS = [11, 16, 21];             // amostras ao longo da lamina
  // rastro: cada eco tem vida propria e some sozinho; o ultimo eco nasce no fim
  // da varredura com TRAIL_LIFE quadros, entao o rastro zera junto com o golpe
  const TRAIL_LIFE = 3, TRAIL_MAX = 4;
  const HAND_OUT = 5;                          // distancia da base do cabo ao corpo
  const BOW_TIME = 14, BOW_FIRE = 7;           // arqueiro: recuperacao apos soltar
  const CHARGE_MAX = 90;                       // 1,5 s ate a carga cheia (especial, X)
  const CHARGE_BAR = 60;                       // a barra so aparece depois de 1 s segurando (especial, X)
  const ATK_CHARGE_MAX = 45;                   // 0,75 s ate a carga cheia (tiro normal, Z): 2x mais rapido
  const ATK_CHARGE_BAR = 30;                   // a barra so aparece depois de 0,5 s segurando (tiro normal, Z)
  const SP_CD = 120;                           // ataque especial: 2 s de recarga
  const KILL_REFUND = 30;                      // cada inimigo morto adianta 0,5 s das recargas
  const SP_RANGE_FULL = 480;                   // as flechas da salva sempre atravessam a sala inteira
  const SP_RAJADAS = 4, SP_RAJADA_T = 10;      // segurando ate a carga cheia: 4 salvas seguidas, a cada 10 quadros
  const SP_SHRINK_FULL = 140;                  // distancia em que a flecha termina de encolher
  const SP_SPACING = 16;                       // uma flecha por bloco, preenchendo o espaco
  const SPIN_CD = 180;                         // giro de 360 graus: 3 s de recarga
  const SPIN_VOLTAS = 4;                       // 4 voltas, uma flecha em cada uma das 8 direcoes por volta
  const SPIN_TIME = 24 * SPIN_VOLTAS;          // 3 quadros por flecha, 32 flechas
  const SPIN_RANGE = 120;                      // 7,5 blocos em cada direcao
  const SPIN_DIRS = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
  const GOLD_CD = 600;                         // flecha dourada (V): 10 s de recarga
  const GOLD_SPD = 3.6;                        // velocidade de cruzeiro
  const GOLD_TURN = 0.16;                      // quanto a flecha pode virar por quadro (rad)
  const GOLD_MULT = 3;                         // dano = 3x o de uma flecha comum
  const GOLD_LIFE = 600;                       // limite de seguranca: some depois de 10 s
  const GOLD_FREE = 160;                       // sem alvo: voa reto por esse tanto e some
  const GOLD_ECHO = 8;                         // capacidade do rastro
  const ARROW_SPD = [2.6, 5.4];                // solta no tapa -> carga cheia
  const ARROW_RANGE = [80, 190];               // alcance em pixels
  const ARROW_SCALE = [1.6, 2.6];              // tamanho ao sair do arco
  const ARROW_SCALE_END = 0.85;                // tamanho no fim do voo
  const ARROW_ECHO = 10;                       // capacidade do rastro
  const EMPURRA_FLECHA = 3;                    // flecha normal: empurra 3x mais que um golpe comum
  const EMPURRA_TOTAL_VEL = 6;                 // flecha carregada: arrasta ate a parede ou a borda, a 6 px/quadro
  const COLADO_FRENTE = 28, COLADO_VOLTA = 16;  // ao atirar, afasta quem esta a frente (28 px) ou colado em qualquer lado (16 px)
  const MAGIA_SOLTA = 6;                       // mago: a magia sai no meio da varredura do cajado
  // ordem ponderada dos elementos: 7 de fogo, 4 de gelo, 2 de raio, e recomeca
  const CICLO_ELEM = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2];

  // habilidades do mago
  const MG_CHOQUE_CD = 300;                    // X: bate o cajado e eletrocuta todos (5 s de recarga)
  const MG_CHOQUE_T = 180, MG_CHOQUE_TICK = 30; // eletrocutado por 3 s, 1 de dano a cada 0,5 s
  const MG_ESCUDO_CD = 420;                    // C: escudo (7 s de recarga)
  const MG_ESCUDO_T = 300;                     // invulneravel por 5 s
  const MG_INFERNO_CD = 600;                   // V: bate o cajado e todos pegam fogo e morrem (10 s)
  const MG_INFERNO_T = 60;                     // queimam por 1 s antes de cair
  const MG_ERGUE = 20, MG_RECUA = 10;          // quadros erguendo o cajado e depois da batida

  // efeitos das magias (em quadros, 60 = 1 s)
  const GELO_T = 600;                          // gelo: congelado por 10 s
  const FOGO_T = 300, FOGO_TICK = 60;          // fogo: queima por 5 s, 1 de dano por segundo
  const RAIO_T = 120;                          // raio: paralisado por 2 s
  const RAIO_ALCANCE = 48;                     // raio pula para inimigos a ate 3 blocos
  const RAIO_SALTOS = 4;                       // quantos inimigos extras o raio alcanca
  // chefes e jogadores (VS) sofrem menos
  const EFEITO_CHEFE = { gelo: 180, fogo: FOGO_T, raio: 60 };
  const EFEITO_JOGADOR = { gelo: 90, fogo: 180, raio: 60 };

  // guerreiro: especiais com a espada
  const KN_DASH_CD = 240;                      // investida (X): 4 s de recarga
  const KN_DASH_SPD = 6;                       // px por quadro
  const KN_DASH_SHORT = 64;                    // tapa: 4 blocos
  const KN_DASH_LONG = 400;                    // segurando: atravessa a sala ate a parede ou a borda
  const KN_DASH_MULT = 3;                      // carga cheia: 3x o dano da espada
  const KN_GIRO_CD = 360;                      // giro triplo (C): 6 s de recarga
  const KN_GIRO_VOLTA = 16;                    // quadros por volta de 360 graus
  const KN_GIRO_VOLTAS = 3;
  const KN_GIRO_MULT = 2;                      // 2x o dano da espada, a cada volta
  const KN_RUSH_CD = 600;                      // investida relampago (V): 10 s de recarga
  const KN_RUSH_SPD = 7;                       // px por quadro, ignorando paredes
  const KN_RUSH_PAUSA = 6;                     // quadros parado em cada golpe
  const KN_RUSH_MULT = 4;                      // 4x o dano da espada em cada inimigo
  const KN_RUSH_MAX = 900;                     // limite de seguranca: 15 s
  const KN_INVULNERAVEL = 180;                 // investida (X) e relampago (V): 3 s invulneravel, piscando

  // elementos do mago, na ordem do ciclo
  const ELEMENTS = [
    { id: 'fogo', nome: 'FOGO', cor: 9, dmg: 2, vel: 2.2, pierce: 0, sprite: 'fireball' },
    { id: 'gelo', nome: 'GELO', cor: 4, dmg: 1, vel: 2.0, pierce: 0, sprite: 'iceorb' },
    { id: 'raio', nome: 'RAIO', cor: 1, dmg: 1, vel: 3.4, pierce: 0, sprite: 'spark' }
  ];
  G.ELEMENTS = ELEMENTS;

  const CLASSES = {
    guerreiro: {
      nome: 'GUERREIRO', arma: 'ESPADA', modo: 'melee',
      hp: 10, speed: 1.3, dmg: 1, dash: 1,
      desc: ['GOLPE EM ARCO DE 180 GRAUS', 'CORPO A CORPO, CURTO ALCANCE'],
      skill: 'BOLA DE FOGO'
    },
    arqueiro: {
      nome: 'ARQUEIRO', arma: 'ARCO', modo: 'bow',
      hp: 10, speed: 1.9, dmg: 1, dash: 2,   // ~1,5x a velocidade do guerreiro; rolamento em dobro
      desc: ['FLECHAS A DISTANCIA', '1,5X MAIS RAPIDO, ROLAMENTO LONGO'],
      skill: 'ONDA DE CHOQUE'
    },
    mago: {
      nome: 'MAGO', arma: 'CAJADO', modo: 'magic',
      hp: 10, speed: 1.2, dmg: 2, dash: 1,
      desc: ['CAJADO EM ARCO + MAGIA A CADA GOLPE', 'DANO DOBRADO, MAIS LENTO'],
      skill: 'METEORO ELEMENTAL'
    }
  };
  G.CLASSES = CLASSES;
  G.CLASS_IDS = ['guerreiro', 'arqueiro', 'mago'];
  const FIRE_CD = 3600, CAST_TIME = 20;   // 60 s de recarga a 60 fps
  const ROLL_TIME = 15, ROLL_CD = 24;

  class Player extends Ent {
    constructor(x, y, cls) {
      super(x, y, 10, 10);
      this.cls = CLASSES[cls] ? cls : 'guerreiro';
      this.def = CLASSES[this.cls];
      this.set = 'hero';
      this.maxhp = this.def.hp; this.hp = this.def.hp;   // meios-coracoes
      this.coins = 0; this.keys = 0; this.shards = 0;
      this.sword = 1;                  // nivel de poder: dobra com o 1o fragmento
      this.elem = 0;                   // elemento atual do mago
      this.charging = false;           // arqueiro segurando o tiro
      this.charge = 0;
      this.spCharging = false;         // segurando o ataque especial (X)
      this.spCharge = 0;
      this.spCd = 0;
      this.spMax = SP_CD;
      this.spin = 0;                   // giro de 360 em andamento
      this.spinIdx = -1;
      this.spinCd = 0;
      this.spinMax = SPIN_CD;
      this.rajadas = 0; this.rajadaT = 0;     // salvas que ainda faltam na carga cheia (X)
      this.goldCd = 0;                 // flecha dourada (V)
      this.goldMax = GOLD_CD;
      if (this.def.modo === 'melee') {  // guerreiro usa as mesmas teclas com outros tempos
        this.spMax = KN_DASH_CD; this.spinMax = KN_GIRO_CD; this.goldMax = KN_RUSH_CD;
      } else if (this.def.modo === 'magic') {
        this.spMax = MG_CHOQUE_CD; this.spinMax = MG_ESCUDO_CD; this.goldMax = MG_INFERNO_CD;
      }
      this.golpeChao = null;           // mago: erguendo o cajado para bater no chao (X e V)
      this.escudo = 0;                 // mago: quadros de escudo (C)
      this.dashLeft = 0;               // investida (X): distancia que falta
      this.dashDmg = 0;
      this.dashCheia = false;
      this.giro = 0;                   // giro triplo (C): quadros restantes
      this.giroAng = 0;
      this.rush = null;                // investida relampago (V)
      this.lamina = null;              // angulo fixo da espada durante os especiais
      this.input = null;               // multijogador: entrada propria (null = teclado local)
      this.num = 1;                    // 1 = anfitriao, 2 = convidado
      this.abates = 0;                 // placar do competitivo
      this.respawnT = 0;               // multijogador: quadros ate voltar
      this.speed = this.def.speed;
      this.atk = 0; this.roll = 0; this.rollCd = 0;
      this.fireCd = 0; this.cast = 0;
      this.fireMax = FIRE_CD;
      this.inv = 0; this.knock = 0;
      this.kx = 0; this.ky = 0;
      this.hitSet = new Set();
      this._ab = { x: 0, y: 0, w: 0, h: 0 };
      this._boxes = [0, 1, 2].map(() => ({ x: 0, y: 0, w: 13, h: 13 }));
      this.trailAng = new Float32Array(TRAIL_MAX);
      this.trailLife = new Float32Array(TRAIL_MAX);
      this.trailN = 0;
      this.dead = false;
    }

    // cada eco perde um quadro de vida por frame; o mais velho (indice 0) morre primeiro
    ageTrail() {
      for (let i = 0; i < this.trailN; i++) this.trailLife[i] -= 1;
      let drop = 0;
      while (drop < this.trailN && this.trailLife[drop] <= 0) drop++;
      if (drop) {
        for (let i = drop; i < this.trailN; i++) {
          this.trailAng[i - drop] = this.trailAng[i];
          this.trailLife[i - drop] = this.trailLife[i];
        }
        this.trailN -= drop;
      }
    }

    pushTrail(ang) {
      if (this.trailN >= TRAIL_MAX) {   // descarta o mais velho
        for (let i = 1; i < this.trailN; i++) {
          this.trailAng[i - 1] = this.trailAng[i];
          this.trailLife[i - 1] = this.trailLife[i];
        }
        this.trailN--;
      }
      this.trailAng[this.trailN] = ang;
      this.trailLife[this.trailN] = TRAIL_LIFE;
      this.trailN++;
    }

    // 0 na preparacao, 1 no fim do arco
    swingT() {
      const a = this.atk;
      if (a > ATK_WIND + ATK_SWING) return 0;
      if (a <= ATK_REC) return 1;
      const k = (ATK_WIND + ATK_SWING - a) / ATK_SWING;
      return k * k * (3 - 2 * k);
    }

    swingAngle() {
      if (this.lamina !== null) return this.lamina;
      const v = DIR_VEC[this.dir];
      const base = Math.atan2(v[1], v[0]);
      const off = SWING_FROM + (SWING_TO - SWING_FROM) * this.swingT();
      // virado para a esquerda: o arco espelha, senao o golpe sairia de baixo para cima
      if (v[0] < -0.01) return Math.PI - (Math.PI - base + off);
      return base + off;
    }

    // pivo fixo do cabo: afastado do corpo na direcao encarada, na altura do tronco
    handX() { return this.cx + DIR_VEC[this.dir][0] * HAND_OUT; }
    handY() { return this.cy - 3 + DIR_VEC[this.dir][1] * HAND_OUT; }

    // caixas ao longo da lamina, na inclinacao atual
    bladeBoxes() {
      const ang = this.swingAngle();
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const hx = this.handX(), hy = this.handY();
      for (let i = 0; i < BLADE_HITS.length; i++) {
        const d = BLADE_HITS[i], b = this._boxes[i];
        b.x = hx + ca * d - b.w / 2;
        b.y = hy + sa * d - b.h / 2;
      }
      return this._boxes;
    }

    attackBox() {   // ponta da lamina, para quem so quer uma caixa
      const b = this._ab, boxes = this.bladeBoxes(), t = boxes[boxes.length - 1];
      b.x = t.x; b.y = t.y; b.w = t.w; b.h = t.h;
      return b;
    }

    dano() { return this.def.dmg * this.sword; }

    // cada abate adianta todas as recargas
    abateu() {
      const antes = this.spCd + this.fireCd + this.spinCd + this.goldCd;
      this.spCd = Math.max(0, this.spCd - KILL_REFUND);
      this.fireCd = Math.max(0, this.fireCd - KILL_REFUND);
      this.spinCd = Math.max(0, this.spinCd - KILL_REFUND);
      this.goldCd = Math.max(0, this.goldCd - KILL_REFUND);
      return antes !== this.spCd + this.fireCd + this.spinCd + this.goldCd;
    }

    elemento() { return ELEMENTS[CICLO_ELEM[this.elem % CICLO_ELEM.length]]; }

    // quantos tiros ainda faltam do elemento atual, e qual vem depois
    elementoRestante() {
      const i = this.elem % CICLO_ELEM.length, atual = CICLO_ELEM[i];
      let n = 0;
      while (CICLO_ELEM[(i + n) % CICLO_ELEM.length] === atual && n < CICLO_ELEM.length) n++;
      return { n, prox: ELEMENTS[CICLO_ELEM[(i + n) % CICLO_ELEM.length]] };
    }

    startAttack(g) {
      if (this.def.modo === 'melee') {
        this.atk = ATK_TIME;
        this.hitSet.clear();
        Sound.play('swing');
        g.particles.spawn(this.cx, this.cy, 0, 0, 6, 0, 1, 0);
      } else if (this.def.modo === 'bow') {
        this.atk = BOW_TIME;
        Sound.play('bow');
      } else {                         // mago: varre o cajado como a espada e solta a magia
        this.atk = ATK_TIME;
        this.hitSet.clear();
        Sound.play('swing');
      }
    }

    // ponta da arma, de onde sai o tiro
    muzzle(dist) {
      const v = DIR_VEC[this.dir];
      return [this.handX() + v[0] * dist, this.handY() + v[1] * dist];
    }

    // faiscas que convergem para a ponta da flecha enquanto carrega
    faiscasCarga(g, t, cheia) {
      if ((g.tick & 1) !== 0) return;
      const m = this.muzzle(12);
      const a = Math.random() * Math.PI * 2;
      const r = 14 - 8 * t;
      g.particles.spawn(m[0] + Math.cos(a) * r, m[1] + Math.sin(a) * r,
        -Math.cos(a) * 0.9, -Math.sin(a) * 0.9, 10, cheia ? 0 : 1, 1, 0);
    }

    // segurando o botao: carrega. soltando: dispara.
    updateCharge(g, i) {
      if (this.roll > 0 || this.knock > 0 || this.cast > 0) {
        this.charging = false; this.charge = 0;
        this.spCharging = false; this.spCharge = 0;
        return;
      }

      // ---- giro de 360 (C): uma flecha em cada direcao ----
      if (i.hit('spin')) {
        if (this.spinCd > 0) Sound.play('blocked');
        else {
          this.spin = SPIN_TIME;
          this.spinIdx = -1;
          this.spinCd = SPIN_CD;
          this.charging = false; this.charge = 0;
          this.spCharging = false; this.spCharge = 0;
          this.inv = Math.max(this.inv, SPIN_TIME);   // fica intocavel durante o giro
          Sound.play('spin');
          g.particles.burst(this.cx, this.cy, 20, 1, 2.2, 22);
          g.shake(4);
          g.say('GIRO DE 360!', 60);
          return;
        }
      }

      // ---- flecha dourada (V): persegue e atravessa todos os inimigos ----
      if (i.hit('gold')) {
        if (this.goldCd > 0) Sound.play('blocked');
        else this.soltarDourada(g);
      }

      // ---- ataque especial (X): salva de tres flechas ----
      if (i.hit('special') && !this.spCharging) {
        if (this.spCd > 0) Sound.play('blocked');
        else {
          this.spCharging = true; this.spCharge = 0;
          this.charging = false; this.charge = 0;
          Sound.play('bow');
        }
      }
      if (this.spCharging) {
        if (i.down('special')) {
          if (this.spCharge < CHARGE_MAX) {
            this.spCharge++;
            if (this.spCharge === CHARGE_MAX) Sound.play('charged');
          }
          this.faiscasCarga(g, this.spCharge / CHARGE_MAX, this.spCharge >= CHARGE_MAX);
        } else {
          this.soltarEspecial(g);
          this.spCharging = false; this.spCharge = 0;
        }
        return;                      // nao carrega os dois ao mesmo tempo
      }

      if (i.hit('attack') && !this.charging) {
        this.charging = true;
        this.charge = 0;
        Sound.play('bow');
      }
      if (!this.charging) return;

      if (i.down('attack')) {
        if (this.charge < ATK_CHARGE_MAX) {
          this.charge++;
          if (this.charge === ATK_CHARGE_MAX) Sound.play('charged');
        }
        this.faiscasCarga(g, this.charge / ATK_CHARGE_MAX, this.charge >= ATK_CHARGE_MAX);
      } else {
        this.soltarFlecha(g);
        this.charging = false;
        this.charge = 0;
      }
    }

    /* ---------- mago: X choque, C escudo, V inferno ---------- */

    updateMago(g, i) {
      if (i.hit('spin')) {
        if (this.spinCd > 0) Sound.play('blocked');
        else {
          this.escudo = MG_ESCUDO_T;
          this.spinCd = this.spinMax;
          g.particles.burst(this.cx, this.cy, 20, 4, 1.8, 24);
          Sound.play('secret');
          g.say('ESCUDO ARCANO!', 60);
        }
      }
      const tipo = i.hit('special') ? 'raio' : i.hit('gold') ? 'fogo' : null;
      if (!tipo) return;
      const cd = tipo === 'raio' ? this.spCd : this.goldCd;
      if (cd > 0) { Sound.play('blocked'); return; }
      this.golpeChao = { tipo, t: 0 };               // ergue o cajado; a batida vem depois
      Sound.play('cast');
    }

    // ergue o cajado, bate no chao e solta o efeito; a recarga conta a partir da batida
    updateGolpeChao(g) {
      const gc = this.golpeChao;
      gc.t++;
      this.anim = 0;
      const cor = gc.tipo === 'raio' ? 1 : 9;
      if (gc.t <= MG_ERGUE) {
        this.lamina = -Math.PI / 2 + Math.sin(gc.t * 0.6) * 0.08;   // cajado erguido, tremendo
        if ((gc.t & 1) === 0) {
          const a = Math.random() * Math.PI * 2;
          g.particles.spawn(this.cx + Math.cos(a) * 14, this.cy - 10 + Math.sin(a) * 14,
            -Math.cos(a) * 0.8, -Math.sin(a) * 0.8, 12, cor, 1, 0);
        }
        if (gc.t === MG_ERGUE) {
          this.lamina = Math.PI / 2;                                // bate no chao
          if (gc.tipo === 'raio') this.soltaChoque(g); else this.soltaInferno(g);
        }
        return;
      }
      this.lamina = Math.PI / 2;
      if (gc.t >= MG_ERGUE + MG_RECUA) { this.golpeChao = null; this.lamina = null; }
    }

    // X: todos os alvos da sala eletrocutados por 3 s, raios saindo do mago ate cada um
    soltaChoque(g) {
      this.spCd = this.spMax;
      const alvos = g.alvos(this);
      for (const e of alvos) {
        g.ents.push(new Relampago([[this.cx, this.cy - 4], [e.cx, e.cy]]));
        G.aplicaElemento(g, e, ELEMENTS[2], this);          // paralisa
        eletrocuta(e, this);
      }
      for (let k = 0; k < 4; k++) {                          // raios para cima, saindo do mago
        const a = -Math.PI / 2 + (k - 1.5) * 0.5;
        g.ents.push(new Relampago([[this.cx, this.cy - 4], [this.cx + Math.cos(a) * 40, this.cy - 4 + Math.sin(a) * 40]]));
      }
      g.particles.burst(this.cx, this.cy + 4, 30, 1, 3, 20, 2);
      g.particles.burst(this.cx, this.cy + 4, 16, 0, 2, 16);
      g.flashT = 8;
      g.shake(7);
      Sound.play('goldhit');
      Sound.play('boss');
      g.say(alvos.length ? 'TEMPESTADE DE RAIOS!' : 'TEMPESTADE DE RAIOS', 60);
    }

    // V: todos pegam fogo e caem em 1 s (chefe leva 1/3 da vida e queima normal; oponente no VS so queima)
    soltaInferno(g) {
      this.goldCd = this.goldMax;
      for (const e of g.alvos(this)) {
        G.aplicaElemento(g, e, ELEMENTS[0], this);
        if (e instanceof Player) continue;
        if (e.boss) {
          const a = Math.atan2(e.cy - this.cy, e.cx - this.cx);
          G.ferirBruto(g, e, Math.max(1, Math.ceil(e.maxhp / 3)), Math.cos(a), Math.sin(a), this);
        } else {
          e.fogo = MG_INFERNO_T; e.fogoT = FOGO_TICK; e.fogoFatal = true; e.fogoDono = this;
        }
        g.particles.burst(e.cx, e.cy, 14, 9, 1.8, 24, 2);
      }
      for (let k = 0; k < 60; k++) {                         // anel de fogo saindo do cajado
        const a = (k / 60) * Math.PI * 2, v = 2 + Math.random() * 2.5;
        g.particles.spawn(this.cx, this.cy + 6, Math.cos(a) * v, Math.sin(a) * v * 0.7, 24 + Math.random() * 16,
          Math.random() < 0.6 ? 9 : 1, 2, 0);
      }
      g.flashT = 16;
      g.shake(10);
      Sound.play('fire');
      Sound.play('nova');
      g.say('INFERNO!', 60);
    }

    /* ---------- guerreiro: X investida, C giro triplo, V investida relampago ---------- */

    especialAtivo() { return this.dashLeft > 0 || this.giro > 0 || this.rush !== null; }

    cancelaEspeciais() {
      this.dashLeft = 0; this.giro = 0; this.rush = null; this.lamina = null; this.golpeChao = null;
      this.spCharging = false; this.spCharge = 0;
    }

    updateKnight(g, i) {
      if (i.hit('spin')) {
        if (this.spinCd > 0) Sound.play('blocked');
        else { this.iniciaGiro(g); return; }
      }
      if (i.hit('gold')) {
        if (this.goldCd > 0) Sound.play('blocked');
        else if (this.iniciaRush(g)) return;
      }
      if (i.hit('special') && !this.spCharging) {
        if (this.spCd > 0) Sound.play('blocked');
        else { this.spCharging = true; this.spCharge = 0; }
      }
      if (!this.spCharging) return;
      if (i.down('special')) {
        if (this.spCharge < CHARGE_MAX) {
          this.spCharge++;
          if (this.spCharge === CHARGE_MAX) Sound.play('charged');
        }
        this.lamina = Math.atan2(DIR_VEC[this.dir][1], DIR_VEC[this.dir][0]);   // espada apontada
        if (this.spCharge >= CHARGE_BAR) this.faiscasCarga(g, this.spCharge / CHARGE_MAX, this.spCharge >= CHARGE_MAX);
      } else {
        this.soltarInvestida(g);
      }
    }

    // tapa: investida curta. segurou ate a barra aparecer: atravessa a sala.
    // barra cheia: 3x o dano da espada
    soltarInvestida(g) {
      const longa = this.spCharge >= CHARGE_BAR, cheia = this.spCharge >= CHARGE_MAX;
      this.spCharging = false; this.spCharge = 0;
      const v = DIR_VEC[this.dir];
      this.lamina = Math.atan2(v[1], v[0]);
      this.dashLeft = longa ? KN_DASH_LONG : KN_DASH_SHORT;
      this.dashDmg = this.dano() * (cheia ? KN_DASH_MULT : 1);
      this.dashCheia = cheia;
      this.hitSet.clear();
      this.spCd = this.spMax;
      this.inv = Math.max(this.inv, KN_INVULNERAVEL);
      Sound.play(cheia ? 'shootbig' : 'swing');
      g.shake(cheia ? 6 : 3);
      g.particles.burst(this.cx, this.cy, cheia ? 18 : 8, cheia ? 0 : 1, 2, 16);
      g.say(cheia ? 'INVESTIDA MAXIMA!' : 'INVESTIDA!', 60);
    }

    updateInvestida(g) {
      const v = DIR_VEC[this.dir];
      const passo = Math.min(KN_DASH_SPD, this.dashLeft);
      // nao passa da borda: senao troca de sala no meio do golpe
      const nx = G.clamp(this.x + v[0] * passo, 1, G.VIEW_W - this.w - 1);
      const ny = G.clamp(this.y + v[1] * passo, 1, G.VIEW_H - this.h - 1);
      const ox = this.x, oy = this.y;
      G.moveEnt(this, g.room, nx - this.x, ny - this.y, false, false);
      this.dashLeft -= passo;
      if (Math.abs(this.x - ox) + Math.abs(this.y - oy) < 0.5) this.dashLeft = 0;   // parede

      // corpo e lamina a frente atingem cada inimigo uma vez
      const bx = this.cx + v[0] * 10 - 10, by = this.cy + v[1] * 10 - 10;
      const alvos = g.alvos(this);
      for (let k = 0; k < alvos.length; k++) {
        const e = alvos[k];
        if (e.dead || this.hitSet.has(e)) continue;
        if (G.overlap(bx, by, 20, 20, e.x, e.y, e.w, e.h) || this.hits(e)) {
          this.hitSet.add(e);
          G.ferir(g, e, this.dashDmg, v[0], v[1], this);
          g.shake(this.dashCheia ? 5 : 3);
        }
      }
      this.pushTrail(this.lamina);
      g.particles.spawn(this.cx - v[0] * 6, this.cy - v[1] * 6, -v[0] * 0.6, -v[1] * 0.6, 12,
        this.dashCheia ? 0 : 1, 2, 0);
      this.anim += 3;
      if (this.dashLeft <= 0) { this.dashLeft = 0; this.lamina = null; }
    }

    iniciaGiro(g) {
      const v = DIR_VEC[this.dir];
      this.giro = KN_GIRO_VOLTA * KN_GIRO_VOLTAS;
      this.giroAng = Math.atan2(v[1], v[0]);
      this.spinCd = this.spinMax;
      this.spCharging = false; this.spCharge = 0;
      this.hitSet.clear();
      Sound.play('spin');
      g.particles.burst(this.cx, this.cy, 20, 0, 2.2, 22);
      g.shake(4);
      g.say('GIRO TRIPLO!', 60);
    }

    updateGiro(g) {
      const feito = KN_GIRO_VOLTA * KN_GIRO_VOLTAS - this.giro;
      if (feito > 0 && feito % KN_GIRO_VOLTA === 0) {   // cada volta acerta de novo
        this.hitSet.clear();
        Sound.play('swing');
      }
      const ang = this.giroAng + (feito / KN_GIRO_VOLTA) * Math.PI * 2;
      this.lamina = ang;
      this.dir = dir8(Math.cos(ang), Math.sin(ang));   // a mao acompanha a lamina
      this.swingHit(g, KN_GIRO_MULT);
      this.pushTrail(ang);
      g.particles.spawn(this.handX() + Math.cos(ang) * 21, this.handY() + Math.sin(ang) * 21, 0, 0, 8, 0, 1, 0);
      this.giro--;
      if (this.giro <= 0) { this.giro = 0; this.lamina = null; }
    }

    // um golpe em cada inimigo da sala, do mais proximo para o proximo mais proximo
    iniciaRush(g) {
      if (!this.proximoAlvo(g, new Set())) {
        Sound.play('blocked');
        g.say('NENHUM INIMIGO', 40);
        return false;
      }
      this.rush = { feitos: new Set(), alvo: null, pausa: 0, t: 0, ox: this.x, oy: this.y, volta: false };
      this.goldCd = this.goldMax;
      this.inv = Math.max(this.inv, KN_INVULNERAVEL);
      this.spCharging = false; this.spCharge = 0;
      Sound.play('gold');
      g.shake(3);
      g.say('INVESTIDA RELAMPAGO!', 70);
      return true;
    }

    proximoAlvo(g, feitos) {
      let best = null, bd = Infinity;
      const alvos = g.alvos(this);
      for (let k = 0; k < alvos.length; k++) {
        const e = alvos[k];
        if (e.dead || e.hp <= 0 || feitos.has(e)) continue;
        const d = G.dist(this.cx, this.cy, e.cx, e.cy);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    updateRush(g) {
      const r = this.rush;
      if (++r.t > KN_RUSH_MAX) r.volta = true;
      if (r.pausa > 0) { r.pausa--; return; }

      if (!r.volta && (!r.alvo || r.alvo.dead)) {
        r.alvo = this.proximoAlvo(g, r.feitos);
        if (!r.alvo) {
          // acabou: fica onde o ultimo caiu, a menos que seja parede ou buraco
          if (!G.boxSolid(g.room, this.x, this.y, this.w, this.h, false)) { this.fimRush(); return; }
          r.volta = true;
        }
      }
      const tx = r.volta ? r.ox + this.w / 2 : r.alvo.cx;
      const ty = r.volta ? r.oy + this.h / 2 : r.alvo.cy;
      const dx = tx - this.cx, dy = ty - this.cy, d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      this.lamina = ang;
      if (d > 0.5) this.dir = dir8(dx, dy);

      if (d <= KN_RUSH_SPD) {
        this.x += dx; this.y += dy;
        if (r.volta) { this.fimRush(); return; }
        const e = r.alvo;
        r.feitos.add(e);
        G.ferir(g, e, this.dano() * KN_RUSH_MULT, Math.cos(ang), Math.sin(ang), this);
        g.particles.burst(e.cx, e.cy, 14, 1, 2.4, 18);
        Sound.play('goldhit');
        g.shake(4);
        r.alvo = null;
        r.pausa = KN_RUSH_PAUSA;
        this.pushTrail(ang);
        return;
      }
      this.x += (dx / d) * KN_RUSH_SPD;
      this.y += (dy / d) * KN_RUSH_SPD;
      this.pushTrail(ang);
      g.particles.spawn(this.cx, this.cy, 0, 0, 10, 1, 2, 0);
      this.anim += 3;
    }

    fimRush() { this.rush = null; this.lamina = null; }

    // arqueiro: todo disparo afasta o inimigo colado nele (sem dano), para abrir espaco
    afastaColados(g) {
      const v = DIR_VEC[this.dir];
      for (const e of g.alvos(this)) {
        if (e.dead || !e.empurra) continue;
        const dx = e.cx - this.cx, dy = e.cy - this.cy, d = Math.hypot(dx, dy) || 1;
        const frente = (dx * v[0] + dy * v[1]) / d > 0.2;
        if (d > COLADO_FRENTE || (!frente && d > COLADO_VOLTA)) continue;
        e.empurra(dx / d, dy / d, 'triplo');
        g.particles.burst(e.cx, e.cy, 6, 5, 1.6, 12);
      }
    }

    // dispara uma flecha; offset desloca a saida na perpendicular da mira
    lancarFlecha(g, t, opt) {
      this.afastaColados(g);
      const cheia = t >= 0.85;
      const v = DIR_VEC[this.dir];
      const m = this.muzzle(12);
      const spd = ARROW_SPD[0] + (ARROW_SPD[1] - ARROW_SPD[0]) * t;
      const off = opt.offset || 0;
      const perp = [-v[1], v[0]];

      g.addEnt(new Arrow(m[0] + perp[0] * off, m[1] + perp[1] * off, v[0] * spd, v[1] * spd, {
        dmg: opt.dmg,
        range: opt.range,
        shrink: opt.shrink,
        scale0: ARROW_SCALE[0] + (ARROW_SCALE[1] - ARROW_SCALE[0]) * t,
        echoLife: 4 + Math.round(4 * t),
        empurrao: opt.empurrao,
        pierce: opt.pierce !== undefined ? opt.pierce : (cheia ? 1 : 0)
      }));
      return cheia;
    }

    soltarFlecha(g) {
      const t = Math.min(1, this.charge / ATK_CHARGE_MAX);
      const cheia = this.lancarFlecha(g, t, {
        dmg: this.dano() * (t >= 0.85 ? 2 : 1),
        range: ARROW_RANGE[0] + (ARROW_RANGE[1] - ARROW_RANGE[0]) * t,
        empurrao: t >= 0.85 ? 'total' : 'triplo'
      });

      const m = this.muzzle(12);
      this.atk = BOW_TIME - BOW_FIRE;          // recuperacao curta
      Sound.play(cheia ? 'shootbig' : 'shoot');
      g.particles.burst(m[0], m[1], cheia ? 16 : 7, cheia ? 0 : 5, cheia ? 2.4 : 1.4, 16);
      if (cheia) g.shake(4);
    }

    // especial: tres flechas lado a lado, uma por bloco, dano dobrado
    // especial: tres flechas lado a lado que sempre atravessam a sala. Tapa = uma salva;
    // segurando ate a carga cheia = 4 salvas seguidas, com dano em dobro e varando inimigos
    soltarEspecial(g) {
      const cheia = this.spCharge / CHARGE_MAX >= 0.85;
      this.salva(g, cheia);
      if (cheia) { this.rajadas = SP_RAJADAS - 1; this.rajadaT = SP_RAJADA_T; }
      this.spCd = SP_CD;
      this.atk = BOW_TIME - BOW_FIRE;
      g.say(cheia ? 'CHUVA DE FLECHAS!' : 'SALVA DE FLECHAS!', 70);
    }

    salva(g, cheia) {
      const dmg = this.dano() * 2 * (cheia ? 2 : 1);
      for (let k = -1; k <= 1; k++) {
        this.lancarFlecha(g, cheia ? 1 : 0.6, {
          dmg, range: SP_RANGE_FULL, shrink: SP_SHRINK_FULL, pierce: cheia ? 99 : 0, offset: k * SP_SPACING
        });
      }
      Sound.play('volley');
      const m = this.muzzle(12);
      g.particles.burst(m[0], m[1], 18, cheia ? 0 : 1, 2.2, 18);
      g.shake(cheia ? 7 : 5);
    }

    // flecha dourada: sai na direcao encarada e cai sobre o inimigo mais proximo
    soltarDourada(g) {
      this.afastaColados(g);
      const v = DIR_VEC[this.dir];
      const m = this.muzzle(12);
      g.addEnt(new GoldArrow(m[0], m[1], v[0] * GOLD_SPD, v[1] * GOLD_SPD, this.dano() * GOLD_MULT));
      this.goldCd = GOLD_CD;
      this.atk = BOW_TIME - BOW_FIRE;
      Sound.play('gold');
      g.particles.burst(m[0], m[1], 16, 1, 2.2, 18);
      g.shake(3);
      g.say('FLECHA DOURADA!', 60);
    }

    atirarFlecha(g) {
      const v = DIR_VEC[this.dir];
      const m = this.muzzle(10);
      const sh = new Shot(m[0] - 3, m[1] - 3, v[0] * 3.1, v[1] * 3.1, 'arrow', this.dano(), this.dir);
      sh.friendly = true;
      g.addEnt(sh);
      g.particles.spawn(m[0], m[1], 0, 0, 8, 0, 1, 0);
    }

    lancarMagia(g) {
      const e = this.elemento();
      const v = DIR_VEC[this.dir];
      const m = this.muzzle(12);
      const sh = new Shot(m[0] - 4, m[1] - 4, v[0] * e.vel, v[1] * e.vel, e.sprite, e.dmg * this.sword, this.dir);
      sh.friendly = true;
      sh.pierce = e.pierce;
      sh.elem = e;
      g.addEnt(sh);
      g.particles.burst(m[0], m[1], 10, e.cor, 1.6, 16);
      this.elem = (this.elem + 1) % CICLO_ELEM.length;   // avanca na ordem ponderada
    }

    update(g) {
      const i = this.input || g.input;
      this.ageTrail();
      if (this.inv > 0) this.inv--;
      if (this.hurtT > 0) this.hurtT--;
      if (this.rollCd > 0) this.rollCd--;
      if (this.fireCd > 0) this.fireCd--;
      if (this.spCd > 0) this.spCd--;
      if (this.spinCd > 0) this.spinCd--;
      if (this.goldCd > 0) this.goldCd--;

      if (this.fogo > 0) { tickFogo(g, this); if (this.dead) return; }
      if (this.choque > 0) { tickChoque(g, this); if (this.dead) return; }
      if (this.gelo > 0 || this.para > 0) {         // congelado ou paralisado: nao age
        if (this.gelo > 0) this.gelo--;
        if (this.para > 0) this.para--;
        efeitoParticulas(g, this);
        this.anim = 0;
        return;
      }

      if (this.rajadas > 0 && --this.rajadaT <= 0) {   // carga cheia do X: proximas salvas
        this.salva(g, true);
        this.rajadas--;
        this.rajadaT = SP_RAJADA_T;
      }

      if (this.escudo > 0) this.escudo--;
      if (this.golpeChao) { this.updateGolpeChao(g); return; }
      if (this.dashLeft > 0) { this.updateInvestida(g); return; }
      if (this.giro > 0) { this.updateGiro(g); return; }
      if (this.rush) { this.updateRush(g); return; }

      if (this.spin > 0) {
        this.spin--;
        const total = SPIN_DIRS.length * SPIN_VOLTAS, passo = SPIN_TIME / total;
        const idx = Math.min(total - 1, Math.floor((SPIN_TIME - this.spin) / passo));
        if (idx !== this.spinIdx) {
          this.spinIdx = idx;
          this.dir = SPIN_DIRS[idx % SPIN_DIRS.length];
          this.lancarFlecha(g, 0.35, { dmg: this.dano(), range: SPIN_RANGE });
          Sound.play('shoot');
          const m = this.muzzle(12);
          g.particles.spawn(m[0], m[1], 0, 0, 8, 1, 1, 0);
        }
        this.anim += 2;
        return;
      }

      if (this.cast > 0) {
        this.cast--;
        this.anim = 0;
        if (this.cast % 3 === 0) {
          const a = Math.random() * Math.PI * 2;
          g.particles.spawn(this.cx + Math.cos(a) * 10, this.cy + Math.sin(a) * 10,
            -Math.cos(a) * 0.9, -Math.sin(a) * 0.9, 16, Math.random() < 0.5 ? 9 : 1, 2, 0);
        }
        return;
      }

      if (this.knock > 0) {
        this.knock--;
        G.moveEnt(this, g.room, this.kx, this.ky, false, false);
        this.kx *= 0.82; this.ky *= 0.82;
        this.anim = 0;
        return;
      }

      if (this.roll > 0) {
        this.roll--;
        const v = DIR_VEC[this.dir];
        const s = (2.6 * (this.roll / ROLL_TIME) + 0.7) * (this.def.dash || 1);
        G.moveEnt(this, g.room, v[0] * s, v[1] * s, false, true);
        this.anim += 3;
        if (this.roll % 3 === 0) g.particles.spawn(this.cx, this.y + this.h, (Math.random() - 0.5), -0.3, 12, 5, 1, 0);
        return;
      }

      if (this.atk > 0) {
        this.atk--;
        if (this.def.modo === 'bow') return;   // so recuperacao; o tiro sai ao soltar
        if (this.def.modo === 'magic' && this.atk === MAGIA_SOLTA) { this.lancarMagia(g); Sound.play('cast'); }
        if (this.atk <= ATK_WIND + ATK_SWING && this.atk > ATK_REC) {
          this.swingHit(g);
          const ang = this.swingAngle();
          this.pushTrail(ang);             // eco novo na posicao atual da lamina
          g.particles.spawn(this.handX() + Math.cos(ang) * 21, this.handY() + Math.sin(ang) * 21,
            0, 0, 8, 0, 1, 0);
        }
        return;
      }

      if (this.def.modo === 'bow') this.updateCharge(g, i);
      else if (this.def.modo === 'melee') {
        this.updateKnight(g, i);
        if (this.especialAtivo()) return;
      } else if (this.def.modo === 'magic') {
        this.updateMago(g, i);
        if (this.golpeChao) return;
      }

      // movimento
      let dx = 0, dy = 0;
      if (i.down('left')) dx -= 1;
      if (i.down('right')) dx += 1;
      if (i.down('up')) dy -= 1;
      if (i.down('down')) dy += 1;

      if (dx || dy) {
        if (dx && dy) { dx *= D; dy *= D; }
        this.dir = dir8(dx, dy);
        const mirando = this.charging || (this.spCharging && this.def.modo === 'melee');
        const sp = mirando ? this.speed * 0.55 : this.speed;   // mira pesa o passo
        G.moveEnt(this, g.room, dx * sp, dy * sp, false, true);
        this.anim += 1;
      } else {
        this.anim = 0;
      }

      if (i.hit('fire') && this.fireCd === 0) { this.castFire(g); return; }
      if (i.hit('attack') && this.def.modo !== 'bow' && !this.spCharging) this.startAttack(g);
      else if (i.hit('roll') && this.rollCd === 0) {
        this.roll = ROLL_TIME; this.rollCd = ROLL_CD; this.inv = Math.max(this.inv, 12);
        Sound.play('swing');
      }
    }

    swingHit(g, mult) {
      const boxes = this.bladeBoxes();
      const dmg = this.dano() * (mult || 1);
      const ang = this.swingAngle();
      const kx = Math.cos(ang), ky = Math.sin(ang);
      const TT = T();

      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];

        const alvos = g.alvos(this);
        for (let k = 0; k < alvos.length; k++) {
          const e = alvos[k];
          if (e.dead || this.hitSet.has(e)) continue;
          if (G.overlap(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)) {
            this.hitSet.add(e);
            G.ferir(g, e, dmg, kx, ky, this);
            g.shake(3);
          }
        }

        const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 1) / TILE);
        const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 1) / TILE);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (G.tileAt(g.room, tx, ty) === TT.BUSH) {
              G.setTile(g.room, tx, ty, TT.GRASS);
              g.particles.burst(tx * TILE + 8, ty * TILE + 8, 10, 3, 1.6, 20);
              Sound.play('hit');
              if (Math.random() < 0.3) g.spawnPickup(tx * TILE + 8, ty * TILE + 8, Math.random() < 0.7 ? 'coin' : 'heart');
            }
          }
        }

        for (let k = 0; k < g.ents.length; k++) {
          const e = g.ents[k];
          if (e.chest && !e.open && G.overlap(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)) e.tryOpen(g);
        }
      }
    }

    castFire(g) {
      this.fireCd = FIRE_CD;
      this.cast = CAST_TIME;

      if (this.def.modo === 'bow') {          // arqueiro: onda circular a partir dele
        g.addEnt(new Wave(this.cx, this.cy));
        g.particles.burst(this.cx, this.cy, 26, 3, 2.6, 24, 2);
        g.shake(6);
        Sound.play('wave');
        g.say('ONDA DE CHOQUE!', 70);
        return;
      }

      if (this.def.modo === 'magic') {        // mago: meteoro cai no meio da sala
        g.addEnt(new Meteoro(G.VIEW_W / 2, G.VIEW_H / 2));
        g.particles.burst(this.cx, this.cy - 6, 20, 9, 2, 22, 2);
        Sound.play('cast');
        g.say(this.def.skill + '!', 70);
        return;
      }

      const v = DIR_VEC[this.dir];
      g.addEnt(new Fireball(this.cx - 7 + v[0] * 10, this.cy - 7 + v[1] * 10, v[0] * 2.3, v[1] * 2.3));
      g.particles.burst(this.cx + v[0] * 12, this.cy + v[1] * 12, 20, 9, 2.4, 22, 2);
      g.shake(4);
      Sound.play('fire');
      g.say(this.def.skill + '!', 70);
    }

    hurt(g, dmg, fx, fy) {
      if (this.inv > 0 || this.roll > 0 || this.dead || this.especialAtivo() || this.escudo > 0) return;
      this.hp -= dmg;
      this.inv = 64; this.hurtT = 40;
      const a = Math.atan2(this.cy - fy, this.cx - fx);
      this.kx = Math.cos(a) * 3.2; this.ky = Math.sin(a) * 3.2;
      this.knock = 10;
      this.atk = 0; this.roll = 0;
      this.cancelaEspeciais();
      g.shake(6);
      g.particles.burst(this.cx, this.cy, 10, 2, 2, 20);
      if (this.hp <= 0) { this.hp = 0; this.dead = true; g.onPlayerDead(this); }
      else Sound.play('hurt');
    }

    heal(n) { this.hp = Math.min(this.maxhp, this.hp + n); }

    // golpe de outro jogador (VS): chega como direcao, hurt espera a origem
    levaGolpe(g, dmg, dx, dy) { this.hurt(g, dmg, this.cx - dx * 8, this.cy - dy * 8); }

    // arco: apontado na direcao encarada, com recuo no disparo
    drawArma(ctx, S) {
      const modo = this.def.modo;
      const set = S.bow;
      const n = S.bladeSteps, step = (Math.PI * 2) / n, piv = S.bladePivot;
      const v = DIR_VEC[this.dir];
      let ang = Math.atan2(v[1], v[0]);

      if (modo === 'bow') {
        // gira para tras conforme a corda e puxada, e volta no disparo
        const carga = this.spCharging ? this.spCharge : this.charge;
        const cmax = this.spCharging ? CHARGE_MAX : ATK_CHARGE_MAX;
        const t = (this.charging || this.spCharging) ? Math.min(1, carga / cmax)
          : this.atk / Math.max(1, BOW_TIME - BOW_FIRE);
        ang += (v[0] < 0 ? 0.45 : -0.45) * t;
      }
      const idx = ((Math.round(ang / step) % n) + n) % n;
      ctx.drawImage(set[idx], (this.handX() - piv) | 0, (this.handY() - piv) | 0);
    }

    // espada do guerreiro ou cajado do mago, na inclinacao do golpe, com rastro
    drawBlade(ctx, S, withBlade) {
      const set = this.def.modo === 'magic' ? S.staff : S.blade;
      const n = S.bladeSteps, step = (Math.PI * 2) / n, piv = S.bladePivot;
      // o canvas da lamina e centrado no pivo: alinha o pivo com a mao
      const hx = (this.handX() - piv) | 0, hy = (this.handY() - piv) | 0;
      const idx = (a) => ((Math.round(a / step) % n) + n) % n;

      // ecos: do mais velho (quase apagado) para o mais novo
      for (let i = 0; i < this.trailN; i++) {
        const a = this.trailLife[i] / TRAIL_LIFE;
        if (a <= 0) continue;
        ctx.globalAlpha = 0.42 * a * a;
        ctx.drawImage(set[idx(this.trailAng[i])], hx, hy);
      }
      ctx.globalAlpha = 1;
      if (withBlade) ctx.drawImage(set[idx(this.swingAngle())], hx, hy);
    }

    draw(ctx, S, tick) {
      if (this.inv > 0 && (tick & 2) && this.knock <= 0 && !this.dead) return;

      const arte = S.heroes[this.cls];
      const meio = this.def.modo === 'bow' ? BOW_FIRE : ATK_WIND + ATK_SWING;
      const winding = this.charging || this.spCharging || this.atk > meio;
      const img = (this.atk > 0 || this.charging || this.spCharging || this.spin > 0 || this.lamina !== null)
        ? arte.atk[this.dir][winding ? 0 : 1]
        : arte.walk[this.dir][this.roll > 0 ? ((this.roll >> 1) & 1) : this.cast > 0 ? ((this.cast >> 1) & 1) : this.frame()];

      let dx = (this.cx - 8) | 0;
      let dy = (this.y + this.h - 16 + 2) | 0;
      if (this.roll > 0) dy += 1;
      if (this.para > 0) dx += (tick & 2) ? 1 : -1;   // treme paralisado

      // lamina apontada para cima esta atras do corpo (mais longe da camera);
      // apontada para baixo, na frente. Assim o heroi nunca fica coberto pela espada.
      // so virado para baixo a espada passa na frente do corpo; nas outras
      // direcoes lamina e rastro ficam atras do heroi
      const naFrente = this.dir === 'down';
      const melee = this.def.modo !== 'bow';     // espada e cajado giram em arco
      const temArma = this.atk > 0 || this.charging || this.spCharging || this.spin > 0 || this.lamina !== null, temRastro = melee && this.trailN > 0;
      const arma = () => {
        if (!melee) { if (temArma) this.drawArma(ctx, S); return; }
        if (temArma) this.drawBlade(ctx, S, true);
        else if (temRastro) this.drawBlade(ctx, S, false);
      };

      if (!naFrente) arma();
      ctx.drawImage(img, dx, dy);
      if (naFrente) arma();
      desenhaEfeito(ctx, this, dx, dy, 16, 16, tick);
      if (this.escudo > 0 && !(this.escudo < 90 && (tick & 4))) {   // pisca no ultimo 1,5 s
        const r = 12 + Math.sin(tick * 0.2);
        ctx.fillStyle = 'rgba(127,242,255,0.18)';
        ctx.fillRect((this.cx - r) | 0, (this.cy - 2 - r) | 0, (r * 2) | 0, (r * 2) | 0);
        ctx.fillStyle = (tick & 8) ? '#7ff2ff' : '#eaffff';
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2 + tick * 0.05;
          ctx.fillRect((this.cx + Math.cos(a) * r) | 0, (this.cy - 2 + Math.sin(a) * r) | 0, 1, 1);
        }
      }

      // medidor so aparece depois de 1 s segurando
      const carga = this.spCharging ? this.spCharge : this.charging ? this.charge : 0;
      const cbar = this.spCharging ? CHARGE_BAR : ATK_CHARGE_BAR;
      const cmax = this.spCharging ? CHARGE_MAX : ATK_CHARGE_MAX;
      if (carga > cbar) {
        const t = Math.min(1, carga / cmax);
        const bw = 14, bx = (this.cx - bw / 2) | 0, by = dy - 5;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        ctx.fillStyle = t >= 0.85 ? '#ffffff' : this.spCharging ? '#7fd858' : '#ffd34d';
        ctx.fillRect(bx, by, Math.round(bw * t), 2);
      }
    }
  }
  G.Player = Player;

  /* ================= efeitos das magias ================= */

  // eletrocutado pelo X do mago: paralisado e levando 1 de dano a cada 0,5 s
  function eletrocuta(e, dono) {
    e.choque = MG_CHOQUE_T; e.choqueT = MG_CHOQUE_TICK; e.choqueDono = dono;
    if (!(e instanceof Player) && !e.boss) e.para = Math.max(e.para || 0, MG_CHOQUE_T);
  }

  function tickChoque(g, e) {
    e.choque--;
    if ((g.tick & 3) === 0) {
      g.particles.spawn(e.cx + (Math.random() - 0.5) * (e.w + 6), e.cy + (Math.random() - 0.5) * (e.h + 6),
        0, 0, 5, Math.random() < 0.5 ? 1 : 0, 1, 0);
    }
    if (--e.choqueT > 0) return;
    e.choqueT = MG_CHOQUE_TICK * (e instanceof Player ? 2 : 1);   // no VS o oponente leva metade
    danoDireto(g, e, 1, e.choqueDono);
  }

  // dano sem empurrao nem invencibilidade (queimadura, choque); conta o abate para quem lancou
  function danoDireto(g, e, n, dono) {
    if (e.dead || e.escudo > 0) return;
    e.hp -= n;
    e.hurtT = 6;
    if (dono) e.ultimoDono = dono;
    if (e.hp > 0) return;
    e.hp = 0;
    if (e instanceof Player) { e.dead = true; g.onPlayerDead(e); }
    else e.die(g);
  }

  // queimando: 1 de dano por segundo, sem empurrar; o abate conta para quem lancou
  function tickFogo(g, e) {
    e.fogo--;
    if (e.fogoFatal && e.fogo <= 0) { e.fogoFatal = false; danoDireto(g, e, e.hp, e.fogoDono); return; }
    if ((g.tick & 3) === 0) {
      g.particles.spawn(e.cx + (Math.random() - 0.5) * e.w, e.y + Math.random() * e.h * 0.6,
        (Math.random() - 0.5) * 0.3, -0.6, 14, Math.random() < 0.5 ? 9 : 1, 1, 0);
    }
    if (--e.fogoT > 0) return;
    e.fogoT = FOGO_TICK;
    danoDireto(g, e, 1, e.fogoDono);
  }

  function efeitoParticulas(g, e) {
    if (e.gelo > 0 && (g.tick & 15) === 0) {
      g.particles.spawn(e.cx + (Math.random() - 0.5) * e.w, e.y, 0, 0.25, 16, 4, 1, 0);
    }
    if (e.para > 0 && (g.tick & 3) === 0) {
      g.particles.spawn(e.cx + (Math.random() - 0.5) * (e.w + 6), e.cy + (Math.random() - 0.5) * (e.h + 6),
        (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 5, Math.random() < 0.5 ? 1 : 0, 1, 0);
    }
  }

  // gelo: bloco azul translucido; raio: faiscas amarelas; fogo: brilho laranja embaixo
  function desenhaEfeito(ctx, e, x, y, w, h, tick) {
    if (e.gelo > 0) {
      const fim = e.gelo < 90 && (tick & 4);      // pisca quando esta para descongelar
      ctx.fillStyle = fim ? 'rgba(200,240,255,0.30)' : 'rgba(127,210,255,0.45)';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = 'rgba(234,255,255,0.85)';
      ctx.fillRect(x - 1, y - 1, w + 2, 1);
      ctx.fillRect(x - 1, y - 1, 1, h + 2);
      ctx.fillStyle = 'rgba(47,143,184,0.9)';
      ctx.fillRect(x - 1, y + h, w + 2, 1);
      ctx.fillRect(x + w, y - 1, 1, h + 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 1, y + 1, 2, 1);
      ctx.fillRect(x + 1, y + 2, 1, 1);
    }
    if (e.fogo > 0 && (tick & 2)) {
      ctx.fillStyle = 'rgba(255,106,36,0.35)';
      ctx.fillRect(x + 1, y + (h >> 1), w - 2, h >> 1);
    }
    if (e.para > 0 || e.choque > 0) {
      ctx.fillStyle = (tick & 4) ? '#fff6a0' : '#7ff2ff';
      for (let k = 0; k < 3; k++) {
        const a = ((tick * 0.4 + k * 2.1) % (Math.PI * 2));
        const px = (x + w / 2 + Math.cos(a) * (w / 2 + 1)) | 0, py = (y + h / 2 + Math.sin(a) * (h / 2 + 1)) | 0;
        ctx.fillRect(px, py, 1, 2);
        ctx.fillRect(px + 1, py + 1, 1, 1);
      }
    }
  }

  // linha do raio em cadeia: zigue-zague que pisca e some em 14 quadros
  class Relampago {
    constructor(pts) {
      this.pts = pts;
      this.life = 14;
      this.x = 0; this.y = G.VIEW_H; this.w = 0; this.h = 0;   // desenhado por cima de tudo
      this.dead = false;
    }
    update() { if (--this.life <= 0) this.dead = true; }
    draw(ctx, S, tick) {
      if (this.life < 5 && (tick & 1)) return;
      for (let k = 1; k < this.pts.length; k++) {
        const [x0, y0] = this.pts[k - 1], [x1, y1] = this.pts[k];
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
        // 4 segmentos com desvio aleatorio na perpendicular
        let ax = x0, ay = y0;
        for (let sgm = 1; sgm <= 4; sgm++) {
          const t = sgm / 4, off = sgm === 4 ? 0 : (Math.random() - 0.5) * 8;
          const bx = x0 + (x1 - x0) * t + nx * off, by = y0 + (y1 - y0) * t + ny * off;
          linhaPx(ctx, ax, ay, bx, by, '#7ff2ff', 1);
          linhaPx(ctx, ax, ay, bx, by, '#ffffff', 0);
          ax = bx; ay = by;
        }
      }
    }
  }

  function linhaPx(ctx, x0, y0, x1, y1, cor, desloc) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    ctx.fillStyle = cor;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      ctx.fillRect((x0 + (x1 - x0) * t + desloc) | 0, (y0 + (y1 - y0) * t) | 0, 1, 1);
    }
  }

  /* ================= inimigos ================= */

  class Enemy extends Ent {
    constructor(x, y, w, h, hp) {
      super(x, y, w, h);
      this.enemy = true;
      this.hp = hp; this.maxhp = hp;
      this.touch = 1;
      this.kx = 0; this.ky = 0; this.knock = 0;
      this.spd = 0.5;
      this.gelo = 0; this.fogo = 0; this.para = 0;   // efeitos das magias do mago
      this.t = (Math.random() * 120) | 0;
      this.loot = 1;
    }

    update(g) {
      if (this.hurtT > 0) this.hurtT--;
      if (this.fogo > 0) { tickFogo(g, this); if (this.dead) return; }
      if (this.choque > 0) { tickChoque(g, this); if (this.dead) return; }
      if (this.gelo > 0 || this.para > 0) {         // congelado ou paralisado: nao anda nem machuca
        if (this.gelo > 0) this.gelo--;
        if (this.para > 0) this.para--;
        this.knock = 0;
        efeitoParticulas(g, this);
        return;
      }
      this.t++;
      if (this.arrasto) {                          // voando ate a parede ou a borda da sala
        const [ax, ay] = this.arrasto, ox = this.x, oy = this.y;
        G.moveEnt(this, g.room, ax, ay, this.fly, false);
        if ((g.tick & 1) === 0) g.particles.spawn(this.cx, this.cy, -ax * 0.1, -ay * 0.1, 10, 5, 1, 0);
        if (Math.abs(this.x - ox) + Math.abs(this.y - oy) < 0.5) {
          this.arrasto = null; this.knock = 0;
          g.particles.burst(this.cx + Math.sign(ax) * this.w / 2, this.cy + Math.sign(ay) * this.h / 2, 8, 5, 1.6, 14);
          g.shake(2);
        }
      } else if (this.knock > 0) {
        this.knock--;
        G.moveEnt(this, g.room, this.kx, this.ky, this.fly, false);
        this.kx *= 0.8; this.ky *= 0.8;
      } else {
        this.step(g);
      }
      this.contact(g);
    }

    step() {}

    // flecha do arqueiro: 'triplo' = 3x o empurrao normal; 'total' = arrasta ate bater (chefe so leva o triplo)
    empurra(dx, dy, modo) {
      if (this.gelo > 0 || this.para > 0) return;   // preso no gelo ou paralisado nao sai do lugar
      if (modo === 'total' && !this.boss) {
        this.arrasto = [dx * EMPURRA_TOTAL_VEL, dy * EMPURRA_TOTAL_VEL];
        this.knock = 1;
      } else {
        this.kx = dx * 3.0 * EMPURRA_FLECHA; this.ky = dy * 3.0 * EMPURRA_FLECHA;
        this.knock = 8;
      }
    }

    move(g, dx, dy) {
      if (dx || dy) this.dir = dirFrom(dx, dy);
      G.moveEnt(this, g.room, dx, dy, this.fly, false);
      this.anim += Math.min(3, (Math.abs(dx) + Math.abs(dy)) * 2);
    }

    chase(g, spd) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      this.move(g, (dx / d) * spd, (dy / d) * spd);
    }

    contact(g) {
      if (!this.touch) return;
      for (const p of g.players) {
        if (!p.dead && this.hits(p)) p.hurt(g, this.touch, this.cx, this.cy);
      }
    }

    hurt(g, dmg, dx, dy) {
      if (this.hp <= 0) return;
      this.hp -= dmg;
      this.hurtT = 10;
      this.kx = dx * 3.0; this.ky = dy * 3.0;
      this.knock = 8;
      g.particles.burst(this.cx, this.cy, 6, 0, 2, 14);
      if (this.hp <= 0) this.die(g);
      else Sound.play('hit');
    }

    die(g) {
      this.dead = true;
      g.particles.burst(this.cx, this.cy, 16, this.gib === undefined ? 2 : this.gib, 2.2, 26, 2);
      Sound.play('kill');
      g.onEnemyDeath(this);
    }
  }
  // efeito das magias por cima do sprite do inimigo
  Enemy.prototype.draw = function (ctx, S, tick) {
    const img = this.sprite(S);
    if (this.hurtT > 0 && (tick & 2)) return;       // piscando ao tomar dano
    if (this.para > 0 && img && !this.fly) {          // treme paralisado
      const ox = this.x;
      this.x += (tick & 2) ? 1 : -1;
      Ent.prototype.draw.call(this, ctx, S, tick);
      this.x = ox;
    } else {
      Ent.prototype.draw.call(this, ctx, S, tick);
    }
    if (!img || !(this.gelo > 0 || this.fogo > 0 || this.para > 0 || this.choque > 0)) return;
    const dx = (this.cx - img.width / 2) | 0;
    const dy = this.fly ? (this.cy - img.height / 2) | 0 : (this.y + this.h - img.height + 2) | 0;
    desenhaEfeito(ctx, this, dx, dy, img.width, img.height, tick);
  };
  G.Enemy = Enemy;

  class Goblin extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 3);
      this.set = 'goblin'; this.spd = 0.62; this.gib = 3;
      this.wx = 0; this.wy = 0; this.wt = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const d = G.dist(this.cx, this.cy, p.cx, p.cy);
      if (d < 104) {
        this.chase(g, this.spd * (d < 40 ? 1.25 : 1));
      } else {
        if (this.wt-- <= 0) {
          this.wt = 30 + ((Math.random() * 50) | 0);
          const a = Math.random() * Math.PI * 2;
          this.wx = Math.cos(a) * 0.4; this.wy = Math.sin(a) * 0.4;
          if (Math.random() < 0.3) { this.wx = 0; this.wy = 0; }
        }
        this.move(g, this.wx, this.wy);
      }
    }
  }

  class Archer extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 3);
      this.set = 'archer'; this.spd = 0.5; this.cd = 60 + ((Math.random() * 60) | 0); this.gib = 8;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 56) this.move(g, -(dx / d) * this.spd, -(dy / d) * this.spd);
      else if (d > 108) this.move(g, (dx / d) * this.spd, (dy / d) * this.spd);
      else { this.dir = dirFrom(dx, dy); this.anim += 1; }

      if (this.cd-- <= 0 && d < 150) {
        this.cd = 90;
        const v = DIR_VEC[this.dir];
        g.addEnt(new Shot(this.cx - 3, this.cy - 3, v[0] * 2.1, v[1] * 2.1, 'arrow', 1, this.dir));
        Sound.play('shoot');
      }
    }
  }

  class Bat extends Enemy {
    constructor(x, y) {
      super(x, y, 10, 9, 2);
      this.frames = 'bat'; this.fly = true; this.spd = 0.85; this.gib = 8;
      this.z = (Math.random() * 60) | 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      const s = Math.sin(this.t * 0.07);
      this.move(g, (dx / d) * this.spd + s * 0.5, (dy / d) * this.spd + Math.cos(this.t * 0.09) * 0.5);
      this.anim += 4;
    }
  }

  class Ghost extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 4);
      this.frames = 'ghost'; this.fly = true; this.spd = 0.48; this.gib = 4; this.alpha = 0.85;
    }
    step(g) {
      // atravessa paredes
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      this.x += (dx / d) * this.spd;
      this.y += (dy / d) * this.spd;
      this.x = G.clamp(this.x, 4, VIEW_W - this.w - 4);
      this.y = G.clamp(this.y, 4, VIEW_H - this.h - 4);
      this.anim += 2;
      this.alpha = 0.6 + Math.sin(this.t * 0.06) * 0.25;
    }
  }

  class Slime extends Enemy {
    constructor(x, y, small) {
      super(x, y, small ? 8 : 12, small ? 7 : 10, small ? 2 : 5);
      this.frames = small ? 'slimeS' : 'slime';
      this.small = !!small;
      this.gib = 3;
      this.hop = 0; this.hx = 0; this.hy = 0;
      this.cd = 30 + ((Math.random() * 40) | 0);
    }
    step(g) {
      if (this.hop > 0) {
        this.hop--;
        this.move(g, this.hx, this.hy);
        this.anim = 8;
      } else if (this.cd-- <= 0) {
        const p = g.alvo(this);
        const dx = p.cx - this.cx, dy = p.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const s = this.small ? 1.5 : 1.15;
        this.hx = (dx / d) * s; this.hy = (dy / d) * s;
        this.hop = 22; this.cd = 46;
        this.anim = 0;
      } else {
        this.anim = 0;
      }
    }
    die(g) {
      super.die(g);
      if (!this.small) {
        for (let k = 0; k < 2; k++) {
          const s = new Slime(this.x + (k ? 6 : -6), this.y, true);
          s.x = G.clamp(s.x, 8, VIEW_W - 16);
          g.addEnt(s);
        }
      }
    }
  }

  class Skeleton extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 5);
      this.set = 'skeleton'; this.spd = 0.42; this.gib = 5; this.charge = 0;
      this.wt = 0; this.wx = 0; this.wy = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const ad = Math.abs(dx), ady = Math.abs(dy);
      if (this.charge > 0) {
        this.charge--;
        this.move(g, this.cdx * 1.7, this.cdy * 1.7);
        if (this.charge % 4 === 0) g.particles.spawn(this.cx, this.y + this.h, 0, 0, 10, 5, 1, 0);
        return;
      }
      if ((ad < 14 || ady < 14) && Math.hypot(dx, dy) < 110) {
        const d = Math.hypot(dx, dy) || 1;
        this.cdx = ad < 14 ? 0 : dx / d;
        this.cdy = ad < 14 ? dy / d : 0;
        if (ady < 14) { this.cdx = dx / d; this.cdy = 0; }
        this.charge = 34;
        this.dir = dirFrom(this.cdx, this.cdy);
        return;
      }
      if (this.wt-- <= 0) {
        this.wt = 40 + ((Math.random() * 40) | 0);
        const a = Math.random() * Math.PI * 2;
        this.wx = Math.cos(a) * this.spd; this.wy = Math.sin(a) * this.spd;
      }
      this.move(g, this.wx, this.wy);
    }
  }

  class Knight extends Enemy {
    constructor(x, y) {
      super(x, y, 12, 12, 8);
      this.set = 'knight'; this.spd = 0.55; this.touch = 2; this.gib = 5; this.loot = 2;
      this.bash = 0; this.cd = 60;
    }
    step(g) {
      if (this.bash > 0) {
        this.bash--;
        this.move(g, this.bx, this.by);
        return;
      }
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      this.chase(g, this.spd);
      if (this.cd-- <= 0 && d < 70) {
        this.cd = 110;
        this.bx = (dx / d) * 2.4; this.by = (dy / d) * 2.4;
        this.bash = 26;
        Sound.play('blocked');
      }
    }
    hurt(g, dmg, dx, dy) {
      // armadura: dano maximo 1 por golpe
      super.hurt(g, Math.min(1, dmg), dx, dy);
    }
  }

  /* ---------------- chefes ---------------- */

  class King extends Enemy {
    constructor(x, y) {
      super(x, y, 22, 20, 36);
      this.set = 'king'; this.boss = true; this.name = 'REI GOBLIN';
      this.sw = 32; this.sh = 32; this.touch = 2; this.gib = 3;
      this.state = 'idle'; this.st = 60; this.cycle = 0; this.spawned = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;

      switch (this.state) {
        case 'idle': {
          this.move(g, (dx / d) * 0.45, (dy / d) * 0.45);
          if (--this.st <= 0) {
            this.cycle++;
            const lowHp = this.hp < this.maxhp * 0.5;
            if (lowHp && this.cycle % 3 === 0 && this.spawned < 4) this.enter('summon', 40);
            else if (this.cycle % 2 === 0) this.enter('slamTell', 34);
            else this.enter('tell', 30);
          }
          break;
        }
        case 'tell': {
          this.x += Math.sin(this.st * 0.9) * 0.8;
          if (--this.st <= 0) {
            this.cdx = dx / d; this.cdy = dy / d;
            this.dir = dirFrom(this.cdx, this.cdy);
            this.enter('charge', 48);
            Sound.play('boss');
          }
          break;
        }
        case 'charge': {
          const hit = G.moveEnt(this, g.room, this.cdx * 2.6, this.cdy * 2.6, false, false);
          if (this.st % 3 === 0) g.particles.spawn(this.cx, this.y + this.h, 0, 0, 14, 5, 2, 0);
          if (hit) { g.shake(6); this.enter('rest', 40); }
          else if (--this.st <= 0) this.enter('rest', 26);
          break;
        }
        case 'slamTell': {
          if (--this.st <= 0) {
            g.shake(9);
            Sound.play('boss');
            g.particles.burst(this.cx, this.cy + 8, 22, 6, 3, 26, 2);
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              g.addEnt(new Shot(this.cx - 4, this.cy - 4, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 'rock', 1));
            }
            this.enter('rest', 40);
          }
          break;
        }
        case 'summon': {
          if (--this.st <= 0) {
            for (let k = 0; k < 2; k++) {
              const gob = new Goblin(this.cx - 20 + k * 40, this.cy + 10);
              gob.x = G.clamp(gob.x, 20, VIEW_W - 30);
              g.addEnt(gob);
              g.particles.burst(gob.cx, gob.cy, 12, 8, 2, 20);
              this.spawned++;
            }
            Sound.play('secret');
            this.enter('rest', 30);
          }
          break;
        }
        default: { // rest
          this.anim += 1;
          if (--this.st <= 0) this.enter('idle', 50 - Math.min(30, this.cycle * 3));
        }
      }
      if (this.state !== 'charge') this.anim += 1;
    }
    enter(s, t) { this.state = s; this.st = t; }
  }

  class Lich extends Enemy {
    constructor(x, y) {
      super(x, y, 20, 22, 44);
      this.set = 'lich'; this.boss = true; this.name = 'LICH DAS SOMBRAS';
      this.sw = 32; this.sh = 32; this.touch = 2; this.fly = true; this.gib = 8;
      this.state = 'float'; this.st = 70; this.cycle = 0; this.alpha = 1;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      this.anim += 1;

      switch (this.state) {
        case 'float': {
          this.x += Math.cos(this.t * 0.03) * 0.6;
          this.y += Math.sin(this.t * 0.045) * 0.4;
          this.x = G.clamp(this.x, 24, VIEW_W - this.w - 24);
          this.y = G.clamp(this.y, 24, VIEW_H - this.h - 30);
          this.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
          if (--this.st <= 0) {
            this.cycle++;
            if (this.hp < this.maxhp * 0.6 && this.cycle % 3 === 0) this.enter('ring', 30);
            else if (this.cycle % 4 === 3) this.enter('summon', 36);
            else this.enter('cast', 32);
          }
          break;
        }
        case 'cast': {
          this.alpha = 1;
          if (--this.st <= 0) {
            const base = Math.atan2(dy, dx);
            const n = this.hp < this.maxhp * 0.5 ? 5 : 3;
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.32;
              g.addEnt(new Shot(this.cx - 4, this.cy - 4, Math.cos(a) * 1.7, Math.sin(a) * 1.7, 'fire', 1));
            }
            Sound.play('shoot');
            this.enter('vanish', 26);
          }
          break;
        }
        case 'ring': {
          if (--this.st <= 0) {
            for (let k = 0; k < 12; k++) {
              const a = (k / 12) * Math.PI * 2 + this.t * 0.01;
              g.addEnt(new Shot(this.cx - 4, this.cy - 4, Math.cos(a) * 1.35, Math.sin(a) * 1.35, 'dark', 1));
            }
            Sound.play('boss');
            g.shake(5);
            this.enter('vanish', 30);
          }
          break;
        }
        case 'summon': {
          if (--this.st <= 0) {
            for (let k = 0; k < 2; k++) {
              const ex = 40 + Math.random() * (VIEW_W - 80), ey = 30 + Math.random() * (VIEW_H - 70);
              const e = Math.random() < 0.5 ? new Bat(ex, ey) : new Ghost(ex, ey);
              g.addEnt(e);
              g.particles.burst(e.cx, e.cy, 12, 8, 2, 22);
            }
            Sound.play('secret');
            this.enter('vanish', 24);
          }
          break;
        }
        case 'vanish': {
          this.alpha = Math.max(0.05, this.st / 26);
          this.touch = 0;
          if (--this.st <= 0) {
            g.particles.burst(this.cx, this.cy, 16, 8, 2.4, 24);
            this.x = 24 + Math.random() * (VIEW_W - 72);
            this.y = 24 + Math.random() * (VIEW_H - 90);
            this.enter('appear', 20);
          }
          break;
        }
        default: { // appear
          this.alpha = 1 - this.st / 20;
          if (--this.st <= 0) {
            this.alpha = 1; this.touch = 2;
            g.particles.burst(this.cx, this.cy, 14, 8, 2, 20);
            this.enter('float', 56 - Math.min(30, this.cycle * 2));
          }
        }
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.state === 'vanish' || this.state === 'appear') { Sound.play('blocked'); return; }
      super.hurt(g, dmg, dx, dy);
    }
    enter(s, t) { this.state = s; this.st = t; }
  }

  /* ---------------- inimigos novos ---------------- */

  const rnd = (n) => (Math.random() * n) | 0;

  // goblin com machado: corre ate o heroi, ergue o machado e avanca num golpe que tira 2;
  // de meia distancia arremessa o machado girando
  class Machadeiro extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 5);
      this.set = 'machadeiro'; this.spd = 0.58; this.gib = 3; this.loot = 2;
      this.estado = 'anda'; this.st = 0; this.cd = 80 + rnd(60);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (this.estado === 'prepara') {               // treme com o machado erguido
        this.x += Math.sin(this.st * 1.3) * 0.5;
        if (--this.st <= 0) { this.estado = 'golpe'; this.st = 11; this.gx = dx / d; this.gy = dy / d; Sound.play('swing'); }
        return;
      }
      if (this.estado === 'golpe') {
        this.touch = 2;
        this.move(g, this.gx * 2.3, this.gy * 2.3);
        if (--this.st <= 0) { this.estado = 'descansa'; this.st = 32; this.touch = 1; }
        return;
      }
      if (this.estado === 'descansa') { if (--this.st <= 0) this.estado = 'anda'; return; }
      if (d < 30) { this.estado = 'prepara'; this.st = 22; this.dir = dirFrom(dx, dy); return; }
      if (--this.cd <= 0 && d > 60 && d < 150) {
        this.cd = 160;
        g.addEnt(new Shot(this.cx - 3, this.cy - 3, (dx / d) * 2.2, (dy / d) * 2.2, 'machado', 1));
        Sound.play('swing');
        return;
      }
      this.chase(g, this.spd);
    }
    draw(ctx, S, tick) {
      super.draw(ctx, S, tick);
      if (this.hurtT > 0 && (tick & 2)) return;
      const lado = this.dir === 'left' ? -1 : 1;
      const hx = (this.cx + lado * 6) | 0, hy = (this.y + this.h - 11 - (this.estado === 'prepara' ? 5 : 0)) | 0;
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(hx, hy, 1, 8);
      ctx.fillStyle = '#c8cede'; ctx.fillRect(lado > 0 ? hx + 1 : hx - 3, hy, 3, 4);
      ctx.fillStyle = '#eef2ff'; ctx.fillRect(lado > 0 ? hx + 3 : hx - 3, hy, 1, 4);
    }
  }

  // goblin xama: foge de perto (teleporta), cura aliados feridos e lanca 3 orbes sombrios
  class Xama extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 4);
      this.set = 'xama'; this.spd = 0.45; this.gib = 8; this.loot = 2;
      this.cd = 70 + rnd(60); this.blinkCd = 0; this.canal = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (this.blinkCd > 0) this.blinkCd--;
      if (this.canal > 0) {                          // conjurando: particulas roxas subindo
        if ((this.canal & 3) === 0) g.particles.spawn(this.cx + (Math.random() - 0.5) * 10, this.y, 0, -0.5, 12, 8, 1, 0);
        if (--this.canal === 0) this.solta(g, dx, dy);
        return;
      }
      if (d < 36 && this.blinkCd === 0) { this.teleporta(g, p); return; }
      if (d < 70) this.move(g, -(dx / d) * this.spd, -(dy / d) * this.spd);
      else if (d > 120) this.move(g, (dx / d) * this.spd, (dy / d) * this.spd);
      else this.dir = dirFrom(dx, dy);
      if (--this.cd <= 0 && d < 170) { this.cd = 125; this.canal = 26; this.dir = dirFrom(dx, dy); }
    }
    solta(g, dx, dy) {
      if (this.soltaPropria) { this.soltaPropria(g, dx, dy); return; }
      const ferido = g.ents.find((e) => e.enemy && !e.dead && e !== this && !e.boss && e.hp < e.maxhp &&
        G.dist(e.cx, e.cy, this.cx, this.cy) < 90);
      if (ferido && Math.random() < 0.6) {
        ferido.hp = Math.min(ferido.maxhp, ferido.hp + 2);
        g.particles.burst(ferido.cx, ferido.cy, 12, 3, 1.4, 20);
        Sound.play('heal');
        return;
      }
      const base = Math.atan2(dy, dx);
      for (let k = -1; k <= 1; k++) {
        const a = base + k * 0.28;
        g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 1.6, Math.sin(a) * 1.6, 'dark', 1));
      }
      Sound.play('cast');
    }
    teleporta(g, p) {
      g.particles.burst(this.cx, this.cy, 12, 8, 2, 18);
      for (let k = 0; k < 24; k++) {
        const x = 20 + Math.random() * (VIEW_W - 50), y = 20 + Math.random() * (VIEW_H - 50);
        if (G.boxSolid(g.room, x, y, this.w, this.h, false) || G.dist(x, y, p.cx, p.cy) < 70) continue;
        this.x = x; this.y = y;
        break;
      }
      g.particles.burst(this.cx, this.cy, 12, 8, 2, 18);
      this.blinkCd = 160;
      Sound.play('cast');
    }
  }

  // cacador: arqueiro humano que mira em qualquer angulo, circula o heroi e as vezes solta rajada de 3
  class Cacador extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 4);
      this.set = 'cacador'; this.spd = 0.62; this.gib = 5; this.loot = 2;
      this.cd = 60 + rnd(60); this.rajada = 0; this.rt = 0; this.giro = Math.random() < 0.5 ? 1 : -1;
      this.velTiro = 2.8; this.danoTiro = 1; this.chanceRajada = 0.4;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (this.rajada > 0) {
        this.dir = dirFrom(dx, dy);
        if (--this.rt <= 0) {
          const sh = new Shot(this.cx - 3, this.cy - 3, (dx / d) * this.velTiro, (dy / d) * this.velTiro, 'arrow', this.danoTiro);
          sh.livre = true;                          // desenhada no angulo do tiro
          g.addEnt(sh);
          Sound.play('shoot');
          this.rajada--; this.rt = 9;
        }
        return;
      }
      if (d < 70) this.move(g, -(dx / d) * this.spd * 1.1, -(dy / d) * this.spd * 1.1);
      else if (d > 130) this.move(g, (dx / d) * this.spd, (dy / d) * this.spd);
      else this.move(g, (-dy / d) * this.spd * 0.6 * this.giro, (dx / d) * this.spd * 0.6 * this.giro);
      if (--this.cd <= 0 && d < 170) { this.cd = 115; this.rajada = Math.random() < this.chanceRajada ? 3 : 1; this.rt = 14; }
    }
  }

  // goblin bombardeiro: mantem distancia e joga bombas em arco onde o heroi esta
  class Bombardeiro extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 3);
      this.set = 'bombardeiro'; this.spd = 0.5; this.gib = 3; this.loot = 2;
      this.cd = 70 + rnd(50);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (d < 60) this.move(g, -(dx / d) * this.spd, -(dy / d) * this.spd);
      else if (d > 120) this.move(g, (dx / d) * this.spd, (dy / d) * this.spd);
      else this.dir = dirFrom(dx, dy);
      if (--this.cd <= 0 && d < 160) {
        this.cd = 140;
        g.addEnt(new Bomba(this.cx, this.cy - 4, p.cx, p.cy));
        Sound.play('swing');
      }
    }
  }

  // aranha: rapida, anda em zigue-zague e da botes
  class Aranha extends Enemy {
    constructor(x, y) {
      super(x, y, 10, 8, 2);
      this.frames = 'aranha'; this.spd = 0.9; this.gib = 8;
      this.salto = 0; this.cd = 40 + rnd(40);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (this.salto > 0) { this.salto--; this.move(g, this.sx, this.sy); this.anim += 4; return; }
      if (--this.cd <= 0 && d < 80) { this.cd = 70; this.salto = 14; this.sx = (dx / d) * 3; this.sy = (dy / d) * 3; return; }
      const zz = Math.sin(this.t * 0.15) * 0.6;
      this.move(g, (dx / d) * this.spd - (dy / d) * zz, (dy / d) * this.spd + (dx / d) * zz);
      this.anim += 3;
    }
  }

  // golem de pedra: lento, 14 de vida, nao e empurrado, pisa no chao soltando uma onda
  class Golem extends Enemy {
    constructor(x, y) {
      super(x, y, 18, 18, 14);
      this.set = 'golem'; this.spd = 0.3; this.touch = 2; this.gib = 5; this.loot = 3;
      this.cd = 60; this.pisa = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const d = G.dist(this.cx, this.cy, p.cx, p.cy);
      if (this.pisa > 0) {
        this.x += Math.sin(this.pisa * 1.1) * 0.6;
        if (--this.pisa === 0) {
          g.addEnt(new OndaInimiga(this.cx, this.y + this.h, 48, 2));
          g.shake(5);
          Sound.play('boss');
          this.cd = 120;
        }
        return;
      }
      if (--this.cd <= 0 && d < 46) { this.pisa = 32; return; }
      this.chase(g, this.spd);
    }
    hurt(g, dmg, dx, dy) { super.hurt(g, dmg, dx, dy); this.knock = 0; }   // pedra nao sai do lugar
    empurra() {}
  }

  /* ---------------- ataques de area dos inimigos ---------------- */

  // bomba: voa em arco ate o alvo, o pavio queima 0,7 s e explode (2 de dano num raio de 22 px)
  class Bomba extends Ent {
    constructor(x0, y0, x1, y1) {
      super(x0 - 4, y0 - 4, 8, 8);
      this.x0 = x0; this.y0 = y0;
      this.x1 = G.clamp(x1, 12, VIEW_W - 12); this.y1 = G.clamp(y1, 12, VIEW_H - 12);
      this.t = 0; this.voo = 36; this.pavio = 42; this.alt = 0;
    }
    update(g) {
      this.anim++;
      if (this.t < this.voo) {
        const k = ++this.t / this.voo;
        this.x = G.lerp(this.x0, this.x1, k) - 4; this.y = G.lerp(this.y0, this.y1, k) - 4;
        this.alt = Math.sin(k * Math.PI) * 22;
        return;
      }
      this.alt = 0;
      if (--this.pavio > 0) {
        if ((this.pavio & 3) === 0) g.particles.spawn(this.cx + 1, this.y, 0, -0.4, 8, 1, 1, 0);
        return;
      }
      this.dead = true;
      g.particles.burst(this.cx, this.cy, 22, 9, 2.6, 22, 2);
      g.particles.burst(this.cx, this.cy, 10, 5, 1.6, 26);
      g.shake(5);
      Sound.play('fire');
      for (const p of g.players) if (!p.dead && G.dist(p.cx, p.cy, this.cx, this.cy) < 22) p.hurt(g, 2, this.cx, this.cy);
    }
    draw(ctx, S, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      if (this.t >= this.voo) {                      // area da explosao piscando
        ctx.fillStyle = (tick & 4) ? 'rgba(255,80,40,0.55)' : 'rgba(255,200,80,0.35)';
        for (let k = 0; k < 28; k++) {
          const a = (k / 28) * Math.PI * 2;
          ctx.fillRect((cx + Math.cos(a) * 22) | 0, (cy + Math.sin(a) * 22 * 0.7) | 0, 1, 1);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(cx - 3, cy + 3, 7, 2);
      ctx.drawImage(S.bomba[(this.anim >> 2) & 1], cx - 4, (cy - 5 - this.alt) | 0);
    }
  }

  // onda de impacto no chao (golem e troll): um anel que cresce; rolar por cima escapa
  class OndaInimiga extends Ent {
    constructor(x, y, rmax, dmg) {
      super(x, y, 0, 0);
      this.ox = x; this.oy = y; this.r = 4; this.rmax = rmax; this.dmg = dmg;
      this.atingidos = new Set();
    }
    update(g) {
      this.r += 2.2;
      for (const p of g.players) {
        if (p.dead || this.atingidos.has(p)) continue;
        const d = Math.hypot(p.cx - this.ox, (p.y + p.h - 2 - this.oy) / 0.6);
        if (Math.abs(d - this.r) < 6) { this.atingidos.add(p); p.hurt(g, this.dmg, this.ox, this.oy); }
      }
      if ((g.tick & 1) === 0) {
        const a = Math.random() * Math.PI * 2;
        g.particles.spawn(this.ox + Math.cos(a) * this.r, this.oy + Math.sin(a) * this.r * 0.6, 0, -0.3, 10, 5, 1, 0);
      }
      if (this.r >= this.rmax) this.dead = true;
    }
    draw(ctx) {
      const a = Math.max(0, 1 - this.r / this.rmax);
      ctx.fillStyle = 'rgba(214,190,140,' + (0.35 + a * 0.5).toFixed(2) + ')';
      const n = Math.max(16, (this.r * 1.2) | 0);
      for (let k = 0; k < n; k++) {
        const t = (k / n) * Math.PI * 2;
        ctx.fillRect((this.ox + Math.cos(t) * this.r) | 0, (this.oy + Math.sin(t) * this.r * 0.6) | 0, 2, 1);
      }
    }
  }

  // raio do arquimago: um circulo pisca no chao e, 0,75 s depois, o raio cai ali
  class Marca extends Ent {
    constructor(x, y, dmg) { super(x - 8, y - 8, 16, 16); this.t = 46; this.dmg = dmg; }
    update(g) {
      if (--this.t === 0) {
        for (const p of g.players) if (!p.dead && G.dist(p.cx, p.cy, this.cx, this.cy) < 13) p.hurt(g, this.dmg, this.cx, this.cy - 20);
        g.particles.burst(this.cx, this.cy, 16, 1, 2.2, 16);
        g.shake(3);
        Sound.play('goldhit');
      }
      if (this.t < -10) this.dead = true;
    }
    draw(ctx, S, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      if (this.t > 0) {
        ctx.fillStyle = (tick & 4) || this.t < 16 ? '#ffd34d' : '#ff8a3d';
        for (let k = 0; k < 20; k++) {
          const a = (k / 20) * Math.PI * 2;
          ctx.fillRect((cx + Math.cos(a) * 10) | 0, (cy + Math.sin(a) * 7) | 0, 1, 1);
        }
        ctx.fillRect(cx, cy, 1, 1);
        return;
      }
      let x = cx, y = cy - 70;
      while (y < cy) {                                // raio em zigue-zague de cima ate o chao
        const nx = cx + ((Math.random() - 0.5) * 8) | 0, ny = Math.min(cy, y + 10);
        linhaPx(ctx, x, y, nx, ny, '#fff6a0', 1);
        linhaPx(ctx, x, y, nx, ny, '#ffffff', 0);
        x = nx; y = ny;
      }
    }
  }

  /* ---------------- chefes novos (mundo aberto) ---------------- */

  // GROK: giro com o machado, arremesso em leque e grito que chama machadeiros
  class Grok extends Enemy {
    constructor(x, y) {
      super(x, y, 22, 20, 34);
      this.set = 'grok'; this.boss = true; this.name = 'GROK, O MACHADEIRO';
      this.touch = 2; this.gib = 3; this.loot = 3; this.premio = 'container';
      this.state = 'idle'; this.st = 60; this.cycle = 0; this.spawned = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      const furioso = this.hp < this.maxhp * 0.5;
      switch (this.state) {
        case 'idle':
          this.chase(g, furioso ? 0.62 : 0.5);
          if (--this.st <= 0) {
            this.cycle++;
            if (furioso && this.cycle % 3 === 0 && this.spawned < 4) this.enter('grito', 40);
            else if (this.cycle % 2) this.enter('prepGiro', 30);
            else this.enter('arremesso', 24);
          }
          break;
        case 'prepGiro':
          this.x += Math.sin(this.st * 0.9) * 0.8;
          if (--this.st <= 0) { this.enter('giro', 80); Sound.play('spin'); }
          break;
        case 'giro': {
          const v = furioso ? 1.35 : 1.05;
          this.move(g, (dx / d) * v, (dy / d) * v);
          this.dir = ['down', 'left', 'up', 'right'][(this.st >> 2) & 3];
          this.touch = 3;
          if ((this.st & 7) === 0) { g.particles.burst(this.cx, this.cy, 4, 0, 2, 10); Sound.play('swing'); }
          if (--this.st <= 0) { this.touch = 2; this.enter('rest', 40); }
          break;
        }
        case 'arremesso':
          if (--this.st <= 0) {
            const base = Math.atan2(dy, dx), n = furioso ? 5 : 3;
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.35;
              g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 'machado', 1));
            }
            Sound.play('swing');
            this.enter('rest', 30);
          }
          break;
        case 'grito':
          this.x += Math.sin(this.st * 1.2) * 0.6;
          if (--this.st <= 0) {
            for (let k = 0; k < 2; k++) {
              const m = new Machadeiro(G.clamp(this.cx - 30 + k * 60, 20, VIEW_W - 30), G.clamp(this.cy, 20, VIEW_H - 30));
              g.addEnt(m);
              g.particles.burst(m.cx, m.cy, 12, 8, 2, 20);
            }
            this.spawned += 2;
            g.shake(6);
            Sound.play('boss');
            this.enter('rest', 30);
          }
          break;
        default:
          if (--this.st <= 0) this.enter('idle', 60 - Math.min(30, this.cycle * 3));
      }
      if (this.state !== 'giro') this.anim += 1;
    }
    enter(s, t) { this.state = s; this.st = t; }
  }

  // TROLL: salta sobre o heroi e cai soltando uma onda, arremessa pedras e treme o chao
  class Troll extends Enemy {
    constructor(x, y) {
      super(x, y, 24, 22, 50);
      this.set = 'troll'; this.boss = true; this.name = 'TROLL DA FLORESTA';
      this.touch = 2; this.gib = 5; this.loot = 3; this.premio = 'container';
      this.state = 'idle'; this.st = 70; this.cycle = 0; this.alt = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      const furioso = this.hp < this.maxhp * 0.5;
      switch (this.state) {
        case 'idle':
          this.chase(g, furioso ? 0.55 : 0.4);
          if (--this.st <= 0) {
            this.cycle++;
            const r = this.cycle % 3;
            this.enter(r === 1 ? 'agacha' : r === 2 ? 'pedras' : 'tremor', 30);
          }
          break;
        case 'agacha':
          this.x += Math.sin(this.st * 1.1) * 0.7;
          if (--this.st <= 0) {
            this.sx = this.x; this.sy = this.y;
            this.tx = G.clamp(p.cx - this.w / 2, 20, VIEW_W - this.w - 20);
            this.ty = G.clamp(p.cy - this.h / 2, 20, VIEW_H - this.h - 20);
            this.enter('salto', furioso ? 32 : 40);
            this.dur = this.st;
            Sound.play('swing');
          }
          break;
        case 'salto': {
          const k = 1 - this.st / this.dur;
          this.x = G.lerp(this.sx, this.tx, k); this.y = G.lerp(this.sy, this.ty, k);
          this.alt = Math.sin(k * Math.PI) * 34;
          this.touch = 0;
          if (--this.st <= 0) {
            this.alt = 0; this.touch = 2;
            g.addEnt(new OndaInimiga(this.cx, this.y + this.h, 76, 2));
            g.particles.burst(this.cx, this.y + this.h, 24, 5, 3, 26, 2);
            g.shake(10);
            Sound.play('boss');
            this.enter(furioso && !this.dobro ? 'agacha' : 'rest', furioso && !this.dobro ? 16 : 44);
            this.dobro = furioso && !this.dobro;      // furioso: pula duas vezes seguidas
          }
          break;
        }
        case 'pedras':
          if (--this.st <= 0) {
            const base = Math.atan2(dy, dx), n = furioso ? 5 : 3;
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.3;
              g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 1.7, Math.sin(a) * 1.7, 'rock', 2));
            }
            Sound.play('hit');
            this.enter('rest', 34);
          }
          break;
        case 'tremor':
          if ((this.st & 3) === 0) g.shake(2);
          if (--this.st <= 0) {
            g.addEnt(new OndaInimiga(this.cx, this.y + this.h, 96, 1));
            Sound.play('boss');
            this.enter('rest', 30);
          }
          break;
        default:
          if (--this.st <= 0) this.enter('idle', 64 - Math.min(30, this.cycle * 3));
      }
      this.anim += 1;
    }
    draw(ctx, S, tick) {
      if (this.alt > 0) {                             // sombra no chao enquanto voa
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect((this.cx - 10) | 0, (this.y + this.h - 1) | 0, 20, 3);
      }
      const y = this.y;
      this.y -= this.alt;
      super.draw(ctx, S, tick);
      this.y = y;
    }
    enter(s, t) { this.state = s; this.st = t; }
  }

  // ARQUIMAGO: some e reaparece, rajada e anel de fogo, raios marcados no chao, chama xamas
  class Arquimago extends Enemy {
    constructor(x, y) {
      super(x, y, 20, 22, 46);
      this.set = 'arquimago'; this.boss = true; this.name = 'ARQUIMAGO SOMBRIO';
      this.touch = 2; this.fly = true; this.gib = 9; this.loot = 3; this.premio = 'container';
      this.state = 'flutua'; this.st = 70; this.cycle = 0; this.spawned = 0; this.alpha = 1;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const furioso = this.hp < this.maxhp * 0.5;
      this.anim += 1;
      switch (this.state) {
        case 'flutua':
          this.x += Math.cos(this.t * 0.03) * 0.6;
          this.y += Math.sin(this.t * 0.045) * 0.4;
          this.x = G.clamp(this.x, 24, VIEW_W - this.w - 24);
          this.y = G.clamp(this.y, 24, VIEW_H - this.h - 30);
          this.dir = dirFrom(dx, dy);
          if (--this.st <= 0) {
            this.cycle++;
            if (furioso && this.cycle % 4 === 0 && this.spawned < 4) this.enter('invoca', 36);
            else this.enter(['rajada', 'anel', 'raios'][this.cycle % 3], 30);
          }
          break;
        case 'rajada':
          if (--this.st <= 0) {
            const base = Math.atan2(dy, dx), n = furioso ? 7 : 5;
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.22;
              g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 1.9, Math.sin(a) * 1.9, 'fire', 1));
            }
            Sound.play('fire');
            this.enter('some', 26);
          }
          break;
        case 'anel':
          if (--this.st <= 0) {
            const voltas = furioso ? 2 : 1;
            for (let v = 0; v < voltas; v++) {
              for (let k = 0; k < 12; k++) {
                const a = (k / 12) * Math.PI * 2 + v * 0.26;
                const vel = 1.3 + v * 0.45;
                g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * vel, Math.sin(a) * vel, 'fire', 1));
              }
            }
            g.shake(5);
            Sound.play('boss');
            this.enter('some', 30);
          }
          break;
        case 'raios':
          if (--this.st <= 0) {
            for (const o of g.players) if (!o.dead) g.addEnt(new Marca(o.cx, o.cy, 2));
            const extra = furioso ? 4 : 2;
            for (let k = 0; k < extra; k++) {
              g.addEnt(new Marca(p.cx + (Math.random() - 0.5) * 70, p.cy + (Math.random() - 0.5) * 50, 2));
            }
            Sound.play('cast');
            this.enter('flutua', 60);
          }
          break;
        case 'invoca':
          if (--this.st <= 0) {
            for (let k = 0; k < 2; k++) {
              const e = new Xama(30 + Math.random() * (VIEW_W - 60), 30 + Math.random() * (VIEW_H - 60));
              g.addEnt(e);
              g.particles.burst(e.cx, e.cy, 12, 8, 2, 22);
            }
            this.spawned += 2;
            Sound.play('secret');
            this.enter('some', 24);
          }
          break;
        case 'some':
          this.alpha = Math.max(0.05, this.st / 26);
          this.touch = 0;
          if (--this.st <= 0) {
            g.particles.burst(this.cx, this.cy, 16, 9, 2.4, 24);
            this.x = 24 + Math.random() * (VIEW_W - 72);
            this.y = 24 + Math.random() * (VIEW_H - 90);
            this.enter('aparece', 20);
          }
          break;
        default:
          this.alpha = 1 - this.st / 20;
          if (--this.st <= 0) {
            this.alpha = 1; this.touch = 2;
            g.particles.burst(this.cx, this.cy, 14, 9, 2, 20);
            this.enter('flutua', 60 - Math.min(30, this.cycle * 2));
          }
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.state === 'some' || this.state === 'aparece') { Sound.play('blocked'); return; }
      super.hurt(g, dmg, dx, dy);
    }
    enter(s, t) { this.state = s; this.st = t; }
  }

  /* ---------------- pantano ---------------- */

  // sapo: pula ate perto e da uma linguada (40 px)
  class Sapo extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 9, 3);
      this.frames = 'sapo'; this.gib = 3;
      this.hop = 0; this.cd = 30 + rnd(40); this.lingua = 0; this.lk = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (this.lingua > 0) {
        this.lingua--;
        this.lk = this.lingua > 8 ? (16 - this.lingua) / 8 : this.lingua / 8;
        const tx = this.cx + this.lx * 40 * this.lk, ty = this.cy + this.ly * 40 * this.lk;
        for (const q of g.players) if (!q.dead && G.dist(q.cx, q.cy, tx, ty) < 8) q.hurt(g, 1, this.cx, this.cy);
        this.anim = 0;
        return;
      }
      if (this.hop > 0) { this.hop--; this.move(g, this.hx, this.hy); this.anim = 8; return; }
      this.anim = 0;
      if (--this.cd <= 0) {
        if (d < 44) { this.lingua = 16; this.lx = dx / d; this.ly = dy / d; this.cd = 60; Sound.play('swing'); }
        else { this.hx = (dx / d) * 1.6; this.hy = (dy / d) * 1.6; this.hop = 18; this.cd = 40 + rnd(30); }
      }
    }
    draw(ctx, S, tick) {
      super.draw(ctx, S, tick);
      if (this.lingua > 0) desenhaLingua(ctx, this.cx, this.cy, this.lx, this.ly, 40 * this.lk);
    }
  }

  function desenhaLingua(ctx, x, y, vx, vy, len) {
    linhaPx(ctx, x, y + 1, x + vx * len, y + 1 + vy * len, '#b83a5a', 0);
    linhaPx(ctx, x, y, x + vx * len, y + vy * len, '#f07a9a', 0);
    ctx.fillStyle = '#f07a9a';
    ctx.fillRect((x + vx * len - 1) | 0, (y + vy * len - 1) | 0, 3, 3);
  }

  // mosquito gigante: voa em zigue-zague e da picadas rapidas
  class Mosquito extends Enemy {
    constructor(x, y) {
      super(x, y, 9, 7, 2);
      this.frames = 'mosquito'; this.fly = true; this.spd = 1.0; this.gib = 8;
      this.cd = 60 + rnd(60); this.dash = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim += 6;
      if (this.dash > 0) { this.dash--; this.move(g, this.sx, this.sy); return; }
      if (--this.cd <= 0 && d < 90) { this.cd = 80; this.dash = 16; this.sx = (dx / d) * 3.2; this.sy = (dy / d) * 3.2; Sound.play('swing'); return; }
      const a = this.t * 0.2;
      this.move(g, (dx / d) * this.spd + Math.cos(a) * 0.9, (dy / d) * this.spd + Math.sin(a * 1.3) * 0.9);
    }
  }

  // bruxa do pantano: joga frascos de veneno (deixam uma poca) e chama mosquitos
  class Bruxa extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 5);
      this.set = 'bruxa'; this.spd = 0.5; this.gib = 3; this.loot = 2;
      this.cd = 80 + rnd(40); this.chamou = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (d < 70) this.move(g, -(dx / d) * this.spd, -(dy / d) * this.spd);
      else if (d > 130) this.move(g, (dx / d) * this.spd, (dy / d) * this.spd);
      else this.dir = dirFrom(dx, dy);
      if (--this.cd <= 0 && d < 170) {
        this.cd = 150;
        if (this.chamou < 2 && Math.random() < 0.3) {
          for (let k = 0; k < 2; k++) {
            const m = new Mosquito(this.cx - 12 + k * 24, this.cy - 10);
            g.addEnt(m);
            g.particles.burst(m.cx, m.cy, 8, 3, 1.4, 16);
          }
          this.chamou += 2;
          Sound.play('cast');
        } else {
          g.addEnt(new Frasco(this.cx, this.cy - 4, p.cx, p.cy));
          Sound.play('swing');
        }
      }
    }
  }

  // frasco de veneno: voa em arco e quebra numa poca que machuca quem pisa
  class Frasco extends Ent {
    constructor(x0, y0, x1, y1) {
      super(x0 - 3, y0 - 3, 6, 6);
      this.x0 = x0; this.y0 = y0;
      this.x1 = G.clamp(x1, 20, VIEW_W - 20); this.y1 = G.clamp(y1, 16, VIEW_H - 16);
      this.t = 0; this.voo = 32; this.alt = 0;
    }
    update(g) {
      const k = ++this.t / this.voo;
      this.x = G.lerp(this.x0, this.x1, k) - 3; this.y = G.lerp(this.y0, this.y1, k) - 3;
      this.alt = Math.sin(k * Math.PI) * 20;
      if (this.t < this.voo) return;
      this.dead = true;
      g.ents.push(new PocaVeneno(this.x1, this.y1));
      g.particles.burst(this.x1, this.y1, 14, 3, 1.6, 18);
      Sound.play('hit');
    }
    draw(ctx, S, tick) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect((this.cx - 2) | 0, (this.cy + 2) | 0, 5, 2);
      const x = (this.cx - 2) | 0, y = (this.cy - 3 - this.alt) | 0;
      ctx.fillStyle = '#c8cede'; ctx.fillRect(x + 1, y, 2, 2);
      ctx.fillStyle = '#7fd858'; ctx.fillRect(x, y + 2, 4, 4);
      ctx.fillStyle = '#e0ffc0'; ctx.fillRect(x, y + 2, 1, 1);
    }
  }

  class PocaVeneno extends Ent {
    constructor(x, y) {
      super(x, y - 60, 0, 0);                       // y baixo: desenhada por baixo de todos
      this.ox = x; this.oy = y; this.t = 210;
    }
    update(g) {
      if (--this.t <= 0) { this.dead = true; return; }
      if (this.t % 30 === 0) {
        for (const p of g.players) {
          const ex = (p.cx - this.ox) / 18, ey = (p.y + p.h - 2 - this.oy) / 10;
          if (!p.dead && ex * ex + ey * ey < 1) p.hurt(g, 1, this.ox, this.oy);
        }
      }
      if ((g.tick & 7) === 0) g.particles.spawn(this.ox + (Math.random() - 0.5) * 30, this.oy + (Math.random() - 0.5) * 14, 0, -0.3, 14, 3, 1, 0);
    }
    draw(ctx) {
      const a = Math.min(1, this.t / 40);
      ctx.fillStyle = 'rgba(90,180,60,' + (0.45 * a).toFixed(2) + ')';
      for (let dy = -9; dy <= 9; dy++) {
        const w = Math.round(18 * Math.sqrt(1 - (dy / 10) * (dy / 10)));
        ctx.fillRect((this.ox - w) | 0, (this.oy + dy) | 0, w * 2, 1);
      }
      ctx.fillStyle = 'rgba(200,255,160,' + (0.6 * a).toFixed(2) + ')';
      ctx.fillRect((this.ox - 6) | 0, (this.oy - 2) | 0, 2, 2);
      ctx.fillRect((this.ox + 5) | 0, (this.oy + 3) | 0, 2, 2);
    }
  }

  /* ---------------- castelo ---------------- */

  // lanceiro: alinha com o heroi e da uma estocada longa com a lanca
  class Lanceiro extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 6);
      this.set = 'lanceiro'; this.spd = 0.5; this.gib = 5; this.loot = 2;
      this.estado = 'anda'; this.st = 0; this.ex = 0; this.ey = 1;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (this.estado === 'prepara') { if (--this.st <= 0) { this.estado = 'estoca'; this.st = 14; Sound.play('swing'); } return; }
      if (this.estado === 'estoca') {
        this.touch = 2;
        this.move(g, this.ex * 3, this.ey * 3);
        this.dir = dirFrom(this.ex, this.ey);
        if (--this.st <= 0) { this.estado = 'descansa'; this.st = 30; this.touch = 1; }
        return;
      }
      if (this.estado === 'descansa') { if (--this.st <= 0) this.estado = 'anda'; return; }
      if ((Math.abs(dx) < 12 || Math.abs(dy) < 12) && d < 84) {
        if (Math.abs(dx) < 12) { this.ex = 0; this.ey = Math.sign(dy); } else { this.ex = Math.sign(dx); this.ey = 0; }
        this.dir = dirFrom(this.ex, this.ey);
        this.estado = 'prepara'; this.st = 18;
        return;
      }
      this.chase(g, this.spd);
    }
    draw(ctx, S, tick) {
      super.draw(ctx, S, tick);
      if (this.hurtT > 0 && (tick & 2)) return;
      const v = DIR_VEC[this.dir] || [0, 1];
      const len = this.estado === 'estoca' ? 17 : this.estado === 'prepara' ? 5 : 11;
      const x0 = this.cx - v[0] * 4 + (v[1] ? 5 : 0), y0 = this.cy - v[1] * 4 + (v[0] ? 1 : 0);
      linhaPx(ctx, x0, y0, x0 + v[0] * len, y0 + v[1] * len, '#8a6337', 0);
      ctx.fillStyle = '#eef2ff';
      ctx.fillRect((x0 + v[0] * len - 1) | 0, (y0 + v[1] * len - 1) | 0, 3, 3);
    }
  }

  // besteiro: o cacador do castelo, com virote mais forte e sem rajada
  class Besteiro extends Cacador {
    constructor(x, y) {
      super(x, y);
      this.set = 'besteiro'; this.hp = this.maxhp = 5;
      this.velTiro = 3.4; this.danoTiro = 2; this.chanceRajada = 0;
    }
  }

  // feiticeiro: anel de 6 orbes sombrios ou levanta um esqueleto (ate 2)
  class Feiticeiro extends Xama {
    constructor(x, y) {
      super(x, y);
      this.set = 'feiticeiro'; this.hp = this.maxhp = 6; this.levantou = 0;
    }
    soltaPropria(g, dx, dy) {
      if (this.levantou < 2 && Math.random() < 0.35) {
        const e = new Skeleton(G.clamp(this.cx + (Math.random() - 0.5) * 50, 20, VIEW_W - 30), G.clamp(this.cy + 20, 20, VIEW_H - 30));
        g.addEnt(e);
        g.particles.burst(e.cx, e.cy, 14, 8, 1.8, 20);
        this.levantou++;
        Sound.play('secret');
        return;
      }
      const base = Math.atan2(dy, dx);
      for (let k = 0; k < 6; k++) {
        const a = base + (k / 6) * Math.PI * 2;
        g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 'dark', 1));
      }
      Sound.play('cast');
    }
  }

  // gargula: parece estatua (nao leva dano) ate o heroi chegar perto; ai acorda, voa e mergulha
  class Gargula extends Enemy {
    constructor(x, y) {
      super(x, y, 14, 12, 7);
      this.frames = 'gargula'; this.gib = 5; this.loot = 2;
      this.acordada = false; this.st = 0; this.touch = 0; this.spd = 0.8; this.mergulho = 0; this.cd = 60;
    }
    sprite(S) { return S.gargula[this.acordada ? 1 + ((this.anim >> 3) & 1) : 0]; }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (!this.acordada) {
        if (d < 56 || this.st > 0) {
          this.st++;
          this.x += (this.st & 2) ? 0.5 : -0.5;
          if (this.st > 24) {
            this.acordada = true; this.fly = true; this.touch = 1;
            Sound.play('boss');
            g.particles.burst(this.cx, this.cy, 12, 5, 1.6, 18);
          }
        }
        return;
      }
      this.anim += 4;
      if (this.mergulho > 0) { this.mergulho--; this.move(g, this.sx, this.sy); return; }
      if (--this.cd <= 0 && d < 110) { this.cd = 90; this.mergulho = 20; this.sx = (dx / d) * 2.8; this.sy = (dy / d) * 2.8; Sound.play('swing'); return; }
      const a = this.t * 0.05;
      this.move(g, (dx / d) * this.spd * 0.6 + Math.cos(a) * 0.8, (dy / d) * this.spd * 0.6 + Math.sin(a) * 0.8);
    }
    hurt(g, dmg, dx, dy) {
      if (!this.acordada) { Sound.play('blocked'); if (this.st === 0) this.st = 1; return; }
      super.hurt(g, dmg, dx, dy);
    }
    empurra(dx, dy, modo) { if (this.acordada) super.empurra(dx, dy, modo); }
  }

  /* ---------------- chefes do pantano ---------------- */

  // REI SAPO: salta e cai com onda, linguada longa, cospe veneno, coaxa chamando sapos
  class ReiSapo extends Enemy {
    constructor(x, y) {
      super(x, y, 28, 22, 42);
      this.set = 'reiSapo'; this.boss = true; this.name = 'REI SAPO';
      this.touch = 2; this.gib = 3; this.loot = 3; this.premio = 'container';
      this.state = 'idle'; this.st = 60; this.cycle = 0; this.alt = 0; this.spawned = 0; this.lingua = 0; this.lk = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      const furioso = this.hp < this.maxhp * 0.5;
      this.anim = this.state === 'salto' ? 8 : 0;
      switch (this.state) {
        case 'idle':
          this.chase(g, furioso ? 0.5 : 0.35);
          if (--this.st <= 0) {
            this.cycle++;
            if (furioso && this.cycle % 4 === 0 && this.spawned < 4) this.enter('coaxa', 30);
            else this.enter(['agacha', 'lingua', 'cuspe'][this.cycle % 3], this.cycle % 3 === 1 ? 20 : 26);
            this.lx = dx / d; this.ly = dy / d;
          }
          break;
        case 'agacha':
          this.x += Math.sin(this.st * 1.1) * 0.6;
          if (--this.st <= 0) {
            this.sx = this.x; this.sy = this.y;
            this.tx = G.clamp(p.cx - this.w / 2, 20, VIEW_W - this.w - 20);
            this.ty = G.clamp(p.cy - this.h / 2, 20, VIEW_H - this.h - 20);
            this.enter('salto', 36); this.dur = 36;
            Sound.play('swing');
          }
          break;
        case 'salto': {
          const k = 1 - this.st / this.dur;
          this.x = G.lerp(this.sx, this.tx, k); this.y = G.lerp(this.sy, this.ty, k);
          this.alt = Math.sin(k * Math.PI) * 30;
          this.touch = 0;
          if (--this.st <= 0) {
            this.alt = 0; this.touch = 2;
            g.addEnt(new OndaInimiga(this.cx, this.y + this.h, 64, 2));
            g.particles.burst(this.cx, this.y + this.h, 18, 3, 2.6, 22, 2);
            g.shake(8);
            Sound.play('boss');
            this.enter('rest', 36);
          }
          break;
        }
        case 'lingua':
          if (this.st > 0) { this.st--; if (this.st === 0) { this.lingua = 24; Sound.play('swing'); } break; }
          this.lingua--;
          this.lk = this.lingua > 12 ? (24 - this.lingua) / 12 : this.lingua / 12;
          {
            const tx = this.cx + this.lx * 96 * this.lk, ty = this.cy + this.ly * 96 * this.lk;
            for (const q of g.players) if (!q.dead && G.dist(q.cx, q.cy, tx, ty) < 10) q.hurt(g, 2, this.cx, this.cy);
          }
          if (this.lingua <= 0) this.enter('rest', 24);
          break;
        case 'cuspe':
          if (--this.st <= 0) {
            const base = Math.atan2(dy, dx), n = furioso ? 7 : 5;
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.24;
              g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 1.8, Math.sin(a) * 1.8, 'veneno', 1));
            }
            Sound.play('shoot');
            this.enter('rest', 30);
          }
          break;
        case 'coaxa':
          if ((this.st & 7) === 0) g.shake(2);
          if (--this.st <= 0) {
            for (let k = 0; k < 2; k++) {
              const s2 = new Sapo(G.clamp(this.cx - 40 + k * 80, 20, VIEW_W - 30), G.clamp(this.cy + 10, 20, VIEW_H - 30));
              g.addEnt(s2);
              g.particles.burst(s2.cx, s2.cy, 10, 3, 1.6, 18);
            }
            this.spawned += 2;
            Sound.play('boss');
            this.enter('rest', 30);
          }
          break;
        default:
          if (--this.st <= 0) this.enter('idle', 50 - Math.min(24, this.cycle * 2));
      }
    }
    draw(ctx, S, tick) {
      if (this.alt > 0) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect((this.cx - 12) | 0, (this.y + this.h - 1) | 0, 24, 3); }
      const y = this.y;
      this.y -= this.alt;
      super.draw(ctx, S, tick);
      this.y = y;
      if (this.state === 'lingua' && this.lingua > 0) desenhaLingua(ctx, this.cx, this.cy + 2, this.lx, this.ly, 96 * this.lk);
    }
    enter(s, t) { this.state = s; this.st = t; }
  }

  // HIDRA: tres cabecas cospem veneno; mergulha e reaparece em outro lugar soltando uma onda
  class Hidra extends Enemy {
    constructor(x, y) {
      super(x, y, 36, 22, 64);
      this.boss = true; this.name = 'HIDRA DO PANTANO';
      this.touch = 2; this.fly = true; this.gib = 3; this.loot = 3; this.premio = 'container';
      this.state = 'nada'; this.st = 70; this.cycle = 0; this.fundo = 0; this.cab = 0;
      this.dirx = 0; this.diry = 0;
    }
    sprite() { return null; }
    cabeca(i, tick) {                                // posicao de cada cabeca, balancando
      const off = (i - 1) * 13, tt = (tick || this.t) * 0.06 + i * 2;
      return [this.cx + off + Math.sin(tt) * 3, this.y - 12 - (i === 1 ? 6 : 0) + Math.cos(tt * 1.3) * 2 + this.fundo];
    }
    step(g) {
      const p = g.alvo(this);
      const furioso = this.hp < this.maxhp * 0.5;
      switch (this.state) {
        case 'nada':
          if (this.t % 60 === 0) { const a = Math.random() * Math.PI * 2; this.dirx = Math.cos(a) * 0.4; this.diry = Math.sin(a) * 0.3; }
          this.x = G.clamp(this.x + this.dirx, 24, VIEW_W - this.w - 24);
          this.y = G.clamp(this.y + this.diry, 40, VIEW_H - this.h - 20);
          if (--this.st <= 0) {
            this.cycle++;
            if (this.cycle % 3 === 0) this.enter('afunda', 30);
            else { this.enter('cospe', 0); this.cab = 0; this.cospeT = 0; }
          }
          break;
        case 'cospe':                                  // cada cabeca cospe em sequencia
          if (--this.cospeT <= 0) {
            const [hx, hy] = this.cabeca(this.cab);
            const base = Math.atan2(p.cy - hy, p.cx - hx), n = furioso ? 5 : 3;
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.2;
              g.addEnt(new Shot(hx - 3, hy - 3, Math.cos(a) * 1.9, Math.sin(a) * 1.9, 'veneno', 1));
            }
            Sound.play('shoot');
            this.cab++;
            this.cospeT = furioso ? 12 : 18;
            if (this.cab >= 3) this.enter('nada', furioso ? 40 : 60);
          }
          break;
        case 'afunda':                                 // some na agua: nao leva dano
          this.fundo = Math.min(24, this.fundo + 1);
          this.touch = 0;
          if ((this.st & 3) === 0) g.particles.spawn(this.cx + (Math.random() - 0.5) * 30, this.y + this.h, 0, -0.5, 16, 4, 1, 0);
          if (--this.st <= 0) {
            this.x = 30 + Math.random() * (VIEW_W - 60 - this.w);
            this.y = 50 + Math.random() * (VIEW_H - 80 - this.h);
            this.enter('emerge', 24);
          }
          break;
        case 'emerge':
          this.fundo = Math.max(0, this.fundo - 1);
          if (--this.st <= 0) {
            this.fundo = 0; this.touch = 2;
            g.addEnt(new OndaInimiga(this.cx, this.y + this.h, furioso ? 90 : 70, 2));
            g.particles.burst(this.cx, this.y + this.h, 22, 4, 2.6, 22, 2);
            g.shake(7);
            Sound.play('boss');
            this.enter('nada', 40);
          }
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.state === 'afunda' || this.state === 'emerge') { Sound.play('blocked'); return; }
      super.hurt(g, dmg, dx, dy);
      this.knock = 0;
    }
    draw(ctx, S, tick) {
      if (this.hurtT > 0 && (tick & 2)) return;
      const x = this.x | 0, y = (this.y + this.fundo) | 0, w = this.w, h = this.h;
      const cor = '#3f7a3a', esc = '#2a5a28', clr = '#6aa85a';
      // agua em volta
      ctx.fillStyle = 'rgba(47,74,58,0.6)';
      ctx.fillRect(x - 6, (this.y + h - 4) | 0, w + 12, 8);
      if (this.fundo < 20) {
        // corpo
        ctx.fillStyle = esc; ctx.fillRect(x, y + 4, w, h - 4);
        ctx.fillStyle = cor; ctx.fillRect(x + 2, y + 2, w - 4, h - 8);
        ctx.fillStyle = clr; ctx.fillRect(x + 6, y + 4, w - 12, 3);
        for (let k = 0; k < 4; k++) { ctx.fillStyle = '#e6c878'; ctx.fillRect(x + 6 + k * 7, y + 1, 3, 3); }
        // pescocos e cabecas
        for (let i = 0; i < 3; i++) {
          const [hx0, hy0] = this.cabeca(i, tick);
          const hx = hx0 | 0, hy = (hy0) | 0;
          linhaPx(ctx, this.cx + (i - 1) * 8, y + 4, hx, hy + 3, esc, 1);
          linhaPx(ctx, this.cx + (i - 1) * 8, y + 4, hx, hy + 3, cor, 0);
          linhaPx(ctx, this.cx + (i - 1) * 8 + 1, y + 4, hx + 1, hy + 3, cor, 0);
          ctx.fillStyle = esc; ctx.fillRect(hx - 4, hy - 2, 9, 7);
          ctx.fillStyle = cor; ctx.fillRect(hx - 3, hy - 1, 7, 5);
          ctx.fillStyle = '#ff4d4d'; ctx.fillRect(hx - 2, hy, 1, 1); ctx.fillRect(hx + 2, hy, 1, 1);
          ctx.fillStyle = '#e6e4d8'; ctx.fillRect(hx - 2, hy + 3, 1, 2); ctx.fillRect(hx + 2, hy + 3, 1, 2);
        }
      }
      desenhaEfeito(ctx, this, x, y, w, h, tick);
    }
    enter(s, t) { this.state = s; this.st = t; }
  }

  /* ---------------- chefes do castelo ---------------- */

  // CAVALEIRO NEGRO: armadura (no maximo 3 de dano por golpe), investidas, giro com a espada e ondas
  class CavaleiroNegro extends Enemy {
    constructor(x, y) {
      super(x, y, 18, 20, 48);
      this.set = 'cavNegro'; this.boss = true; this.name = 'CAVALEIRO NEGRO';
      this.touch = 2; this.gib = 5; this.loot = 3; this.premio = 'container';
      this.state = 'idle'; this.st = 50; this.cycle = 0; this.ang = 0; this.combo = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      const furioso = this.hp < this.maxhp * 0.5;
      this.anim += 1;
      switch (this.state) {
        case 'idle':
          this.chase(g, furioso ? 0.85 : 0.65);
          this.ang = Math.atan2(dy, dx);
          if (--this.st <= 0) {
            this.cycle++;
            this.combo = furioso ? 2 : 1;
            this.enter(['prepara', 'giro', 'ondas'][this.cycle % 3], this.cycle % 3 === 1 ? 70 : 18);
          }
          break;
        case 'prepara':
          this.x += Math.sin(this.st * 1.2) * 0.6;
          this.ang = Math.atan2(dy, dx) + Math.PI;           // espada para tras
          if (--this.st <= 0) { this.cdx = dx / d; this.cdy = dy / d; this.enter('investida', 24); Sound.play('swing'); }
          break;
        case 'investida': {
          this.touch = 3;
          const hit = G.moveEnt(this, g.room, this.cdx * 3.4, this.cdy * 3.4, false, false);
          this.dir = dirFrom(this.cdx, this.cdy);
          this.ang = Math.atan2(this.cdy, this.cdx);
          if ((this.st & 2) === 0) g.particles.spawn(this.cx, this.y + this.h, 0, 0, 12, 8, 2, 0);
          if (hit || --this.st <= 0) {
            this.touch = 2;
            if (hit) g.shake(5);
            if (--this.combo > 0) this.enter('prepara', 12); else this.enter('rest', 34);
          }
          break;
        }
        case 'giro':
          this.touch = 3;
          this.ang += 0.35;
          this.move(g, (dx / d) * 0.7, (dy / d) * 0.7);
          if ((this.st & 7) === 0) Sound.play('swing');
          if (--this.st <= 0) { this.touch = 2; this.enter('rest', 30); }
          break;
        case 'ondas':
          if (--this.st <= 0) {
            const base = Math.atan2(dy, dx), n = furioso ? 5 : 3;
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.3;
              g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 'dark', 2));
            }
            Sound.play('shoot');
            this.enter('rest', 26);
          }
          break;
        default:
          if (--this.st <= 0) this.enter('idle', 50 - Math.min(24, this.cycle * 2));
      }
    }
    hurt(g, dmg, dx, dy) { super.hurt(g, Math.min(3, dmg), dx, dy); this.knock = Math.min(this.knock, 3); }
    draw(ctx, S, tick) {
      super.draw(ctx, S, tick);
      if (this.hurtT > 0 && (tick & 2)) return;
      const hx = this.cx, hy = this.cy - 2, ca = Math.cos(this.ang), sa = Math.sin(this.ang);
      linhaPx(ctx, hx + ca * 4, hy + sa * 4, hx + ca * 24, hy + sa * 24, '#c8cede', 1);
      linhaPx(ctx, hx + ca * 4, hy + sa * 4, hx + ca * 24, hy + sa * 24, '#eef2ff', 0);
      ctx.fillStyle = '#e84c3d'; ctx.fillRect((hx + ca * 4 - 1) | 0, (hy + sa * 4 - 1) | 0, 3, 3);
    }
    enter(s, t) { this.state = s; this.st = t; }
  }

  // REI SOMBRIO: foices giratorias, pilares de raio, anel de sombras, chama guardas e teleporta
  class ReiSombrio extends Enemy {
    constructor(x, y) {
      super(x, y, 22, 24, 90);
      this.set = 'reiSombrio'; this.boss = true; this.name = 'REI SOMBRIO';
      this.touch = 2; this.gib = 8; this.loot = 5; this.premio = 'container';
      this.state = 'anda'; this.st = 60; this.cycle = 0; this.spawned = 0; this.alpha = 1;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      const furioso = this.hp < this.maxhp * 0.5;
      this.anim += 1;
      switch (this.state) {
        case 'anda':
          this.chase(g, furioso ? 0.65 : 0.45);
          if (--this.st <= 0) {
            this.cycle++;
            if (this.cycle % 5 === 0 && this.spawned < 4) this.enter('invoca', 34);
            else this.enter(['foices', 'pilares', 'anel', 'some'][this.cycle % 4], 26);
          }
          break;
        case 'foices':
          if (--this.st <= 0) {
            const base = Math.atan2(dy, dx), n = furioso ? 5 : 3;
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.35;
              g.addEnt(new Shot(this.cx - 4, this.cy - 4, Math.cos(a) * 2.1, Math.sin(a) * 2.1, 'foice', 2));
            }
            Sound.play('spin');
            this.enter('anda', furioso ? 40 : 56);
          }
          break;
        case 'pilares':
          if (--this.st <= 0) {
            for (const o of g.players) if (!o.dead) g.addEnt(new Marca(o.cx, o.cy, 2));
            for (let k = 0, n = furioso ? 7 : 4; k < n; k++) {
              g.addEnt(new Marca(30 + Math.random() * (VIEW_W - 60), 30 + Math.random() * (VIEW_H - 60), 2));
            }
            Sound.play('cast');
            this.enter('anda', 50);
          }
          break;
        case 'anel':
          if (--this.st <= 0) {
            for (let v = 0, nv = furioso ? 2 : 1; v < nv; v++) {
              for (let k = 0; k < 16; k++) {
                const a = (k / 16) * Math.PI * 2 + v * 0.2;
                g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * (1.3 + v * 0.5), Math.sin(a) * (1.3 + v * 0.5), 'dark', 1));
              }
            }
            g.shake(6);
            Sound.play('boss');
            this.enter('anda', 44);
          }
          break;
        case 'invoca':
          if (--this.st <= 0) {
            for (let k = 0; k < 2; k++) {
              const e = k ? new Besteiro(40 + Math.random() * (VIEW_W - 80), 40) : new Lanceiro(40 + Math.random() * (VIEW_W - 80), VIEW_H - 50);
              g.addEnt(e);
              g.particles.burst(e.cx, e.cy, 12, 8, 2, 20);
            }
            this.spawned += 2;
            Sound.play('secret');
            this.enter('anda', 40);
          }
          break;
        case 'some':
          this.alpha = Math.max(0.05, this.st / 26);
          this.touch = 0;
          if (--this.st <= 0) {
            g.particles.burst(this.cx, this.cy, 18, 8, 2.4, 24);
            this.x = G.clamp(p.cx + (Math.random() < 0.5 ? -70 : 70) - this.w / 2, 24, VIEW_W - this.w - 24);
            this.y = G.clamp(p.cy - 30, 24, VIEW_H - this.h - 24);
            this.enter('aparece', 20);
          }
          break;
        default:                                         // aparece
          this.alpha = 1 - this.st / 20;
          if (--this.st <= 0) {
            this.alpha = 1; this.touch = 2;
            g.particles.burst(this.cx, this.cy, 16, 8, 2, 20);
            this.enter('foices', 10);
          }
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.state === 'some' || this.state === 'aparece') { Sound.play('blocked'); return; }
      super.hurt(g, dmg, dx, dy);
      this.knock = Math.min(this.knock, 3);
    }
    enter(s, t) { this.state = s; this.st = t; }
  }

  /* ================= projeteis ================= */

  class Shot extends Ent {
    constructor(x, y, vx, vy, kind, dmg, dir) {
      super(x, y, 6, 6);
      this.vx = vx; this.vy = vy; this.kind = kind; this.dmg = dmg || 1;
      this.life = 260; this.shot = true;
      this.friendly = false; this.pierce = 0; this.elem = null; this.atingidos = null;
      this.dir = dir || dirFrom(vx, vy);
      this.fly = false;
    }
    update(g) {
      this.x += this.vx; this.y += this.vy;
      this.anim += 2;
      if (--this.life <= 0) { this.dead = true; return; }
      if (this.x < -8 || this.y < -8 || this.x > VIEW_W + 8 || this.y > VIEW_H + 8) { this.dead = true; return; }
      if (G.boxSolid(g.room, this.x + 1, this.y + 1, 4, 4, true)) {
        this.burst(g); return;
      }

      if (this.friendly) {
        const alvos = g.alvos(this.dono);
        for (let i = 0; i < alvos.length; i++) {
          const e = alvos[i];
          if (e.dead) continue;
          if (this.atingidos && this.atingidos.indexOf(e) >= 0) continue;
          if (!this.hits(e)) continue;
          const d = Math.hypot(this.vx, this.vy) || 1;
          G.ferir(g, e, this.dmg, this.vx / d, this.vy / d, this.dono);
          if (this.elem) {
            G.aplicaElemento(g, e, this.elem, this.dono);
            if (this.elem.id === 'raio') G.raioEmCadeia(g, e, this.dmg, this.dono);
          }
          if (this.pierce > 0) {
            this.pierce--;
            (this.atingidos = this.atingidos || []).push(e);
            g.particles.burst(this.cx, this.cy, 5, this.elem ? this.elem.cor : 5, 1.4, 12);
          } else {
            this.burst(g);
            return;
          }
        }
      } else {
        for (const p of g.players) {
          if (!p.dead && this.hits(p)) { p.hurt(g, this.dmg, this.cx, this.cy); this.burst(g); return; }
        }
      }

      if (this.kind === 'fire' || this.kind === 'fireball' || this.kind === 'dark') {
        if ((g.tick & 3) === 0) g.particles.spawn(this.cx, this.cy, 0, 0, 12, this.kind === 'dark' ? 8 : 9, 1, 0);
      } else if (this.elem && (g.tick & 3) === 0) {
        g.particles.spawn(this.cx, this.cy, 0, 0, 10, this.elem.cor, 1, 0);
      }
    }
    burst(g) {
      this.dead = true;
      const cor = this.elem ? this.elem.cor : this.kind === 'fire' ? 9 : this.kind === 'dark' || this.kind === 'foice' ? 8 : this.kind === 'veneno' ? 3 : 5;
      g.particles.burst(this.cx, this.cy, 8, cor, 1.8, 16);
    }
    draw(ctx, S) {
      let img;
      if (this.kind === 'arrow') {
        // flecha do jogador gira no angulo do tiro; a dos inimigos usa as 4 direcoes
        if (this.friendly || this.livre) {
          const n = S.bladeSteps, step = (Math.PI * 2) / n;
          const a = Math.atan2(this.vy, this.vx);
          img = S.shaft[((Math.round(a / step) % n) + n) % n];
        } else img = S.arrow[this.dir];
      } else if (this.kind === 'machado') img = S.machado[(this.anim >> 2) & 3];
      else if (this.kind === 'foice') img = S.foice[(this.anim >> 2) & 3];
      else if (S[this.kind]) img = S[this.kind][this.frame() % S[this.kind].length];
      else if (this.kind === 'fire') img = S.fireball[this.frame()];
      else if (this.kind === 'dark') img = S.darkorb[this.frame()];
      else img = S.rock[this.frame()];
      ctx.drawImage(img, (this.cx - img.width / 2) | 0, (this.cy - img.height / 2) | 0);
    }
  }
  G.Shot = Shot;

  /* ================= flecha do arqueiro ================= */

  // Flecha com rastro proprio: cada eco guarda onde a flecha esteve, com que
  // tamanho e quanto de vida ainda tem. Eles somem um por vez, enquanto a
  // flecha segue encolhendo ate o fim do alcance.
  class Arrow extends Ent {
    constructor(x, y, vx, vy, opt) {
      super(x - 3, y - 3, 6, 6);
      this.vx = vx; this.vy = vy;
      this.dmg = opt.dmg;
      this.range = opt.range;
      this.shrink = opt.shrink || opt.range;   // onde a flecha termina de encolher
      this.scale0 = opt.scale0;
      this.echoLife = opt.echoLife;
      this.pierce = opt.pierce || 0;
      this.empurrao = opt.empurrao || null;     // 'triplo' ou 'total'
      this.friendly = true; this.shot = true;
      this.ang = Math.atan2(vy, vx);
      this.speed = Math.hypot(vx, vy);
      this.traveled = 0;
      this.spent = false;
      this.atingidos = [];
      this.ex = new Float32Array(ARROW_ECHO);
      this.ey = new Float32Array(ARROW_ECHO);
      this.es = new Float32Array(ARROW_ECHO);
      this.el = new Float32Array(ARROW_ECHO);
      this.en = 0;
    }

    escala() {
      const k = Math.min(1, this.traveled / this.shrink);
      return this.scale0 + (ARROW_SCALE_END - this.scale0) * k;
    }

    pushEcho() {
      if (this.en >= ARROW_ECHO) {
        for (let i = 1; i < this.en; i++) {
          this.ex[i - 1] = this.ex[i]; this.ey[i - 1] = this.ey[i];
          this.es[i - 1] = this.es[i]; this.el[i - 1] = this.el[i];
        }
        this.en--;
      }
      this.ex[this.en] = this.cx; this.ey[this.en] = this.cy;
      this.es[this.en] = this.escala(); this.el[this.en] = this.echoLife;
      this.en++;
    }

    ageEchos() {
      for (let i = 0; i < this.en; i++) this.el[i] -= 1;
      let drop = 0;
      while (drop < this.en && this.el[drop] <= 0) drop++;
      if (drop) {
        for (let i = drop; i < this.en; i++) {
          this.ex[i - drop] = this.ex[i]; this.ey[i - drop] = this.ey[i];
          this.es[i - drop] = this.es[i]; this.el[i - drop] = this.el[i];
        }
        this.en -= drop;
      }
    }

    gastar(g, poof) {
      if (this.spent) return;
      this.spent = true;
      if (poof) g.particles.burst(this.cx, this.cy, 6, 5, 1.2, 12);
    }

    update(g) {
      this.ageEchos();
      if (this.spent) {                        // ja parou: so os ecos terminam de sumir
        if (this.en === 0) this.dead = true;
        return;
      }

      this.pushEcho();
      this.x += this.vx; this.y += this.vy;
      this.traveled += this.speed;

      if (this.x < -10 || this.y < -10 || this.x > VIEW_W + 10 || this.y > VIEW_H + 10) { this.gastar(g, false); return; }
      if (G.boxSolid(g.room, this.x + 1, this.y + 1, 4, 4, true)) { this.gastar(g, true); return; }

      const alvos = g.alvos(this.dono);
      for (let i = 0; i < alvos.length; i++) {
        const e = alvos[i];
        if (e.dead || this.atingidos.indexOf(e) >= 0) continue;
        if (!this.hits(e)) continue;
        G.ferir(g, e, this.dmg, this.vx / this.speed, this.vy / this.speed, this.dono);
        if (this.empurrao && !e.dead && e.empurra) e.empurra(this.vx / this.speed, this.vy / this.speed, this.empurrao);
        this.atingidos.push(e);
        if (this.pierce > 0) this.pierce--;
        else { this.gastar(g, true); return; }
      }

      if (this.traveled >= this.range) this.gastar(g, true);
    }

    draw(ctx, S) {
      const n = S.bladeSteps, step = (Math.PI * 2) / n;
      const img = S.shaft[((Math.round(this.ang / step) % n) + n) % n];
      const w = img.width, h = img.height;

      // ecos: o mais velho quase apagado, sumindo um por vez
      for (let i = 0; i < this.en; i++) {
        const a = this.el[i] / this.echoLife;
        if (a <= 0) continue;
        const sc = this.es[i];
        ctx.globalAlpha = 0.5 * a * a;
        ctx.drawImage(img, (this.ex[i] - w * sc / 2) | 0, (this.ey[i] - h * sc / 2) | 0, (w * sc) | 0, (h * sc) | 0);
      }
      ctx.globalAlpha = 1;

      if (!this.spent) {
        const sc = this.escala();
        ctx.drawImage(img, (this.cx - w * sc / 2) | 0, (this.cy - h * sc / 2) | 0, (w * sc) | 0, (h * sc) | 0);
      }
    }
  }
  G.Arrow = Arrow;

  /* ================= flecha dourada do arqueiro ================= */

  // Persegue o inimigo vivo mais proximo que ainda nao atingiu, vira aos poucos
  // na direcao dele e atravessa paredes. A cada acerto escolhe o proximo alvo;
  // quando nao sobra ninguem na sala, some num brilho.
  class GoldArrow extends Ent {
    constructor(x, y, vx, vy, dmg) {
      super(x - 4, y - 4, 8, 8);
      this.vx = vx; this.vy = vy;
      this.dmg = dmg;
      this.friendly = true; this.shot = true;
      this.ang = Math.atan2(vy, vx);
      this.alvo = null;
      this.atingidos = new Set();
      this.life = GOLD_LIFE;
      this.livre = 0;                          // distancia voada sem alvo
      this.spent = false;
      this.ex = new Float32Array(GOLD_ECHO);
      this.ey = new Float32Array(GOLD_ECHO);
      this.ea = new Float32Array(GOLD_ECHO);
      this.en = 0;
    }

    procurar(g) {
      let best = null, bd = Infinity;
      const alvos = g.alvos(this.dono);
      for (let i = 0; i < alvos.length; i++) {
        const e = alvos[i];
        if (e.dead || this.atingidos.has(e)) continue;
        const d = (e.cx - this.cx) ** 2 + (e.cy - this.cy) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    pushEcho() {
      if (this.en >= GOLD_ECHO) {
        for (let i = 1; i < this.en; i++) {
          this.ex[i - 1] = this.ex[i]; this.ey[i - 1] = this.ey[i]; this.ea[i - 1] = this.ea[i];
        }
        this.en--;
      }
      this.ex[this.en] = this.cx; this.ey[this.en] = this.cy; this.ea[this.en] = this.ang;
      this.en++;
    }

    sumir(g) {
      this.spent = true;
      g.particles.burst(this.cx, this.cy, 18, 1, 1.8, 20);
      g.particles.burst(this.cx, this.cy, 6, 0, 1.2, 14);
    }

    update(g) {
      if (this.spent) {                        // rastro termina de sumir
        if (this.en > 0) {
          for (let i = 1; i < this.en; i++) {
            this.ex[i - 1] = this.ex[i]; this.ey[i - 1] = this.ey[i]; this.ea[i - 1] = this.ea[i];
          }
          this.en--;
        }
        if (this.en === 0) this.dead = true;
        return;
      }

      if (--this.life <= 0) { this.sumir(g); return; }

      if (!this.alvo || this.alvo.dead) this.alvo = this.procurar(g);
      if (this.alvo) {
        const want = Math.atan2(this.alvo.cy - this.cy, this.alvo.cx - this.cx);
        let d = want - this.ang;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const dist = Math.hypot(this.alvo.cx - this.cx, this.alvo.cy - this.cy);
        // perto do alvo vira na hora, senao ficaria orbitando em volta dele
        const turn = dist < 24 ? Math.PI : GOLD_TURN;
        this.ang += Math.max(-turn, Math.min(turn, d));
      } else {
        this.livre += GOLD_SPD;
        if (this.atingidos.size > 0 || this.livre >= GOLD_FREE) { this.sumir(g); return; }
      }

      this.pushEcho();
      this.vx = Math.cos(this.ang) * GOLD_SPD;
      this.vy = Math.sin(this.ang) * GOLD_SPD;
      this.x += this.vx; this.y += this.vy;
      if ((g.tick & 1) === 0) {
        g.particles.spawn(this.cx + (Math.random() - 0.5) * 4, this.cy + (Math.random() - 0.5) * 4,
          -this.vx * 0.15, -this.vy * 0.15, 14, Math.random() < 0.7 ? 1 : 0, 1, 0);
      }

      // acerta qualquer inimigo que cruzar o caminho, uma vez cada
      const alvos = g.alvos(this.dono);
      for (let i = 0; i < alvos.length; i++) {
        const e = alvos[i];
        if (e.dead || this.atingidos.has(e)) continue;
        if (!this.hits(e)) continue;
        this.atingidos.add(e);
        G.ferir(g, e, this.dmg, this.vx / GOLD_SPD, this.vy / GOLD_SPD, this.dono);
        Sound.play('goldhit');
        g.particles.burst(this.cx, this.cy, 10, 1, 2, 16);
        if (e === this.alvo) this.alvo = null;
      }
    }

    draw(ctx, S) {
      const n = S.bladeSteps, step = (Math.PI * 2) / n;
      const pick = (a) => S.goldShaft[((Math.round(a / step) % n) + n) % n];
      const sc = 2;

      for (let i = 0; i < this.en; i++) {
        const img = pick(this.ea[i]);
        const w = img.width * sc, h = img.height * sc;
        const a = (i + 1) / (this.en + 1);
        ctx.globalAlpha = 0.45 * a * a;
        ctx.drawImage(img, (this.ex[i] - w / 2) | 0, (this.ey[i] - h / 2) | 0, w | 0, h | 0);
      }
      ctx.globalAlpha = 1;

      if (!this.spent) {
        const img = pick(this.ang);
        const w = img.width * sc, h = img.height * sc;
        ctx.drawImage(img, (this.cx - w / 2) | 0, (this.cy - h / 2) | 0, w | 0, h | 0);
      }
    }
  }
  G.GoldArrow = GoldArrow;

  /* ================= onda de choque do arqueiro ================= */

  // Circulo que cresce a partir do heroi ate cobrir a sala. Tudo que ele
  // alcanca morre na hora; chefes so levam dano e sobrevivem.
  const WAVE_SPEED = 4.2;
  const WAVE_MAX = 330;                        // maior que a diagonal da sala

  class Wave extends Ent {
    constructor(x, y) {
      super(x - 2, y - 2, 4, 4);
      this.ox = x; this.oy = y;
      this.r = 4;
      this.atingidos = [];
      this.wave = true;
    }

    update(g) {
      this.r += WAVE_SPEED;

      const alvos = g.alvos(this.dono);
      for (let i = 0; i < alvos.length; i++) {
        const e = alvos[i];
        if (e.dead || this.atingidos.indexOf(e) >= 0) continue;
        if (G.dist(this.ox, this.oy, e.cx, e.cy) > this.r) continue;

        this.atingidos.push(e);
        const a = Math.atan2(e.cy - this.oy, e.cx - this.ox);
        // ignora armadura e fases intangiveis; chefe leva 1/3, jogador (VS) leva PVP_WAVE
        const dmg = e instanceof Player ? PVP_WAVE : e.boss ? Math.max(1, Math.ceil(e.maxhp / 3)) : 999;
        G.ferirBruto(g, e, dmg, Math.cos(a), Math.sin(a), this.dono);
        if (e.boss) g.particles.burst(e.cx, e.cy, 12, 3, 2, 20);
      }

      // faiscas correndo pela borda do circulo
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2;
        g.particles.spawn(this.ox + Math.cos(a) * this.r, this.oy + Math.sin(a) * this.r,
          Math.cos(a) * 0.6, Math.sin(a) * 0.6, 12, k === 0 ? 0 : 3, 1, 0);
      }

      if (this.r >= WAVE_MAX) this.dead = true;
    }

    draw(ctx) {
      const k = 1 - this.r / WAVE_MAX;
      const aneis = [
        [this.r, 2, 'rgba(255,255,255,'],
        [this.r - 4, 2, 'rgba(127,216,88,'],
        [this.r - 9, 1, 'rgba(90,167,255,']
      ];
      for (let i = 0; i < aneis.length; i++) {
        const rr = aneis[i][0];
        if (rr <= 1) continue;
        ctx.lineWidth = aneis[i][1];
        ctx.strokeStyle = aneis[i][2] + (Math.max(0, k) * (i === 0 ? 0.95 : 0.6)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(this.ox, this.oy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
  }
  G.Wave = Wave;

  /* ================= bola de fogo do heroi ================= */

  // meteoro do mago: desce do alto da tela ate o centro da sala; no impacto a tela fica
  // branca, volta com fade e todos os inimigos morrem (chefe leva 1/3 da vida, como na bola de fogo)
  const METEORO_QUEDA = 54;                     // quadros ate o impacto
  class Meteoro extends Ent {
    constructor(tx, ty) {
      super(tx - 60, -40, 16, 16);
      this.tx = tx; this.ty = ty; this.sx = tx - 60; this.sy = -40;
      this.t = 0;
    }
    get cx() { return this.x; }
    get cy() { return this.y; }
    update(g) {
      this.t++;
      const k = this.t / METEORO_QUEDA, e = k * k;               // acelera caindo
      this.x = G.lerp(this.sx, this.tx, e); this.y = G.lerp(this.sy, this.ty, e);
      for (let n = 0; n < 3; n++) {
        g.particles.spawn(this.x + (Math.random() - 0.5) * 10, this.y + (Math.random() - 0.5) * 10,
          -1.1 + Math.random() * 0.4, -1.6 + Math.random() * 0.4, 14 + Math.random() * 12, Math.random() < 0.6 ? 9 : 1, 2, 0);
      }
      if ((this.t & 7) === 0) Sound.play('fire');
      if (this.t < METEORO_QUEDA) return;
      this.dead = true;
      g.novaBlast(this.tx, this.ty, this.dono);
      g.telaBranca();
      g.shake(16);
    }
    draw(ctx, S, tick) {
      const k = this.t / METEORO_QUEDA;
      // sombra crescendo no ponto de impacto
      const r = 4 + k * 22;
      ctx.fillStyle = 'rgba(0,0,0,' + (0.15 + k * 0.3).toFixed(2) + ')';
      ctx.fillRect((this.tx - r) | 0, (this.ty - r * 0.35) | 0, (r * 2) | 0, Math.max(1, (r * 0.7) | 0));
      const img = S.bigfire[(tick >> 2) % 3];
      const tam = 24 + ((k * 16) | 0);
      ctx.drawImage(img, (this.x - tam / 2) | 0, (this.y - tam / 2) | 0, tam, tam);
    }
  }
  G.Meteoro = Meteoro;

  class Fireball extends Ent {
    constructor(x, y, vx, vy) {
      super(x, y, 14, 14);
      this.vx = vx; this.vy = vy;
      this.life = 130;
      this.friendly = true;
    }
    update(g) {
      this.anim += 2;
      this.x += this.vx; this.y += this.vy;

      for (let k = 0; k < 2; k++) {
        g.particles.spawn(this.cx + (Math.random() - 0.5) * 10, this.cy + (Math.random() - 0.5) * 10,
          -this.vx * 0.2, -this.vy * 0.2, 10 + Math.random() * 12, Math.random() < 0.5 ? 9 : 1, 2, 0);
      }

      if (--this.life <= 0) return this.detonate(g);
      if (this.x < -12 || this.y < -12 || this.x > VIEW_W + 12 || this.y > VIEW_H + 12) return this.detonate(g);
      if (G.boxSolid(g.room, this.x + 3, this.y + 3, 8, 8, true)) return this.detonate(g);
      const alvos = g.alvos(this.dono);
      for (let i = 0; i < alvos.length; i++) {
        const e = alvos[i];
        if (!e.dead && this.hits(e)) return this.detonate(g);
      }
    }
    detonate(g) {
      this.dead = true;
      g.novaBlast(this.cx, this.cy, this.dono);
    }
    draw(ctx, S) {
      const img = S.bigfire[(this.anim >> 2) % 3];
      ctx.drawImage(img, (this.cx - 8) | 0, (this.cy - 8) | 0);
    }
  }
  G.Fireball = Fireball;

  /* ================= itens ================= */

  const PICK_W = { coin: 8, gem: 8, heart: 8, key: 8, container: 16, shard: 14 };

  class Pickup extends Ent {
    constructor(x, y, kind) {
      super(x - 4, y - 4, 8, 8);
      this.kind = kind; this.pickup = true;
      this.life = kind === 'coin' || kind === 'heart' ? 600 : 100000;
      this.pop = 10;
      this.vx = (Math.random() - 0.5) * 1.4; this.vy = -1.4;
      const w = PICK_W[kind] || 8;
      this.w = w; this.h = w;
    }
    update(g) {
      this.anim += 1;
      if (this.pop > 0) {
        this.pop--;
        this.x += this.vx; this.y += this.vy;
        this.vy += 0.16;
        this.x = G.clamp(this.x, 6, VIEW_W - this.w - 6);
        this.y = G.clamp(this.y, 6, VIEW_H - this.h - 6);
      }
      if (--this.life <= 0) { this.dead = true; return; }
      const p = g.alvo(this);
      const d = G.dist(this.cx, this.cy, p.cx, p.cy);
      if (d < 26 && this.pop <= 0) {
        const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
        const s = 1.6;
        this.x += Math.cos(a) * s; this.y += Math.sin(a) * s;
      }
      if (!p.dead && this.hits(p)) { g.collect(this, p); this.dead = true; }
    }
    draw(ctx, S, tick) {
      if (this.life < 120 && (tick & 4)) return;
      let img;
      switch (this.kind) {
        case 'coin': img = S.coin[(this.anim >> 3) % 4]; break;
        case 'gem': img = S.coin[(this.anim >> 2) % 4]; break;
        case 'heart': img = S.heart; break;
        case 'key': img = S.key; break;
        case 'container': img = S.container; break;
        default: img = S.shard;
      }
      const bob = Math.sin(this.anim * 0.1) * 1.5;
      ctx.drawImage(img, (this.cx - img.width / 2) | 0, (this.cy - img.height / 2 + bob) | 0);
    }
  }
  G.Pickup = Pickup;

  class Chest extends Ent {
    constructor(tx, ty, item, needClear) {
      super(tx * TILE, ty * TILE, 16, 14);
      this.chest = true; this.item = item; this.needClear = !!needClear;
      this.open = false;
    }
    update(g) {
      if (!this.open && g.players.some((p) => !p.dead && this.hits(p))) this.tryOpen(g);
    }
    tryOpen(g) {
      if (this.open) return;
      if (this.needClear && g.ents.some((e) => e.enemy && !e.dead)) {
        if (g.tick % 30 === 0) g.say('DERROTE TODOS OS INIMIGOS');
        return;
      }
      this.open = true;
      Sound.play('secret');
      g.particles.burst(this.cx, this.cy - 4, 18, 1, 2, 30);
      g.giveItem(this.item, this.cx, this.cy);
    }
    draw(ctx, S) {
      ctx.drawImage(S.chest[this.open ? 1 : 0], this.x | 0, (this.y - 2) | 0);
    }
  }
  G.Chest = Chest;

  /* ================= fabrica ================= */

  G.spawnEnemy = function (type, x, y) {
    switch (type) {
      case 'goblin': return new Goblin(x, y);
      case 'archer': return new Archer(x, y);
      case 'bat': return new Bat(x, y);
      case 'slime': return new Slime(x, y, false);
      case 'skeleton': return new Skeleton(x, y);
      case 'knight': return new Knight(x, y);
      case 'ghost': return new Ghost(x, y);
      case 'king': return new King(x, y);
      case 'lich': return new Lich(x, y);
      case 'machadeiro': return new Machadeiro(x, y);
      case 'xama': return new Xama(x, y);
      case 'cacador': return new Cacador(x, y);
      case 'bombardeiro': return new Bombardeiro(x, y);
      case 'aranha': return new Aranha(x, y);
      case 'golem': return new Golem(x, y);
      case 'grok': return new Grok(x, y);
      case 'troll': return new Troll(x, y);
      case 'arquimago': return new Arquimago(x, y);
      case 'sapo': return new Sapo(x, y);
      case 'mosquito': return new Mosquito(x, y);
      case 'bruxa': return new Bruxa(x, y);
      case 'lanceiro': return new Lanceiro(x, y);
      case 'besteiro': return new Besteiro(x, y);
      case 'feiticeiro': return new Feiticeiro(x, y);
      case 'gargula': return new Gargula(x, y);
      case 'reisapo': return new ReiSapo(x, y);
      case 'hidra': return new Hidra(x, y);
      case 'cavnegro': return new CavaleiroNegro(x, y);
      case 'reisombrio': return new ReiSombrio(x, y);
      default: return new Goblin(x, y);
    }
  };
})(window.AURUM = window.AURUM || {});
