/* world.js - tiles, colisao, geracao do mundo aberto e das masmorras,
   cache de renderizacao por sala (1 drawImage por frame no fundo). */
(function (G) {
  'use strict';

  const ROOM_W = G.ROOM_W, ROOM_H = G.ROOM_H, TILE = G.TILE;

  const T = {
    GRASS: 0, GRASS2: 1, FLOWER: 2, SAND: 3, PATH: 4, WATER: 5,
    TREE: 6, ROCK: 7, BUSH: 8, WALL: 9, CRACKED: 10,
    FLOOR: 11, FLOOR2: 12, DOOR: 13, DOOR_LOCKED: 14,
    STAIRS_DOWN: 15, STAIRS_UP: 16, CAVE: 17, PIT: 18, TORCH: 19,
    CARPET: 20, BLOCK: 21, STATUE: 22, SIGN: 23,
    // pantano
    BOG: 24, BOG2: 25, MUD: 26, SWAMP_WATER: 27, LILY: 28, DEAD_TREE: 29, MUSHROOM: 30,
    // castelo
    CFLOOR: 31, CFLOOR2: 32, CWALL: 33, BANNER: 34, PILLAR: 35, LAVA: 36, THRONE: 37,
    // portais do mundo aberto (roxo = castelo, verde = pantano)
    PORTAL: 38, PORTAL2: 39
  };
  G.T = T;

  const SOLID = new Uint8Array(64);
  [T.WATER, T.TREE, T.ROCK, T.BUSH, T.WALL, T.CRACKED, T.DOOR_LOCKED,
   T.CAVE, T.PIT, T.TORCH, T.BLOCK, T.STATUE, T.SIGN,
   T.SWAMP_WATER, T.DEAD_TREE, T.CWALL, T.BANNER, T.PILLAR, T.LAVA, T.THRONE].forEach((t) => { SOLID[t] = 1; });
  G.SOLID = SOLID;

  // tiles que voam por cima (morcegos, projeteis) podem atravessar
  const FLYABLE = new Uint8Array(64);
  [T.WATER, T.PIT, T.SWAMP_WATER, T.LAVA].forEach((t) => { FLYABLE[t] = 1; });

  /* ---------------- colisao ---------------- */

  G.tileAt = function (room, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return T.WALL;
    return room.tiles[ty * ROOM_W + tx];
  };

  G.setTile = function (room, tx, ty, v) {
    if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return;
    room.tiles[ty * ROOM_W + tx] = v;
    room.dirty = true;
  };

  G.boxSolid = function (room, x, y, w, h, flyer) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = G.tileAt(room, tx, ty);
        if (flyer && FLYABLE[t]) continue;
        if (room.sealed && t === T.DOOR) return true;
        if (SOLID[t]) return true;
      }
    }
    return false;
  };

  // bloqueado: em vez de parar onde esta, avanca pixel a pixel ate encostar na parede
  // (sem isso o heroi podia parar a 1 px da borda e nao trocar de sala)
  function encosta(e, room, eixo, d, flyer) {
    const s = d < 0 ? -1 : 1, x0 = e[eixo];
    let p = d < 0 ? Math.ceil(x0) - 1 : Math.floor(x0) + 1;
    while (Math.abs(p - x0) <= Math.abs(d)) {
      const livre = eixo === 'x' ? !G.boxSolid(room, p, e.y, e.w, e.h, flyer) : !G.boxSolid(room, e.x, p, e.w, e.h, flyer);
      if (!livre) break;
      e[eixo] = p;
      p += s;
    }
  }

  // move com resolucao por eixo + "assist" de canto para o jogador
  G.moveEnt = function (e, room, dx, dy, flyer, assist) {
    let hitX = false, hitY = false;
    if (dx) {
      const nx = e.x + dx;
      if (!G.boxSolid(room, nx, e.y, e.w, e.h, flyer)) e.x = nx;
      else {
        hitX = true;
        encosta(e, room, 'x', dx, flyer);
        if (assist) {
          for (let s = 1; s <= 3; s++) {
            if (!G.boxSolid(room, nx, e.y - s, e.w, e.h, flyer)) { e.x = nx; e.y -= s; hitX = false; break; }
            if (!G.boxSolid(room, nx, e.y + s, e.w, e.h, flyer)) { e.x = nx; e.y += s; hitX = false; break; }
          }
        }
      }
    }
    if (dy) {
      const ny = e.y + dy;
      if (!G.boxSolid(room, e.x, ny, e.w, e.h, flyer)) e.y = ny;
      else {
        hitY = true;
        encosta(e, room, 'y', dy, flyer);
        if (assist) {
          for (let s = 1; s <= 3; s++) {
            if (!G.boxSolid(room, e.x - s, ny, e.w, e.h, flyer)) { e.y = ny; e.x -= s; hitY = false; break; }
            if (!G.boxSolid(room, e.x + s, ny, e.w, e.h, flyer)) { e.y = ny; e.x += s; hitY = false; break; }
          }
        }
      }
    }
    return (hitX ? 1 : 0) | (hitY ? 2 : 0);
  };

  /* ---------------- estrutura ---------------- */

  function newRoom(type) {
    return {
      tiles: new Uint8Array(ROOM_W * ROOM_H),
      type: type || 'field',
      spawns: [],
      objects: [],
      exits: {},
      locked: {},
      cleared: false,
      visited: false,
      sealed: false,
      dirty: true,
      cache: null,
      anim: null,
      meta: {}
    };
  }

  const fill = (room, v) => room.tiles.fill(v);
  const put = (room, x, y, v) => { if (x >= 0 && y >= 0 && x < ROOM_W && y < ROOM_H) room.tiles[y * ROOM_W + x] = v; };
  const getT = (room, x, y) => room.tiles[y * ROOM_W + x];

  function rect(room, x, y, w, h, v) {
    for (let b = y; b < y + h; b++) for (let a = x; a < x + w; a++) put(room, a, b, v);
  }

  // tudo derivado do tamanho da sala (26x12): meio, aberturas e cruzamento central 4x4
  const MX = ROOM_W >> 1, MY = ROOM_H >> 1;
  const GAP_X = [MX - 1, MX], GAP_Y = [MY - 1, MY];     // aberturas norte/sul e leste/oeste
  const CX0 = MX - 2, CY0 = MY - 2;                     // canto do cruzamento central
  G.GAP_X = GAP_X; G.GAP_Y = GAP_Y;
  const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
  G.OPP = OPP;

  function openSide(room, dir, tile) {
    if (dir === 'n') GAP_X.forEach((x) => put(room, x, 0, tile));
    else if (dir === 's') GAP_X.forEach((x) => put(room, x, ROOM_H - 1, tile));
    else if (dir === 'w') GAP_Y.forEach((y) => put(room, 0, y, tile));
    else GAP_Y.forEach((y) => put(room, ROOM_W - 1, y, tile));
  }

  // sorteio com peso: tabela = [[tipo, peso], ...]
  function sorteia(tabela, r) {
    let total = 0;
    for (const [, w] of tabela) total += w;
    let k = r() * total;
    for (const [t, w] of tabela) { k -= w; if (k < 0) return t; }
    return tabela[0][0];
  }

  // posicao livre para um inimigo (o golem ocupa 2x2 blocos)
  function lugarLivre(room, r, grande) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = 2 + ((r() * (ROOM_W - 5)) | 0);
      y = 2 + ((r() * (ROOM_H - 5)) | 0);
      const livre = (a, b) => !SOLID[getT(room, a, b)];
      if (livre(x, y) && (!grande || (livre(x + 1, y) && livre(x, y + 1) && livre(x + 1, y + 1)))) break;
    }
    return { x: x * TILE, y: y * TILE };
  }

  // salas de chefe no mundo aberto: cantos do mapa, do mais facil ao mais dificil
  const CHEFES_OW = [
    { rx: 0, ry: 4, tipo: 'grok' },        // sudoeste, perto do inicio
    { rx: 0, ry: 0, tipo: 'troll' },       // noroeste
    { rx: 5, ry: 4, tipo: 'arquimago' }    // sudeste
  ];

  // ferramentas de montagem usadas pelos mundos da campanha (mundos.js)
  G.mundoUtil = { newRoom, put, rect, openSide, sorteia, DIRS, OPP, MX, MY, CX0, CY0, SOLID };

  /* ---------------- mundo aberto ---------------- */

  const OW_COLS = 6, OW_ROWS = 5;

  G.genOverworld = function (seed) {
    const rnd = G.mulberry32(seed);
    const level = {
      id: 'overworld', name: 'REINO DE AURUM', kind: 'field',
      cols: OW_COLS, rows: OW_ROWS, rooms: [],
      music: 'field', tint: null
    };

    const startIdx = 2 + 4 * OW_COLS; // (2,4) sul-centro
    level.start = { room: startIdx, x: MX * TILE - 5, y: MY * TILE - 5 };

    for (let ry = 0; ry < OW_ROWS; ry++) {
      for (let rx = 0; rx < OW_COLS; rx++) {
        const idx = ry * OW_COLS + rx;
        const room = newRoom('field');
        const r = G.mulberry32(seed + idx * 7717);
        const isStart = idx === startIdx;

        // base
        for (let y = 0; y < ROOM_H; y++) {
          for (let x = 0; x < ROOM_W; x++) {
            let t = T.GRASS;
            const n = r();
            if (n < 0.10) t = T.GRASS2;
            else if (n < 0.13) t = T.FLOWER;
            put(room, x, y, t);
          }
        }

        // areia / lago
        if (r() < 0.45) {
          const cx = 3 + ((r() * (ROOM_W - 6)) | 0), cy = 3 + ((r() * (ROOM_H - 6)) | 0);
          const rad = 2 + ((r() * 2) | 0);
          for (let y = cy - rad; y <= cy + rad; y++) {
            for (let x = cx - rad - 1; x <= cx + rad + 1; x++) {
              if (x < 2 || y < 2 || x > ROOM_W - 3 || y > ROOM_H - 3) continue;
              const d = Math.hypot(x - cx, (y - cy) * 1.4);
              if (d < rad) put(room, x, y, T.WATER);
              else if (d < rad + 1.2) put(room, x, y, T.SAND);
            }
          }
        }

        // arvores e pedras espalhadas
        const clumps = 3 + ((r() * 6) | 0);
        for (let c = 0; c < clumps; c++) {
          const cx = 2 + ((r() * (ROOM_W - 4)) | 0), cy = 2 + ((r() * (ROOM_H - 4)) | 0);
          const kind = r() < 0.65 ? T.TREE : T.ROCK;
          const n = 2 + ((r() * 4) | 0);
          for (let k = 0; k < n; k++) {
            const x = cx + ((r() * 3) | 0) - 1, y = cy + ((r() * 3) | 0) - 1;
            if (x < 1 || y < 1 || x > ROOM_W - 2 || y > ROOM_H - 2) continue;
            if (getT(room, x, y) === T.WATER) continue;
            put(room, x, y, kind);
          }
        }

        // arbustos cortaveis
        for (let k = 0, n = 3 + ((r() * 7) | 0); k < n; k++) {
          const x = 1 + ((r() * (ROOM_W - 2)) | 0), y = 1 + ((r() * (ROOM_H - 2)) | 0);
          if (getT(room, x, y) === T.GRASS || getT(room, x, y) === T.GRASS2) put(room, x, y, T.BUSH);
        }

        // bordas: floresta densa
        for (let x = 0; x < ROOM_W; x++) { put(room, x, 0, T.TREE); put(room, x, ROOM_H - 1, T.TREE); }
        for (let y = 0; y < ROOM_H; y++) { put(room, 0, y, T.TREE); put(room, ROOM_W - 1, y, T.TREE); }

        // saidas
        for (const d in DIRS) {
          const nx = rx + DIRS[d][0], ny = ry + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= OW_COLS || ny >= OW_ROWS) continue;
          room.exits[d] = ny * OW_COLS + nx;
          openSide(room, d, T.PATH);
          // trilha ate o centro
          if (d === 'n') { for (let y = 1; y < CY0; y++) GAP_X.forEach((x) => put(room, x, y, T.PATH)); }
          if (d === 's') { for (let y = CY0 + 4; y < ROOM_H - 1; y++) GAP_X.forEach((x) => put(room, x, y, T.PATH)); }
          if (d === 'w') { for (let x = 1; x < CX0; x++) GAP_Y.forEach((y) => put(room, x, y, T.PATH)); }
          if (d === 'e') { for (let x = CX0 + 4; x < ROOM_W - 1; x++) GAP_Y.forEach((y) => put(room, x, y, T.PATH)); }
        }
        // cruzamento central limpo
        rect(room, CX0, CY0, 4, 4, T.PATH);

        // inimigos: mais longe do inicio = mais perigo e mais variedade
        const dStart = Math.abs(rx - 2) + Math.abs(ry - 4);
        if (!isStart) {
          const tabela = [['goblin', 3], ['bat', 2], ['slime', 2], ['machadeiro', 2]];
          if (dStart >= 2) tabela.push(['archer', 2], ['cacador', 2], ['aranha', 2], ['bombardeiro', 1]);
          if (dStart >= 3) tabela.push(['skeleton', 2], ['xama', 2], ['bombardeiro', 1], ['machadeiro', 1]);
          if (dStart >= 4) tabela.push(['golem', 2], ['cacador', 1], ['xama', 1]);
          const count = Math.min(9, 2 + dStart + ((r() * 2) | 0));
          for (let k = 0; k < count; k++) {
            const type = sorteia(tabela, r);
            const pos = lugarLivre(room, r, type === 'golem');
            room.spawns.push({ type, x: pos.x, y: pos.y });
          }
        }

        room.meta.rx = rx; room.meta.ry = ry;
        level.rooms.push(room);
      }
    }

    // entradas das masmorras
    const caves = [
      { idx: 0 + 2 * OW_COLS, dungeon: 0 },   // (0,2) oeste
      { idx: 5 + 0 * OW_COLS, dungeon: 1 }    // (5,0) nordeste
    ];
    caves.forEach((c) => {
      const room = level.rooms[c.idx];
      // no canto noroeste, longe das trilhas norte (colunas 7-8) e oeste (linhas 5-6)
      const cx = 3, cy = 2;
      rect(room, cx - 2, cy - 1, 5, 3, T.ROCK);
      put(room, cx, cy, T.CAVE);
      put(room, cx, cy + 1, T.STAIRS_DOWN);
      rect(room, cx, cy + 2, CX0 - cx + 1, 1, T.PATH);   // da escada ate o cruzamento central
      rect(room, cx - 1, cy + 2, 1, 1, T.PATH);
      room.objects.push({ kind: 'dungeonEntry', tx: cx, ty: cy + 1, dungeon: c.dungeon });
      room.meta.cave = c.dungeon;
    });

    // portais para os outros mundos: arco de pedra no canto nordeste da sala, trilha ate o centro
    const portais = [
      { rx: 5, ry: 2, tile: T.PORTAL2, nivel: 'pantano' },   // leste: pantano
      { rx: 2, ry: 0, tile: T.PORTAL, nivel: 'castelo' }     // norte: castelo
    ];
    portais.forEach((c) => {
      const room = level.rooms[c.ry * OW_COLS + c.rx];
      const cx = ROOM_W - 5, cy = 2;
      rect(room, cx - 2, cy - 1, 5, 3, T.ROCK);
      put(room, cx, cy, c.tile);
      put(room, cx, cy + 1, T.PATH);
      rect(room, CX0 + 3, cy + 2, cx - CX0 - 2, 1, T.PATH);
      room.objects.push({ kind: 'portal', tx: cx, ty: cy, nivel: c.nivel });
      room.meta.portal = c.nivel;
    });

    CHEFES_OW.forEach((c) => {
      const room = level.rooms[c.ry * OW_COLS + c.rx];
      room.type = 'boss';
      room.meta.boss = c.tipo;
      // arena: miolo limpo, quatro pedras nos cantos, cruzamento de terra no centro
      rect(room, 2, 2, ROOM_W - 4, ROOM_H - 4, T.GRASS);
      rect(room, CX0, CY0, 4, 4, T.PATH);
      put(room, 3, 3, T.ROCK); put(room, ROOM_W - 4, 3, T.ROCK);
      put(room, 3, ROOM_H - 4, T.ROCK); put(room, ROOM_W - 4, ROOM_H - 4, T.ROCK);
      room.spawns = [{ type: c.tipo, x: MX * TILE - 12, y: 3 * TILE }];
    });

    // placa inicial + bau de boas vindas
    const s = level.rooms[startIdx];
    put(s, MX - 4, 2, T.SIGN);
    s.objects.push({ kind: 'sign', tx: MX - 4, ty: 2, text: 'AURUM CAIU. BUSQUE OS 2 FRAGMENTOS.\nJ=ESPADA  K=ROLAR' });
    s.objects.push({ kind: 'chest', tx: MX + 3, ty: 2, item: 'coins10' });

    return level;
  };

  /* ---------------- masmorras ---------------- */

  const DG_COLS = 4, DG_ROWS = 4;

  const ESTILOS = [
    { id: 'dungeon0', nome: 'CAVERNA DOS GOBLINS', music: 'dungeon', tint: 'rgba(0,0,30,0.12)',
      piso: T.FLOOR, piso2: T.FLOOR2, parede: T.WALL, tocha: T.TORCH, buraco: T.PIT, bloco: T.BLOCK,
      estatua: T.STATUE, saida: T.STAIRS_UP, chefe: 'king', mini: null,
      tabela: [['goblin', 2], ['bat', 2], ['archer', 2], ['slime', 2], ['skeleton', 1],
               ['machadeiro', 2], ['bombardeiro', 2], ['aranha', 2], ['xama', 1]] },
    { id: 'dungeon1', nome: 'CRIPTA DAS SOMBRAS', music: 'dungeon', tint: 'rgba(40,10,70,0.18)',
      piso: T.FLOOR, piso2: T.FLOOR2, parede: T.WALL, tocha: T.TORCH, buraco: T.PIT, bloco: T.BLOCK,
      estatua: T.STATUE, saida: T.STAIRS_UP, chefe: 'lich', mini: null,
      tabela: [['ghost', 2], ['skeleton', 2], ['archer', 1], ['knight', 2], ['bat', 1],
               ['xama', 2], ['golem', 1], ['cacador', 2], ['aranha', 2], ['machadeiro', 1]] },
    // castelo: piso de pedra roxa e xadrez, estandartes, lava, pilares; chefe intermediario + rei no trono
    { id: 'castelo', nome: 'CASTELO SOMBRIO', music: 'castelo', tint: 'rgba(50,0,25,0.14)',
      piso: T.CFLOOR, piso2: T.CFLOOR2, parede: T.CWALL, tocha: T.BANNER, buraco: T.LAVA, bloco: T.PILLAR,
      estatua: T.PILLAR, saida: T.PORTAL, chefe: 'reisombrio', mini: 'cavnegro', trono: true,
      tabela: [['lanceiro', 3], ['besteiro', 2], ['feiticeiro', 2], ['gargula', 2], ['knight', 2],
               ['golem', 1], ['ghost', 1], ['skeleton', 1]] }
  ];

  G.genDungeon = function (seed, tier) {
    const E = ESTILOS[tier] || ESTILOS[0];
    const rnd = G.mulberry32(seed + tier * 99991);
    const level = {
      id: E.id, name: E.nome, kind: 'dungeon',
      cols: DG_COLS, rows: DG_ROWS, rooms: [], tier,
      music: E.music, tint: E.tint
    };

    const total = DG_COLS * DG_ROWS;
    const rooms = [];
    for (let i = 0; i < total; i++) rooms.push(newRoom('dungeon'));

    // arvore geradora por DFS aleatorio
    const startIdx = 1 + (DG_ROWS - 1) * DG_COLS;
    const seen = new Uint8Array(total);
    const order = [];
    const stack = [startIdx];
    seen[startIdx] = 1;
    const links = [];
    for (let i = 0; i < total; i++) links.push({});

    while (stack.length) {
      const cur = stack[stack.length - 1];
      order.push(cur);
      const cx = cur % DG_COLS, cy = (cur / DG_COLS) | 0;
      const opts = [];
      for (const d in DIRS) {
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= DG_COLS || ny >= DG_ROWS) continue;
        const ni = ny * DG_COLS + nx;
        if (seen[ni]) continue;
        opts.push([d, ni]);
      }
      if (!opts.length) { stack.pop(); continue; }
      const [d, ni] = opts[(rnd() * opts.length) | 0];
      links[cur][d] = ni;
      links[ni][OPP[d]] = cur;
      seen[ni] = 1;
      stack.push(ni);
    }

    // alguns atalhos extras para nao ser corredor puro
    for (let k = 0; k < 2; k++) {
      const i = (rnd() * total) | 0;
      const cx = i % DG_COLS, cy = (i / DG_COLS) | 0;
      const ds = Object.keys(DIRS);
      const d = ds[(rnd() * ds.length) | 0];
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= DG_COLS || ny >= DG_ROWS) continue;
      const ni = ny * DG_COLS + nx;
      links[i][d] = ni; links[ni][OPP[d]] = i;
    }

    // BFS de distancias a partir da entrada
    const distv = new Int16Array(total).fill(-1);
    distv[startIdx] = 0;
    const q = [startIdx];
    while (q.length) {
      const c = q.shift();
      for (const d in links[c]) {
        const n = links[c][d];
        if (distv[n] < 0) { distv[n] = distv[c] + 1; q.push(n); }
      }
    }

    let bossIdx = startIdx, far = -1;
    for (let i = 0; i < total; i++) if (distv[i] > far) { far = distv[i]; bossIdx = i; }

    // sala da chave: distante, mas nao a do chefe nem a entrada
    let keyIdx = startIdx, best = -1;
    for (let i = 0; i < total; i++) {
      if (i === bossIdx || i === startIdx) continue;
      const score = distv[i] + rnd();
      if (score > best) { best = score; keyIdx = i; }
    }
    // sala do tesouro (recipiente de coracao)
    let chestIdx = startIdx, best2 = -1;
    for (let i = 0; i < total; i++) {
      if (i === bossIdx || i === startIdx || i === keyIdx) continue;
      const score = distv[i] + rnd() * 2;
      if (score > best2) { best2 = score; chestIdx = i; }
    }

    // castelo: chefe intermediario numa sala no meio do caminho
    let miniIdx = -1;
    if (E.mini) {
      let alvo = Infinity;
      for (let i = 0; i < total; i++) {
        if (i === bossIdx || i === startIdx || i === keyIdx || i === chestIdx) continue;
        const score = Math.abs(distv[i] - far / 2) + rnd() * 0.5;
        if (score < alvo) { alvo = score; miniIdx = i; }
      }
    }

    // tranca a porta que leva ao chefe
    let bossDoorFrom = null, bossDoorDir = null;
    for (const d in links[bossIdx]) {
      const n = links[bossIdx][d];
      if (distv[n] === distv[bossIdx] - 1) { bossDoorFrom = n; bossDoorDir = OPP[d]; break; }
    }
    if (bossDoorFrom === null) {
      const d0 = Object.keys(links[bossIdx])[0];
      bossDoorFrom = links[bossIdx][d0]; bossDoorDir = OPP[d0];
    }

    // monta os tiles de cada sala
    for (let i = 0; i < total; i++) {
      const room = rooms[i];
      const r = G.mulberry32(seed + tier * 131 + i * 6151);
      fill(room, E.piso);
      for (let y = 0; y < ROOM_H; y++) {
        for (let x = 0; x < ROOM_W; x++) if (r() < 0.12) put(room, x, y, E.piso2);
      }
      for (let x = 0; x < ROOM_W; x++) { put(room, x, 0, E.parede); put(room, x, ROOM_H - 1, E.parede); }
      for (let y = 0; y < ROOM_H; y++) { put(room, 0, y, E.parede); put(room, ROOM_W - 1, y, E.parede); }
      put(room, 3, 0, E.tocha); put(room, ROOM_W - 4, 0, E.tocha);
      if (E.trono) { put(room, MX - 6, 0, E.tocha); put(room, MX + 5, 0, E.tocha); }

      room.exits = {};
      for (const d in links[i]) {
        room.exits[d] = links[i][d];
        openSide(room, d, T.DOOR);
      }

      const isBoss = i === bossIdx;
      const isStart = i === startIdx;

      if (isBoss) {
        room.type = 'boss';
        rect(room, MX - 3, CY0 - 1, 6, 5, T.CARPET);
        put(room, 2, 2, E.estatua); put(room, ROOM_W - 3, 2, E.estatua);
        if (E.trono) {                              // sala do trono: tapete ate o trono e colunas
          rect(room, MX - 1, 1, 2, ROOM_H - 2, T.CARPET);
          put(room, MX, 1, T.THRONE);
          put(room, 2, ROOM_H - 3, T.PILLAR); put(room, ROOM_W - 3, ROOM_H - 3, T.PILLAR);
          put(room, 6, 2, T.PILLAR); put(room, ROOM_W - 7, 2, T.PILLAR);
        }
        room.spawns.push({ type: E.chefe, x: MX * TILE - 16, y: 3 * TILE });
        room.meta.boss = E.chefe;
      } else if (i === miniIdx) {
        room.type = 'boss';
        rect(room, MX - 3, CY0 - 1, 6, 5, T.CARPET);
        put(room, 3, 3, T.PILLAR); put(room, ROOM_W - 4, 3, T.PILLAR);
        put(room, 3, ROOM_H - 4, T.PILLAR); put(room, ROOM_W - 4, ROOM_H - 4, T.PILLAR);
        room.spawns.push({ type: E.mini, x: MX * TILE - 16, y: 3 * TILE });
        room.meta.boss = E.mini;
      } else if (isStart) {
        room.type = 'entry';
        put(room, MX, MY - 1, E.saida);
        room.objects.push({ kind: 'exitStairs', tx: MX, ty: MY - 1 });
      } else {
        // decoracao
        const deco = (r() * 3) | 0;
        // decoracao longe do cruzamento central (onde ficam bau e escadas)
        if (deco === 0) {
          for (let x = 3; x < ROOM_W - 3; x += 3) {
            if (x >= CX0 - 1 && x <= CX0 + 4) continue;
            put(room, x, 3 + ((r() * (ROOM_H - 6)) | 0), E.bloco);
          }
        } else if (deco === 1) {
          let x = 4 + ((r() * (CX0 - 6)) | 0);
          if (r() < 0.5) x = ROOM_W - 2 - x;
          rect(room, x, CY0, 2, 3, E.buraco);
        } else {
          put(room, 4, 3, E.bloco); put(room, ROOM_W - 5, 3, E.bloco);
          put(room, 4, ROOM_H - 4, E.bloco); put(room, ROOM_W - 5, ROOM_H - 4, E.bloco);
        }
        // inimigos
        const n = 4 + ((r() * 3) | 0) + Math.min(tier, 2);
        const tabela = E.tabela;
        for (let k = 0; k < n; k++) {
          const type = sorteia(tabela, r);
          const pos = lugarLivre(room, r, type === 'golem');
          room.spawns.push({ type, x: pos.x, y: pos.y });
        }
      }

      if (i === keyIdx) room.objects.push({ kind: 'chest', tx: MX, ty: MY - 1, item: 'key', needClear: true });
      if (i === chestIdx) room.objects.push({ kind: 'chest', tx: MX, ty: MY - 1, item: 'container', needClear: true });

      room.meta.rx = i % DG_COLS; room.meta.ry = (i / DG_COLS) | 0;
      room.meta.idx = i;
    }

    // aplica a tranca nos dois lados
    const lockSide = (room, d) => {
      if (d === 'n') GAP_X.forEach((x) => put(room, x, 0, T.DOOR_LOCKED));
      else if (d === 's') GAP_X.forEach((x) => put(room, x, ROOM_H - 1, T.DOOR_LOCKED));
      else if (d === 'w') GAP_Y.forEach((y) => put(room, 0, y, T.DOOR_LOCKED));
      else GAP_Y.forEach((y) => put(room, ROOM_W - 1, y, T.DOOR_LOCKED));
    };
    // tranca TODAS as entradas da sala do chefe (atalhos inclusos)
    for (const d in links[bossIdx]) {
      const neighbor = links[bossIdx][d];
      lockSide(rooms[bossIdx], d);
      lockSide(rooms[neighbor], OPP[d]);
      rooms[bossIdx].locked[d] = true;
      rooms[neighbor].locked[OPP[d]] = true;
    }
    void bossDoorFrom; void bossDoorDir;

    level.rooms = rooms;
    level.start = { room: startIdx, x: MX * TILE - 5, y: (MY + 1) * TILE + 3 };
    level.bossRoom = bossIdx;
    return level;
  };

  /* ---------------- pantano (mundo aberto 4x4) ---------------- */

  const PT_COLS = 4, PT_ROWS = 4;
  const CHEFES_PT = [
    { rx: 0, ry: 0, tipo: 'reisapo' },    // noroeste
    { rx: 3, ry: 0, tipo: 'hidra' }       // nordeste, o mais longe da entrada
  ];

  G.genPantano = function (seed) {
    const level = {
      id: 'pantano', name: 'PANTANO SOMBRIO', kind: 'field',
      cols: PT_COLS, rows: PT_ROWS, rooms: [],
      music: 'pantano', tint: 'rgba(30,60,20,0.16)'
    };
    const startIdx = 1 + 3 * PT_COLS;     // (1,3), sul
    level.start = { room: startIdx, x: MX * TILE - 5, y: MY * TILE - 5 };   // no cruzamento de lama

    for (let ry = 0; ry < PT_ROWS; ry++) {
      for (let rx = 0; rx < PT_COLS; rx++) {
        const idx = ry * PT_COLS + rx;
        const room = newRoom('field');
        const r = G.mulberry32(seed + 5003 + idx * 9173);
        for (let y = 0; y < ROOM_H; y++) {
          for (let x = 0; x < ROOM_W; x++) {
            const n = r();
            put(room, x, y, n < 0.12 ? T.BOG2 : n < 0.16 ? T.MUSHROOM : T.BOG);
          }
        }
        // pocas de agua do pantano, algumas com vitorias-regias
        for (let k = 0, np = 1 + ((r() * 3) | 0); k < np; k++) {
          const cx = 3 + ((r() * (ROOM_W - 6)) | 0), cy = 3 + ((r() * (ROOM_H - 6)) | 0);
          const rad = 1.5 + r() * 2;
          for (let y = cy - 3; y <= cy + 3; y++) {
            for (let x = cx - 5; x <= cx + 5; x++) {
              if (x < 2 || y < 2 || x > ROOM_W - 3 || y > ROOM_H - 3) continue;
              const d = Math.hypot(x - cx, (y - cy) * 1.5);
              if (d < rad) put(room, x, y, r() < 0.15 ? T.LILY : T.SWAMP_WATER);
              else if (d < rad + 1 && r() < 0.5) put(room, x, y, T.MUD);
            }
          }
        }
        // arvores secas
        for (let c = 0, nc = 3 + ((r() * 5) | 0); c < nc; c++) {
          const cx = 2 + ((r() * (ROOM_W - 4)) | 0), cy = 2 + ((r() * (ROOM_H - 4)) | 0);
          for (let k = 0, n = 1 + ((r() * 3) | 0); k < n; k++) {
            const x = cx + ((r() * 3) | 0) - 1, y = cy + ((r() * 3) | 0) - 1;
            if (x < 1 || y < 1 || x > ROOM_W - 2 || y > ROOM_H - 2) continue;
            put(room, x, y, T.DEAD_TREE);
          }
        }
        for (let x = 0; x < ROOM_W; x++) { put(room, x, 0, T.DEAD_TREE); put(room, x, ROOM_H - 1, T.DEAD_TREE); }
        for (let y = 0; y < ROOM_H; y++) { put(room, 0, y, T.DEAD_TREE); put(room, ROOM_W - 1, y, T.DEAD_TREE); }
        // saidas com trilhas de lama ate o centro
        for (const d in DIRS) {
          const nx = rx + DIRS[d][0], ny = ry + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= PT_COLS || ny >= PT_ROWS) continue;
          room.exits[d] = ny * PT_COLS + nx;
          openSide(room, d, T.MUD);
          if (d === 'n') { for (let y = 1; y < CY0; y++) GAP_X.forEach((x) => put(room, x, y, T.MUD)); }
          if (d === 's') { for (let y = CY0 + 4; y < ROOM_H - 1; y++) GAP_X.forEach((x) => put(room, x, y, T.MUD)); }
          if (d === 'w') { for (let x = 1; x < CX0; x++) GAP_Y.forEach((y) => put(room, x, y, T.MUD)); }
          if (d === 'e') { for (let x = CX0 + 4; x < ROOM_W - 1; x++) GAP_Y.forEach((y) => put(room, x, y, T.MUD)); }
        }
        rect(room, CX0, CY0, 4, 4, T.MUD);

        const dStart = Math.abs(rx - 1) + Math.abs(ry - 3);
        if (idx === startIdx) {
          // portal verde de volta ao reino, a esquerda do cruzamento
          // (acima da trilha oeste, que passa nas linhas do meio)
          rect(room, CX0 - 4, 1, 3, 3, T.DEAD_TREE);
          put(room, CX0 - 3, 2, T.PORTAL2);
          put(room, CX0 - 3, 3, T.MUD);
          rect(room, CX0 - 3, CY0, 3, 1, T.MUD);
          room.objects.push({ kind: 'exitStairs', tx: CX0 - 3, ty: 2 });
        } else {
          const tabela = [['sapo', 3], ['mosquito', 3], ['slime', 2], ['bruxa', 1]];
          if (dStart >= 2) tabela.push(['bruxa', 2], ['aranha', 1], ['bat', 1]);
          if (dStart >= 3) tabela.push(['xama', 1], ['golem', 1], ['sapo', 1]);
          const count = Math.min(9, 3 + dStart + ((r() * 2) | 0));
          for (let k = 0; k < count; k++) {
            const type = sorteia(tabela, r);
            const pos = lugarLivre(room, r, type === 'golem');
            room.spawns.push({ type, x: pos.x, y: pos.y });
          }
        }
        room.meta.rx = rx; room.meta.ry = ry;
        level.rooms.push(room);
      }
    }

    CHEFES_PT.forEach((c) => {
      const room = level.rooms[c.ry * PT_COLS + c.rx];
      room.type = 'boss';
      room.meta.boss = c.tipo;
      rect(room, 2, 2, ROOM_W - 4, ROOM_H - 4, T.BOG);
      rect(room, CX0, CY0, 4, 4, T.MUD);
      // quatro pocas nos cantos da arena
      [[4, 3], [ROOM_W - 6, 3], [4, ROOM_H - 5], [ROOM_W - 6, ROOM_H - 5]].forEach(([x, y]) => {
        rect(room, x, y, 2, 2, T.SWAMP_WATER);
        put(room, x, y, T.LILY);
      });
      room.spawns = [{ type: c.tipo, x: MX * TILE - 16, y: 3 * TILE }];
    });
    return level;
  };

  /* ---------------- arenas do VS (uma sala fechada, sem saidas) ---------------- */

  // simetricas (esquerda = direita espelhada), para nenhum lado sair na vantagem
  const ARENAS = [
    { id: 'campo', nome: 'CAMPO DE AURUM', music: 'field', tint: null,
      piso: T.GRASS, piso2: T.GRASS2, borda: T.TREE, chao: T.PATH, obst: T.ROCK, extra: T.BUSH, agua: T.WATER },
    { id: 'caverna', nome: 'CAVERNA DOS GOBLINS', music: 'dungeon', tint: 'rgba(0,0,30,0.12)',
      piso: T.FLOOR, piso2: T.FLOOR2, borda: T.WALL, chao: T.CARPET, obst: T.BLOCK, extra: T.STATUE, agua: T.PIT, tocha: T.TORCH },
    { id: 'pantano', nome: 'PANTANO SOMBRIO', music: 'pantano', tint: 'rgba(30,60,20,0.16)',
      piso: T.BOG, piso2: T.BOG2, borda: T.DEAD_TREE, chao: T.MUD, obst: T.DEAD_TREE, extra: T.MUSHROOM, agua: T.SWAMP_WATER },
    { id: 'castelo', nome: 'CASTELO SOMBRIO', music: 'castelo', tint: 'rgba(50,0,25,0.14)',
      piso: T.CFLOOR, piso2: T.CFLOOR2, borda: T.CWALL, chao: T.CARPET, obst: T.PILLAR, extra: T.PILLAR, agua: T.LAVA, tocha: T.BANNER }
  ];
  G.ARENAS = ARENAS.map((a) => ({ id: a.id, nome: a.nome }));

  G.genArena = function (seed, id) {
    const A = ARENAS.find((a) => a.id === id) || ARENAS[0];
    const r = G.mulberry32(seed + 424242);
    const room = newRoom('arena');
    // espelha tudo na horizontal
    const par = (x, y, v) => { put(room, x, y, v); put(room, ROOM_W - 1 - x, y, v); };

    fill(room, A.piso);
    for (let y = 1; y < ROOM_H - 1; y++) {
      for (let x = 1; x < MX; x++) if (r() < 0.12) par(x, y, A.piso2);
    }
    for (let x = 0; x < ROOM_W; x++) { put(room, x, 0, A.borda); put(room, x, ROOM_H - 1, A.borda); }
    for (let y = 0; y < ROOM_H; y++) { put(room, 0, y, A.borda); put(room, ROOM_W - 1, y, A.borda); }
    if (A.tocha) { par(4, 0, A.tocha); par(MX - 4, 0, A.tocha); }

    // corredor do meio (onde os dois nascem) e centro livre
    rect(room, 1, MY - 1, ROOM_W - 2, 2, A.chao);
    rect(room, CX0, CY0, 4, 4, A.chao);

    // coberturas: um bloco de cada lado, em cima e embaixo do corredor
    [[5, 2], [5, ROOM_H - 4]].forEach(([x, y]) => { par(x, y, A.obst); par(x + 1, y, A.obst); par(x, y + 1, A.obst); });
    par(MX - 3, 2, A.obst); par(MX - 3, ROOM_H - 3, A.obst);
    // pocas (agua, buraco ou lava) nos cantos
    [[2, 2], [2, ROOM_H - 4]].forEach(([x, y]) => { par(x, y, A.agua); par(x + 1, y, A.agua); par(x, y + 1, A.agua); });
    // detalhes
    par(9, 3, A.extra); par(9, ROOM_H - 4, A.extra);

    room.meta.rx = 0; room.meta.ry = 0;
    room.visited = true;
    return {
      id: 'arena', name: 'ARENA - ' + A.nome, kind: 'arena',
      cols: 1, rows: 1, rooms: [room],
      music: A.music, tint: A.tint,
      start: { room: 0, x: 1 * TILE + 3, y: GAP_Y[0] * TILE + 3 }
    };
  };

  /* ---------------- render de sala com cache ---------------- */

  const CACHE_MAX = 16;
  const cacheOrder = [];

  G.renderRoom = function (room, tiles) {
    if (room.cache && !room.dirty) return room.cache;
    let c = room.cache;
    if (!c) {
      c = G.mkCanvas(G.VIEW_W, G.VIEW_H);
      room.cache = c;
      cacheOrder.push(room);
      while (cacheOrder.length > CACHE_MAX) {
        const old = cacheOrder.shift();
        if (old !== room) { old.cache = null; old.anim = null; old.dirty = true; }
      }
    }
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    const anim = [];
    for (let ty = 0; ty < ROOM_H; ty++) {
      for (let tx = 0; tx < ROOM_W; tx++) {
        const id = room.tiles[ty * ROOM_W + tx];
        const frames = tiles[id];
        if (!frames) continue;
        const v = frames.variantes;
        x.drawImage(v ? v[(tx * 7 + ty * 13 + ((tx * ty) >> 1)) % v.length] : frames[0], tx * TILE, ty * TILE);
        if (frames.length > 1) anim.push(tx * TILE, ty * TILE, id);
      }
    }
    room.anim = anim;
    room.dirty = false;
    return c;
  };

  G.drawRoomAnim = function (ctx, room, tiles, tick, ox, oy) {
    const a = room.anim;
    if (!a || !a.length) return;
    for (let i = 0; i < a.length; i += 3) {
      const frames = tiles[a[i + 2]];
      const f = ((tick / 12) | 0) % frames.length;
      ctx.drawImage(frames[f], a[i] + ox, a[i + 1] + oy);
    }
  };

  G.clearCaches = function (level) {
    if (!level) return;
    level.rooms.forEach((r) => { r.cache = null; r.anim = null; r.dirty = true; });
    cacheOrder.length = 0;
  };
})(window.AURUM = window.AURUM || {});
