/* batalha.js - luta contra o ECO DAS FENDAS no estilo Undertale: menu LUTAR / AGIR /
   ITEM / POUPAR, barra de mira para bater e a alma (coracao) desviando das balas
   dentro da caixa. Cada acerto tira 1 coracao e meio da vida real do heroi.
   Da para vencer lutando ou poupando (ouvir, lembrar e cantar enchem a misericordia). */
(function (G) {
  'use strict';

  const W = G.VIEW_W, H = G.VIEW_H + G.HUD_H;
  const Sound = G.Sound;
  const DANO = 3, INV = 50, TURNO = 330, VEL = 1.5;
  const BOTOES = ['LUTAR', 'AGIR', 'ITEM', 'POUPAR'];
  const MENU = { x: 24, y: 96, w: W - 48, h: 64 };
  const LUTA = { x: (W - 140) / 2, y: 92, w: 140, h: 72 };
  const rnd = Math.random;

  const CORACAO = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

  const FALAS = [
    'POR QUE VOCE VEIO ATE AQUI?',
    'TODOS FORAM EMBORA... SO SOBROU A VOZ DELES. EU.',
    'SE EU SUMIR, QUEM VAI LEMBRAR DELES?',
    'AS FENDAS ENGOLIRAM TUDO. CASAS. NOMES. CANCOES.',
    'DOI... TUDO DOI...',
    'VOCE TAMBEM VAI ME ESQUECER.'
  ];
  const CLIMA = [
    '* O ECO FLUTUA, CHORANDO BAIXINHO.',
    '* O AR CHEIRA A CHUVA DE OUTRO MUNDO.',
    '* LAGRIMAS CAEM... PARA CIMA.',
    '* VOCE OUVE SEU PROPRIO NOME, BEM DE LONGE.',
    '* O PANTANO INTEIRO PARECE PRENDER A RESPIRACAO.'
  ];
  const ORDEM = ['lagrimas', 'fendas', 'ecos', 'gravidade', 'espiral', 'lagrimas+ecos', 'fendas+espiral', 'gravidade+lagrimas'];

  /* ---------------- padroes de ataque (turno do eco) ---------------- */

  const PADROES = {
    lagrimas(B, t) {
      const c = B.caixa;
      if (t % Math.max(4, (10 / B.ritmo) | 0) === 0) {
        B.bala({ x: c.x + 5 + rnd() * (c.w - 10), y: c.y - 4, vx: 0, vy: (1.1 + rnd() * 0.8) * B.ritmo, r: 3, forma: 'gota',
          fase: rnd() * 6, upd: (b) => { b.x += Math.sin(b.t * 0.06 + b.fase) * 0.35; } });
      }
    },
    fendas(B, t) {
      const c = B.caixa, cada = Math.max(30, (58 / B.ritmo) | 0);
      if (t % cada !== 0) return;
      const esq = ((t / cada) | 0) % 2 === 0, gap = 24;
      const gy = c.y + 8 + rnd() * (c.h - 16 - gap);
      const vx = (esq ? 1.5 : -1.5) * B.ritmo, x = esq ? c.x - 8 : c.x + c.w + 2;
      B.bala({ x, y: c.y - 2, w: 6, h: gy - c.y + 2, vx, vy: 0 });
      B.bala({ x, y: gy + gap, w: 6, h: c.y + c.h - gy - gap + 2, vx, vy: 0 });
    },
    ecos(B, t) {
      if (t % Math.max(50, (84 / B.ritmo) | 0) !== 10) return;
      const a0 = rnd() * Math.PI * 2, n = 18, buraco = (rnd() * n) | 0;
      const cx = B.alma.x, cy = B.alma.y;
      for (let k = 0; k < n; k++) {
        if (k === buraco || k === (buraco + 1) % n || k === (buraco + 2) % n) continue;
        const a = a0 + (k / n) * Math.PI * 2;
        B.bala({ x: cx + Math.cos(a) * 66, y: cy + Math.sin(a) * 66, vx: -Math.cos(a) * 0.85 * B.ritmo,
          vy: -Math.sin(a) * 0.85 * B.ritmo, r: 3, forma: 'orbe', vida: 150 });
      }
    },
    espiral(B, t) {
      const c = B.caixa;
      if (t < 40 || t % 6 !== 0) return;
      for (let k = 0; k < 2; k++) {
        const a = t * 0.07 + k * Math.PI;
        B.bala({ x: c.x + c.w / 2, y: c.y + 12, vx: Math.cos(a) * 1.1 * B.ritmo, vy: Math.sin(a) * 1.1 * B.ritmo + 0.3, r: 3, forma: 'orbe' });
      }
    },
    // alma azul: a gravidade puxa para baixo, SETA PARA CIMA pula
    gravidade(B, t) {
      const c = B.caixa, cada = Math.max(34, (52 / B.ritmo) | 0);
      if (t % cada !== 0) return;
      const alto = ((t / cada) | 0) % 3 === 2, vx = -1.7 * B.ritmo;
      if (alto) B.bala({ x: c.x + c.w + 2, y: c.y, w: 7, h: c.h - 24, vx, vy: 0 });
      else { const h = 10 + rnd() * 12; B.bala({ x: c.x + c.w + 2, y: c.y + c.h - h, w: 7, h, vx, vy: 0 }); }
    }
  };

  /* ---------------- batalha ---------------- */

  class Batalha {
    constructor(g, chefe) {
      this.g = g; this.chefe = chefe; this.t = 0;
      this.caixa = Object.assign({}, MENU);
      this.botao = 0; this.sel = 0;
      this.misericordia = 0; this.fez = {}; this.dificuldade = g.dif().ritmo; this.turnoN = 0; this.falaN = 0;
      this.itens = [{ nome: 'PAO DE AURUM', cura: 4, n: 2 }, { nome: 'CHA DE LIRIO', cura: 8, n: 1 }];
      this.balas = []; this.alma = { x: 0, y: 0, vy: 0, chao: false }; this.azul = false; this.inv = 0;
      this.tremor = 0; this.golpe = null; this.apanhou = false;
      this.texto('* O ECO DAS FENDAS BLOQUEIA O CAMINHO.\n* ELE CHORA COM A VOZ DE MIL PESSOAS.', () => this.abreMenu());
    }

    get p() { return this.g.player; }
    get ritmo() { return this.dificuldade * (1 + (1 - this.chefe.hp / this.chefe.maxhp) * 0.35) * (this.misto ? 0.8 : 1); }
    get emPaz() { return this.misericordia >= 100; }

    bala(b) { b.t = 0; this.balas.push(b); }

    texto(s, depois) { this.estado = 'texto'; this.txt = s; this.n = 0; this.depois = depois; }
    fala(s, depois) { this.estado = 'fala'; this.txt = s; this.n = 0; this.depois = depois; }

    abreMenu() {
      this.estado = 'menu';
      this.txt = this.emPaz ? '* O ECO PARECE EM PAZ.' : CLIMA[(rnd() * CLIMA.length) | 0];
      this.n = 0;
    }

    // depois da acao do heroi: o eco fala e ataca
    turnoDoEco(falaEspecial) {
      const s = falaEspecial || (this.emPaz ? 'ACHO QUE... POSSO DESCANSAR AGORA.'
        : this.chefe.hp < this.chefe.maxhp * 0.3 ? 'NAO... AINDA NAO... ELES AINDA PRECISAM DE MIM.'
          : FALAS[this.falaN++ % FALAS.length]);
      this.fala(s, () => this.iniciaTurno());
    }

    iniciaTurno() {
      this.estado = 'turno'; this.tt = 0; this.balas.length = 0;
      this.padrao = ORDEM[this.turnoN++ % ORDEM.length].split('+');
      this.misto = this.padrao.length > 1;
      this.azul = this.padrao[0] === 'gravidade';
      this.alma.x = LUTA.x + LUTA.w / 2; this.alma.y = LUTA.y + LUTA.h - 12; this.alma.vy = 0;
    }

    escolhe() {
      Sound.play('menu');
      const b = BOTOES[this.botao];
      if (b === 'LUTAR') {
        this.estado = 'mira'; this.cursor = MENU.x + 4; this.parou = false;
      } else if (b === 'AGIR') {
        this.lista = [
          { nome: 'ANALISAR', fn: () => this.texto('* ECO DAS FENDAS - ATQ 3  DEF 1\n* A VOZ DE TODOS QUE O COLAPSO CALOU.', () => this.turnoDoEco()) },
          { nome: 'OUVIR', fn: () => this.agir('ouvir') },
          { nome: 'LEMBRAR', fn: () => this.agir('lembrar') },
          { nome: 'CANTAR', fn: () => this.agir('cantar') },
          { nome: 'PROVOCAR', fn: () => this.agir('provocar') }
        ];
        this.estado = 'lista'; this.sel = 0;
      } else if (b === 'ITEM') {
        const tem = this.itens.filter((i) => i.n > 0);
        if (!tem.length) { this.texto('* SUA MOCHILA ESTA VAZIA.', () => this.abreMenu()); return; }
        this.lista = tem.map((i) => ({ nome: i.nome + ' x' + i.n, fn: () => this.usa(i) }));
        this.estado = 'lista'; this.sel = 0;
      } else if (this.emPaz) {
        this.fala('OBRIGADO... POR LEMBRAR DE NOS.', () =>
          this.texto('* VOCE POUPOU O ECO.\n* ELE VIRA LUZ E DEIXA UM FRAGMENTO PARA TRAS.', () => this.fim('poupou')));
      } else {
        this.texto('* O ECO NAO ESTA PRONTO PARA IR.', () => this.turnoDoEco());
      }
    }

    agir(a) {
      const f = this.fez, antes = this.misericordia;
      let s, fala;
      if (a === 'ouvir') {
        if (!f.ouvir) { s = '* VOCE ESCUTA. NO MEIO DO CHORO HA NOMES...\n* NOMES DE PESSOAS DE MUNDOS QUE NAO EXISTEM MAIS.'; this.misericordia += 30; fala = 'VOCE... CONSEGUE ME OUVIR?'; }
        else { s = '* O ECO CONTINUA CHORANDO. VOCE CONTINUA OUVINDO.'; this.misericordia += 5; }
        f.ouvir = true;
      } else if (a === 'lembrar') {
        if (!f.ouvir) s = '* LEMBRAR O QUE? VOCE AINDA NAO SABE O QUE ELE PERDEU.';
        else if (!f.lembrar) { s = '* VOCE DIZ OS NOMES EM VOZ ALTA, UM POR UM.\n* O ECO PARA DE CHORAR POR UM INSTANTE.'; this.misericordia += 35; fala = 'ESSES NOMES... EU CONHECO ESSES NOMES.'; f.lembrar = true; }
        else s = '* VOCE JA DISSE TODOS OS NOMES.';
      } else if (a === 'cantar') {
        if (!f.lembrar) { s = '* VOCE CANTA. O ECO TAPA OS OUVIDOS.\n* PARECE QUE AINDA E CEDO DEMAIS.'; this.dificuldade += 0.1; }
        else if (!f.cantar) { s = '* VOCE CANTA A CANCAO DE AURUM.\n* O ECO CANTA JUNTO, BAIXINHO.'; this.misericordia += 40; fala = 'ESSA MUSICA... ERA A MUSICA DE CASA.'; f.cantar = true; }
        else { s = '* VOCES CANTAM JUNTOS DE NOVO.'; this.misericordia += 5; }
      } else {
        s = '* VOCE PROVOCA O ECO.\n* ELE GRITA MAIS ALTO! OS ATAQUES FICAM MAIS RAPIDOS.';
        this.dificuldade += 0.25; this.misericordia = Math.max(0, this.misericordia - 10);
        fala = 'VOCE E IGUAL AS FENDAS!';
      }
      this.misericordia = Math.min(100, this.misericordia);
      if (antes < 100 && this.emPaz) s += '\n* O NOME DO ECO FICOU AMARELO. VOCE PODE POUPAR.';
      this.texto(s, () => this.turnoDoEco(fala));
    }

    usa(i) {
      i.n--;
      const p = this.p, antes = p.hp;
      p.heal(i.cura);
      Sound.play('heal');
      this.texto('* VOCE USOU ' + i.nome + '.\n* RECUPEROU ' + (p.hp - antes) + ' DE VIDA.', () => this.turnoDoEco());
    }

    // mira: o cursor corre a barra; quanto mais perto do meio, mais forte
    bate() {
      const meio = MENU.x + MENU.w / 2;
      const acc = Math.max(0, 1 - Math.abs(this.cursor - meio) / (MENU.w / 2));
      const dmg = this.parou ? Math.round((12 + 30 * acc) * (acc > 0.92 ? 1.5 : 1) * this.p.sword) : 0;
      this.estado = 'golpe';
      this.golpe = { t: 0, dmg, critico: acc > 0.92 };
      Sound.play(dmg ? 'swing' : 'blocked');
    }

    fim(res) { this.estado = 'saindo'; this.res = res; this.st = 40; }

    update() {
      const i = this.g.input;
      this.t++;
      if (this.tremor > 0) this.tremor--;
      if (this.inv > 0) this.inv--;
      const ok = i.hit('attack') || i.hit('start'), volta = i.hit('roll') || i.hit('pause');

      // a caixa encolhe no turno do eco e volta para o menu
      const alvo = this.estado === 'turno' ? LUTA : MENU, cx = this.caixa;
      for (const k of ['x', 'y', 'w', 'h']) cx[k] += (alvo[k] - cx[k]) * 0.25;

      switch (this.estado) {
        case 'texto':
        case 'fala':
          if (this.n < this.txt.length) {
            this.n = Math.min(this.txt.length, this.n + 1);
            if ((this.n | 0) % 3 === 0 && this.txt[this.n | 0] !== ' ') Sound.play(this.estado === 'fala' ? 'goldhit' : 'menu');
          }
          if (ok) { if (this.n < this.txt.length) this.n = this.txt.length; else this.depois(); }
          break;
        case 'menu':
          if (this.n < this.txt.length) this.n++;
          if (i.hit('left')) { this.botao = (this.botao + 3) % 4; Sound.play('menu'); }
          if (i.hit('right')) { this.botao = (this.botao + 1) % 4; Sound.play('menu'); }
          if (ok) this.escolhe();
          break;
        case 'lista': {
          const n = this.lista.length;
          if (i.hit('up')) { this.sel = (this.sel + n - 1) % n; Sound.play('menu'); }
          if (i.hit('down')) { this.sel = (this.sel + 1) % n; Sound.play('menu'); }
          if (volta) { this.abreMenu(); Sound.play('blocked'); } else if (ok) { Sound.play('menu'); this.lista[this.sel].fn(); }
          break;
        }
        case 'mira':
          if (volta && this.cursor < MENU.x + 20) { this.abreMenu(); break; }
          this.cursor += 5.2;
          if (ok) { this.parou = true; this.bate(); } else if (this.cursor > MENU.x + MENU.w - 4) this.bate();
          break;
        case 'golpe': {
          const gp = this.golpe;
          if (++gp.t === 22) {
            this.chefe.hp = Math.max(0, this.chefe.hp - gp.dmg);
            if (gp.dmg) { this.tremor = 20; Sound.play('hit'); }
          }
          if (gp.t >= 75) {
            if (this.chefe.hp <= 0) {
              this.fala('ENTAO... E ASSIM QUE TERMINA.', () =>
                this.texto('* O ECO SE DESFAZ EM CHUVA.\n* NO CHAO FICA UM FRAGMENTO DO CORACAO.', () => this.fim('venceu')));
            } else {
              const primeiro = gp.dmg && !this.apanhou;
              if (gp.dmg) this.apanhou = true;
              this.turnoDoEco(primeiro ? 'VOCE E IGUAL AS FENDAS. SO SABE QUEBRAR.' : null);
            }
          }
          break;
        }
        case 'turno':
          this.tt++;
          this.moveAlma(i);
          if (this.tt > 20 && this.tt < TURNO - 40) for (const nome of this.padrao) PADROES[nome](this, this.tt);
          this.moveBalas();
          if (this.estado !== 'turno') break;       // morreu
          if (this.tt >= TURNO) { this.balas.length = 0; this.azul = false; this.abreMenu(); }
          break;
        case 'saindo':
          if (--this.st <= 0) this.g.fimBatalha(this, this.res);
          break;
      }
    }

    moveAlma(i) {
      const a = this.alma, c = this.caixa;
      let dx = (i.down('right') ? 1 : 0) - (i.down('left') ? 1 : 0);
      if (!this.azul) {
        let dy = (i.down('down') ? 1 : 0) - (i.down('up') ? 1 : 0);
        if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
        a.x += dx * VEL; a.y += dy * VEL;
      } else {
        a.x += dx * VEL;
        a.vy += 0.22;
        if (a.chao && i.down('up')) a.vy = -4.1;
        if (!i.down('up') && a.vy < -1.2) a.vy = -1.2;       // soltar cedo = pulo baixo
        a.y += a.vy;
      }
      a.x = G.clamp(a.x, c.x + 5, c.x + c.w - 5);
      const baixo = c.y + c.h - 5;
      a.chao = false;
      if (a.y >= baixo) { a.y = baixo; if (this.azul) { a.vy = 0; a.chao = true; } }
      if (a.y < c.y + 5) { a.y = c.y + 5; if (a.vy < 0) a.vy = 0; }
    }

    moveBalas() {
      const a = this.alma, c = this.caixa;
      for (let k = this.balas.length - 1; k >= 0; k--) {
        const b = this.balas[k];
        b.t++;
        if (b.upd) b.upd(b, this);
        b.x += b.vx; b.y += b.vy;
        if (b.t > (b.vida || 400) || b.x < c.x - 70 || b.x > c.x + c.w + 70 || b.y < c.y - 70 || b.y > c.y + c.h + 70) {
          this.balas.splice(k, 1); continue;
        }
        if (this.inv > 0) continue;
        const acerta = b.r ? Math.hypot(b.x - a.x, b.y - a.y) < b.r + 2.5
          : a.x + 2.5 > b.x && a.x - 2.5 < b.x + b.w && a.y + 2.5 > b.y && a.y - 2.5 < b.y + b.h;
        if (acerta) { this.ferido(); if (this.estado !== 'turno') return; }
      }
    }

    ferido() {
      const p = this.p;
      p.hp -= this.g.danoRecebido(DANO, true);
      this.inv = INV;
      this.g.shake(6);
      Sound.play('hurt');
      if (p.hp <= 0) { p.hp = 0; this.g.morteNaBatalha(this); }
    }

    /* ---------------- desenho ---------------- */

    draw(c) {
      const g = this.g;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);

      // o eco
      const saindo = this.estado === 'saindo' ? this.st / 40 : 1;
      const tx = this.tremor > 0 ? ((rnd() - 0.5) * 8) | 0 : 0;
      const img = G.spriteEco(this.t, this.emPaz);
      c.globalAlpha = saindo;
      c.drawImage(img, W / 2 - 32 + tx, 10 + Math.sin(this.t * 0.04) * 3, 64, 72);
      c.globalAlpha = 1;

      if (this.estado === 'fala') {                  // balao de fala
        const bx = W / 2 + 44, by = 14, bw = 158, linhas = G.quebraTexto(this.txt, 24);
        const bh = 8 + linhas.length * 10;
        c.fillStyle = '#fff'; c.fillRect(bx, by, bw, bh);
        c.fillRect(bx - 6, by + 10, 6, 4);
        let resta = this.n | 0;
        linhas.forEach((l, k) => {
          G.textoPixel(c, l.slice(0, Math.max(0, resta)), bx + 6, by + 13 + k * 10, '#000', 'left', 1);
          resta -= l.length + 1;
        });
      }

      if (this.golpe && this.estado === 'golpe') this.drawGolpe(c);

      // caixa
      const cx = this.caixa;
      c.fillStyle = '#000'; c.fillRect(cx.x, cx.y, cx.w, cx.h);
      c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.strokeRect((cx.x | 0) + 1, (cx.y | 0) + 1, (cx.w | 0) - 2, (cx.h | 0) - 2);

      if (this.estado === 'texto' || this.estado === 'menu') this.drawTexto(c, this.txt, this.n);
      else if (this.estado === 'fala' || this.estado === 'saindo') this.drawTexto(c, '', 0);
      else if (this.estado === 'lista') {
        this.lista.forEach((it, k) => {
          const y = cx.y + 16 + k * 10;
          if (k === this.sel) this.drawAlma(c, cx.x + 16, y - 3, false);
          g.text(c, '* ' + it.nome, cx.x + 26, y, '#fff');
        });
        g.text(c, 'K / ESC VOLTA', cx.x + cx.w - 8, cx.y + cx.h - 6, '#5c667e', 'right');
      } else if (this.estado === 'mira' || this.estado === 'golpe') this.drawMira(c);
      else if (this.estado === 'turno') {
        c.save();
        c.beginPath(); c.rect(cx.x + 2, cx.y + 2, cx.w - 4, cx.h - 4); c.clip();
        for (const b of this.balas) {
          if (b.r) {
            c.fillStyle = '#fff';
            if (b.forma === 'gota') { c.fillRect((b.x - 1) | 0, (b.y - 4) | 0, 2, 3); c.fillRect((b.x - 2) | 0, (b.y - 1) | 0, 4, 3); c.fillRect((b.x - 1) | 0, (b.y + 2) | 0, 2, 1); }
            else { c.fillRect((b.x - 2) | 0, (b.y - 3) | 0, 4, 6); c.fillRect((b.x - 3) | 0, (b.y - 2) | 0, 6, 4); }
          } else { c.fillStyle = '#fff'; c.fillRect(b.x | 0, b.y | 0, b.w, b.h | 0); }
        }
        c.restore();
        if (!(this.inv > 0 && (this.t & 2))) this.drawAlma(c, this.alma.x, this.alma.y, this.azul);
        if (this.azul && this.tt < 60) g.text(c, 'ALMA AZUL: SETA PARA CIMA PULA', W / 2, cx.y - 6, '#5aa7ff', 'center');
      }

      // nome, nivel e vida
      const p = this.p, y = H - 36;
      g.text(c, p.def.nome + '   LV ' + (p.shards + 1), 26, y, '#fff');
      g.text(c, 'HP', 170, y, '#fff');
      c.fillStyle = '#e33b4e'; c.fillRect(186, y - 7, p.maxhp * 4, 8);
      c.fillStyle = '#ffd34d'; c.fillRect(186, y - 7, Math.max(0, p.hp) * 4, 8);
      g.text(c, Math.max(0, p.hp) + ' / ' + p.maxhp, 194 + p.maxhp * 4, y, '#fff');

      // botoes
      BOTOES.forEach((nome, k) => {
        const bx = 22 + k * 96, by = H - 26, sel = k === this.botao && this.estado === 'menu';
        const cor = nome === 'POUPAR' && this.emPaz ? '#ffd34d' : sel ? '#ffd34d' : '#ff8a1a';
        c.strokeStyle = cor; c.lineWidth = 2; c.strokeRect(bx + 1, by + 1, 82, 18);
        if (sel) this.drawAlma(c, bx + 12, by + 10, false);
        g.text(c, nome, bx + (sel ? 48 : 42), by + 13, cor, 'center');
      });
    }

    drawTexto(c, s, n) {
      const linhas = s.split('\n');
      let resta = n | 0;
      linhas.forEach((l, k) => {
        this.g.text(c, l.slice(0, Math.max(0, resta)), this.caixa.x + 12, this.caixa.y + 16 + k * 12, '#fff');
        resta -= l.length + 1;
      });
      if (this.estado === 'menu' && this.emPaz) this.g.text(c, 'ECO DAS FENDAS', this.caixa.x + this.caixa.w - 10, this.caixa.y + this.caixa.h - 8, '#ffd34d', 'right');
    }

    drawMira(c) {
      const m = MENU, meio = m.x + m.w / 2;
      for (let k = 0; k < 7; k++) {                        // faixas do alvo, mais claras no meio
        const w = (m.w - 8) * (1 - k / 7);
        c.fillStyle = k % 2 ? '#1a3a2a' : '#0f2418';
        if (k === 6) c.fillStyle = '#4cd964';
        c.fillRect(meio - w / 2, m.y + 10 + k * 1.5, w, m.h - 20 - k * 3);
      }
      c.fillStyle = '#fff';
      c.fillRect(meio - 1, m.y + 6, 2, m.h - 12);
      const pisca = this.estado === 'golpe' && (this.t & 4);
      c.fillStyle = pisca ? '#000' : '#fff';
      c.fillRect(this.cursor - 2, m.y + 4, 4, m.h - 8);
      if (this.estado === 'mira') this.g.text(c, 'J = BATER', m.x + m.w - 8, m.y + m.h - 6, '#5c667e', 'right');
    }

    drawGolpe(c) {
      const gp = this.golpe, cx = W / 2, cy = 46;
      if (gp.t < 22 && gp.dmg) {                           // corte diagonal
        const f = gp.t / 22;
        for (let k = 0; k < 3; k++) G.linhaPx(c, cx - 20 + k * 4, cy - 22, cx - 20 + k * 4 + 40 * f, cy - 22 + 44 * f, '#e33b4e', 0);
      }
      if (gp.t >= 22) {
        const ch = this.chefe, w = 120;
        c.fillStyle = '#3a3a3a'; c.fillRect(cx - w / 2, cy + 36, w, 6);
        c.fillStyle = '#4cd964'; c.fillRect(cx - w / 2, cy + 36, (w * ch.hp / ch.maxhp) | 0, 6);
        const s = gp.dmg ? String(gp.dmg) + (gp.critico ? '!' : '') : 'ERROU';
        this.g.text(c, s, cx, cy + 30 - Math.min(8, (gp.t - 22) * 0.6), gp.dmg ? '#e33b4e' : '#c8cede', 'center', 12);
      }
    }

    drawAlma(c, x, y, azul) {
      c.fillStyle = azul ? '#3a6aff' : '#ff2030';
      const ox = (x - 3.5) | 0, oy = (y - 3) | 0;
      for (let j = 0; j < CORACAO.length; j++) {
        for (let k = 0; k < 7; k++) if (CORACAO[j][k] === 'X') c.fillRect(ox + k, oy + j, 1, 1);
      }
    }
  }
  G.Batalha = Batalha;
})(window.AURUM = window.AURUM || {});
