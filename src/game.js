/* game.js - estados, camera, transicao de salas, HUD, save e loop principal. */
(function (G) {
  'use strict';

  const TILE = G.TILE, ROOM_W = G.ROOM_W, ROOM_H = G.ROOM_H;
  const VIEW_W = G.VIEW_W, VIEW_H = G.VIEW_H, HUD_H = G.HUD_H;
  const Sound = G.Sound, Music = G.Music;
  const STEP = 1000 / 60;
  const SAVE_KEY = 'aurum_save_v1';

  const DIR_VEC = G.DIR_VEC;   // 8 direcoes, definido em entities.js
  const Net = G.Net;

  // multijogador
  const MODOS = [
    { id: 'coop', nome: 'COOPERATIVO', desc: 'OS DOIS JUNTOS NO JOGO NORMAL' },
    { id: 'comp', nome: 'COMPETITIVO', desc: 'QUEM MATA MAIS BICHOS EM 3 MINUTOS' },
    { id: 'vs', nome: 'VS', desc: 'UM CONTRA O OUTRO, 10 CORACOES CADA' }
  ];
  const COMP_TEMPO = 180 * 60;          // competitivo: 3 minutos
  const COMP_MAX = 6;                   // competitivo: inimigos vivos na sala
  const COMP_SPAWN = 90;                // competitivo: um inimigo novo a cada 1,5 s
  const COMP_TIPOS = {
    field: ['goblin', 'archer', 'bat', 'slime', 'machadeiro'], dungeon: ['skeleton', 'ghost', 'knight', 'bat'],
    pantano: ['sapo', 'mosquito', 'bruxa', 'slime'], castelo: ['lanceiro', 'besteiro', 'feiticeiro', 'knight']
  };
  const VS_HP = 20;                     // VS: 10 coracoes
  const RESPAWN_COOP = 240, RESPAWN_COMP = 180;
  const COR_P = ['#ffd34d', '#5ce1ff'];  // marcador do jogador 1 e 2
  const BRANCO_CHEIO = 24, BRANCO_FADE = 72;   // meteoro: quadros de branco total e de fade
  const GAP_X = G.GAP_X, GAP_Y = G.GAP_Y;   // aberturas das salas (world.js)

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
      this.brancoT = 0;                // meteoro do mago: tela branca que volta com fade
      this.msg = null; this.msgT = 0;
      this.fade = 0; this.fadeDir = 0; this.onFade = null;
      this.fps = 0; this._fpsAcc = 0; this._fpsN = 0; this.showFps = false;
      this.trans = null;
      this.boss = null;

      this.players = [];               // [anfitriao/local, convidado]
      this.player2 = null;
      this.mp = null;                  // multijogador: { modo, papel: 'host' | 'guest' }
      this.remoteInput = null;
      this.donoAtual = null;           // jogador cujo update esta rodando (dono dos tiros)
      this.hudP = null;                // de quem e o HUD desenhado agora
      this.lobby = null;
      this.quadro = null;              // convidado: ultima tela recebida
      this.enviando = false;
      this.streamCanvas = G.mkCanvas(VIEW_W, VIEW_H + HUD_H);
      this.streamCtx = this.streamCanvas.getContext('2d');
      this.streamCtx.imageSmoothingEnabled = false;

      this.hasSave = !!G.store.get(SAVE_KEY);
      this.acc = 0;
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ---------------- mundo ---------------- */

    newGame(seed, cls, p2cls) {
      this.seed = seed || ((Math.random() * 1e9) | 0);
      this.cls = G.CLASSES[cls] ? cls : (this.cls || 'guerreiro');
      this.levels = {
        overworld: G.genOverworld(this.seed),
        dungeon0: G.genDungeon(this.seed, 0),
        dungeon1: G.genDungeon(this.seed, 1),
        pantano: G.genPantano(this.seed),
        castelo: G.genDungeon(this.seed, 2)
      };
      this.flags = { chests: {}, bosses: {}, cleared: {}, unlocked: {} };
      this.player = new G.Player(0, 0, this.cls);
      this.players = [this.player];
      this.player2 = null;
      if (p2cls) {
        const p2 = new G.Player(0, 0, p2cls);
        p2.num = 2;
        p2.input = this.remoteInput;
        this.player2 = p2;
        this.players.push(p2);
      }
      const vs = this.modo() === 'vs';
      if (vs) for (const p of this.players) { p.maxhp = VS_HP; p.hp = VS_HP; }
      this.tempo = this.modo() === 'comp' ? COMP_TEMPO : 0;
      this.spawnT = COMP_SPAWN;
      this.vencedor = null;
      const ow = this.levels.overworld;
      this.enterLevel('overworld', ow.start.room, ow.start.x, ow.start.y);
      this.state = 'play';
      if (vs) this.montaArena();
      const m = this.modo();
      this.say(m === 'vs' ? 'VS! 10 CORACOES CADA' : m === 'comp' ? 'COMPETITIVO: 3 MINUTOS!'
        : m === 'coop' ? 'COOPERATIVO' : this.player.def.nome + ' DE AURUM\nCHEFES E CAVERNAS ESTAO NO MAPA (ESC)', 200);
    }

    modo() { return this.mp && this.mp.papel === 'host' ? this.mp.modo : null; }

    // VS: sala inicial sem monstros, cada um de um lado
    montaArena() {
      this.ents = this.ents.filter((e) => !e.enemy);
      const y = GAP_Y[0] * TILE + 3;
      const lados = [[1, 1], [ROOM_W - 2, -1]];
      this.players.forEach((p, k) => {
        let [tx, passo] = lados[k];
        while (tx > 0 && tx < ROOM_W - 1 && G.boxSolid(this.room, tx * TILE + 3, y, p.w, p.h, false)) tx += passo;
        p.x = tx * TILE + 3; p.y = y;
        p.dir = k === 0 ? 'right' : 'left';
      });
    }

    // posiciona os outros jogadores ao lado do primeiro, em chao livre
    juntaJogadores(lider) {
      for (const p of this.players) {
        if (p === lider) continue;
        const opts = [[14, 0], [-14, 0], [0, 14], [0, -14], [0, 0]];
        for (const [ox, oy] of opts) {
          const x = G.clamp(lider.x + ox, 1, VIEW_W - p.w - 1), y = G.clamp(lider.y + oy, 1, VIEW_H - p.h - 1);
          if (!G.boxSolid(this.room, x, y, p.w, p.h, false) || (ox === 0 && oy === 0)) { p.x = x; p.y = y; break; }
        }
      }
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
      Music.set(this.room.type === 'boss' && !this.room.cleared ? 'boss' : this.level.music);
    }

    loadRoom(idx) {
      this.roomIdx = idx;
      this.room = this.level.rooms[idx];
      this.room.visited = true;
      this.ents.length = 0;
      this.particles.clear();
      this.boss = null;

      const respawn = (this.level.kind === 'field' || !this.room.cleared) && this.modo() !== 'vs';
      if (respawn) {
        for (const s of this.room.spawns) {
          const e = G.spawnEnemy(s.type, s.x, s.y);
          if (e.boss && this.room.cleared) continue;
          this.ents.push(e);
          if (e.boss) this.boss = e;
        }
      }
      for (const o of this.room.objects) {
        if (o.kind === 'chest') {
          const id = this.levelId + ':' + idx + ':' + o.tx + ':' + o.ty;
          if (this.flags.chests[id]) continue;
          const c = new G.Chest(o.tx, o.ty, o.item, o.needClear);
          c.id = id;
          this.ents.push(c);
        }
      }

      if (this.boss && !this.room.cleared) {
        // fecha as portas so depois que todos sairem de cima delas (senao o heroi fica preso no batente)
        this.room.sealed = false;
        this.selar = true;
        Music.set('boss');
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

    dropLoot(e) {
      const r = Math.random();
      if (r < 0.40) this.spawnPickup(e.cx, e.cy, 'coin');
      else if (r < 0.58) this.spawnPickup(e.cx, e.cy, 'heart');
      else if (r < 0.66) this.spawnPickup(e.cx, e.cy, 'gem');
      if (e.loot > 1 && Math.random() < 0.5) this.spawnPickup(e.cx + 6, e.cy, 'coin');
    }

    onEnemyDeath(e) {
      const quem = this.players.indexOf(e.ultimoDono) >= 0 ? e.ultimoDono : this.player;
      if (quem.abateu() && quem === this.player) this.cdPulse = 10;   // abate adianta as recargas
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
        case 'coin': quem.coins += 1; Sound.play('coin'); break;
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

    giveShard() {
      this.player.shards += 1;
      Sound.play('secret');
      if (this.player.shards === 1) {
        for (const p of this.players) p.sword = 2;
        this.say('FRAGMENTO 1/2 - ' + this.player.def.arma + ' DE OURO! DANO DOBRADO', 220);
      } else {
        this.say('OS 2 FRAGMENTOS SAO SEUS!', 200);
        this.fadeTo(() => { this.state = 'win'; Music.set('win'); });
      }
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
    novaBlast(x, y, dono) {
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
            base.call(e, this, Math.max(1, Math.ceil(e.maxhp / 3)), Math.cos(a), Math.sin(a));
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
          if (p === dono || p.dead || G.dist(x, y, p.cx, p.cy) > 72) continue;
          const a = Math.atan2(p.cy - y, p.cx - x);
          G.ferirBruto(this, p, G.PVP_NOVA, Math.cos(a), Math.sin(a), dono);
        }
      }
      if (bossHit) this.say('O CHEFE RESISTE!', 100);
      else if (killed) this.say('SALA INCINERADA!', 90);
    }

    onPlayerDead(p) {
      Sound.play('death');
      const m = this.modo();
      if (m === 'vs') {
        this.vencedor = this.players.find((o) => o !== p) || null;
        this.fadeTo(() => { this.state = 'fim'; Music.set('win'); });
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

    // multijogador: volta ao lado de quem esta vivo (ou no inicio da area)
    reviver(p) {
      p.dead = false;
      p.hp = Math.max(4, (p.maxhp / 2) | 0);
      p.inv = 90;
      p.knock = 0; p.atk = 0; p.roll = 0;
      p.cancelaEspeciais();
      const vivo = this.players.find((o) => o !== p && !o.dead);
      if (vivo) this.juntaJogadores(vivo);
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

      // os outros entram lado a lado com quem puxou a transicao
      const outros = [];
      for (const o of this.players) {
        if (o === p) continue;
        const off = { n: [0, -14], s: [0, 14], w: [-14, 0], e: [14, 0] }[dir];
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

    escada(p, t) {
      const T = G.T;
      const passagem = t === T.STAIRS_DOWN || t === T.STAIRS_UP || t === T.PORTAL || t === T.PORTAL2;
      if (passagem && t !== T.STAIRS_UP && this.levelId === 'overworld') {
        const o = this.room.objects.find((k) => k.kind === 'dungeonEntry' || k.kind === 'portal');
        if (o) {
          Sound.play('stairs');
          const id = o.kind === 'portal' ? o.nivel : 'dungeon' + o.dungeon;
          this.flags.returns = this.flags.returns || {};
          this.flags.returns[id] = { room: this.roomIdx, x: o.tx * TILE + 3, y: (o.ty + 1) * TILE + 3 };
          this.fadeTo(() => {
            const lv = this.levels[id];
            this.enterLevel(id, lv.start.room, lv.start.x, lv.start.y);
            this.say(lv.name, 150);
            this.save();
          });
          return true;
        }
      } else if (passagem && t !== T.STAIRS_DOWN && this.levelId !== 'overworld') {
        Sound.play('stairs');
        const ret = (this.flags.returns || {})[this.levelId] ||
          { room: this.levels.overworld.start.room, x: this.levels.overworld.start.x, y: this.levels.overworld.start.y };
        this.fadeTo(() => {
          this.enterLevel('overworld', ret.room, ret.x, ret.y);
          this.save();
        });
        return true;
      }
      return false;
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
        cls: p.cls, elem: p.elem,
        flags: this.flags
      };
      if (G.store.set(SAVE_KEY, JSON.stringify(data))) this.hasSave = true;
    }

    load() {
      let d;
      try { d = JSON.parse(G.store.get(SAVE_KEY)); } catch (e) { d = null; }
      if (!d) return false;
      this.seed = d.seed;
      this.levels = {
        overworld: G.genOverworld(this.seed),
        dungeon0: G.genDungeon(this.seed, 0),
        dungeon1: G.genDungeon(this.seed, 1),
        pantano: G.genPantano(this.seed),
        castelo: G.genDungeon(this.seed, 2)
      };
      this.flags = d.flags || { chests: {}, bosses: {}, cleared: {}, unlocked: {} };
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
      for (const key in this.flags.unlocked) {
        const parts = key.split(':');
        const lv = this.levels[parts[0]];
        if (!lv) continue;
        const room = lv.rooms[parts[1]];
        if (room) this.unlockSide(room, parts[2]);
      }

      this.cls = G.CLASSES[d.cls] ? d.cls : 'guerreiro';
      this.player = new G.Player(d.x, d.y, this.cls);
      this.players = [this.player];
      this.player2 = null;
      this.player.elem = d.elem || 0;
      // saves antigos: sobe a vida maxima para o novo padrao de 5 coracoes
      this.player.maxhp = Math.max(d.maxhp, this.player.def.hp);
      this.player.hp = Math.min(this.player.maxhp, d.hp + (this.player.maxhp - d.maxhp));
      this.player.coins = d.coins; this.player.keys = d.keys;
      this.player.shards = d.shards; this.player.sword = d.sword || 1;
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
        case 'play': this.stepPlay(); break;
        case 'transition': this.stepTransition(); break;
        case 'pause': this.stepPause(); break;
        case 'dead': this.stepDead(); break;
        case 'win': this.stepWin(); break;
        case 'lobby': this.stepLobby(); break;
        case 'remoto': this.stepRemoto(); break;
        case 'fim': this.stepFim(); break;
      }
      if (this.remoteInput) this.remoteInput.endFrame();

      if (this.input.hit('mute')) { const on = Sound.toggle(); this.say(on ? 'SOM LIGADO' : 'SOM DESLIGADO', 80); }
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
      if (i.hit('pause')) {
        Sound.play('blocked');
        if (this.lobby) this.state = 'lobby'; else this.state = 'title';
        return;
      }
      if (i.hit('start') || i.hit('attack')) {
        Sound.play('secret');
        if (this.lobby) this.iniciarRede(G.CLASS_IDS[this.selIdx]);
        else this.newGame(null, G.CLASS_IDS[this.selIdx]);
      }
    }

    stepPlay() {
      if (this.input.hit('pause')) { this.state = 'pause'; Sound.play('menu'); return; }
      if (this.fadeDir > 0) return;

      for (const p of this.players) {
        if (p.dead) {
          if (this.mp && p.respawnT > 0 && --p.respawnT === 0) this.reviver(p);
          continue;
        }
        this.donoAtual = p;
        p.update(this);
        this.donoAtual = null;
      }

      const ents = this.ents;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e.dead) e.update(this);
      }
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
        const [a, b] = this.players;
        this.vencedor = !b || a.abates > b.abates ? a : b.abates > a.abates ? b : null;
        Sound.play('secret');
        this.fadeTo(() => { this.state = 'fim'; Music.set('win'); });
        return;
      }
      if (this.room.type === 'boss' || --this.spawnT > 0) return;
      this.spawnT = COMP_SPAWN;
      if (this.ents.filter((e) => e.enemy && !e.dead).length >= COMP_MAX) return;
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
      if (this.input.hit('pause') || this.input.hit('start')) { this.state = 'play'; Sound.play('menu'); }
    }

    stepDead() {
      if (this.input.hit('start') || this.input.hit('attack')) {
        Sound.play('menu');
        for (const p of this.players) {
          p.dead = false;
          p.respawnT = 0;
          p.hp = Math.max(4, (p.maxhp / 2) | 0);
          p.inv = 90;
        }
        this.fadeTo(() => {
          const lv = this.level, id = this.levelId;
          this.enterLevel(id, lv.start.room, lv.start.x, lv.start.y);
          this.state = 'play';
        });
      }
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
      this.lobby = { etapa: 'menu', sel: 0, msg: '' };
      if (!Net.disponivel()) { this.lobby.etapa = 'erro'; this.lobby.msg = 'ABRA O JOGO PELO SERVIR.BAT'; }
      this.state = 'lobby';
    }

    stepLobby() {
      const i = this.input, L = this.lobby;
      const opcoes = L.etapa === 'menu' ? 3 : L.etapa === 'modo' ? MODOS.length : 0;
      if (opcoes) {
        if (i.hit('up')) { L.sel = (L.sel + opcoes - 1) % opcoes; Sound.play('menu'); }
        if (i.hit('down')) { L.sel = (L.sel + 1) % opcoes; Sound.play('menu'); }
      }
      const ok = i.hit('start') || i.hit('attack');
      if (i.hit('pause')) {
        Sound.play('blocked');
        if (L.etapa === 'modo') { L.etapa = 'menu'; L.sel = 0; return; }
        this.sairRede();
        this.state = 'title';
        return;
      }
      if (!ok) return;
      if (L.etapa === 'menu') {
        Sound.play('menu');
        if (L.sel === 0) { L.etapa = 'modo'; L.sel = 0; }
        else if (L.sel === 1) { L.papel = 'guest'; this.abrirSelecao(); }
        else { this.lobby = null; this.state = 'title'; }
      } else if (L.etapa === 'modo') {
        Sound.play('menu');
        L.papel = 'host'; L.modo = MODOS[L.sel].id;
        this.abrirSelecao();
      } else if (L.etapa === 'erro') {
        this.sairRede();
        this.state = 'title';
      }
    }

    iniciarRede(cls) {
      const L = this.lobby;
      L.cls = cls;
      this.state = 'lobby';
      if (L.papel === 'host') {
        L.etapa = 'espera';
        Net.conectar({ t: 'criar', modo: L.modo }, (m) => this.msgRede(m), () => this.fimRede());
      } else {
        L.etapa = 'conectando';
        Net.conectar({ t: 'entrar', cls }, (m) => this.msgRede(m), () => this.fimRede());
      }
    }

    comecarMulti(p2cls) {
      const L = this.lobby;
      this.mp = { modo: L.modo, papel: 'host', p1: L.cls, p2: p2cls };
      this.remoteInput = new G.RemoteInput();
      Net.eco = true;
      this.newGame(null, L.cls, p2cls);
      Net.enviar({ t: 'inicio' });
    }

    msgRede(m) {
      const L = this.lobby;
      switch (m.t) {
        case 'erro':
          if (L) { L.etapa = 'erro'; L.msg = m.msg; }
          Net.fechar();
          break;
        case 'entrou':          // anfitriao: o jogador 2 chegou
          if (this.lobby && this.lobby.etapa === 'espera') this.comecarMulti(m.cls);
          break;
        case 'in':              // anfitriao: comandos do convidado
          if (this.remoteInput) this.remoteInput.receber(m);
          break;
        case 'sala': if (L) L.modo = m.modo; break;
        case 'inicio':          // convidado: o jogo comecou
          this.mp = { modo: L ? L.modo : null, papel: 'guest' };
          this.quadro = null;
          this.state = 'remoto';
          break;
        case 'quadro': this.recebeQuadro(m.blob); break;
        case 'som': Net.tocarSom(m.n); break;
        case 'mus': Net.tocarMusica(m.n); break;
        case 'saiu': this.fimRede(); break;
      }
    }

    // a conexao caiu ou o outro saiu
    fimRede() {
      const eraHost = this.mp && this.mp.papel === 'host';
      const emJogo = eraHost && this.state !== 'lobby' && this.state !== 'select' && this.state !== 'title';
      Net.fechar();
      if (emJogo && this.modo() !== 'vs') {
        // continua sozinho no coop e no competitivo
        this.players = [this.player];
        this.player2 = null;
        this.remoteInput = null;
        this.mp = null;
        this.say('O JOGADOR 2 SAIU', 120);
        return;
      }
      if (this.state === 'title') return;
      this.mp = null; this.remoteInput = null;
      this.players = this.player ? [this.player] : [];
      this.player2 = null;
      this.lobby = { etapa: 'erro', sel: 0, msg: eraHost ? 'O JOGADOR 2 SAIU' : 'CONEXAO ENCERRADA' };
      this.state = 'lobby';
      Music.stop();
    }

    sairRede() {
      Net.fechar();
      this.mp = null; this.remoteInput = null; this.lobby = null;
      if (this.player2) { this.players = [this.player]; this.player2 = null; }
    }

    // convidado: manda os comandos, mostra a tela que chega
    stepRemoto() {
      const k = Net.mascara(this.input);
      if (k.h || k.d !== this.ultD || (this.tick & 15) === 0) {
        Net.enviar({ t: 'in', d: k.d, h: k.h });
        this.ultD = k.d;
      }
    }

    recebeQuadro(blob) {
      if (!window.createImageBitmap) return;
      createImageBitmap(blob).then((img) => {
        if (this.quadro && this.quadro.close) this.quadro.close();
        this.quadro = img;
      }).catch(() => {});
    }

    // anfitriao: manda a tela com o HUD do jogador 2, a 30 quadros por segundo
    transmitir() {
      if (!this.mp || this.mp.papel !== 'host' || !this.player2 || this.enviando || (this.tick & 1) || !Net.folga()) return;
      this.renderEm(this.streamCtx, this.player2);
      this.enviando = true;
      this.streamCanvas.toBlob((b) => {
        this.enviando = false;
        if (b) Net.enviarBin(b);
      }, 'image/png');
    }

    // fim de partida (competitivo e VS): ENTER joga de novo, ESC sai
    stepFim() {
      if (this.input.hit('start') || this.input.hit('attack')) {
        Sound.play('menu');
        const mp = this.mp;
        this.fadeTo(() => this.newGame(null, mp.p1, mp.p2));
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
      if (this.state === 'win') { this.drawWin(c); this.drawFade(c); return; }
      if (this.state === 'lobby') { this.drawLobby(c); this.drawFade(c); return; }
      if (this.state === 'remoto') { this.drawRemoto(c); return; }
      if (this.state === 'fim') { this.drawFim(c); this.drawFade(c); return; }

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

      if (this.flashT > 0) {
        c.fillStyle = 'rgba(255,238,190,' + (this.flashT / 24).toFixed(2) + ')';
        c.fillRect(0, HUD_H, VIEW_W, VIEW_H);
      }

      if (this.modo() === 'comp' || this.modo() === 'vs') this.drawPlacar(c);
      if (this.state === 'pause') this.drawPause(c);
      if (this.state === 'dead') this.drawDead(c);
      if (this.hudP && this.hudP.dead && this.mp && this.hudP.respawnT > 0 && this.state === 'play') {
        this.text(c, 'VOCE CAIU - VOLTA EM ' + Math.ceil(this.hudP.respawnT / 60) + 'S', VIEW_W / 2, HUD_H + 40, '#e33b4e', 'center');
      }
      this.drawMsg(c);
      if (this.brancoT > 0) {                    // meteoro: branco total, depois fade
        const a = Math.min(1, this.brancoT / BRANCO_FADE);
        c.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
      }
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
      if (this.player2) this.drawMarcadores(c);
      if (ox || oy) c.translate(-ox, -oy);

      if (this.level.tint) {
        c.fillStyle = this.level.tint;
        c.fillRect(ox, oy, VIEW_W, VIEW_H);
      }
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
      if (this.player2) this.drawMarcadores(c);
      c.restore();
    }

    // setinha colorida em cima de cada heroi (amarela = jogador 1, azul = jogador 2)
    drawMarcadores(c) {
      for (const p of this.players) {
        if (p.dead) continue;
        const x = p.cx | 0, y = (p.y + p.h - 16 - 2) | 0;
        c.fillStyle = '#000';
        c.fillRect(x - 3, y - 4, 7, 3);
        c.fillStyle = COR_P[p.num - 1];
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

    text(c, s, x, y, col, align, size) {
      c.font = (size || 8) + 'px "Courier New", monospace';
      c.textAlign = align || 'left';
      c.fillStyle = '#000';
      c.fillText(s, (x | 0) + 1, (y | 0) + 1);
      c.fillStyle = col || '#fff';
      c.fillText(s, x | 0, y | 0);
      c.textAlign = 'left';
    }

    drawHud(c) {
      const p = this.hudP || this.player;
      const S = this.SPR;
      const pulso = this.cdPulse > 0 && (this.cdPulse & 1) === 0;   // pisca ao abater
      c.fillStyle = '#16161f';
      c.fillRect(0, 0, VIEW_W, HUD_H);
      c.fillStyle = '#2a2a3a';
      c.fillRect(0, HUD_H - 2, VIEW_W, 2);

      // coracoes
      const hearts = Math.ceil(p.maxhp / 2);
      for (let i = 0; i < hearts; i++) {
        const left = p.hp - i * 2;
        const img = S.heartHud[left >= 2 ? 2 : left === 1 ? 1 : 0];
        c.drawImage(img, 6 + (i % 10) * 9, 5 + ((i / 10) | 0) * 9);
      }

      // moedas / chaves / fragmentos
      const R = VIEW_W - 106;                    // bloco da direita: moedas, chaves, fragmentos, poder
      c.drawImage(S.coin[0], R, 5);
      this.text(c, String(p.coins).padStart(3, '0'), R + 11, 12, '#ffd34d');
      c.drawImage(S.key, R, 16);
      this.text(c, 'x' + this.player.keys, R + 11, 23, '#ffd34d');
      for (let i = 0; i < 2; i++) {
        c.globalAlpha = i < this.player.shards ? 1 : 0.22;
        c.drawImage(S.shard, VIEW_W - 60 + i * 16, 8);
        c.globalAlpha = 1;
      }

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

      const temXCV = true;                        // as tres classes tem X, C e V
      if (temXCV) {                                // recarga do giro (C)
        const pronto = p.spinCd === 0;
        this.text(c, 'C', 160, 30, pronto ? '#b45cff' : '#5c667e');
        c.fillStyle = '#2a2a3a'; c.fillRect(168, 26, 22, 4);
        c.fillStyle = pulso ? '#ffffff' : pronto ? '#b45cff' : '#5a3a7a';
        c.fillRect(168, 26, Math.round(22 * (1 - p.spinCd / p.spinMax)), 4);
        if (!pronto) this.text(c, Math.ceil(p.spinCd / 60) + 's', 194, 30, '#5c667e');
      }

      if (temXCV) {                                // recarga da flecha dourada / investida relampago (V)
        const pronto = p.goldCd === 0;
        this.text(c, 'V', 222, 30, pronto ? '#ffd34d' : '#5c667e');
        c.fillStyle = '#2a2a3a'; c.fillRect(230, 26, 22, 4);
        c.fillStyle = pulso ? '#ffffff' : pronto ? '#ffd34d' : '#8a6a1f';
        c.fillRect(230, 26, Math.round(22 * (1 - p.goldCd / p.goldMax)), 4);
        if (!pronto) this.text(c, Math.ceil(p.goldCd / 60) + 's', 256, 30, '#5c667e');
      }

      if (temXCV) {                                // recarga do especial (X)
        const pronto = p.spCd === 0;
        this.text(c, 'X', 284, 30, pronto ? '#7fd858' : '#5c667e');
        c.fillStyle = '#2a2a3a'; c.fillRect(292, 26, 22, 4);
        c.fillStyle = pulso ? '#ffffff' : pronto ? '#7fd858' : '#4a7a3a';
        c.fillRect(292, 26, Math.round(22 * (1 - p.spCd / p.spMax)), 4);
        if (!pronto) this.text(c, Math.ceil(p.spCd / 60) + 's', 318, 30, '#5c667e');
      }

      if (p.def.modo === 'magic') {
        const e = p.elemento(), r = p.elementoRestante();
        this.text(c, e.nome + ' x' + r.n, 160, 12, G.PAL[e.cor]);
        this.text(c, 'DEPOIS ' + r.prox.nome, 160, 22, '#5c667e');
        if (p.escudo > 0) this.text(c, 'ESCUDO ' + Math.ceil(p.escudo / 60) + 's', 222, 12, '#7ff2ff');
      }

      // embaixo a esquerda: sala e nome do lugar (nao cobre mais as barras)
      if (this.room && this.level) {
        const m = this.room.meta;
        const sala = this.level.kind === 'dungeon' ? 'SALA ' + (m.rx + 1) + '-' + (m.ry + 1) : 'X' + (m.rx + 1) + ' Y' + (m.ry + 1);
        this.text(c, sala + '  ' + this.level.name, 6, 28, '#8f96a8');
      }
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
      c.drawImage(this.SPR.hero.down[(t >> 4) & 1], VIEW_W / 2 - 32, 96);
      c.drawImage(this.SPR.goblin.left[(t >> 3) & 1], VIEW_W / 2 + 16, 96);
      c.drawImage(this.SPR.shard, VIEW_W / 2 - 7, 92 + Math.sin(t * 0.06) * 2);

      if ((t >> 5) & 1) {
        this.text(c, this.hasSave ? 'ENTER = CONTINUAR' : 'ENTER = COMECAR', VIEW_W / 2, 140, '#fff', 'center');
      }
      this.text(c, this.hasSave ? 'J = NOVO JOGO   ESC = APAGAR SAVE' : 'J = COMECAR', VIEW_W / 2, 156, '#8f96a8', 'center');
      this.text(c, 'N = MULTIJOGADOR (REDE LOCAL)', VIEW_W / 2, 168, '#5ce1ff', 'center');
      this.text(c, 'WASD MOVER  J ATACA  ESPACO ROLA', VIEW_W / 2, 182, '#5c667e', 'center');
      this.text(c, 'F = PODER   X / C / V = HABILIDADES   ESC PAUSA', VIEW_W / 2, 194, '#5c667e', 'center');
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
      const pw = 76, ph = 92, gap = 4;
      const total = G.CLASS_IDS.length * pw + (G.CLASS_IDS.length - 1) * gap;
      const ox = (VIEW_W - total) / 2, oy = 32;

      G.CLASS_IDS.forEach((id, k) => {
        const def = G.CLASSES[id];
        const x = ox + k * (pw + gap);
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
        c.drawImage(img, (x + pw / 2 - 16) | 0, (oy + 8 + bob) | 0, 32, 32);

        this.text(c, def.nome, x + pw / 2, oy + 52, sel ? '#ffd34d' : '#8f96a8', 'center');
        this.text(c, def.arma, x + pw / 2, oy + 62, '#5c667e', 'center');

        // coracoes e dano
        const hearts = Math.ceil(def.hp / 2);
        for (let h = 0; h < hearts; h++) {
          const meio = def.hp - h * 2 === 1;
          c.drawImage(S.heartHud[meio ? 1 : 2], (x + pw / 2 - hearts * 4.5 + h * 9) | 0, oy + 68);
        }
        this.text(c, 'DANO ' + def.dmg + '  VEL ' + def.speed.toFixed(1), x + pw / 2, oy + 86, '#8f96a8', 'center');
      });

      const def = G.CLASSES[G.CLASS_IDS[this.selIdx]];
      def.desc.forEach((l, i) => this.text(c, l, VIEW_W / 2, 140 + i * 11, '#c8cede', 'center'));
      this.text(c, 'HABILIDADE (F): ' + def.skill, VIEW_W / 2, 166, '#ff8a3d', 'center');
      if (G.CLASS_IDS[this.selIdx] === 'arqueiro') {
        this.text(c, 'SEGURA J CARREGA   X = SALVA DE 3 (2s, SEGURE = 4 SALVAS)   C = 4 GIROS (3s)', VIEW_W / 2, 178, '#7fd858', 'center');
      }
      if (G.CLASS_IDS[this.selIdx] === 'mago') {
        this.text(c, '7 FOGO > 4 GELO > 2 RAIO   X = RAIOS (5s)   C = ESCUDO (7s)   V = INFERNO (10s)', VIEW_W / 2, 178, '#7ff2ff', 'center');
      }
      this.text(c, 'SETAS ESCOLHEM   ENTER CONFIRMA   ESC VOLTA', VIEW_W / 2, 198, '#5c667e', 'center');
    }

    drawPause(c) {
      c.fillStyle = 'rgba(6,8,16,0.88)';
      c.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
      this.text(c, 'PAUSA', VIEW_W / 2, 24, '#ffd34d', 'center', 12);

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
          const campo = lv.kind === 'field';
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
          if (idx === this.roomIdx) {
            c.strokeStyle = '#ffd34d'; c.lineWidth = 1;
            c.strokeRect(x + 0.5, y + 0.5, cw - 3, ch - 3);
          }
        }
      }

      const p = this.hudP || this.player;
      this.text(c, lv.name, VIEW_W / 2, 40, '#8f96a8', 'center');
      if (this.levelId === 'overworld') this.text(c, 'AMARELO = CAVERNA   VERDE = PANTANO   ROXO = CASTELO   VERMELHO = CHEFE', VIEW_W / 2, oy + mh + 6, '#5c667e', 'center');
      else if (lv.kind === 'field') this.text(c, 'VERMELHO = CHEFE', VIEW_W / 2, oy + mh + 6, '#5c667e', 'center');
      this.text(c, 'MOEDAS ' + p.coins + '   CHAVES ' + p.keys + '   FRAGMENTOS ' + p.shards + '/2',
        VIEW_W / 2, oy + mh + 16, '#fff', 'center');
      this.text(c, p.def.nome + '   ' + p.def.arma + ' NIVEL ' + p.sword + '   VIDA ' + Math.ceil(p.hp / 2) + '/' + Math.ceil(p.maxhp / 2),
        VIEW_W / 2, oy + mh + 28, '#fff', 'center');
      const cd = p.fireCd === 0 ? 'PRONTA' : Math.ceil(p.fireCd / 60) + 's';
      this.text(c, p.def.skill + ' (F): ' + cd, VIEW_W / 2, oy + mh + 40, '#ff8a3d', 'center');
      if (p.def.modo === 'bow') {
        const sp = p.spCd === 0 ? 'PRONTA' : Math.ceil(p.spCd / 60) + 's';
        this.text(c, 'SALVA DE 3 FLECHAS (X): ' + sp, VIEW_W / 2, oy + mh + 52, '#7fd858', 'center');
        const gi = p.spinCd === 0 ? 'PRONTO' : Math.ceil(p.spinCd / 60) + 's';
        const go = p.goldCd === 0 ? 'PRONTA' : Math.ceil(p.goldCd / 60) + 's';
        this.text(c, '4 GIROS (C): ' + gi, VIEW_W / 2 - 6, oy + mh + 64, '#b45cff', 'right');
        this.text(c, 'DOURADA (V): ' + go, VIEW_W / 2 + 6, oy + mh + 64, '#ffd34d', 'left');
      } else if (p.def.modo === 'melee') {
        const sp = p.spCd === 0 ? 'PRONTA' : Math.ceil(p.spCd / 60) + 's';
        this.text(c, 'INVESTIDA (X, SEGURE): ' + sp, VIEW_W / 2, oy + mh + 52, '#7fd858', 'center');
        const gi = p.spinCd === 0 ? 'PRONTO' : Math.ceil(p.spinCd / 60) + 's';
        const go = p.goldCd === 0 ? 'PRONTA' : Math.ceil(p.goldCd / 60) + 's';
        this.text(c, 'GIRO TRIPLO (C): ' + gi, VIEW_W / 2 - 6, oy + mh + 64, '#b45cff', 'right');
        this.text(c, 'RELAMPAGO (V): ' + go, VIEW_W / 2 + 6, oy + mh + 64, '#ffd34d', 'left');
      } else if (p.def.modo === 'magic') {
        const sp = p.spCd === 0 ? 'PRONTA' : Math.ceil(p.spCd / 60) + 's';
        this.text(c, 'TEMPESTADE DE RAIOS (X): ' + sp, VIEW_W / 2, oy + mh + 52, '#7fd858', 'center');
        const gi = p.spinCd === 0 ? 'PRONTO' : Math.ceil(p.spinCd / 60) + 's';
        const go = p.goldCd === 0 ? 'PRONTO' : Math.ceil(p.goldCd / 60) + 's';
        this.text(c, 'ESCUDO (C): ' + gi, VIEW_W / 2 - 6, oy + mh + 64, '#b45cff', 'right');
        this.text(c, 'INFERNO (V): ' + go, VIEW_W / 2 + 6, oy + mh + 64, '#ffd34d', 'left');
      }
      this.text(c, 'ESC OU ENTER = VOLTAR', VIEW_W / 2, VIEW_H + HUD_H - 12, '#5c667e', 'center');
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
      this.fundoMenu(c);
      this.text(c, 'MULTIJOGADOR', VIEW_W / 2, 30, '#5ce1ff', 'center', 14);
      this.text(c, 'REDE LOCAL', VIEW_W / 2, 44, '#5c667e', 'center');
      const lista = (itens, y0) => itens.forEach((it, k) => {
        const sel = k === L.sel;
        this.text(c, (sel ? '> ' : '  ') + it.nome, VIEW_W / 2, y0 + k * 26, sel ? '#ffd34d' : '#8f96a8', 'center', 10);
        if (it.desc) this.text(c, it.desc, VIEW_W / 2, y0 + k * 26 + 11, sel ? '#c8cede' : '#5c667e', 'center');
      });

      if (L.etapa === 'menu') {
        lista([{ nome: 'CRIAR SALA', desc: 'VOCE HOSPEDA, O OUTRO ENTRA' },
          { nome: 'ENTRAR NA SALA', desc: 'ENTRA NA SALA DE QUEM HOSPEDA' },
          { nome: 'VOLTAR' }], 76);
      } else if (L.etapa === 'modo') {
        this.text(c, 'MODO DE JOGO', VIEW_W / 2, 64, '#fff', 'center');
        lista(MODOS, 86);
      } else if (L.etapa === 'espera') {
        this.text(c, 'SALA ' + ((MODOS.find((m) => m.id === L.modo) || {}).nome || '') + ' CRIADA', VIEW_W / 2, 74, '#fff', 'center', 10);
        this.text(c, 'AGUARDANDO O JOGADOR 2' + '...'.slice(0, 1 + ((t >> 4) % 3)), VIEW_W / 2, 94, '#ffd34d', 'center');
        this.text(c, 'O OUTRO PC DEVE ABRIR NO NAVEGADOR:', VIEW_W / 2, 118, '#8f96a8', 'center');
        const ips = Net.ips.length ? Net.ips : ['(conectando...)'];
        ips.slice(0, 3).forEach((ip, k) => {
          this.text(c, 'http://' + ip + (Net.porta ? ':' + Net.porta : ''), VIEW_W / 2, 132 + k * 11, '#5ce1ff', 'center');
        });
        this.text(c, 'E ESCOLHER ENTRAR NA SALA', VIEW_W / 2, 132 + Math.min(3, ips.length) * 11 + 4, '#8f96a8', 'center');
      } else if (L.etapa === 'conectando') {
        this.text(c, 'PROCURANDO A SALA' + '...'.slice(0, 1 + ((t >> 4) % 3)), VIEW_W / 2, 100, '#ffd34d', 'center', 10);
      } else if (L.etapa === 'erro') {
        this.text(c, L.msg, VIEW_W / 2, 100, '#e33b4e', 'center', 10);
        this.text(c, 'ENTER = VOLTAR', VIEW_W / 2, 124, '#8f96a8', 'center');
      }
      this.text(c, 'SETAS ESCOLHEM   ENTER CONFIRMA   ESC VOLTA', VIEW_W / 2, 198, '#5c667e', 'center');
    }

    drawRemoto(c) {
      if (this.quadro) { c.drawImage(this.quadro, 0, 0, VIEW_W, VIEW_H + HUD_H); return; }
      this.fundoMenu(c);
      this.text(c, 'CONECTADO!', VIEW_W / 2, 96, '#5ce1ff', 'center', 12);
      this.text(c, 'ESPERANDO A IMAGEM DO ANFITRIAO...', VIEW_W / 2, 116, '#8f96a8', 'center');
    }

    // placar do competitivo e do VS, em cima da area de jogo
    drawPlacar(c) {
      const [a, b] = this.players;
      if (!a || !b) return;
      const y = HUD_H + 3, w = 116, x = (VIEW_W - w) / 2;
      c.fillStyle = 'rgba(8,8,16,0.78)';
      c.fillRect(x, y, w, 12);
      if (this.modo() === 'comp') {
        const s = Math.ceil(this.tempo / 60);
        const tempo = ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0');
        this.text(c, 'P1 ' + a.abates, x + 4, y + 9, COR_P[0]);
        this.text(c, tempo, VIEW_W / 2, y + 9, s <= 10 && (this.tick & 16) ? '#e33b4e' : '#fff', 'center');
        this.text(c, b.abates + ' P2', x + w - 4, y + 9, COR_P[1], 'right');
      } else {
        this.text(c, 'P1 ' + Math.ceil(a.hp / 2), x + 4, y + 9, COR_P[0]);
        this.text(c, 'VS', VIEW_W / 2, y + 9, '#e33b4e', 'center');
        this.text(c, Math.ceil(b.hp / 2) + ' P2', x + w - 4, y + 9, COR_P[1], 'right');
      }
    }

    drawFim(c) {
      const [a, b] = this.players, v = this.vencedor;
      this.fundoMenu(c);
      const comp = this.mp && this.mp.modo === 'comp';
      this.text(c, comp ? 'FIM DO TEMPO!' : 'FIM DA LUTA!', VIEW_W / 2, 40, '#ffd34d', 'center', 14);
      if (v) this.text(c, (v === this.hudP ? 'VOCE VENCEU!' : 'JOGADOR ' + v.num + ' VENCEU'), VIEW_W / 2, 66, COR_P[v.num - 1], 'center', 12);
      else this.text(c, 'EMPATE!', VIEW_W / 2, 66, '#fff', 'center', 12);
      [a, b].forEach((p, k) => {
        if (!p) return;
        const x = VIEW_W / 2 + (k === 0 ? -56 : 56);
        const img = this.SPR.heroes[p.cls].walk.down[(this.tick >> 4) & 1];
        c.drawImage(img, x - 16, 84, 32, 32);
        this.text(c, 'JOGADOR ' + p.num, x, 128, COR_P[k], 'center');
        this.text(c, comp ? p.abates + ' ABATES' : Math.ceil(Math.max(0, p.hp) / 2) + ' CORACOES', x, 140, '#fff', 'center');
      });
      if ((this.tick >> 5) & 1) this.text(c, 'ANFITRIAO: ENTER = JOGAR DE NOVO   ESC = SAIR', VIEW_W / 2, 182, '#8f96a8', 'center');
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
      this.text(c, 'AURUM RENASCE', VIEW_W / 2, 60, '#ffd34d', 'center', 16);
      c.drawImage(this.SPR.shard, VIEW_W / 2 - 24, 80 + Math.sin(t * 0.05) * 3);
      c.drawImage(this.SPR.shard, VIEW_W / 2 + 10, 80 + Math.cos(t * 0.05) * 3);
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
