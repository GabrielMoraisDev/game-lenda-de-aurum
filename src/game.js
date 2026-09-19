/* game.js - estados, camera, transicao de salas, HUD, save e loop principal. */
(function (G) {
  'use strict';

  const TILE = G.TILE, ROOM_W = G.ROOM_W, ROOM_H = G.ROOM_H;
  const VIEW_W = G.VIEW_W, VIEW_H = G.VIEW_H, HUD_H = G.HUD_H;
  const SEL_COLUNAS = 6;                 // tela de selecao: herois por linha
  const Sound = G.Sound, Music = G.Music;
  const STEP = 1000 / 60;
  const SAVE_KEY = 'aurum_save_v2';   // v2: campanha dos fragmentos (3 mundos)

  const DIR_VEC = G.DIR_VEC;   // 8 direcoes, definido em entities.js
  const Net = G.Net;

  // multijogador
  const MODOS = [
    { id: 'coop', nome: 'COOPERATIVO', desc: 'TODOS JUNTOS NO JOGO NORMAL' },
    { id: 'comp', nome: 'COMPETITIVO', desc: 'QUEM MATA MAIS BICHOS EM 3 MINUTOS' },
    { id: 'vs', nome: 'VS', desc: 'TODOS CONTRA TODOS NUMA ARENA, 20 DE VIDA' }
  ];
  const COMP_TEMPO = 180 * 60;          // competitivo: 3 minutos
  const COMP_MAX = 6;                   // competitivo: inimigos vivos na sala
  const COMP_SPAWN = 90;                // competitivo: um inimigo novo a cada 1,5 s
  const COMP_TIPOS = {
    field: ['goblin', 'archer', 'bat', 'slime', 'machadeiro'], dungeon: ['skeleton', 'ghost', 'knight', 'bat'],
    pantano: ['sapo', 'mosquito', 'bruxa', 'slime'], castelo: ['lanceiro', 'besteiro', 'feiticeiro', 'knight']
  };
  const VS_HP = 20;                     // VS: 20 de vida, mostrada em barra
  const RESPAWN_COOP = 240, RESPAWN_COMP = 180;
  const COMP_MAX_TETO = 16;             // competitivo: +2 inimigos por jogador alem do segundo, ate este teto
  // marcador de cada jogador (1 amarelo, 2 azul, ...); passando de 8, as cores se repetem
  const COR_P = ['#ffd34d', '#5ce1ff', '#ff6b6b', '#7fd858', '#c77dff', '#ff9f43', '#f8f8f8', '#ff7ac8'];
  const corJ = (p) => COR_P[(p.num - 1) % COR_P.length];
  const HUD_HZ = 4;                     // convidados: HUD proprio a cada 4 passos (15 por segundo)
  const TELAS_COM_HUD = { play: 1, transition: 1, teleporte: 1 };
  const BRANCO_CHEIO = 24, BRANCO_FADE = 72;   // meteoro: quadros de branco total e de fade
  const GAP_X = G.GAP_X, GAP_Y = G.GAP_Y;   // aberturas das salas (world.js)
  const FRAGMENTOS = 16;                  // 2 guardioes por mundo, 8 mundos
  const FRAG_POR_NIVEL = 4;               // a cada 4 fragmentos o poder das armas sobe um nivel
  // dificuldade: vida dos inimigos e chefes e dano que o heroi leva
  const DIFICULDADES = [
  // vida: monstros comuns; chefeVida: chefes; ritmo: velocidade dos chefes; tiros: quantidade de ataques dos chefes
    // chefeDano: dano fixo de qualquer golpe durante a luta com chefe (1 = meio coracao)
    { nome: 'FACIL', cor: '#7fd858', vida: 0.7, chefeVida: 0.7, chefeDano: 1, dano: 0.5, ritmo: 0.75, tiros: 0.6, dicas: true,
      moedas: 15, pecas: 5,
      desc: ['CHEFES COM 30% MENOS VIDA, MAIS LENTOS E COM MENOS TIROS', 'INIMIGOS COM 30% MENOS VIDA', 'VOCE LEVA METADE DO DANO (CHEFES: MEIO CORACAO)', 'CADA MONSTRO DA 15 MOEDAS', 'PEDRA DE DICAS NOS PUZZLES'] },
    { nome: 'MEDIO', cor: '#ffd34d', vida: 1, chefeVida: 1, dano: 1, ritmo: 1, tiros: 1,
      moedas: 8, pecas: 4,
      desc: ['O JOGO COMO FOI PENSADO', 'CHEFES TIRAM 1 CORACAO E MEIO', 'CADA MONSTRO DA 8 MOEDAS'] },
    { nome: 'DIFICIL', cor: '#e33b4e', vida: 1.4, chefeVida: 1.5, dano: 1.5, ritmo: 1.2, tiros: 1.35,
      moedas: 3, pecas: 3,
      desc: ['CHEFES COM 50% MAIS VIDA, MAIS RAPIDOS E COM MAIS TIROS', 'INIMIGOS COM 40% MAIS VIDA', 'VOCE LEVA 50% MAIS DANO (CHEFES: 2 CORACOES E MEIO)', 'CADA MONSTRO DA SO 3 MOEDAS'] }
  ];
  const DIF_KEY = 'aurum_dificuldade';

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      canvas.width = VIEW_W;
      canvas.height = VIEW_H + HUD_H;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.ctx.imageSmoothingEnabled = false;

      this.tiles = G.buildTiles();
      this.SPR = G.buildSprites();
      this.input = new G.Input();
      this.particles = new G.Particles(600);

      this.ents = [];
      this.drawList = [];
      this.tick = 0;
      this.state = 'title';
      this.shakeT = 0; this.shakeAmp = 0; this.flashT = 0; this.cdPulse = 0;
      this.tempoParado = 0; this.tempoDono = null;   // cronomante: tempo parado (so o dono age)
      this.elo = null;                 // necromante: corrente de almas ativa
      this.brancoT = 0;                // meteoro do mago: tela branca que volta com fade
      this.msg = null; this.msgT = 0;
      this.fade = 0; this.fadeDir = 0; this.onFade = null;
      this.fps = 0; this._fpsAcc = 0; this._fpsN = 0; this.showFps = false;
      this.trans = null;
      this.boss = null;

      this.players = [];               // [anfitriao/local, convidados...]; convidado tem p.input remoto
      // multijogador: { modo, papel: 'host' | 'guest' }; no anfitriao tambem cls, arena e convidados [{num, cls}]
      this.mp = null;
      this.donoAtual = null;           // jogador cujo update esta rodando (dono dos tiros)
      this.hudP = null;                // de quem e o HUD desenhado agora
      this.lobby = null;
      this.quadro = null;              // convidado: ultima tela recebida
      this.quadroHud = null;           // convidado: faixa do HUD dele
      this.quadroSemHud = false;       // convidado: a tela veio sem o HUD dele (desenha a faixa por cima)
      this.codificando = 0;            // anfitriao: quadros ainda sendo codificados
      this.streamCanvas = G.mkCanvas(VIEW_W, VIEW_H + HUD_H);
      this.streamCtx = this.streamCanvas.getContext('2d');
      this.streamCtx.imageSmoothingEnabled = false;
      this.hudCanvas = G.mkCanvas(VIEW_W, HUD_H);
      this.hudCtx = this.hudCanvas.getContext('2d');
      this.hudCtx.imageSmoothingEnabled = false;

      this.hasSave = !!G.store.get(SAVE_KEY);
      const dif = parseInt(G.store.get(DIF_KEY), 10);
      this.difIdx = DIFICULDADES[dif] ? dif : 1;
      this.acc = 0;
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ---------------- mundo ---------------- */

    // convidados: [{num, cls}] de quem esta na sala (multijogador)
    newGame(seed, cls, convidados) {
      this.seed = seed || ((Math.random() * 1e9) | 0);
      this.cls = G.CLASSES[cls] ? cls : (this.cls || 'guerreiro');
      const vs = this.modo() === 'vs';
      // VS: so a arena escolhida, uma sala fechada
      this.levels = vs ? { arena: G.genArena(this.seed, this.mp.arena) } : this.geraMundos(this.seed);
      this.flags = { chests: {}, bosses: {}, cleared: {}, unlocked: {}, puzzles: {} };
      this.player = new G.Player(0, 0, this.cls);
      this.players = [this.player];
      for (const c of convidados || []) this.players.push(this.novoConvidado(c.num, c.cls));
      if (vs) for (const p of this.players) { p.maxhp = VS_HP; p.hp = VS_HP; }
      this.tempo = this.modo() === 'comp' ? COMP_TEMPO : 0;
      this.spawnT = COMP_SPAWN;
      this.vencedor = null;
      this.acabou = false;
      const id = vs ? 'arena' : 'mundo1', ini = this.levels[id].start;
      this.enterLevel(id, ini.room, ini.x, ini.y);
      this.state = 'play';
      if (vs) this.montaArena();
      const m = this.modo();
      if (m === 'vs' || m === 'comp') {
        this.say(m === 'vs' ? 'VS! ' + this.level.name.replace('ARENA - ', '') + '\nDANO NO OPONENTE LIBERA X, C E V' : 'COMPETITIVO: 3 MINUTOS!', 200);
        return;
      }
      this.flags.checkpoint = { level: id, room: ini.room, x: ini.x, y: ini.y };
      // solo e cooperativo: abertura contando a historia (ENTER pula)
      this.contaHistoria(G.CENAS_INTRO, () => {
        this.state = 'play';
        Music.set(this.level.music);
        this.say((m === 'coop' ? 'COOPERATIVO\n' : '') + this.level.name + '\n' + this.level.sub, 220);
      });
    }

    geraMundos(seed) {
      const out = {};
      for (let n = 1; n <= G.MUNDOS.length; n++) out['mundo' + n] = G.genMundo(seed, n);
      return out;
    }

    contaHistoria(cenas, depois) {
      this.historia = new G.Historia(this, cenas, () => { this.historia = null; depois(); });
      this.state = 'historia';
      Music.set('historia');
    }

    /* ---------------- batalha estilo Undertale (Eco das Fendas) ---------------- */

    iniciaBatalha(chefe) {
      this.batalha = new G.Batalha(this, chefe);
      this.state = 'batalha';
      this.flashT = 10;
      Sound.play('boss');
      Music.set(this.musicaChefe(chefe));
    }

    musicaChefe(e) { return (e && G.MUSICA_CHEFE[e.tipoChefe]) || 'boss'; }

    fimBatalha(b, res) {
      this.batalha = null;
      this.state = 'play';
      const e = b.chefe;
      e.hp = 0;
      e.die(this);                            // conta como chefe derrotado: fragmento e sala liberada
      if (res === 'poupou') {
        this.spawnPickup(e.cx + 16, e.cy, 'container');
        this.say('VOCE POUPOU O ECO. ELE ENCONTROU PAZ.\nFICOU UM FRAGMENTO E UM CORACAO EXTRA.', 220);
      }
    }

    morteNaBatalha(b) {
      this.batalha = null;
      this.state = 'play';
      b.chefe.iniciou = false; b.chefe.t = 0;   // no cooperativo a luta recomeca quando ele voltar
      const p = this.player;
      p.dead = true;
      this.onPlayerDead(p);
    }

    modo() { return this.mp && this.mp.papel === 'host' ? this.mp.modo : null; }

    dif() { return this.modo() === 'vs' ? DIFICULDADES[1] : DIFICULDADES[this.difIdx]; }

    trocaDificuldade(passo) {
      this.difIdx = (this.difIdx + passo + DIFICULDADES.length) % DIFICULDADES.length;
      G.store.set(DIF_KEY, String(this.difIdx));
      Sound.play('menu');
    }

    // dano que um monstro causa no heroi, ajustado pela dificuldade (minimo 1)
    // chefe: luta com chefe em andamento (sem informar, olha se ha chefe vivo na sala)
    danoRecebido(d, chefe) {
      const dif = this.dif();
      if (chefe === undefined) chefe = !!(this.boss && !this.boss.dead);
      if (chefe && dif.chefeDano) return dif.chefeDano;
      return dif.dano === 1 ? d : Math.max(1, Math.round(d * dif.dano));
    }

    // vida do monstro ajustada pela dificuldade (uma vez so, ao nascer)
    escala(e) {
      if (!e.enemy || e.escalado) return;
      e.escalado = true;
      const m = e.boss ? this.dif().chefeVida : this.dif().vida;
      if (m === 1) return;
      e.maxhp = Math.max(1, Math.round(e.maxhp * m));
      e.hp = e.maxhp;
    }

    novoConvidado(num, cls) {
      const p = new G.Player(0, 0, G.CLASSES[cls] ? cls : 'guerreiro');
      p.num = num;
      p.input = new G.RemoteInput();
      return p;
    }

    jogador(num) { return this.players.find((p) => p.num === num) || null; }

    // VS: arena sem monstros, todos em roda de frente para o centro (o jogador 1 a esquerda)
    montaArena() {
      this.ents = this.ents.filter((e) => !e.enemy);
      const ativos = this.players.filter((p) => !p.espera);
      const n = ativos.length, rx = VIEW_W / 2 - 2 * TILE, ry = VIEW_H / 2 - 2 * TILE;
      ativos.forEach((p, k) => {
        const a = Math.PI + (k / n) * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a);
        const pos = this.chaoLivre(VIEW_W / 2 + cos * rx - p.w / 2, VIEW_H / 2 + sin * ry - p.h / 2, p);
        p.x = pos.x; p.y = pos.y;
        p.dir = Math.abs(cos) >= Math.abs(sin) ? (cos < 0 ? 'right' : 'left') : (sin < 0 ? 'down' : 'up');
      });
    }

    // chao livre mais perto de (x, y), procurando em aneis de meio bloco
    chaoLivre(x, y, p) {
      for (let r = 0; r <= 12 * TILE; r += TILE / 2) {
        const passos = r ? Math.max(8, Math.round(r / 4)) : 1;
        for (let k = 0; k < passos; k++) {
          const a = (k / passos) * Math.PI * 2;
          const px = G.clamp(Math.round(x + Math.cos(a) * r), 1, VIEW_W - p.w - 1);
          const py = G.clamp(Math.round(y + Math.sin(a) * r), 1, VIEW_H - p.h - 1);
          if (!G.boxSolid(this.room, px, py, p.w, p.h, false)) return { x: px, y: py };
        }
      }
      return { x: G.clamp(x | 0, 1, VIEW_W - p.w - 1), y: G.clamp(y | 0, 1, VIEW_H - p.h - 1) };
    }

    // posiciona os outros jogadores em volta do primeiro, em chao livre
    juntaJogadores(lider) {
      for (const p of this.players) if (p !== lider) this.posicionaPerto(p, lider);
    }

    // um jogador ao lado do lider, sem ficar em cima de ninguem
    posicionaPerto(p, lider) {
      for (let r = 14; r <= 56; r += 14) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const x = G.clamp(lider.x + Math.round(Math.cos(a) * r), 1, VIEW_W - p.w - 1);
          const y = G.clamp(lider.y + Math.round(Math.sin(a) * r), 1, VIEW_H - p.h - 1);
          if (G.boxSolid(this.room, x, y, p.w, p.h, false)) continue;
          if (this.players.some((o) => o !== p && Math.abs(o.x - x) < 10 && Math.abs(o.y - y) < 10)) continue;
          p.x = x; p.y = y;
          return;
        }
      }
      p.x = lider.x; p.y = lider.y;
    }

    enterLevel(levelId, roomIdx, px, py) {
      const prev = this.level;
      if (prev && prev !== this.levels[levelId]) G.clearCaches(prev);
      this.levelId = levelId;
      this.level = this.levels[levelId];
      this.roomIdx = roomIdx;
      this.player.x = px; this.player.y = py;
      for (const p of this.players) {
        p.knock = 0; p.atk = 0; p.roll = 0; p.rajadas = 0;
        p.cancelaEspeciais();
        p.dir = 'down';
      }
      this.stairsLock = true;
      this.stairsCd = 26;
      this.loadRoom(roomIdx);
      this.juntaJogadores(this.player);
      Music.set(this.room.type === 'boss' && !this.room.cleared ? this.musicaChefe(this.boss) : this.level.music);
    }

    loadRoom(idx) {
      this.roomIdx = idx;
      this.room = this.level.rooms[idx];
      this.room.visited = true;
      if (this.flags && this.level && this.level.mundo) {         // lembra as salas visitadas (teleporte)
        const v = (this.flags.visitadas = this.flags.visitadas || {});
        const lista = (v[this.levelId] = v[this.levelId] || []);
        if (lista.indexOf(idx) < 0) lista.push(idx);
      }
      this.ents.length = 0;
      this.particles.clear();
      this.boss = null;
      this.tempoParado = 0; this.elo = null;
      // sala que o chefe deforma (arena que encolhe): volta ao chao original
      if (this.room.meta.orig) { this.room.tiles.set(this.room.meta.orig); this.room.dirty = true; }

      const respawn = (this.level.kind === 'field' || !this.room.cleared) && this.modo() !== 'vs';
      if (respawn) {
        for (const s of this.room.spawns) {
          const e = G.spawnEnemy(s.type, s.x, s.y);
          if (e.boss && this.room.cleared) continue;
          this.escala(e);
          this.ents.push(e);
          if (e.boss) { e.tipoChefe = s.type; this.boss = e; }
        }
      }
      for (const o of this.room.objects) {
        if (o.kind === 'chest') {
          const id = this.levelId + ':' + idx + ':' + o.tx + ':' + o.ty;
          if (this.flags.chests[id]) continue;
          const c = new G.Chest(o.tx, o.ty, o.item, o.needClear);
          c.id = id;
          this.ents.push(c);
        } else if (G.OBJETOS[o.kind]) this.ents.push(G.OBJETOS[o.kind](o, this, idx));   // placas, fonte, lampioes, puzzle
      }

      if (this.boss && !this.room.cleared) {
        // fecha as portas so depois que todos sairem de cima delas (senao o heroi fica preso no batente)
        this.room.sealed = false;
        this.selar = true;
        Music.set(this.musicaChefe(this.boss));
        this.say(this.boss.name, 120);
        Sound.play('boss');
      } else {
        this.room.sealed = false;
        this.selar = false;
        if (this.level) Music.set(this.level.music);
      }
      this.room.dirty = this.room.dirty || !this.room.cache;
    }

    /* ---------------- helpers usados pelas entidades ---------------- */

    addEnt(e) {
      if (this.donoAtual && e.dono === undefined) e.dono = this.donoAtual;   // tiros do jogador
      if (e.fonte === undefined && this.fonteDano) e.fonte = this.fonteDano;  // criado por um especial (X, C ou V)
      this.escala(e);                    // monstros invocados no meio da luta
      this.ents.push(e);
      if (e.boss) this.boss = e;
    }

    // jogador vivo mais proximo (alvo dos monstros)
    alvo(e) {
      let best = this.player, bd = Infinity;
      for (const p of this.players) {
        if (p.dead) continue;
        const d = (p.cx - e.cx) ** 2 + (p.cy - e.cy) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }

    // o que os ataques de `dono` podem acertar: monstros e, no VS, o oponente
    alvos(dono) {
      const out = [];
      for (const e of this.ents) if (e.enemy && !e.dead) out.push(e);
      if (this.modo() === 'vs') for (const p of this.players) if (p !== dono && !p.dead) out.push(p);
      return out;
    }

    shake(n) { this.shakeAmp = Math.max(this.shakeAmp, n); this.shakeT = Math.max(this.shakeT, 10); }

    say(text, dur) { this.msg = text; this.msgT = dur || 160; }

    spawnPickup(x, y, kind) { this.ents.push(new G.Pickup(x, y, kind)); }

    // o monstro explode em moedas que voam para os lados e caem no chao; as vezes cai um coracao.
    // o total por monstro vem da dificuldade: facil 15, medio 8, dificil 3
    dropLoot(e) {
      const d = this.dif();
      const total = d.moedas === undefined ? 8 : d.moedas;
      const pecas = Math.max(1, d.pecas === undefined ? 4 : d.pecas);
      const a0 = Math.random() * Math.PI * 2;
      let resto = total;
      for (let k = 0; k < pecas; k++) {
        const pk = new G.Pickup(e.cx, e.cy, 'coin');
        const a = a0 + (k / pecas) * Math.PI * 2 + (Math.random() - 0.5) * 0.5, v = 1.3 + Math.random() * 1.2;
        pk.vx = Math.cos(a) * v; pk.vy = Math.sin(a) * v - 1.6;   // arco para cima e para os lados
        pk.pop = 18;
        pk.valor = k === pecas - 1 ? resto : Math.round(total / pecas);   // a ultima leva a sobra
        resto -= pk.valor;
        this.ents.push(pk);
      }
      if (Math.random() < 0.18) this.spawnPickup(e.cx, e.cy, 'heart');
    }

    onEnemyDeath(e) {
      const quem = this.players.indexOf(e.ultimoDono) >= 0 ? e.ultimoDono : this.player;
      if (quem.abateu(this.fonteDano) && quem === this.player) this.cdPulse = 10;   // abate adianta as recargas (menos a do especial que matou)
      if (this.modo() === 'comp') quem.abates++;

      if (e.boss) {
        this.room.cleared = true;
        this.room.sealed = false;
        // masmorra: um chefe por nivel; mundo aberto: um por sala
        this.flags.bosses[this.levelId + ':' + this.roomIdx] = true;
        if (this.level.kind === 'dungeon') this.flags.cleared[this.levelId + ':' + this.roomIdx] = true;
        this.boss = null;
        this.shake(12);
        for (let k = 0; k < 40; k++) {
          this.particles.spawn(e.cx, e.cy, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
            40 + Math.random() * 30, (Math.random() * 3) | 0, 2, 0);
        }
        // chefes das masmorras dao fragmento; os do mundo aberto, recipiente de coracao e joias
        this.spawnPickup(e.cx, e.cy, e.premio || 'shard');
        if (e.premio) for (let k = 0; k < 4; k++) this.spawnPickup(e.cx - 18 + k * 12, e.cy + 14, 'gem');
        Music.set(this.level.music);
        this.say('CHEFE DERROTADO!', 160);
        this.save();
        return;
      }
      this.dropLoot(e);
      const alive = this.ents.some((o) => o.enemy && !o.dead && o !== e);
      if (!alive) {
        if (this.level.kind === 'dungeon') {
          this.room.cleared = true;
          const key = this.levelId + ':' + this.roomIdx;
          this.flags.cleared[key] = true;
        }
        this.room.sealed = false;
      }
    }

    // chaves ficam com o jogador 1 e valem para os dois
    collect(p, quem) {
      quem = quem || this.player;
      switch (p.kind) {
        case 'coin': quem.coins += p.valor || 1; Sound.play('coin'); break;
        case 'gem': quem.coins += 5; Sound.play('coin'); break;
        case 'heart': quem.heal(2); Sound.play('heal'); break;
        case 'key': this.player.keys += 1; Sound.play('key'); this.say('CHAVE DA MASMORRA'); break;
        case 'container':
          quem.maxhp += 2; quem.hp = quem.maxhp;
          Sound.play('secret'); this.say('RECIPIENTE DE CORACAO!');
          break;
        case 'shard': this.giveShard(); break;
      }
      this.particles.burst(p.cx, p.cy, 6, 1, 1.4, 14);
    }

    // 16 fragmentos (2 por mundo); a cada 4, o poder das armas sobe um nivel
    giveShard() {
      const p = this.player;
      p.shards += 1;
      const nivel = 1 + Math.floor(p.shards / FRAG_POR_NIVEL);
      for (const o of this.players) o.sword = Math.max(o.sword, nivel);
      Sound.play('secret');
      this.say('FRAGMENTO DO MUNDO ' + p.shards + '/' + FRAGMENTOS + ' RESGATADO!' +
        (p.shards % FRAG_POR_NIVEL === 0 ? '\n' + p.def.arma + ' MAIS FORTE: PODER x' + nivel : ''), 220);
      this.save();
    }

    giveItem(item, x, y) {
      switch (item) {
        case 'key': this.spawnPickup(x, y - 8, 'key'); break;
        case 'container': this.spawnPickup(x, y - 8, 'container'); break;
        case 'coins10': this.player.coins += 10; Sound.play('coin'); this.say('10 MOEDAS'); break;
        case 'heart': this.spawnPickup(x, y - 8, 'heart'); break;
        default: this.player.coins += 5; Sound.play('coin');
      }
      const list = this.room.objects;
      for (const o of list) {
        if (o.kind === 'chest') {
          const id = this.levelId + ':' + this.roomIdx + ':' + o.tx + ':' + o.ty;
          const ent = this.ents.find((e) => e.chest && e.id === id);
          if (ent && ent.open) this.flags.chests[id] = true;
        }
      }
      this.save();
    }

    // tela toda branca por 0,4 s e depois some em 1,2 s
    telaBranca() { this.brancoT = BRANCO_CHEIO + BRANCO_FADE; }

    // explosao da bola de fogo: limpa a sala, chefe resiste levando 1/3 da vida
    // raioVs: distancia em que o oponente no VS leva o dano (a bomba nuclear pega a arena toda)
    novaBlast(x, y, dono, raioVs) {
      this.shake(14);
      this.flashT = 12;
      Sound.play('nova');
      for (let k = 0; k < 90; k++) {
        const a = (k / 90) * Math.PI * 2;
        const sp = 1.6 + Math.random() * 3.4;
        this.particles.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
          22 + Math.random() * 22, Math.random() < 0.6 ? 9 : 1, 2, 0);
      }

      const base = G.Enemy.prototype.hurt;   // ignora blindagem e fases intangiveis
      let killed = 0, bossHit = false;
      const done = new Set();
      for (let pass = 0; pass < 2; pass++) {   // 2a passada pega slimes que se dividiram
        const targets = this.ents.filter((e) => e.enemy && !e.dead && !done.has(e));
        for (const e of targets) {
          done.add(e);
          const a = Math.atan2(e.cy - y, e.cx - x);
          if (e.boss) {
            base.call(e, this, Math.max(1, Math.ceil(e.maxhp / (e.fracF || 3))), Math.cos(a), Math.sin(a));
            bossHit = true;
          } else {
            if (dono) e.ultimoDono = dono;
            base.call(e, this, 999, Math.cos(a), Math.sin(a));
            killed++;
          }
        }
      }
      if (this.modo() === 'vs') {             // o oponente dentro do raio leva dano fixo
        for (const p of this.players) {
          if (p === dono || p.dead || G.dist(x, y, p.cx, p.cy) > (raioVs || 72)) continue;
          const a = Math.atan2(p.cy - y, p.cx - x);
          G.ferirBruto(this, p, G.PVP_F, Math.cos(a), Math.sin(a), dono);
        }
      }
      if (bossHit) this.say('O CHEFE RESISTE!', 100);
      else if (killed) this.say('SALA INCINERADA!', 90);
    }

    onPlayerDead(p) {
      Sound.play('death');
      // morreu na sala de um chefe vivo: ao voltar, os monstros do mundo renascem
      this.morteChefe = this.room && this.room.type === 'boss' && !this.room.cleared;
      const m = this.modo();
      if (m === 'vs') {
        this.checaFimVS(p);
        return;
      }
      if (m === 'comp') { p.respawnT = RESPAWN_COMP; this.say('JOGADOR ' + p.num + ' CAIU', 80); return; }
      if (m === 'coop' && this.players.some((o) => !o.dead)) {
        p.respawnT = RESPAWN_COOP;
        this.say('JOGADOR ' + p.num + ' CAIU! VOLTA EM 4 S', 100);
        return;
      }
      Music.stop();
      this.fadeTo(() => { this.state = 'dead'; });
    }

    // VS todos contra todos: quem cai esta fora; sobrou um (ou ninguem), acaba a rodada
    checaFimVS(caiu) {
      if (this.acabou) return;
      const vivos = this.players.filter((o) => !o.dead);
      if (vivos.length > 1) {
        if (caiu) this.say('JOGADOR ' + caiu.num + ' FOI ELIMINADO', 100);
        return;
      }
      this.acabou = true;
      this.vencedor = vivos[0] || null;
      this.fadeTo(() => { this.state = 'fim'; Music.set('win'); });
    }

    // multijogador: volta ao lado de quem esta vivo (ou no inicio da area)
    reviver(p) {
      p.dead = false;
      p.hp = Math.max(4, (p.maxhp / 2) | 0);
      p.inv = 90;
      p.knock = 0; p.atk = 0; p.roll = 0;
      p.cancelaEspeciais();
      const vivo = this.players.find((o) => o !== p && !o.dead);
      if (vivo) this.posicionaPerto(p, vivo);
      else { const lv = this.level; p.x = lv.start.x; p.y = lv.start.y; }
      this.particles.burst(p.cx, p.cy, 16, 1, 2, 20);
      this.say('JOGADOR ' + p.num + ' VOLTOU', 60);
    }

    /* ---------------- transicoes ---------------- */

    fadeTo(fn) { this.fade = 0; this.fadeDir = 1; this.onFade = fn; }

    startRoomTransition(dir, lider) {
      const p = lider || this.player;
      const nextIdx = this.room.exits[dir];
      if (nextIdx === undefined) return false;
      const from = this.room;
      for (const o of this.players) { o.cancelaEspeciais(); o.rajadas = 0; }
      this.loadRoom(nextIdx);
      const target = { x: p.x, y: p.y };
      if (dir === 'n') target.y = VIEW_H - p.h - 4;
      if (dir === 's') target.y = 3;
      if (dir === 'w') target.x = VIEW_W - p.w - 4;
      if (dir === 'e') target.x = 3;
      const start = { x: target.x, y: target.y };
      if (dir === 'n') start.y = VIEW_H + 2;
      if (dir === 's') start.y = -p.h - 2;
      if (dir === 'w') start.x = VIEW_W + 2;
      if (dir === 'e') start.x = -p.w - 2;

      // os outros entram logo atras de quem puxou a transicao, espalhados para os lados
      const outros = [];
      const atras = { n: [0, -14], s: [0, 14], w: [-14, 0], e: [14, 0] }[dir];
      let k = 0;
      for (const o of this.players) {
        if (o === p) continue;
        const lado = Math.ceil(k / 2) * 12 * (k % 2 ? 1 : -1);
        k++;
        const off = atras[0] ? [atras[0], lado] : [lado, atras[1]];
        const tg = { x: G.clamp(target.x + off[0], 3, VIEW_W - o.w - 3), y: G.clamp(target.y + off[1], 3, VIEW_H - o.h - 3) };
        outros.push({ p: o, start: { x: start.x + off[0], y: start.y + off[1] }, target: tg });
        if (o.dead) { o.x = tg.x; o.y = tg.y; }
      }
      this.trans = { dir, t: 0, dur: 22, from, start, target, lider: p, outros };
      p.x = start.x; p.y = start.y;
      this.state = 'transition';
      return true;
    }

    checkExits() {
      if (this.room.sealed) {                     // chefe vivo: nao da para sair
        const borda = this.players.some((p) => !p.dead && (p.x <= 2 || p.y <= 2 ||
          p.x + p.w >= VIEW_W - 2 || p.y + p.h >= VIEW_H - 2));
        if (borda && this.tick % 60 === 0) this.say('DERROTE O CHEFE PARA SAIR!', 70);
        return false;
      }
      for (const p of this.players) {
        if (p.dead) continue;
        const i = p.input || this.input;
        const B = 2;                              // folga: encostado na borda (ate 2 px) ja troca de sala
        if (p.y <= B && i.down('up') && this.room.exits.n !== undefined) return this.startRoomTransition('n', p);
        if (p.y + p.h >= VIEW_H - B && i.down('down') && this.room.exits.s !== undefined) return this.startRoomTransition('s', p);
        if (p.x <= B && i.down('left') && this.room.exits.w !== undefined) return this.startRoomTransition('w', p);
        if (p.x + p.w >= VIEW_W - B && i.down('right') && this.room.exits.e !== undefined) return this.startRoomTransition('e', p);
      }
      return false;
    }

    checkTileEvents() {
      const T = G.T;
      const vivos = this.players.filter((p) => !p.dead);
      const tileDe = (p) => G.tileAt(this.room, (p.cx / TILE) | 0, ((p.y + p.h - 2) / TILE) | 0);

      // evita que a escada dispare de novo ao chegar em cima dela (vale para os dois)
      const onStairs = vivos.some((p) => {
        const t = tileDe(p);
        return t === T.STAIRS_DOWN || t === T.STAIRS_UP || t === T.PORTAL || t === T.PORTAL2;
      });
      if (this.stairsCd > 0) this.stairsCd--;
      if (this.stairsLock || this.stairsCd > 0) {
        if (!onStairs) this.stairsLock = false;
      } else {
        for (const p of vivos) if (this.escada(p, tileDe(p))) break;
      }
      for (const p of vivos) this.portaTrancada(p);
    }

    // portal da sala do puzzle: leva ao proximo mundo (no ultimo, ao final da historia)
    escada(p, t) {
      if (t !== G.T.PORTAL || !this.level.mundo || !this.room.meta.puzzle) return false;
      Sound.play('stairs');
      const n = this.level.mundo;
      if (n >= G.MUNDOS.length) {
        this.fadeTo(() => this.contaHistoria(G.CENAS_FIM, () => { this.state = 'win'; Music.set('win'); }));
        return true;
      }
      const id = 'mundo' + (n + 1), lv = this.levels[id];
      this.fadeTo(() => {
        this.enterLevel(id, lv.start.room, lv.start.x, lv.start.y);
        this.flags.checkpoint = { level: id, room: lv.start.room, x: lv.start.x, y: lv.start.y };
        this.say(lv.name + '\n' + lv.sub, 220);
        this.save();
      });
      return true;
    }

    // porta trancada a frente (varre a caixa logo a frente do jogador)
    portaTrancada(p) {
      const T = G.T;
      const v = DIR_VEC[p.dir];
      const found = this.findTile(p.x + v[0] * 6, p.y + v[1] * 6, p.w, p.h, T.DOOR_LOCKED);
      if (found) {
        const dtx = found[0], dty = found[1];
        if (this.player.keys > 0) {
          this.player.keys--;
          const side = dty === 0 ? 'n' : dty === ROOM_H - 1 ? 's' : dtx === 0 ? 'w' : 'e';
          this.unlockSide(this.room, side);
          const nb = this.room.exits[side];
          if (nb !== undefined) this.unlockSide(this.level.rooms[nb], G.OPP[side]);
          this.flags.unlocked[this.levelId + ':' + this.roomIdx + ':' + side] = true;
          Sound.play('door');
          this.say('PORTA DESTRANCADA');
          this.save();
        } else if (this.tick % 40 === 0) {
          this.say('PRECISA DE UMA CHAVE', 70);
          Sound.play('blocked');
        }
      }
    }

    findTile(x, y, w, h, id) {
      const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
      const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (G.tileAt(this.room, tx, ty) === id) return [tx, ty];
        }
      }
      return null;
    }

    unlockSide(room, side) {
      const T = G.T;
      if (side === 'n') GAP_X.forEach((x) => G.setTile(room, x, 0, T.DOOR));
      else if (side === 's') GAP_X.forEach((x) => G.setTile(room, x, ROOM_H - 1, T.DOOR));
      else if (side === 'w') GAP_Y.forEach((y) => G.setTile(room, 0, y, T.DOOR));
      else GAP_Y.forEach((y) => G.setTile(room, ROOM_W - 1, y, T.DOOR));
      delete room.locked[side];
    }

    /* ---------------- save ---------------- */

    save() {
      if (!this.player || this.mp) return;
      const p = this.player;
      const data = {
        seed: this.seed,
        levelId: this.levelId, room: this.roomIdx, x: p.x, y: p.y,
        hp: p.hp, maxhp: p.maxhp, coins: p.coins, keys: p.keys,
        shards: p.shards, sword: p.sword,
        cls: p.cls, elem: p.elem, compras: p.compras, dif: this.difIdx,
        flags: this.flags
      };
      if (G.store.set(SAVE_KEY, JSON.stringify(data))) this.hasSave = true;
    }

    load() {
      let d;
      try { d = JSON.parse(G.store.get(SAVE_KEY)); } catch (e) { d = null; }
      if (!d) return false;
      this.seed = d.seed;
      this.levels = this.geraMundos(this.seed);
      if (!this.levels[d.levelId]) return false;
      this.flags = d.flags || { chests: {}, bosses: {}, cleared: {}, unlocked: {} };
      this.flags.puzzles = this.flags.puzzles || {};
      this.flags.chests = this.flags.chests || {};
      this.flags.bosses = this.flags.bosses || {};
      this.flags.cleared = this.flags.cleared || {};
      this.flags.unlocked = this.flags.unlocked || {};

      // reaplica progresso
      for (const key in this.flags.cleared) {
        const [lid, ridx] = key.split(':');
        const lv = this.levels[lid];
        if (lv && lv.rooms[ridx]) lv.rooms[ridx].cleared = true;
      }
      for (const key in this.flags.bosses) {
        const [lid, ridx] = key.split(':');
        const lv = this.levels[lid];
        if (!lv) continue;
        if (ridx !== undefined && lv.rooms[ridx]) lv.rooms[ridx].cleared = true;
        else if (lv.bossRoom !== undefined) lv.rooms[lv.bossRoom].cleared = true;
      }
      for (const lid in this.flags.visitadas || {}) {
        const lv = this.levels[lid];
        if (lv) for (const i of this.flags.visitadas[lid]) if (lv.rooms[i]) lv.rooms[i].visited = true;
      }
      for (const key in this.flags.unlocked) {
        const parts = key.split(':');
        const lv = this.levels[parts[0]];
        if (!lv) continue;
        const room = lv.rooms[parts[1]];
        if (room) this.unlockSide(room, parts[2]);
      }

      if (DIFICULDADES[d.dif]) this.difIdx = d.dif;
      this.cls = G.CLASSES[d.cls] ? d.cls : 'guerreiro';
      this.player = new G.Player(d.x, d.y, this.cls);
      this.players = [this.player];
      this.player.elem = d.elem || 0;
      // saves antigos: sobe a vida maxima para o novo padrao de 5 coracoes
      this.player.maxhp = Math.max(d.maxhp, this.player.def.hp);
      this.player.hp = Math.min(this.player.maxhp, d.hp + (this.player.maxhp - d.maxhp));
      this.player.coins = d.coins; this.player.keys = d.keys;
      this.player.shards = d.shards; this.player.sword = d.sword || 1;
      for (const id in d.compras || {}) this.player.compra(id);
      this.enterLevel(d.levelId, d.room, d.x, d.y);
      this.state = 'play';
      return true;
    }

    /* ---------------- update ---------------- */

    step() {
      this.tick++;
      this.input.poll();
      Music.update();

      if (this.msgT > 0) this.msgT--;
      if (this.flashT > 0) this.flashT--;
      if (this.brancoT > 0) this.brancoT--;
      if (this.cdPulse > 0) this.cdPulse--;
      if (this.shakeT > 0) { this.shakeT--; if (this.shakeT === 0) this.shakeAmp = 0; }

      if (this.fadeDir !== 0) {
        this.fade += this.fadeDir * 0.07;
        if (this.fade >= 1 && this.fadeDir > 0) {
          this.fade = 1; this.fadeDir = -1;
          if (this.onFade) { const f = this.onFade; this.onFade = null; f(); }
        } else if (this.fade <= 0 && this.fadeDir < 0) { this.fade = 0; this.fadeDir = 0; }
      }

      switch (this.state) {
        case 'title': this.stepTitle(); break;
        case 'select': this.stepSelect(); break;
        case 'dificuldade': this.stepDificuldade(); break;
        case 'teleporte': this.stepTeleporte(); break;
        case 'play': this.stepPlay(); break;
        case 'transition': this.stepTransition(); break;
        case 'pause': this.stepPause(); break;
        case 'dead': this.stepDead(); break;
        case 'win': this.stepWin(); break;
        case 'lobby': this.stepLobby(); break;
        case 'remoto': this.stepRemoto(); break;
        case 'fim': this.stepFim(); break;
        case 'historia': if (this.historia) this.historia.update(this.input); break;
        case 'batalha': if (this.batalha) this.batalha.update(); break;
      }
      for (const p of this.players) if (p.input) p.input.endFrame();

      const digitando = this.state === 'lobby' && this.lobby && this.lobby.etapa === 'codigo';
      if (this.input.hit('mute') && !digitando) { const on = Sound.toggle(); this.say(on ? 'SOM LIGADO' : 'SOM DESLIGADO', 80); }
      if (this.input.hit('debug')) this.showFps = !this.showFps;
      this.input.endFrame();
    }

    stepTitle() {
      if (this.input.hit('multi')) { Sound.init(); Sound.resume(); Sound.play('menu'); this.abrirLobby(); return; }
      if (this.input.hit('start') || this.input.hit('attack')) {
        Sound.init(); Sound.resume(); Sound.play('menu');
        if (this.hasSave && this.input.hit('start')) {
          if (!this.load()) this.abrirSelecao();
        } else this.abrirSelecao();
      }
      if (this.input.hit('pause') && this.hasSave) {
        G.store.del(SAVE_KEY); this.hasSave = false; Sound.play('blocked');
      }
    }

    abrirSelecao() {
      this.selIdx = G.CLASS_IDS.indexOf(this.cls || 'guerreiro');
      if (this.selIdx < 0) this.selIdx = 0;
      this.state = 'select';
    }

    stepSelect() {
      const i = this.input, n = G.CLASS_IDS.length;
      if (i.hit('left')) { this.selIdx = (this.selIdx + n - 1) % n; Sound.play('menu'); }
      if (i.hit('right')) { this.selIdx = (this.selIdx + 1) % n; Sound.play('menu'); }
      if (i.hit('up') && this.selIdx >= SEL_COLUNAS) { this.selIdx -= SEL_COLUNAS; Sound.play('menu'); }
      if (i.hit('down') && this.selIdx + SEL_COLUNAS < n) { this.selIdx += SEL_COLUNAS; Sound.play('menu'); }
      if (i.hit('pause')) {
        Sound.play('blocked');
        if (this.lobby) this.state = 'lobby'; else this.state = 'title';
        return;
      }
      if (i.hit('start') || i.hit('attack')) {
        Sound.play('secret');
        if (this.lobby) this.iniciarRede(G.CLASS_IDS[this.selIdx]);
        else this.state = 'dificuldade';
      }
    }

    /* ---------------- teleporte (T): volta para qualquer sala ja visitada do mundo ---------------- */

    abreTeleporte() {
      const m = this.modo();
      if (!this.level.mundo || m === 'vs' || m === 'comp') return;
      if (this.player.dead) return;
      if (this.room.sealed || (this.boss && !this.boss.dead && !this.room.cleared)) {
        this.say('NAO DA PARA SE TELEPORTAR NO MEIO DE UMA LUTA COM CHEFE', 90);
        Sound.play('blocked');
        return;
      }
      this.tele = { sel: this.roomIdx };
      this.state = 'teleporte';
      Sound.play('cast');
    }

    stepTeleporte() {
      const i = this.input, t = this.tele, lv = this.level;
      let rx = t.sel % lv.cols, ry = (t.sel / lv.cols) | 0;
      if (i.hit('left') && rx > 0) rx--;
      if (i.hit('right') && rx < lv.cols - 1) rx++;
      if (i.hit('up') && ry > 0) ry--;
      if (i.hit('down') && ry < lv.rows - 1) ry++;
      const novo = ry * lv.cols + rx;
      if (novo !== t.sel) { t.sel = novo; Sound.play('menu'); }
      if (i.hit('pause') || i.hit('teleporte')) { this.tele = null; this.state = 'play'; Sound.play('menu'); return; }
      if (i.hit('start') || i.hit('attack')) {
        const room = lv.rooms[t.sel];
        if (!room.visited) { Sound.play('blocked'); this.say('VOCE AINDA NAO ESTEVE NESSA SALA', 70); return; }
        this.tele = null;
        this.state = 'play';
        if (t.sel === this.roomIdx) return;
        this.teleporta(t.sel);
      }
    }

    teleporta(idx) {
      Sound.play('stairs');
      this.flashT = 8;
      this.particles.burst(this.player.cx, this.player.cy, 24, 8, 2.2, 24);
      this.fadeTo(() => {
        const pos = this.pontoLivre(this.level.rooms[idx]);
        this.enterLevel(this.levelId, idx, pos.x, pos.y);
        this.particles.burst(this.player.cx, this.player.cy, 24, 8, 2.2, 24);
        this.say('TELEPORTE: SALA ' + (this.room.meta.ordem + 1) + '/12', 80);
        this.save();
      });
    }

    // chao livre perto do meio da sala (espiral a partir do centro)
    pontoLivre(room) {
      const cx = ROOM_W >> 1, cy = ROOM_H >> 1;
      for (let r = 0; r < 12; r++) {
        for (let ty = cy - r; ty <= cy + r; ty++) {
          for (let tx = cx - r; tx <= cx + r; tx++) {
            if (Math.max(Math.abs(tx - cx), Math.abs(ty - cy)) !== r) continue;
            const x = tx * TILE + 3, y = ty * TILE + 3;
            if (tx > 0 && ty > 0 && tx < ROOM_W - 1 && ty < ROOM_H - 1 && !G.boxSolid(room, x, y, 10, 10, false)) return { x, y };
          }
        }
      }
      return { x: cx * TILE, y: cy * TILE };
    }

    drawTeleporte(c) {
      c.fillStyle = 'rgba(6,8,16,0.9)';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
      const lv = this.level, t = this.tele;
      this.text(c, 'TELEPORTE', VIEW_W / 2, 26, '#b45cff', 'center', 12);
      this.text(c, lv.name, VIEW_W / 2, 40, '#8f96a8', 'center');
      const cw = 44, ch = 30, ox = (VIEW_W - lv.cols * cw) / 2, oy = 52;
      const PAPEL = { inicio: 'INICIO', inimigos: 'INIMIGOS', tesouro: 'TESOURO', chefe: 'GUARDIAO', descanso: 'FONTE', puzzle: 'PORTAL' };
      for (let ry = 0; ry < lv.rows; ry++) {
        for (let rx = 0; rx < lv.cols; rx++) {
          const idx = ry * lv.cols + rx, room = lv.rooms[idx], x = ox + rx * cw, y = oy + ry * ch;
          const m = room.meta;
          c.fillStyle = !room.visited ? '#1a1d29' : room.type === 'boss' ? (room.cleared ? '#4a2030' : '#8a2030')
            : m.papel === 'descanso' ? '#1f4a5a' : m.puzzle ? '#4a2a6a' : '#2c3444';
          c.fillRect(x + 2, y + 2, cw - 4, ch - 4);
          if (room.visited) this.text(c, String(m.ordem + 1), x + cw / 2, y + ch / 2 + 4, '#c8cede', 'center');
          if (idx === this.roomIdx) { c.fillStyle = '#ffd34d'; c.fillRect(x + 5, y + 5, 4, 4); }
          if (idx === t.sel) {
            c.strokeStyle = (this.tick >> 3) & 1 ? '#ffffff' : '#b45cff';
            c.lineWidth = 2;
            c.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
          }
        }
      }
      const sel = lv.rooms[t.sel], y0 = oy + lv.rows * ch + 16;
      if (sel.visited) {
        const nome = 'SALA ' + (sel.meta.ordem + 1) + ' - ' + (PAPEL[sel.meta.papel] || '') + (t.sel === this.roomIdx ? ' (VOCE ESTA AQUI)' : '');
        this.text(c, nome, VIEW_W / 2, y0, '#fff', 'center');
      } else this.text(c, 'SALA AINDA NAO VISITADA', VIEW_W / 2, y0, '#5c667e', 'center');
      this.text(c, 'AMARELO = VOCE   AZUL = FONTE   ROXO = PORTAL   VERMELHO = GUARDIAO', VIEW_W / 2, y0 + 14, '#5c667e', 'center');
      this.text(c, 'SETAS ESCOLHEM   ENTER OU J TELEPORTA   T OU ESC FECHA', VIEW_W / 2, VIEW_H + HUD_H - 10, '#8f96a8', 'center');
    }

    stepDificuldade() {
      const i = this.input;
      if (i.hit('up') || i.hit('left')) this.trocaDificuldade(-1);
      if (i.hit('down') || i.hit('right')) this.trocaDificuldade(1);
      if (i.hit('pause')) { Sound.play('blocked'); this.state = 'select'; return; }
      if (i.hit('start') || i.hit('attack')) { Sound.play('secret'); this.newGame(null, G.CLASS_IDS[this.selIdx]); }
    }

    stepPlay() {
      // solo: o menu (loja e mapa) pausa o jogo. Multijogador: cada um abre o seu e o jogo segue
      if (!this.mp && this.input.hit('pause')) { this.abreMenu(this.player); this.state = 'pause'; return; }
      if (this.input.hit('teleporte') && this.fadeDir === 0) { this.abreTeleporte(); if (this.state !== 'play') return; }
      if (this.fadeDir > 0) return;

      for (const p of this.players) {
        if (p.dead) {
          p.menu = null;
          if (this.mp && p.respawnT > 0 && --p.respawnT === 0) this.reviver(p);
          continue;
        }
        if (this.mp) {
          const i = p.input || this.input;
          if (p.menu) { this.stepMenu(p, i); continue; }   // parado enquanto olha a loja
          if (i.hit('pause')) { this.abreMenu(p); continue; }
        }
        // tempo parado pelo cronomante: no VS o oponente tambem fica congelado
        if (this.tempoParado > 0 && this.modo() === 'vs' && p !== this.tempoDono) continue;
        this.donoAtual = p;
        // tudo que sair de um especial fica marcado com ele: X, C e V nao recarregam a si mesmos
        this.fonteDano = p.fonteAtiva(p.input || this.input);
        const n0 = this.ents.length, rec0 = p.recargas();
        p.update(this);
        const usou = p.especialUsado(rec0);                 // especial solto neste quadro (ex.: soltar o X carregado)
        if (usou) for (let k = n0; k < this.ents.length; k++) if (this.ents[k].dono === p && !this.ents[k].fonte) this.ents[k].fonte = usou;
        this.fonteDano = null;
        this.donoAtual = null;
      }

      const ents = this.ents;
      const parado = this.tempoParado > 0;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        // tempo parado: so anda o que os jogadores criaram (e itens e baus)
        if (parado && e.dono === undefined && !e.pickup && !e.chest) continue;
        this.fonteDano = e.fonte || null;
        if (!e.dead) e.update(this);
      }
      this.fonteDano = null;
      if (this.tempoParado > 0) this.tempoParado--;
      for (let i = ents.length - 1; i >= 0; i--) if (ents[i].dead) ents.splice(i, 1);

      this.particles.update();

      if (this.boss && this.boss.dead) this.boss = null;
      if (this.selar) this.tentaSelar();
      const m = this.modo();
      if (m === 'comp') this.stepCompetitivo();
      if (this.state !== 'play') return;
      // no meio de um especial do guerreiro nao pega escada nem troca de sala; no VS a arena e fechada
      const vivos = this.players.filter((o) => !o.dead);
      if (m !== 'vs' && vivos.length && !vivos.some((o) => o.especialAtivo())) {
        this.checkTileEvents();
        this.checkExits();
      }

      if ((this.tick & 255) === 0) this.save();
    }

    // sala de chefe: fecha assim que ninguem estiver em cima de uma porta
    tentaSelar() {
      if (!this.boss || this.boss.dead || this.room.cleared) { this.selar = false; return; }
      this.room.sealed = true;
      const livre = this.players.every((p) => p.dead || !G.boxSolid(this.room, p.x, p.y, p.w, p.h, false));
      if (livre) this.selar = false; else this.room.sealed = false;
    }

    // competitivo: cronometro e inimigos novos o tempo todo
    stepCompetitivo() {
      if (this.tempo <= 0) return;           // acabou: esperando o fade
      if (--this.tempo === 0) {
        const top = Math.max(...this.players.map((p) => p.abates));
        const lideres = this.players.filter((p) => p.abates === top);
        this.vencedor = lideres.length === 1 ? lideres[0] : null;
        Sound.play('secret');
        this.fadeTo(() => { this.state = 'fim'; Music.set('win'); });
        return;
      }
      if (this.room.type === 'boss' || --this.spawnT > 0) return;
      this.spawnT = COMP_SPAWN;
      const max = Math.min(COMP_MAX_TETO, COMP_MAX + 2 * Math.max(0, this.players.length - 2));
      if (this.ents.filter((e) => e.enemy && !e.dead).length >= max) return;
      const tipos = COMP_TIPOS[this.levelId] || COMP_TIPOS[this.level.kind] || COMP_TIPOS.field;
      for (let k = 0; k < 24; k++) {
        const x = (1 + ((Math.random() * (ROOM_W - 2)) | 0)) * TILE + 2;
        const y = (1 + ((Math.random() * (ROOM_H - 2)) | 0)) * TILE + 2;
        if (G.boxSolid(this.room, x, y, 12, 12, false)) continue;
        if (this.players.some((o) => G.dist(o.cx, o.cy, x + 6, y + 6) < 56)) continue;
        const e = G.spawnEnemy(tipos[(Math.random() * tipos.length) | 0], x, y);
        this.ents.push(e);
        this.particles.burst(e.cx, e.cy, 10, 8, 1.4, 16);
        return;
      }
    }

    stepTransition() {
      const t = this.trans;
      t.t++;
      const k = Math.min(1, t.t / t.dur);
      const e = k * k * (3 - 2 * k);
      const p = t.lider || this.player;
      p.x = G.lerp(t.start.x, t.target.x, e);
      p.y = G.lerp(t.start.y, t.target.y, e);
      for (const o of t.outros || []) {
        if (o.p.dead) continue;
        o.p.x = G.lerp(o.start.x, o.target.x, e);
        o.p.y = G.lerp(o.start.y, o.target.y, e);
      }
      this.particles.update();
      if (t.t >= t.dur) {
        p.x = t.target.x; p.y = t.target.y;
        for (const o of t.outros || []) { o.p.x = o.target.x; o.p.y = o.target.y; }
        this.trans = null;
        this.state = 'play';
        this.save();
      }
    }

    stepPause() {
      const p = this.player;
      if (!p.menu) this.abreMenu(p);
      this.stepMenu(p, this.input);
      if (!p.menu) this.state = 'play';
    }

    /* ---------------- menu do ESC: loja e mapa ---------------- */

    abreMenu(p) {
      p.menu = { aba: 0, sel: 0 };
      Sound.play('menu');
    }

    // setas para os lados trocam de aba, para cima e baixo escolhem, J ou Enter compra, ESC fecha
    stepMenu(p, i) {
      const m = p.menu;
      if (i.hit('pause')) { p.menu = null; Sound.play('menu'); return; }
      if (i.hit('left') || i.hit('right')) { m.aba = 1 - m.aba; Sound.play('menu'); return; }
      if (m.aba === 1) {
        if (i.hit('start')) { p.menu = null; Sound.play('menu'); }
        if (p === this.player && this.modo() !== 'vs') {       // dificuldade: so o jogador 1 muda
          if (i.hit('up')) this.trocaDificuldade(-1);
          if (i.hit('down')) this.trocaDificuldade(1);
        }
        return;
      }
      const n = G.LOJA.length;
      if (i.hit('up')) { m.sel = (m.sel + n - 1) % n; Sound.play('menu'); }
      if (i.hit('down')) { m.sel = (m.sel + 1) % n; Sound.play('menu'); }
      if (i.hit('attack') || i.hit('start')) this.comprar(p, G.LOJA[m.sel]);
    }

    comprar(p, item) {
      const quem = this.mp ? 'JOGADOR ' + p.num + ': ' : '';
      if (p.compras[item.id]) { Sound.play('blocked'); this.say(quem + 'JA COMPRADO', 60); return; }
      if (p.coins < item.preco) {
        Sound.play('blocked');
        this.say(quem + 'FALTAM ' + (item.preco - p.coins) + ' MOEDAS', 60);
        return;
      }
      p.coins -= item.preco;
      p.compra(item.id);
      Sound.play('secret');
      this.particles.burst(p.cx, p.cy, 16, 1, 2, 20);
      this.say(quem + item.nome + '!', 80);
      this.save();
    }

    stepDead() {
      if (this.input.hit('start') || this.input.hit('attack')) {
        Sound.play('menu');
        for (const p of this.players) {
          p.dead = false;
          p.respawnT = 0;
          p.hp = p.maxhp;                     // volta ao inicio com a vida cheia
          p.inv = 90;
        }
        this.fadeTo(() => {
          // volta na ultima fonte (ou no comeco do mundo)
          const lv = this.level, id = this.levelId, ck = this.flags.checkpoint;
          if (this.morteChefe) { this.renasceMonstros(id); this.morteChefe = false; }
          if (ck && ck.level === id) this.enterLevel(id, ck.room, ck.x, ck.y);
          else this.enterLevel(id, lv.start.room, lv.start.x, lv.start.y);
          this.state = 'play';
        });
      }
    }

    // todas as salas de monstros do mundo voltam a ter inimigos (chefes derrotados e baus abertos continuam)
    renasceMonstros(id) {
      const lv = this.levels[id];
      lv.rooms.forEach((room, idx) => {
        if (room.type === 'boss' || !room.spawns.length) return;
        room.cleared = false;
        delete this.flags.cleared[id + ':' + idx];
      });
      this.save();
    }

    stepWin() {
      if (this.input.hit('start')) {
        if (!this.mp) { G.store.del(SAVE_KEY); this.hasSave = false; }
        this.sairRede();
        this.state = 'title';
        Music.stop();
      }
    }

    /* ---------------- multijogador ---------------- */

    abrirLobby() {
      const codigo = Net.codigoDoLink();
      this.lobby = { etapa: 'menu', sel: codigo ? 1 : 0, msg: '', codigo, transporte: Net.transporte };
      if (!Net.disponivel()) { this.lobby.etapa = 'erro'; this.lobby.msg = 'NAVEGADOR SEM SUPORTE A REDE'; }
      const L = this.lobby;
      Net.detectar().then((t) => { L.transporte = t; });
      this.state = 'lobby';
    }

    // convidado pela internet: digita o codigo da sala (teclado) ou recebe pelo link
    digitaCodigo(e) {
      const L = this.lobby;
      if (this.state !== 'lobby' || !L || L.etapa !== 'codigo') return false;
      if (e.code === 'Backspace') { L.codigo = L.codigo.slice(0, -1); return true; }
      if (e.code === 'Escape') { L.etapa = 'menu'; L.sel = 1; Sound.play('blocked'); return true; }
      const k = (e.key || '').toUpperCase();
      if (k.length === 1 && /[A-Z0-9]/.test(k)) {
        if (L.codigo.length < Net.TAM_CODIGO) { L.codigo += k; Sound.play('menu'); }
        return true;
      }
      return e.code !== 'Enter' && e.code !== 'NumpadEnter';   // Enter segue para o input normal
    }

    stepLobby() {
      const i = this.input, L = this.lobby;
      if (L.etapa === 'codigo') {
        if (!i.hit('start')) return;
        if (L.codigo.length === Net.TAM_CODIGO) { Sound.play('menu'); this.abrirSelecao(); return; }
        if (i.touch && window.prompt) {                // celular: teclado do sistema
          const v = window.prompt('Codigo da sala (' + Net.TAM_CODIGO + ' letras):', L.codigo) || '';
          L.codigo = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, Net.TAM_CODIGO);
          if (L.codigo.length === Net.TAM_CODIGO) this.abrirSelecao();
        } else Sound.play('blocked');
        return;
      }
      if (L.etapa === 'espera' && i.hit('spin') && Net.codigo) { this.copiaLink(); return; }
      const opcoes = L.etapa === 'menu' ? 3 : L.etapa === 'modo' ? MODOS.length : L.etapa === 'arena' ? G.ARENAS.length : 0;
      if (opcoes) {
        if (i.hit('up')) { L.sel = (L.sel + opcoes - 1) % opcoes; Sound.play('menu'); }
        if (i.hit('down')) { L.sel = (L.sel + 1) % opcoes; Sound.play('menu'); }
      }
      const ok = i.hit('start') || i.hit('attack');
      if (i.hit('pause')) {
        Sound.play('blocked');
        if (L.etapa === 'modo') { L.etapa = 'menu'; L.sel = 0; return; }
        if (L.etapa === 'arena') { L.etapa = 'modo'; L.sel = MODOS.findIndex((m) => m.id === 'vs'); return; }
        this.sairRede();
        this.state = 'title';
        return;
      }
      if (!ok) return;
      if (L.etapa === 'menu') {
        Sound.play('menu');
        if (L.sel === 0) { L.etapa = 'modo'; L.sel = 0; }
        else if (L.sel === 1) {
          L.papel = 'guest';
          // pela internet precisa do codigo da sala; na rede local o servidor ja sabe qual e
          if (L.transporte === 'ws') this.abrirSelecao();
          else { L.etapa = 'codigo'; L.codigo = L.codigo || ''; }
        } else { this.lobby = null; this.state = 'title'; }
      } else if (L.etapa === 'modo') {
        Sound.play('menu');
        L.papel = 'host'; L.modo = MODOS[L.sel].id;
        if (L.modo === 'vs') { L.etapa = 'arena'; L.sel = 0; }
        else this.abrirSelecao();
      } else if (L.etapa === 'arena') {
        Sound.play('menu');
        L.arena = G.ARENAS[L.sel].id;
        this.abrirSelecao();
      } else if (L.etapa === 'espera') {
        // o anfitriao comeca quando quiser; quem chegar depois entra com o jogo rolando
        if (L.modo === 'vs' && !L.jogadores.length) { Sound.play('blocked'); return; }
        Sound.play('secret');
        this.comecarMulti();
      } else if (L.etapa === 'erro') {
        this.sairRede();
        this.state = 'title';
      }
    }

    copiaLink() {
      const L = this.lobby, link = Net.linkDaSala();
      const ok = () => { L.copiado = 120; Sound.play('coin'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, () => Sound.play('blocked'));
      else Sound.play('blocked');
    }

    iniciarRede(cls) {
      const L = this.lobby;
      L.cls = cls;
      L.etapa = 'conectando';
      this.state = 'lobby';
      Net.detectar().then((t) => {
        if (this.lobby !== L) return;
        L.transporte = t;
        if (L.papel === 'host') {
          L.etapa = 'espera';
          L.jogadores = [];
          Net.conectar({ t: 'criar', modo: L.modo }, (m) => this.msgRede(m), () => this.fimRede());
        } else {
          Net.conectar({ t: 'entrar', cls, codigo: L.codigo }, (m) => this.msgRede(m), () => this.fimRede());
        }
      });
    }

    comecarMulti() {
      const L = this.lobby;
      this.mp = { modo: L.modo, papel: 'host', cls: L.cls, arena: L.arena, convidados: L.jogadores.slice() };
      this.lobby = null;
      Net.eco = true;
      this.newGame(null, this.mp.cls, this.mp.convidados);
      Net.enviar({ t: 'inicio', modo: this.mp.modo });
    }

    // anfitriao: quem esta na sala, para a tela de espera dos convidados
    enviaLista() {
      const L = this.lobby;
      if (L) Net.enviar({ t: 'lista', modo: L.modo, jogadores: [{ num: 1, cls: L.cls }].concat(L.jogadores) });
    }

    // anfitriao: chegou alguem, na sala de espera ou com o jogo rolando
    entrouConvidado(num, cls) {
      const L = this.lobby;
      if (L && L.etapa === 'espera') {
        L.jogadores = L.jogadores.filter((j) => j.num !== num).concat({ num, cls });
        Sound.play('coin');
        this.enviaLista();
        return;
      }
      const mp = this.mp;
      if (!mp || mp.papel !== 'host') return;
      mp.convidados = mp.convidados.filter((c) => c.num !== num).concat({ num, cls });
      const velho = this.jogador(num);
      if (velho) this.players.splice(this.players.indexOf(velho), 1);
      const p = this.novoConvidado(num, cls);
      p.sword = this.player.sword;                 // o poder dos fragmentos vale para o grupo
      if (mp.modo === 'vs') {                      // VS: assiste e entra na proxima rodada
        p.maxhp = VS_HP; p.hp = 0; p.dead = true; p.espera = true;
      } else if (this.room) this.posicionaPerto(p, this.player);
      this.players.push(p);
      this.say('JOGADOR ' + num + ' ENTROU', 100);
      Net.enviar({ t: 'inicio', modo: mp.modo }, num);
      if (Music.name) Net.enviar({ t: 'mus', n: Music.name }, num);
    }

    // anfitriao: alguem saiu da sala
    saiuConvidado(num) {
      const L = this.lobby;
      if (L && L.etapa === 'espera') {
        L.jogadores = L.jogadores.filter((j) => j.num !== num);
        this.enviaLista();
        return;
      }
      const mp = this.mp;
      if (!mp || mp.papel !== 'host') return;
      mp.convidados = mp.convidados.filter((c) => c.num !== num);
      const p = this.jogador(num);
      if (!p) return;
      this.players.splice(this.players.indexOf(p), 1);
      if (this.tempoDono === p) this.tempoDono = null;
      this.say('JOGADOR ' + num + ' SAIU', 120);
      if (mp.modo === 'vs' && this.state === 'play') this.checaFimVS(null);
    }

    msgRede(m) {
      const L = this.lobby;
      switch (m.t) {
        case 'erro':
          if (L) { L.etapa = 'erro'; L.msg = m.msg; }
          Net.fechar();
          break;
        case 'entrou': this.entrouConvidado(m.id, m.cls); break;
        case 'in': {            // anfitriao: comandos de um convidado
          const p = this.jogador(m.id);
          if (p && p.input) p.input.receber(m);
          break;
        }
        case 'sala':            // convidado: entrou, espera o anfitriao comecar
          if (L) {
            L.modo = m.modo; L.num = m.id; L.jogadores = L.jogadores || [];
            if (L.etapa === 'conectando') L.etapa = 'aguardando';
          }
          break;
        case 'lista': if (L) { L.jogadores = m.jogadores || []; L.modo = m.modo || L.modo; } break;
        case 'codigo': if (L) L.codigo = m.codigo; break;   // p2p: codigo da sala do anfitriao
        case 'inicio':          // convidado: o jogo comecou
          this.mp = { modo: m.modo || (L ? L.modo : null), papel: 'guest' };
          this.quadro = null; this.quadroHud = null; this.quadroSemHud = false;
          this.state = 'remoto';
          break;
        case 'quadro': this.recebeQuadro(m); break;
        case 'som': Net.tocarSom(m.n); break;
        case 'mus': Net.tocarMusica(m.n); break;
        case 'saiu': if (m.id) this.saiuConvidado(m.id); else this.fimRede(); break;
      }
    }

    // a conexao caiu (convidado: o anfitriao fechou a sala)
    fimRede() {
      const eraHost = this.mp && this.mp.papel === 'host';
      const emJogo = eraHost && this.state !== 'lobby' && this.state !== 'select' && this.state !== 'title';
      const vs = this.modo() === 'vs';
      Net.fechar();
      if (emJogo && !vs) {
        // continua sozinho no coop e no competitivo
        this.players = [this.player];
        this.mp = null;
        this.say('A SALA CAIU - JOGANDO SOZINHO', 160);
        return;
      }
      if (this.state === 'title') return;
      this.mp = null;
      this.players = this.player ? [this.player] : [];
      this.lobby = { etapa: 'erro', sel: 0, msg: eraHost ? 'A SALA CAIU' : 'CONEXAO ENCERRADA' };
      this.state = 'lobby';
      Music.stop();
    }

    sairRede() {
      Net.fechar();
      this.mp = null; this.lobby = null;
      if (this.players.length > 1) this.players = [this.player];
    }

    // convidado: manda os comandos, mostra a tela que chega
    stepRemoto() {
      const k = Net.mascara(this.input);
      if (k.h || k.d !== this.ultD || (this.tick & 15) === 0) {
        Net.enviar({ t: 'in', d: k.d, h: k.h });
        this.ultD = k.d;
      }
    }

    recebeQuadro(m) {
      if (!window.createImageBitmap) return;
      const hud = m.tipo === Net.QUADRO.HUD;
      createImageBitmap(m.blob).then((img) => {
        const velho = hud ? this.quadroHud : this.quadro;
        if (velho && velho.close) velho.close();
        if (hud) this.quadroHud = img;
        else { this.quadro = img; this.quadroSemHud = m.tipo === Net.QUADRO.MUNDO; }
      }).catch(() => {});
    }

    // anfitriao, a 30 quadros por segundo. A tela e a mesma para todos: codifica uma vez so,
    // e cada convidado recebe a faixa do proprio HUD. Quem esta com tela propria (loja aberta,
    // caido, placar final) recebe um quadro inteiro so dele.
    transmitir() {
      if (!this.mp || this.mp.papel !== 'host' || (this.tick & 1) || this.ultTx === this.tick || this.codificando > 0) return;
      const convidados = this.players.filter((p) => p !== this.player);
      if (!convidados.length) return;
      this.ultTx = this.tick;
      const prontos = convidados.filter((p) => Net.folga(p.num));
      if (!prontos.length) return;
      const [tipo, q] = Net.formatoQuadro(convidados.length);
      const jogo = this.state === 'play' || this.state === 'transition';
      const proprio = (p) => this.state === 'fim' || (jogo && !!(p.menu || p.dead));
      const comuns = prontos.filter((p) => !proprio(p));
      const comHud = !!TELAS_COM_HUD[this.state];
      if (comuns.length) {
        this.renderEm(this.streamCtx, null);
        this.codifica(this.streamCanvas, tipo, q, comHud ? Net.QUADRO.MUNDO : Net.QUADRO.CHEIO, comuns);
        if (comHud && this.tick % HUD_HZ === 0) {
          for (const p of comuns) {
            this.renderHud(p);
            this.codifica(this.hudCanvas, 'image/png', undefined, Net.QUADRO.HUD, [p]);
          }
        }
      }
      for (const p of prontos) {
        if (!proprio(p)) continue;
        this.renderEm(this.streamCtx, p);
        this.codifica(this.streamCanvas, tipo, q, Net.QUADRO.CHEIO, [p]);
      }
    }

    // toBlob copia o canvas na hora da chamada, entao o mesmo canvas ja pode ser redesenhado
    codifica(canvas, tipo, q, tag, alvos) {
      const ids = alvos.map((p) => p.num);
      this.codificando++;
      canvas.toBlob((b) => {
        this.codificando--;
        if (b && this.mp && this.mp.papel === 'host') Net.enviarBin(b, tag, ids);
      }, tipo, q);
    }

    // so a faixa do HUD de `p` (com o clarao e o fade por cima, como na tela inteira)
    renderHud(p) {
      const c = this.hudCtx;
      this.hudP = p;
      c.fillStyle = '#0b0b12';
      c.fillRect(0, 0, VIEW_W, HUD_H);
      this.drawHud(c);
      this.drawBranco(c);
      this.drawFade(c);
    }

    // fim de partida (competitivo e VS): ENTER joga de novo, ESC sai
    stepFim() {
      if (this.input.hit('start') || this.input.hit('attack')) {
        const mp = this.mp;
        if (mp.modo === 'vs' && !mp.convidados.length) { Sound.play('blocked'); return; }   // VS sozinho nao da
        Sound.play('menu');
        this.fadeTo(() => this.newGame(null, mp.cls, mp.convidados));
      } else if (this.input.hit('pause')) {
        this.sairRede();
        this.state = 'title';
        Music.stop();
      }
    }

    /* ---------------- render ---------------- */

    loop(now) {
      const dt = now - this.last;
      this.last = now;
      this.acc += Math.min(dt, 120);
      let guard = 0;
      while (this.acc >= STEP && guard++ < 6) { this.step(); this.acc -= STEP; }
      this.render();
      this.transmitir();
      this._fpsAcc += dt; this._fpsN++;
      if (this._fpsAcc >= 500) { this.fps = Math.round(1000 / (this._fpsAcc / this._fpsN)); this._fpsAcc = 0; this._fpsN = 0; }
      requestAnimationFrame(this.loop);
    }

    render() { this.renderEm(this.ctx, this.player); }

    // desenha a tela inteira em `c`, com o HUD de `quem`
    renderEm(c, quem) {
      this.hudP = quem;
      c.fillStyle = '#0b0b12';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);

      if (this.state === 'title') { this.drawTitle(c); this.drawFade(c); return; }
      if (this.state === 'select') { this.drawSelect(c); this.drawFade(c); return; }
      if (this.state === 'dificuldade') { this.drawDificuldade(c); this.drawFade(c); return; }
      if (this.state === 'teleporte' && this.tele) { this.drawHud(c); this.drawTeleporte(c); this.drawFade(c); return; }
      if (this.state === 'win') { this.drawWin(c); this.drawFade(c); return; }
      if (this.state === 'lobby') { this.drawLobby(c); this.drawFade(c); return; }
      if (this.state === 'remoto') { this.drawRemoto(c); return; }
      if (this.state === 'fim') { this.drawFim(c); this.drawFade(c); return; }
      if (this.state === 'historia' && this.historia) { this.historia.draw(c); this.drawFade(c); return; }
      if (this.state === 'batalha' && this.batalha) { this.batalha.draw(c); this.drawFade(c); return; }

      this.drawHud(c);

      c.save();
      c.beginPath(); c.rect(0, HUD_H, VIEW_W, VIEW_H); c.clip();
      let sx = 0, sy = 0;
      if (this.shakeT > 0) {
        sx = ((Math.random() - 0.5) * this.shakeAmp) | 0;
        sy = ((Math.random() - 0.5) * this.shakeAmp) | 0;
      }
      c.translate(sx, HUD_H + sy);

      if (this.state === 'transition') this.drawTransition(c);
      else this.drawWorld(c, 0, 0);

      c.restore();

      if (this.tempoParado > 0 && this.state !== 'transition') {   // tempo parado: tudo acinzentado
        c.fillStyle = 'rgba(90,120,150,0.25)';
        c.fillRect(0, HUD_H, VIEW_W, VIEW_H);
        this.text(c, 'TEMPO PARADO ' + Math.ceil(this.tempoParado / 60) + 's', VIEW_W / 2, HUD_H + 12, '#5ce1ff', 'center');
      }

      if (this.flashT > 0) {
        c.fillStyle = 'rgba(255,238,190,' + (this.flashT / 24).toFixed(2) + ')';
        c.fillRect(0, HUD_H, VIEW_W, VIEW_H);
      }

      if (this.modo() === 'comp' || this.modo() === 'vs') this.drawPlacar(c);
      if (this.state === 'pause' || (this.hudP && this.hudP.menu)) this.drawPause(c);
      if (this.state === 'dead') this.drawDead(c);
      const eu = this.hudP;
      if (eu && eu.dead && this.mp && this.state === 'play') {
        const aviso = eu.respawnT > 0 ? 'VOCE CAIU - VOLTA EM ' + Math.ceil(eu.respawnT / 60) + 'S'
          : eu.espera ? 'VOCE ENTRA NA PROXIMA RODADA - ASSISTINDO'
          : this.modo() === 'vs' ? 'VOCE FOI ELIMINADO - ASSISTINDO' : '';
        if (aviso) this.text(c, aviso, VIEW_W / 2, HUD_H + 40, '#e33b4e', 'center');
      }
      if (!(this.state === 'pause' || (this.hudP && this.hudP.menu))) this.drawMsg(c);   // o menu nao fica coberto
      this.drawBranco(c);
      this.drawFade(c);

      if (this.showFps) {
        c.fillStyle = '#000'; c.fillRect(VIEW_W - 30, 0, 30, 9);
        this.text(c, this.fps + 'fps', VIEW_W - 28, 7, '#7fd858');
      }
    }

    drawWorld(c, ox, oy) {
      const room = this.room;
      c.drawImage(G.renderRoom(room, this.tiles), ox, oy);
      G.drawRoomAnim(c, room, this.tiles, this.tick, ox, oy);

      const list = this.drawList;
      list.length = 0;
      for (let i = 0; i < this.ents.length; i++) list.push(this.ents[i]);
      for (const p of this.players) {
        if (this.mp ? !p.dead : (!p.dead || this.state === 'play')) list.push(p);
      }
      list.sort((a, b) => (a.y + a.h) - (b.y + b.h));

      if (ox || oy) c.translate(ox, oy);
      for (let i = 0; i < list.length; i++) list[i].draw(c, this.SPR, this.tick);
      this.particles.draw(c);
      if (this.players.length > 1) this.drawMarcadores(c);
      if (ox || oy) c.translate(-ox, -oy);

      if (this.level.tint) {
        c.fillStyle = this.level.tint;
        c.fillRect(ox, oy, VIEW_W, VIEW_H);
      }
      if (this.boss && !this.boss.dead && this.boss.escuridao) this.boss.escuridao(c, this, ox, oy);   // mariposa
      if (this.boss && !this.boss.dead) this.drawBossBar(c, ox, oy);
    }

    drawTransition(c) {
      const t = this.trans;
      const k = Math.min(1, t.t / t.dur);
      const e = k * k * (3 - 2 * k);
      let fx = 0, fy = 0, nx = 0, ny = 0;
      if (t.dir === 'n') { fy = e * VIEW_H; ny = fy - VIEW_H; }
      if (t.dir === 's') { fy = -e * VIEW_H; ny = fy + VIEW_H; }
      if (t.dir === 'w') { fx = e * VIEW_W; nx = fx - VIEW_W; }
      if (t.dir === 'e') { fx = -e * VIEW_W; nx = fx + VIEW_W; }

      c.drawImage(G.renderRoom(t.from, this.tiles), fx | 0, fy | 0);
      c.drawImage(G.renderRoom(this.room, this.tiles), nx | 0, ny | 0);

      c.save();
      c.translate(nx | 0, ny | 0);
      for (const p of this.players) if (!p.dead) p.draw(c, this.SPR, this.tick);
      if (this.players.length > 1) this.drawMarcadores(c);
      c.restore();
    }

    // setinha colorida em cima de cada heroi (amarela = jogador 1, azul = jogador 2, ...)
    drawMarcadores(c) {
      for (const p of this.players) {
        if (p.dead) continue;
        const x = p.cx | 0, y = (p.y + p.h - 16 - 2) | 0;
        c.fillStyle = '#000';
        c.fillRect(x - 3, y - 4, 7, 3);
        c.fillStyle = corJ(p);
        c.fillRect(x - 2, y - 4, 5, 1);
        c.fillRect(x - 1, y - 3, 3, 1);
        c.fillRect(x, y - 2, 1, 1);
      }
    }

    drawBossBar(c, ox, oy) {
      const b = this.boss;
      const w = 160, x = (VIEW_W - w) / 2, y = VIEW_H - 12 + oy;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - 2 + ox, y - 2, w + 4, 9);
      c.fillStyle = '#3a0f14'; c.fillRect(x + ox, y, w, 5);
      c.fillStyle = '#e33b4e'; c.fillRect(x + ox, y, (w * Math.max(0, b.hp) / b.maxhp) | 0, 5);
      c.fillStyle = '#ff8090'; c.fillRect(x + ox, y, (w * Math.max(0, b.hp) / b.maxhp) | 0, 1);
      this.text(c, b.name, VIEW_W / 2 + ox, y - 3, '#ffd34d', 'center');
    }

    /* ---------------- HUD e telas ---------------- */

    // fonte de pixel (core.js) com sombra; `size` antigo vira escala inteira: <10 = 1x, <22 = 2x, senao 3x
    text(c, s, x, y, col, align, size) {
      const e = !size || size < 10 ? 1 : size < 22 ? 2 : 3, sombra = e === 3 ? 2 : 1;
      s = String(s);
      G.textoPixel(c, s, (x | 0) + sombra, (y | 0) + sombra, '#000', align, e);
      G.textoPixel(c, s, x | 0, y | 0, col || '#fff', align, e);
    }

    drawHud(c) {
      const p = this.hudP || this.player;
      const S = this.SPR;
      const pulso = this.cdPulse > 0 && (this.cdPulse & 1) === 0;   // pisca ao abater
      c.fillStyle = '#16161f';
      c.fillRect(0, 0, VIEW_W, HUD_H);
      c.fillStyle = '#2a2a3a';
      c.fillRect(0, HUD_H - 2, VIEW_W, 2);

      if (this.modo() === 'vs') {
        // VS: vida em barra (20 pontos), sem coracoes
        this.barraVida(c, 6, 6, 96, 8, p);
        this.text(c, 'VIDA ' + Math.max(0, p.hp) + '/' + p.maxhp, 6, 24, corJ(p));
      } else {
        // coracoes
        const hearts = Math.ceil(p.maxhp / 2);
        for (let i = 0; i < hearts; i++) {
          const left = p.hp - i * 2;
          const img = S.heartHud[left >= 2 ? 2 : left === 1 ? 1 : 0];
          c.drawImage(img, 6 + (i % 10) * 9, 5 + ((i / 10) | 0) * 9);
        }
      }

      // moedas / chaves / fragmentos
      const R = VIEW_W - 106;                    // bloco da direita: moedas, chaves, fragmentos, poder
      c.drawImage(S.coin[0], R, 5);
      this.text(c, String(p.coins).padStart(3, '0'), R + 11, 12, '#ffd34d');
      c.drawImage(S.key, R, 16);
      this.text(c, 'x' + this.player.keys, R + 11, 23, '#ffd34d');
      // fragmentos: icone + contador (sao 16, nao cabem um a um)
      c.globalAlpha = this.player.shards ? 1 : 0.3;
      c.drawImage(S.shard, VIEW_W - 64, 4, 10, 10);
      c.globalAlpha = 1;
      this.text(c, this.player.shards + '/' + FRAGMENTOS, VIEW_W - 52, 12,
        this.player.shards >= FRAGMENTOS ? '#7ff2ff' : '#b45cff');
      const mundoAtual = this.level.mundo || 0;
      if (mundoAtual) this.text(c, 'MUNDO ' + mundoAtual + '/' + G.MUNDOS.length, VIEW_W - 64, 23, '#5c667e');

      // habilidade: bola de fogo (tecla C)
      const ready = p.fireCd === 0;
      c.globalAlpha = ready ? 1 : 0.3;
      const FX = VIEW_W - 24;
      c.drawImage(S.bigfire[ready ? ((this.tick >> 3) % 3) : 0], FX, 4);
      c.globalAlpha = 1;
      if (ready) {
        this.text(c, 'F', FX + 8, 28, (this.tick >> 4) & 1 ? '#ffd34d' : '#ff8a3d', 'center');
      } else {
        const frac = 1 - p.fireCd / p.fireMax;
        c.fillStyle = '#2a2a3a'; c.fillRect(FX, 21, 16, 3);
        c.fillStyle = pulso ? '#ffffff' : '#ff6a24';
        c.fillRect(FX, 21, (16 * frac) | 0, 3);
        this.text(c, Math.ceil(p.fireCd / 60) + 's', FX + 8, 31, '#8f96a8', 'center');
      }

      // X, C e V: barra enche com os abates (no VS, com o dano no oponente); cheia = pronto
      const slot = (tecla, x, falta, max, cor, corEsc) => {
        const pronto = falta === 0;
        this.text(c, tecla, x, 30, pronto ? cor : '#5c667e');
        c.fillStyle = '#2a2a3a'; c.fillRect(x + 8, 26, 22, 4);
        c.fillStyle = pulso ? '#ffffff' : pronto ? cor : corEsc;
        c.fillRect(x + 8, 26, Math.round(22 * (1 - falta / max)), 4);
        if (pronto) { if ((this.tick >> 4) & 1) this.text(c, 'OK', x + 34, 30, cor); }
        else this.text(c, (max - falta) + '/' + max, x + 34, 30, '#5c667e');
      };
      if (p.def.custo) {                       // vampira: X, C e V custam vida e tem recarga curta
        const cds = [p.cdX, p.cdC, p.cdV], cores = ['#7fd858', '#b45cff', '#ffd34d'];
        ['X', 'C', 'V'].forEach((t, k) => {
          const x = 160 + k * 62, cd = cds[k], max = p.def.recarga[k], pode = cd === 0 && p.hp > p.def.custo[k];
          this.text(c, t, x, 30, pode ? cores[k] : '#5c667e');
          c.fillStyle = '#2a2a3a'; c.fillRect(x + 8, 26, 22, 4);
          c.fillStyle = pode ? cores[k] : '#5c667e';
          c.fillRect(x + 8, 26, Math.round(22 * (1 - cd / max)), 4);
          this.text(c, '-' + p.def.custo[k], x + 34, 30, pode ? '#e33b4e' : '#5c667e');
        });
      } else if (p.def.xEspera) {              // X sem abates: so a espera depois de usar
        const pronto = p.xCd === 0;
        this.text(c, 'X', 160, 30, pronto ? '#7fd858' : '#5c667e');
        c.fillStyle = '#2a2a3a'; c.fillRect(168, 26, 22, 4);
        c.fillStyle = pronto ? '#7fd858' : '#4a7a3a';
        c.fillRect(168, 26, Math.round(22 * (1 - p.xCd / p.def.xEspera)), 4);
        if (pronto) { if ((this.tick >> 4) & 1) this.text(c, 'OK', 194, 30, '#7fd858'); }
        else this.text(c, Math.ceil(p.xCd / 60) + 's', 194, 30, '#5c667e');
      } else slot('X', 160, p.spCd, p.spMax, '#7fd858', '#4a7a3a');
      if (!p.def.custo) {
        slot('C', 222, p.spinCd, p.spinMax, '#b45cff', '#5a3a7a');
        slot('V', 284, p.goldCd, p.goldMax, '#ffd34d', '#8a6a1f');
      }
      if (p.formaT > 0) this.text(c, (p.forma === 'lobo' ? 'LOBO ' : 'URSO ') + Math.ceil(p.formaT / 60) + 's', 160, 12, '#7fd858');
      if (p.laser > 0) this.text(c, 'LASER ' + Math.ceil(p.laser / 60) + 's', 160, 12, '#e33b4e');
      if (p.morcego > 0) this.text(c, 'MORCEGOS', 160, 12, '#b45cff');

      if (p.def.modo === 'magic') {
        const e = p.elemento(), r = p.elementoRestante();
        this.text(c, e.nome + ' x' + r.n, 160, 12, G.PAL[e.cor]);
        this.text(c, 'DEPOIS ' + r.prox.nome, 160, 22, '#5c667e');
        if (p.escudo > 0) this.text(c, 'ESCUDO ' + Math.ceil(p.escudo / 60) + 's', 222, 12, '#7ff2ff');
      }
      if (p.turbo > 0) this.text(c, 'VELOCIDADE ' + Math.ceil(p.turbo / 60) + 's', 222, 12, '#c8cede');
      if (p.def.modo === 'bomber') {
        const falta = 10 - (p.bombasZ % 10);
        this.text(c, falta === 1 ? 'PROXIMA: GRANDE!' : 'GRANDE EM ' + falta, 160, 12, falta === 1 ? '#ffd34d' : '#8f96a8');
        if (p.minas > 0) this.text(c, 'MINAS x' + p.minas, 250, 12, '#e33b4e');
      }

      // embaixo a esquerda: sala e nome do lugar (nao cobre mais as barras)
      if (this.room && this.level) {
        const m = this.room.meta;
        const sala = m.ordem !== undefined ? 'SALA ' + (m.ordem + 1) + '/12'
          : this.level.kind === 'dungeon' ? 'SALA ' + (m.rx + 1) + '-' + (m.ry + 1) : 'X' + (m.rx + 1) + ' Y' + (m.ry + 1);
        const nome = this.level.mundo ? this.level.name.split(' - ')[0] : this.level.name;
        if (this.level.kind !== 'arena') this.text(c, sala + '  ' + nome, 6, 28, '#8f96a8');
      }
    }

    // barra de vida do VS; pisca em vermelho claro quando esta baixa
    barraVida(c, x, y, w, h, p, direita) {
      const f = Math.max(0, Math.min(1, p.hp / p.maxhp));
      const cheio = Math.round(w * f);
      c.fillStyle = '#000'; c.fillRect(x - 1, y - 1, w + 2, h + 2);
      c.fillStyle = '#3a0f14'; c.fillRect(x, y, w, h);
      const baixa = f <= 0.25 && (this.tick & 16);
      c.fillStyle = baixa ? '#ff8090' : f > 0.5 ? '#4cd964' : f > 0.25 ? '#ffd34d' : '#e33b4e';
      const bx = direita ? x + w - cheio : x;
      c.fillRect(bx, y, cheio, h);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(bx, y, cheio, 1);
      c.fillStyle = 'rgba(0,0,0,0.25)';               // marcas a cada 5 pontos
      for (let k = 5; k < p.maxhp; k += 5) c.fillRect(x + Math.round(w * k / p.maxhp), y, 1, h);
    }

    drawMsg(c) {
      if (!this.msg || this.msgT <= 0) return;
      const lines = String(this.msg).split('\n');
      const h = 10 + lines.length * 9;
      const y = VIEW_H + HUD_H - h - 6;
      c.fillStyle = 'rgba(8,8,16,0.86)';
      c.fillRect(8, y, VIEW_W - 16, h);
      c.strokeStyle = '#ffd34d'; c.lineWidth = 1;
      c.strokeRect(8.5, y + 0.5, VIEW_W - 17, h - 1);
      lines.forEach((l, i) => this.text(c, l, VIEW_W / 2, y + 12 + i * 9, '#fff', 'center'));
    }

    // meteoro: branco total, depois fade
    drawBranco(c) {
      if (this.brancoT <= 0) return;
      const a = Math.min(1, this.brancoT / BRANCO_FADE);
      c.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
    }

    drawFade(c) {
      if (this.fade <= 0) return;
      c.fillStyle = 'rgba(0,0,0,' + this.fade.toFixed(2) + ')';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
    }

    drawTitle(c) {
      const t = this.tick;
      c.fillStyle = '#0d1020';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
      for (let i = 0; i < 40; i++) {
        const x = (i * 97 + 13) % VIEW_W, y = (i * 53 + 7) % (VIEW_H + HUD_H);
        c.fillStyle = (t + i * 7) % 120 < 60 ? '#2a2f4a' : '#1c2038';
        c.fillRect(x, y, 1, 1);
      }
      this.text(c, 'A LENDA DE', VIEW_W / 2, 52, '#8f96a8', 'center', 10);
      this.text(c, 'AURUM', VIEW_W / 2, 80, '#ffd34d', 'center', 26);
      this.text(c, 'OS FRAGMENTOS DO MUNDO', VIEW_W / 2, 92, '#b45cff', 'center');
      c.drawImage(this.SPR.hero.down[(t >> 4) & 1], VIEW_W / 2 - 32, 104);
      c.drawImage(this.SPR.goblin.left[(t >> 3) & 1], VIEW_W / 2 + 16, 104);
      c.drawImage(this.SPR.shard, VIEW_W / 2 - 7, 102 + Math.sin(t * 0.06) * 2);

      if ((t >> 5) & 1) {
        this.text(c, this.hasSave ? 'ENTER = CONTINUAR' : 'ENTER = COMECAR', VIEW_W / 2, 140, '#fff', 'center');
      }
      this.text(c, this.hasSave ? 'J = NOVO JOGO   ESC = APAGAR SAVE' : 'J = COMECAR', VIEW_W / 2, 156, '#8f96a8', 'center');
      this.text(c, Net.codigoDoLink() ? 'N = ENTRAR NA SALA ' + Net.codigoDoLink() : 'N = MULTIJOGADOR', VIEW_W / 2, 168, '#5ce1ff', 'center');
      this.text(c, 'WASD MOVER  J ATACA  ESPACO ROLA', VIEW_W / 2, 182, '#5c667e', 'center');
      this.text(c, 'F = PODER   X / C / V = HABILIDADES   T = TELEPORTE   ESC PAUSA', VIEW_W / 2, 194, '#5c667e', 'center');
      this.text(c, 'DUPLO CLIQUE = TELA CHEIA', VIEW_W / 2, 208, '#3a4159', 'center');
    }

    drawSelect(c) {
      const t = this.tick;
      c.fillStyle = '#0d1020';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
      for (let i = 0; i < 40; i++) {
        const x = (i * 97 + 13) % VIEW_W, y = (i * 53 + 7) % (VIEW_H + HUD_H);
        c.fillStyle = (t + i * 7) % 120 < 60 ? '#2a2f4a' : '#1c2038';
        c.fillRect(x, y, 1, 1);
      }
      this.text(c, 'ESCOLHA SEU HEROI', VIEW_W / 2, 20, '#ffd34d', 'center', 12);

      const S = this.SPR;
      const pw = 64, ph = 58, gap = 4, col = SEL_COLUNAS;
      const total = col * pw + (col - 1) * gap;
      const ox = (VIEW_W - total) / 2;

      G.CLASS_IDS.forEach((id, k) => {
        const def = G.CLASSES[id];
        const linha = (k / col) | 0, n = Math.min(col, G.CLASS_IDS.length - linha * col);
        const x = (VIEW_W - (n * pw + (n - 1) * gap)) / 2 + (k % col) * (pw + gap), oy = 28 + linha * (ph + 4);
        const sel = k === this.selIdx;

        c.fillStyle = sel ? '#242a42' : '#171b2c';
        c.fillRect(x, oy, pw, ph);
        c.strokeStyle = sel ? '#ffd34d' : '#3a4159';
        c.lineWidth = 1;
        c.strokeRect(x + 0.5, oy + 0.5, pw - 1, ph - 1);

        // boneco em 2x, andando quando selecionado
        const frame = sel ? ((t >> 3) & 1) : 0;
        const img = S.heroes[id].walk.down[frame];
        const bob = sel ? Math.sin(t * 0.1) : 0;
        c.drawImage(img, (x + pw / 2 - 16) | 0, (oy + 2 + bob) | 0, 32, 32);

        this.text(c, def.nome, x + pw / 2, oy + 44, sel ? '#ffd34d' : '#8f96a8', 'center');
        this.text(c, def.arma, x + pw / 2, oy + 54, '#5c667e', 'center');
      });

      const def = G.CLASSES[G.CLASS_IDS[this.selIdx]];
      def.desc.forEach((l, i) => this.text(c, l, VIEW_W / 2, 162 + i * 10, '#c8cede', 'center'));
      this.text(c, 'DANO ' + def.dmg + '   VEL ' + def.speed.toFixed(1) + '   F: ' + def.skill, VIEW_W / 2, 183, '#ff8a3d', 'center');
      if (def.dica) this.text(c, def.dica, VIEW_W / 2, 193, def.dicaCor || '#c8cede', 'center');
      this.text(c, def.regra || (def.xEspera ? 'C E V LIBERAM COM 6 E 10 ABATES (O F TEM RECARGA)'
        : 'X, C E V LIBERAM COM 3, 6 E 10 ABATES (SO O F TEM RECARGA)'), VIEW_W / 2, 203, '#8f96a8', 'center');
      this.text(c, 'SETAS ESCOLHEM   ENTER CONFIRMA   ESC VOLTA', VIEW_W / 2, 215, '#5c667e', 'center');
    }

    drawDificuldade(c) {
      this.fundoMenu(c);
      const def = G.CLASSES[G.CLASS_IDS[this.selIdx]];
      c.drawImage(this.SPR.heroes[G.CLASS_IDS[this.selIdx]].walk.down[(this.tick >> 4) & 1], VIEW_W / 2 - 16, 22, 32, 32);
      this.text(c, def.nome, VIEW_W / 2, 64, '#8f96a8', 'center');
      this.text(c, 'DIFICULDADE', VIEW_W / 2, 84, '#fff', 'center', 12);
      DIFICULDADES.forEach((d, k) => {
        const sel = k === this.difIdx, x = VIEW_W / 2 - 150 + k * 100;
        c.fillStyle = sel ? '#242a42' : '#171b2c'; c.fillRect(x, 96, 100 - 8, 28);
        c.strokeStyle = sel ? d.cor : '#3a4159'; c.lineWidth = 1; c.strokeRect(x + 0.5, 96.5, 100 - 9, 27);
        this.text(c, d.nome, x + 46, 114, sel ? d.cor : '#5c667e', 'center', 10);
      });
      const d = DIFICULDADES[this.difIdx];
      d.desc.forEach((l, k) => this.text(c, l, VIEW_W / 2, 140 + k * 11, '#c8cede', 'center'));
      this.text(c, 'DA PARA TROCAR DEPOIS NO MENU (ESC), NA ABA MAPA', VIEW_W / 2, 194, '#5c667e', 'center');
      this.text(c, 'SETAS ESCOLHEM   ENTER COMECA   ESC VOLTA', VIEW_W / 2, 212, '#5c667e', 'center');
    }

    // menu do ESC com duas abas: LOJA e MAPA (pausa no solo)
    drawPause(c) {
      c.fillStyle = 'rgba(6,8,16,0.88)';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
      const p = this.hudP || this.player;
      const aba = p.menu ? p.menu.aba : 1;
      this.text(c, 'LOJA', VIEW_W / 2 - 40, 22, aba === 0 ? '#ffd34d' : '#5c667e', 'center', 12);
      this.text(c, 'MAPA', VIEW_W / 2 + 40, 22, aba === 1 ? '#ffd34d' : '#5c667e', 'center', 12);
      c.fillStyle = '#ffd34d';
      c.fillRect(VIEW_W / 2 + (aba === 0 ? -56 : 24), 26, 32, 1);
      if (this.mp && Net.codigo) this.text(c, 'SALA ' + Net.codigo, VIEW_W - 6, 14, '#5ce1ff', 'right');   // para chamar mais gente
      if (aba === 0) { this.drawLoja(c, p); return; }

      // minimapa
      const lv = this.level;
      const cw = 16, ch = 12;
      const mw = lv.cols * cw, mh = lv.rows * ch;
      const ox = (VIEW_W - mw) / 2, oy = 44;
      for (let ry = 0; ry < lv.rows; ry++) {
        for (let rx = 0; rx < lv.cols; rx++) {
          const idx = ry * lv.cols + rx;
          const room = lv.rooms[idx];
          const x = ox + rx * cw, y = oy + ry * ch;
          if (!room.visited) {
            c.fillStyle = '#1a1d29';
          } else if (room.type === 'boss') {
            c.fillStyle = room.cleared ? '#4a2030' : '#8a2030';
          } else {
            c.fillStyle = room.cleared ? '#3a4a5c' : '#2c3444';
          }
          c.fillRect(x, y, cw - 2, ch - 2);
          const campo = lv.kind === 'field' || !!lv.mundo;
          if (room.meta.cave !== undefined && (room.visited || campo)) {
            c.fillStyle = '#ffd34d'; c.fillRect(x + 5, y + 3, 4, 4);
          }
          if (room.meta.portal && (room.visited || campo)) {
            c.fillStyle = room.meta.portal === 'pantano' ? '#7fd858' : '#b45cff';
            c.fillRect(x + 5, y + 3, 4, 4);
          }
          if (campo && room.type === 'boss' && !room.cleared) {
            c.fillStyle = (this.tick & 16) ? '#e33b4e' : '#ff8090';
            c.fillRect(x + 4, y + 2, 6, 6);
            c.fillStyle = '#16161f'; c.fillRect(x + 5, y + 4, 1, 1); c.fillRect(x + 8, y + 4, 1, 1);
          }
          if (room.meta.puzzle) { c.fillStyle = '#b45cff'; c.fillRect(x + 5, y + 3, 4, 4); }
          if (idx === this.roomIdx) {
            c.strokeStyle = '#ffd34d'; c.lineWidth = 1;
            c.strokeRect(x + 0.5, y + 0.5, cw - 3, ch - 3);
          }
        }
      }

      this.text(c, lv.name, VIEW_W / 2, 40, '#8f96a8', 'center');
      if (this.levelId === 'overworld') this.text(c, 'AMARELO = CAVERNA   VERDE = PANTANO   ROXO = CASTELO   VERMELHO = CHEFE', VIEW_W / 2, oy + mh + 6, '#5c667e', 'center');
      else if (lv.mundo) this.text(c, 'VERMELHO = GUARDIAO DA FENDA   ROXO = PORTAL (PUZZLE)', VIEW_W / 2, oy + mh + 6, '#5c667e', 'center');
      else if (lv.kind === 'field') this.text(c, 'VERMELHO = CHEFE', VIEW_W / 2, oy + mh + 6, '#5c667e', 'center');
      this.text(c, 'MOEDAS ' + p.coins + '   CHAVES ' + p.keys + '   FRAGMENTOS ' + p.shards + '/' + FRAGMENTOS,
        VIEW_W / 2, oy + mh + 16, '#fff', 'center');
      this.text(c, p.def.nome + '   ' + p.def.arma + ' NIVEL ' + p.sword + '   VIDA ' + Math.ceil(p.hp / 2) + '/' + Math.ceil(p.maxhp / 2),
        VIEW_W / 2, oy + mh + 28, '#fff', 'center');
      const cd = p.fireCd === 0 ? 'PRONTA' : Math.ceil(p.fireCd / 60) + 's';
      this.text(c, p.def.skill + ' (F): ' + cd, VIEW_W / 2, oy + mh + 40, '#ff8a3d', 'center');
      // X, C e V: quanto falta (abates, ou dano no oponente no VS)
      const un = this.modo() === 'vs' ? ' DE DANO' : ' ABATES';
      const falta = (n) => (n === 0 ? 'PRONTO' : 'FALTAM ' + n + un);
      const nomes = p.def.hab;
      const estado = (k) => {
        if (p.def.custo) {                     // vampira: custo em vida e recarga curta
          const cd = [p.cdX, p.cdC, p.cdV][k];
          return cd ? 'ESPERA ' + Math.ceil(cd / 60) + 's' : 'CUSTA ' + p.def.custo[k] + ' DE VIDA';
        }
        if (k === 0 && p.def.xEspera) return p.xCd === 0 ? 'PRONTO' : 'ESPERA ' + Math.ceil(p.xCd / 60) + 's';
        return falta([p.spCd, p.spinCd, p.goldCd][k]);
      };
      if (nomes) {
        this.text(c, nomes[0] + ': ' + estado(0), VIEW_W / 2, oy + mh + 52, '#7fd858', 'center');
        this.text(c, nomes[1] + ': ' + estado(1), VIEW_W / 2 - 6, oy + mh + 64, '#b45cff', 'right');
        this.text(c, nomes[2] + ': ' + estado(2), VIEW_W / 2 + 6, oy + mh + 64, '#ffd34d', 'left');
      }
      if (this.modo() !== 'vs') {
        const d = this.dif();
        this.text(c, 'DIFICULDADE: ' + d.nome + (p === this.player ? '   (CIMA / BAIXO MUDA)' : ''), VIEW_W / 2, VIEW_H + HUD_H - 24, d.cor, 'center');
      }
      this.text(c, 'SETAS PARA OS LADOS = LOJA   ESC OU ENTER = VOLTAR', VIEW_W / 2, VIEW_H + HUD_H - 12, '#5c667e', 'center');
    }

    drawLoja(c, p) {
      c.drawImage(this.SPR.coin[(this.tick >> 3) % 4], VIEW_W / 2 - 34, 36);
      this.text(c, 'MOEDAS ' + p.coins, VIEW_W / 2 - 22, 44, '#ffd34d');
      const w = 300, x = (VIEW_W - w) / 2;
      G.LOJA.forEach((item, k) => {
        const y = 56 + k * 34, sel = p.menu && p.menu.sel === k;
        const tem = !!p.compras[item.id], da = p.coins >= item.preco;
        c.fillStyle = sel ? '#242a42' : '#171b2c';
        c.fillRect(x, y, w, 28);
        c.strokeStyle = sel ? '#ffd34d' : '#3a4159';
        c.lineWidth = 1;
        c.strokeRect(x + 0.5, y + 0.5, w - 1, 27);
        this.text(c, item.nome, x + 8, y + 12, tem ? '#7fd858' : sel ? '#ffffff' : '#c8cede');
        this.text(c, item.desc, x + 8, y + 23, '#8f96a8');
        if (tem) this.text(c, 'COMPRADO', x + w - 8, y + 12, '#7fd858', 'right');
        else this.text(c, item.preco + ' MOEDAS', x + w - 8, y + 12, da ? '#ffd34d' : '#e33b4e', 'right');
      });
      this.text(c, 'J OU ENTER = COMPRAR   SETAS PARA OS LADOS = MAPA   ESC = FECHAR',
        VIEW_W / 2, VIEW_H + HUD_H - 12, '#5c667e', 'center');
    }

    fundoMenu(c) {
      const t = this.tick;
      c.fillStyle = '#0d1020';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
      for (let i = 0; i < 40; i++) {
        const x = (i * 97 + 13) % VIEW_W, y = (i * 53 + 7) % (VIEW_H + HUD_H);
        c.fillStyle = (t + i * 7) % 120 < 60 ? '#2a2f4a' : '#1c2038';
        c.fillRect(x, y, 1, 1);
      }
    }

    drawLobby(c) {
      const L = this.lobby, t = this.tick;
      const pontos = '...'.slice(0, 1 + ((t >> 4) % 3));
      this.fundoMenu(c);
      this.text(c, 'MULTIJOGADOR', VIEW_W / 2, 30, '#5ce1ff', 'center', 14);
      const via = L.transporte === 'ws' ? 'REDE LOCAL' : L.transporte === 'p2p' ? 'PELA INTERNET (CODIGO DA SALA)' : '';
      this.text(c, via, VIEW_W / 2, 44, '#5c667e', 'center');
      const lista = (itens, y0, passo) => itens.forEach((it, k) => {
        const sel = k === L.sel;
        this.text(c, (sel ? '> ' : '  ') + it.nome, VIEW_W / 2, y0 + k * passo, sel ? '#ffd34d' : '#8f96a8', 'center', 10);
        if (it.desc) this.text(c, it.desc, VIEW_W / 2, y0 + k * passo + 11, sel ? '#c8cede' : '#5c667e', 'center');
      });

      if (L.etapa === 'menu') {
        lista([{ nome: 'CRIAR SALA', desc: 'VOCE HOSPEDA, OS OUTROS ENTRAM' },
          { nome: 'ENTRAR NA SALA', desc: L.codigo ? 'SALA ' + L.codigo : 'ENTRA NA SALA DE QUEM HOSPEDA' },
          { nome: 'VOLTAR' }], 76, 34);
      } else if (L.etapa === 'modo') {
        this.text(c, 'MODO DE JOGO', VIEW_W / 2, 64, '#fff', 'center');
        lista(MODOS, 88, 34);
      } else if (L.etapa === 'arena') {
        this.text(c, 'ESCOLHA A ARENA DO VS', VIEW_W / 2, 64, '#fff', 'center');
        lista(G.ARENAS, 84, 20);
      } else if (L.etapa === 'codigo') {
        this.text(c, 'CODIGO DA SALA', VIEW_W / 2, 74, '#fff', 'center', 10);
        const n = Net.TAM_CODIGO, w = 22, x0 = VIEW_W / 2 - (n * w) / 2;
        for (let k = 0; k < n; k++) {
          const x = x0 + k * w;
          c.fillStyle = '#171b2c'; c.fillRect(x + 2, 86, w - 4, 24);
          c.strokeStyle = k === L.codigo.length && (t & 16) ? '#ffd34d' : '#3a4159';
          c.lineWidth = 1; c.strokeRect(x + 2.5, 86.5, w - 5, 23);
          if (L.codigo[k]) this.text(c, L.codigo[k], x + w / 2, 104, '#ffd34d', 'center', 14);
        }
        this.text(c, 'DIGITE O CODIGO QUE APARECE NA TELA DE QUEM CRIOU', VIEW_W / 2, 128, '#8f96a8', 'center');
        this.text(c, this.input.touch ? 'TOQUE EM ≡ PARA DIGITAR' : 'ENTER CONFIRMA   BACKSPACE APAGA   ESC VOLTA', VIEW_W / 2, 140, '#5c667e', 'center');
      } else if (L.etapa === 'espera') {
        const nomeModo = (MODOS.find((m) => m.id === L.modo) || {}).nome || '';
        const arena = L.arena ? ' - ' + ((G.ARENAS.find((a) => a.id === L.arena) || {}).nome || '') : '';
        this.text(c, 'SALA ' + nomeModo + arena, VIEW_W / 2, 60, '#fff', 'center');
        if (L.transporte === 'ws') {
          this.text(c, 'OS OUTROS PCS ABREM NO NAVEGADOR E ESCOLHEM ENTRAR NA SALA:', VIEW_W / 2, 76, '#8f96a8', 'center');
          const ips = Net.ips.length ? Net.ips : ['(conectando...)'];
          ips.slice(0, 2).forEach((ip, k) => {
            this.text(c, 'http://' + ip + (Net.porta ? ':' + Net.porta : ''), VIEW_W / 2, 90 + k * 11, '#5ce1ff', 'center');
          });
        } else if (!L.codigo) {
          this.text(c, 'ABRINDO A SALA' + pontos, VIEW_W / 2, 96, '#ffd34d', 'center');
        } else {
          this.text(c, 'CODIGO DA SALA', VIEW_W / 2, 74, '#8f96a8', 'center');
          this.text(c, L.codigo.split('').join(' '), VIEW_W / 2, 98, '#ffd34d', 'center', 22);
          if (L.copiado > 0) { L.copiado--; this.text(c, 'LINK COPIADO!', VIEW_W / 2, 112, '#7fd858', 'center'); }
          else this.text(c, 'C = COPIAR O LINK DA SALA   (OS OUTROS APERTAM N E DIGITAM O CODIGO)', VIEW_W / 2, 112, '#5ce1ff', 'center');
        }
        this.drawJogadoresSala(c, [{ num: 1, cls: L.cls }].concat(L.jogadores), 1, 128);
        const podeComecar = L.modo !== 'vs' || L.jogadores.length > 0;
        if (podeComecar) {
          if ((t >> 5) & 1) this.text(c, 'ENTER = COMECAR   (QUEM CHEGAR DEPOIS ENTRA NO MEIO)', VIEW_W / 2, 196, '#ffd34d', 'center');
        } else this.text(c, 'AGUARDANDO ALGUEM ENTRAR' + pontos, VIEW_W / 2, 196, '#ffd34d', 'center');
      } else if (L.etapa === 'aguardando') {
        this.text(c, 'VOCE ENTROU NA SALA ' + ((MODOS.find((m) => m.id === L.modo) || {}).nome || ''), VIEW_W / 2, 64, '#fff', 'center', 10);
        if (L.num) this.text(c, 'VOCE E O JOGADOR ' + L.num, VIEW_W / 2, 80, corJ({ num: L.num }), 'center');
        this.drawJogadoresSala(c, L.jogadores, L.num, 100);
        this.text(c, 'AGUARDANDO O ANFITRIAO COMECAR' + pontos, VIEW_W / 2, 196, '#ffd34d', 'center');
      } else if (L.etapa === 'conectando') {
        this.text(c, (L.papel === 'host' ? 'CRIANDO A SALA' : 'PROCURANDO A SALA' + (L.codigo ? ' ' + L.codigo : '')) + pontos, VIEW_W / 2, 100, '#ffd34d', 'center', 10);
      } else if (L.etapa === 'erro') {
        this.text(c, L.msg, VIEW_W / 2, 100, '#e33b4e', 'center', 10);
        this.text(c, 'ENTER = VOLTAR', VIEW_W / 2, 124, '#8f96a8', 'center');
      }
      if (L.etapa === 'espera') this.text(c, 'ESC = FECHAR A SALA', VIEW_W / 2, 212, '#5c667e', 'center');
      else if (L.etapa === 'aguardando') this.text(c, 'ESC = SAIR DA SALA', VIEW_W / 2, 212, '#5c667e', 'center');
      else if (L.etapa !== 'codigo') this.text(c, 'SETAS ESCOLHEM   ENTER CONFIRMA   ESC VOLTA', VIEW_W / 2, 198, '#5c667e', 'center');
    }

    // quem esta na sala: bonequinho, numero e classe, ate 8 por linha
    drawJogadoresSala(c, lista, eu, y0) {
      this.text(c, 'JOGADORES NA SALA: ' + lista.length, VIEW_W / 2, y0, '#8f96a8', 'center');
      const POR = 8, W = 50, mostra = lista.slice(0, 16);
      mostra.forEach((j, i) => {
        const lin = (i / POR) | 0, n = Math.min(POR, mostra.length - lin * POR);
        const x = VIEW_W / 2 + ((i % POR) - (n - 1) / 2) * W, y = y0 + 6 + lin * 26;
        const cls = G.CLASSES[j.cls] ? j.cls : 'guerreiro';
        c.drawImage(this.SPR.heroes[cls].walk.down[(this.tick >> 4) & 1], x - 8, y, 16, 16);
        this.text(c, (j.num === eu ? 'VOCE' : 'P' + j.num) + ' ' + G.CLASSES[cls].nome.slice(0, 5), x, y + 23, corJ(j), 'center');
      });
      if (lista.length > mostra.length) this.text(c, '+' + (lista.length - mostra.length), VIEW_W / 2, y0 + 62, '#8f96a8', 'center');
    }

    drawRemoto(c) {
      if (this.quadro) {
        c.drawImage(this.quadro, 0, 0, VIEW_W, VIEW_H + HUD_H);
        if (this.quadroSemHud && this.quadroHud) c.drawImage(this.quadroHud, 0, 0, VIEW_W, HUD_H);
        return;
      }
      this.fundoMenu(c);
      this.text(c, 'CONECTADO!', VIEW_W / 2, 96, '#5ce1ff', 'center', 12);
      this.text(c, 'ESPERANDO A IMAGEM DO ANFITRIAO...', VIEW_W / 2, 116, '#8f96a8', 'center');
    }

    // placar do competitivo e do VS, em cima da area de jogo
    drawPlacar(c) {
      const ps = this.players, y = HUD_H + 3;
      if (ps.length < 2) return;
      if (this.modo() === 'comp') {
        const s = Math.ceil(this.tempo / 60);
        const tempo = { s: ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0'), cor: s <= 10 && (this.tick & 16) ? '#e33b4e' : '#fff' };
        const itens = ps.map((p) => ({ s: 'P' + p.num + ' ' + p.abates, cor: corJ(p) }));
        itens.splice(Math.ceil(itens.length / 2), 0, tempo);   // cronometro no meio
        this.faixaPlacar(c, y, itens);
        return;
      }
      // VS: uma barra de vida por jogador, seis por linha
      const ativos = ps.filter((p) => !p.espera), POR = 6, W = 66;
      for (let i = 0; i < ativos.length; i += POR) {
        const linha = ativos.slice(i, i + POR), w = linha.length * W, x0 = (VIEW_W - w) / 2, yy = y + (i / POR) * 14;
        c.fillStyle = 'rgba(8,8,16,0.78)';
        c.fillRect(x0, yy, w, 12);
        linha.forEach((p, k) => {
          const x = x0 + k * W;
          this.text(c, 'P' + p.num, x + 3, yy + 9, p.dead ? '#5c667e' : corJ(p));
          this.barraVida(c, x + 19, yy + 3, W - 24, 6, p);
        });
      }
    }

    // textos lado a lado numa faixa escura, quebrando a cada 7
    faixaPlacar(c, y, itens) {
      const POR = 7, GAP = 10;
      for (let i = 0; i < itens.length; i += POR) {
        const linha = itens.slice(i, i + POR), larg = linha.map((it) => G.larguraTexto(it.s, 1));
        const w = larg.reduce((a, b) => a + b, 0) + GAP * (linha.length - 1) + 8, yy = y + (i / POR) * 13;
        let x = (VIEW_W - w) / 2;
        c.fillStyle = 'rgba(8,8,16,0.78)';
        c.fillRect(x, yy, w, 12);
        x += 4;
        linha.forEach((it, k) => { this.text(c, it.s, x, yy + 9, it.cor); x += larg[k] + GAP; });
      }
    }

    drawFim(c) {
      const v = this.vencedor;
      this.fundoMenu(c);
      const comp = this.mp && this.mp.modo === 'comp';
      this.text(c, comp ? 'FIM DO TEMPO!' : 'FIM DA LUTA!', VIEW_W / 2, 40, '#ffd34d', 'center', 14);
      if (v) this.text(c, (v === this.hudP ? 'VOCE VENCEU!' : 'JOGADOR ' + v.num + ' VENCEU'), VIEW_W / 2, 66, corJ(v), 'center', 12);
      else this.text(c, 'EMPATE!', VIEW_W / 2, 66, '#fff', 'center', 12);
      // ranking: mais abates (competitivo) ou o vencedor e depois quem ficou com mais vida (VS)
      const ps = this.players.filter((p) => !p.espera)
        .sort((a, b) => (comp ? b.abates - a.abates : (b === v) - (a === v) || b.hp - a.hp)).slice(0, 12);
      const POR = 6, W = 66, grande = ps.length <= POR, tam = grande ? 32 : 24, altura = grande ? 64 : 50;
      ps.forEach((p, i) => {
        const lin = (i / POR) | 0, n = Math.min(POR, ps.length - lin * POR);
        const x = VIEW_W / 2 + ((i % POR) - (n - 1) / 2) * W, y0 = 80 + lin * altura;
        const img = this.SPR.heroes[p.cls].walk.down[(this.tick >> 4) & 1];
        c.drawImage(img, x - tam / 2, y0, tam, tam);
        this.text(c, p === this.hudP ? 'VOCE' : 'JOGADOR ' + p.num, x, y0 + tam + 10, corJ(p), 'center');
        this.text(c, comp ? p.abates + ' ABATES' : 'VIDA ' + Math.max(0, p.hp) + '/' + p.maxhp, x, y0 + tam + 20, '#fff', 'center');
      });
      if ((this.tick >> 5) & 1) this.text(c, 'ANFITRIAO: ENTER = JOGAR DE NOVO   ESC = SAIR', VIEW_W / 2, VIEW_H + HUD_H - 10, '#8f96a8', 'center');
    }

    drawDead(c) {
      c.fillStyle = 'rgba(40,0,0,0.6)';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
      this.text(c, 'VOCE CAIU', VIEW_W / 2, 96, '#e33b4e', 'center', 18);
      if ((this.tick >> 5) & 1) this.text(c, 'ENTER PARA CONTINUAR', VIEW_W / 2, 124, '#fff', 'center');
    }

    drawWin(c) {
      const t = this.tick;
      c.fillStyle = '#100c20';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
      for (let i = 0; i < 60; i++) {
        const x = (i * 71 + t * 0.3) % VIEW_W, y = (i * 37 + 11) % (VIEW_H + HUD_H);
        c.fillStyle = i % 3 ? '#2a2445' : '#3a3260';
        c.fillRect(x | 0, y, 1, 1);
      }
      this.text(c, 'O MUNDO RENASCE', VIEW_W / 2, 60, '#ffd34d', 'center', 16);
      for (let k = 0; k < FRAGMENTOS; k++) {
        const a = t * 0.02 + (k / FRAGMENTOS) * Math.PI * 2;
        c.drawImage(this.SPR.shard, VIEW_W / 2 - 7 + Math.cos(a) * 36, 84 + Math.sin(a) * 12);
      }
      c.drawImage(this.SPR.hero.down[(t >> 4) & 1], VIEW_W / 2 - 8, 104);
      const p = this.hudP || this.player;
      this.text(c, 'MOEDAS: ' + p.coins, VIEW_W / 2, 140, '#fff', 'center');
      this.text(c, 'CORACOES: ' + Math.ceil(p.maxhp / 2), VIEW_W / 2, 152, '#fff', 'center');
      if ((t >> 5) & 1) this.text(c, 'ENTER = TELA INICIAL', VIEW_W / 2, 182, '#8f96a8', 'center');
    }
  }

  /* ---------------- boot ---------------- */

  G.boot = function () {
    const canvas = document.getElementById('game');
    const game = new Game(canvas);
    G.game = game;
    game.input.bindTouch(document.getElementById('touch'));
    // codigo da sala: as letras vao para o campo e nao viram comandos do jogo
    addEventListener('keydown', (e) => {
      if (game.digitaCodigo(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    // preenche a janela mantendo a proporcao (escala fracionada; o formato largo deixa pouca borda)
    const resize = () => {
      const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / (VIEW_H + HUD_H));
      canvas.style.width = Math.floor(VIEW_W * s) + 'px';
      canvas.style.height = Math.floor((VIEW_H + HUD_H) * s) + 'px';
    };
    addEventListener('resize', resize);
    resize();

    const unlock = () => { Sound.init(); Sound.resume(); };
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });

    // tela cheia: entra no primeiro clique ou tecla (o navegador exige um gesto); duplo clique alterna
    const cheia = () => {
      const el = document.documentElement;
      if (document.fullscreenElement || !el.requestFullscreen) return;
      el.requestFullscreen().catch(() => {});
    };
    addEventListener('pointerdown', cheia, { once: true });
    addEventListener('keydown', (e) => { if (e.code !== 'Escape') cheia(); }, { once: true });
    canvas.addEventListener('dblclick', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else cheia();
    });
    document.addEventListener('fullscreenchange', resize);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { game.last = performance.now(); game.acc = 0; }
    });

    const loader = document.getElementById('loading');
    if (loader) loader.remove();
  };
})(window.AURUM = window.AURUM || {});
