/* art.js - pixel art gerada por codigo (zero assets externos).
   Tudo e desenhado uma unica vez em canvases offscreen no boot.
   Em runtime so acontece drawImage. */
(function (G) {
  'use strict';

  const mk = G.mkCanvas;
  const DARK = '#171626';

  function px(x, a, b, w, h, c) { x.fillStyle = c; x.fillRect(a, b, w, h); }

  /* ================= TILES ================= */

  const C = {
    grass: '#4b9a3e', grassD: '#3f8434', grassL: '#5cb04a',
    sand: '#ddcf99', sandD: '#c8b982',
    path: '#c9b487', pathD: '#b19d73',
    water: '#2a62c4', waterD: '#1f4a99', waterL: '#6fb2ef',
    trunk: '#6b4a2a', leafD: '#1f5e23', leaf: '#2d8330', leafL: '#46a343',
    rock: '#8a8f98', rockD: '#666b74', rockL: '#b2b7c0',
    wall: '#6a6f7d', wallD: '#3c404b', wallL: '#878d9b',
    floor: '#414759', floorD: '#363b4b', floorL: '#4d5468',
    carpet: '#9c2b3c', carpetD: '#711f2c', carpetL: '#c9455a',
    pit: '#0d0d16',
    gold: '#ffd34d', goldD: '#c79a1f'
  };

  // grama: laminas escuras e claras em tufos, sem grade visivel
  function grassBase(x, r) {
    px(x, 0, 0, 16, 16, C.grass);
    for (let i = 0; i < 10; i++) {                     // manchas suaves
      const a = (r() * 15) | 0, b = (r() * 15) | 0;
      px(x, a, b, 2, 2, r() < 0.5 ? '#479339' : '#50a042');
    }
    for (let i = 0; i < 16; i++) {                     // laminas: base escura, ponta clara
      const a = (r() * 16) | 0, b = 1 + ((r() * 15) | 0);
      px(x, a, b, 1, 1, C.grassD);
      px(x, a, b - 1, 1, 1, r() < 0.6 ? C.grassL : '#6cc35a');
    }
    if (r() < 0.35) px(x, (r() * 15) | 0, (r() * 15) | 0, 1, 1, '#d8f0a0');
  }

  // piso de masmorra: lajes com bisel, rejunte e desgaste
  function floorBase(x, r) {
    px(x, 0, 0, 16, 16, C.floorD);
    for (let k = 0; k < 4; k++) {
      const bx = (k & 1) * 8, by = (k >> 1) * 8;
      const tom = r() < 0.5 ? C.floor : '#454b5e';
      px(x, bx + 1, by + 1, 7, 7, tom);
      px(x, bx + 1, by + 1, 7, 1, C.floorL);
      px(x, bx + 1, by + 1, 1, 7, C.floorL);
      px(x, bx + 1, by + 7, 7, 1, '#30354a');
    }
    for (let i = 0; i < 6; i++) px(x, 1 + ((r() * 14) | 0), 1 + ((r() * 14) | 0), 1, 1, r() < 0.5 ? '#30354a' : '#565d74');
  }

  function tileGrass(x, r) { grassBase(x, r); }

  function tileGrassTuft(x, r) {
    grassBase(x, r);
    for (let i = 0; i < 4; i++) {
      const a = 2 + ((r() * 11) | 0), b = 3 + ((r() * 9) | 0);
      px(x, a, b, 1, 3, C.grassD);
      px(x, a + 1, b + 1, 1, 2, C.grassL);
    }
  }

  function tileFlower(x, r) {
    grassBase(x, r);
    const col = r() < 0.5 ? '#e8556d' : '#f2e35c';
    const a = 4 + ((r() * 7) | 0), b = 4 + ((r() * 7) | 0);
    px(x, a, b + 1, 1, 3, C.grassD);
    px(x, a - 1, b, 3, 1, col);
    px(x, a, b - 1, 1, 3, col);
    px(x, a, b, 1, 1, '#fff6c2');
  }

  function tileSand(x, r) {
    px(x, 0, 0, 16, 16, C.sand);
    for (let i = 0; i < 3; i++) {                      // ondulacoes
      const y = 3 + i * 5 + ((r() * 2) | 0), a = (r() * 8) | 0;
      px(x, a, y, 5 + ((r() * 4) | 0), 1, '#e9dcaa');
      px(x, a + 1, y + 1, 4, 1, C.sandD);
    }
    for (let i = 0; i < 10; i++) px(x, (r() * 16) | 0, (r() * 16) | 0, 1, 1, r() < 0.7 ? C.sandD : '#f2e8c0');
  }

  // trilha de terra com pedrinhas (sombra embaixo, brilho em cima)
  function tilePath(x, r) {
    px(x, 0, 0, 16, 16, C.path);
    for (let i = 0; i < 8; i++) px(x, (r() * 15) | 0, (r() * 15) | 0, 2, 1, '#c1ab7c');
    for (let i = 0; i < 5; i++) {
      const a = 1 + ((r() * 13) | 0), b = 1 + ((r() * 13) | 0);
      px(x, a, b, 2, 1, '#e3d3a8');
      px(x, a, b + 1, 2, 1, C.pathD);
    }
    for (let i = 0; i < 10; i++) px(x, (r() * 16) | 0, (r() * 16) | 0, 1, 1, r() < 0.6 ? C.pathD : '#ded0a9');
  }

  // agua: faixas de profundidade, ondas que andam e brilho piscando
  function tileWater(x, r, frame) {
    px(x, 0, 0, 16, 16, C.water);
    px(x, 0, 0, 16, 4, '#3070d0');
    px(x, 0, 12, 16, 4, '#2556b0');
    for (let i = 0; i < 8; i++) px(x, (r() * 16) | 0, (r() * 16) | 0, 2, 1, C.waterD);
    const off = frame * 5;
    for (let row = 0; row < 3; row++) {
      const y = 3 + row * 5;
      const xx = ((row * 6 + off) % 16);
      px(x, xx, y, 4, 1, C.waterL);
      px(x, xx + 1, y - 1, 2, 1, '#a8d8ff');
      px(x, (xx + 9) % 16, y + 2, 3, 1, C.waterL);
    }
    if (frame === 1) px(x, 4 + ((r() * 8) | 0), 6, 1, 1, '#ffffff');
  }

  // arvore: sombra no chao, tronco com casca, copa redonda com contorno, luz e folhas soltas
  function tileTree(x, r) {
    grassBase(x, r);
    px(x, 3, 13, 11, 2, 'rgba(0,0,0,0.25)');
    px(x, 6, 10, 4, 5, '#4a3018');
    px(x, 7, 10, 2, 5, C.trunk);
    px(x, 7, 11, 1, 2, '#8a6337');
    disc(x, 8, 7, 7, '#173f1a');
    disc(x, 8, 7, 6, C.leafD);
    disc(x, 8, 6, 5, C.leaf);
    disc(x, 6, 5, 3, C.leafL);
    px(x, 5, 3, 2, 1, '#6cc35a');
    for (let i = 0; i < 10; i++) {
      const a = 3 + ((r() * 10) | 0), b = 2 + ((r() * 9) | 0);
      px(x, a, b, 1, 1, r() < 0.5 ? '#236b27' : '#5cb04a');
    }
    px(x, 3, 10, 10, 1, '#1a4a1d');
  }

  // pedra: contorno escuro, face iluminada em cima a esquerda, rachaduras e sombra
  function tileRock(x, r) {
    grassBase(x, r);
    px(x, 2, 13, 12, 2, 'rgba(0,0,0,0.25)');
    px(x, 2, 4, 12, 10, '#4a4e57');
    px(x, 3, 3, 10, 1, '#4a4e57');
    px(x, 3, 4, 10, 9, C.rock);
    px(x, 4, 4, 7, 2, C.rockL);
    px(x, 3, 5, 2, 5, C.rockL);
    px(x, 5, 4, 3, 1, '#d4d8e0');
    px(x, 3, 11, 10, 2, C.rockD);
    px(x, 9, 6, 1, 3, C.rockD); px(x, 10, 8, 1, 2, C.rockD);
    for (let i = 0; i < 4; i++) px(x, 4 + ((r() * 8) | 0), 6 + ((r() * 5) | 0), 1, 1, C.rockD);
  }

  // arbusto (da para cortar): bola de folhas com contorno e frutinhas
  function tileBush(x, r) {
    grassBase(x, r);
    px(x, 2, 13, 12, 2, 'rgba(0,0,0,0.22)');
    disc(x, 8, 8, 6, '#154a1a');
    disc(x, 8, 8, 5, '#2d7a31');
    disc(x, 7, 7, 3, '#39913c');
    px(x, 5, 5, 2, 1, '#5cb04a');
    for (let i = 0; i < 8; i++) px(x, 4 + ((r() * 8) | 0), 5 + ((r() * 7) | 0), 1, 1, r() < 0.5 ? '#46a343' : '#1d5a22');
    if (r() < 0.6) { px(x, 10, 7, 1, 1, '#e84c3d'); px(x, 6, 10, 1, 1, '#e84c3d'); }
  }

  // parede de masmorra: tijolos com rejunte, luz em cima, sombra embaixo e musgo
  function tileWall(x, r) {
    px(x, 0, 0, 16, 16, '#2e323c');
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const off = row % 2 ? 4 : 0;
      for (let i = -1; i < 3; i++) {
        const bx = i * 8 + off;
        const tom = r() < 0.3 ? '#62677a' : C.wall;
        px(x, bx + 1, y + 1, 7, 3, tom);
        px(x, bx + 1, y + 1, 7, 1, C.wallL);
        px(x, bx + 1, y + 3, 7, 1, C.wallD);
      }
    }
    for (let i = 0; i < 3; i++) px(x, (r() * 15) | 0, 12 + ((r() * 3) | 0), 2, 1, '#3f6b3a');
  }

  function tileCracked(x, r) {
    tileWall(x, r);
    px(x, 7, 2, 1, 5, DARK);
    px(x, 8, 6, 1, 4, DARK);
    px(x, 6, 9, 1, 4, DARK);
    px(x, 9, 10, 2, 1, DARK);
  }

  function tileFloor(x, r) { floorBase(x, r); }

  function tileFloor2(x, r) {
    floorBase(x, r);
    px(x, 4, 5, 6, 1, C.floorD);
    px(x, 6, 9, 5, 1, C.floorD);
    px(x, 5, 6, 1, 3, C.floorD);
  }

  function tileDoor(x, r) {
    floorBase(x, r);
    px(x, 0, 0, 2, 16, C.wallD);
    px(x, 14, 0, 2, 16, C.wallD);
    px(x, 2, 0, 12, 2, '#2a2e3a');
  }

  function tileDoorLocked(x, r) {
    tileWall(x, r);
    px(x, 4, 4, 8, 9, '#6b4a2a');
    px(x, 4, 4, 8, 1, '#8a6337');
    px(x, 6, 7, 4, 4, C.gold);
    px(x, 7, 8, 2, 3, '#5a4610');
    px(x, 7, 5, 2, 3, C.goldD);
  }

  function tileStairsDown(x, r) {
    px(x, 0, 0, 16, 16, DARK);
    for (let i = 0; i < 4; i++) {
      px(x, 2 + i, 3 + i * 3, 12 - i * 2, 2, i < 2 ? '#5a6070' : '#3c414f');
      px(x, 2 + i, 3 + i * 3, 12 - i * 2, 1, '#767d8e');
    }
  }

  function tileStairsUp(x, r) {
    px(x, 0, 0, 16, 16, '#2b2f3b');
    for (let i = 0; i < 4; i++) {
      px(x, 2, 12 - i * 3, 12, 2, '#6d7484');
      px(x, 2, 12 - i * 3, 12, 1, '#98a0b2');
    }
  }

  function tileCave(x, r) {
    grassBase(x, r);
    px(x, 1, 2, 14, 13, C.rockD);
    px(x, 2, 1, 12, 3, C.rock);
    px(x, 4, 5, 8, 10, DARK);
    px(x, 5, 4, 6, 2, DARK);
    px(x, 1, 2, 2, 12, C.rockL);
  }

  function tilePit(x, r) {
    px(x, 0, 0, 16, 16, C.pit);
    px(x, 0, 0, 16, 2, '#2b2f3b');
    px(x, 0, 0, 2, 16, '#23262f');
    px(x, 14, 0, 2, 16, '#23262f');
    px(x, 0, 14, 16, 2, '#1a1c24');
  }

  function tileTorch(x, r, frame) {
    tileWall(x, r);
    px(x, 7, 8, 2, 6, '#6b4a2a');
    const h = frame ? 5 : 4;
    px(x, 6, 8 - h, 4, h + 1, '#ff8a3d');
    px(x, 7, 9 - h, 2, h, '#ffd34d');
    px(x, 7, 10 - h, 2, 2, '#fff3b0');
    px(x, 5, 6, 1, 1, frame ? '#ff8a3d' : '#ffd34d');
  }

  function tileCarpet(x, r) {
    px(x, 0, 0, 16, 16, C.carpet);
    px(x, 0, 0, 16, 1, C.carpetL);
    px(x, 0, 15, 16, 1, C.carpetD);
    for (let i = 0; i < 4; i++) px(x, 3 + i * 4, 7, 2, 2, C.goldD);
  }

  function tileBlock(x, r) {
    floorBase(x, r);
    px(x, 1, 1, 14, 14, C.rock);
    px(x, 1, 1, 14, 2, C.rockL);
    px(x, 1, 13, 14, 2, C.rockD);
    px(x, 1, 1, 2, 14, C.rockL);
    px(x, 13, 1, 2, 14, C.rockD);
    px(x, 5, 5, 6, 6, C.rockD);
    px(x, 6, 6, 4, 4, C.rock);
  }

  function tileStatue(x, r) {
    floorBase(x, r);
    px(x, 4, 12, 8, 3, C.rockD);
    px(x, 5, 4, 6, 9, C.rock);
    px(x, 5, 2, 6, 3, C.rockL);
    px(x, 6, 3, 1, 1, '#e84c3d');
    px(x, 9, 3, 1, 1, '#e84c3d');
    px(x, 4, 7, 1, 4, C.rockD);
    px(x, 11, 7, 1, 4, C.rockD);
  }

  function tileSign(x, r) {
    grassBase(x, r);
    px(x, 7, 9, 2, 6, '#6b4a2a');
    px(x, 3, 3, 10, 7, '#a2763f');
    px(x, 3, 3, 10, 1, '#c99a5c');
    px(x, 5, 5, 6, 1, '#5a4326');
    px(x, 5, 7, 4, 1, '#5a4326');
  }

  /* ---------------- pantano ---------------- */

  function bogBase(x, r) {
    px(x, 0, 0, 16, 16, '#3d5a2c');
    for (let i = 0; i < 8; i++) px(x, (r() * 15) | 0, (r() * 15) | 0, 3, 2, r() < 0.5 ? '#35502a' : '#46632f');
    for (let i = 0; i < 12; i++) {
      const a = (r() * 16) | 0, b = 1 + ((r() * 15) | 0);
      px(x, a, b, 1, 1, '#2f4722');
      px(x, a, b - 1, 1, 1, '#5c7a3c');
    }
  }
  function tileBog(x, r) { bogBase(x, r); }
  function tileBog2(x, r) {                            // juncos e taboas
    bogBase(x, r);
    for (let i = 0; i < 3; i++) {
      const a = 2 + ((r() * 11) | 0), b = 4 + ((r() * 6) | 0);
      px(x, a, b, 1, 6, '#7a8f3a');
      px(x, a, b - 2, 1, 3, '#6b4a2a');
      px(x, a + 1, b + 2, 1, 4, '#5f7430');
    }
  }
  function tileMud(x, r) {
    px(x, 0, 0, 16, 16, '#6b5a3a');
    for (let i = 0; i < 5; i++) {                      // pocas escuras com reflexo
      const a = (r() * 12) | 0, b = (r() * 13) | 0;
      px(x, a, b, 4, 2, '#54462c');
      px(x, a + 1, b, 2, 1, '#8a7650');
    }
    for (let i = 0; i < 10; i++) px(x, (r() * 16) | 0, (r() * 16) | 0, 1, 1, r() < 0.5 ? '#54462c' : '#7d6b48');
  }
  function tileSwampWater(x, r, frame) {
    px(x, 0, 0, 16, 16, '#2f4a3a');
    px(x, 0, 0, 16, 3, '#36563f');
    for (let i = 0; i < 6; i++) px(x, (r() * 15) | 0, (r() * 15) | 0, 2, 1, '#26402f');
    const off = frame * 4;
    for (let row = 0; row < 3; row++) px(x, (row * 5 + off) % 16, 3 + row * 5, 3, 1, '#4a6b4f');
    if (frame === 1) { px(x, 4 + ((r() * 8) | 0), 8, 2, 2, '#5c8a5f'); px(x, 5 + ((r() * 6) | 0), 7, 1, 1, '#9bc49c'); }
    if (frame === 2) px(x, 10, 11, 1, 1, '#9bc49c');
  }
  function tileLily(x, r, frame) {                     // vitoria-regia: da para pisar
    tileSwampWater(x, r, frame || 0);
    disc(x, 8, 8, 6, '#2f7a34');
    disc(x, 8, 8, 5, '#4fa14a');
    px(x, 8, 3, 1, 5, '#2f7a34');
    px(x, 6, 6, 2, 1, '#78c86a');
    if (r() < 0.5) { px(x, 10, 9, 2, 2, '#f08ab0'); px(x, 10, 9, 1, 1, '#ffffff'); }
  }
  function tileDeadTree(x, r) {                        // arvore seca e retorcida
    bogBase(x, r);
    px(x, 3, 13, 10, 2, 'rgba(0,0,0,0.3)');
    const tr = '#4a3a2e', trL = '#6b5a48';
    px(x, 7, 5, 3, 10, tr); px(x, 7, 6, 1, 8, trL);
    px(x, 4, 3, 3, 2, tr); px(x, 3, 1, 2, 3, tr); px(x, 6, 4, 2, 2, tr);
    px(x, 10, 4, 3, 2, tr); px(x, 12, 1, 2, 4, tr); px(x, 9, 2, 2, 3, tr);
    px(x, 8, 0, 1, 5, tr);
    px(x, 5, 9, 2, 1, tr); px(x, 10, 10, 2, 1, tr);
    px(x, 12, 1, 1, 1, '#7d8f5a');                      // musgo
  }
  function tileMushroom(x, r) {
    bogBase(x, r);
    for (let i = 0; i < 2; i++) {
      const a = 3 + ((r() * 8) | 0), b = 5 + ((r() * 6) | 0);
      const cor = r() < 0.5 ? '#b83a4a' : '#8a4ab8';
      px(x, a + 1, b + 2, 2, 3, '#e6e4d8');
      px(x, a, b, 4, 2, cor); px(x, a + 1, b - 1, 2, 1, cor);
      px(x, a + 1, b, 1, 1, '#ffffff');
    }
  }

  /* ---------------- castelo ---------------- */

  function castleFloor(x, r, xadrez) {
    px(x, 0, 0, 16, 16, '#221e2c');
    for (let k = 0; k < 4; k++) {
      const bx = (k & 1) * 8, by = (k >> 1) * 8;
      const escuro = xadrez && ((k & 1) ^ (k >> 1));
      const tom = escuro ? '#5a2a34' : (r() < 0.5 ? '#3a3448' : '#413a50');
      px(x, bx + 1, by + 1, 7, 7, tom);
      px(x, bx + 1, by + 1, 7, 1, escuro ? '#7a3a48' : '#4f4762');
      px(x, bx + 1, by + 7, 7, 1, escuro ? '#3f1c24' : '#2b2636');
    }
    for (let i = 0; i < 4; i++) px(x, 1 + ((r() * 14) | 0), 1 + ((r() * 14) | 0), 1, 1, '#2b2636');
  }
  function tileCFloor(x, r) { castleFloor(x, r, false); }
  function tileCFloor2(x, r) { castleFloor(x, r, true); }
  function tileCWall(x, r) {
    px(x, 0, 0, 16, 16, '#1c1824');
    for (let row = 0; row < 4; row++) {
      const y = row * 4, off = row % 2 ? 4 : 0;
      for (let i = -1; i < 3; i++) {
        const bx = i * 8 + off;
        px(x, bx + 1, y + 1, 7, 3, r() < 0.25 ? '#524a62' : '#4a4458');
        px(x, bx + 1, y + 1, 7, 1, '#655d78');
        px(x, bx + 1, y + 3, 7, 1, '#35303f');
      }
    }
  }
  function tileBanner(x, r) {                          // estandarte vermelho com emblema dourado
    tileCWall(x, r);
    px(x, 4, 0, 8, 1, '#c79a1f');
    px(x, 4, 1, 8, 12, '#8a1f2a');
    px(x, 5, 1, 1, 11, '#a82a38');
    px(x, 4, 13, 2, 2, '#8a1f2a'); px(x, 7, 13, 2, 2, '#8a1f2a'); px(x, 10, 13, 2, 2, '#8a1f2a');
    px(x, 7, 4, 2, 5, '#ffd34d'); px(x, 6, 5, 4, 1, '#ffd34d'); px(x, 6, 3, 1, 1, '#ffd34d'); px(x, 9, 3, 1, 1, '#ffd34d');
  }
  function tilePillar(x, r) {
    castleFloor(x, r, false);
    px(x, 2, 14, 12, 2, 'rgba(0,0,0,0.3)');
    px(x, 3, 0, 10, 2, '#8a8298');
    px(x, 4, 2, 8, 12, '#6d6680');
    px(x, 5, 2, 2, 12, '#9a92aa');
    px(x, 10, 2, 2, 12, '#4f4862');
    px(x, 3, 13, 10, 2, '#8a8298');
  }
  function tileLava(x, r, frame) {
    px(x, 0, 0, 16, 16, '#b8300f');
    for (let i = 0; i < 6; i++) px(x, (r() * 14) | 0, (r() * 14) | 0, 3, 2, '#e05a1a');
    const off = frame * 5;
    for (let row = 0; row < 3; row++) px(x, (row * 6 + off) % 16, 2 + row * 5, 4, 1, '#ffab3d');
    const bx = 3 + ((frame * 5) % 10);
    px(x, bx, 9, 2, 2, '#ffe680');
    px(x, bx, 8, 1, 1, '#fff6c0');
  }
  function tileThrone(x, r) {
    castleFloor(x, r, true);
    px(x, 3, 0, 10, 14, '#c79a1f');
    px(x, 4, 1, 8, 12, '#8a1f2a');
    px(x, 5, 2, 6, 5, '#a82a38');
    px(x, 2, 8, 12, 3, '#c79a1f');
    px(x, 3, 9, 10, 1, '#ffd34d');
    px(x, 3, 0, 2, 2, '#ffd34d'); px(x, 11, 0, 2, 2, '#ffd34d'); px(x, 7, 0, 2, 1, '#ffd34d');
    px(x, 3, 14, 10, 2, 'rgba(0,0,0,0.3)');
  }

  // portal: anel de pedra com redemoinho animado (roxo = castelo, verde = pantano)
  function tilePortal(cores) {
    return (x, r, frame) => {
      grassBase(x, r);
      disc(x, 8, 8, 7, '#4a4e57');
      disc(x, 8, 8, 6, cores[0]);
      for (let k = 0; k < 3; k++) {
        const a = frame * 2.1 + k * 2.094;
        for (let t = 0; t < 5; t++) {
          const rr = 5 - t, aa = a + t * 0.5;
          px(x, (8 + Math.cos(aa) * rr) | 0, (8 + Math.sin(aa) * rr) | 0, 1, 1, t < 2 ? cores[1] : cores[2]);
        }
      }
      px(x, 7, 7, 2, 2, '#ffffff');
    };
  }

  G.buildTiles = function () {
    const T = G.T;
    const defs = [];
    defs[T.GRASS] = [tileGrass];
    defs[T.GRASS2] = [tileGrassTuft];
    defs[T.FLOWER] = [tileFlower];
    defs[T.SAND] = [tileSand];
    defs[T.PATH] = [tilePath];
    defs[T.WATER] = [tileWater, tileWater, tileWater];
    defs[T.TREE] = [tileTree];
    defs[T.ROCK] = [tileRock];
    defs[T.BUSH] = [tileBush];
    defs[T.WALL] = [tileWall];
    defs[T.CRACKED] = [tileCracked];
    defs[T.FLOOR] = [tileFloor];
    defs[T.FLOOR2] = [tileFloor2];
    defs[T.DOOR] = [tileDoor];
    defs[T.DOOR_LOCKED] = [tileDoorLocked];
    defs[T.STAIRS_DOWN] = [tileStairsDown];
    defs[T.STAIRS_UP] = [tileStairsUp];
    defs[T.CAVE] = [tileCave];
    defs[T.PIT] = [tilePit];
    defs[T.TORCH] = [tileTorch, tileTorch];
    defs[T.CARPET] = [tileCarpet];
    defs[T.BLOCK] = [tileBlock];
    defs[T.STATUE] = [tileStatue];
    defs[T.SIGN] = [tileSign];
    defs[T.BOG] = [tileBog];
    defs[T.BOG2] = [tileBog2];
    defs[T.MUD] = [tileMud];
    defs[T.SWAMP_WATER] = [tileSwampWater, tileSwampWater, tileSwampWater];
    defs[T.LILY] = [tileLily];
    defs[T.DEAD_TREE] = [tileDeadTree];
    defs[T.MUSHROOM] = [tileMushroom];
    defs[T.CFLOOR] = [tileCFloor];
    defs[T.CFLOOR2] = [tileCFloor2];
    defs[T.CWALL] = [tileCWall];
    defs[T.BANNER] = [tileBanner];
    defs[T.PILLAR] = [tilePillar];
    defs[T.LAVA] = [tileLava, tileLava, tileLava];
    defs[T.THRONE] = [tileThrone];
    const roxo = tilePortal(['#2c1a4a', '#b45cff', '#7f3fd8']), verde = tilePortal(['#1a3a24', '#7fd858', '#3f9a4a']);
    defs[T.PORTAL] = [roxo, roxo, roxo];
    defs[T.PORTAL2] = [verde, verde, verde];

    const out = [];
    for (let id = 0; id < defs.length; id++) {
      const fns = defs[id];
      if (!fns) { out[id] = null; continue; }
      const frames = [];
      for (let f = 0; f < fns.length; f++) {
        const c = mk(16, 16);
        fns[f](c.getContext('2d'), G.mulberry32(id * 7919 + 13), f);
        frames.push(c);
      }
      // estaticos: 3 variacoes para o chao nao parecer carimbado
      if (fns.length === 1) {
        frames.variantes = [frames[0]];
        for (let v = 1; v < 3; v++) {
          const c = mk(16, 16);
          fns[0](c.getContext('2d'), G.mulberry32(id * 7919 + 13 + v * 104729), 0);
          frames.variantes.push(c);
        }
      }
      out[id] = frames;
    }
    return out;
  };

  /* ================= SPRITES ================= */

  function disc(x, cx, cy, r, col) {
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy <= r * r) px(x, cx + xx, cy + yy, 1, 1, col);
      }
    }
  }

  function drawChar(x, dir, f, p, o) {
    o = o || {};
    const P = (a, b, w, h, c) => px(x, a, b, w, h, c);
    const s = f === 1 ? 1 : 0;
    const hairD = o.hairD || p.hair;
    const bodyD = p.bodyD || p.trim;

    P(3, 15, 10, 1, 'rgba(0,0,0,0.22)');

    if (dir === 'side') {
      // pernas (largura igual a do corpo, sem contar o braco)
      P(5, 13 - s, 4, 2 + s, p.boot);
      P(9, 12 + s, 3, 3 - s, p.boot);
      // corpo
      P(5, 7, 7, 6, p.body);
      P(5, 11, 7, 1, p.trim);
      P(5, 7, 1, 6, bodyD);
      if (o.scarf) { P(5, 7, 7, 1, p.trim); P(10, 8 + (o.armY || 0), 2, 1, p.trim); }
      // braco
      P(10, 9 + (o.armY || 0), 2, 3, p.skin);
      // cabeca
      P(5, 2, 7, 5, p.skin);
      P(4, 1, 8, 2, p.hair);
      P(4, 2, 2, 4, p.hair);
      if (o.cap) { P(4, 0, 9, 2, o.cap); P(3, 1, 2, 2, o.cap); P(12, 1, 2, 1, o.cap); }
      if (o.hat) { P(2, 2, 12, 1, o.hat); P(4, 1, 8, 1, o.hat); P(5, 0, 5, 1, o.hat); }
      if (o.mask) { P(6, 6, 7, 1, o.mask); P(4, 2, 8, 1, p.trim); P(2, 2, 2, 1, p.trim); P(1, 3, 2, 1, p.trim); }
      P(9, 4, 1, 2, DARK);
      P(12, 4, 1, 2, p.skin);
      if (o.ears) { P(2, 3, 3, 1, p.skin); P(3, 4, 2, 1, p.skin); }
      if (o.coil) { P(5, 0, 2, 1, hairD); P(8, 0, 2, 1, hairD); P(4, 4, 1, 1, hairD); }
    } else if (dir === 'diagdown' || dir === 'diagup') {
      const back = dir === 'diagup';
      // pernas (passada em diagonal)
      P(4, 13 - s, 3, 2 + s, p.boot);
      P(9, 12 + s, 4, 3 - s, p.boot);
      // corpo levemente girado
      P(4, 7, 8, 6, p.body);
      P(4, 7, 1, 6, bodyD);
      P(4, 11, 8, 1, p.trim);
      if (o.scarf) { P(4, 7, 8, 1, p.trim); P(3, 8, 1, 1, p.trim); P(11, 8 + (o.armY || 0), 2, 1, p.trim); }
      // bracos
      P(3, 9, 1, 3, p.skin);
      P(11, 9 + (o.armY || 0), 2, 3, p.skin);
      // cabeca
      P(4, 2, 8, 5, p.skin);
      if (back) {
        P(4, 1, 8, 6, p.hair);
        P(11, 4, 1, 2, p.skin);
      } else {
        P(4, 1, 8, 2, p.hair);
        P(3, 2, 1, 4, p.hair);
        P(7, 4, 1, 2, DARK);
        P(10, 4, 1, 2, DARK);
        P(12, 5, 1, 1, p.skin);
        if (o.mouth) P(9, 6, 2, 1, o.mouth);
      }
      if (o.cap) { P(3, 0, 10, 2, o.cap); P(2, 1, 11, 1, o.cap); }
      if (o.hat) { P(1, 2, 13, 1, o.hat); P(3, 1, 9, 1, o.hat); P(4, 0, 6, 1, o.hat); }
      if (o.mask && !back) P(5, 6, 8, 1, o.mask);
      if (o.mask) { P(4, 2, 8, 1, p.trim); P(2, 2, 2, 1, p.trim); }
      if (o.ears) { P(1, 3, 3, 1, p.skin); P(12, 3, 3, 1, p.skin); }
      if (o.coil) { P(4, 0, 2, 1, hairD); P(8, 0, 2, 1, hairD); P(11, 2, 1, 1, hairD); }
    } else {
      // pernas
      P(4, 13 - s, 3, 2 + s, p.boot);
      P(9, 12 + s, 3, 3 - s, p.boot);
      // corpo
      P(4, 7, 8, 6, p.body);
      P(4, 11, 8, 1, p.trim);
      if (o.scarf) { P(4, 7, 8, 1, p.trim); P(3, 8, 1, 1, p.trim); P(12, 8 + (o.armY || 0), 1, 1, p.trim); }
      // bracos
      P(3, 9 + (o.armY || 0), 1, 3, p.skin);
      P(12, 9 + (o.armY || 0), 1, 3, p.skin);
      // cabeca
      P(4, 2, 8, 5, p.skin);
      if (dir === 'up') {
        P(4, 1, 8, 6, p.hair);
      } else {
        P(4, 1, 8, 2, p.hair);
        P(3, 2, 1, 3, p.hair);
        P(12, 2, 1, 3, p.hair);
        P(6, 4, 1, 2, DARK);
        P(9, 4, 1, 2, DARK);
        if (o.mouth) P(7, 6, 2, 1, o.mouth);
      }
      if (o.cap) {
        P(3, 0, 10, 2, o.cap);
        P(2, 1, 12, 1, o.cap);
        if (dir === 'up') P(3, 2, 10, 1, o.cap);
      }
      if (o.hat) {                      // chapeu de bruxo: aba larga e cone
        P(1, 2, 14, 1, o.hat);
        P(3, 1, 10, 1, o.hat);
        P(5, 0, 6, 1, o.hat);
        P(6, 0, 4, 1, o.hatD || o.hat);
      }
      if (o.mask) {                     // ninja: pano cobrindo a boca e faixa vermelha na testa
        if (dir !== 'up') P(4, 6, 8, 1, o.mask);
        P(4, 2, 8, 1, p.trim);
        if (dir === 'up') { P(7, 3, 2, 1, p.trim); P(8, 4, 1, 2, p.trim); }
      }
      if (o.ears) { P(1, 3, 3, 1, p.skin); P(12, 3, 3, 1, p.skin); P(2, 4, 2, 1, p.skin); P(12, 4, 2, 1, p.skin); }
      if (o.coil) {
        P(4, 0, 2, 1, hairD); P(7, 0, 2, 1, hairD); P(10, 0, 2, 1, hairD);
        P(3, 3, 1, 1, hairD); P(12, 3, 1, 1, hairD);
      }
    }
  }

  // Guerreiro: cavaleiro loiro de cabelo espetado, armadura prateada, peitoral
  // e capa azuis, cinto dourado. Desenho proprio (mais detalhe que drawChar).
  const KN = {
    hairL: '#ffe886', hair: '#f5c542', hairD: '#d68f1c',
    skin: '#f6cfa4', skinD: '#dba377', eye: '#1f3670',
    arm: '#dfe6f2', armM: '#a9b4ca', armD: '#6d7894',
    cape: '#2f55c8', capeD: '#1f3a8f', capeK: '#15245e',
    gold: '#ffd34d', goldD: '#c79a1f', boot: '#6b4a2a', bootD: '#3c2a17'
  };

  function drawKnight(x, dir, f, o) {
    o = o || {};
    const P = (a, b, w, h, c) => px(x, a, b, w, h, c);
    const s = f === 1 ? 1 : 0, ay = o.armY || 0, k = KN;

    P(3, 15, 10, 1, 'rgba(0,0,0,0.22)');

    if (dir === 'side') {
      // capa esvoacando atras (esquerda do sprite)
      P(3, 7, 2, 6, k.cape);
      P(2, 9 + s, 2, 4 - s, k.capeD);
      P(3, 12, 1, 1, k.capeK);
      // pernas com grevas prateadas
      P(5, 12, 3, 1, k.armM);
      P(9, 12, 2, 1, k.armM);
      P(5, 13 - s, 4, 2 + s, k.boot);
      P(9, 13 + s, 3, 2 - s, k.boot);
      P(5, 14, 4, 1, k.bootD);
      // tronco: armadura com peitoral azul e cinto
      P(5, 7, 7, 5, k.arm);
      P(5, 7, 1, 5, k.armM);
      P(8, 7, 4, 4, k.cape);
      P(8, 7, 4, 1, k.capeD);
      P(5, 11, 7, 1, k.gold);
      P(9, 11, 1, 1, k.goldD);
      // ombreira e braco
      P(6, 7, 3, 2, k.arm);
      P(6, 8, 3, 1, k.armM);
      P(7, 9 + ay, 2, 2, k.armM);
      P(7, 11 + ay, 2, 1, k.skin);
      // cabeca e cabelo espetado (nuca a esquerda, franja a direita)
      P(5, 2, 7, 5, k.skin);
      P(5, 6, 7, 1, k.skinD);
      P(4, 1, 8, 2, k.hair);
      P(4, 2, 3, 4, k.hair);
      P(5, 0, 1, 1, k.hairD); P(7, 0, 2, 1, k.hairL); P(10, 0, 1, 1, k.hair);
      P(2, 2, 1, 1, k.hairD); P(12, 1, 1, 1, k.hairD);
      P(3, 1, 1, 2, k.hairD); P(3, 4, 1, 2, k.hairD);
      P(12, 2, 1, 2, k.hair);
      P(6, 1, 4, 1, k.hairL);
      P(4, 5, 2, 1, k.hairD);
      P(9, 4, 1, 2, k.eye);
      P(11, 5, 1, 1, k.skinD);
    } else if (dir === 'diagdown' || dir === 'diagup') {
      const back = dir === 'diagup';
      P(2, 7, 2, 6, back ? k.cape : k.capeD);
      P(2, 12, 2, 1, k.capeK);
      P(4, 12, 3, 1, k.armM);
      P(9, 12, 3, 1, k.armM);
      P(4, 13 - s, 3, 2 + s, k.boot);
      P(9, 13 + s, 4, 2 - s, k.boot);
      if (back) {
        // costas: capa cobre o tronco
        P(4, 7, 8, 5, k.cape);
        P(6, 8, 1, 4, k.capeD); P(9, 8, 1, 4, k.capeD);
        P(4, 11, 8, 1, k.capeK);
        P(11, 7, 2, 2, k.arm);
        P(12, 9 + ay, 1, 2, k.armM);
      } else {
        P(4, 7, 8, 5, k.arm);
        P(4, 7, 1, 5, k.armM);
        P(6, 7, 4, 4, k.cape);
        P(6, 7, 4, 1, k.capeD);
        P(4, 11, 8, 1, k.gold);
        P(8, 11, 1, 1, k.goldD);
        P(3, 7, 2, 2, k.armM);
        P(11, 7, 2, 2, k.arm);
        P(3, 9, 1, 2, k.armM); P(3, 11, 1, 1, k.skin);
        P(12, 9 + ay, 1, 2, k.armM); P(12, 11 + ay, 1, 1, k.skin);
      }
      P(4, 2, 8, 5, k.skin);
      P(4, 6, 8, 1, k.skinD);
      if (back) {
        P(4, 1, 8, 6, k.hair);
        P(5, 2, 1, 2, k.hairL); P(8, 1, 1, 3, k.hairL);
        P(6, 4, 1, 2, k.hairD); P(9, 5, 1, 2, k.hairD);
        P(11, 4, 1, 2, k.skin);
      } else {
        P(4, 1, 8, 2, k.hair);
        P(3, 2, 2, 4, k.hair);
        P(7, 3, 1, 1, k.hair);
        P(7, 4, 1, 2, k.eye);
        P(10, 4, 1, 2, k.eye);
      }
      P(5, 0, 1, 1, k.hair); P(7, 0, 2, 1, k.hairL); P(11, 0, 1, 1, k.hairD);
      P(6, 1, 3, 1, k.hairL);
      P(3, 1, 1, 1, k.hairD); P(12, 1, 1, 1, k.hair); P(13, 1, 1, 1, k.hairD);
    } else {
      const up = dir === 'up';
      // capa: nas costas cobre tudo; de frente aparece nas laterais
      if (up) {
        P(3, 7, 10, 6, k.cape);
        P(6, 8, 1, 5, k.capeD); P(9, 8, 1, 5, k.capeD);
        P(3, 12, 10, 1, k.capeK);
      } else {
        P(2, 8, 1, 5, k.capeD); P(13, 8, 1, 5, k.capeD);
        P(2, 12, 2, 1, k.capeK); P(12, 12, 2, 1, k.capeK);
      }
      // pernas
      P(4, 12, 3, 1, k.armM);
      P(9, 12, 3, 1, k.armM);
      P(4, 13 - s, 3, 2 + s, k.boot);
      P(9, 13 + s, 3, 2 - s, k.boot);
      P(4, 14, 3, 1, k.bootD);
      if (!up) {
        // armadura, peitoral azul, cinto com fivela
        P(4, 7, 8, 5, k.arm);
        P(4, 7, 1, 5, k.armM);
        P(6, 7, 4, 4, k.cape);
        P(6, 7, 4, 1, k.capeD);
        P(4, 11, 8, 1, k.gold);
        P(7, 11, 2, 1, k.goldD);
      }
      // ombreiras e bracos
      P(3, 7, 2, 2, k.arm); P(11, 7, 2, 2, k.arm);
      P(3, 8, 2, 1, k.armM); P(11, 8, 2, 1, k.armM);
      P(3, 9 + ay, 1, 2, k.armM); P(12, 9 + ay, 1, 2, k.armM);
      if (!up) { P(3, 11 + ay, 1, 1, k.skin); P(12, 11 + ay, 1, 1, k.skin); }
      // cabeca
      P(4, 2, 8, 5, k.skin);
      P(4, 6, 8, 1, k.skinD);
      if (up) {
        P(4, 1, 8, 6, k.hair);
        P(6, 2, 1, 2, k.hairL); P(9, 1, 1, 3, k.hairL);
        P(5, 4, 1, 2, k.hairD); P(8, 4, 1, 3, k.hairD); P(10, 5, 1, 2, k.hairD);
        P(3, 2, 1, 4, k.hairD); P(12, 2, 1, 4, k.hairD);
        P(4, 7, 1, 1, k.hairD); P(11, 7, 1, 1, k.hairD);
      } else {
        P(4, 1, 8, 2, k.hair);
        P(3, 2, 1, 4, k.hair); P(12, 2, 1, 4, k.hair);
        P(5, 3, 1, 1, k.hair); P(8, 3, 2, 1, k.hair);   // franja
        P(6, 4, 1, 2, k.eye); P(9, 4, 1, 2, k.eye);
        P(2, 3, 1, 2, k.hairD); P(13, 3, 1, 2, k.hairD);
      }
      // espetos irregulares
      P(5, 0, 1, 1, k.hair); P(7, 0, 2, 1, k.hairL); P(11, 0, 1, 1, k.hairD);
      P(3, 1, 1, 1, k.hairD); P(12, 1, 1, 1, k.hair); P(13, 1, 1, 1, k.hairD);
      P(6, 1, 3, 1, k.hairL);
    }
  }

  // 8 direcoes: as quatro diagonais e os lados sao espelhados na horizontal
  const POSES = {
    down: ['down', false], up: ['up', false],
    right: ['side', false], left: ['side', true],
    downright: ['diagdown', false], downleft: ['diagdown', true],
    upright: ['diagup', false], upleft: ['diagup', true]
  };

  // vetor de avanco de cada pose, em coordenadas nao espelhadas
  const POSE_VEC = { side: [1, 0], diagdown: [1, 1], diagup: [1, -1], down: [0, 1], up: [0, -1] };

  function charSet(p, o, variant, draw) {
    const desenha = draw || ((x, pose, f, p2, o2) => drawChar(x, pose, f, p2, o2));
    const set = {};
    for (const dir in POSES) {
      const pose = POSES[dir][0], mirror = POSES[dir][1];
      set[dir] = [0, 1].map((f) => {
        const c = mk(16, 16), x = c.getContext('2d');
        if (mirror) { x.translate(16, 0); x.scale(-1, 1); }
        if (variant === 'atk') {
          // quadro 0 = preparacao (recua e ergue os bracos), quadro 1 = impacto (avanca)
          const v = POSE_VEC[pose], lean = f === 1 ? 1 : -1;
          x.translate(v[0] * lean, v[1] * lean);
          desenha(x, pose, 0, p, Object.assign({}, o, { armY: f === 1 ? 1 : -3 }));
        } else {
          desenha(x, pose, f, p, o);
        }
        return c;
      });
    }
    return set;
  }

  function bigFire() {
    return [0, 1, 2].map((f) => {
      const c = mk(16, 16), x = c.getContext('2d');
      const r = 7 - (f === 1 ? 1 : 0);
      disc(x, 8, 8, r, '#e03a12');
      disc(x, 8, 8, r - 1, '#ff6a24');
      disc(x, 8, 8, r - 3, '#ffab3d');
      disc(x, 8, 8, r - 4, '#ffe680');
      px(x, 7 + (f % 2), 6, 2, 2, '#fff6d0');
      px(x, 1 + f, 4 + f, 2, 2, '#ff8a3d');
      px(x, 13 - f, 10 - f, 2, 2, '#ff8a3d');
      px(x, 6, 14, 2, 1, '#ffab3d');
      return c;
    });
  }

  // Lamina desenhada em torno de um pivo fixo. O pivo e a BASE DO CABO (o pomo):
  // ele fica cravado na mao do personagem e so a espada acima dele inclina.
  const BLADE_STEPS = 32;
  const BLADE_CANVAS = 48, BLADE_PIVOT = 24;   // pivo no centro do canvas

  function bladeAt(angle) {
    const c = mk(BLADE_CANVAS, BLADE_CANVAS), x = c.getContext('2d');
    const cx = BLADE_PIVOT, cy = BLADE_PIVOT;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const blade = '#dfe6f2', bladeD = '#9aa6bd', hilt = '#6b4a2a', guard = '#ffd34d', pommel = '#c79a1f';

    // d = distancia a partir da base do cabo, o = deslocamento perpendicular
    const put = (d, o, size, col) => {
      const ax = cx + ca * d - sa * o;
      const ay = cy + sa * d + ca * o;
      px(x, Math.round(ax - size / 2), Math.round(ay - size / 2), size, size, col);
    };

    put(0, 0, 3, pommel);                                // pomo, em cima do pivo
    for (let d = 1; d <= 5; d++) put(d, 0, 2, hilt);      // cabo
    for (let o = -3; o <= 3; o++) put(6, o, 2, guard);    // guarda
    for (let d = 8; d <= 20; d++) {                       // lamina
      put(d, -0.6, 2, blade);
      put(d, 1.1, 1, bladeD);
    }
    put(21, 0, 2, blade);                                 // ponta
    put(22, 0, 1, blade);
    return c;
  }

  function buildBlades() {
    const out = [];
    for (let i = 0; i < BLADE_STEPS; i++) out.push(bladeAt((i / BLADE_STEPS) * Math.PI * 2));
    return out;
  }

  // ferramenta comum: desenha algo ao longo de um eixo girado, com o pivo no centro
  function rotSet(size, drawFn) {
    const pivot = size >> 1;
    const out = [];
    for (let i = 0; i < BLADE_STEPS; i++) {
      const angle = (i / BLADE_STEPS) * Math.PI * 2;
      const c = mk(size, size), x = c.getContext('2d');
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const put = (d, o, sz, col) => {
        const ax = pivot + ca * d - sa * o;
        const ay = pivot + sa * d + ca * o;
        px(x, Math.round(ax - sz / 2), Math.round(ay - sz / 2), sz, sz, col);
      };
      drawFn(put, x);
      out.push(c);
    }
    return out;
  }

  // arco do arqueiro: pivo na mao, madeira curvada para a frente e corda reta
  function buildBows() {
    return rotSet(BLADE_CANVAS, (put) => {
      const wood = '#8a5a2b', woodL = '#b9834a', cord = '#e8e4d4';
      for (let o = -7; o <= 7; o++) {
        const bulge = Math.round(Math.sqrt(Math.max(0, 49 - o * o)) * 0.55);
        put(6 + bulge, o, 2, Math.abs(o) > 5 ? woodL : wood);
      }
      for (let o = -6; o <= 6; o++) put(5, o, 1, cord);
      put(9, 0, 2, woodL);
    });
  }

  // katana do ninja: cabo escuro, guarda redonda e lamina fina levemente curva
  function buildKatanas() {
    return rotSet(BLADE_CANVAS, (put) => {
      const hilt = '#2a2436', wrap = '#c83a3a', guard = '#c79a1f', blade = '#eef2ff', bladeD = '#9aa6bd';
      for (let d = 0; d <= 5; d++) put(d, 0, 2, d % 2 ? wrap : hilt);
      for (let o = -2; o <= 2; o++) put(6, o, 1, guard);
      for (let d = 7; d <= 21; d++) {
        const curva = ((d - 7) / 14) ** 2 * -1.5;       // encurva para tras perto da ponta
        put(d, curva - 0.4, 1, blade);
        put(d, curva + 0.6, 1, bladeD);
      }
      put(22, -1.9, 1, blade);
    });
  }

  // tridente do Percy: haste de bronze 1,5x mais longa que a espada e tres pontas.
  // Canvas maior (72) para caber o alcance; o pivo continua no centro
  const TRIDENTE_CANVAS = 72;
  function buildTridentes() {
    const set = rotSet(TRIDENTE_CANVAS, (put) => {
      const haste = '#c79a1f', hasteD = '#8a6a1f', ponta = '#7ff2ff', pontaD = '#2f8fb8', brilho = '#eaffff';
      put(0, 0, 3, hasteD);                                    // pomo
      for (let d = 1; d <= 25; d++) put(d, 0, 2, d % 5 === 0 ? hasteD : haste);
      for (let o = -5; o <= 5; o++) put(26, o, 2, pontaD);     // travessa
      for (let d = 27; d <= 33; d++) put(d, 0, 2, ponta);      // ponta do meio
      put(34, 0, 1, brilho);
      for (const o of [-5, 5]) {                               // pontas dos lados
        for (let d = 27; d <= 31; d++) put(d, o, 1, ponta);
        put(32, o, 1, brilho);
        put(29, o - Math.sign(o), 1, pontaD);                  // farpa
      }
    });
    set.pivot = TRIDENTE_CANVAS >> 1;
    return set;
  }

  // estrela ninja: 4 pontas, girando
  function estrelaFrames() {
    return [0, 1].map((f) => {
      const c = mk(8, 8), x = c.getContext('2d');
      const aco = '#c8cede', escuro = '#5c667e';
      if (f === 0) {
        px(x, 3, 0, 2, 8, aco); px(x, 0, 3, 8, 2, aco);
        px(x, 3, 0, 1, 2, escuro); px(x, 6, 3, 2, 1, escuro);
      } else {
        for (let k = 0; k < 8; k++) { px(x, k, k, 1, 1, aco); px(x, 7 - k, k, 1, 1, aco); }
        px(x, 2, 2, 4, 4, aco); px(x, 0, 0, 1, 1, escuro); px(x, 7, 7, 1, 1, escuro);
      }
      px(x, 3, 3, 2, 2, '#2a2436');
      return c;
    });
  }

  // cajado do mago: haste com gema na ponta
  function buildStaves() {
    return rotSet(BLADE_CANVAS, (put) => {
      const wood = '#6b4a2a', woodL = '#8a6337', gem = '#7ff2ff', gemD = '#2f8fb8';
      for (let d = 0; d <= 15; d++) put(d, 0, 2, d % 4 === 0 ? woodL : wood);
      put(16, 0, 3, gemD);
      put(17, 0, 3, gem);
      put(18, 0, 2, '#ffffff');
      put(15, -3, 1, gemD); put(15, 3, 1, gemD);
    });
  }

  // flecha em voo, apontando para o angulo do tiro
  function buildArrows() {
    return rotSet(24, (put) => {
      const shaft = '#a2763f', head = '#c8cede', tip = '#eef2ff', fletch = '#e8e8e8';
      for (let d = -7; d <= 4; d++) put(d, 0, 2, shaft);
      put(5, 0, 2, head); put(6, 0, 2, head); put(7, 0, 1, tip);
      put(-7, -2, 1, fletch); put(-7, 2, 1, fletch);
      put(-6, -2, 1, fletch); put(-6, 2, 1, fletch);
    });
  }

  // flecha dourada da habilidade V: mesmo desenho, em ouro com ponta brilhante
  function buildGoldArrows() {
    return rotSet(24, (put) => {
      const shaft = '#e0a526', edge = '#ffd34d', head = '#fff2a8', tip = '#ffffff', fletch = '#ffcf3d';
      for (let d = -7; d <= 4; d++) put(d, 0, 2, shaft);
      for (let d = -5; d <= 3; d += 2) put(d, 0, 1, edge);
      put(5, 0, 2, head); put(6, 0, 2, head); put(7, 0, 1, tip);
      put(-7, -2, 1, fletch); put(-7, 2, 1, fletch);
      put(-6, -2, 1, fletch); put(-6, 2, 1, fletch);
    });
  }

  function batFrames() {
    return [0, 1].map((f) => {
      const c = mk(16, 16), x = c.getContext('2d');
      const wy = f ? 3 : 7;
      px(x, 1, wy, 5, 3, '#4a3163'); px(x, 10, wy, 5, 3, '#4a3163');
      px(x, 0, wy + (f ? -1 : 1), 3, 2, '#5d3f7c'); px(x, 13, wy + (f ? -1 : 1), 3, 2, '#5d3f7c');
      px(x, 6, 5, 4, 6, '#3a2550');
      px(x, 6, 4, 4, 2, '#4a3163');
      px(x, 5, 3, 2, 2, '#3a2550'); px(x, 9, 3, 2, 2, '#3a2550');
      px(x, 6, 6, 1, 2, '#ff5a5a'); px(x, 9, 6, 1, 2, '#ff5a5a');
      px(x, 6, 11, 4, 1, '#2a1a3c');
      return c;
    });
  }

  function slimeFrames(size, col, colD, colL) {
    return [0, 1].map((f) => {
      const c = mk(16, 16), x = c.getContext('2d');
      const w = size + (f ? 2 : 0), h = size - (f ? 2 : 0);
      const ox = 8 - (w >> 1), oy = 15 - h;
      px(x, ox, oy, w, h, col);
      px(x, ox + 1, oy - 1, w - 2, 2, col);
      px(x, ox, oy + h - 2, w, 2, colD);
      px(x, ox + 1, oy, 2, 3, colL);
      px(x, ox + 3, oy + 2, 2, 2, DARK);
      px(x, ox + w - 5, oy + 2, 2, 2, DARK);
      return c;
    });
  }

  function ghostFrames() {
    return [0, 1].map((f) => {
      const c = mk(16, 16), x = c.getContext('2d');
      const o = f ? 1 : 0;
      px(x, 3, 2 + o, 10, 10, 'rgba(190,210,255,0.75)');
      px(x, 4, 1 + o, 8, 2, 'rgba(220,235,255,0.8)');
      px(x, 3, 12 + o, 3, 2, 'rgba(190,210,255,0.55)');
      px(x, 7, 12 + o, 3, 3, 'rgba(190,210,255,0.55)');
      px(x, 11, 12 + o, 2, 2, 'rgba(190,210,255,0.55)');
      px(x, 5, 5 + o, 2, 3, '#22224a');
      px(x, 9, 5 + o, 2, 3, '#22224a');
      return c;
    });
  }

  function bossKing(dir, f) {
    const base = mk(16, 16), b = base.getContext('2d');
    const p = { skin: '#5f9e3a', hair: '#2e4d1c', body: '#7a2f2f', bodyD: '#5a2020', trim: '#3a1a1a', boot: '#3c2a17' };
    if (dir === 'left') { b.translate(16, 0); b.scale(-1, 1); drawChar(b, 'side', f, p, { ears: true }); }
    else drawChar(b, dir === 'right' ? 'side' : dir, f, p, { ears: true, mouth: '#2a1010' });
    const c = G.scaleCanvas(base, 2);
    const x = c.getContext('2d');
    // coroa
    px(x, 8, 0, 16, 4, '#ffd34d');
    px(x, 8, 0, 2, 2, '#fff3b0'); px(x, 15, 0, 2, 2, '#fff3b0'); px(x, 22, 0, 2, 2, '#fff3b0');
    px(x, 8, 4, 16, 1, '#c79a1f');
    px(x, 14, 1, 4, 2, '#e84c3d');
    // presas
    if (dir === 'down') { px(x, 12, 13, 2, 3, '#fff'); px(x, 18, 13, 2, 3, '#fff'); }
    // machado
    if (dir === 'right' || dir === 'left') {
      const fx = dir === 'right' ? 24 : 2;
      px(x, fx, 10, 3, 18, '#6b4a2a');
      px(x, dir === 'right' ? 22 : 4, 8, 7, 7, '#c8cede');
      px(x, dir === 'right' ? 26 : 4, 9, 3, 5, '#8f96a8');
    }
    return c;
  }

  function bossLich(dir, f) {
    const c = mk(32, 32), x = c.getContext('2d');
    const o = f ? 1 : 0;
    px(x, 8, 30 - o, 16, 2, 'rgba(0,0,0,0.25)');
    // manto
    px(x, 6, 10 + o, 20, 18, '#2c2350');
    px(x, 8, 8 + o, 16, 4, '#3b2f6b');
    px(x, 6, 26 + o, 20, 2, '#1d1738');
    for (let i = 0; i < 4; i++) px(x, 7 + i * 5, 28 + o, 4, 2, '#2c2350');
    // capuz
    px(x, 9, 3 + o, 14, 10, '#453a7d');
    px(x, 11, 1 + o, 10, 3, '#453a7d');
    px(x, 11, 6 + o, 10, 7, '#12101f');
    if (dir !== 'up') {
      px(x, 13, 8 + o, 3, 3, '#7ff2ff');
      px(x, 18, 8 + o, 3, 3, '#7ff2ff');
      px(x, 14, 9 + o, 1, 1, '#fff');
      px(x, 19, 9 + o, 1, 1, '#fff');
    }
    // maos / cajado
    px(x, 4, 14 + o, 3, 4, '#cfc9e8');
    px(x, 25, 14 + o, 3, 4, '#cfc9e8');
    px(x, 26, 6 + o, 2, 20, '#4a3a2a');
    px(x, 24, 2 + o, 6, 6, '#b45cff');
    px(x, 26, 4 + o, 2, 2, '#f0d8ff');
    return c;
  }

  /* ---------------- inimigos e chefes novos ---------------- */

  // amplia cada quadro de um conjunto de direcoes (golem, chefes)
  function escalaSet(set, f) {
    const out = {};
    for (const d in set) out[d] = set[d].map((c) => G.scaleCanvas(c, f));
    return out;
  }

  // machado girando (arremessado): 4 quadros, 90 graus cada
  function axeFrames() {
    return [0, 1, 2, 3].map((f) => {
      const c = mk(10, 10), x = c.getContext('2d');
      x.translate(5, 5); x.rotate(f * Math.PI / 2); x.translate(-5, -5);
      px(x, 4, 1, 2, 8, '#6b4a2a');
      px(x, 5, 1, 4, 4, '#c8cede');
      px(x, 8, 1, 1, 4, '#eef2ff');
      px(x, 5, 4, 3, 1, '#8f96a8');
      return c;
    });
  }

  // bomba com pavio aceso
  function bombFrames() {
    return [0, 1].map((f) => {
      const c = mk(8, 9), x = c.getContext('2d');
      disc(x, 4, 5, 3, '#23232e');
      px(x, 3, 3, 1, 1, '#5a5a6e');
      px(x, 4, 1, 1, 2, '#8a6337');
      px(x, 3 + f, 0, 2, 1, f ? '#ffd34d' : '#ff6a24');
      return c;
    });
  }

  // aranha: corpo escuro, oito pernas que alternam, olhos vermelhos
  function spiderFrames() {
    return [0, 1].map((f) => {
      const c = mk(12, 10), x = c.getContext('2d');
      px(x, 2, 9, 8, 1, 'rgba(0,0,0,0.25)');
      const leg = '#1d1a24';
      for (let k = 0; k < 4; k++) {
        const y = 2 + k * 2 - (((k + f) & 1) ? 1 : 0);
        px(x, 0, y, 3, 1, leg); px(x, 9, y, 3, 1, leg);
        px(x, 0, y + 1, 1, 1, leg); px(x, 11, y + 1, 1, 1, leg);
      }
      px(x, 3, 2, 6, 6, '#2c2638'); px(x, 4, 1, 4, 1, '#2c2638');
      px(x, 4, 3, 4, 2, '#4a3f63');
      px(x, 5, 2, 1, 1, '#8a1f2a'); px(x, 6, 2, 1, 1, '#8a1f2a');
      px(x, 4, 6, 1, 1, '#ff4d4d'); px(x, 7, 6, 1, 1, '#ff4d4d');
      return c;
    });
  }

  // chefe GROK: goblin machadeiro gigante, elmo com chifres e machado duplo
  function bossGrok(dir, f) {
    const base = mk(16, 16), b = base.getContext('2d');
    const p = { skin: '#5f9e3a', hair: '#2e4d1c', body: '#8a2f2f', bodyD: '#6a2020', trim: '#c79a1f', boot: '#3c2a17' };
    if (dir === 'left') { b.translate(16, 0); b.scale(-1, 1); drawChar(b, 'side', f, p, { ears: true }); }
    else drawChar(b, dir === 'right' ? 'side' : dir, f, p, { ears: true, mouth: '#2a1010' });
    const c = G.scaleCanvas(base, 2), x = c.getContext('2d');
    // elmo e chifres
    px(x, 8, 0, 16, 5, '#8f96a8'); px(x, 8, 4, 16, 1, '#5c667e'); px(x, 10, 1, 12, 1, '#c8cede');
    px(x, 3, 0, 5, 2, '#e6e4d8'); px(x, 2, 2, 3, 2, '#e6e4d8');
    px(x, 24, 0, 5, 2, '#e6e4d8'); px(x, 27, 2, 3, 2, '#e6e4d8');
    if (dir === 'down') { px(x, 12, 13, 2, 3, '#fff'); px(x, 18, 13, 2, 3, '#fff'); }
    // machado de duas laminas
    const ax = dir === 'left' ? 1 : 25;
    px(x, ax + 2, 6, 2, 22, '#6b4a2a');
    px(x, ax - 1, 6, 8, 7, '#c8cede');
    px(x, ax - 1, 8, 1, 3, '#eef2ff'); px(x, ax + 6, 8, 1, 3, '#eef2ff');
    px(x, ax, 12, 6, 1, '#8f96a8');
    return c;
  }

  // chefe TROLL: grande, pele verde-acinzentada, presas e clava
  function bossTroll(dir, f) {
    const base = mk(16, 16), b = base.getContext('2d');
    const p = { skin: '#7d8f5a', hair: '#4f5f38', body: '#6b4a2a', bodyD: '#4a3018', trim: '#3a2a14', boot: '#5d6e44' };
    if (dir === 'left') { b.translate(16, 0); b.scale(-1, 1); drawChar(b, 'side', f, p, { ears: true }); }
    else drawChar(b, dir === 'right' ? 'side' : dir, f, p, { ears: true, mouth: '#2a1010' });
    const c = G.scaleCanvas(base, 2), x = c.getContext('2d');
    if (dir === 'down') {
      px(x, 11, 12, 2, 3, '#f2ecd0'); px(x, 19, 12, 2, 3, '#f2ecd0');
      px(x, 12, 8, 2, 2, '#ffd34d'); px(x, 18, 8, 2, 2, '#ffd34d');
    }
    px(x, 9, 18, 14, 2, '#4a3018');                        // cinto de corda
    // clava
    const cx = dir === 'left' ? 0 : 26;
    px(x, cx + 2, 12, 3, 16, '#6b4a2a');
    px(x, cx, 6, 7, 8, '#8a6337');
    px(x, cx + 1, 7, 2, 2, '#a2763f');
    px(x, cx + 4, 10, 2, 2, '#4a3018');
    return c;
  }

  // chefe ARQUIMAGO: manto carmesim com dourado, olhos de brasa e cajado de fogo
  function bossArquimago(dir, f) {
    const c = mk(32, 32), x = c.getContext('2d');
    const o = f ? 1 : 0;
    px(x, 8, 30 - o, 16, 2, 'rgba(0,0,0,0.25)');
    px(x, 6, 10 + o, 20, 18, '#6b1f2a');
    px(x, 8, 8 + o, 16, 4, '#8a2a38');
    px(x, 6, 26 + o, 20, 2, '#3a1018');
    px(x, 15, 12 + o, 2, 14, '#ffd34d');                   // faixa dourada
    for (let i = 0; i < 4; i++) px(x, 7 + i * 5, 28 + o, 4, 2, '#6b1f2a');
    px(x, 9, 3 + o, 14, 10, '#8a2a38');
    px(x, 11, 0 + o, 10, 4, '#8a2a38');
    px(x, 14, 0 + o, 4, 1, '#ffd34d');
    px(x, 11, 6 + o, 10, 7, '#1a0a10');
    if (dir !== 'up') {
      px(x, 13, 8 + o, 3, 2, '#ff8a3d'); px(x, 18, 8 + o, 3, 2, '#ff8a3d');
      px(x, 14, 8 + o, 1, 1, '#fff3b0'); px(x, 19, 8 + o, 1, 1, '#fff3b0');
      px(x, 13, 11 + o, 6, 1, '#cfc9b4');                   // barba
    }
    px(x, 4, 14 + o, 3, 4, '#e3b184');
    px(x, 25, 14 + o, 3, 4, '#e3b184');
    px(x, 26, 4 + o, 2, 22, '#4a3a2a');
    px(x, 24, 0 + o, 6, 6, '#ff6a24');
    px(x, 25, 1 + o, 4, 4, '#ffd34d');
    px(x, 26, 2 + o, 2, 2, '#fff3b0');
    return c;
  }

  /* ---------------- pantano e castelo: sprites ---------------- */

  // sapo: agachado (0) e pulando (1)
  function sapoFrames(corpo, escuro, claro, grande) {
    const k = grande ? 2 : 1;
    return [0, 1].map((f) => {
      const c = mk(12, 10), x = c.getContext('2d');
      px(x, 1, 9, 10, 1, 'rgba(0,0,0,0.25)');
      const y = f ? -1 : 0;
      px(x, 1, 4 + y, 10, 5, escuro);
      px(x, 2, 3 + y, 8, 5, corpo);
      px(x, 3, 3 + y, 5, 2, claro);
      px(x, 2, 1 + y, 3, 3, corpo); px(x, 7, 1 + y, 3, 3, corpo);        // olhos saltados
      px(x, 3, 2 + y, 1, 1, '#1a1a1a'); px(x, 8, 2 + y, 1, 1, '#1a1a1a');
      px(x, 3, 6 + y, 6, 1, '#e6c878');                                    // papo
      if (f) { px(x, 0, 6, 2, 3, escuro); px(x, 10, 6, 2, 3, escuro); }    // pernas esticadas
      else { px(x, 1, 7, 2, 2, escuro); px(x, 9, 7, 2, 2, escuro); }
      return k > 1 ? G.scaleCanvas(c, k) : c;
    });
  }

  // mosquito gigante: asas batendo
  function mosquitoFrames() {
    return [0, 1].map((f) => {
      const c = mk(10, 8), x = c.getContext('2d');
      px(x, 3, 3, 4, 3, '#4a3a2a'); px(x, 4, 4, 2, 1, '#8a6337');
      px(x, 7, 4, 3, 1, '#2a2020');                                        // ferrao
      px(x, 2, 3, 1, 1, '#e84c3d');
      const a = f ? 0 : 1;
      px(x, 1, a, 3, 2, 'rgba(220,240,255,0.8)'); px(x, 6, a, 3, 2, 'rgba(220,240,255,0.8)');
      px(x, 3, 6, 1, 2, '#2a2020'); px(x, 6, 6, 1, 2, '#2a2020');
      return c;
    });
  }

  // gargula: parada como estatua (0) e voando (1, 2)
  function gargulaFrames() {
    return [0, 1, 2].map((f) => {
      const c = mk(16, 14), x = c.getContext('2d');
      const pedra = '#6d6680', escura = '#4f4862', clara = '#9a92aa';
      if (f === 0) {
        px(x, 3, 12, 10, 2, '#3a3448');                                   // pedestal
        px(x, 1, 3, 3, 8, escura); px(x, 12, 3, 3, 8, escura);            // asas fechadas
      } else {
        const up = f === 1 ? 0 : 3;
        px(x, 0, 2 + up, 5, 3, escura); px(x, 11, 2 + up, 5, 3, escura);  // asas abertas
        px(x, 0, 1 + up, 2, 1, clara); px(x, 14, 1 + up, 2, 1, clara);
      }
      px(x, 4, 4, 8, 8, pedra); px(x, 5, 4, 3, 3, clara);
      px(x, 4, 1, 3, 3, pedra); px(x, 9, 1, 3, 3, pedra);                // chifres
      px(x, 5, 6, 2, 1, f ? '#ff4d4d' : '#3a3448'); px(x, 9, 6, 2, 1, f ? '#ff4d4d' : '#3a3448');
      px(x, 6, 9, 4, 1, escura);
      return c;
    });
  }

  // foice girando (Rei Sombrio)
  function foiceFrames() {
    return [0, 1, 2, 3].map((f) => {
      const c = mk(12, 12), x = c.getContext('2d');
      x.translate(6, 6); x.rotate(f * Math.PI / 2); x.translate(-6, -6);
      px(x, 5, 3, 1, 8, '#3a2a2a');
      px(x, 2, 1, 7, 2, '#b45cff'); px(x, 1, 2, 2, 3, '#b45cff');
      px(x, 3, 1, 5, 1, '#f0d8ff');
      return c;
    });
  }

  // chefe REI SAPO: sapo enorme de coroa
  function bossReiSapo(dir, f) {
    const c = mk(32, 28), x = c.getContext('2d');
    const base = sapoFrames('#5a8a3a', '#3a6a28', '#8ac05a', false)[f];
    x.drawImage(G.scaleCanvas(base, 2), 4, 6);
    px(x, 11, 2, 10, 4, '#ffd34d'); px(x, 11, 0, 2, 2, '#ffd34d'); px(x, 15, 0, 2, 2, '#ffd34d'); px(x, 19, 0, 2, 2, '#ffd34d');
    px(x, 14, 3, 4, 2, '#e84c3d');
    return c;
  }

  // chefe REI SOMBRIO: armadura negra e roxa, capa vermelha, coroa, olhos em brasa
  function bossReiSombrio(dir, f) {
    const c = mk(32, 32), x = c.getContext('2d');
    const o = f ? 1 : 0;
    px(x, 8, 30 - o, 16, 2, 'rgba(0,0,0,0.3)');
    px(x, 4, 10 + o, 24, 18, '#6b1f2a');                                  // capa
    px(x, 4, 26 + o, 24, 2, '#3f1018');
    px(x, 8, 10 + o, 16, 16, '#2a2436');                                  // armadura
    px(x, 9, 11 + o, 14, 3, '#453a5a');
    px(x, 14, 14 + o, 4, 8, '#b45cff');                                   // gema no peito
    px(x, 15, 15 + o, 1, 2, '#f0d8ff');
    px(x, 5, 10 + o, 5, 4, '#453a5a'); px(x, 22, 10 + o, 5, 4, '#453a5a'); // ombreiras
    px(x, 10, 26 + o, 4, 4, '#1c1824'); px(x, 18, 26 + o, 4, 4, '#1c1824');
    px(x, 10, 2 + o, 12, 9, '#2a2436');                                    // elmo
    px(x, 11, 5 + o, 10, 3, '#0c0a10');
    if (dir !== 'up') { px(x, 12, 6 + o, 3, 1, '#ff6a24'); px(x, 17, 6 + o, 3, 1, '#ff6a24'); }
    px(x, 10, 0 + o, 12, 3, '#ffd34d');                                    // coroa
    px(x, 10, 0 + o, 2, 1, '#fff3b0'); px(x, 15, 0 + o, 2, 1, '#fff3b0'); px(x, 20, 0 + o, 2, 1, '#fff3b0');
    px(x, 15, 1 + o, 2, 1, '#e84c3d');
    // espada larga
    const sx = dir === 'left' ? 1 : 27;
    px(x, sx + 1, 4 + o, 2, 20, '#c8cede'); px(x, sx + 1, 4 + o, 1, 20, '#eef2ff');
    px(x, sx - 1, 22 + o, 6, 2, '#ffd34d'); px(x, sx + 1, 24 + o, 2, 4, '#4a3a2a');
    return c;
  }

  function projArrow() {
    const right = mk(16, 16), r = right.getContext('2d');
    px(r, 2, 7, 12, 2, '#a2763f');
    px(r, 12, 6, 4, 4, '#c8cede');
    px(r, 14, 7, 2, 2, '#eef2ff');
    px(r, 1, 5, 2, 6, '#e8e8e8');
    const left = mk(16, 16), l = left.getContext('2d');
    l.translate(16, 0); l.scale(-1, 1); l.drawImage(right, 0, 0);
    const down = mk(16, 16), d = down.getContext('2d');
    d.translate(8, 8); d.rotate(Math.PI / 2); d.translate(-8, -8); d.drawImage(right, 0, 0);
    const up = mk(16, 16), u = up.getContext('2d');
    u.translate(8, 8); u.rotate(-Math.PI / 2); u.translate(-8, -8); u.drawImage(right, 0, 0);
    return { up, down, left, right };
  }

  function orbFrames(a, b, cc) {
    return [0, 1].map((f) => {
      const c = mk(10, 10), x = c.getContext('2d');
      const s = f ? 0 : 1;
      px(x, 2 - s, 2 - s, 6 + s * 2, 6 + s * 2, a);
      px(x, 3, 3, 4, 4, b);
      px(x, 4, 4, 2, 2, cc);
      px(x, 1, 4, 1, 2, a); px(x, 8, 4, 1, 2, a);
      px(x, 4, 1, 2, 1, a); px(x, 4, 8, 2, 1, a);
      return c;
    });
  }

  function coinFrames() {
    const w = [8, 6, 3, 6];
    return w.map((ww) => {
      const c = mk(8, 8), x = c.getContext('2d');
      const ox = (8 - ww) >> 1;
      px(x, ox, 1, ww, 6, '#ffd34d');
      px(x, ox, 2, ww, 1, '#fff3b0');
      px(x, ox, 6, ww, 1, '#c79a1f');
      if (ww > 4) px(x, ox + 2, 3, ww - 4, 2, '#c79a1f');
      return c;
    });
  }

  function heartSprite(fill) {
    const c = mk(8, 8), x = c.getContext('2d');
    const red = '#e33b4e', dark = '#7d1526', light = '#ff8090';
    const draw = (col, x0, w) => {
      const rects = [[1, 1, 2, 1], [5, 1, 2, 1], [0, 2, 8, 2], [1, 4, 6, 1], [2, 5, 4, 1], [3, 6, 2, 1]];
      rects.forEach(([a, b, ww, hh]) => {
        const s = Math.max(0, Math.min(a + ww, x0 + w) - Math.max(a, x0));
        if (s > 0) px(x, Math.max(a, x0), b, s, hh, col);
      });
    };
    draw('#3a1220', 0, 8);
    if (fill > 0) draw(red, 0, fill === 1 ? 4 : 8);
    if (fill > 0) { px(x, 1, 2, 2, 1, light); }
    px(x, 0, 2, 1, 2, dark); px(x, 7, 2, 1, 2, dark);
    return c;
  }

  function keySprite() {
    const c = mk(8, 8), x = c.getContext('2d');
    px(x, 1, 1, 4, 4, '#ffd34d');
    px(x, 2, 2, 2, 2, '#8a6a12');
    px(x, 4, 4, 2, 4, '#ffd34d');
    px(x, 6, 5, 2, 1, '#ffd34d');
    px(x, 6, 7, 2, 1, '#ffd34d');
    px(x, 1, 1, 4, 1, '#fff3b0');
    return c;
  }

  function containerSprite() {
    const c = mk(16, 16), x = c.getContext('2d');
    x.drawImage(G.scaleCanvas(heartSprite(2), 2), 0, 0);
    px(x, 0, 2, 2, 4, '#ffd34d'); px(x, 14, 2, 2, 4, '#ffd34d');
    px(x, 6, 0, 4, 2, '#ffd34d'); px(x, 6, 14, 4, 2, '#ffd34d');
    return c;
  }

  function shardSprite() {
    const c = mk(14, 14), x = c.getContext('2d');
    for (let i = 0; i < 7; i++) px(x, 6 - i, 12 - i * 2, 2 + i * 2, 2, '#ffd34d');
    for (let i = 0; i < 7; i++) px(x, 6 - i, 12 - i * 2, 1, 2, '#fff3b0');
    px(x, 5, 10, 4, 2, '#c79a1f');
    return c;
  }

  function chestSprites() {
    const mkc = (open) => {
      const c = mk(16, 16), x = c.getContext('2d');
      px(x, 2, 15, 12, 1, 'rgba(0,0,0,0.25)');
      px(x, 2, 7, 12, 8, '#8a5a2b');
      px(x, 2, 7, 12, 1, '#a2763f');
      px(x, 2, 13, 12, 2, '#5f3d1c');
      if (open) {
        px(x, 2, 2, 12, 4, '#6b4a2a');
        px(x, 3, 8, 10, 4, '#ffd34d');
        px(x, 4, 9, 8, 1, '#fff3b0');
      } else {
        px(x, 2, 4, 12, 5, '#a2763f');
        px(x, 2, 4, 12, 1, '#c99a5c');
        px(x, 6, 7, 4, 4, '#ffd34d');
        px(x, 7, 8, 2, 2, '#5a4610');
      }
      px(x, 6, 7, 1, 6, '#5f3d1c');
      px(x, 9, 7, 1, 6, '#5f3d1c');
      return c;
    };
    return [mkc(false), mkc(true)];
  }

  function portalFrames() {
    return [0, 1, 2].map((f) => {
      const c = mk(16, 16), x = c.getContext('2d');
      for (let i = 0; i < 4; i++) {
        const rr = 7 - i * 1.6 + (f * 0.6);
        x.fillStyle = ['#b45cff', '#7ff2ff', '#ffffff', '#5aa7ff'][i];
        x.beginPath(); x.arc(8, 8, Math.max(1, rr), 0, Math.PI * 2); x.fill();
      }
      return c;
    });
  }

  G.buildSprites = function () {
    const knightDraw = (x, pose, f, p, o) => drawKnight(x, pose, f, o);
    const hero = charSet(null, {}, null, knightDraw);
    const heroAtk = charSet(null, {}, 'atk', knightDraw);

    // arqueiro: pele clara, cabelo preto, sem capuz, roupa preta
    const archerPal = {
      skin: '#e3b184', hair: '#14121a', body: '#2b2b34', bodyD: '#1b1b22',
      trim: '#4d5165', boot: '#15151b'
    };
    const archerOpt = { scarf: true, hairD: '#2e2c3a' };

    // mago: manto roxo, chapeu de aba larga, cabelo grisalho
    const magePal = {
      skin: '#6e4529', hair: '#cfc9b4', body: '#5b3f8a', bodyD: '#44306b',
      trim: '#ffd34d', boot: '#2f2150'
    };
    const mageOpt = { hat: '#4a2f7a', hatD: '#33205a', scarf: true };

    // ninja: roupa preta, capuz, pano no rosto e faixa vermelha
    const ninjaPal = {
      skin: '#e3b184', hair: '#14121a', body: '#1f2230', bodyD: '#14161f',
      trim: '#c83a3a', boot: '#14161f'
    };
    const ninjaOpt = { mask: '#1f2230', scarf: true };

    // Percy: cabelo preto bagunçado, camiseta laranja, calca jeans
    const percyPal = {
      skin: '#e3b184', hair: '#14121a', body: '#ff8a3d', bodyD: '#d86a24',
      trim: '#2f6fb8', boot: '#3a4a6b'
    };
    const percyOpt = { coil: true, hairD: '#2e2c3a' };

    // bomber: gorro de aviador marrom, roupa verde-oliva e cinto amarelo
    const bomberPal = {
      skin: '#e3b184', hair: '#c8541a', body: '#6b7a3a', bodyD: '#4f5a2a',
      trim: '#ffd34d', boot: '#2a2418'
    };
    const bomberOpt = { cap: '#5c3a1a', scarf: true };
    const goblin = charSet(
      { skin: '#6fae3f', hair: '#2f4a1c', body: '#8a5a2b', bodyD: '#6b4a2a', trim: '#4a3018', boot: '#3c2a17' },
      { ears: true, mouth: '#2a1010' }
    );
    const archer = charSet(
      { skin: '#8fbf4f', hair: '#3a2a4a', body: '#5b3f8a', bodyD: '#44306b', trim: '#2f2150', boot: '#3c2a17' },
      { ears: true }
    );
    const skeleton = charSet(
      { skin: '#e6e4d8', hair: '#cfcbb8', body: '#b9b5a4', bodyD: '#98947f', trim: '#7a7666', boot: '#6b6757' },
      {}
    );
    // novos: goblin machadeiro, goblin xama, cacador (arqueiro humano), goblin bombardeiro, golem
    const machadeiro = charSet(
      { skin: '#5f9e3a', hair: '#2e4d1c', body: '#8a2f2f', bodyD: '#6a2020', trim: '#3a1a1a', boot: '#3c2a17' },
      { ears: true, mouth: '#2a1010' }
    );
    const xama = charSet(
      { skin: '#7fb84a', hair: '#2e4d1c', body: '#4a2f6b', bodyD: '#35204f', trim: '#ffd34d', boot: '#2f2150' },
      { ears: true, hat: '#6b2f7a', hatD: '#4a1f5a' }
    );
    const cacador = charSet(
      { skin: '#d9a066', hair: '#3a2a1a', body: '#4a6b2f', bodyD: '#3a5224', trim: '#2a3a1a', boot: '#3a2a1a' },
      { cap: '#2f4a1c' }
    );
    const bombardeiro = charSet(
      { skin: '#6fae3f', hair: '#2f4a1c', body: '#5c5c66', bodyD: '#44444c', trim: '#c85a1a', boot: '#3c2a17' },
      { ears: true, cap: '#c85a1a' }
    );
    const golem = escalaSet(charSet(
      { skin: '#9aa0a8', hair: '#6d737c', body: '#7d838c', bodyD: '#5c6169', trim: '#3f444b', boot: '#4a4f57' },
      { cap: '#8a9098', mouth: '#ff6a24' }
    ), 2);
    // pantano e castelo
    const bruxa = charSet(
      { skin: '#8aa87a', hair: '#2a2a2a', body: '#3f5a3a', bodyD: '#2f4a2a', trim: '#6b2f7a', boot: '#2a2a2a' },
      { hat: '#2f3a2a', hatD: '#1f2a1a', mouth: '#2a1010' }
    );
    const lanceiro = charSet(
      { skin: '#e3b184', hair: '#8f96a8', body: '#5a4a6b', bodyD: '#453a55', trim: '#c79a1f', boot: '#2f2a3a' },
      { cap: '#8f96a8' }
    );
    const besteiro = charSet(
      { skin: '#d9a066', hair: '#3a2a1a', body: '#8a1f2a', bodyD: '#6b1720', trim: '#c79a1f', boot: '#2f2a3a' },
      { cap: '#5a4a6b' }
    );
    const feiticeiro = charSet(
      { skin: '#c8b8d8', hair: '#e6e4d8', body: '#1c1824', bodyD: '#0c0a10', trim: '#b45cff', boot: '#1c1824' },
      { hat: '#2a2436', hatD: '#1c1824' }
    );
    const cavNegro = escalaSet(charSet(
      { skin: '#2a2436', hair: '#1c1824', body: '#2a2436', bodyD: '#1c1824', trim: '#e84c3d', boot: '#1c1824' },
      { cap: '#453a5a', mouth: '#e84c3d' }
    ), 2);
    const knight = charSet(
      { skin: '#c8cede', hair: '#8f96a8', body: '#5c667e', bodyD: '#454e63', trim: '#2f3644', boot: '#2f3644' },
      { cap: '#8f96a8' }
    );

    const kingSet = {};
    ['down', 'up', 'left', 'right'].forEach((d) => { kingSet[d] = [bossKing(d, 0), bossKing(d, 1)]; });
    const grokSet = {}, trollSet = {}, arquiSet = {};
    ['down', 'up', 'left', 'right'].forEach((d) => {
      grokSet[d] = [bossGrok(d, 0), bossGrok(d, 1)];
      trollSet[d] = [bossTroll(d, 0), bossTroll(d, 1)];
      arquiSet[d] = [bossArquimago(d, 0), bossArquimago(d, 1)];
    });
    const reiSapoSet = {}, reiSombrioSet = {};
    ['down', 'up', 'left', 'right'].forEach((d) => {
      reiSapoSet[d] = [bossReiSapo(d, 0), bossReiSapo(d, 1)];
      reiSombrioSet[d] = [bossReiSombrio(d, 0), bossReiSombrio(d, 1)];
    });
    const lichSet = {};
    ['down', 'up', 'left', 'right'].forEach((d) => { lichSet[d] = [bossLich(d, 0), bossLich(d, 1)]; });

    return {
      hero, heroAtk, goblin, archer, skeleton, knight,
      heroes: {
        guerreiro: { walk: hero, atk: heroAtk },
        arqueiro: { walk: charSet(archerPal, archerOpt), atk: charSet(archerPal, archerOpt, 'atk') },
        mago: { walk: charSet(magePal, mageOpt), atk: charSet(magePal, mageOpt, 'atk') },
        ninja: { walk: charSet(ninjaPal, ninjaOpt), atk: charSet(ninjaPal, ninjaOpt, 'atk') },
        percy: { walk: charSet(percyPal, percyOpt), atk: charSet(percyPal, percyOpt, 'atk') },
        bomber: { walk: charSet(bomberPal, bomberOpt), atk: charSet(bomberPal, bomberOpt, 'atk') }
      },
      katana: buildKatanas(), estrela: estrelaFrames(), tridente: buildTridentes(),
      blade: buildBlades(), bladeSteps: BLADE_STEPS, bladePivot: BLADE_PIVOT,
      bow: buildBows(), staff: buildStaves(), shaft: buildArrows(), goldShaft: buildGoldArrows(),
      iceorb: orbFrames('#7ff2ff', '#2f8fb8', '#eaffff'),
      spark: orbFrames('#ffe680', '#ffab3d', '#ffffff'),
      king: kingSet, lich: lichSet,
      machadeiro, xama, cacador, bombardeiro, golem,
      grok: grokSet, troll: trollSet, arquimago: arquiSet,
      machado: axeFrames(), bomba: bombFrames(), aranha: spiderFrames(),
      bruxa, lanceiro, besteiro, feiticeiro, cavNegro,
      reiSapo: reiSapoSet, reiSombrio: reiSombrioSet,
      sapo: sapoFrames('#5a9a3a', '#3a6a28', '#8ac05a', false),
      mosquito: mosquitoFrames(), gargula: gargulaFrames(), foice: foiceFrames(),
      veneno: orbFrames('#7fd858', '#3f8a2a', '#e0ffc0'),
      bat: batFrames(),
      slime: slimeFrames(12, '#4ec96b', '#2f9149', '#a8f5bc'),
      slimeS: slimeFrames(7, '#6fd9f0', '#2f91a1', '#c8f7ff'),
      ghost: ghostFrames(),
      arrow: projArrow(),
      fireball: orbFrames('#ff8a3d', '#ffd34d', '#fff3b0'),
      bigfire: bigFire(),
      darkorb: orbFrames('#b45cff', '#7f3fd8', '#f0d8ff'),
      rock: orbFrames('#8a8f98', '#666b74', '#b2b7c0'),
      coin: coinFrames(),
      heart: heartSprite(2),
      heartHud: [heartSprite(0), heartSprite(1), heartSprite(2)],
      key: keySprite(),
      container: containerSprite(),
      shard: shardSprite(),
      chest: chestSprites(),
      portal: portalFrames()
    };
  };
})(window.AURUM = window.AURUM || {});
