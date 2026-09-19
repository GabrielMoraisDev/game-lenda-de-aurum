/* historia.js - abertura cinematografica: cenas desenhadas por codigo, legenda
   digitada e a trilha "historia". ENTER pula tudo, J avanca uma cena.
   Tambem conta o final, quando os dezesseis fragmentos voltam. */
(function (G) {
  'use strict';

  const W = G.VIEW_W, H = G.VIEW_H + G.HUD_H;
  const Sound = G.Sound;
  const TOPO = 14, ARTE = 160;                 // faixa preta de cima e altura da area desenhada
  const CX = W / 2, CY = 84;
  const FADE = 30, LETRA = 0.55;               // quadros de fade e letras por quadro

  function px(c, x, y, w, h, cor) { c.fillStyle = cor; c.fillRect(x | 0, y | 0, w, h); }
  function disco(c, cx, cy, r, cor) {
    c.fillStyle = cor;
    for (let y = -r; y <= r; y++) {
      const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
      c.fillRect((cx - w) | 0, (cy + y) | 0, w * 2 + 1, 1);
    }
  }

  // quebra o texto em linhas de ate `max` letras
  G.quebraTexto = function (s, max) {
    const out = [];
    let l = '';
    for (const p of s.split(' ')) {
      if ((l + ' ' + p).trim().length > max) { out.push(l); l = p; } else l = (l + ' ' + p).trim();
    }
    if (l) out.push(l);
    return out;
  };

  /* ---------------- pecas das cenas ---------------- */

  function estrelas(c, t, n) {
    for (let i = 0; i < n; i++) {
      const x = (i * 97 + 13) % W, y = TOPO + (i * 53 + 7) % (ARTE - TOPO);
      c.fillStyle = (t + i * 7) % 140 < 70 ? '#3a4068' : '#1c2038';
      c.fillRect(x, y, 1, 1);
    }
  }

  function ceu(c, cima, baixo) {
    const gr = c.createLinearGradient(0, TOPO, 0, ARTE);
    gr.addColorStop(0, cima); gr.addColorStop(1, baixo);
    c.fillStyle = gr;
    c.fillRect(0, TOPO, W, ARTE - TOPO);
  }

  // o mundo inteiro: oceano, continentes girando e o brilho dourado do coracao
  function miolo(c, cx, cy, r, t) {
    disco(c, cx, cy, r, '#2f6fb8');
    const larg = r * 2 + 30;
    for (let k = 0; k < 9; k++) {
      const x = cx - r - 15 + (((k * 41 + t * 0.25) % larg) + larg) % larg;
      const y = cy - r + ((k * 29) % (r * 2));
      disco(c, x, y, 4 + (k % 3) * 3, k % 4 ? '#3f8a2a' : '#7fd858');
    }
    disco(c, cx - r * 0.35, cy - r * 0.35, r * 0.25, 'rgba(255,255,255,0.12)');
  }

  function planeta(c, cx, cy, r, t, separa) {
    if (!separa) {
      c.save();
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
      miolo(c, cx, cy, r, t);
      c.restore();
      return;
    }
    // partido em 6 pedacos que se afastam, com luz roxa das fendas entre eles
    disco(c, cx, cy, Math.min(r, separa * 1.2), 'rgba(180,92,255,0.25)');
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2 + 0.3, a1 = ((k + 1) / 6) * Math.PI * 2 + 0.3, am = (a0 + a1) / 2;
      c.save();
      c.translate(Math.cos(am) * separa, Math.sin(am) * separa);
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a0, a1); c.closePath(); c.clip();
      miolo(c, cx, cy, r, t);
      c.restore();
    }
  }

  // cristal dourado do coracao do mundo; `racha` de 0 a 1 desenha as rachaduras
  function coracao(c, cx, cy, t, racha, escuro) {
    const bate = (t % 50) < 6 ? 2 : 0;
    const h = 26 + bate, gl = escuro ? 'rgba(180,92,255,0.18)' : 'rgba(255,211,77,0.18)';
    disco(c, cx, cy, 40 + bate * 2, gl);
    disco(c, cx, cy, 30 + bate, gl);
    for (let y = -h; y <= h; y++) {
      const w = Math.round((h - Math.abs(y)) * 0.62);
      c.fillStyle = escuro ? '#5a2a7a' : '#c88a1a';
      c.fillRect(cx - w, cy + y, w * 2 + 1, 1);
      if (w > 2) { c.fillStyle = escuro ? '#8a3ad8' : '#ffd34d'; c.fillRect(cx - w + 2, cy + y, w * 2 - 3, 1); }
    }
    px(c, cx - 4, cy - 14, 3, 12, escuro ? '#d9a6ff' : '#fff6c8');
    if (racha > 0) {
      const lin = [[0, -h, -5, -10], [-5, -10, 4, 0], [4, 0, -3, 12], [-3, 12, 1, h], [4, 0, 12, -4], [-5, -10, -13, -6]];
      const n = lin.length * racha;
      for (let k = 0; k < n; k++) {
        const [a, b, cc, d] = lin[k], f = Math.min(1, n - k);
        G.linhaPx(c, cx + a, cy + b, cx + a + (cc - a) * f, cy + b + (d - b) * f, '#12061c', 0);
        G.linhaPx(c, cx + a, cy + b, cx + a + (cc - a) * f, cy + b + (d - b) * f, '#b45cff', 1);
      }
    }
  }

  function morros(c, base, cor, amp, fase) {
    c.fillStyle = cor;
    for (let x = 0; x < W; x += 2) {
      const y = base - Math.abs(Math.sin(x * 0.012 + fase)) * amp - Math.sin(x * 0.037 + fase * 2) * amp * 0.3;
      c.fillRect(x, y | 0, 2, ARTE - y);
    }
  }

  function portal(c, x, y, abre, t) {
    if (abre <= 0) return;
    const alt = 22 * abre, larg = 9 * abre;
    for (let yy = -alt; yy <= alt; yy++) {
      const w = Math.round((1 - (yy / alt) ** 2) * larg);
      c.fillStyle = '#b45cff'; c.fillRect(x - w - 1, (y + yy) | 0, w * 2 + 3, 1);
      c.fillStyle = (yy + (t >> 2)) % 6 < 3 ? '#2a0f3a' : '#12061c'; c.fillRect(x - w, (y + yy) | 0, w * 2 + 1, 1);
    }
    disco(c, x, y, (larg * 2.2) | 0, 'rgba(180,92,255,0.12)');
  }

  function vila(c, t, apaga) {
    const casas = [[40, 22], [78, 30], [120, 18], [296, 26], [338, 20], [372, 30]];
    casas.forEach(([x, h], k) => {
      const base = ARTE - 10;
      px(c, x, base - h, 26, h, '#0c0c16');
      for (let i = 0; i < 14; i++) px(c, x - 1 + i, base - h - i * 0.6, 28 - i * 2, 1, '#0c0c16');
      const acesa = apaga === undefined ? true : t < apaga + k * 30;
      px(c, x + 9, base - h + 8, 6, 6, acesa ? ((t >> 4) + k) % 7 ? '#ffd34d' : '#ff8a3d' : '#1a1d29');
    });
    px(c, 0, ARTE - 10, W, 10, '#0c0c16');
  }

  function heroi(c, S, cls, x, y, esc, t, lado) {
    const arte = S.heroes[cls] || S.heroes.guerreiro;
    const img = arte.walk[lado || 'right'][(t >> 5) & 1];
    c.drawImage(img, x | 0, y | 0, 16 * esc, 16 * esc);
  }

  /* ---------------- as cenas ---------------- */

  G.CENAS_INTRO = [
    {
      texto: 'HA MUITO TEMPO, AURUM ERA UM SO MUNDO. INTEIRO, VIVO, EM PAZ.',
      desenha(c, t) {
        px(c, 0, 0, W, ARTE, '#070812'); estrelas(c, t, 60);
        disco(c, CX, CY, 60, 'rgba(255,211,77,0.10)');
        disco(c, CX, CY, 52, 'rgba(120,190,255,0.22)');
        planeta(c, CX, CY, 48, t, 0);
      }
    },
    {
      texto: 'NO CENTRO DELE BATIA O CORACAO DO MUNDO. ERA ELE QUE MANTINHA TODAS AS COISAS NO LUGAR.',
      som: (t) => t % 50 === 0 ? 'batida' : null,
      desenha(c, t) {
        px(c, 0, 0, W, ARTE, '#070812'); estrelas(c, t, 40);
        coracao(c, CX, CY, t, 0, false);
      }
    },
    {
      texto: 'ATE O DIA DO COLAPSO.',
      dur: 260,
      som: (t) => t === 70 ? 'racha' : t < 70 && t % 50 === 0 ? 'batida' : null,
      tremor: (t) => t > 70 && t < 130 ? 4 : 0,
      desenha(c, t) {
        px(c, 0, 0, W, ARTE, '#070812'); estrelas(c, t, 40);
        coracao(c, CX, CY, t < 70 ? t : 1, Math.min(1, Math.max(0, (t - 70) / 60)), t > 110);
        if (t > 70 && t < 90) px(c, 0, 0, W, ARTE, 'rgba(255,255,255,' + (1 - (t - 70) / 20).toFixed(2) + ')');
      }
    },
    {
      texto: 'O CORACAO RACHOU, E O MUNDO SE PARTIU EM MIL UNIVERSOS.',
      tremor: (t) => t < 40 ? 2 : 0,
      desenha(c, t) {
        px(c, 0, 0, W, ARTE, '#070812'); estrelas(c, t, 60);
        planeta(c, CX, CY, 48, t, Math.min(26, t * 0.12));
      }
    },
    {
      texto: 'DAS RACHADURAS NASCERAM AS FENDAS. ELAS SE FUNDIRAM UMAS NAS OUTRAS... E ABRIRAM PORTAIS POR TODA A TERRA.',
      som: (t) => t % 45 === 40 && t < 240 ? 'cast' : null,
      desenha(c, t) {
        ceu(c, '#120a24', '#3a1a4a'); estrelas(c, t, 30);
        morros(c, 128, '#1c1430', 24, 0.5);
        [[60, 104], [150, 96], [250, 108], [340, 98], [205, 70]].forEach(([x, y], k) => {
          portal(c, x, y, Math.min(1, Math.max(0, (t - 40 - k * 45) / 30)), t);
        });
        morros(c, 150, '#0c0c16', 12, 2.1);
      }
    },
    {
      texto: 'PELOS PORTAIS VIERAM CRIATURAS ESTRANHAS, DE MUNDOS QUE NUNCA DEVIAM SE TOCAR. ELAS CACAM O QUE RESTOU DOS HUMANOS.',
      desenha(c, t) {
        ceu(c, '#1a0a14', '#4a1a2a');
        disco(c, CX, 64, 34, 'rgba(255,48,80,0.10)');
        portal(c, CX, 72, 1.6, t);
        for (let k = 0; k < 10; k++) {                 // olhos vermelhos saindo do portal
          const nasce = 30 + k * 22;
          if (t < nasce) continue;
          const a = k * 2.4, d = Math.min(150, (t - nasce) * 0.5);
          const x = CX + Math.cos(a) * d * 1.3, y = 76 + Math.sin(a) * d * 0.35 + 10;
          if (((t + k * 13) % 90) < 84) { px(c, x - 3, y, 2, 2, '#ff3050'); px(c, x + 2, y, 2, 2, '#ff3050'); }
        }
        vila(c, t, 120);
      }
    },
    {
      texto: 'OS PEDACOS DO CORACAO SE ESPALHARAM POR OITO MUNDOS: DEZESSEIS FRAGMENTOS, CADA UM NAS GARRAS DE UM GUARDIAO DAS FENDAS.',
      desenha(c, t, h) {
        px(c, 0, 0, W, ARTE, '#070812'); estrelas(c, t, 50);
        const voa = Math.max(0, t - 140) * 0.7;
        disco(c, CX, CY, Math.max(0, 30 - voa * 0.3) | 0, 'rgba(255,211,77,0.15)');
        for (let k = 0; k < 6; k++) {
          const a = t * 0.02 + (k / 6) * Math.PI * 2, r = 30 + voa * 1.4;
          const x = CX + Math.cos(a) * r * 1.4, y = CY + Math.sin(a) * r * 0.8;
          c.drawImage(h.g.SPR.shard, (x - 7) | 0, (y - 7) | 0);
          if (voa > 60) {                               // os guardioes pegam os fragmentos
            px(c, x - 5, y - 10, 2, 2, '#ff3050'); px(c, x + 3, y - 10, 2, 2, '#ff3050');
          }
        }
      }
    },
    {
      texto: 'VOCE E UM DOS ULTIMOS HEROIS. ATRAVESSE OS PORTAIS, DERROTE OS MONSTROS E RESGATE OS FRAGMENTOS DO MUNDO.',
      desenha(c, t, h) {
        ceu(c, '#1a1030', '#c85a3a');
        disco(c, 290, 112, 28, 'rgba(255,176,77,0.35)');
        disco(c, 290, 112, 20, '#ffd37a');
        portal(c, 350, 90, 0.8, t);
        morros(c, 146, '#2a1a2a', 14, 1.2);
        c.fillStyle = '#0c0c16';                      // colina do heroi, descendo suave ate a borda
        for (let x = 0; x < 300; x += 2) c.fillRect(x, (122 + Math.pow(x / 300, 2) * 40) | 0, 2, 60);
        heroi(c, h.g.SPR, h.cls, 60, 76, 3, t, 'right');
        for (let k = 0; k < 14; k++) {                  // vento
          const x = ((k * 53 + t * (1.5 + (k % 3))) % (W + 40)) - 20, y = TOPO + 10 + (k * 37) % 120;
          px(c, x, y, 6, 1, 'rgba(255,240,220,0.35)');
        }
      }
    },
    {
      dur: 260, titulo: true,
      desenha(c, t, h) {
        px(c, 0, 0, W, H, '#070812'); estrelas(c, t, 60);
        const a = Math.min(1, t / 60);
        c.globalAlpha = a;
        h.g.text(c, 'A LENDA DE', CX, 62, '#8f96a8', 'center', 10);
        h.g.text(c, 'AURUM', CX, 92, '#ffd34d', 'center', 26);
        c.globalAlpha = Math.min(1, Math.max(0, (t - 50) / 50));
        h.g.text(c, 'OS FRAGMENTOS DO MUNDO', CX, 116, '#b45cff', 'center', 10);
        for (let k = 0; k < 6; k++) c.drawImage(h.g.SPR.shard, CX - 57 + k * 18, 128 + Math.sin(t * 0.05 + k) * 2);
        c.globalAlpha = 1;
      }
    }
  ];

  G.CENAS_FIM = [
    {
      texto: 'OS DEZESSEIS FRAGMENTOS VOLTARAM A BATER JUNTOS.',
      som: (t) => t > 150 && t % 50 === 0 ? 'batida' : null,
      desenha(c, t, h) {
        px(c, 0, 0, W, ARTE, '#070812'); estrelas(c, t, 50);
        const junta = Math.max(0, 150 - t);
        if (t > 140) coracao(c, CX, CY, t, 0, false);
        else for (let k = 0; k < 6; k++) {
          const a = t * 0.03 + (k / 6) * Math.PI * 2, r = junta * 0.8;
          c.drawImage(h.g.SPR.shard, (CX + Math.cos(a) * r * 1.4 - 7) | 0, (CY + Math.sin(a) * r * 0.8 - 7) | 0);
        }
        if (t > 140 && t < 160) px(c, 0, 0, W, ARTE, 'rgba(255,246,200,' + (1 - (t - 140) / 20).toFixed(2) + ')');
      }
    },
    {
      texto: 'AS FENDAS SE FECHAM, UMA A UMA. OS PORTAIS SE APAGAM. O MUNDO VOLTA A SER UM SO.',
      desenha(c, t) {
        px(c, 0, 0, W, ARTE, '#070812'); estrelas(c, t, 60);
        disco(c, CX, CY, 58, 'rgba(255,211,77,' + Math.min(0.12, t / 1500).toFixed(3) + ')');
        planeta(c, CX, CY, 48, t, Math.max(0, 26 - t * 0.12));
      }
    },
    {
      texto: 'AS LUZES DAS CASAS VOLTAM A ACENDER. E O SEU NOME VIRA LENDA EM AURUM.',
      desenha(c, t, h) {
        ceu(c, '#3a5a9a', '#ffc87a');
        disco(c, CX, ARTE - 30, 30, '#fff0b0');
        morros(c, 140, '#3f6a3a', 16, 0.8);
        vila(c, t);
        heroi(c, h.g.SPR, h.cls, CX - 24, 86, 3, t, 'down');
      }
    }
  ];

  /* ---------------- tocador ---------------- */

  class Historia {
    constructor(g, cenas, depois) {
      this.g = g; this.cenas = cenas; this.depois = depois;
      this.cls = g.player ? g.player.cls : 'guerreiro';
      this.i = 0; this.t = 0; this.n = 0; this.saindo = 0; this.fim = false;
    }
    cena() { return this.cenas[this.i]; }
    duracao(cena) { return cena.dur || Math.max(300, (cena.texto || '').length / LETRA + 180); }

    update(input) {
      if (this.fim) return;
      if (input.hit('start') || input.hit('pause')) { this.acaba(); return; }   // ENTER pula a historia
      const cena = this.cena();
      this.t++;
      const txt = cena.texto || '';
      if (this.n < txt.length) this.n = Math.min(txt.length, this.n + LETRA);
      const som = cena.som && cena.som(this.t);
      if (som) Sound.play(som);
      if (this.saindo > 0) { if (--this.saindo === 0) this.proxima(); return; }
      if (input.hit('attack')) {
        if (this.n < txt.length) this.n = txt.length; else this.saindo = FADE;
      }
      if (this.t >= this.duracao(cena)) this.saindo = FADE;
    }
    proxima() {
      this.i++; this.t = 0; this.n = 0;
      if (this.i >= this.cenas.length) this.acaba();
    }
    acaba() {
      if (this.fim) return;
      this.fim = true;
      this.depois();
    }

    draw(c) {
      px(c, 0, 0, W, H, '#000000');
      const cena = this.cena();
      if (!cena) return;
      c.save();
      if (!cena.titulo) { c.beginPath(); c.rect(0, TOPO, W, ARTE - TOPO); c.clip(); }
      const tr = cena.tremor ? cena.tremor(this.t) : 0;
      if (tr) c.translate(((Math.random() - 0.5) * tr * 2) | 0, ((Math.random() - 0.5) * tr * 2) | 0);
      cena.desenha(c, this.t, this);
      c.restore();

      // legenda digitada
      if (cena.texto) {
        const linhas = G.quebraTexto(cena.texto, 62);
        let resta = this.n | 0;
        linhas.forEach((l, k) => {
          const s = l.slice(0, Math.max(0, resta));
          resta -= l.length + 1;
          this.g.text(c, s, W / 2, ARTE + 18 + k * 12, '#e8e0c8', 'center');
        });
      }

      // fade de entrada e de saida de cada cena
      const a = this.t < FADE ? 1 - this.t / FADE : this.saindo > 0 ? 1 - this.saindo / FADE : 0;
      if (a > 0) px(c, 0, 0, W, H, 'rgba(0,0,0,' + a.toFixed(2) + ')');
      this.g.text(c, 'ENTER PULA   J AVANCA', W - 6, H - 5, '#3a4159', 'right');
    }
  }
  G.Historia = Historia;
})(window.AURUM = window.AURUM || {});
