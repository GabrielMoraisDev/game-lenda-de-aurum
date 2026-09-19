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
    // corrente de almas (C do necromante): o mesmo dano chega em todos os ligados
    const elo = g.elo;
    if (elo && !elo.dead && !elo.prop && elo.alvos.has(e)) {
      elo.prop = true;
      const f0 = g.fonteDano;
      g.fonteDano = elo.fonte || f0;
      for (const o of elo.alvos) {
        if (o === e || o.dead) continue;
        G.ferir(g, o, dmg, 0, 0, elo.dono);
        g.particles.burst(o.cx, o.cy, 4, 8, 1, 10);
      }
      g.fonteDano = f0;
      elo.prop = false;
    }
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
      e.fogoFonte = g.fonteDano || null;           // qual especial acendeu (nao recarrega ele mesmo)
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

  // VS: o dano causado no oponente libera X, C e V de quem bateu (1 ponto de vida = 1 abate)
  G.danoNoOponente = function (g, alvo, autor, n) {
    if (!autor || autor === alvo || !(autor instanceof Player) || n <= 0 || g.modo() !== 'vs') return;
    if (autor.carrega(n, g.fonteDano) && autor === g.player) g.cdPulse = 10;
  };

  // no VS todo F causa no oponente 2x o dano de uma espada comum (meios-coracoes)
  const PVP_F = 2;
  G.PVP_F = PVP_F;

  // golpe final dos F: monstro morre, chefe leva 1/3 da vida, oponente no VS leva PVP_F
  // (os chefes da campanha dos fragmentos resistem mais: fracF = 6 leva so 1/6)
  function golpeFatal(g, e, dono) {
    const dmg = e instanceof Player ? PVP_F : e.boss ? Math.max(1, Math.ceil(e.maxhp / (e.fracF || 3))) : 999;
    G.ferirBruto(g, e, dmg, 0, -1, dono);
  }

  // paralisa `e` por `t` quadros (monstro, chefe ou jogador)
  G.paralisa = function (e, t) {
    if (e.dead || e.escudo > 0) return;
    e.para = Math.max(e.para || 0, t);
  };

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
  const KILL_REFUND = 30;                      // cada inimigo morto adianta 0,5 s da recarga do F
  // X, C e V nao tem recarga: liberam por abates desde o ultimo uso (no VS, por dano causado no oponente)
  const ABATES_X = 3, ABATES_C = 6, ABATES_V = 10;
  const DANO_POR_CARGA = 2;                    // dano no chefe: cada 2 de dano vale 1 abate para o X, C e V
  const CARGA_MAX_GOLPE = 2;                   // ... e um golpe so carrega ate 2 (um especial forte nao se recarrega sozinho)
  const SP_RANGE_FULL = 480;                   // as flechas da salva sempre atravessam a sala inteira
  const SP_RAJADAS = 4, SP_RAJADA_T = 10;      // segurando ate a carga cheia: 4 salvas seguidas, a cada 10 quadros
  const SP_SHRINK_FULL = 140;                  // distancia em que a flecha termina de encolher
  const SP_SPACING = 16;                       // uma flecha por bloco, preenchendo o espaco
  const SPIN_VOLTAS = 4;                       // 4 voltas, uma flecha em cada uma das 8 direcoes por volta
  const SPIN_TIME = 24 * SPIN_VOLTAS;          // 3 quadros por flecha, 32 flechas
  const SPIN_RANGE = 120;                      // 7,5 blocos em cada direcao
  const SPIN_DIRS = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
  const GOLD_SPD = 3.6;                        // velocidade de cruzeiro
  const GOLD_TURN = 0.16;                      // quanto a flecha pode virar por quadro (rad)
  const GOLD_MULT = 4;                         // dano = 4x o da flecha do Z
  const GOLD_LIFE = 1200;                      // limite de seguranca: some depois de 20 s
  const GOLD_GRUDA = 40;                       // no ultimo inimigo: fica cravada 2/3 s e explode
  const GOLD_EXPL_R = 34;                      // raio da explosao final
  const AR_X_MULT = 2;                         // salva (X), carregada ou nao: 2x o dano da flecha do Z
  const AR_C_MULT = 3;                         // giro (C): flechas explosivas com 3x o dano da flecha do Z
  const AR_C_RAIO = 16;                        // raio da explosao de cada flecha do giro
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
  const MAGIA_CD = 60;                         // mago: 1 s entre um ataque do Z e outro
  // ordem do ciclo: 10 de fogo, 2 de gelo, 5 de fogo, 1 de raio, e recomeca
  const CICLO_ELEM = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 2];

  // habilidades do mago
  const MG_CHOQUE_T = 420;                     // eletrocutado (V): parado por 7 s, 1 de dano so no raio
  const MG_PARALISA_T = 180;                   // inferno (X): so paralisa, por 3 s, sem dano
  const MG_ESCUDO_T = 360;                     // invulneravel por 6 s
  const MG_ERGUE = 20, MG_RECUA = 10;          // quadros erguendo o cajado e depois da batida

  // efeitos das magias (em quadros, 60 = 1 s)
  const GELO_T = 600;                          // gelo: congelado por 10 s
  const FOGO_T = 300, FOGO_TICK = 60;          // fogo: queima por 5 s, 1 de dano por segundo
  const RAIO_T = 120;                          // raio: paralisado por 2 s
  const RAIO_ALCANCE = 48;                     // raio pula para inimigos a ate 3 blocos
  const RAIO_SALTOS = 4;                       // quantos inimigos extras o raio alcanca
  // chefes e jogadores (VS) sofrem menos
  const EFEITO_CHEFE = { gelo: 60, fogo: FOGO_T, raio: 60 };   // chefe congela so 1 s
  const EFEITO_JOGADOR = { gelo: 90, fogo: 180, raio: 60 };

  // guerreiro: especiais com a espada
  const KN_DASH_SPD = 6;                       // px por quadro
  const KN_DASH_LONG = 400;                    // investida (X): atravessa a sala ate a parede ou a borda
  const KN_DASH_MULT = 3;                      // investida: 3x o dano da espada
  const KN_GIRO_VOLTA = 16;                    // quadros por volta de 360 graus
  const KN_GIRO_T = 180;                       // giro (C): 3 s girando e correndo atras dos inimigos
  const KN_GIRO_MULT = 2;                      // 2x o dano da espada, a cada volta
  const KN_RUSH_SPD = 7;                       // px por quadro, ignorando paredes
  const KN_RUSH_PAUSA = 6;                     // quadros parado em cada golpe
  const KN_RUSH_MULT = 4;                      // 4x o dano da espada em cada inimigo
  const KN_RUSH_MAX = 900;                     // limite de seguranca: 15 s
  const KN_INVULNERAVEL = 180;                 // relampago (V): 3 s invulneravel, piscando
  const KN_INV_GOLPE = 60;                     // investida (X) e giro (C): 1 s invulneravel no inicio
  const KN_RUSH_PARA = 300;                    // relampago (V): quem e atingido fica paralisado 5 s

  // ninja
  const NJ_ESTRELAS = 5, NJ_ESTRELA_ABRE = 0.18;  // X: 5 estrelas em leque (rad entre elas)
  const NJ_ESTRELA_SPD = 4, NJ_ESTRELA_MULT = 1.5; // dano = 1,5x o da katana
  const NJ_TURBO_T = 600, NJ_TURBO_SPD = 2.7;  // C: velocidade 2,7 por 10 s
  const NJ_VENENO_T = 360, NJ_VENENO_TICK = 60; // V: nevoa na sala toda por 6 s, 1 de dano por segundo
  const NJ_BOMBA_VOO = 24;                     // F: quadros ate o explosivo cair no alvo

  // Percy
  const PC_TRI_IDA = 60, PC_TRI_VOLTA = 60;    // X: tridente vai ate a borda e volta em 2 s
  const PC_TRI_MULT = 2;                       // 2x o dano do tridente
  const PC_BARREIRA_T = 480, PC_BARREIRA_N = 5; // C: parede de agua de 5 blocos por 8 s
  const PC_TORNADO_T = 480;                    // V: redemoinho puxa todos para o centro por 8 s
  const PC_PUXA = 1.2, PC_PUXA_CHEFE = 0.45;   // px por quadro puxados para o centro
  const PC_TORNADO_RAIO = 56, PC_TORNADO_MULT = 4; // explosao final: 4x o tridente num raio de 3,5 blocos
  const PC_TSUNAMI_SPD = 3.2;                  // F: velocidade da onda, da esquerda para a direita

  // bomber
  const BM_Z_T = 20;                           // Z: quadros entre uma bomba e outra
  const BM_ALCANCE = 56, BM_VOO = 20;          // bomba cai 3,5 blocos a frente em 1/3 s
  const BM_MULT = 2, BM_RAIO = 18;             // bomba comum: 2x o dano da arma num raio de ~1 bloco
  const BM_GRANDE_CADA = 10;                   // a cada 10 bombas, uma grande
  const BM_GRANDE_MULT = 5, BM_GRANDE_RAIO = 44;
  const BM_MINAS = 3;                          // X: 3 minas, uma por aperto, onde o bomber esta
  const BM_MINA_ARMA = 30, BM_MINA_RAIO = 28, BM_MINA_MULT = 4;
  const BM_ESCUDO_T = 420, BM_ESCUDO_N = 6;    // C: 6 bombas girando por 7 s
  const BM_ESCUDO_R = 20, BM_ESCUDO_MULT = 3;
  const BM_QUICA_VOO = 18;                     // V: quadros de cada pulo da bomba entre um alvo e outro
  const BM_QUICA_PVP = 4;                      // V no VS: 4x o dano, sem matar na hora
  const BM_NUKE_QUEDA = 70;                    // F: quadros ate a bomba nuclear cair

  // cronomante
  const CR_Z_T = 16, CR_TIRO_SPD = 3.2, CR_TIRO_MULT = 2;   // Z: relogio com 2x o dano da arma
  const CR_LENTO_T = 180;                      // Z: quem e atingido fica lento (metade da velocidade) por 3 s
  const CR_REBOBINA = 180;                     // X: volta 3 s no tempo
  const CR_PARADO_T = 240;                     // C: tempo parado por 4 s
  const CR_PARADOXO_T = 180, CR_PARADOXO_MIN = 2, CR_PARADOXO_PVP = 6;   // V: em 3 s o dano volta em dobro
  const CR_FIM_T = 90;                         // F: 1,5 s ate o fim dos tempos
  // necromante
  const NC_LACAIOS = 3, NC_LACAIO_T = 900;     // X: 3 esqueletos aliados por 15 s
  const NC_LACAIO_SPD = 1.1, NC_LACAIO_CD = 40, NC_LACAIO_MULT = 2;
  const NC_ELO_T = 360;                        // C: 6 s de corrente de almas
  const NC_COLHEITA_MULT = 3, NC_COLHEITA_GOLPE = 12;   // V: quem nao e executado leva 3x o dano
  const NC_SUB_T = 60;                         // F: 1 s ate as maos arrastarem todos
  // engenheiro
  const EN_Z_T = 7, EN_Z_SPD = 4.4, EN_Z_ESPALHA = 0.14;   // Z: um prego a cada 7 quadros, segurando
  const EN_TORRETAS = 2, EN_TORRETA_T = 1200;  // X: ate 2 torretas por 20 s
  const EN_TORRETA_CD = 22, EN_TORRETA_ALC = 200;
  const EN_REFLETOR_T = 360, EN_REFLETOR_R = 30;   // C: 6 s refletindo tiros com o dobro do dano
  const EN_LASER_T = 180, EN_LASER_TICK = 8;   // V: 3 s de laser, dano a cada 8 quadros
  const EN_DRONE_SPD = 4.5, EN_DRONE_SOBE = 40;    // F: drones sobem 2/3 s e mergulham
  // druida
  const DR_FORMA_T = 720;                      // X e C: 12 s de lobo ou urso
  const DR_LOBO_SPD = 2.4, DR_URSO_SPD = 1.1;
  const DR_RAIZ_T = 60;                        // Z: o espinho prende por 1 s
  const DR_BOSQUE_T = 600, DR_BOSQUE_R = 56, DR_BOSQUE_CURA = 90;   // V: 10 s, cura meio coracao a cada 1,5 s
  const DR_FURIA_T = 60;
  // vampira
  const VP_LANCA_SPD = 5, VP_LANCA_MULT = 3;
  const VP_MORCEGO_T = 150, VP_MORCEGO_SPD = 3, VP_MORCEGO_CD = 20;
  const VP_BANQUETE_MULT = 3, VP_BANQUETE_CURA = 6;
  const VP_LUA_T = 60;

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
      hp: 10, speed: 1.5, dmg: 1, dash: 1,
      xEspera: 300,                          // investida (X): sem abates, recarrega em 5 s
      desc: ['GOLPE EM ARCO DE 180 GRAUS', 'CORPO A CORPO, CURTO ALCANCE'],
      skill: 'BOLA DE FOGO',
      hab: ['INVESTIDA (X)', 'TORNADO (C)', 'RELAMPAGO (V)'],
      dica: 'X INVESTIDA 5s   C TORNADO 3s   V RELAMPAGO', dicaCor: '#c8cede'
    },
    arqueiro: {
      nome: 'ARQUEIRO', arma: 'ARCO', modo: 'bow',
      hp: 10, speed: 1.7, dmg: 1, dash: 2,   // rolamento em dobro
      desc: ['FLECHAS A DISTANCIA', 'MAIS RAPIDO, ROLAMENTO LONGO'],
      skill: 'ONDA DE CHOQUE',
      hab: ['SALVA DE 3 FLECHAS (X, SEGURE)', 'GIRO EXPLOSIVO (C)', 'DOURADA (V)'],
      dica: 'X SALVA 2x   C GIRO EXPLOSIVO 3x   V DOURADA 4x', dicaCor: '#7fd858'
    },
    mago: {
      nome: 'MAGO', arma: 'CAJADO', modo: 'magic',
      hp: 10, speed: 1.2, dmg: 2, dash: 1,
      desc: ['CAJADO EM ARCO + MAGIA A CADA GOLPE', 'DANO DOBRADO, MAIS LENTO'],
      skill: 'METEORO ELEMENTAL', sprArma: 'staff',
      hab: ['INFERNO (X)', 'ESCUDO (C)', 'TEMPESTADE DE RAIOS (V)'],
      dica: '10 FOGO 2 GELO 5 FOGO 1 RAIO  X INFERNO  C ESCUDO  V RAIOS', dicaCor: '#7ff2ff'
    },
    ninja: {
      nome: 'NINJA', arma: 'KATANA', modo: 'ninja',
      hp: 10, speed: 1.6, dmg: 2, dash: 1,   // katana: 2x o dano da espada
      desc: ['KATANA EM ARCO, 2X O DANO DA ESPADA', 'ESTRELAS, VELOCIDADE E VENENO'],
      skill: 'EXPLOSIVOS', sprArma: 'katana',
      hab: ['ESTRELAS NINJA (X)', 'VELOCIDADE (C)', 'VENENO (V)'],
      dica: 'X 5 ESTRELAS   C VELOCIDADE 10s   V VENENO', dicaCor: '#7fd858'
    },
    percy: {
      nome: 'PERCY', arma: 'TRIDENTE', modo: 'percy',
      hp: 10, speed: 1.5, dmg: 1, dash: 1, alcance: 1.5,   // golpe da espada com 1,5x o alcance
      xEspera: 180,                          // tridente (X): sem abates, so 3 s de espera apos arremessar
      desc: ['TRIDENTE EM ARCO, 1,5X O ALCANCE', 'PODERES DA AGUA'],
      skill: 'TSUNAMI', sprArma: 'tridente',
      hab: ['TRIDENTE (X)', 'BARREIRA (C)', 'REDEMOINHO (V)'],
      dica: 'X TRIDENTE 3s   C BARREIRA   V REDEMOINHO', dicaCor: '#5aa7ff'
    },
    bomber: {
      nome: 'BOMBER', arma: 'BOMBAS', modo: 'bomber',
      hp: 10, speed: 1.4, dmg: 1, dash: 1,
      desc: ['BOMBAS EM ARCO, A 10a E GRANDE', 'MINAS, ESCUDO E BOMBA QUICANTE'],
      skill: 'BOMBA NUCLEAR',
      hab: ['3 MINAS (X)', 'ESCUDO DE BOMBAS (C)', 'BOMBA QUICANTE (V)'],
      dica: 'X 3 MINAS   C ESCUDO DE BOMBAS   V BOMBA QUICANTE', dicaCor: '#ff8a3d'
    },
    crono: {
      nome: 'CRONOMANTE', arma: 'RELOGIO', modo: 'crono',
      hp: 10, speed: 1.5, dmg: 1, dash: 1,
      desc: ['RELOGIO QUE DEIXA OS ALVOS LENTOS', 'VOLTA, PARA E DOBRA O TEMPO'],
      skill: 'FIM DOS TEMPOS',
      hab: ['REBOBINAR 3s (X)', 'PARAR O TEMPO (C)', 'PARADOXO (V)'],
      dica: 'X VOLTA 3s   C PARA O TEMPO 4s   V O DANO VOLTA EM DOBRO', dicaCor: '#5ce1ff'
    },
    necro: {
      nome: 'NECROMANTE', arma: 'FOICE', modo: 'necro',
      hp: 10, speed: 1.4, dmg: 1, dash: 1, alcance: 1.3, sprArma: 'foiceArma',
      rouboZ: 4,                               // a cada 4 golpes do Z cura meio coracao
      desc: ['FOICE LONGA QUE ROUBA VIDA', 'MORTOS-VIVOS, CORRENTES E EXECUCAO'],
      skill: 'PORTAL DO SUBMUNDO',
      hab: ['ERGUER MORTOS (X)', 'CORRENTE DE ALMAS (C)', 'COLHEITA (V)'],
      dica: 'X 3 ESQUELETOS   C DANO COMPARTILHADO   V EXECUTA', dicaCor: '#7fd858'
    },
    engenheiro: {
      nome: 'ENGENHEIRO', arma: 'REBITADORA', modo: 'engenheiro',
      hp: 10, speed: 1.5, dmg: 1, dash: 1,
      desc: ['SEGURE J: TIRO AUTOMATICO', 'TORRETAS, REFLETOR E LASER'],
      skill: 'ENXAME DE DRONES',
      hab: ['TORRETA (X)', 'CAMPO REFLETOR (C)', 'LASER (V)'],
      dica: 'X TORRETA   C DEVOLVE TIROS   V LASER (MIRE COM AS SETAS)', dicaCor: '#ffd34d'
    },
    druida: {
      nome: 'DRUIDA', arma: 'ESPINHOS', modo: 'druida',
      hp: 10, speed: 1.5, dmg: 1, dash: 1,
      desc: ['ESPINHOS QUE PRENDEM', 'VIRA LOBO OU URSO'],
      skill: 'FURIA DA FLORESTA',
      hab: ['FORMA DE LOBO (X)', 'FORMA DE URSO (C)', 'BOSQUE SAGRADO (V)'],
      dica: 'X LOBO RAPIDO   C URSO (METADE DO DANO)   V BOSQUE QUE CURA', dicaCor: '#7fd858'
    },
    vampira: {
      nome: 'VAMPIRA', arma: 'RAPIEIRA', modo: 'vampira',
      hp: 10, speed: 1.7, dmg: 1, dash: 1, alcance: 1.1, sprArma: 'rapieira',
      rouboZ: 3,                               // a cada 3 golpes do Z cura meio coracao; cada abate cura tambem
      custo: [1, 2, 3], recarga: [60, 300, 600],   // X, C e V custam meios-coracoes, nao abates
      desc: ['RAPIEIRA QUE ROUBA VIDA; ABATES CURAM', 'X, C E V CUSTAM VIDA, NAO ABATES'],
      skill: 'LUA DE SANGUE',
      hab: ['LANCA DE SANGUE (X)', 'MORCEGOS (C)', 'BANQUETE (V)'],
      dica: 'X LANCA -1   C MORCEGOS -2   V BANQUETE -3 (MEIOS-CORACOES)', dicaCor: '#e33b4e',
      regra: 'X, C E V CUSTAM VIDA E TEM RECARGA CURTA (O F TEM 60s)'
    }
  };
  G.CLASSES = CLASSES;
  G.CLASS_IDS = ['guerreiro', 'arqueiro', 'mago', 'ninja', 'percy', 'bomber',
    'crono', 'necro', 'engenheiro', 'druida', 'vampira'];
  // loja (menu do ESC): cada item se compra uma vez, com as moedas do proprio jogador
  const LOJA = [
    { id: 'cura', preco: 100, nome: 'CURA AUTOMATICA', desc: 'MEIO CORACAO A CADA 10 S' },
    { id: 'arma', preco: 200, nome: 'ARMA PRINCIPAL +1', desc: 'MAIS DANO NO ATAQUE (J)' },
    { id: 'vel', preco: 300, nome: 'VELOCIDADE +30%', desc: 'ANDA 30% MAIS RAPIDO' },
    { id: 'especial', preco: 400, nome: 'DEMAIS ARMAS +1', desc: 'MAIS DANO NO X, C E V' }
  ];
  G.LOJA = LOJA;
  const CURA_T = 600;                          // cura automatica: meio coracao a cada 10 s
  const VEL_MULT = 1.3;
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
      // spCd / spinCd / goldCd: abates que ainda faltam para liberar X / C / V (0 = pronto)
      this.spMax = ABATES_X;
      this.spCd = ABATES_X;
      this.spin = 0;                   // giro de 360 em andamento
      this.spinIdx = -1;
      this.spinMax = ABATES_C;
      this.spinCd = ABATES_C;
      this.rajadas = 0; this.rajadaT = 0;     // salvas que ainda faltam na carga cheia (X)
      this.goldMax = ABATES_V;         // flecha dourada / relampago / inferno (V)
      this.goldCd = ABATES_V;
      this.golpeChao = null;           // mago: erguendo o cajado para bater no chao (X e V)
      this.escudo = 0;                 // mago: quadros de escudo (C)
      this.dashLeft = 0;               // investida (X): distancia que falta
      this.dashDmg = 0;
      this.dashCheia = false;
      this.xCd = 0;                    // espera apos o X nas classes sem abates no X (def.xEspera), em quadros
      if (this.def.xEspera) this.spCd = 0;
      if (this.def.custo) { this.spCd = 0; this.spinCd = 0; this.goldCd = 0; }   // vampira: paga com vida
      this.turbo = 0;                  // ninja: quadros de velocidade extra (C)
      this.tridenteT = 0;              // Percy: quadros ate o tridente arremessado voltar (X)
      this.bombasZ = 0;                // bomber: bombas lancadas no Z (a 10a e grande)
      this.minas = 0;                  // bomber: minas que ainda pode plantar (X)
      this.pose = 0;                   // quadros na pose de ataque sem travar o passo (engenheiro)
      this.cdZ = 0; this.tiros = 0;    // engenheiro: espera ate o proximo prego
      this.laser = 0; this.laserLen = 0;   // engenheiro: quadros de laser (V)
      this.hist = []; this.histSala = null;   // cronomante: os ultimos 3 s (posicao e vida)
      this.eco = 0; this.ecoPts = null;      // cronomante: rastro do rebobinar
      this.golpes = 0;                 // golpes do Z ate o proximo roubo de vida (necromante, vampira)
      this.forma = 'humano'; this.formaT = 0;   // druida
      this.morcego = 0; this.morcegoHit = null; // vampira: enxame de morcegos (C)
      this.cdX = 0; this.cdC = 0; this.cdV = 0; // vampira: recargas por tempo
      this.lento = 0; this.raiz = 0;   // efeitos de lentidao (relogio) e raizes (espinho)
      this.compras = {};               // itens da loja ja comprados (id -> true)
      this.curaT = 0;
      this.menu = null;                // menu do ESC aberto: { aba, sel }
      this.giro = 0;                   // giro (C): quadros restantes
      this.giroAng = 0;
      this.rush = null;                // investida relampago (V)
      this.lamina = null;              // angulo fixo da espada durante os especiais
      this.input = null;               // multijogador: entrada propria (null = teclado local)
      this.num = 1;                    // 1 = anfitriao, 2 = convidado
      this.abates = 0;                 // placar do competitivo
      this.respawnT = 0;               // multijogador: quadros ate voltar
      this.speed = this.def.speed;
      this.atk = 0; this.roll = 0; this.rollCd = 0;
      this.fireCd = 0; this.cast = 0; this.magiaCd = 0;
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
      const alcance = this.alcance();
      for (let i = 0; i < BLADE_HITS.length; i++) {
        const d = BLADE_HITS[i] * alcance, b = this._boxes[i];
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

    alcance() {
      if (this.forma === 'urso') return 1.2;
      if (this.forma === 'lobo') return 0.8;
      return this.def.alcance || 1;
    }

    // quem ataca girando a arma em arco (e desenha lamina e rastro)
    golpeEmArco() {
      const m = this.def.modo;
      return m === 'melee' || m === 'ninja' || m === 'percy' || m === 'necro' || m === 'vampira' ||
        (m === 'druida' && this.forma !== 'humano');
    }
    giraArma() { return this.golpeEmArco() || this.def.modo === 'magic'; }
    armaSprite() { return this.forma !== 'humano' ? 'garra' : this.def.sprArma || 'blade'; }

    // roubo de vida do Z (necromante e vampira): a cada N golpes cura meio coracao
    roubaVida(g) {
      if (!this.def.rouboZ || ++this.golpes < this.def.rouboZ) return;
      this.golpes = 0;
      if (this.hp >= this.maxhp) return;
      this.heal(1);
      g.particles.burst(this.cx, this.cy - 4, 5, 2, 1, 14);
    }

    // dano base das habilidades (X, C, V); o item 'especial' da loja soma 1
    dano() { return this.def.dmg * this.sword + (this.compras.especial ? 1 : 0); }
    // dano do ataque principal (J); o item 'arma' da loja soma 1
    // (lobo morde com 2x, urso bate com 3x)
    danoArma() {
      const f = this.forma === 'urso' ? 3 : this.forma === 'lobo' ? 2 : 1;
      return (this.def.dmg * this.sword + (this.compras.arma ? 1 : 0)) * f;
    }
    velBase() {
      const base = this.forma === 'lobo' ? DR_LOBO_SPD : this.forma === 'urso' ? DR_URSO_SPD : this.def.speed;
      return base * (this.compras.vel ? VEL_MULT : 1);
    }

    compra(id) {
      this.compras[id] = true;
      if (id === 'vel' && this.turbo === 0) this.speed = this.velBase();
    }

    // cada abate conta para liberar X, C e V e adianta a recarga do F
    // fonte: 'x', 'c' ou 'v' quando o abate veio de um especial (ele nao recarrega a si mesmo)
    abateu(fonte) {
      if (this.def.custo) this.heal(1);          // vampira: cada abate cura meio coracao
      const antes = this.fireCd;
      this.fireCd = Math.max(0, this.fireCd - KILL_REFUND);
      return this.carrega(1, fonte) || antes !== this.fireCd;
    }

    // especial ainda travado: avisa quanto falta
    bloqueado(g, falta) {
      Sound.play('blocked');
      const vs = g.modo() === 'vs';
      const chefe = g.boss && !g.boss.dead;
      g.say('FALTA' + (falta > 1 ? 'M ' : ' ') + falta + (vs ? ' DE DANO' : falta > 1 ? ' ABATES' : ' ABATE') +
        (chefe ? '\nBATER NO CHEFE TAMBEM CARREGA' : ''), 60);
    }

    // avanca X, C e V em `n` (abates, ou pontos de dano no oponente no VS)
    // o especial que causou o abate/dano (fonte) nao carrega; os outros sim
    carrega(n, fonte) {
      const antes = this.spCd + this.spinCd + this.goldCd;
      if (fonte !== 'x') this.spCd = Math.max(0, this.spCd - n);
      if (fonte !== 'c') this.spinCd = Math.max(0, this.spinCd - n);
      if (fonte !== 'v') this.goldCd = Math.max(0, this.goldCd - n);
      return antes !== this.spCd + this.spinCd + this.goldCd;
    }

    // de qual especial vem o que o heroi fizer neste quadro: tecla apertada agora ou especial em andamento
    fonteAtiva(i) {
      if (this.golpeChao) return this.golpeChao.tipo === 'raio' ? 'v' : 'x';   // mago: a batida do X/V sai depois
      if (i.hit('special')) return 'x';
      if (i.hit('spin')) return 'c';
      if (i.hit('gold')) return 'v';
      if (this.dashLeft > 0 || this.rajadas > 0 || this.forma === 'lobo') return 'x';
      if (this.giro > 0 || this.spin > 0 || this.forma === 'urso' || this.morcego > 0) return 'c';
      if (this.rush || this.laser > 0) return 'v';
      return null;
    }
    recargas() { return [this.spCd, this.spinCd, this.goldCd, this.xCd, this.cdX, this.cdC, this.cdV]; }
    // qual especial foi usado neste quadro (a recarga dele voltou a subir)
    especialUsado(a) {
      const b = this.recargas();
      if (b[0] > a[0] || b[3] > a[3] || b[4] > a[4]) return 'x';
      if (b[1] > a[1] || b[5] > a[5]) return 'c';
      if (b[2] > a[2] || b[6] > a[6]) return 'v';
      return null;
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
      if (this.golpeEmArco()) {
        this.atk = ATK_TIME;
        this.hitSet.clear();
        Sound.play('swing');
        g.particles.spawn(this.cx, this.cy, 0, 0, 6, 0, 1, 0);
      } else if (this.def.modo === 'bow') {
        this.atk = BOW_TIME;
        Sound.play('bow');
      } else if (this.def.modo === 'bomber') {
        this.atk = BM_Z_T;
        this.lancaBomba(g);
      } else if (this.def.modo === 'crono') {
        this.atk = CR_Z_T;
        this.lancaRelogio(g);
      } else if (this.def.modo === 'druida') {   // druida em forma humana: espinho
        this.atk = CR_Z_T;
        this.lancaEspinho(g);
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
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else {
          this.spin = SPIN_TIME;
          this.spinIdx = -1;
          this.spinCd = this.spinMax;
          this.charging = false; this.charge = 0;
          this.spCharging = false; this.spCharge = 0;
          this.inv = Math.max(this.inv, SPIN_TIME);   // fica intocavel durante o giro
          Sound.play('spin');
          g.particles.burst(this.cx, this.cy, 20, 1, 2.2, 22);
          g.shake(4);
          g.say('GIRO EXPLOSIVO!', 60);
          return;
        }
      }

      // ---- flecha dourada (V): persegue e atravessa todos os inimigos ----
      if (i.hit('gold')) {
        if (this.goldCd > 0) this.bloqueado(g, this.goldCd);
        else this.soltarDourada(g);
      }

      // ---- ataque especial (X): salva de tres flechas ----
      if (i.hit('special') && !this.spCharging) {
        if (this.spCd > 0) this.bloqueado(g, this.spCd);
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

    /* ---------- mago: X inferno, C escudo, V choque ---------- */

    updateMago(g, i) {
      if (i.hit('spin')) {
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else {
          this.escudo = MG_ESCUDO_T;
          this.spinCd = this.spinMax;
          g.particles.burst(this.cx, this.cy, 20, 4, 1.8, 24);
          Sound.play('secret');
          g.say('ESCUDO ARCANO!', 60);
        }
      }
      const tipo = i.hit('special') ? 'fogo' : i.hit('gold') ? 'raio' : null;
      if (!tipo) return;
      const cd = tipo === 'fogo' ? this.spCd : this.goldCd;
      if (cd > 0) { this.bloqueado(g, cd); return; }
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

    // V: todos os alvos da sala eletrocutados: 1 de dano e parados por 7 s, raios saindo do mago ate cada um
    soltaChoque(g) {
      this.goldCd = this.goldMax;
      const alvos = g.alvos(this);
      for (const e of alvos) {
        g.ents.push(new Relampago([[this.cx, this.cy - 4], [e.cx, e.cy]]));
        danoDireto(g, e, 1, this);
        G.paralisa(e, MG_CHOQUE_T);
        g.particles.burst(e.cx, e.cy, 10, 1, 1.8, 14);
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

    // X: anel de fogo que so paralisa todos da sala por 3 s, sem dano nenhum
    soltaInferno(g) {
      this.spCd = this.spMax;
      for (const e of g.alvos(this)) {
        G.paralisa(e, MG_PARALISA_T);
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

    /* ---------- ninja: X estrelas, C velocidade, V nevoa de veneno ---------- */

    updateNinja(g, i) {
      if (i.hit('special')) {
        if (this.spCd > 0) this.bloqueado(g, this.spCd);
        else this.lancaEstrelas(g);
      }
      if (i.hit('spin')) {
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else {
          this.spinCd = this.spinMax;
          this.turbo = NJ_TURBO_T;
          this.speed = NJ_TURBO_SPD * (this.compras.vel ? VEL_MULT : 1);
          g.particles.burst(this.cx, this.cy, 16, 5, 2, 18);
          Sound.play('spin');
          g.say('PASSO DO VENTO!', 60);
        }
      }
      if (i.hit('gold')) {
        if (this.goldCd > 0) this.bloqueado(g, this.goldCd);
        else {
          this.goldCd = this.goldMax;
          g.addEnt(new NevoaVeneno(this));
          g.particles.burst(this.cx, this.cy, 30, 3, 2.6, 26, 2);
          g.shake(5);
          Sound.play('nova');
          g.say('NEVOA VENENOSA!', 60);
        }
      }
    }

    // X: 5 estrelas em leque que atravessam tudo ate a borda da sala
    lancaEstrelas(g) {
      this.spCd = this.spMax;
      const v = DIR_VEC[this.dir], base = Math.atan2(v[1], v[0]);
      const m = this.muzzle(8);
      const dmg = Math.ceil(this.dano() * NJ_ESTRELA_MULT);
      for (let k = 0; k < NJ_ESTRELAS; k++) {
        const a = base + (k - (NJ_ESTRELAS - 1) / 2) * NJ_ESTRELA_ABRE;
        g.addEnt(new Estrela(m[0], m[1], Math.cos(a) * NJ_ESTRELA_SPD, Math.sin(a) * NJ_ESTRELA_SPD, dmg));
      }
      this.atk = ATK_REC;
      Sound.play('volley');
      g.particles.burst(m[0], m[1], 10, 5, 1.8, 14);
      g.say('ESTRELAS NINJA!', 50);
    }

    /* ---------- bomber: Z bombas, X minas, C escudo de bombas, V bomba quicante ---------- */

    lancaBomba(g) {
      this.bombasZ++;
      const grande = this.bombasZ % BM_GRANDE_CADA === 0;
      const v = DIR_VEC[this.dir], alc = grande ? BM_ALCANCE + 16 : BM_ALCANCE;
      const m = this.muzzle(4);
      const dmg = this.danoArma() * (grande ? BM_GRANDE_MULT : BM_MULT);
      g.addEnt(new BombaJogador(m[0], m[1], this.cx + v[0] * alc, this.cy + v[1] * alc, dmg,
        grande ? BM_GRANDE_RAIO : BM_RAIO, grande));
      Sound.play(grande ? 'shootbig' : 'swing');
      if (grande) g.say('BOMBA GRANDE!', 50);
    }

    updateBomber(g, i) {
      if (i.hit('special')) {
        if (this.minas === 0) {                      // primeira mina: gasta o especial e ganha 3
          if (this.spCd > 0) this.bloqueado(g, this.spCd);
          else { this.minas = BM_MINAS; this.spCd = this.spMax; }
        }
        if (this.minas > 0) {
          this.minas--;
          g.addEnt(new Mina(this.cx, this.y + this.h - 2, this.dano() * BM_MINA_MULT));
          Sound.play('key');
          g.say('MINA ' + (BM_MINAS - this.minas) + '/' + BM_MINAS, 40);
        }
      }
      if (i.hit('spin')) {
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else {
          this.spinCd = this.spinMax;
          g.addEnt(new EscudoBombas(this, this.dano() * BM_ESCUDO_MULT));
          Sound.play('spin');
          g.say('ESCUDO DE BOMBAS!', 60);
        }
      }
      if (i.hit('gold')) {
        if (this.goldCd > 0) this.bloqueado(g, this.goldCd);
        else {
          if (!this.proximoAlvo(g, new Set())) { Sound.play('blocked'); g.say('NENHUM INIMIGO', 40); }
          else {
            this.goldCd = this.goldMax;
            g.addEnt(new BombaQuicante(this.cx, this.cy - 4, this.dano() * BM_QUICA_PVP));
            Sound.play('swing');
            g.say('BOMBA QUICANTE!', 60);
          }
        }
      }
    }

    /* ---------- cronomante: Z relogio, X rebobinar, C parar o tempo, V paradoxo ---------- */

    lancaRelogio(g) {
      const v = DIR_VEC[this.dir], m = this.muzzle(8);
      const sh = new Shot(m[0] - 3, m[1] - 3, v[0] * CR_TIRO_SPD, v[1] * CR_TIRO_SPD, 'relogio',
        this.danoArma() * CR_TIRO_MULT, this.dir);
      sh.friendly = true;
      sh.onHit = (g2, e) => { e.lento = Math.max(e.lento || 0, CR_LENTO_T); };
      g.addEnt(sh);
      g.particles.burst(m[0], m[1], 6, 4, 1.2, 12);
      Sound.play('cast');
    }

    // guarda os ultimos 3 s (posicao e vida) para o rebobinar; zera ao trocar de sala
    gravaHistorico(g) {
      if (this.histSala !== g.room) { this.hist.length = 0; this.histSala = g.room; }
      this.hist.push({ x: this.x, y: this.y, hp: this.hp });
      if (this.hist.length > CR_REBOBINA) this.hist.shift();
    }

    updateCrono(g, i) {
      if (i.hit('special')) {
        if (this.spCd > 0) this.bloqueado(g, this.spCd);
        else if (this.hist.length < 10) Sound.play('blocked');
        else this.rebobina(g);
      }
      if (i.hit('spin')) {
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else {
          this.spinCd = this.spinMax;
          g.tempoParado = CR_PARADO_T; g.tempoDono = this;
          g.flashT = Math.max(g.flashT, 6);
          Sound.play('secret');
          g.say('O TEMPO PAROU!', 60);
        }
      }
      if (i.hit('gold')) {
        if (this.goldCd > 0) this.bloqueado(g, this.goldCd);
        else {
          const alvos = g.alvos(this);
          if (!alvos.length) { Sound.play('blocked'); g.say('NENHUM INIMIGO', 40); }
          else {
            this.goldCd = this.goldMax;
            g.addEnt(new Paradoxo(this, alvos));
            Sound.play('cast');
            g.say('PARADOXO! BATA NELES', 70);
          }
        }
      }
    }

    // volta para onde estava 3 s atras, com a vida daquela hora (se era maior) e sem efeitos
    rebobina(g) {
      const h = this.hist[0];
      this.spCd = this.spMax;
      this.ecoPts = [];
      for (let k = this.hist.length - 1; k >= 0; k -= 20) this.ecoPts.push([this.hist[k].x, this.hist[k].y]);
      this.eco = 40;
      g.particles.burst(this.cx, this.cy, 14, 4, 1.8, 18);
      this.x = h.x; this.y = h.y;
      this.hp = Math.max(this.hp, h.hp);
      this.fogo = 0; this.gelo = 0; this.para = 0; this.lento = 0; this.raiz = 0; this.knock = 0;
      this.inv = Math.max(this.inv, 30);
      this.hist.length = 0;
      g.particles.burst(this.cx, this.cy, 20, 4, 2, 22);
      Sound.play('secret');
      g.say('REBOBINAR!', 50);
    }

    /* ---------- necromante: X esqueletos, C corrente de almas, V colheita ---------- */

    updateNecro(g, i) {
      if (i.hit('special')) {
        if (this.spCd > 0) this.bloqueado(g, this.spCd);
        else {
          this.spCd = this.spMax;
          for (const e of g.ents) if (e instanceof Lacaio && e.dono === this) e.some(g);   // troca os antigos
          for (let k = 0; k < NC_LACAIOS; k++) {
            const a = (k / NC_LACAIOS) * Math.PI * 2;
            g.addEnt(new Lacaio(this, this.cx + Math.cos(a) * 14, this.cy + Math.sin(a) * 14, this.dano() * NC_LACAIO_MULT));
          }
          Sound.play('boss');
          g.shake(3);
          g.say('ERGAM-SE!', 60);
        }
      }
      if (i.hit('spin')) {
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else if (g.alvos(this).length < 2) { Sound.play('blocked'); g.say('PRECISA DE 2 ALVOS', 40); }
        else {
          this.spinCd = this.spinMax;
          g.addEnt(new EloAlmas(this, g.alvos(this)));
          Sound.play('cast');
          g.say('CORRENTE DE ALMAS!', 60);
        }
      }
      if (i.hit('gold')) {
        if (this.goldCd > 0) this.bloqueado(g, this.goldCd);
        else if (!g.alvos(this).length) { Sound.play('blocked'); g.say('NENHUM INIMIGO', 40); }
        else {
          this.goldCd = this.goldMax;
          g.addEnt(new Colheita(this));
          Sound.play('swing');
          g.say('COLHEITA!', 60);
        }
      }
    }

    /* ---------- engenheiro: Z rebitadora, X torreta, C refletor, V laser ---------- */

    updateEngenheiro(g, i) {
      if (i.down('attack') && this.cdZ === 0) {         // segurando o J atira sem parar
        this.cdZ = EN_Z_T;
        this.pose = 8;
        const v = DIR_VEC[this.dir], m = this.muzzle(8);
        const a = Math.atan2(v[1], v[0]) + (Math.random() - 0.5) * EN_Z_ESPALHA;
        const sh = new Shot(m[0] - 2, m[1] - 2, Math.cos(a) * EN_Z_SPD, Math.sin(a) * EN_Z_SPD, 'prego', this.danoArma(), this.dir);
        sh.friendly = true; sh.life = 90;
        g.addEnt(sh);
        g.particles.spawn(m[0], m[1], 0, 0, 5, 1, 1, 0);
        if ((this.tiros++ & 1) === 0) Sound.play('shoot');
      }
      if (i.hit('special')) {
        if (this.spCd > 0) this.bloqueado(g, this.spCd);
        else {
          this.spCd = this.spMax;
          const minhas = g.ents.filter((e) => e instanceof Torreta && e.dono === this && !e.dead);
          if (minhas.length >= EN_TORRETAS) minhas[0].some(g);          // a mais velha sai
          g.addEnt(new Torreta(this, this.cx, this.cy + 2, this.dano()));
          Sound.play('key');
          g.say('TORRETA!', 50);
        }
      }
      if (i.hit('spin')) {
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else {
          this.spinCd = this.spinMax;
          g.addEnt(new CampoRefletor(this));
          Sound.play('secret');
          g.say('CAMPO REFLETOR!', 60);
        }
      }
      if (i.hit('gold')) {
        if (this.goldCd > 0) this.bloqueado(g, this.goldCd);
        else {
          this.goldCd = this.goldMax;
          this.laser = EN_LASER_T;
          Sound.play('shootbig');
          g.say('LASER! MIRE COM AS SETAS', 60);
        }
      }
    }

    // parado mirando com as setas; o feixe vai ate a parede e acerta tudo no caminho
    updateLaser(g, i) {
      let dx = 0, dy = 0;
      if (i.down('left')) dx -= 1;
      if (i.down('right')) dx += 1;
      if (i.down('up')) dy -= 1;
      if (i.down('down')) dy += 1;
      if (dx || dy) this.dir = dir8(dx, dy);
      const v = DIR_VEC[this.dir], m = this.muzzle(6);
      let len = 4;
      while (len < 480) {
        const px = m[0] + v[0] * len, py = m[1] + v[1] * len;
        if (px < 0 || py < 0 || px > VIEW_W || py > VIEW_H || G.boxSolid(g.room, px - 1, py - 1, 2, 2, true)) break;
        len += 3;
      }
      this.laserLen = len;
      if (this.laser % EN_LASER_TICK === 0) {
        for (const e of g.alvos(this)) {
          if (e.dead) continue;
          for (let d = 0; d <= len; d += 4) {
            const px = m[0] + v[0] * d, py = m[1] + v[1] * d;
            if (px < e.x - 3 || px > e.x + e.w + 3 || py < e.y - 3 || py > e.y + e.h + 3) continue;
            G.ferir(g, e, this.dano(), v[0], v[1], this);
            g.particles.burst(px, py, 4, 2, 1.4, 10);
            break;
          }
        }
        Sound.play('shoot');
      }
      g.particles.spawn(m[0] + v[0] * len, m[1] + v[1] * len, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 10, 2, 1, 0);
      this.pose = 2; this.anim = 0;
      if (--this.laser < 0) this.laser = 0;
    }

    /* ---------- druida: Z espinho (ou garras), X lobo, C urso, V bosque ---------- */

    lancaEspinho(g) {
      const v = DIR_VEC[this.dir], m = this.muzzle(8);
      const sh = new Shot(m[0] - 3, m[1] - 3, v[0] * 3.4, v[1] * 3.4, 'espinho', this.danoArma(), this.dir);
      sh.friendly = true;
      sh.onHit = (g2, e) => { e.raiz = Math.max(e.raiz || 0, DR_RAIZ_T); };
      g.addEnt(sh);
      Sound.play('bow');
    }

    updateDruida(g, i) {
      if (i.hit('special')) {
        if (this.spCd > 0) this.bloqueado(g, this.spCd);
        else { this.spCd = this.spMax; this.mudaForma(g, 'lobo', DR_FORMA_T); }
      }
      if (i.hit('spin')) {
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else { this.spinCd = this.spinMax; this.mudaForma(g, 'urso', DR_FORMA_T); }
      }
      if (i.hit('gold')) {
        if (this.goldCd > 0) this.bloqueado(g, this.goldCd);
        else {
          this.goldCd = this.goldMax;
          g.addEnt(new Bosque(this, this.cx, this.cy));
          Sound.play('secret');
          g.say('BOSQUE SAGRADO!', 60);
        }
      }
    }

    mudaForma(g, forma, t) {
      this.forma = forma; this.formaT = t || 0;
      if (this.turbo === 0) this.speed = this.velBase();
      this.atk = 0; this.trailN = 0;
      g.particles.burst(this.cx, this.cy, 20, 3, 2, 22);
      Sound.play(forma === 'humano' ? 'menu' : 'secret');
      if (forma !== 'humano') g.say(forma === 'lobo' ? 'FORMA DE LOBO!' : 'FORMA DE URSO!', 60);
    }

    /* ---------- vampira: X lanca, C morcegos, V banquete (custam vida) ---------- */

    updateVampira(g, i) {
      if (i.hit('special')) {
        this.gastaSangue(g, 0, () => {
          const v = DIR_VEC[this.dir], m = this.muzzle(8);
          g.addEnt(new LancaSangue(m[0], m[1], v[0], v[1], this.dano() * VP_LANCA_MULT));
          Sound.play('shootbig');
          g.say('LANCA DE SANGUE!', 40);
        });
      }
      if (i.hit('spin')) {
        this.gastaSangue(g, 1, () => {
          this.morcego = VP_MORCEGO_T; this.morcegoHit = new Map();
          g.particles.burst(this.cx, this.cy, 20, 8, 2, 20);
          Sound.play('spin');
          g.say('ENXAME DE MORCEGOS!', 50);
        });
      }
      if (i.hit('gold')) {
        this.gastaSangue(g, 2, () => {
          const alvos = g.alvos(this);
          if (!alvos.length) { g.say('NENHUM INIMIGO', 40); return false; }
          g.addEnt(new Banquete(this, alvos, this.dano() * VP_BANQUETE_MULT));
          Sound.play('nova');
          g.say('BANQUETE!', 60);
          return true;
        });
      }
    }

    // X, C e V da vampira custam meios-coracoes e tem recarga curta; nunca deixam com 0 de vida
    gastaSangue(g, k, fn) {
      const cds = ['cdX', 'cdC', 'cdV'];
      if (this[cds[k]] > 0) { Sound.play('blocked'); return; }
      const custo = this.def.custo[k];
      if (this.hp <= custo) { Sound.play('blocked'); g.say('SANGUE INSUFICIENTE', 50); return; }
      if (fn() === false) { Sound.play('blocked'); return; }
      this.hp -= custo;
      this[cds[k]] = this.def.recarga[k];
      g.particles.burst(this.cx, this.cy, 8, 2, 1.4, 16);
    }

    // enxame de morcegos: intocavel e mais rapido; atravessa os alvos mordendo e curando
    updateMorcego(g, i) {
      let dx = 0, dy = 0;
      if (i.down('left')) dx -= 1;
      if (i.down('right')) dx += 1;
      if (i.down('up')) dy -= 1;
      if (i.down('down')) dy += 1;
      if (dx && dy) { dx *= D; dy *= D; }
      if (dx || dy) {
        this.dir = dir8(dx, dy);
        G.moveEnt(this, g.room, dx * VP_MORCEGO_SPD, dy * VP_MORCEGO_SPD, true, true);
      }
      for (const e of g.alvos(this)) {
        if (e.dead || !G.overlap(this.x - 4, this.y - 4, this.w + 8, this.h + 8, e.x, e.y, e.w, e.h)) continue;
        const ult = this.morcegoHit.get(e);
        if (ult !== undefined && g.tick - ult < VP_MORCEGO_CD) continue;
        this.morcegoHit.set(e, g.tick);
        const d = G.dist(this.cx, this.cy, e.cx, e.cy) || 1;
        G.ferir(g, e, this.dano() * 2, (e.cx - this.cx) / d, (e.cy - this.cy) / d, this);
        this.heal(1);
        g.particles.burst(e.cx, e.cy, 6, 2, 1.4, 12);
      }
      if ((g.tick & 1) === 0) g.particles.spawn(this.cx, this.cy, (Math.random() - 0.5), (Math.random() - 0.5), 12, 8, 1, 0);
      this.anim++;
      if (--this.morcego <= 0) { this.morcego = 0; g.particles.burst(this.cx, this.cy, 14, 8, 1.6, 16); }
    }

    /* ---------- Percy: X tridente, C barreira, V redemoinho ---------- */

    updatePercy(g, i) {
      if (i.hit('special')) {
        if (this.xCd > 0) Sound.play('blocked');
        else {
          this.xCd = this.def.xEspera;
          this.tridenteT = PC_TRI_IDA + PC_TRI_VOLTA;
          const v = DIR_VEC[this.dir];
          g.addEnt(new TridenteVoo(this, v[0], v[1], this.dano() * PC_TRI_MULT));
          Sound.play('shootbig');
          g.shake(3);
          g.say('TRIDENTE!', 50);
        }
      }
      if (i.hit('spin')) {
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else {
          this.spinCd = this.spinMax;
          g.addEnt(new BarreiraAgua(this));
          Sound.play('wave');
          g.say('BARREIRA DE AGUA!', 60);
        }
      }
      if (i.hit('gold')) {
        if (this.goldCd > 0) this.bloqueado(g, this.goldCd);
        else {
          this.goldCd = this.goldMax;
          g.addEnt(new RedemoinhoAgua(VIEW_W / 2, VIEW_H / 2, this.dano() * PC_TORNADO_MULT));
          Sound.play('spin');
          g.shake(4);
          g.say('REDEMOINHO!', 60);
        }
      }
    }

    /* ---------- guerreiro: X investida, C giro, V investida relampago ---------- */

    especialAtivo() { return this.dashLeft > 0 || this.giro > 0 || this.rush !== null; }

    cancelaEspeciais() {
      this.laser = 0;
      this.dashLeft = 0; this.giro = 0; this.rush = null; this.lamina = null; this.golpeChao = null;
      this.spCharging = false; this.spCharge = 0;
    }

    updateKnight(g, i) {
      if (i.hit('spin')) {
        if (this.spinCd > 0) this.bloqueado(g, this.spinCd);
        else { this.iniciaGiro(g); return; }
      }
      if (i.hit('gold')) {
        if (this.goldCd > 0) this.bloqueado(g, this.goldCd);
        else if (this.iniciaRush(g)) return;
      }
      if (i.hit('special')) {
        if (this.xCd > 0) Sound.play('blocked');
        else this.soltarInvestida(g);
      }
    }

    // um aperto no X ja solta a investida inteira: atravessa a sala com 3x o dano da espada
    soltarInvestida(g) {
      const cheia = true;
      this.spCharging = false; this.spCharge = 0;
      const v = DIR_VEC[this.dir];
      this.lamina = Math.atan2(v[1], v[0]);
      this.dashLeft = KN_DASH_LONG;
      this.dashDmg = this.dano() * KN_DASH_MULT;
      this.dashCheia = cheia;
      this.hitSet.clear();
      this.xCd = this.def.xEspera;
      this.inv = Math.max(this.inv, KN_INV_GOLPE);
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
      this.giro = KN_GIRO_T;
      this.giroAng = Math.atan2(v[1], v[0]);
      this.spinCd = this.spinMax;
      this.inv = Math.max(this.inv, KN_INV_GOLPE);
      this.spCharging = false; this.spCharge = 0;
      this.hitSet.clear();
      Sound.play('spin');
      g.particles.burst(this.cx, this.cy, 20, 0, 2.2, 22);
      g.shake(4);
      g.say('TORNADO DE ACO!', 60);
    }

    // gira por 4 s correndo atras do inimigo mais proximo, com o dobro da velocidade de andar
    updateGiro(g) {
      const feito = KN_GIRO_T - this.giro;
      if (feito > 0 && feito % KN_GIRO_VOLTA === 0) {   // cada volta acerta de novo
        this.hitSet.clear();
        Sound.play('swing');
      }
      const ang = this.giroAng + (feito / KN_GIRO_VOLTA) * Math.PI * 2;
      this.lamina = ang;
      this.dir = dir8(Math.cos(ang), Math.sin(ang));   // a mao acompanha a lamina
      const alvo = this.proximoAlvo(g, new Set());
      if (alvo) {
        const dx = alvo.cx - this.cx, dy = alvo.cy - this.cy, d = Math.hypot(dx, dy);
        if (d > 2) {
          const sp = Math.min(d, this.velBase() * 2);
          // nao passa da borda: senao troca de sala no meio do golpe
          const nx = G.clamp(this.x + (dx / d) * sp, 1, G.VIEW_W - this.w - 1);
          const ny = G.clamp(this.y + (dy / d) * sp, 1, G.VIEW_H - this.h - 1);
          G.moveEnt(this, g.room, nx - this.x, ny - this.y, false, false);
        }
      }
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
        G.paralisa(e, KN_RUSH_PARA);
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
        pierce: opt.pierce !== undefined ? opt.pierce : (cheia ? 1 : 0),
        explode: opt.explode
      }));
      return cheia;
    }

    soltarFlecha(g) {
      const t = Math.min(1, this.charge / ATK_CHARGE_MAX);
      const cheia = this.lancarFlecha(g, t, {
        dmg: this.danoArma() * (t >= 0.85 ? 2 : 1),
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
      this.spCd = this.spMax;
      this.atk = BOW_TIME - BOW_FIRE;
      g.say(cheia ? 'CHUVA DE FLECHAS!' : 'SALVA DE FLECHAS!', 70);
    }

    salva(g, cheia) {
      const dmg = this.danoArma() * AR_X_MULT;                // carregada ou nao: 2x a flecha do Z
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
      g.addEnt(new GoldArrow(m[0], m[1], v[0] * GOLD_SPD, v[1] * GOLD_SPD, this.danoArma() * GOLD_MULT));
      this.goldCd = this.goldMax;
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
      const sh = new Shot(m[0] - 4, m[1] - 4, v[0] * e.vel, v[1] * e.vel, e.sprite, e.dmg * this.sword + (this.compras.arma ? 1 : 0), this.dir);
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
      if (this.magiaCd > 0) this.magiaCd--;
      if (this.fireCd > 0) this.fireCd--;   // so o F tem recarga por tempo
      if (this.xCd > 0) this.xCd--;
      if (this.tridenteT > 0) this.tridenteT--;
      if (this.pose > 0) this.pose--;
      if (this.cdZ > 0) this.cdZ--;
      if (this.cdX > 0) this.cdX--;
      if (this.cdC > 0) this.cdC--;
      if (this.cdV > 0) this.cdV--;
      if (this.eco > 0) this.eco--;
      if (this.formaT > 0 && --this.formaT === 0) this.mudaForma(g, 'humano');
      if (this.def.modo === 'crono') this.gravaHistorico(g);
      if (this.turbo > 0 && --this.turbo === 0) this.speed = this.velBase();
      if (this.compras.cura && ++this.curaT >= CURA_T) {   // loja: cura automatica
        this.curaT = 0;
        if (this.hp < this.maxhp) {
          this.heal(1);
          g.particles.burst(this.cx, this.cy - 4, 6, 3, 1, 16);
        }
      }
      if (this.turbo > 0 && (g.tick & 3) === 0) {
        g.particles.spawn(this.cx + (Math.random() - 0.5) * 6, this.y + this.h, 0, -0.2, 10, 5, 1, 0);
      }

      if (this.fogo > 0) { tickFogo(g, this); if (this.dead) return; }
      if (this.gelo > 0 || this.para > 0 || this.raiz > 0) {   // congelado, paralisado ou preso: nao age
        if (this.gelo > 0) this.gelo--;
        if (this.para > 0) this.para--;
        if (this.raiz > 0) this.raiz--;
        efeitoParticulas(g, this);
        this.anim = 0;
        return;
      }
      if (this.lento > 0) { this.lento--; if (g.tick & 1) return; }   // lento: age um quadro sim, outro nao

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
      if (this.laser > 0) { this.updateLaser(g, i); return; }
      if (this.morcego > 0) { this.updateMorcego(g, i); return; }

      if (this.spin > 0) {
        this.spin--;
        const total = SPIN_DIRS.length * SPIN_VOLTAS, passo = SPIN_TIME / total;
        const idx = Math.min(total - 1, Math.floor((SPIN_TIME - this.spin) / passo));
        if (idx !== this.spinIdx) {
          this.spinIdx = idx;
          this.dir = SPIN_DIRS[idx % SPIN_DIRS.length];
          this.lancarFlecha(g, 0.35, { dmg: this.danoArma() * AR_C_MULT, range: SPIN_RANGE, explode: AR_C_RAIO });
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
        // so a recuperacao para quem nao gira arma (arco, bombas, relogio, espinho)
        if (!this.giraArma()) return;
        if (this.def.modo === 'magic' && this.atk === MAGIA_SOLTA) { this.lancarMagia(g); Sound.play('cast'); }
        if (this.atk <= ATK_WIND + ATK_SWING && this.atk > ATK_REC) {
          this.swingHit(g);
          const ang = this.swingAngle(), ponta = 21 * this.alcance();
          this.pushTrail(ang);             // eco novo na posicao atual da lamina
          g.particles.spawn(this.handX() + Math.cos(ang) * ponta, this.handY() + Math.sin(ang) * ponta,
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
      } else if (this.def.modo === 'ninja') {
        this.updateNinja(g, i);
      } else if (this.def.modo === 'percy') {
        this.updatePercy(g, i);
      } else if (this.def.modo === 'bomber') {
        this.updateBomber(g, i);
      } else if (this.def.modo === 'crono') {
        this.updateCrono(g, i);
      } else if (this.def.modo === 'necro') {
        this.updateNecro(g, i);
      } else if (this.def.modo === 'engenheiro') {
        this.updateEngenheiro(g, i);
      } else if (this.def.modo === 'druida') {
        this.updateDruida(g, i);
      } else if (this.def.modo === 'vampira') {
        this.updateVampira(g, i);
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
        const mirando = this.charging || (this.spCharging && this.def.modo === 'melee') ||
          (this.def.modo === 'engenheiro' && i.down('attack'));
        const sp = mirando ? this.speed * 0.55 : this.speed;   // mira pesa o passo
        G.moveEnt(this, g.room, dx * sp, dy * sp, false, true);
        this.anim += 1;
      } else {
        this.anim = 0;
      }

      if (i.hit('fire') && this.fireCd === 0) { this.castFire(g); return; }
      // o Percy fica sem o tridente enquanto ele esta arremessado
      if (i.hit('attack') && this.def.modo !== 'bow' && this.def.modo !== 'engenheiro' && !this.spCharging &&
        this.tridenteT === 0 && this.magiaCd === 0) {
        this.startAttack(g);
        if (this.def.modo === 'magic') this.magiaCd = MAGIA_CD;
      }
      else if (i.hit('roll') && this.rollCd === 0) {
        this.roll = ROLL_TIME; this.rollCd = ROLL_CD; this.inv = Math.max(this.inv, 12);
        Sound.play('swing');
      }
    }

    // sem mult e o ataque principal (J); com mult e um especial (giro do guerreiro)
    swingHit(g, mult) {
      const boxes = this.bladeBoxes();
      const dmg = mult ? this.dano() * mult : this.danoArma();
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
            if (!mult) this.roubaVida(g);
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

      const fNovo = {                          // F dos herois novos
        crono: () => new FimDosTempos(this),
        necro: () => new Submundo(this, g.alvos(this)),
        engenheiro: () => new EnxameDrones(this, g.alvos(this)),
        druida: () => new FuriaFloresta(this, g.alvos(this)),
        vampira: () => new LuaSangue(this)
      }[this.def.modo];
      if (fNovo) {
        g.addEnt(fNovo());
        g.particles.burst(this.cx, this.cy - 6, 16, 1, 1.8, 18);
        Sound.play('cast');
        g.say(this.def.skill + '!', 70);
        return;
      }

      if (this.def.modo === 'bomber') {       // bomber: bomba nuclear cai no meio da sala
        g.addEnt(new Nuclear(G.VIEW_W / 2, G.VIEW_H / 2));
        g.particles.burst(this.cx, this.cy - 6, 14, 9, 1.6, 18);
        Sound.play('cast');
        g.say(this.def.skill + '!', 70);
        return;
      }

      if (this.def.modo === 'percy') {        // Percy: tsunami varre a sala da esquerda para a direita
        g.addEnt(new Tsunami());
        g.particles.burst(this.cx, this.cy, 20, 4, 2.2, 22, 2);
        g.shake(6);
        Sound.play('wave');
        g.say(this.def.skill + '!', 70);
        return;
      }

      if (this.def.modo === 'ninja') {        // ninja: um explosivo em cada inimigo da sala
        const alvos = g.alvos(this);
        for (const e of alvos) g.addEnt(new Explosivo(this.cx, this.cy - 4, e));
        g.particles.burst(this.cx, this.cy, 16, 9, 2, 18);
        Sound.play('bow');
        g.say(alvos.length ? this.def.skill + '!' : 'NENHUM INIMIGO', 70);
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
      const autor = this.ultimoDono;
      this.ultimoDono = null;
      if (this.inv > 0 || this.roll > 0 || this.dead || this.rush || this.escudo > 0 || this.morcego > 0) return;
      if (!autor && g.danoRecebido) dmg = g.danoRecebido(dmg);   // dificuldade (golpes de monstros; no VS nao muda)
      if (this.forma === 'urso') dmg = Math.ceil(dmg / 2);   // urso: metade do dano
      G.danoNoOponente(g, this, autor, Math.min(dmg, this.hp));
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

    // espada do guerreiro, cajado do mago, katana do ninja ou tridente do Percy, na inclinacao do golpe, com rastro
    drawBlade(ctx, S, withBlade) {
      const set = S[this.armaSprite()];
      const n = S.bladeSteps, step = (Math.PI * 2) / n, piv = set.pivot || S.bladePivot;
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

      if (this.morcego > 0) {                  // vampira virada em enxame de morcegos
        for (let k = 0; k < 5; k++) {
          const a = tick * 0.2 + k * 1.25, r = 4 + (k % 2) * 4, img = S.bat[(tick >> 2) & 1];
          ctx.drawImage(img, (this.cx + Math.cos(a) * r - 8) | 0, (this.cy - 4 + Math.sin(a) * r * 0.7 - 8) | 0);
        }
        return;
      }
      const arte = this.forma !== 'humano' ? S.feras[this.forma] : S.heroes[this.cls];
      if (this.eco > 0 && this.ecoPts) {        // cronomante: rastro de onde passou ao rebobinar
        ctx.globalAlpha = 0.35 * this.eco / 40;
        for (const [ex, ey] of this.ecoPts) ctx.drawImage(arte.walk.down[0], (ex + this.w / 2 - 8) | 0, (ey + this.h - 14) | 0);
        ctx.globalAlpha = 1;
      }
      const meio = this.def.modo === 'bow' ? BOW_FIRE : ATK_WIND + ATK_SWING;
      const winding = this.charging || this.spCharging || this.atk > meio;
      const img = (this.atk > 0 || this.pose > 0 || this.charging || this.spCharging || this.spin > 0 || this.lamina !== null)
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
      const modo = this.def.modo;
      const melee = this.giraArma();             // espada, cajado, katana, tridente, foice, rapieira e garras
      const temArma = this.atk > 0 || this.charging || this.spCharging || this.spin > 0 || this.lamina !== null, temRastro = melee && this.trailN > 0;
      const arma = () => {
        if (!melee) { if (temArma && modo === 'bow') this.drawArma(ctx, S); return; }
        if (temArma) this.drawBlade(ctx, S, true);
        else if (temRastro) this.drawBlade(ctx, S, false);
      };

      if (!naFrente) arma();
      ctx.drawImage(img, dx, dy);
      if (naFrente) arma();
      desenhaEfeito(ctx, this, dx, dy, 16, 16, tick);
      if (this.laser > 0) {                     // engenheiro: feixe vermelho com miolo branco
        const v = DIR_VEC[this.dir], m = this.muzzle(6), n = this.laserLen | 0, w = (tick & 2) ? 3 : 2;
        ctx.fillStyle = 'rgba(255,60,60,0.8)';
        for (let d = 0; d < n; d++) ctx.fillRect((m[0] + v[0] * d - w / 2) | 0, (m[1] + v[1] * d - w / 2) | 0, w, w);
        ctx.fillStyle = '#fff6f0';
        for (let d = 0; d < n; d++) ctx.fillRect((m[0] + v[0] * d) | 0, (m[1] + v[1] * d) | 0, 1, 1);
      }
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

  // dano sem empurrao nem invencibilidade (queimadura, choque, veneno); conta o abate para quem lancou
  function danoDireto(g, e, n, dono) {
    if (e.dead || e.escudo > 0) return;
    if (e instanceof Player) G.danoNoOponente(g, e, dono, Math.min(n, e.hp));
    if (dono) e.ultimoDono = dono;
    cargaNoChefe(g, e, Math.min(n, e.hp));             // queimadura e veneno no chefe tambem carregam
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
    const f0 = g.fonteDano;
    g.fonteDano = e.fogoFonte || null;
    queima(g, e);
    g.fonteDano = f0;
  }
  function queima(g, e) {
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
    if (e.raiz > 0) {                             // raizes verdes subindo pelas pernas
      ctx.fillStyle = '#3f8a2a';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 2 + k * ((w - 4) / 3) | 0, y + h - 3 - (k & 1), 1, 3 + (k & 1));
      ctx.fillStyle = '#7fd858';
      ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
    }
    if (e.lento > 0) {                            // relogio azul girando devagar
      ctx.fillStyle = '#5ce1ff';
      const a = tick * 0.05;
      ctx.fillRect((x + w / 2 + Math.cos(a) * (w / 2 + 2)) | 0, (y + 2 + Math.sin(a) * 3) | 0, 2, 2);
    }
    if (e.para > 0) {
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

  // dano causado num chefe carrega o X, C e V de quem bateu (como os abates)
  function cargaNoChefe(g, e, dmg) {
    const p = e.ultimoDono;
    if (!e.boss || !(p instanceof Player) || dmg <= 0) return;
    p.danoChefe = (p.danoChefe || 0) + Math.min(dmg, DANO_POR_CARGA * CARGA_MAX_GOLPE);
    const n = Math.floor(p.danoChefe / DANO_POR_CARGA);
    if (!n) return;
    p.danoChefe -= n * DANO_POR_CARGA;
    if (p.carrega(n, g.fonteDano) && p === g.player) g.cdPulse = 10;
  }

  class Enemy extends Ent {
    constructor(x, y, w, h, hp) {
      super(x, y, w, h);
      this.enemy = true;
      this.hp = hp; this.maxhp = hp;
      this.touch = 1;
      this.kx = 0; this.ky = 0; this.knock = 0;
      this.spd = 0.5;
      this.gelo = 0; this.fogo = 0; this.para = 0;   // efeitos das magias do mago
      this.raiz = 0; this.lento = 0;               // preso por raizes (druida) e lento (cronomante)
      this.t = (Math.random() * 120) | 0;
      this.loot = 1;
    }

    update(g) {
      if (this.hurtT > 0) this.hurtT--;
      if (this.fogo > 0) { tickFogo(g, this); if (this.dead) return; }
      if (this.gelo > 0 || this.para > 0) {         // congelado ou paralisado: nao anda nem machuca
        if (this.gelo > 0) this.gelo--;
        if (this.para > 0) this.para--;
        this.knock = 0;
        efeitoParticulas(g, this);
        return;
      }
      if (this.raiz > 0) {                          // preso por raizes: nao sai do lugar, mas machuca no toque
        this.raiz--;
        this.knock = 0;
        this.contact(g);
        return;
      }
      if (this.lento > 0) { this.lento--; if (g.tick & 1) { this.contact(g); return; } }   // metade da velocidade
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
      if (this.gelo > 0 || this.para > 0 || this.raiz > 0) return;   // preso no gelo, paralisado ou enraizado nao sai do lugar
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
      cargaNoChefe(g, this, Math.min(dmg, this.hp));
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
    if (!img || !(this.gelo > 0 || this.fogo > 0 || this.para > 0 || this.raiz > 0 || this.lento > 0)) return;
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
          if (this.onHit) this.onHit(g, e);
          if (this.elem && this.elem.id !== 'fogo') {   // a bola de fogo so causa o dano do impacto
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
          if (!p.dead && this.hits(p)) {
            p.hurt(g, this.dmg, this.cx, this.cy);
            if (this.onHit) this.onHit(g, p);
            this.burst(g);
            return;
          }
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
      this.explode = opt.explode || 0;          // raio: explode ao acertar, bater ou acabar o alcance
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
      if (G.boxSolid(g.room, this.x + 1, this.y + 1, 4, 4, true)) { this.estoura(g); this.gastar(g, true); return; }

      const alvos = g.alvos(this.dono);
      for (let i = 0; i < alvos.length; i++) {
        const e = alvos[i];
        if (e.dead || this.atingidos.indexOf(e) >= 0) continue;
        if (!this.hits(e)) continue;
        if (this.explode) { this.estoura(g); this.gastar(g, false); return; }   // a explosao ja pega o alvo
        G.ferir(g, e, this.dmg, this.vx / this.speed, this.vy / this.speed, this.dono);
        if (this.empurrao && !e.dead && e.empurra) e.empurra(this.vx / this.speed, this.vy / this.speed, this.empurrao);
        this.atingidos.push(e);
        if (this.pierce > 0) this.pierce--;
        else { this.gastar(g, true); return; }
      }

      if (this.traveled >= this.range) { this.estoura(g); this.gastar(g, true); }
      else if (this.explode && (g.tick & 1) === 0) g.particles.spawn(this.cx, this.cy, 0, 0, 8, 9, 1, 0);
    }

    // flecha explosiva (giro do arqueiro)
    estoura(g) {
      if (!this.explode) return;
      explosao(g, this.cx, this.cy, this.explode, this.dmg, this.dono);
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
      this.grudada = null;                     // { alvo, ox, oy, t }: cravada no ultimo inimigo
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

      if (this.grudada) { this.updateGrudada(g); return; }
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
        const dx = this.vx / GOLD_SPD, dy = this.vy / GOLD_SPD;
        G.ferir(g, e, this.dmg, dx, dy, this.dono);
        // monstro comum morre na hora; chefe leva so os 4x; oponente do VS tambem so leva o dano
        if (!e.dead && !e.boss && !(e instanceof Player)) G.ferirBruto(g, e, 9999, dx, dy, this.dono);
        Sound.play('goldhit');
        g.particles.burst(this.cx, this.cy, 10, 1, 2, 16);
        if (e === this.alvo) this.alvo = null;
        // era o ultimo da sala: crava nele e explode
        if (!this.procurar(g)) {
          this.grudada = { alvo: e, ox: this.cx - e.cx, oy: this.cy - e.cy, t: GOLD_GRUDA };
          Sound.play('charged');
          return;
        }
      }
    }

    updateGrudada(g) {
      const gr = this.grudada;
      if (gr.alvo && !gr.alvo.dead) { this.x = gr.alvo.cx + gr.ox - this.w / 2; this.y = gr.alvo.cy + gr.oy - this.h / 2; }
      if ((g.tick & 1) === 0) {
        const a = Math.random() * Math.PI * 2;
        g.particles.spawn(this.cx + Math.cos(a) * 8, this.cy + Math.sin(a) * 8, -Math.cos(a) * 0.6, -Math.sin(a) * 0.6, 10,
          (gr.t >> 2) & 1 ? 0 : 1, 1, 0);
      }
      if (--gr.t > 0) return;
      explosao(g, this.cx, this.cy, GOLD_EXPL_R, this.dmg, this.dono);
      g.particles.burst(this.cx, this.cy, 30, 1, 3, 26, 2);
      g.flashT = Math.max(g.flashT || 0, 6);
      Sound.play('shootbig');
      this.grudada = null;
      this.sumir(g);
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
        if (this.grudada && ((this.grudada.t >> 2) & 1)) {   // pisca antes de explodir
          ctx.fillStyle = '#ffffff';
          ctx.fillRect((this.cx - 2) | 0, (this.cy - 2) | 0, 4, 4);
        }
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
        // ignora armadura e fases intangiveis; chefe leva 1/3, jogador (VS) leva PVP_F
        const dmg = e instanceof Player ? PVP_F : e.boss ? Math.max(1, Math.ceil(e.maxhp / (e.fracF || 3))) : 999;
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

  /* ================= ninja ================= */

  // estrela ninja: gira, atravessa paredes e inimigos e so some na borda da sala
  class Estrela extends Ent {
    constructor(x, y, vx, vy, dmg) {
      super(x - 3, y - 3, 6, 6);
      this.vx = vx; this.vy = vy; this.dmg = dmg;
      this.friendly = true; this.shot = true;
      this.atingidos = new Set();
    }
    update(g) {
      this.anim++;
      this.x += this.vx; this.y += this.vy;
      if (this.x < -8 || this.y < -8 || this.x > VIEW_W + 8 || this.y > VIEW_H + 8) { this.dead = true; return; }
      const alvos = g.alvos(this.dono);
      for (let i = 0; i < alvos.length; i++) {
        const e = alvos[i];
        if (e.dead || this.atingidos.has(e) || !this.hits(e)) continue;
        this.atingidos.add(e);
        G.ferir(g, e, this.dmg, this.vx / NJ_ESTRELA_SPD, this.vy / NJ_ESTRELA_SPD, this.dono);
        g.particles.burst(this.cx, this.cy, 6, 5, 1.4, 12);
      }
    }
    draw(ctx, S) {
      const img = S.estrela[(this.anim >> 1) & 1];
      ctx.drawImage(img, (this.cx - 4) | 0, (this.cy - 4) | 0);
    }
  }

  // nevoa de veneno: cobre a sala toda por 6 s; todos menos o ninja levam 1 de dano por segundo
  class NevoaVeneno extends Ent {
    constructor(dono) {
      super(0, VIEW_H, 0, 0);                  // desenhada por cima de tudo
      this.dono = dono;
      this.t = NJ_VENENO_T;
      this.tick = NJ_VENENO_TICK;
    }
    update(g) {
      if (--this.t <= 0) { this.dead = true; return; }
      for (let k = 0; k < 2; k++) {
        g.particles.spawn(Math.random() * VIEW_W, Math.random() * VIEW_H, (Math.random() - 0.5) * 0.3, -0.3,
          20 + Math.random() * 20, Math.random() < 0.7 ? 3 : 8, 2, 0);
      }
      if (--this.tick > 0) return;
      this.tick = NJ_VENENO_TICK;
      for (const e of g.alvos(this.dono)) {
        danoDireto(g, e, 1, this.dono);
        g.particles.burst(e.cx, e.cy, 6, 3, 1.2, 14);
      }
    }
    draw(ctx, S, tick) {
      const fade = Math.min(1, this.t / 40, (NJ_VENENO_T - this.t) / 20);
      ctx.fillStyle = 'rgba(90,190,60,' + (0.22 * fade).toFixed(3) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = 'rgba(140,230,90,' + (0.35 * fade).toFixed(3) + ')';
      for (let k = 0; k < 40; k++) {                // manchas de nevoa passando devagar
        const x = (k * 71 + tick * (0.3 + (k % 3) * 0.2)) % VIEW_W, y = (k * 43) % VIEW_H;
        ctx.fillRect(x | 0, y | 0, 6 + (k % 4) * 2, 2);
      }
    }
  }

  // explosivo do F do ninja: voa em arco ate o alvo e explode nele. Monstro morre,
  // chefe leva 1/3 da vida, oponente no VS leva PVP_F
  class Explosivo extends Ent {
    constructor(x0, y0, alvo) {
      super(x0 - 4, y0 - 4, 8, 8);
      this.x0 = x0; this.y0 = y0; this.alvo = alvo;
      this.tx = alvo.cx; this.ty = alvo.cy;
      this.t = 0; this.alt = 0;
    }
    update(g) {
      this.anim++;
      if (!this.alvo.dead) { this.tx = this.alvo.cx; this.ty = this.alvo.cy; }
      const k = ++this.t / NJ_BOMBA_VOO;
      this.x = G.lerp(this.x0, this.tx, k) - 4; this.y = G.lerp(this.y0, this.ty, k) - 4;
      this.alt = Math.sin(k * Math.PI) * 18;
      if (this.t < NJ_BOMBA_VOO) return;
      this.dead = true;
      g.particles.burst(this.cx, this.cy, 26, 9, 2.8, 24, 2);
      g.particles.burst(this.cx, this.cy, 10, 1, 1.6, 20);
      g.shake(8);
      g.flashT = Math.max(g.flashT, 6);
      Sound.play('fire');
      const e = this.alvo;
      if (!e.dead) {
        const a = Math.atan2(e.cy - this.y0, e.cx - this.x0);
        const dmg = e instanceof Player ? PVP_F : e.boss ? Math.max(1, Math.ceil(e.maxhp / (e.fracF || 3))) : 999;
        G.ferirBruto(g, e, dmg, Math.cos(a), Math.sin(a), this.dono);
      }
      // o que nasce da explosao (slime que se divide) tambem vai junto
      for (const o of g.alvos(this.dono)) {
        if (o.dead || o.boss || o instanceof Player || G.dist(o.cx, o.cy, this.cx, this.cy) > 18) continue;
        G.ferirBruto(g, o, 999, 0, 0, this.dono);
      }
    }
    draw(ctx, S) {
      const cx = this.cx | 0, cy = this.cy | 0;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(cx - 3, cy + 3, 7, 2);
      ctx.drawImage(S.bomba[(this.anim >> 2) & 1], cx - 4, (cy - 5 - this.alt) | 0);
    }
  }

  /* ================= bomber ================= */

  // explosao das bombas do bomber: dano em todos os alvos no raio (nunca no proprio bomber)
  function explosao(g, x, y, r, dmg, dono) {
    for (const e of g.alvos(dono)) {
      if (e.dead || G.dist(x, y, e.cx, e.cy) > r + Math.max(e.w, e.h) / 2) continue;
      const a = Math.atan2(e.cy - y, e.cx - x);
      G.ferir(g, e, dmg, Math.cos(a), Math.sin(a), dono);
    }
    g.particles.burst(x, y, 10 + (r >> 1), 9, 1 + r / 14, 20, 2);
    g.particles.burst(x, y, 6 + (r >> 2), 5, 1.2, 26);
    g.shake(Math.min(10, 2 + r / 6));
    Sound.play('fire');
  }

  // bomba do Z: voa em arco e explode ao cair. A grande tem o dobro do tamanho
  class BombaJogador extends Ent {
    constructor(x0, y0, x1, y1, dmg, raio, grande) {
      super(x0 - 4, y0 - 4, 8, 8);
      this.x0 = x0; this.y0 = y0;
      this.x1 = G.clamp(x1, 8, VIEW_W - 8); this.y1 = G.clamp(y1, 8, VIEW_H - 8);
      this.dmg = dmg; this.raio = raio; this.grande = grande;
      this.t = 0; this.voo = grande ? BM_VOO + 6 : BM_VOO; this.alt = 0;
      this.friendly = true;
    }
    update(g) {
      this.anim++;
      const k = ++this.t / this.voo;
      this.x = G.lerp(this.x0, this.x1, k) - 4; this.y = G.lerp(this.y0, this.y1, k) - 4;
      this.alt = Math.sin(k * Math.PI) * (this.grande ? 22 : 14);
      if (this.t < this.voo) return;
      this.dead = true;
      explosao(g, this.cx, this.cy, this.raio, this.dmg, this.dono);
      if (this.grande) { g.flashT = Math.max(g.flashT, 6); Sound.play('nova'); }
    }
    draw(ctx, S) {
      const sc = this.grande ? 2 : 1, cx = this.cx | 0, cy = this.cy | 0;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(cx - 3 * sc, cy + 3, 7 * sc, 2);
      ctx.drawImage(S.bomba[(this.anim >> 2) & 1], cx - 4 * sc, (cy - 5 * sc - this.alt) | 0, 8 * sc, 9 * sc);
    }
  }

  // mina (X): arma em 0,5 s e explode quando um alvo pisa nela
  class Mina extends Ent {
    constructor(x, y, dmg) {
      super(x - 4, y - 3, 8, 6);
      this.dmg = dmg;
      this.arma = BM_MINA_ARMA;
    }
    update(g) {
      this.anim++;
      if (this.arma > 0) { this.arma--; return; }
      for (const e of g.alvos(this.dono)) {
        if (e.dead || !G.overlap(this.x - 2, this.y - 2, this.w + 4, this.h + 4, e.x, e.y, e.w, e.h)) continue;
        this.dead = true;
        explosao(g, this.cx, this.cy, BM_MINA_RAIO, this.dmg, this.dono);
        return;
      }
    }
    draw(ctx, S, tick) {
      const x = this.x | 0, y = this.y | 0;
      ctx.fillStyle = '#23232e'; ctx.fillRect(x, y + 2, 8, 4);
      ctx.fillStyle = '#5c667e'; ctx.fillRect(x + 1, y + 1, 6, 2);
      ctx.fillStyle = this.arma > 0 ? '#5c667e' : (tick & 16) ? '#e33b4e' : '#6a1f24';
      ctx.fillRect(x + 3, y, 2, 1);
    }
  }

  // escudo de bombas (C): giram em volta do bomber; cada uma explode ao tocar um alvo,
  // desfaz tiros inimigos, e as que sobrarem explodem juntas depois de 7 s
  class EscudoBombas extends Ent {
    constructor(dono, dmg) {
      super(dono.x, dono.y, 0, 0);
      this.dono = dono; this.dmg = dmg;
      this.t = BM_ESCUDO_T;
      this.ang = 0;
      this.vivas = new Array(BM_ESCUDO_N).fill(true);
    }
    pos(k) {
      const a = this.ang + (k / BM_ESCUDO_N) * Math.PI * 2, d = this.dono;
      return [d.cx + Math.cos(a) * BM_ESCUDO_R, d.cy - 2 + Math.sin(a) * BM_ESCUDO_R * 0.8];
    }
    update(g) {
      const d = this.dono;
      if (d.dead) { this.dead = true; return; }
      this.ang += 0.09;
      this.t--;
      this.x = d.x; this.y = d.y + 1;               // desenhada junto do bomber
      const alvos = g.alvos(d);
      for (let k = 0; k < BM_ESCUDO_N; k++) {
        if (!this.vivas[k]) continue;
        const [bx, by] = this.pos(k);
        if (this.t <= 0) { this.vivas[k] = false; explosao(g, bx, by, BM_RAIO, this.dmg, d); continue; }
        for (const e of alvos) {
          if (e.dead || !G.overlap(bx - 4, by - 4, 8, 8, e.x, e.y, e.w, e.h)) continue;
          this.vivas[k] = false;
          explosao(g, bx, by, BM_RAIO, this.dmg, d);
          break;
        }
        if (!this.vivas[k]) continue;
        for (const s of g.ents) {
          if (!s.shot || s.friendly || s.dead || !G.overlap(bx - 4, by - 4, 8, 8, s.x, s.y, s.w, s.h)) continue;
          s.dead = true;
          g.particles.burst(s.cx, s.cy, 5, 5, 1.2, 10);
        }
      }
      if (!this.vivas.some(Boolean)) this.dead = true;
    }
    draw(ctx, S, tick) {
      const rapido = this.t < 90;                     // pavio acelera no fim
      for (let k = 0; k < BM_ESCUDO_N; k++) {
        if (!this.vivas[k]) continue;
        const [bx, by] = this.pos(k);
        ctx.drawImage(S.bomba[(rapido ? tick >> 1 : tick >> 3) & 1], (bx - 4) | 0, (by - 5) | 0);
      }
    }
  }

  // bomba quicante (V): pula de inimigo em inimigo (sempre o mais proximo ainda nao atingido),
  // explodindo em cada um. Monstro morre na hora, chefe leva 1/3 da vida, oponente no VS leva
  // BM_QUICA_PVP x o dano. Sem mais ninguem, some no ultimo pulo
  class BombaQuicante extends Ent {
    constructor(x0, y0, dmgPvp) {
      super(x0 - 4, y0 - 4, 8, 8);
      this.x0 = x0; this.y0 = y0; this.dmgPvp = dmgPvp;
      this.alvo = null; this.t = 0; this.alt = 0;
      this.feitos = new Set();
    }
    proximo(g) {
      let best = null, bd = Infinity;
      for (const e of g.alvos(this.dono)) {
        if (e.dead || this.feitos.has(e)) continue;
        const d = (e.cx - this.cx) ** 2 + (e.cy - this.cy) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    update(g) {
      this.anim++;
      if (!this.alvo || this.alvo.dead) {             // escolhe o proximo pulo a partir de onde esta
        this.alvo = this.proximo(g);
        if (!this.alvo) { this.dead = true; g.particles.burst(this.cx, this.cy, 8, 5, 1.2, 14); return; }
        this.x0 = this.cx; this.y0 = this.cy; this.t = 0;
      }
      const e = this.alvo;
      const k = ++this.t / BM_QUICA_VOO;
      this.x = G.lerp(this.x0, e.cx, k) - 4; this.y = G.lerp(this.y0, e.cy, k) - 4;
      this.alt = Math.sin(k * Math.PI) * 18;
      if (this.t < BM_QUICA_VOO) return;
      this.feitos.add(e);
      this.alvo = null;
      const dmg = e instanceof Player ? this.dmgPvp : e.boss ? Math.max(1, Math.ceil(e.maxhp / (e.fracF || 3))) : 999;
      G.ferirBruto(g, e, dmg, 0, -1, this.dono);
      g.particles.burst(e.cx, e.cy, 22, 9, 2.4, 22, 2);
      g.particles.burst(e.cx, e.cy, 8, 1, 1.4, 18);
      g.shake(6);
      Sound.play('fire');
    }
    draw(ctx, S) {
      const cx = this.cx | 0, cy = this.cy | 0;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(cx - 3, cy + 3, 7, 2);
      ctx.drawImage(S.bomba[(this.anim >> 1) & 1], cx - 4, (cy - 5 - this.alt) | 0);
    }
  }

  // bomba nuclear (F): cai do alto da tela no meio da sala; no impacto a tela fica branca
  // e volta com fade. Monstros morrem, chefes levam 1/3 e o oponente no VS leva PVP_F onde estiver
  class Nuclear extends Ent {
    constructor(tx, ty) {
      super(tx - 8, -48, 16, 16);
      this.tx = tx; this.ty = ty;
      this.t = 0;
    }
    update(g) {
      this.t++;
      const k = this.t / BM_NUKE_QUEDA;
      this.y = G.lerp(-48, this.ty, k * k) - 8;
      if ((this.t & 15) === 0) Sound.play('fire');
      if (this.t < BM_NUKE_QUEDA) return;
      this.dead = true;
      g.novaBlast(this.tx, this.ty, this.dono, Infinity);
      for (let n = 0; n < 60; n++) {                   // cogumelo subindo
        g.particles.spawn(this.tx + (Math.random() - 0.5) * 16, this.ty, (Math.random() - 0.5) * 1.6,
          -1.5 - Math.random() * 2.5, 30 + Math.random() * 30, Math.random() < 0.5 ? 9 : 5, 2, 0);
      }
      g.telaBranca();
      g.shake(18);
    }
    draw(ctx, S, tick) {
      const k = this.t / BM_NUKE_QUEDA;
      const r = 6 + k * 30;                              // sombra crescendo no ponto de impacto
      ctx.fillStyle = 'rgba(0,0,0,' + (0.15 + k * 0.35).toFixed(2) + ')';
      ctx.fillRect((this.tx - r) | 0, (this.ty - r * 0.35) | 0, (r * 2) | 0, Math.max(1, (r * 0.7) | 0));
      if ((tick & 8) && k > 0.3) {                       // mira piscando
        ctx.fillStyle = '#e33b4e';
        ctx.fillRect((this.tx - 10) | 0, this.ty | 0, 20, 1);
        ctx.fillRect(this.tx | 0, (this.ty - 6) | 0, 1, 12);
      }
      ctx.drawImage(S.bomba[(tick >> 2) & 1], (this.tx - 16) | 0, (this.y - 20) | 0, 32, 36);
    }
  }

  /* ================= Percy ================= */

  // tridente arremessado (X): vai ate a borda da sala e volta para a mao do Percy em 2 s,
  // atravessando paredes e acertando cada alvo uma vez na ida e outra na volta
  class TridenteVoo extends Ent {
    constructor(dono, vx, vy, dmg) {
      super(dono.cx - 6, dono.cy - 6, 12, 12);
      this.dono = dono; this.vx = vx; this.vy = vy; this.dmg = dmg;
      this.ox = dono.cx; this.oy = dono.cy - 3;
      const lim = (p, v, max) => (v > 0 ? (max - p) / v : v < 0 ? -p / v : Infinity);
      this.alc = Math.max(16, Math.min(lim(this.ox, vx, VIEW_W), lim(this.oy, vy, VIEW_H)));
      this.px = this.ox; this.py = this.oy; this.fx = 0; this.fy = 0;
      this.t = 0;
      this.friendly = true; this.shot = true;
      this.atingidos = new Set();
    }
    update(g) {
      const d = this.dono;
      this.t++;
      if (this.t <= PC_TRI_IDA) {                  // ida: sai rapido e freia na borda
        const k = this.t / PC_TRI_IDA, e = 1 - (1 - k) * (1 - k);
        this.px = this.ox + this.vx * this.alc * e;
        this.py = this.oy + this.vy * this.alc * e;
        if (this.t === PC_TRI_IDA) { this.fx = this.px; this.fy = this.py; this.atingidos.clear(); }
      } else {                                     // volta: acelera ate a mao
        const k = (this.t - PC_TRI_IDA) / PC_TRI_VOLTA, e = k * k;
        this.px = G.lerp(this.fx, d.cx, e);
        this.py = G.lerp(this.fy, d.cy - 3, e);
        if (this.t >= PC_TRI_IDA + PC_TRI_VOLTA) { this.dead = true; Sound.play('swing'); return; }
      }
      this.x = this.px - 6; this.y = this.py - 6;
      if ((g.tick & 1) === 0) g.particles.spawn(this.px, this.py, 0, 0, 10, (g.tick & 2) ? 4 : 0, 1, 0);
      const alvos = g.alvos(d);
      for (let i = 0; i < alvos.length; i++) {
        const e = alvos[i];
        if (e.dead || this.atingidos.has(e) || !this.hits(e)) continue;
        this.atingidos.add(e);
        const a = Math.atan2(e.cy - this.py, e.cx - this.px);
        G.ferir(g, e, this.dmg, Math.cos(a), Math.sin(a), d);
        g.particles.burst(e.cx, e.cy, 8, 4, 1.6, 14);
      }
    }
    draw(ctx, S) {
      const set = S.tridente, n = S.bladeSteps, step = (Math.PI * 2) / n, piv = set.pivot;
      // na ida aponta para onde vai; na volta a ponta fica virada para longe do Percy
      const ang = this.t <= PC_TRI_IDA ? Math.atan2(this.vy, this.vx)
        : Math.atan2(this.py - this.dono.cy, this.px - this.dono.cx);
      const img = set[((Math.round(ang / step) % n) + n) % n];
      const bx = this.px - Math.cos(ang) * 17, by = this.py - Math.sin(ang) * 17;   // meio da haste no centro
      ctx.drawImage(img, (bx - piv) | 0, (by - piv) | 0);
    }
  }

  // barreira de agua (C): 5 blocos lado a lado na frente do Percy por 8 s.
  // Inimigos (e o oponente no VS) nao atravessam, e tiros inimigos se desfazem nela
  class BarreiraAgua extends Ent {
    constructor(dono) {
      super(0, 0, 0, 0);
      this.dono = dono;
      const v = DIR_VEC[dono.dir];
      this.v = v;
      const diag = v[0] !== 0 && v[1] !== 0, esp = diag ? 12 : 16;
      const perp = [-v[1], v[0]];
      const cx = dono.cx + v[0] * 24, cy = dono.cy + v[1] * 24;
      this.blocos = [];
      for (let k = -(PC_BARREIRA_N >> 1); k <= PC_BARREIRA_N >> 1; k++) {
        this.blocos.push({ x: cx + perp[0] * k * esp - 8, y: cy + perp[1] * k * esp - 8, w: 16, h: 16 });
      }
      // ordena pelo pe do bloco mais baixo, para desenhar na profundidade certa
      this.y = Math.max(...this.blocos.map((b) => b.y)); this.h = 16;
      this.t = PC_BARREIRA_T;
    }
    update(g) {
      if (--this.t <= 0) {
        this.dead = true;
        for (const b of this.blocos) g.particles.burst(b.x + 8, b.y + 8, 8, 4, 1.4, 16);
        return;
      }
      const v = this.v;
      const alvos = g.alvos(this.dono);
      for (const e of alvos) {
        if (e.dead) continue;
        for (const b of this.blocos) {
          if (!G.overlap(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)) continue;
          // empurra para o lado da barreira em que o centro dele esta
          const lado = ((e.cx - b.x - 8) * v[0] + (e.cy - b.y - 8) * v[1]) >= 0 ? 1 : -1;
          for (let k = 0; k < 12 && G.overlap(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h); k++) {
            const ox = e.x, oy = e.y;
            G.moveEnt(e, g.room, v[0] * lado * 2, v[1] * lado * 2, e.fly, false);
            if (e.x === ox && e.y === oy) break;       // encostado na parede
          }
        }
      }
      for (const s of g.ents) {                      // tiros inimigos batem na agua
        if (!s.shot || s.friendly || s.dead) continue;
        if (this.blocos.some((b) => G.overlap(b.x, b.y, b.w, b.h, s.x, s.y, s.w, s.h))) {
          s.dead = true;
          g.particles.burst(s.cx, s.cy, 6, 4, 1.4, 12);
        }
      }
    }
    draw(ctx, S, tick) {
      if (this.t < 90 && (tick & 4)) return;         // pisca no ultimo 1,5 s
      for (const b of this.blocos) {
        const x = b.x | 0, y = b.y | 0;
        ctx.fillStyle = 'rgba(47,111,184,0.55)';
        ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = 'rgba(127,210,255,0.7)';
        for (let r = 0; r < 3; r++) {                // ondinhas correndo
          const o = ((tick >> 2) + r * 5) % 16;
          ctx.fillRect(x + o, y + 4 + r * 5, 4, 1);
        }
        ctx.fillStyle = '#eaffff';
        ctx.fillRect(x, y, 16, 1);
        ctx.fillRect(x + ((tick >> 1) % 16), y + 1, 2, 1);
      }
    }
  }

  // redemoinho de agua (V): puxa todos para o centro por 8 s e explode no fim
  class RedemoinhoAgua extends Ent {
    constructor(x, y, dmg) {
      super(x - 8, y - 8, 16, 16);
      this.ox = x; this.oy = y; this.dmg = dmg;
      this.t = PC_TORNADO_T;
    }
    update(g) {
      const alvos = g.alvos(this.dono);
      for (const e of alvos) {
        if (e.dead) continue;
        const dx = this.ox - e.cx, dy = this.oy - e.cy, d = Math.hypot(dx, dy);
        if (d < 4) continue;
        const f = Math.min(d, e.boss ? PC_PUXA_CHEFE : PC_PUXA);
        G.moveEnt(e, g.room, (dx / d) * f, (dy / d) * f, e.fly, false);
      }
      if ((g.tick & 1) === 0) {                      // agua girando para dentro
        const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 60;
        g.particles.spawn(this.ox + Math.cos(a) * r, this.oy + Math.sin(a) * r,
          -Math.cos(a) * 1.2 - Math.sin(a) * 0.8, -Math.sin(a) * 1.2 + Math.cos(a) * 0.8, 24, (g.tick & 2) ? 4 : 0, 1, 0);
      }
      if ((g.tick & 31) === 0) Sound.play('swing');
      if (--this.t > 0) return;
      this.dead = true;
      for (const e of alvos) {
        if (e.dead || G.dist(this.ox, this.oy, e.cx, e.cy) > PC_TORNADO_RAIO) continue;
        const a = Math.atan2(e.cy - this.oy, e.cx - this.ox);
        G.ferirBruto(g, e, this.dmg, Math.cos(a), Math.sin(a), this.dono);
      }
      for (let k = 0; k < 70; k++) {
        const a = (k / 70) * Math.PI * 2, v = 1.5 + Math.random() * 3;
        g.particles.spawn(this.ox, this.oy, Math.cos(a) * v, Math.sin(a) * v, 20 + Math.random() * 16,
          Math.random() < 0.6 ? 4 : 0, 2, 0);
      }
      g.flashT = Math.max(g.flashT, 8);
      g.shake(10);
      Sound.play('nova');
      g.say('EXPLOSAO DE AGUA!', 60);
    }
    draw(ctx, S, tick) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect((this.ox - 14) | 0, (this.oy + 6) | 0, 28, 4);
      const cores = ['#2f6fb8', '#5aa7ff', '#bfe6ff', '#ffffff'];
      for (let k = 0; k < 48; k++) {
        const h = k / 48, r = 4 + h * 16, a = tick * 0.35 + k * 0.8;
        const x = this.ox + Math.cos(a) * r, y = this.oy + 6 - h * 40 + Math.sin(a) * r * 0.3;
        ctx.fillStyle = cores[k & 3];
        ctx.fillRect(x | 0, y | 0, 2, 2);
      }
    }
  }

  // tsunami (F): uma onda entra pela esquerda e varre a sala, arrastando todos para a direita.
  // No fim os monstros morrem afogados, chefes levam 1/3 da vida e o oponente no VS so leva PVP_F,
  // ficando encostado na borda direita
  class Tsunami extends Ent {
    constructor() {
      super(0, VIEW_H, 0, 0);                        // desenhada por cima de tudo
      this.frente = -24;
      this.presos = new Set();
    }
    update(g) {
      this.frente += PC_TSUNAMI_SPD;
      for (const e of g.alvos(this.dono)) if (!e.dead && e.cx <= this.frente) this.presos.add(e);
      for (const e of this.presos) {
        if (e.dead) continue;
        e.x = Math.max(e.x, Math.min(this.frente - e.w, VIEW_W - e.w - 2));
        e.para = Math.max(e.para || 0, 2);           // preso na agua: nao anda nem ataca
        e.knock = 0;
        if ((g.tick & 3) === 0) g.particles.spawn(e.cx, e.y, (Math.random() - 0.5), -0.8, 12, 0, 1, 0);
      }
      if ((g.tick & 1) === 0) {
        for (let k = 0; k < 3; k++) {
          g.particles.spawn(this.frente, Math.random() * VIEW_H, 1 + Math.random(), -0.5 - Math.random(), 16,
            k === 0 ? 0 : 4, 2, 0);
        }
      }
      if (this.frente < VIEW_W + 24) return;
      this.dead = true;
      let mortos = 0, chefe = false;
      for (const e of this.presos) {
        if (e.dead) continue;
        desencalha(g, e);
        if (e instanceof Player) G.ferirBruto(g, e, PVP_F, 1, 0, this.dono);
        else if (e.boss) { G.ferirBruto(g, e, Math.max(1, Math.ceil(e.maxhp / (e.fracF || 3))), 1, 0, this.dono); chefe = true; }
        else { G.ferirBruto(g, e, 999, 1, 0, this.dono); mortos++; }
        g.particles.burst(e.cx, e.cy, 12, 4, 2, 18);
      }
      g.shake(8);
      Sound.play('nova');
      if (chefe) g.say('O CHEFE RESISTE!', 100);
      else if (mortos) g.say('SALA INUNDADA!', 90);
    }
    draw(ctx, S, tick) {
      const f = this.frente | 0;
      ctx.fillStyle = 'rgba(47,111,184,0.18)';        // agua que ficou para tras
      ctx.fillRect(0, 0, Math.max(0, f - 36), VIEW_H);
      ctx.fillStyle = 'rgba(47,111,184,0.6)';         // paredao da onda
      ctx.fillRect(f - 36, 0, 36, VIEW_H);
      ctx.fillStyle = 'rgba(90,167,255,0.75)';
      ctx.fillRect(f - 14, 0, 14, VIEW_H);
      for (let y = 0; y < VIEW_H; y += 2) {           // crista de espuma ondulando
        const o = Math.sin(y * 0.15 + tick * 0.3) * 3;
        ctx.fillStyle = (y & 4) ? '#eaffff' : '#bfe6ff';
        ctx.fillRect((f + o) | 0, y, 3, 2);
      }
    }
  }

  // tira da parede quem a agua largou dentro dela, puxando para a esquerda
  function desencalha(g, e) {
    for (let s = 0; s <= 96; s += 2) {
      if (!G.boxSolid(g.room, e.x - s, e.y, e.w, e.h, e.fly)) { e.x -= s; return; }
    }
  }

  /* ================= cronomante ================= */

  // paradoxo (V): marca todos; em 3 s cada um sofre de novo o dobro do dano que levou nesse meio
  // tempo (no minimo CR_PARADOXO_MIN; no VS no maximo CR_PARADOXO_PVP)
  class Paradoxo extends Ent {
    constructor(dono, alvos) {
      super(0, VIEW_H, 0, 0);
      this.dono = dono;
      this.marcas = alvos.map((e) => ({ e, hp0: e.hp }));
      this.t = CR_PARADOXO_T;
    }
    update(g) {
      if (--this.t > 0) return;
      this.dead = true;
      for (const m of this.marcas) {
        const e = m.e;
        if (e.dead) continue;
        let dmg = Math.max(CR_PARADOXO_MIN, Math.max(0, m.hp0 - e.hp) * 2);
        if (e instanceof Player) dmg = Math.min(dmg, CR_PARADOXO_PVP);
        G.ferirBruto(g, e, dmg, 0, -1, this.dono);
        g.particles.burst(e.cx, e.cy, 16, 4, 2, 20);
      }
      g.flashT = Math.max(g.flashT, 6);
      g.shake(6);
      Sound.play('goldhit');
    }
    draw(ctx, S, tick) {
      const k = 1 - this.t / CR_PARADOXO_T;
      for (const m of this.marcas) {
        const e = m.e;
        if (e.dead) continue;
        const cx = e.cx, cy = e.y - 8;
        ctx.fillStyle = (this.t < 40 && (tick & 4)) ? '#ffffff' : '#5ce1ff';
        for (let a = 0; a < 12; a++) {
          const an = (a / 12) * Math.PI * 2;
          ctx.fillRect((cx + Math.cos(an) * 5) | 0, (cy + Math.sin(an) * 5) | 0, 1, 1);
        }
        const an = -Math.PI / 2 + k * Math.PI * 2;
        linhaPx(ctx, cx, cy, cx + Math.cos(an) * 4, cy + Math.sin(an) * 4, '#ffd34d', 0);
      }
    }
  }

  // fim dos tempos (F): o tempo para, um relogio gigante gira e todos envelhecem ate virar po
  class FimDosTempos extends Ent {
    constructor(dono) {
      super(0, VIEW_H, 0, 0);
      this.dono = dono;
      this.t = 0;
    }
    update(g) {
      if (++this.t === 1) { g.tempoParado = Math.max(g.tempoParado, CR_FIM_T + 10); g.tempoDono = this.dono; }
      if (this.t % 12 === 0) Sound.play('menu');      // tique-taque
      if (this.t < CR_FIM_T) return;
      this.dead = true;
      for (const e of g.alvos(this.dono)) {
        g.particles.burst(e.cx, e.cy, 18, 5, 1.6, 30, 2);
        golpeFatal(g, e, this.dono);
      }
      g.flashT = 16;
      g.shake(12);
      Sound.play('nova');
      g.say('O TEMPO DELES ACABOU!', 80);
    }
    draw(ctx, S, tick) {
      const k = Math.min(1, this.t / 20);
      ctx.fillStyle = 'rgba(112,86,50,' + (0.35 * k).toFixed(3) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const cx = VIEW_W / 2, cy = VIEW_H / 2, r = 60;
      ctx.strokeStyle = 'rgba(255,211,77,' + (0.8 * k).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ffd34d';
      for (let h = 0; h < 12; h++) {
        const a = (h / 12) * Math.PI * 2;
        ctx.fillRect((cx + Math.cos(a) * (r - 6)) | 0, (cy + Math.sin(a) * (r - 6)) | 0, 2, 2);
      }
      const am = -Math.PI / 2 + this.t * 0.35, ah = -Math.PI / 2 + this.t * 0.03;
      for (let o = -1; o <= 1; o++) {
        linhaPx(ctx, cx + o, cy, cx + o + Math.cos(am) * (r - 10), cy + Math.sin(am) * (r - 10), '#fff6d0', 0);
        linhaPx(ctx, cx + o, cy, cx + o + Math.cos(ah) * (r - 26), cy + Math.sin(ah) * (r - 26), '#ffd34d', 0);
      }
    }
  }

  /* ================= necromante ================= */

  // esqueleto aliado (X): corre ate o alvo mais proximo e golpeia; sem alvos, segue o dono
  class Lacaio extends Ent {
    constructor(dono, x, y, dmg) {
      super(x - 5, y - 5, 10, 10);
      this.dono = dono; this.dmg = dmg;
      this.friendly = true;
      this.t = NC_LACAIO_T; this.cd = 0;
      this.set = 'skeleton';
    }
    some(g) { this.dead = true; g.particles.burst(this.cx, this.cy, 10, 3, 1.4, 18); }
    anda(g, tx, ty) {
      const dx = tx - this.cx, dy = ty - this.cy, d = Math.hypot(dx, dy) || 1;
      G.moveEnt(this, g.room, (dx / d) * NC_LACAIO_SPD, (dy / d) * NC_LACAIO_SPD, false, true);
      this.dir = dir8(dx, dy);
      this.anim++;
    }
    update(g) {
      if (--this.t <= 0 || this.dono.dead) { this.some(g); return; }
      if (this.cd > 0) this.cd--;
      let alvo = null, bd = Infinity;
      for (const e of g.alvos(this.dono)) {
        if (e.dead) continue;
        const d = G.dist(this.cx, this.cy, e.cx, e.cy);
        if (d < bd) { bd = d; alvo = e; }
      }
      if (!alvo) {
        if (G.dist(this.cx, this.cy, this.dono.cx, this.dono.cy) > 24) this.anda(g, this.dono.cx, this.dono.cy);
        return;
      }
      if (G.overlap(this.x - 2, this.y - 2, this.w + 4, this.h + 4, alvo.x, alvo.y, alvo.w, alvo.h)) {
        if (this.cd > 0) return;
        this.cd = NC_LACAIO_CD;
        const d = bd || 1;
        // no VS o oponente leva so 1 por golpe (sao tres esqueletos batendo)
        G.ferir(g, alvo, alvo instanceof Player ? 1 : this.dmg, (alvo.cx - this.cx) / d, (alvo.cy - this.cy) / d, this.dono);
        g.particles.burst(alvo.cx, alvo.cy, 6, 3, 1.4, 12);
        Sound.play('hit');
        return;
      }
      this.anda(g, alvo.cx, alvo.cy);
    }
    draw(ctx, S, tick) {
      if (this.t < 90 && (tick & 4)) return;
      ctx.fillStyle = 'rgba(127,216,88,0.22)';
      ctx.fillRect((this.cx - 7) | 0, (this.y + this.h - 1) | 0, 14, 3);
      Ent.prototype.draw.call(this, ctx, S, tick);
    }
  }

  // corrente de almas (C): liga todos os alvos; o dano que um leva vai para todos (em G.ferir)
  class EloAlmas extends Ent {
    constructor(dono, alvos) {
      super(0, VIEW_H, 0, 0);
      this.dono = dono;
      this.alvos = new Set(alvos);
      this.t = NC_ELO_T;
      this.prop = false;
    }
    update(g) {
      g.elo = this;
      for (const e of this.alvos) if (e.dead) this.alvos.delete(e);
      if (--this.t <= 0 || this.alvos.size < 2) { this.dead = true; if (g.elo === this) g.elo = null; }
    }
    draw(ctx, S, tick) {
      if (this.t < 60 && (tick & 4)) return;
      const l = [...this.alvos];
      for (let k = 1; k < l.length; k++) {
        const a = l[k - 1], b = l[k];
        const n = Math.max(1, Math.ceil(G.dist(a.cx, a.cy, b.cx, b.cy) / 3));
        for (let s = 0; s <= n; s++) {
          const t = s / n;
          ctx.fillStyle = ((s + (tick >> 2)) % 3) ? '#b45cff' : '#7fd858';
          ctx.fillRect((a.cx + (b.cx - a.cx) * t) | 0, (a.cy + (b.cy - a.cy) * t) | 0, 1, 1);
        }
      }
      ctx.fillStyle = '#b45cff';
      for (const e of l) ctx.fillRect((e.cx - 1) | 0, (e.y - 4) | 0, 3, 3);
    }
  }

  // colheita (V): uma foice gigante corta a sala. Quem esta com pouca vida morre (monstro com metade
  // ou menos, chefe com 1/4 ou menos); os outros levam 3x o dano. Cada execucao cura meio coracao.
  // No VS nao executa: o oponente leva 6x o dano com 30% da vida ou menos, senao 3x
  class Colheita extends Ent {
    constructor(dono) {
      super(0, VIEW_H, 0, 0);
      this.dono = dono;
      this.t = 0;
    }
    update(g) {
      this.t++;
      if (this.t === NC_COLHEITA_GOLPE) {
        const d = this.dono, dmg = d.dano() * NC_COLHEITA_MULT;
        let execs = 0;
        for (const e of g.alvos(d)) {
          if (e.dead) continue;
          if (e instanceof Player) {
            G.ferirBruto(g, e, e.hp <= e.maxhp * 0.3 ? dmg * 2 : dmg, 0, -1, d);
            continue;
          }
          const exec = e.boss ? e.hp <= e.maxhp / 4 : e.hp <= e.maxhp / 2;
          if (exec) {
            G.ferirBruto(g, e, e.boss ? e.hp : 999, 0, -1, d);
            execs++;
            g.particles.burst(e.cx, e.cy, 18, 8, 2, 24, 2);
          } else {
            G.ferir(g, e, dmg, 0, -1, d);
          }
        }
        if (execs) { d.heal(execs); g.say('EXECUTADOS: ' + execs, 60); }
        g.shake(8);
        Sound.play('nova');
      }
      if (this.t >= 30) this.dead = true;
    }
    draw(ctx) {
      // lamina varrendo a sala em arco, da esquerda para a direita
      const k = Math.min(1, this.t / 24), cx = VIEW_W / 2, cy = VIEW_H + 40;
      for (let e = 0; e < 4; e++) {
        const ang = Math.PI + (k - e * 0.05) * Math.PI;
        ctx.globalAlpha = 1 - e * 0.25;
        ctx.fillStyle = e === 0 ? '#eef2ff' : '#b45cff';
        for (let r = 60; r < 260; r += 2) {
          ctx.fillRect((cx + Math.cos(ang) * r) | 0, (cy + Math.sin(ang) * r) | 0, 2, 2);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // portal do submundo (F): um poco escuro abre sob cada alvo, maos sobem e arrastam todos
  class Submundo extends Ent {
    constructor(dono, alvos) {
      super(0, VIEW_H, 0, 0);
      this.dono = dono; this.alvos = alvos;
      this.t = 0;
    }
    update(g) {
      this.t++;
      for (const e of this.alvos) if (!e.dead) e.raiz = Math.max(e.raiz || 0, 2);   // presos no lugar
      if (this.t % 10 === 0) Sound.play('hit');
      if (this.t < NC_SUB_T) return;
      this.dead = true;
      for (const e of this.alvos) {
        if (e.dead) continue;
        g.particles.burst(e.cx, e.cy + 4, 16, 8, 1.8, 24, 2);
        golpeFatal(g, e, this.dono);
      }
      g.shake(10);
      Sound.play('nova');
      g.say('LEVADOS PARA O SUBMUNDO!', 80);
    }
    draw(ctx, S, tick) {
      const k = Math.min(1, this.t / 20), m = Math.max(0, (this.t - 20) / (NC_SUB_T - 20));
      for (const e of this.alvos) {
        if (e.dead) continue;
        const cx = e.cx, cy = e.y + e.h;
        const r = 4 + 8 * k;
        ctx.fillStyle = 'rgba(28,24,36,0.85)';
        ctx.fillRect((cx - r) | 0, (cy - 2) | 0, (r * 2) | 0, 4);
        ctx.fillStyle = '#b45cff';
        ctx.fillRect((cx - r) | 0, (cy - 2) | 0, (r * 2) | 0, 1);
        const h = (10 * m) | 0;
        ctx.fillStyle = '#8aa87a';
        for (const o of [-6, 5]) {
          ctx.fillRect((cx + o) | 0, cy - h, 2, h);
          ctx.fillRect((cx + o - 1) | 0, cy - h - 1, 4, 2);
        }
      }
    }
  }

  /* ================= engenheiro ================= */

  // torreta (X): mira e atira no alvo mais proximo por 20 s
  class Torreta extends Ent {
    constructor(dono, x, y, dmg) {
      super(x - 5, y - 4, 10, 8);
      this.dono = dono; this.dmg = dmg;
      this.friendly = true;
      this.t = EN_TORRETA_T; this.cd = EN_TORRETA_CD;
      this.ang = Math.atan2(DIR_VEC[dono.dir][1], DIR_VEC[dono.dir][0]);
    }
    some(g) { this.dead = true; g.particles.burst(this.cx, this.cy, 10, 5, 1.4, 16); }
    update(g) {
      if (--this.t <= 0) { this.some(g); return; }
      let alvo = null, bd = EN_TORRETA_ALC;
      for (const e of g.alvos(this.dono)) {
        if (e.dead) continue;
        const d = G.dist(this.cx, this.cy, e.cx, e.cy);
        if (d < bd) { bd = d; alvo = e; }
      }
      if (this.cd > 0) this.cd--;
      if (!alvo) return;
      this.ang = Math.atan2(alvo.cy - (this.cy - 3), alvo.cx - this.cx);
      if (this.cd > 0) return;
      this.cd = EN_TORRETA_CD;
      const mx = this.cx + Math.cos(this.ang) * 7, my = this.cy - 3 + Math.sin(this.ang) * 7;
      const sh = new Shot(mx - 2, my - 2, Math.cos(this.ang) * 3.6, Math.sin(this.ang) * 3.6, 'prego', this.dmg);
      sh.friendly = true; sh.dono = this.dono; sh.life = 120;
      sh.fonte = this.fonte;                     // tiro da torreta conta como do X que a criou
      g.ents.push(sh);
      g.particles.spawn(mx, my, 0, 0, 6, 1, 1, 0);
      Sound.play('shoot');
    }
    draw(ctx, S, tick) {
      if (this.t < 120 && (tick & 4)) return;
      const x = this.x | 0, y = this.y | 0;
      ctx.fillStyle = '#2f3644'; ctx.fillRect(x, y + 4, 10, 4);
      ctx.fillStyle = '#5c667e'; ctx.fillRect(x + 2, y, 6, 5);
      linhaPx(ctx, this.cx, this.cy - 3, this.cx + Math.cos(this.ang) * 7, this.cy - 3 + Math.sin(this.ang) * 7, '#c8cede', 0);
      ctx.fillStyle = (tick & 16) ? '#7fd858' : '#3a4a2a';
      ctx.fillRect(x + 4, y + 1, 2, 1);
    }
  }

  // campo refletor (C): tiros inimigos que chegam perto voltam no alvo mais proximo, com o dobro do dano
  class CampoRefletor extends Ent {
    constructor(dono) {
      super(dono.x, dono.y, 0, 0);
      this.dono = dono;
      this.t = EN_REFLETOR_T;
    }
    update(g) {
      const d = this.dono;
      if (--this.t <= 0 || d.dead) { this.dead = true; return; }
      this.x = d.x; this.y = d.y + 2;
      for (const s of g.ents) {
        if (!s.shot || s.friendly || s.dead || s.vx === undefined) continue;
        if (G.dist(s.cx, s.cy, d.cx, d.cy) > EN_REFLETOR_R) continue;
        const vel = (Math.hypot(s.vx, s.vy) || 2) * 1.4;
        let alvo = null, bd = Infinity;
        for (const e of g.alvos(d)) {
          if (e.dead) continue;
          const dd = G.dist(s.cx, s.cy, e.cx, e.cy);
          if (dd < bd) { bd = dd; alvo = e; }
        }
        const a = alvo ? Math.atan2(alvo.cy - s.cy, alvo.cx - s.cx) : Math.atan2(s.cy - d.cy, s.cx - d.cx);
        s.vx = Math.cos(a) * vel; s.vy = Math.sin(a) * vel;
        s.friendly = true; s.dono = d; s.dmg = (s.dmg || 1) * 2;
        if (s.life !== undefined) s.life = 200;
        g.particles.burst(s.cx, s.cy, 6, 1, 1.4, 12);
        Sound.play('goldhit');
      }
    }
    draw(ctx, S, tick) {
      if (this.t < 90 && (tick & 4)) return;
      const d = this.dono;
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + tick * 0.04;
        ctx.fillStyle = (k + (tick >> 3)) % 3 ? '#ffd34d' : '#ffffff';
        ctx.fillRect((d.cx + Math.cos(a) * EN_REFLETOR_R) | 0, (d.cy - 2 + Math.sin(a) * EN_REFLETOR_R * 0.8) | 0, 2, 1);
      }
    }
  }

  // enxame de drones (F): sobem em volta do engenheiro e mergulham, um em cada alvo
  class EnxameDrones extends Ent {
    constructor(dono, alvos) {
      super(0, VIEW_H, 0, 0);
      this.dono = dono;
      this.t = 0;
      const n = Math.max(6, alvos.length);
      this.drones = [];
      for (let k = 0; k < n; k++) {
        this.drones.push({ x: dono.cx, y: dono.cy, ang: (k / n) * Math.PI * 2, alvo: alvos[k] || null, vivo: true });
      }
    }
    update(g) {
      this.t++;
      const d = this.dono;
      let vivos = 0;
      for (const dr of this.drones) {
        if (!dr.vivo) continue;
        vivos++;
        if (this.t < EN_DRONE_SOBE) {
          dr.ang += 0.12;
          const r = 10 + this.t * 0.6;
          dr.x = d.cx + Math.cos(dr.ang) * r;
          dr.y = d.cy - 6 + Math.sin(dr.ang) * r * 0.6 - this.t * 0.3;
          continue;
        }
        if (!dr.alvo || dr.alvo.dead) {            // sem alvo: vai embora pelo alto
          dr.y -= 4;
          if (dr.y < -10) dr.vivo = false;
          continue;
        }
        const e = dr.alvo, dx = e.cx - dr.x, dy = e.cy - dr.y, dist = Math.hypot(dx, dy);
        if (dist > EN_DRONE_SPD) { dr.x += (dx / dist) * EN_DRONE_SPD; dr.y += (dy / dist) * EN_DRONE_SPD; continue; }
        dr.vivo = false;
        g.particles.burst(e.cx, e.cy, 22, 9, 2.4, 22, 2);
        g.shake(5);
        Sound.play('fire');
        golpeFatal(g, e, d);
      }
      if (!vivos) this.dead = true;
    }
    draw(ctx, S, tick) {
      for (const dr of this.drones) {
        if (!dr.vivo) continue;
        const x = dr.x | 0, y = dr.y | 0;
        ctx.fillStyle = '#5c667e'; ctx.fillRect(x - 2, y - 1, 5, 3);
        ctx.fillStyle = (tick & 2) ? '#c8cede' : '#8f96a8';
        ctx.fillRect(x - 4, y - 2, 3, 1); ctx.fillRect(x + 2, y - 2, 3, 1);
        ctx.fillStyle = '#e33b4e'; ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /* ================= druida ================= */

  // bosque sagrado (V): chao florido por 10 s; cura quem esta dentro e prende e fere os alvos
  class Bosque extends Ent {
    constructor(dono, x, y) {
      super(0, 0, 0, 0);                        // no chao: desenhado antes de todos
      this.dono = dono; this.ox = x; this.oy = y;
      this.t = DR_BOSQUE_T;
      this.flores = [];
      for (let k = 0; k < 26; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (DR_BOSQUE_R - 4);
        this.flores.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, (Math.random() * 3) | 0]);
      }
    }
    dentro(e) {
      const dx = e.cx - this.ox, dy = (e.cy - this.oy) / 0.7;
      return dx * dx + dy * dy <= DR_BOSQUE_R * DR_BOSQUE_R;
    }
    update(g) {
      if (--this.t <= 0) { this.dead = true; return; }
      const passou = DR_BOSQUE_T - this.t;
      if (passou % DR_BOSQUE_CURA === 0) {
        const amigos = g.modo() === 'vs' ? [this.dono] : g.players;
        for (const p of amigos) {
          if (p.dead || !this.dentro(p) || p.hp >= p.maxhp) continue;
          p.heal(1);
          g.particles.burst(p.cx, p.cy - 4, 6, 3, 1, 16);
        }
      }
      const alvos = g.alvos(this.dono);
      for (const e of alvos) {
        if (e.dead || !this.dentro(e)) continue;
        e.raiz = Math.max(e.raiz || 0, 4);          // presos enquanto estiverem no bosque
        if (passou % 60 === 0) danoDireto(g, e, 1, this.dono);
      }
      if ((g.tick & 3) === 0) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * DR_BOSQUE_R;
        g.particles.spawn(this.ox + Math.cos(a) * r, this.oy + Math.sin(a) * r * 0.7, 0, -0.4, 20, 3, 1, 0);
      }
    }
    draw(ctx, S, tick) {
      if (this.t < 90 && (tick & 4)) return;
      ctx.fillStyle = 'rgba(79,170,60,0.28)';
      ctx.beginPath();
      ctx.ellipse(this.ox, this.oy, DR_BOSQUE_R, DR_BOSQUE_R * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      const cores = ['#ffd34d', '#ff8090', '#ffffff'];
      for (const [x, y, c] of this.flores) {
        ctx.fillStyle = '#3f8a2a'; ctx.fillRect(x | 0, (y + 1) | 0, 1, 2);
        ctx.fillStyle = cores[c]; ctx.fillRect((x - 1) | 0, y | 0, 3, 1); ctx.fillRect(x | 0, (y - 1) | 0, 1, 3);
      }
    }
  }

  // furia da floresta (F): raizes com espinhos brotam sob cada alvo e o atravessam
  class FuriaFloresta extends Ent {
    constructor(dono, alvos) {
      super(0, VIEW_H, 0, 0);
      this.dono = dono; this.alvos = alvos;
      this.t = 0;
    }
    update(g) {
      this.t++;
      for (const e of this.alvos) if (!e.dead) e.raiz = Math.max(e.raiz || 0, 2);
      if (this.t % 8 === 0) Sound.play('hit');
      if (this.t < DR_FURIA_T) return;
      this.dead = true;
      for (const e of this.alvos) {
        if (e.dead) continue;
        g.particles.burst(e.cx, e.cy, 16, 3, 2, 24, 2);
        golpeFatal(g, e, this.dono);
      }
      g.shake(10);
      Sound.play('nova');
      g.say('A FLORESTA SE VINGOU!', 80);
    }
    draw(ctx) {
      const k = Math.min(1, this.t / (DR_FURIA_T - 10));
      for (const e of this.alvos) {
        if (e.dead) continue;
        const cx = e.cx, cy = e.y + e.h;
        for (let r = -2; r <= 2; r++) {             // cinco raizes pontudas subindo
          const h = ((8 + (2 - Math.abs(r)) * 5) * k) | 0;
          ctx.fillStyle = '#4a3018';
          ctx.fillRect((cx + r * 4 - 1) | 0, cy - h, 3, h);
          ctx.fillStyle = '#7fd858';
          ctx.fillRect((cx + r * 4) | 0, cy - h - 2, 1, 2);
        }
      }
    }
  }

  /* ================= vampira ================= */

  // lanca de sangue (X): atravessa paredes e todos os alvos ate a borda da sala
  class LancaSangue extends Ent {
    constructor(x, y, dx, dy, dmg) {
      super(x - 3, y - 3, 6, 6);
      this.vx = dx * VP_LANCA_SPD; this.vy = dy * VP_LANCA_SPD; this.dmg = dmg;
      this.friendly = true; this.shot = true;
      this.atingidos = new Set();
    }
    update(g) {
      this.x += this.vx; this.y += this.vy;
      if (this.x < -12 || this.y < -12 || this.x > VIEW_W + 12 || this.y > VIEW_H + 12) { this.dead = true; return; }
      if ((g.tick & 1) === 0) g.particles.spawn(this.cx, this.cy, 0, 0.3, 12, 2, 1, 0);
      for (const e of g.alvos(this.dono)) {
        if (e.dead || this.atingidos.has(e) || !this.hits(e)) continue;
        this.atingidos.add(e);
        G.ferir(g, e, this.dmg, this.vx / VP_LANCA_SPD, this.vy / VP_LANCA_SPD, this.dono);
        g.particles.burst(e.cx, e.cy, 10, 2, 1.8, 16);
      }
    }
    draw(ctx) {
      const n = VP_LANCA_SPD, ux = this.vx / n, uy = this.vy / n;
      linhaPx(ctx, this.cx - ux * 12, this.cy - uy * 12, this.cx, this.cy, '#6b1720', 1);
      linhaPx(ctx, this.cx - ux * 12, this.cy - uy * 12, this.cx, this.cy, '#e33b4e', 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect((this.cx + ux) | 0, (this.cy + uy) | 0, 1, 1);
    }
  }

  // banquete (V): fios de sangue ligam todos a vampira; cada um leva 3x o dano e a cura
  class Banquete extends Ent {
    constructor(dono, alvos, dmg) {
      super(0, VIEW_H, 0, 0);
      this.dono = dono; this.dmg = dmg;
      this.pts = alvos.map((e) => [e.cx, e.cy]);
      this.alvos = alvos;
      this.t = 0;
    }
    update(g) {
      if (++this.t === 1) {
        let cura = 0;
        for (const e of this.alvos) {
          if (e.dead) continue;
          G.ferirBruto(g, e, this.dmg, 0, -1, this.dono);
          cura++;
        }
        this.dono.heal(Math.min(VP_BANQUETE_CURA, cura));
        g.shake(6);
      }
      if (this.t >= 40) this.dead = true;
    }
    draw(ctx, S, tick) {
      const d = this.dono;
      for (let k = 0; k < this.pts.length; k++) {
        const [x, y] = this.pts[k];
        linhaPx(ctx, x, y, d.cx, d.cy, 'rgba(227,59,78,0.5)', 0);
        for (let s = 0; s < 3; s++) {                // gotas correndo ate a vampira
          const t = ((tick * 0.04 + s / 3 + k * 0.17) % 1);
          ctx.fillStyle = '#e33b4e';
          ctx.fillRect((x + (d.cx - x) * t - 1) | 0, (y + (d.cy - y) * t - 1) | 0, 2, 2);
        }
      }
    }
  }

  // lua de sangue (F): a sala fica vermelha, todos sao drenados e a vampira volta com a vida cheia
  class LuaSangue extends Ent {
    constructor(dono) {
      super(0, VIEW_H, 0, 0);
      this.dono = dono;
      this.t = 0;
    }
    update(g) {
      this.t++;
      if ((this.t & 1) === 0) g.particles.spawn(Math.random() * VIEW_W, 0, 0, 1.2, 60, 2, 1, 0);
      if (this.t === VP_LUA_T) {
        for (const e of g.alvos(this.dono)) {
          g.particles.burst(e.cx, e.cy, 16, 2, 2, 24, 2);
          golpeFatal(g, e, this.dono);
        }
        this.dono.hp = this.dono.maxhp;
        g.flashT = 12;
        g.shake(10);
        Sound.play('nova');
        g.say('LUA DE SANGUE!', 80);
      }
      if (this.t >= VP_LUA_T + 30) this.dead = true;
    }
    draw(ctx) {
      const k = Math.min(1, this.t / 30) * (this.t > VP_LUA_T ? Math.max(0, 1 - (this.t - VP_LUA_T) / 30) : 1);
      ctx.fillStyle = 'rgba(120,10,24,' + (0.35 * k).toFixed(3) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = 'rgba(227,59,78,' + (0.9 * k).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(VIEW_W / 2, 28, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,128,144,' + (0.6 * k).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(VIEW_W / 2 - 5, 24, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

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
      if (d < (this.valor ? 40 : 26) && this.pop <= 0) {      // moedas de monstro atraem de mais longe
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

  /* ================= bichos dos mundos 4 a 8 ================= */

  // poca de lava deixada pelo golem de magma: queima quem pisa
  class PocaLava extends Ent {
    constructor(x, y) {
      super(x, y - 60, 0, 0);
      this.ox = x; this.oy = y; this.t = 240;
    }
    update(g) {
      if (--this.t <= 0) { this.dead = true; return; }
      if (this.t % 24 === 0) {
        for (const p of g.players) {
          const ex = (p.cx - this.ox) / 14, ey = (p.y + p.h - 2 - this.oy) / 8;
          if (!p.dead && ex * ex + ey * ey < 1) p.hurt(g, 1, this.ox, this.oy);
        }
      }
      if ((g.tick & 5) === 0) g.particles.spawn(this.ox + (Math.random() - 0.5) * 22, this.oy, 0, -0.5, 14, 9, 1, 0);
    }
    draw(ctx) {
      const a = Math.min(1, this.t / 40);
      ctx.fillStyle = 'rgba(200,70,20,' + (0.5 * a).toFixed(2) + ')';
      for (let dy = -7; dy <= 7; dy++) {
        const w = Math.round(14 * Math.sqrt(1 - (dy / 8) * (dy / 8)));
        ctx.fillRect((this.ox - w) | 0, (this.oy + dy) | 0, w * 2, 1);
      }
      ctx.fillStyle = 'rgba(255,214,77,' + (0.7 * a).toFixed(2) + ')';
      ctx.fillRect((this.ox - 4) | 0, (this.oy - 1) | 0, 2, 2);
      ctx.fillRect((this.ox + 3) | 0, (this.oy + 2) | 0, 2, 2);
    }
  }

  // lamina curva do nomade: vai ate o alcance e volta para a mao
  class LaminaCurva extends Ent {
    constructor(dono, dx, dy) {
      super(dono.cx - 4, dono.cy - 4, 8, 8);
      this.dono = dono; this.vx = dx * 3; this.vy = dy * 3;
      this.t = 0; this.ida = 22; this.anim = 0;
    }
    update(g) {
      this.t++;
      this.anim += 3;
      if (this.t <= this.ida) { this.x += this.vx; this.y += this.vy; }
      else {
        const d = this.dono.dead ? null : this.dono;
        if (!d) { this.dead = true; return; }
        const dx = d.cx - this.cx, dy = d.cy - this.cy, dd = Math.hypot(dx, dy) || 1;
        this.x += (dx / dd) * 3.4; this.y += (dy / dd) * 3.4;
        if (dd < 8) { this.dead = true; return; }
      }
      for (const p of g.players) if (!p.dead && this.hits(p)) p.hurt(g, 1, this.cx, this.cy);
      if (this.t > 200) this.dead = true;
    }
    draw(ctx, S) {
      const img = S.foice[(this.anim >> 2) & 3];
      ctx.drawImage(img, (this.cx - img.width / 2) | 0, (this.cy - img.height / 2) | 0);
    }
  }

  // ESCORPIAO DE AREIA: circula o heroi e da uma ferroada que paralisa
  class Escorpiao extends Enemy {
    constructor(x, y) {
      super(x, y, 13, 9, 5);
      this.frames = 'escorpiao'; this.spd = 0.8; this.gib = 9; this.loot = 2;
      this.cd = 50 + rnd(40); this.bote = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim += 3;
      if (this.bote > 0) {
        this.bote--;
        this.move(g, this.sx, this.sy);
        for (const q of g.players) {
          if (q.dead || !this.hits(q)) continue;
          q.hurt(g, 1, this.cx, this.cy);
          G.paralisa(q, 45);                       // ferroada: 0,75 s parado
          this.bote = 0;
        }
        return;
      }
      if (--this.cd <= 0 && d < 80) {
        this.cd = 90; this.bote = 18;
        this.sx = (dx / d) * 3.4; this.sy = (dy / d) * 3.4;
        Sound.play('swing');
        return;
      }
      // anda de lado, girando em volta do heroi
      const gira = (this.t * 0.03) % (Math.PI * 2);
      this.move(g, (dx / d) * this.spd * 0.7 - Math.sin(gira) * 0.7, (dy / d) * this.spd * 0.7 + Math.cos(gira) * 0.7);
    }
  }

  // NOMADE DAS DUNAS: mantem distancia e joga a lamina curva, que volta para a mao
  class Nomade extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 6);
      this.set = 'nomade'; this.spd = 0.75; this.gib = 1; this.loot = 2;
      this.cd = 60 + rnd(50); this.lamina = null;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (d < 60) this.move(g, -(dx / d) * this.spd, -(dy / d) * this.spd);
      else if (d > 120) this.move(g, (dx / d) * this.spd, (dy / d) * this.spd);
      else this.dir = dirFrom(dx, dy);
      if (this.lamina && this.lamina.dead) this.lamina = null;
      if (--this.cd <= 0 && !this.lamina && d < 150) {
        this.cd = 110;
        this.lamina = new LaminaCurva(this, dx / d, dy / d);
        g.addEnt(this.lamina);
        Sound.play('swing');
      }
    }
  }

  // VERME DAS DUNAS: cava (invulneravel), aparece embaixo do heroi e morde
  class Verme extends Enemy {
    constructor(x, y) {
      super(x, y, 16, 12, 8);
      this.frames = 'verme'; this.gib = 9; this.loot = 3;
      this.estado = 'cava'; this.st = 60 + rnd(40); this.touch = 0;
    }
    frame() { return this.estado === 'cava' ? 0 : this.estado === 'morde' ? 2 : 1; }
    sprite(S) { return S.verme[this.frame()]; }
    step(g) {
      const p = g.alvo(this);
      if (this.estado === 'cava') {
        const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
        this.move(g, (dx / d) * 1.5, (dy / d) * 1.5);
        if ((g.tick & 3) === 0) g.particles.spawn(this.cx, this.cy + 4, (Math.random() - 0.5) * 1.2, -0.6, 16, 1, 1, 0);
        if (--this.st <= 0 || d < 16) { this.estado = 'sobe'; this.st = 18; Sound.play('stairs'); }
        return;
      }
      if (this.estado === 'sobe') {
        this.touch = 0;
        if (--this.st <= 0) { this.estado = 'morde'; this.st = 70; this.touch = 2; g.particles.burst(this.cx, this.cy, 14, 1, 2, 20); }
        return;
      }
      // fora da areia: morde quem chegar perto e cospe areia
      this.chase(g, 0.6);
      if (this.st === 40 || this.st === 20) {
        const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
        g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 'rock', 1));
        Sound.play('shoot');
      }
      if (--this.st <= 0) { this.estado = 'cava'; this.st = 90 + rnd(60); this.touch = 0; }
    }
    hurt(g, dmg, dx, dy) {
      if (this.estado !== 'morde') { Sound.play('blocked'); return; }   // debaixo da areia nao da para acertar
      super.hurt(g, dmg, dx, dy);
    }
  }

  // LOBO DO GELO: corre em matilha, arremete e escorrega ate parar
  class LoboGelo extends Enemy {
    constructor(x, y) {
      super(x, y, 13, 9, 5);
      this.frames = 'lobogelo'; this.spd = 1.15; this.gib = 4; this.loot = 2;
      this.cd = 40 + rnd(50); this.investe = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim += 4;
      if (this.investe > 0) {
        this.investe--;
        const bateu = this.move(g, this.sx, this.sy);
        this.sx *= 0.96; this.sy *= 0.96;                     // desliza no gelo
        if ((g.tick & 3) === 0) g.particles.spawn(this.cx, this.cy + 3, 0, 0, 10, 4, 1, 0);
        return;
      }
      if (--this.cd <= 0 && d < 100) {
        this.cd = 80; this.investe = 26;
        this.sx = (dx / d) * 3.6; this.sy = (dy / d) * 3.6;
        Sound.play('swing');
        return;
      }
      this.move(g, (dx / d) * this.spd + Math.cos(this.t * 0.12) * 0.5, (dy / d) * this.spd + Math.sin(this.t * 0.12) * 0.5);
    }
  }

  // ORACULO DO GELO: lanca orbes que congelam por 1 s e ergue paredes de gelo
  class Oraculo extends Enemy {
    constructor(x, y) {
      super(x, y, 11, 11, 7);
      this.set = 'oraculo'; this.spd = 0.45; this.gib = 4; this.loot = 2;
      this.cd = 70 + rnd(40);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (d < 70) this.move(g, -(dx / d) * this.spd, -(dy / d) * this.spd);
      else this.dir = dirFrom(dx, dy);
      if (--this.cd <= 0 && d < 160) {
        this.cd = 130;
        const a = Math.atan2(dy, dx);
        for (let k = -1; k <= 1; k++) {
          const ang = a + k * 0.26;
          const t = new Shot(this.cx - 3, this.cy - 3, Math.cos(ang) * 1.9, Math.sin(ang) * 1.9, 'geloOrb', 1);
          t.onHit = (gg, alvo) => { alvo.gelo = Math.max(alvo.gelo || 0, 60); };   // 1 s congelado
          g.addEnt(t);
        }
        Sound.play('cast');
      }
    }
  }

  // IMP DA FORJA: pisca de um lado para o outro e cospe fogo
  class Imp extends Enemy {
    constructor(x, y) {
      super(x, y, 10, 10, 4);
      this.set = 'imp'; this.spd = 0.9; this.gib = 9; this.loot = 2;
      this.cd = 40 + rnd(40); this.piscaT = 90 + rnd(60);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      if (--this.piscaT <= 0) {                               // teleporte curto
        this.piscaT = 120 + rnd(60);
        g.particles.burst(this.cx, this.cy, 12, 9, 1.8, 18);
        const a = Math.random() * Math.PI * 2, r = 34 + Math.random() * 20;
        const nx = G.clamp(this.x + Math.cos(a) * r, 18, VIEW_W - 18 - this.w);
        const ny = G.clamp(this.y + Math.sin(a) * r, 18, VIEW_H - 18 - this.h);
        if (!G.boxSolid(g.room, nx, ny, this.w, this.h, false)) { this.x = nx; this.y = ny; }
        g.particles.burst(this.cx, this.cy, 12, 1, 1.8, 18);
        Sound.play('stairs');
        return;
      }
      if (d > 60) this.move(g, (dx / d) * this.spd, (dy / d) * this.spd);
      else this.dir = dirFrom(dx, dy);
      if (--this.cd <= 0 && d < 130) {
        this.cd = 90;
        const a = Math.atan2(dy, dx);
        g.addEnt(new Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 'fire', 2));
        Sound.play('fire');
      }
    }
  }

  // GOLEM DE MAGMA: lento e duro, deixa pocas de lava por onde passa
  class GolemLava extends Enemy {
    constructor(x, y) {
      super(x, y, 20, 20, 16);
      this.set = 'golemLava'; this.spd = 0.35; this.touch = 2; this.gib = 9; this.loot = 4;
      this.goteja = 90;
    }
    step(g) {
      this.chase(g, this.spd);
      if ((g.tick & 7) === 0) g.particles.spawn(this.cx + (Math.random() - 0.5) * 14, this.cy, 0, -0.4, 12, 9, 1, 0);
      if (--this.goteja <= 0) {
        this.goteja = 150;
        g.addEnt(new PocaLava(this.cx, this.y + this.h - 3));
        Sound.play('fire');
      }
    }
    die(g) {                                                  // explode numa poca grande
      g.addEnt(new PocaLava(this.cx, this.y + this.h - 3));
      super.die(g);
    }
  }

  // HARPIA DO CEU: sobe fora de alcance e mergulha em linha reta
  class Harpia extends Enemy {
    constructor(x, y) {
      super(x, y, 14, 11, 6);
      this.frames = 'harpia'; this.fly = true; this.spd = 1.0; this.gib = 5; this.loot = 2;
      this.estado = 'ronda'; this.st = 60 + rnd(40); this.alto = 0;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim += 5;
      if (this.estado === 'sobe') {
        this.alto = Math.min(1, this.alto + 0.06);
        this.move(g, (dx / d) * 0.6, (dy / d) * 0.6);
        if (--this.st <= 0) { this.estado = 'mergulha'; this.st = 26; this.sx = (dx / d) * 4; this.sy = (dy / d) * 4; Sound.play('swing'); }
        return;
      }
      if (this.estado === 'mergulha') {
        this.alto = Math.max(0, this.alto - 0.1);
        this.move(g, this.sx, this.sy);
        if (--this.st <= 0) { this.estado = 'ronda'; this.st = 70 + rnd(40); }
        return;
      }
      this.alto = Math.max(0, this.alto - 0.05);
      this.move(g, (dx / d) * this.spd * 0.7 + Math.cos(this.t * 0.06) * 0.9, (dy / d) * this.spd * 0.7 + Math.sin(this.t * 0.06) * 0.9);
      if (--this.st <= 0) { this.estado = 'sobe'; this.st = 40; }
    }
    hurt(g, dmg, dx, dy) {
      if (this.alto > 0.7) { Sound.play('blocked'); return; }   // alto demais para acertar
      super.hurt(g, dmg, dx, dy);
    }
  }

  // SILFO DO VENTO: orbita o heroi e solta rajadas que empurram
  class Silfo extends Enemy {
    constructor(x, y) {
      super(x, y, 10, 10, 5);
      this.frames = 'ventoOrb'; this.fly = true; this.gib = 5; this.loot = 2;
      this.touch = 1; this.cd = 70 + rnd(40); this.ang = Math.random() * Math.PI * 2;
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim += 4;
      this.ang += 0.05;
      const alvoX = p.cx + Math.cos(this.ang) * 52, alvoY = p.cy + Math.sin(this.ang) * 40;
      const ax = alvoX - this.cx, ay = alvoY - this.cy, ad = Math.hypot(ax, ay) || 1;
      this.move(g, (ax / ad) * 1.3, (ay / ad) * 1.3);
      if (--this.cd <= 0 && d < 120) {
        this.cd = 120;
        for (const q of g.players) {
          if (q.dead) continue;
          const qx = q.cx - this.cx, qy = q.cy - this.cy, qd = Math.hypot(qx, qy) || 1;
          if (qd > 120) continue;
          q.hurt(g, 1, this.cx, this.cy);
          q.empurraoVento = 1;
          G.moveEnt(q, g.room, (qx / qd) * 14, (qy / qd) * 14, false, true);   // rajada empurra
        }
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          g.particles.spawn(this.cx, this.cy, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 16, 4, 1, 0);
        }
        Sound.play('spin');
      }
    }
  }

  // raio do olho do vazio: linha marcada e depois o feixe
  class FeixeVazio extends Ent {
    constructor(x, y, dx, dy) {
      super(x, y, 0, 0);
      this.ox = x; this.oy = y; this.dx = dx; this.dy = dy;
      this.t = 0; this.mira = 34; this.tiro = 16;
      this.y = VIEW_H + 40;                       // desenha por cima
    }
    update(g) {
      this.t++;
      if (this.t === this.mira) {
        Sound.play('goldhit');
        g.shake(4);
        for (const p of g.players) {
          if (p.dead) continue;
          const px2 = p.cx - this.ox, py2 = p.cy - this.oy;
          const proj = px2 * this.dx + py2 * this.dy;
          if (proj < 0 || proj > 260) continue;
          const perp = Math.abs(px2 * -this.dy + py2 * this.dx);
          if (perp < 7) p.hurt(g, 2, this.ox, this.oy);
        }
      }
      if (this.t > this.mira + this.tiro) this.dead = true;
    }
    draw(ctx) {
      const len = 260;
      const x1 = this.ox + this.dx * len, y1 = this.oy + this.dy * len;
      if (this.t < this.mira) {
        if ((this.t >> 1) & 1) return;
        linhaPx(ctx, this.ox, this.oy, x1, y1, 'rgba(180,92,255,0.55)', 0);
        return;
      }
      linhaPx(ctx, this.ox, this.oy, x1, y1, '#b45cff', 0);
      linhaPx(ctx, this.ox, this.oy - 1, x1, y1 - 1, '#f0d8ff', 0);
      linhaPx(ctx, this.ox, this.oy + 1, x1, y1 + 1, '#7f3fd8', 0);
    }
  }

  // OLHO DO VAZIO: flutua longe e dispara um feixe marcado no chao
  class OlhoVazio extends Enemy {
    constructor(x, y) {
      super(x, y, 12, 12, 7);
      this.frames = 'olhovazio'; this.fly = true; this.gib = 8; this.loot = 3;
      this.touch = 1; this.cd = 80 + rnd(40);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim += 2;
      if (d < 90) this.move(g, -(dx / d) * 0.8, -(dy / d) * 0.8);
      else if (d > 140) this.move(g, (dx / d) * 0.8, (dy / d) * 0.8);
      if (--this.cd <= 0) {
        this.cd = 150;
        g.addEnt(new FeixeVazio(this.cx, this.cy, dx / d, dy / d));
        Sound.play('cast');
      }
    }
  }

  // CACO DO VAZIO: gosma de escuridao que se parte em dois ao morrer
  class Caco extends Enemy {
    constructor(x, y, nivel) {
      const n = nivel || 0;
      super(x, y, 12 - n * 3, 10 - n * 2, n === 0 ? 6 : n === 1 ? 3 : 2);
      this.frames = 'caco'; this.nivel = n; this.gib = 8; this.loot = n === 0 ? 2 : 1;
      this.spd = 0.7 + n * 0.35;
      this.escala = 1 - n * 0.25;
    }
    step(g) {
      this.chase(g, this.spd);
      this.anim += 2;
      if ((g.tick & 15) === 0) g.particles.spawn(this.cx, this.cy, 0, -0.3, 12, 8, 1, 0);
    }
    die(g) {
      super.die(g);
      if (this.nivel >= 2) return;
      for (let k = 0; k < 2; k++) {
        const c = new Caco(G.clamp(this.x + (k ? 8 : -8), 12, VIEW_W - 24), this.y, this.nivel + 1);
        g.addEnt(c);
      }
    }
  }

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
      case 'escorpiao': return new Escorpiao(x, y);
      case 'nomade': return new Nomade(x, y);
      case 'verme': return new Verme(x, y);
      case 'lobogelo': return new LoboGelo(x, y);
      case 'oraculo': return new Oraculo(x, y);
      case 'imp': return new Imp(x, y);
      case 'golemlava': return new GolemLava(x, y);
      case 'harpia': return new Harpia(x, y);
      case 'silfo': return new Silfo(x, y);
      case 'olhovazio': return new OlhoVazio(x, y);
      case 'caco': return new Caco(x, y, 0);
      default: return G.CHEFES && G.CHEFES[type] ? new G.CHEFES[type](x, y) : new Goblin(x, y);
    }
  };
  // usados pelos chefes da campanha (chefes.js)
  G.Marca = Marca;
  G.PocaLava = PocaLava;
  G.FeixeVazio = FeixeVazio;
  G.Caco = Caco;
  G.Imp = Imp;
  G.LoboGelo = LoboGelo;
  G.Harpia = Harpia;
  G.Escorpiao = Escorpiao;
  G.OndaInimiga = OndaInimiga;
  G.linhaPx = linhaPx;
  G.desenhaEfeito = desenhaEfeito;
  G.dirFrom = dirFrom;
})(window.AURUM = window.AURUM || {});
