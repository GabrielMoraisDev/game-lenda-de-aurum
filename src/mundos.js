/* mundos.js - campanha "Os Fragmentos do Mundo": os 3 mundos de 12 salas,
   placas, fonte de descanso, lampioes e os puzzles que abrem o portal de cada mundo. */
(function (G) {
  'use strict';

  const ROOM_W = G.ROOM_W, ROOM_H = G.ROOM_H, TILE = G.TILE, T = G.T;
  const Sound = G.Sound;
  const U = G.mundoUtil;
  const MX = U.MX, MY = U.MY;

  /* ---------------- as 12 salas ---------------- */

  // ordem das salas no grid 4x3: serpente de baixo para cima
  // (linha de baixo da esquerda para a direita, do meio da direita para a esquerda, a de cima de novo para a direita)
  const COLS = 4, ROWS = 3;
  const SEQ = [8, 9, 10, 11, 7, 6, 5, 4, 0, 1, 2, 3];
  // papel de cada sala na ordem: 6 com inimigos, 2 chefes e 4 calmas (inicio, tesouro, descanso, puzzle)
  const PAPEL = ['inicio', 'inimigos', 'tesouro', 'inimigos', 'inimigos', 'chefe',
                 'descanso', 'inimigos', 'inimigos', 'inimigos', 'chefe', 'puzzle'];
  G.MUNDO_SEQ = SEQ;

  // miolo 24x10 de cada sala (a borda e as portas sao postas depois)
  // . chao   , chao2   # pedra   T bloco grande   ~ agua/lava   = trilha   o estatua   b enfeite
  const SALAS = [
    [ // 0 inicio: clareira
      'TT.......,.....,......TT',
      'T....#.................T',
      '........................',
      '...o................o...',
      '========================',
      '========================',
      '...o................o...',
      '........................',
      'T....#..........#.....T.',
      'TT....................TT'],
    [ // 1 bosque de pedras
      '...##................##.',
      '...##..T........T..##...',
      '........................',
      '.T...##..........##...T.',
      '.....##..........##.....',
      '........................',
      '..T..................T..',
      '......##........##......',
      '.T....##........##....T.',
      '........................'],
    [ // 2 santuario do tesouro
      'T......................T',
      '........................',
      '....o.o.o......o.o.o....',
      '....o..............o....',
      '..........====..........',
      '..........====..........',
      '....o..............o....',
      '....o.o.o......o.o.o....',
      '........................',
      'T......................T'],
    [ // 3 lagoa
      '........................',
      '..~~~~............~~~~..',
      '.~~~~~~..........~~~~~~.',
      '.~~~~~~..........~~~~~~.',
      '..~~~~............~~~~..',
      '........................',
      '....##............##....',
      '........................',
      '..T......T....T......T..',
      '........................'],
    [ // 4 corredor de colunas
      '........................',
      '.o..o..o..o..o..o..o..o.',
      '........................',
      '..#.....#......#.....#..',
      '........................',
      '........................',
      '..#.....#......#.....#..',
      '........................',
      '.o..o..o..o..o..o..o..o.',
      '........................'],
    [ // 5 arena do primeiro chefe
      '........................',
      '.o....................o.',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '.o....................o.',
      '........................'],
    [ // 6 descanso: dois lagos e a fonte no meio
      '........................',
      '..~~~~............~~~~..',
      '..~~~~............~~~~..',
      '........................',
      '........................',
      '........................',
      '........................',
      '..b.b.b..........b.b.b..',
      '........................',
      'T......................T'],
    [ // 7 labirinto curto
      '........................',
      '.#####............#####.',
      '.....#............#.....',
      '.....#............#.....',
      '........................',
      '........................',
      '.....#............#.....',
      '.....#............#.....',
      '.#####............#####.',
      '........................'],
    [ // 8 campo de pocas
      '........................',
      '..~~...~~........~~...~~',
      '..~~...~~........~~...~~',
      '........................',
      '........................',
      '........................',
      '........................',
      '..~~...~~........~~...~~',
      '..~~...~~........~~...~~',
      '........................'],
    [ // 9 ruinas em diagonal
      '..T..................T..',
      '...T................T...',
      '....T..............T....',
      '........................',
      '.o....................o.',
      '.o....................o.',
      '........................',
      '....T..............T....',
      '...T................T...',
      '..T..................T..'],
    [ // 10 arena do segundo chefe
      '........................',
      '........................',
      '...o................o...',
      '........................',
      '........................',
      '........................',
      '........................',
      '...o................o...',
      '........................',
      '........................'],
    [ // 11 sala do puzzle
      'o......................o',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      'o......................o']
  ];
  G.MUNDO_SALAS = SALAS;

  // arena do reflexo: lava so do lado direito, simetrica em cima e embaixo
  const ARENA_REFLEXO = [
    '........................',
    '...............~~....~~.',
    '...............~~....~~.',
    '........................',
    '.................~~.....',
    '.................~~.....',
    '........................',
    '...............~~....~~.',
    '...............~~....~~.',
    '........................'];

  // salas proprias dos mundos novos (mesmo formato: 24x10 do miolo)
  const SALA_DUNAS = [
    '..T...................T.',
    '........,,,.....,,,.....',
    '...,,,....##.....,,,....',
    '..,,,,,...##......,,,,..',
    '........................',
    '........................',
    '..,,,,,....##....,,,,,..',
    '...,,,.....##.....,,,...',
    '.T....................T.',
    '........................'];
  const SALA_OASIS = [
    '........................',
    '...T..............T.....',
    '.....~~~~~~~~~~~~.......',
    '....~~~~~~~~~~~~~~......',
    '....~~~~~~~~~~~~~~......',
    '.....~~~~~~~~~~~~.......',
    '........................',
    '..b.b...........b.b.....',
    '.T..................T...',
    '........................'];
  const SALA_GELO = [
    '........................',
    '.,,,,,....####....,,,,,.',
    '.,,,,,....####....,,,,,.',
    '........................',
    '....####..........####..',
    '....####..........####..',
    '........................',
    '.,,,,,....####....,,,,,.',
    '.,,,,,....####....,,,,,.',
    '........................'];
  const SALA_CANAIS = [
    '........................',
    '..~~~~~~~~....~~~~~~~~..',
    '........................',
    '..##................##..',
    '........................',
    '........................',
    '..##................##..',
    '........................',
    '..~~~~~~~~....~~~~~~~~..',
    '........................'];
  const SALA_PONTES = [
    '~~~~~..............~~~~~',
    '~~~~~....,,,,,.....~~~~~',
    '~~~~,....,,,,,.....,~~~~',
    '.........,,,,,..........',
    '........................',
    '........................',
    '.........,,,,,..........',
    '~~~~,....,,,,,.....,~~~~',
    '~~~~~....,,,,,.....~~~~~',
    '~~~~~..............~~~~~'];
  const SALA_ILHAS = [
    '~~~..................~~~',
    '~~....##......##.......~',
    '......##......##........',
    '........................',
    '..,,,,,..........,,,,,..',
    '..,,,,,..........,,,,,..',
    '........................',
    '......##......##........',
    '~~....##......##.......~',
    '~~~..................~~~'];
  const SALA_FENDAS = [
    '........................',
    '....~.......~.......~...',
    '....~.......~.......~...',
    '....~.......~.......~...',
    '........................',
    '........................',
    '.......~.......~........',
    '.......~.......~........',
    '.......~.......~........',
    '........................'];
  const SALA_ESTRELAS = [
    ',,,....................,',
    '...,,,....,,,,....,,,...',
    '........................',
    '..##..............##....',
    '........................',
    '........................',
    '....##..............##..',
    '........................',
    '...,,,....,,,,....,,,...',
    ',....................,,,'];

  /* ---------------- os 8 mundos ---------------- */

  const MUNDOS = [
    {
      id: 'mundo1', nome: 'MUNDO 1 - AURUM FRATURADO', sub: 'ONDE A PRIMEIRA FENDA SE ABRIU',
      music: 'field', tint: 'rgba(60,20,80,0.06)',
      pal: { '.': T.GRASS, ',': T.GRASS2, '#': T.ROCK, 'T': T.TREE, '~': T.WATER, '=': T.PATH, 'o': T.STATUE, 'b': T.BUSH,
             borda: T.TREE, porta: T.PATH, chao2: T.GRASS2, extra: T.FLOWER, selo: T.ROCK },
      chefes: ['devorador', 'colosso'],
      tabela: [['goblin', 3], ['slime', 2], ['bat', 2], ['machadeiro', 2], ['archer', 1]],
      tabela2: [['archer', 2], ['aranha', 2], ['cacador', 2], ['bombardeiro', 1]],
      puzzle: 'luzes',
      placas: {
        0: 'AURUM SE PARTIU EM MIL MUNDOS. AS FENDAS VIRARAM PORTAIS.\nO DEVORADOR MERGULHA NAS FENDAS: BATA QUANDO ELE SAIR TONTO.',
        6: 'O COLOSSO ERA O GUARDIAO DE AURUM. A FENDA O CEGOU...\nSO AS COSTAS DELE SENTEM DOR. FACA ELE BATER NA PAREDE.',
        11: 'RUNAS DO PORTAL: ACENDA TODAS.\nCADA PASSO MUDA A RUNA E AS VIZINHAS. NO FACIL, A PEDRA VERMELHA DA UMA DICA.'
      }
    },
    {
      id: 'mundo2', nome: 'MUNDO 2 - PANTANO DAS FENDAS', sub: 'UM UNIVERSO QUE ENGOLIU O NOSSO',
      music: 'pantano', tint: 'rgba(30,60,20,0.16)',
      pal: { '.': T.BOG, ',': T.BOG2, '#': T.ROCK, 'T': T.DEAD_TREE, '~': T.SWAMP_WATER, '=': T.MUD, 'o': T.DEAD_TREE, 'b': T.MUSHROOM,
             borda: T.DEAD_TREE, porta: T.MUD, chao2: T.BOG2, extra: T.MUSHROOM, selo: T.ROCK, placa: T.STATUE },
      chefes: ['mariposa', 'eco'],
      tabela: [['sapo', 3], ['mosquito', 3], ['slime', 2], ['bruxa', 1]],
      tabela2: [['bruxa', 2], ['aranha', 2], ['xama', 1], ['ghost', 1]],
      puzzle: 'simon',
      placas: {
        0: 'ESTE PANTANO VEIO DE OUTRO UNIVERSO E ENGOLIU O NOSSO.\nA MARIPOSA ODEIA A LUZ, MAS NAO RESISTE A ELA: ACENDA OS LAMPIOES.',
        6: 'UMA VOZ CHORA NA SALA ADIANTE. NAO E UM MONSTRO COMUM.\nLUTAR E UM CAMINHO. ESCUTAR, LEMBRAR E CANTAR E OUTRO.',
        11: 'O TOTEM CANTA UMA SEQUENCIA DE CORES.\nPISE NAS PEDRAS NA MESMA ORDEM. SAO TRES CANCOES.'
      }
    },
    {
      id: 'mundo3', nome: 'MUNDO 3 - CIDADELA DO VAZIO', sub: 'NO CENTRO DO COLAPSO',
      music: 'castelo', tint: 'rgba(50,0,25,0.14)',
      pal: { '.': T.CFLOOR, ',': T.CFLOOR2, '#': T.PILLAR, 'T': T.CWALL, '~': T.LAVA, '=': T.CARPET, 'o': T.PILLAR, 'b': T.STATUE,
             borda: T.CWALL, porta: T.DOOR, chao2: T.CFLOOR2, extra: T.CFLOOR2, selo: T.PILLAR, tocha: T.BANNER, placa: T.STATUE },
      chefes: ['reflexo', 'coracao'],
      tabela: [['lanceiro', 3], ['besteiro', 2], ['gargula', 2], ['skeleton', 1]],
      tabela2: [['feiticeiro', 2], ['knight', 2], ['ghost', 1], ['golem', 1]],
      puzzle: 'runas',
      salas: { 5: ARENA_REFLEXO },
      placas: {
        0: 'A CIDADELA DO VAZIO FICA ONDE O CORACAO DO MUNDO RACHOU.\nSEU REFLEXO NAO PODE SER FERIDO... MAS A LAVA NAO SABE DISSO.',
        6: 'O CORACAO DO MUNDO APODRECEU E VIROU O CORACAO DO COLAPSO.\nQUEBRE OS ESCUDOS, RESISTA A GRAVIDADE, NAO DEIXE O MUNDO ENCOLHER.',
        11: 'O ULTIMO PORTAL: GIRE AS RUNAS ATE IGUALAR O MURAL.\nCADA PASSO GIRA A RUNA E AS DUAS DO LADO. NO FACIL, A PEDRA VERMELHA DA UMA DICA.'
      }
    },
    {
      id: 'mundo4', nome: 'MUNDO 4 - DESERTO DOS ESPELHOS', sub: 'ONDE A AREIA GUARDA O QUE VOCE ERA',
      music: 'deserto', tint: 'rgba(120,90,30,0.12)',
      pal: { '.': T.DUNE, ',': T.DUNE2, '#': T.SANDSTONE, 'T': T.CACTUS, '~': T.WATER, '=': T.PATH, 'o': T.STATUE, 'b': T.GLASS,
             borda: T.SANDSTONE, porta: T.PATH, chao2: T.DUNE2, extra: T.GLASS, selo: T.SANDSTONE, placa: T.STATUE },
      chefes: ['rainha', 'esfinge'],
      tabela: [['escorpiao', 3], ['nomade', 2], ['aranha', 2], ['verme', 1]],
      tabela2: [['verme', 2], ['nomade', 2], ['cacador', 2], ['bombardeiro', 1]],
      puzzle: 'runas',
      salas: { 1: SALA_DUNAS, 3: SALA_OASIS, 8: SALA_DUNAS },
      placas: {
        0: 'A AREIA AQUI E VIDRO MOIDO: CADA DUNA DEVOLVE UM REFLEXO SEU.\nA RAINHA CAVA POR BAIXO. SO DA PARA BATER QUANDO ELA ROLA E BATE NA PAREDE.',
        6: 'A ESFINGE NAO RESPONDE PERGUNTAS, ELA AS MULTIPLICA.\nQUEBRE OS QUATRO ESPELHOS: SEM ELES, ELA SENTE TUDO EM DOBRO.',
        11: 'RUNAS DE AREIA: GIRE ATE IGUALAR O MURAL.\nCADA PASSO GIRA A RUNA E AS DUAS DO LADO.'
      }
    },
    {
      id: 'mundo5', nome: 'MUNDO 5 - GELEIRA DO SILENCIO', sub: 'O MUNDO QUE PAROU NO MEIO DE UM GRITO',
      music: 'geleira', tint: 'rgba(60,110,160,0.16)',
      pal: { '.': T.SNOW, ',': T.ICE, '#': T.ICE_WALL, 'T': T.PINE, '~': T.WATER, '=': T.SNOW, 'o': T.ICE_WALL, 'b': T.ICE,
             borda: T.PINE, porta: T.SNOW, chao2: T.ICE, extra: T.ICE, selo: T.ICE_WALL, placa: T.STATUE },
      chefes: ['tita', 'arauto'],
      tabela: [['lobogelo', 3], ['oraculo', 2], ['slime', 2], ['bat', 1]],
      tabela2: [['oraculo', 2], ['lobogelo', 3], ['knight', 1], ['golem', 1]],
      puzzle: 'luzes',
      salas: { 1: SALA_GELO, 4: SALA_GELO, 9: SALA_GELO },
      placas: {
        0: 'NADA DERRETE AQUI, NEM O SOM. O QUE VOCE GRITAR FICA NO GELO.\nO TITA SO RACHA COM GOLPES SEGUIDOS: TRES SEM PARAR QUEBRAM UMA PLACA.',
        6: 'O ARAUTO TRAZ A NEVASCA E O VENTO EMPURRA PARA UM LADO SO.\nOLHE PARA ONDE O VENTO SOPRA E ANDE CONTRA ELE.',
        11: 'LANTERNAS DE GELO: ACENDA TODAS.\nCADA PASSO MUDA A LUZ E AS VIZINHAS.'
      }
    },
    {
      id: 'mundo6', nome: 'MUNDO 6 - FORJA DO MUNDO', sub: 'ONDE AURUM FOI MARTELADO PELA PRIMEIRA VEZ',
      music: 'forja', tint: 'rgba(120,30,0,0.16)',
      pal: { '.': T.BASALT, ',': T.EMBER, '#': T.OBSIDIAN, 'T': T.OBSIDIAN, '~': T.LAVA, '=': T.BASALT, 'o': T.OBSIDIAN, 'b': T.EMBER,
             borda: T.OBSIDIAN, porta: T.BASALT, chao2: T.EMBER, extra: T.EMBER, selo: T.OBSIDIAN, tocha: T.TORCH, placa: T.STATUE },
      chefes: ['forjador', 'serpente'],
      tabela: [['imp', 3], ['machadeiro', 2], ['gargula', 1], ['golemlava', 1]],
      tabela2: [['golemlava', 2], ['imp', 3], ['besteiro', 2], ['feiticeiro', 1]],
      puzzle: 'simon',
      salas: { 3: SALA_CANAIS, 7: SALA_CANAIS, 9: SALA_CANAIS },
      placas: {
        0: 'FOI AQUI QUE BATERAM O PRIMEIRO PEDACO DE AURUM.\nO FORJADOR ESQUENTA O MARTELO A CADA GOLPE: QUANDO ELE PARA PARA ESFRIAR, ATAQUE.',
        6: 'A SERPENTE DE MAGMA E PEDRA DA CABECA AO MEIO.\nSO A PONTA DA CAUDA CORTA. VA COMENDO O CORPO ATE CHEGAR NELA.',
        11: 'O TOTEM DE BRASA CANTA UMA SEQUENCIA.\nPISE NAS PEDRAS NA MESMA ORDEM. SAO TRES CANCOES.'
      }
    },
    {
      id: 'mundo7', nome: 'MUNDO 7 - ILHAS DO CEU', sub: 'OS PEDACOS QUE O COLAPSO JOGOU PARA CIMA',
      music: 'ceu', tint: 'rgba(40,90,170,0.12)',
      pal: { '.': T.CLOUD, ',': T.SKYSTONE, '#': T.SKYSTONE, 'T': T.SKYSTONE, '~': T.SKY, '=': T.CLOUD, 'o': T.SKYSTONE, 'b': T.CLOUD,
             borda: T.SKYSTONE, porta: T.CLOUD, chao2: T.CLOUD, extra: T.CLOUD, selo: T.SKYSTONE, placa: T.STATUE },
      chefes: ['roc', 'guardiao'],
      tabela: [['harpia', 3], ['silfo', 2], ['bat', 2], ['gargula', 1]],
      tabela2: [['silfo', 3], ['harpia', 2], ['besteiro', 2], ['xama', 1]],
      puzzle: 'runas',
      salas: { 1: SALA_PONTES, 3: SALA_ILHAS, 7: SALA_ILHAS, 9: SALA_PONTES },
      placas: {
        0: 'O CHAO AQUI ACABA NO AZUL. O QUE CAI NAO VOLTA.\nO ROC VOA ALTO DEMAIS: SO DA PARA FERI-LO DEPOIS DO MERGULHO.',
        6: 'O GUARDIAO SE LIGA AOS PILARES E NENHUM GOLPE O ALCANCA.\nDERRUBE O PILAR ACESO E BATA ENQUANTO ELE ESTA NO CHAO.',
        11: 'RUNAS DE VENTO: GIRE ATE IGUALAR O MURAL.\nCADA PASSO GIRA A RUNA E AS DUAS DO LADO.'
      }
    },
    {
      id: 'mundo8', nome: 'MUNDO 8 - O VAZIO ENTRE MUNDOS', sub: 'DEPOIS DAQUI NAO TEM MAIS ONDE',
      music: 'vazio', tint: 'rgba(30,0,60,0.22)',
      pal: { '.': T.VOID, ',': T.STARS, '#': T.VOIDWALL, 'T': T.VOIDWALL, '~': T.RIFT, '=': T.STARS, 'o': T.VOIDWALL, 'b': T.STARS,
             borda: T.VOIDWALL, porta: T.STARS, chao2: T.STARS, extra: T.STARS, selo: T.VOIDWALL, placa: T.STATUE },
      chefes: ['trindade', 'tecelao'],
      tabela: [['caco', 3], ['olhovazio', 2], ['ghost', 2], ['aranha', 1]],
      tabela2: [['olhovazio', 3], ['caco', 2], ['feiticeiro', 2], ['knight', 1]],
      puzzle: 'luzes',
      salas: { 1: SALA_FENDAS, 3: SALA_ESTRELAS, 7: SALA_FENDAS, 9: SALA_ESTRELAS },
      placas: {
        0: 'AQUI NAO TEM CHAO, TEM LEMBRANCA DE CHAO.\nAS TRES FACES DIVIDEM UMA VIDA SO: BATER EM QUALQUER UMA VALE.',
        6: 'O TECELAO SEGURA OS FIOS QUE PRENDEM OS OITO MUNDOS.\nNAO FIQUE NA LINHA DOS FIOS. ELE VAI CHAMAR OS CHEFES QUE VOCE JA VENCEU.',
        11: 'AS ULTIMAS LUZES DE AURUM: ACENDA TODAS E VOLTE PARA CASA.'
      }
    }
  ];
  G.MUNDOS = MUNDOS;

  // onde cada chefe nasce (padrao: no meio, perto do topo)
  const CHEFE_POS = {
    coracao: { x: MX * TILE - 16, y: MY * TILE - 18 },
    eco: { x: MX * TILE - 10, y: 3 * TILE },
    serpente: { x: MX * TILE - 9, y: MY * TILE - 9 },
    trindade: { x: MX * TILE - 10, y: MY * TILE - 10 },
    tecelao: { x: MX * TILE - 15, y: MY * TILE - 15 },
    roc: { x: MX * TILE - 15, y: 3 * TILE },
    guardiao: { x: MX * TILE - 11, y: MY * TILE - 12 }
  };

  // direcao de a para b no grid
  function lado(a, b) {
    const ax = a % COLS, ay = (a / COLS) | 0, bx = b % COLS, by = (b / COLS) | 0;
    if (bx > ax) return 'e';
    if (bx < ax) return 'w';
    return by > ay ? 's' : 'n';
  }

  // inimigo longe das portas (senao ele nasce em cima de quem entra)
  function posInimigo(room, r, grande, portas) {
    for (let k = 0; k < 40; k++) {
      const x = 3 + ((r() * (ROOM_W - 6)) | 0), y = 2 + ((r() * (ROOM_H - 4)) | 0);
      const livre = (a, b) => !U.SOLID[room.tiles[b * ROOM_W + a]];
      if (!livre(x, y) || (grande && !(livre(x + 1, y) && livre(x, y + 1) && livre(x + 1, y + 1)))) continue;
      if (portas.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < 6)) continue;
      return { x: x * TILE + 2, y: y * TILE + 2 };
    }
    return { x: MX * TILE, y: 3 * TILE };
  }

  const PORTA_XY = { n: [MX, 0], s: [MX, ROOM_H - 1], w: [0, MY], e: [ROOM_W - 1, MY] };

  G.genMundo = function (seed, n) {
    const M = MUNDOS[n - 1];
    const level = {
      id: M.id, name: M.nome, sub: M.sub, kind: 'dungeon', mundo: n,
      cols: COLS, rows: ROWS, rooms: [], music: M.music, tint: M.tint
    };
    const rooms = [];
    for (let i = 0; i < COLS * ROWS; i++) rooms.push(U.newRoom('dungeon'));

    SEQ.forEach((idx, s) => {
      const room = rooms[idx];
      const r = G.mulberry32(seed + n * 7919 + s * 104729);
      const P = M.pal, papel = PAPEL[s];
      const tpl = (M.salas && M.salas[s]) || SALAS[s];

      // chao e miolo
      for (let y = 0; y < ROOM_H; y++) {
        for (let x = 0; x < ROOM_W; x++) {
          let t;
          if (x === 0 || y === 0 || x === ROOM_W - 1 || y === ROOM_H - 1) t = P.borda;
          else {
            const ch = (tpl[y - 1] || '')[x - 1] || '.';
            t = P[ch] !== undefined ? P[ch] : P['.'];
            if (ch === '.') { const k = r(); if (k < 0.12) t = P.chao2; else if (k < 0.15) t = P.extra; }
          }
          U.put(room, x, y, t);
        }
      }
      if (P.tocha) { U.put(room, 3, 0, P.tocha); U.put(room, ROOM_W - 4, 0, P.tocha); }

      // portas so para a sala anterior e a proxima
      const portas = [];
      [SEQ[s - 1], SEQ[s + 1]].forEach((nb) => {
        if (nb === undefined) return;
        const d = lado(idx, nb);
        room.exits[d] = nb;
        U.openSide(room, d, P.porta);
        portas.push(PORTA_XY[d]);
        // o primeiro bloco depois da porta sempre livre
        if (d === 'n') G.GAP_X.forEach((x) => U.put(room, x, 1, P['=']));
        if (d === 's') G.GAP_X.forEach((x) => U.put(room, x, ROOM_H - 2, P['=']));
        if (d === 'w') G.GAP_Y.forEach((y) => U.put(room, 1, y, P['=']));
        if (d === 'e') G.GAP_Y.forEach((y) => U.put(room, ROOM_W - 2, y, P['=']));
      });

      room.meta.rx = idx % COLS; room.meta.ry = (idx / COLS) | 0;
      room.meta.idx = idx; room.meta.ordem = s; room.meta.papel = papel;

      if (M.placas[s] !== undefined) {
        const sx = papel === 'puzzle' ? 3 : papel === 'descanso' ? 8 : 5, sy = 2;
        U.put(room, sx, sy, P.placa || T.SIGN);
        room.objects.push({ kind: 'sign', tx: sx, ty: sy, text: M.placas[s] });
      }

      if (papel === 'inicio') {
        room.type = 'entry';
      } else if (papel === 'inimigos') {
        const tabela = s >= 7 ? M.tabela.concat(M.tabela2) : s >= 3 ? M.tabela.concat(M.tabela2.slice(0, 2)) : M.tabela;
        const count = 3 + Math.min(4, n) + (s >= 7 ? 1 : 0) + ((r() * 2) | 0);
        for (let k = 0; k < count; k++) {
          const type = U.sorteia(tabela, r);
          const pos = posInimigo(room, r, type === 'golem', portas);
          room.spawns.push({ type, x: pos.x, y: pos.y });
        }
      } else if (papel === 'tesouro') {
        room.objects.push({ kind: 'chest', tx: MX, ty: MY - 1, item: 'container' });
      } else if (papel === 'descanso') {
        room.objects.push({ kind: 'fonte', tx: MX - 1, ty: MY - 1 });
      } else if (papel === 'chefe') {
        const tipo = M.chefes[s === 5 ? 0 : 1];
        room.type = 'boss';
        room.meta.boss = tipo;
        const pos = CHEFE_POS[tipo] || { x: MX * TILE - 16, y: 3 * TILE };
        room.spawns.push({ type: tipo, x: pos.x, y: pos.y });
        if (tipo === 'mariposa') {
          [[4, 2], [ROOM_W - 5, 2], [4, ROOM_H - 3], [ROOM_W - 5, ROOM_H - 3]].forEach(([tx, ty]) => {
            room.objects.push({ kind: 'lampiao', tx, ty });
          });
        }
        // o chefe final mexe no chao da arena; guarda o original para restaurar
        if (tipo === 'coracao') room.meta.orig = room.tiles.slice();
      } else if (papel === 'puzzle') {
        room.meta.puzzle = true;
        const px = MX, py = 1;
        U.rect(room, px - 2, 1, 5, 1, P.borda);
        U.put(room, px, py, P.selo);
        room.objects.push({ kind: 'puzzle', tipo: M.puzzle, tx: px, ty: py, seed: seed + n * 31 });
      }
      level.rooms[idx] = room;
    });

    const ini = SEQ[0];
    level.start = { room: ini, x: MX * TILE - 5, y: MY * TILE - 5 };
    return level;
  };

  /* ---------------- objetos das salas ---------------- */

  function px(c, x, y, w, h, cor) { c.fillStyle = cor; c.fillRect(x | 0, y | 0, w, h); }

  // tile onde estao os pes do jogador
  function tileDoPe(p) { return [(p.cx / TILE) | 0, ((p.y + p.h - 3) / TILE) | 0]; }

  // placa: chegou perto, le
  class Placa {
    constructor(o) {
      this.x = o.tx * TILE; this.y = o.ty * TILE; this.w = 16; this.h = 16;
      this.text = o.text; this.perto = false; this.dead = false;
    }
    get cx() { return this.x + 8; }
    get cy() { return this.y + 8; }
    update(g) {
      const perto = g.players.some((p) => !p.dead && G.dist(p.cx, p.cy, this.cx, this.cy) < 26);
      if (perto && !this.perto) { g.say(this.text, 320); Sound.play('menu'); }
      this.perto = perto;
    }
    draw() {}
  }

  // fonte de descanso: cura todo mundo, salva e vira ponto de retorno
  class Fonte {
    constructor(o) {
      this.x = o.tx * TILE; this.y = o.ty * TILE + 4; this.w = 32; this.h = 24;
      this.dead = false; this.usada = false; this.anim = 0;
    }
    get cx() { return this.x + 16; }
    get cy() { return this.y + 12; }
    update(g) {
      this.anim++;
      const toca = g.players.some((p) => !p.dead && G.overlap(p.x, p.y, p.w, p.h, this.x - 2, this.y - 2, this.w + 4, this.h + 4));
      if (toca && !this.usada) {
        this.usada = true;
        for (const p of g.players) if (!p.dead) p.hp = p.maxhp;
        g.flags.checkpoint = { level: g.levelId, room: g.roomIdx, x: this.x + 11, y: this.y + this.h + 6 };
        g.particles.burst(this.cx, this.cy, 24, 4, 2, 30);
        Sound.play('heal');
        g.say('A FONTE GUARDA A LUZ DO MUNDO INTEIRO.\nVIDA RESTAURADA. VOCE VOLTA AQUI SE CAIR.', 200);
        g.save();
      } else if (!toca) this.usada = false;
      if ((this.anim & 7) === 0) g.particles.spawn(this.cx + (Math.random() - 0.5) * 10, this.y + 4, 0, -0.5, 18, 4, 1, 0);
    }
    draw(c) {
      const x = this.x | 0, y = this.y | 0;
      px(c, x, y + 6, 32, 18, '#5c667e');
      px(c, x + 1, y + 7, 30, 16, '#8f96a8');
      px(c, x + 3, y + 9, 26, 12, '#2f8fb8');
      px(c, x + 3, y + 9, 26, 2, '#7fd2ff');
      const f = (this.anim >> 3) & 3;
      px(c, x + 6 + f * 4, y + 14, 3, 1, '#eaffff');
      px(c, x + 22 - f * 3, y + 17, 2, 1, '#eaffff');
      px(c, x + 13, y - 4, 6, 12, '#8f96a8');
      px(c, x + 14, y - 8, 4, 5, '#c8cede');
      px(c, x + 15, y - 10 + ((this.anim >> 4) & 1), 2, 3, '#7fd2ff');
    }
  }

  // lampiao da arena da mariposa: o heroi acende encostando; a mariposa e atraida pela luz
  class Lampiao {
    constructor(o) {
      this.x = o.tx * TILE + 3; this.y = o.ty * TILE + 2; this.w = 10; this.h = 12;
      this.dead = false; this.lampiao = true; this.aceso = false; this.anim = 0; this.cd = 0;
    }
    get cx() { return this.x + 5; }
    get cy() { return this.y + 6; }
    acende(g) {
      this.aceso = true; this.cd = 40;
      g.particles.burst(this.cx, this.y, 12, 9, 1.6, 18);
      Sound.play('fire');
    }
    apaga(g) {
      if (!this.aceso) return;
      this.aceso = false; this.cd = 60;
      g.particles.burst(this.cx, this.y, 10, 5, 1.2, 20);
    }
    update(g) {
      this.anim++;
      if (this.cd > 0) { this.cd--; return; }
      if (!this.aceso && g.players.some((p) => !p.dead && G.overlap(p.x - 3, p.y - 3, p.w + 6, p.h + 6, this.x, this.y, this.w, this.h))) this.acende(g);
    }
    draw(c) {
      const x = this.x | 0, y = this.y | 0;
      px(c, x + 4, y + 4, 2, 9, '#3a3a4a');
      px(c, x + 1, y + 11, 8, 2, '#3a3a4a');
      px(c, x + 1, y - 2, 8, 7, '#2a2a3a');
      if (this.aceso) {
        const f = (this.anim >> 2) & 1;
        px(c, x + 2, y - 1, 6, 5, '#ff8a3d');
        px(c, x + 3, y - f, 4, 3, '#ffd34d');
        px(c, x + 4, y + 1, 2, 2, '#ffffff');
      } else {
        px(c, x + 2, y - 1, 6, 5, '#1a1d29');
      }
    }
  }

  /* ---------------- puzzles ---------------- */

  const COR_SIMON = ['#e33b4e', '#4cd964', '#5ce1ff', '#ffd34d'];
  const SOM_SIMON = ['hit', 'coin', 'menu', 'goldhit'];

  // controla as placas do chao e abre o portal quando resolvido
  class Puzzle {
    constructor(o, g) {
      this.x = 0; this.y = -1000; this.w = 0; this.h = 0;   // desenha antes de todo mundo (no chao)
      this.dead = false; this.anim = 0;
      this.tipo = o.tipo; this.ptx = o.tx; this.pty = o.ty;
      this.id = g.levelId;
      this.r = G.mulberry32(o.seed);
      this.resolvido = !!(g.flags.puzzles && g.flags.puzzles[this.id]);
      this.sobre = new Map();             // jogador -> placa em que esta pisando
      this.g = g;
      this.dica = null;                   // dica (so no facil): quantas vezes pisar em cada placa (indice -> vezes)
      this.placas = [];                   // { tx, ty, v, kind }
      this.monta();
      if (this.resolvido) this.abrePortal(g, true);
    }

    placa(tx, ty, kind) { const p = { tx, ty, v: 0, kind: kind || 'n', luz: 0 }; this.placas.push(p); return p; }

    monta() {
      const r = this.r;
      if (this.tipo === 'luzes') {
        // 3x3 runas; o passo inverte a runa e as vizinhas (ortogonais). objetivo: todas acesas
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) this.placa(MX - 3 + i * 2, MY - 2 + j * 2).v = 1;
        this.reset = this.placa(4, MY + 3, 'reset');
        let guard = 0;
        do {
          this.placas.forEach((p) => { if (p.kind === 'n') p.v = 1; });
          const feitos = new Set();
          while (feitos.size < 3) feitos.add((r() * 9) | 0);
          feitos.forEach((k) => this.inverte(k));
        } while (this.luzesOk() && ++guard < 10);
        this.ini = this.placas.map((p) => p.v);
      } else if (this.tipo === 'simon') {
        // 4 pedras coloridas em volta do totem; tres rodadas: 3, 4 e 5 notas
        this.placa(MX, MY - 3).v = 0;
        this.placa(MX + 4, MY).v = 1;
        this.placa(MX, MY + 3).v = 2;
        this.placa(MX - 4, MY).v = 3;
        this.seqS = [];
        for (let k = 0; k < 5; k++) this.seqS.push((r() * 4) | 0);
        this.rodada = 0; this.pos = 0;
        this.fase = 'espera'; this.ft = 90; this.mostra = -1;
      } else {
        // runas: 5 em fila, cada uma com 4 simbolos; o passo gira ela e as vizinhas
        for (let k = 0; k < 5; k++) this.placa(MX - 5 + k * 2 + 1, MY + 1);
        this.reset = this.placa(4, MY + 3, 'reset');
        this.alvo = [];
        for (let k = 0; k < 5; k++) this.alvo.push((r() * 4) | 0);
        const runas = this.placas.filter((p) => p.kind === 'n');
        let guard = 0;
        do {
          runas.forEach((p, k) => { p.v = this.alvo[k]; });
          for (let k = 0; k < 3; k++) {
            const i = (r() * 5) | 0;
            for (let d = -1; d <= 1; d++) if (runas[i + d]) runas[i + d].v = (runas[i + d].v + 3) % 4;
          }
        } while (this.runasOk() && ++guard < 10);
        this.ini = this.placas.map((p) => p.v);
      }
    }

    inverte(k) {
      const i = k % 3, j = (k / 3) | 0;
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => {
        const ii = i + a, jj = j + b;
        if (ii < 0 || jj < 0 || ii > 2 || jj > 2) return;
        const p = this.placas[jj * 3 + ii];
        p.v = 1 - p.v; p.luz = 12;
      });
    }
    luzesOk() { return this.placas.every((p) => p.kind !== 'n' || p.v === 1); }

    // menor solucao a partir do estado atual (forca bruta: 512 combinacoes nas luzes, 1024 nas runas)
    resolveDaqui() {
      if (this.tipo === 'luzes') {
        const v0 = this.placas.slice(0, 9).map((p) => p.v);
        let best = null;
        for (let m = 0; m < 512; m++) {
          const v = v0.slice();
          for (let k = 0; k < 9; k++) {
            if (!(m >> k & 1)) continue;
            const i = k % 3, j = (k / 3) | 0;
            [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => {
              const ii = i + a, jj = j + b;
              if (ii >= 0 && jj >= 0 && ii < 3 && jj < 3) v[jj * 3 + ii] ^= 1;
            });
          }
          if (!v.every((x) => x === 1)) continue;
          const vezes = {};
          let n = 0;
          for (let k = 0; k < 9; k++) if (m >> k & 1) { vezes[k] = 1; n++; }
          if (!best || n < best.n) best = { n, vezes };
        }
        return best ? best.vezes : null;
      }
      if (this.tipo === 'runas') {
        const runas = this.placas.filter((p) => p.kind === 'n');
        let best = null;
        for (let m = 0; m < 1024; m++) {
          const cnt = [0, 1, 2, 3, 4].map((k) => (m >> (k * 2)) & 3);
          const v = runas.map((p) => p.v);
          cnt.forEach((c, i) => { for (let d = -1; d <= 1; d++) if (v[i + d] !== undefined) v[i + d] = (v[i + d] + c) % 4; });
          if (!v.every((x, k) => x === this.alvo[k])) continue;
          const n = cnt.reduce((a, b) => a + b, 0);
          if (!best || n < best.n) {
            const vezes = {};
            cnt.forEach((c, i) => { if (c) vezes[this.placas.indexOf(runas[i])] = c; });
            best = { n, vezes };
          }
        }
        return best ? best.vezes : null;
      }
      return null;
    }

    // pedra vermelha e dicas existem so no modo facil
    comDica() { return !!this.g.dif().dicas; }

    // pisou na pedra vermelha (facil): as runas certas comecam a piscar e acompanham cada passo
    confereDica(g, recomecou) {
      if (this.tipo === 'simon' || this.resolvido) return;
      if (!this.comDica()) { this.dica = null; return; }
      if (this.dica || recomecou) {
        const antes = this.dica;
        this.dica = this.resolveDaqui();
        if (!antes && this.dica) {
          g.say(this.tipo === 'runas' ? 'DICA: PISE NAS RUNAS QUE PISCAM\nO NUMERO DIZ QUANTAS VEZES' : 'DICA: PISE UMA VEZ EM CADA RUNA QUE PISCA', 200);
          Sound.play('secret');
        }
      }
    }
    runasOk() { return this.placas.filter((p) => p.kind === 'n').every((p, k) => p.v === this.alvo[k]); }

    update(g) {
      this.anim++;
      for (const p of this.placas) if (p.luz > 0) p.luz--;
      if (this.resolvido) return;
      if (this.tipo === 'simon') this.passoSimon(g);

      for (const p of g.players) {
        if (p.dead) { this.sobre.delete(p); continue; }
        const [tx, ty] = tileDoPe(p);
        const k = this.placas.findIndex((q) => q.tx === tx && q.ty === ty);
        const antes = this.sobre.has(p) ? this.sobre.get(p) : -1;
        this.sobre.set(p, k);
        if (k >= 0 && k !== antes) this.pisa(g, k);
      }
    }

    pisa(g, k) {
      const pl = this.placas[k];
      if (pl.kind === 'reset') {
        if (!this.comDica()) return;                        // medio e dificil: a pedra nao existe
        this.placas.forEach((p, i) => { p.v = this.ini[i]; p.luz = 10; });
        Sound.play('blocked');
        g.say('AS RUNAS VOLTARAM AO COMECO', 70);
        this.confereDica(g, true);
        return;
      }
      if (this.tipo === 'luzes') {
        this.inverte(k);
        Sound.play('menu');
        if (this.luzesOk()) this.resolve(g); else this.confereDica(g);
      } else if (this.tipo === 'runas') {
        const runas = this.placas.filter((p) => p.kind === 'n');
        const i = runas.indexOf(pl);
        for (let d = -1; d <= 1; d++) if (runas[i + d]) { runas[i + d].v = (runas[i + d].v + 1) % 4; runas[i + d].luz = 12; }
        Sound.play('menu');
        if (this.runasOk()) this.resolve(g); else this.confereDica(g);
      } else if (this.fase === 'jogador') {
        pl.luz = 20;
        Sound.play(SOM_SIMON[pl.v]);
        if (pl.v === this.seqS[this.pos]) {
          this.pos++;
          if (this.pos >= this.rodada + 3) {
            this.rodada++;
            if (this.rodada >= 3) { this.resolve(g); return; }
            g.say('CANCAO ' + this.rodada + '/3 CERTA!', 60);
            this.fase = 'espera'; this.ft = 70;
          }
        } else {
          Sound.play('blocked');
          g.shake(4);
          g.say('NOTA ERRADA... O TOTEM CANTA DE NOVO', 80);
          this.fase = 'espera'; this.ft = 80;
        }
      }
    }

    // totem canta a sequencia da rodada, depois espera o jogador
    passoSimon(g) {
      if (this.fase === 'espera') {
        if (--this.ft <= 0) { this.fase = 'canta'; this.mostra = 0; this.ft = 34; this.pos = 0; }
      } else if (this.fase === 'canta') {
        if (this.ft === 34) {
          const pl = this.placas[this.seqS[this.mostra]];
          pl.luz = 24;
          Sound.play(SOM_SIMON[pl.v]);
        }
        if (--this.ft <= 0) {
          this.mostra++;
          this.ft = 34;
          if (this.mostra >= this.rodada + 3) { this.fase = 'jogador'; this.mostra = -1; }
        }
      }
    }

    resolve(g) {
      this.resolvido = true;
      g.flags.puzzles = g.flags.puzzles || {};
      g.flags.puzzles[this.id] = true;
      this.abrePortal(g, false);
      g.save();
    }

    abrePortal(g, quieto) {
      G.setTile(g.room, this.ptx, this.pty, T.PORTAL);
      G.setTile(g.room, this.ptx, this.pty + 1, [T.PATH, T.MUD, T.CARPET][g.level.mundo - 1] || T.PATH);
      this.placas.forEach((p) => { if (p.kind === 'n') p.luz = 30; });
      if (quieto) return;
      g.shake(8);
      g.flashT = 10;
      Sound.play('secret');
      g.particles.burst(this.ptx * TILE + 8, this.pty * TILE + 8, 40, 8, 2.6, 34);
      g.say(g.level.mundo === 3 ? 'O PORTAL DO CORACAO SE ABRIU!\nENTRE PARA RESTAURAR O MUNDO.' : 'O PORTAL SE ABRIU!\nO PROXIMO MUNDO ESPERA.', 200);
    }

    draw(c) {
      const t = this.anim;
      if (this.tipo === 'runas') {
        // mural com o alvo, no alto da sala
        const x0 = (MX - 5) * TILE + 16, y0 = 2 * TILE + 4;
        px(c, x0 - 4, y0 - 3, 5 * 32 - 8, 16, '#16161f');
        this.alvo.forEach((v, k) => this.simbolo(c, x0 + k * 32 - 1, y0 - 1, v, '#ffd34d'));
      }
      if (this.tipo === 'simon') {
        const x = MX * TILE, y = MY * TILE;                         // totem
        px(c, x - 5, y - 18, 10, 22, '#3a3a4a');
        px(c, x - 4, y - 17, 8, 20, '#5c4a3a');
        const cor = this.fase === 'canta' && this.ft > 10 && this.mostra >= 0 ? COR_SIMON[this.seqS[this.mostra]] : this.resolvido ? '#ffffff' : '#1a1d29';
        px(c, x - 2, y - 14, 4, 4, cor);
        px(c, x - 3, y - 6, 6, 2, '#2a2a3a');
      }
      const dicas = this.comDica();
      for (const p of this.placas) {
        if (p.kind === 'reset' && !dicas) continue;
        const x = p.tx * TILE, y = p.ty * TILE;
        px(c, x + 1, y + 2, 14, 13, '#1a1d29');
        let cor;
        if (p.kind === 'reset') cor = '#8a2030';
        else if (this.tipo === 'luzes') cor = p.v ? '#ffd34d' : '#3a4159';
        else if (this.tipo === 'simon') cor = p.luz > 0 || this.resolvido ? COR_SIMON[p.v] : ['#5a1a22', '#1f5a2a', '#1f4a5a', '#5a4a1a'][p.v];
        else cor = '#3a4159';
        px(c, x + 2, y + 3, 12, 11, cor);
        if (p.luz > 0 && (t & 2)) px(c, x + 2, y + 3, 12, 1, '#ffffff');
        if (this.tipo === 'luzes' && p.kind === 'n') {
          px(c, x + 7, y + 5, 2, 7, p.v ? '#fff6a0' : '#5c667e');
          px(c, x + 5, y + 7, 6, 2, p.v ? '#fff6a0' : '#5c667e');
        }
        if (this.tipo === 'runas' && p.kind === 'n') {
          const k = this.placas.filter((q) => q.kind === 'n').indexOf(p);
          this.simbolo(c, x + 3, y + 4, p.v, p.v === this.alvo[k] ? '#7fd858' : '#c8cede');
        }
        if (p.kind === 'reset') { px(c, x + 5, y + 6, 6, 1, '#ff8090'); px(c, x + 5, y + 10, 6, 1, '#ff8090'); }
        const vezes = dicas && this.dica && !this.resolvido && this.dica[this.placas.indexOf(p)];
        if (vezes) {                                           // dica: moldura piscando (e quantas vezes pisar)
          const cor = (t >> 3) & 1 ? '#ffffff' : '#5ce1ff';
          c.strokeStyle = cor; c.lineWidth = 1;
          c.strokeRect(x - 0.5, y + 0.5, 17, 16);
          if (this.tipo === 'runas') G.textoPixel(c, 'x' + vezes, x + 8, y - 2, cor, 'center', 1);
        }
      }
    }

    // 4 simbolos de 10x9: sol, lua, olho, fenda
    simbolo(c, x, y, v, cor) {
      c.fillStyle = cor;
      if (v === 0) { c.fillRect(x + 3, y + 2, 4, 5); c.fillRect(x + 4, y, 2, 9); c.fillRect(x + 1, y + 4, 8, 1); }
      else if (v === 1) { c.fillRect(x + 3, y + 1, 4, 1); c.fillRect(x + 2, y + 2, 2, 5); c.fillRect(x + 3, y + 7, 4, 1); c.fillRect(x + 6, y + 6, 2, 1); c.fillRect(x + 6, y + 2, 2, 1); }
      else if (v === 2) { c.fillRect(x + 1, y + 4, 8, 1); c.fillRect(x + 2, y + 3, 6, 3); c.fillStyle = '#16161f'; c.fillRect(x + 4, y + 3, 2, 3); }
      else { c.fillRect(x + 5, y, 1, 3); c.fillRect(x + 4, y + 3, 1, 3); c.fillRect(x + 5, y + 6, 1, 3); c.fillRect(x + 3, y + 4, 1, 1); }
    }
  }

  // cria a entidade de cada objeto de sala (chamado por loadRoom)
  G.OBJETOS = {
    sign: (o) => new Placa(o),
    fonte: (o) => new Fonte(o),
    lampiao: (o) => new Lampiao(o),
    puzzle: (o, g) => new Puzzle(o, g)
  };
})(window.AURUM = window.AURUM || {});
