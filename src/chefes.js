/* chefes.js - os 6 guardioes das fendas (2 por mundo). Todos com muita vida e golpes
   que tiram 1 coracao e meio (3 de dano). Cada um tem uma mecanica propria:
   Devorador (mergulha nas fendas), Colosso (so apanha pelas costas), Mariposa (escuridao
   e lampioes), Eco (luta estilo Undertale, em batalha.js), Reflexo (copia seus passos,
   so a lava o fere) e Coracao do Colapso (escudos, gravidade e arena que encolhe). */
(function (G) {
  'use strict';

  const TILE = G.TILE, VIEW_W = G.VIEW_W, VIEW_H = G.VIEW_H, ROOM_W = G.ROOM_W, ROOM_H = G.ROOM_H;
  const Sound = G.Sound;
  const DANO = 3;                               // 1 coracao e meio
  const rnd = Math.random;

  function px(c, x, y, w, h, cor) { c.fillStyle = cor; c.fillRect(x | 0, y | 0, w, h); }
  function disco(c, cx, cy, r, cor) {
    c.fillStyle = cor;
    for (let y = -r; y <= r; y++) {
      const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
      c.fillRect((cx - w) | 0, (cy + y) | 0, w * 2 + 1, 1);
    }
  }
  // quantidade de tiros, raios e invocacoes conforme a dificuldade (minimo 1)
  function qtd(g, n) { return Math.max(1, Math.round(n * g.dif().tiros)); }
  // no facil parte dos tiros de sequencia nao sai
  function sai(g) { return rnd() < g.dif().tiros; }

  function tiros(g, x, y, ang, n, abre, vel, kind) {
    n = qtd(g, n);
    for (let k = 0; k < n; k++) {
      const a = ang + (k - (n - 1) / 2) * abre;
      g.addEnt(new G.Shot(x - 3, y - 3, Math.cos(a) * vel, Math.sin(a) * vel, kind || 'dark', DANO));
    }
  }
  function anel(g, x, y, n, vel, giro) {
    n = qtd(g, n);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (giro || 0);
      g.addEnt(new G.Shot(x - 3, y - 3, Math.cos(a) * vel, Math.sin(a) * vel, 'dark', DANO));
    }
  }

  /* ---------------- base ---------------- */

  class Chefe extends G.Enemy {
    constructor(x, y, w, h, hp, nome) {
      super(x, y, w, h, hp);
      this.boss = true; this.name = nome;
      this.touch = DANO; this.fracF = 6;        // F e bola de fogo tiram so 1/6
      this.gib = 8; this.loot = 4;
      this.state = ''; this.st = 0; this.cycle = 0; this.alpha = 1;
    }
    enter(s, t) { this.state = s; this.st = t; }
    get furioso() { return this.hp < this.maxhp * 0.5; }
    // ritmo da dificuldade: no facil pula quadros (tudo mais lento), no dificil roda quadros extras
    update(g) {
      this.passo = (this.passo || 0) + g.dif().ritmo;
      while (this.passo >= 1 && !this.dead) { this.passo--; super.update(g); }
    }
    hurt(g, dmg, dx, dy) { super.hurt(g, dmg, dx, dy); this.knock = Math.min(this.knock, 3); }
    draw(ctx, S, tick) {
      if (this.hurtT > 0 && (tick & 2)) return;
      if (this.alpha <= 0) return;
      if (this.alpha < 1) ctx.globalAlpha = this.alpha;
      this.desenha(ctx, tick, S);
      ctx.globalAlpha = 1;
      if (this.gelo > 0 || this.fogo > 0 || this.para > 0 || this.raiz > 0 || this.lento > 0) {
        G.desenhaEfeito(ctx, this, this.x | 0, this.y | 0, this.w, this.h, tick);
      }
    }
    desenha() {}
  }

  // rasgo no espaco: uma linha pisca por 0,8 s e corta a sala inteira
  class Rasgo {
    constructor(pos, eixo) {
      this.pos = pos; this.eixo = eixo; this.t = 48;
      this.x = 0; this.y = VIEW_H + 50; this.w = 0; this.h = 0;   // desenha por cima de tudo
      this.dead = false;
    }
    update(g) {
      if (--this.t === 0) {
        for (const p of g.players) {
          if (p.dead) continue;
          const d = this.eixo === 'h' ? Math.abs(p.cy - this.pos) : Math.abs(p.cx - this.pos);
          if (d < 9) p.hurt(g, DANO, this.eixo === 'h' ? p.cx : this.pos, this.eixo === 'h' ? this.pos : p.cy);
        }
        g.shake(4);
        Sound.play('goldhit');
      }
      if (this.t < -14) this.dead = true;
    }
    draw(c, S, tick) {
      const h = this.eixo === 'h', len = h ? VIEW_W : VIEW_H;
      if (this.t > 0) {
        if (!(tick & 4) && this.t > 16) return;
        c.fillStyle = this.t < 16 ? '#ff3050' : 'rgba(255,80,120,0.7)';
        for (let i = 0; i < len; i += 6) {
          if (h) c.fillRect(i, this.pos | 0, 3, 1); else c.fillRect(this.pos | 0, i, 1, 3);
        }
        return;
      }
      const e = 7 + (this.t > -5 ? 3 : 0);
      c.fillStyle = 'rgba(180,92,255,0.75)';
      if (h) c.fillRect(0, (this.pos - e) | 0, len, e * 2); else c.fillRect((this.pos - e) | 0, 0, e * 2, len);
      c.fillStyle = '#ffffff';
      if (h) c.fillRect(0, (this.pos - 1) | 0, len, 3); else c.fillRect((this.pos - 1) | 0, 0, 3, len);
    }
  }
  G.Rasgo = Rasgo;

  /* ================= MUNDO 1 ================= */

  // DEVORADOR DE FENDAS: some dentro de uma fenda e sai de outra num bote;
  // depois do bote fica tonto (e leva 1,5x o dano). Vomita sombras por todas as fendas e rasga o espaco.
  class FendasDecor {
    constructor(dono) { this.dono = dono; this.x = 0; this.y = -1000; this.w = 0; this.h = 0; this.dead = false; }
    update() { if (this.dono.dead) this.dead = true; }
    draw(c, S, tick) {
      for (const f of this.dono.fendas) {
        const b = f.brilho > 0 ? 1 : 0, alt = 12 + b * 3 + Math.sin(tick * 0.1 + f.x) * 1.5;
        for (let y = -alt; y <= alt; y++) {
          const w = Math.round((1 - (y / alt) ** 2) * (5 + b * 2));
          c.fillStyle = '#b45cff';
          c.fillRect((f.x - w - 1) | 0, (f.y + y) | 0, w * 2 + 3, 1);
          c.fillStyle = b && (tick & 2) ? '#ffffff' : '#12061c';
          c.fillRect((f.x - w) | 0, (f.y + y) | 0, w * 2 + 1, 1);
        }
      }
    }
  }

  class Devorador extends Chefe {
    constructor(x, y) {
      super(x, y, 24, 20, 150, 'DEVORADOR DE FENDAS');
      this.fly = true; this.touch = 0; this.alpha = 0;
      this.enter('surge', 50);
      this.fendas = null; this.saida = null; this.combo = 0; this.boca = 0;
    }
    maisPerto() {
      let best = this.fendas[0], bd = Infinity;
      for (const f of this.fendas) { const d = (f.x - this.cx) ** 2 + (f.y - this.cy) ** 2; if (d < bd) { bd = d; best = f; } }
      return best;
    }
    step(g) {
      if (!this.fendas) {
        this.fendas = [[64, 56], [VIEW_W - 64, 56], [64, VIEW_H - 44], [VIEW_W - 64, VIEW_H - 44]].map(([x, y]) => ({ x, y, brilho: 0 }));
        g.addEnt(new FendasDecor(this));
      }
      const p = g.alvo(this);
      this.anim++;
      if (this.boca > 0) this.boca--;
      for (const f of this.fendas) if (f.brilho > 0) f.brilho--;
      if (this.furioso && this.fendas.length === 4) {
        this.fendas.push({ x: VIEW_W / 2, y: 36, brilho: 30 }, { x: VIEW_W / 2, y: VIEW_H - 30, brilho: 30 });
        g.say('O DEVORADOR RASGA MAIS FENDAS!', 90);
        Sound.play('boss');
      }

      switch (this.state) {
        case 'surge':
          this.alpha = 1 - this.st / 50;
          if (--this.st <= 0) { this.alpha = 1; this.touch = DANO; this.enter('caca', 80); }
          break;
        case 'caca':
          this.chase(g, this.furioso ? 0.85 : 0.6);
          if (--this.st <= 0) {
            this.cycle++;
            const k = this.cycle % 3;
            if (k === 1) { this.combo = this.furioso ? 2 : 1; this.enter('mergulha', 120); }
            else if (k === 2) this.enter('vomito', 100);
            else this.enter('rasgo', 40);
          }
          break;
        case 'mergulha': {
          const f = this.maisPerto();
          const fx = f.x - this.cx, fy = f.y - this.cy, fd = Math.hypot(fx, fy) || 1;
          const v = Math.min(fd, 2.6);
          this.x += (fx / fd) * v; this.y += (fy / fd) * v;
          if (fd < 4 || --this.st <= 0) {
            this.touch = 0; this.alpha = 0;
            g.particles.burst(f.x, f.y, 18, 8, 2.2, 22);
            Sound.play('stairs');
            const outras = this.fendas.filter((o) => o !== f);
            this.saida = outras[(rnd() * outras.length) | 0];
            this.enter('dentro', this.furioso ? 40 : 60);
          }
          break;
        }
        case 'dentro':
          this.saida.brilho = this.st;
          if ((this.st & 3) === 0) g.particles.spawn(this.saida.x + (rnd() - 0.5) * 12, this.saida.y, 0, -0.8, 14, 8, 1, 0);
          if (--this.st <= 0) {
            this.x = this.saida.x - this.w / 2; this.y = this.saida.y - this.h / 2;
            this.alpha = 1; this.touch = DANO; this.boca = 30;
            const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
            this.bx = Math.cos(a) * 4.2; this.by = Math.sin(a) * 4.2;
            Sound.play('boss');
            g.shake(4);
            this.enter('bote', 34);
          }
          break;
        case 'bote': {
          const hit = G.moveEnt(this, g.room, this.bx, this.by, true, false);
          if ((this.st & 1) === 0) g.particles.spawn(this.cx, this.cy, -this.bx * 0.2, -this.by * 0.2, 14, 8, 2, 0);
          if (hit || --this.st <= 0) {
            if (hit) g.shake(6);
            this.enter('tonto', this.furioso ? 60 : 85);
          }
          break;
        }
        case 'tonto':
          if (--this.st <= 0) {
            if (--this.combo > 0) this.enter('mergulha', 120);
            else this.enter('caca', this.furioso ? 60 : 90);
          }
          break;
        case 'vomito':
          this.boca = 10;
          this.x += Math.sin(this.st * 1.1) * 0.6;
          if (this.st < 80 && this.st % (this.furioso ? 10 : 14) === 0) {
            for (const f of this.fendas) {
              if (!sai(g)) continue;
              const a = Math.atan2(p.cy - f.y, p.cx - f.x) + (rnd() - 0.5) * 0.3;
              g.addEnt(new G.Shot(f.x - 3, f.y - 3, Math.cos(a) * 1.7, Math.sin(a) * 1.7, 'dark', DANO));
              f.brilho = 8;
            }
            Sound.play('shoot');
          }
          if (--this.st <= 0) this.enter('caca', 80);
          break;
        case 'rasgo':
          if (this.st === 40) {
            g.addEnt(new Rasgo(p.cy, 'h'));
            g.addEnt(new Rasgo(p.cx, 'v'));
            if (this.furioso) {
              g.addEnt(new Rasgo(p.cy + (p.cy < VIEW_H / 2 ? 44 : -44), 'h'));
              g.addEnt(new Rasgo(p.cx + (p.cx < VIEW_W / 2 ? 70 : -70), 'v'));
            }
            Sound.play('cast');
          }
          if (--this.st <= 0) this.enter('caca', 70);
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.state === 'dentro' || this.state === 'surge' || this.alpha < 0.5) { Sound.play('blocked'); return; }
      if (this.state === 'tonto') dmg = Math.ceil(dmg * 1.5);
      super.hurt(g, dmg, dx, dy);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      const pul = Math.round(Math.sin(tick * 0.15) * 1.5);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(cx - 11, (this.y + this.h + 3) | 0, 22, 3);
      disco(c, cx, cy, 13 + pul, '#b45cff');
      disco(c, cx, cy, 12 + pul, '#2a0f3a');
      disco(c, cx, cy + 1, 9 + pul, '#12061c');
      for (let k = 0; k < 6; k++) {                     // tentaculos de sombra
        const a = tick * 0.05 + k * 1.05, r = 14 + pul + Math.sin(tick * 0.2 + k) * 2;
        px(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 2, '#5a2a7a');
      }
      const olho = this.state === 'tonto' ? '#5c667e' : '#ffd34d';
      px(c, cx - 7, cy - 7, 3, 3, olho); px(c, cx + 4, cy - 7, 3, 3, olho); px(c, cx - 1, cy - 10, 3, 3, olho);
      const ab = this.boca > 0 ? 7 : 3;
      px(c, cx - 8, cy + 1, 16, ab, '#000000');
      for (let i = 0; i < 4; i++) { px(c, cx - 7 + i * 4, cy + 1, 2, 2, '#eef2ff'); px(c, cx - 5 + i * 4, cy + ab - 1, 2, 2, '#eef2ff'); }
      if (this.state === 'tonto') {
        for (let k = 0; k < 3; k++) {
          const a = tick * 0.2 + k * 2.1;
          px(c, cx + Math.cos(a) * 12, cy - 16 + Math.sin(a) * 3, 2, 2, '#ffd34d');
        }
      }
    }
  }

  // COLOSSO DE AURUM: pedra pura pela frente; so o nucleo das costas sente dor (2x).
  // Investe em linha reta: se bater na parede fica atordoado (2x de qualquer lado) e caem pedras do teto.
  class Colosso extends Chefe {
    constructor(x, y) {
      super(x, y, 26, 24, 170, 'COLOSSO DE AURUM');
      this.gib = 5; this.ang = Math.PI / 2; this.socos = 0;
      this.enter('acorda', 60);
    }
    step(g) {
      const p = g.alvo(this);
      const alvoAng = Math.atan2(p.cy - this.cy, p.cx - this.cx);
      const gira = (v) => {
        let da = alvoAng - this.ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        this.ang += G.clamp(da, -v, v);
      };
      this.anim++;
      switch (this.state) {
        case 'acorda':
          if (--this.st <= 0) this.enter('anda', 90);
          break;
        case 'anda': {
          gira(this.furioso ? 0.035 : 0.022);
          const v = this.furioso ? 0.6 : 0.42;
          G.moveEnt(this, g.room, Math.cos(this.ang) * v, Math.sin(this.ang) * v, false, false);
          if (--this.st <= 0) {
            this.cycle++;
            const k = this.cycle % 3;
            if (k === 1) { this.socos = this.furioso ? 2 : 1; this.enter('prepSoco', 44); }
            else if (k === 2) this.enter('prepCarga', 55);
            else this.enter('rochas', 30);
          }
          break;
        }
        case 'prepSoco':
          gira(0.01);
          if (--this.st <= 0) {
            g.addEnt(new G.OndaInimiga(this.cx, this.y + this.h, 170, DANO));
            g.particles.burst(this.cx, this.y + this.h, 20, 5, 2.6, 24, 2);
            g.shake(8);
            Sound.play('boss');
            if (--this.socos > 0) this.enter('prepSoco', 24); else this.enter('recupera', 45);
          }
          break;
        case 'prepCarga':
          gira(0.08);
          this.x += Math.sin(this.st * 1.3) * 0.5;
          if (--this.st <= 0) { this.ang = alvoAng; this.enter('carga', 110); Sound.play('boss'); }
          break;
        case 'carga': {
          const hit = G.moveEnt(this, g.room, Math.cos(this.ang) * 3.3, Math.sin(this.ang) * 3.3, false, false);
          if ((this.st & 1) === 0) g.particles.spawn(this.cx, this.y + this.h, 0, 0, 14, 5, 2, 0);
          if (hit) {
            g.shake(10);
            Sound.play('kill');
            this.enter('atordoado', this.furioso ? 120 : 160);
            for (let k = 0, n = qtd(g, this.furioso ? 5 : 3); k < n; k++) {
              g.addEnt(new G.Marca(30 + rnd() * (VIEW_W - 60), 30 + rnd() * (VIEW_H - 60), DANO));
            }
            if (!this.avisouTonto) { this.avisouTonto = true; g.say('O COLOSSO ESTA ATORDOADO! BATA AGORA!', 110); }
          } else if (--this.st <= 0) this.enter('anda', 60);
          break;
        }
        case 'atordoado':
          if (--this.st <= 0) this.enter('anda', 80);
          break;
        case 'rochas':
          gira(0.05);
          if (--this.st <= 0) {
            tiros(g, this.cx, this.cy, alvoAng, this.furioso ? 5 : 3, 0.3, 2.1, 'rock');
            Sound.play('shoot');
            this.enter('anda', 70);
          }
          break;
        default:                                             // recupera
          if (--this.st <= 0) this.enter('anda', 90);
      }
      this.dir = G.dirFrom(Math.cos(this.ang), Math.sin(this.ang));
    }
    hurt(g, dmg, dx, dy) {
      const costas = dx * Math.cos(this.ang) + dy * Math.sin(this.ang) > 0.3;
      if (this.state === 'atordoado' || costas) {
        super.hurt(g, dmg * 2, dx, dy);
        this.knock = 0;
        if (costas) g.particles.burst(this.cx - Math.cos(this.ang) * 10, this.cy - Math.sin(this.ang) * 9, 8, 1, 2, 14);
        return;
      }
      Sound.play('blocked');
      g.particles.burst(this.cx - dx * 10, this.cy - dy * 10, 5, 5, 1.5, 10);
      if (!this.avisou) { this.avisou = true; g.say('A PEDRA NAO SENTE NADA... ATAQUE PELAS COSTAS!', 120); }
    }
    desenha(c, tick) {
      const cx = this.cx, cy = this.cy, fx = Math.cos(this.ang), fy = Math.sin(this.ang);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect((cx - 14) | 0, (this.y + this.h - 2) | 0, 28, 4);
      const ergue = this.state === 'prepSoco' ? -5 : 0;
      for (const s of [-1, 1]) {                           // punhos dos lados
        const ax = cx - fy * 16 * s, ay = cy + fx * 14 * s + ergue;
        px(c, ax - 5, ay - 5, 10, 10, '#3a3f4f');
        px(c, ax - 4, ay - 4, 8, 8, '#7a8090');
        px(c, ax - 4, ay - 4, 8, 2, '#a0a8b8');
      }
      px(c, cx - 14, cy - 14, 28, 26, '#3a3f4f');
      px(c, cx - 13, cy - 13, 26, 24, '#6a7080');
      px(c, cx - 13, cy - 13, 26, 3, '#8f96a8');
      px(c, cx - 6, cy - 4, 1, 7, '#3a3f4f'); px(c, cx - 5, cy + 3, 4, 1, '#3a3f4f'); px(c, cx + 6, cy - 10, 1, 5, '#3a3f4f');
      px(c, cx - 12, cy + 6, 6, 3, '#3f8a2a'); px(c, cx + 5, cy - 12, 6, 2, '#3f8a2a');
      const bx = cx - fx * 10, by = cy - fy * 9;          // nucleo nas costas
      const pisca = (tick >> 3) & 1;
      disco(c, bx, by, 4, '#8a4a10');
      disco(c, bx, by, 3, pisca ? '#ffd34d' : '#ff8a3d');
      px(c, bx - 1, by - 1, 2, 2, '#ffffff');
      const ex = cx + fx * 9, ey = cy + fy * 8 - 1;       // olhos na frente
      const olho = this.state === 'atordoado' ? '#3a4159' : this.state === 'prepCarga' || this.state === 'carga' ? '#e33b4e' : '#5ce1ff';
      px(c, ex - fy * 4 - 1, ey + fx * 4 - 1, 3, 2, olho);
      px(c, ex + fy * 4 - 1, ey - fx * 4 - 1, 3, 2, olho);
      if (this.state === 'atordoado') {
        for (let k = 0; k < 3; k++) {
          const a = tick * 0.2 + k * 2.1;
          px(c, cx + Math.cos(a) * 13, cy - 20 + Math.sin(a) * 3, 2, 2, '#ffd34d');
        }
      }
    }
  }

  /* ================= MUNDO 2 ================= */

  // MARIPOSA DO ABISMO: a arena fica no escuro (so a luz do heroi e dos lampioes).
  // Ela odeia a luz mas nao resiste: voa ate um lampiao aceso, se queima, cai e leva 2x o dano.
  // O po das asas apaga os lampioes por perto; o heroi reacende encostando neles.
  class Mariposa extends Chefe {
    constructor(x, y) {
      super(x, y, 22, 16, 230, 'MARIPOSA DO ABISMO');
      this.fly = true; this.gib = 8;
      this.enter('voa', 90);
      this.alvoL = null;
    }
    lampioes(g) { return g.ents.filter((e) => e.lampiao); }
    vai(tx, ty, v) {
      const dx = tx - this.cx, dy = ty - this.cy, d = Math.hypot(dx, dy) || 1;
      const s = Math.min(v, d);
      this.x = G.clamp(this.x + (dx / d) * s, 16, VIEW_W - this.w - 16);
      this.y = G.clamp(this.y + (dy / d) * s, 12, VIEW_H - this.h - 12);
      return d;
    }
    step(g) {
      const p = g.alvo(this);
      this.anim++;
      switch (this.state) {
        case 'voa': {
          const t = this.t * 0.03;
          this.vai(p.cx + Math.cos(t) * 70, p.cy - 30 + Math.sin(t * 1.7) * 24, this.furioso ? 1.3 : 1.0);
          this.x += Math.sin(this.t * 0.2) * 0.6;
          if (--this.st <= 0) {
            this.cycle++;
            const acesos = this.lampioes(g).filter((l) => l.aceso);
            if (acesos.length && rnd() < 0.7) { this.alvoL = acesos[(rnd() * acesos.length) | 0]; this.enter('atraida', 240); }
            else {
              const k = this.cycle % 3;
              if (k === 0) this.enter('prepRasante', 36);
              else if (k === 1) this.enter('po', 60);
              else this.enter('enxame', 30);
            }
          }
          break;
        }
        case 'atraida':
          if (!this.alvoL.aceso) { this.enter('voa', 40); break; }
          if (this.vai(this.alvoL.cx, this.alvoL.cy - 6, 1.6) < 6) {
            this.alvoL.apaga(g);
            this.fly = false;
            g.particles.burst(this.cx, this.cy, 24, 9, 2.4, 26);
            Sound.play('fire');
            g.shake(5);
            this.enter('queimada', this.furioso ? 130 : 170);
            if (!this.queimou) { this.queimou = true; g.say('A LUZ QUEIMOU AS ASAS DELA! ATAQUE!', 120); }
          } else if (--this.st <= 0) this.enter('voa', 40);
          break;
        case 'queimada':
          if ((this.anim & 3) === 0) g.particles.spawn(this.cx + (rnd() - 0.5) * 16, this.cy, 0, -0.7, 14, 9, 1, 0);
          if (--this.st <= 0) { this.fly = true; this.enter('voa', 70); }
          break;
        case 'prepRasante':
          this.vai(p.cx, p.cy - 50, 1.2);
          if (--this.st <= 0) {
            const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
            this.bx = Math.cos(a) * 3.6; this.by = Math.sin(a) * 3.6;
            Sound.play('swing');
            this.enter('rasante', 40);
          }
          break;
        case 'rasante':
          this.x = G.clamp(this.x + this.bx, 8, VIEW_W - this.w - 8);
          this.y = G.clamp(this.y + this.by, 8, VIEW_H - this.h - 8);
          if ((this.st & 1) === 0) g.particles.spawn(this.cx, this.cy, 0, 0, 16, 8, 1, 0);
          if (--this.st <= 0) this.enter('voa', 60);
          break;
        case 'po':
          if (this.st === 60) {
            for (const l of this.lampioes(g)) if (G.dist(l.cx, l.cy, this.cx, this.cy) < 110) l.apaga(g);
            Sound.play('spin');
          }
          if (this.st % 6 === 0 && this.st < 54) {
            const n = qtd(g, this.furioso ? 3 : 2);
            for (let k = 0; k < n; k++) {
              const a = this.t * 0.23 + (k * Math.PI * 2) / n;
              g.addEnt(new G.Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 1.4, Math.sin(a) * 1.4, 'dark', DANO));
            }
          }
          if ((this.st & 1) === 0) g.particles.spawn(this.cx + (rnd() - 0.5) * 30, this.cy, (rnd() - 0.5) * 0.6, 0.5, 30, 5, 1, 0);
          if (--this.st <= 0) this.enter('voa', 80);
          break;
        case 'enxame':
          if (--this.st <= 0) {
            const vivos = g.ents.filter((e) => e.enemy && !e.boss && !e.dead).length;
            if (vivos < 5) {
              for (let k = 0, n = qtd(g, 2); k < n; k++) {
                const m = G.spawnEnemy('mosquito', this.cx - 10 + k * 20, this.cy);
                g.addEnt(m);
                g.particles.burst(m.cx, m.cy, 10, 8, 1.6, 16);
              }
              Sound.play('secret');
            }
            this.enter('voa', 80);
          }
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.state === 'queimada') dmg *= 2;
      super.hurt(g, dmg, dx, dy);
    }
    // escuridao da arena: buraco de luz em volta dos herois, dos lampioes acesos e dos tiros
    escuridao(c, g, ox, oy) {
      if (!Mariposa.cv) Mariposa.cv = G.mkCanvas(VIEW_W, VIEW_H);
      const cv = Mariposa.cv, x = cv.getContext('2d');
      x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, VIEW_W, VIEW_H);
      x.fillStyle = 'rgba(2,0,10,0.94)';
      x.fillRect(0, 0, VIEW_W, VIEW_H);
      x.globalCompositeOperation = 'destination-out';
      const luz = (lx, ly, r) => {
        const gr = x.createRadialGradient(lx, ly, r * 0.3, lx, ly, r);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr;
        x.fillRect(lx - r, ly - r, r * 2, r * 2);
      };
      for (const p of g.players) if (!p.dead) luz(p.cx, p.cy, 44);
      for (const e of g.ents) {
        if (e.lampiao) luz(e.cx, e.cy, e.aceso ? 66 : 12);
        else if (e.shot && !e.friendly) luz(e.cx, e.cy, 14);
        else if (e.pickup) luz(e.cx, e.cy, 12);
      }
      if (this.state === 'queimada') luz(this.cx, this.cy, 38);
      x.globalCompositeOperation = 'source-over';
      c.drawImage(cv, ox, oy);
      // os olhos vermelhos aparecem mesmo no escuro
      const olho = (g.tick >> 4) & 1 ? '#ff3050' : '#ff7090';
      px(c, ox + this.cx - 5, oy + this.cy - 4, 2, 2, olho);
      px(c, ox + this.cx + 3, oy + this.cy - 4, 2, 2, olho);
    }
    desenha(c, tick) {
      const cx = this.cx, bob = this.fly ? Math.sin(tick * 0.1) * 2 : 3, cy = this.cy + bob;
      const q = this.state === 'queimada';
      const f = Math.abs(Math.sin(tick * (q ? 0.05 : 0.35)));
      const ww = 6 + f * 12;
      if (this.fly) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect((cx - 8) | 0, (this.y + this.h + 6) | 0, 16, 3); }
      const asa = q ? '#3a2418' : '#5a4a70', asa2 = q ? '#2a1a10' : '#3a2a4c', mancha = q ? '#ff8a3d' : '#b45cff';
      px(c, cx - 3 - ww, cy - 9, ww, 9, asa); px(c, cx + 3, cy - 9, ww, 9, asa);
      px(c, cx - 3 - ww * 0.7, cy, ww * 0.7, 6, asa2); px(c, cx + 3, cy, ww * 0.7, 6, asa2);
      if (ww > 10) { px(c, cx - 3 - ww * 0.6, cy - 6, 3, 3, mancha); px(c, cx + 3 + ww * 0.6 - 3, cy - 6, 3, 3, mancha); }
      px(c, cx - 3, cy - 10, 6, 17, '#1a1024');
      px(c, cx - 2, cy - 9, 4, 3, '#2a1a3a');
      px(c, cx - 4, cy - 14, 1, 4, '#5a4a70'); px(c, cx + 3, cy - 14, 1, 4, '#5a4a70');
      px(c, cx - 5, cy - 4, 2, 2, '#ff3050'); px(c, cx + 3, cy - 4, 2, 2, '#ff3050');
    }
  }

  // ECO DAS FENDAS: nao se luta com ele no mapa. Ao chegar perto, comeca a batalha
  // estilo Undertale (batalha.js). A vida dele e a da batalha.
  function spriteEco(tick, paz) {
    if (!spriteEco.cv) spriteEco.cv = G.mkCanvas(32, 36);
    const cv = spriteEco.cv, c = cv.getContext('2d');
    c.clearRect(0, 0, 32, 36);
    const corpo = paz ? '#fff6c8' : '#bfe4ff', sombra = paz ? '#e8d890' : '#7fa6d8';
    disco(c, 16, 11, 9, sombra);
    disco(c, 16, 10, 8, corpo);
    px(c, 7, 11, 18, 12, corpo);
    for (let x = 0; x < 18; x += 3) {                       // cauda ondulando
      const h = 6 + Math.round(Math.sin(tick * 0.1 + x * 0.6) * 3);
      px(c, 7 + x, 22, 3, h, x % 2 ? sombra : corpo);
    }
    px(c, 4, 13 + Math.round(Math.sin(tick * 0.08) * 2), 4, 3, corpo);   // bracos
    px(c, 24, 13 + Math.round(Math.cos(tick * 0.08) * 2), 4, 3, corpo);
    px(c, 11, 8, 3, 4, '#101020'); px(c, 18, 8, 3, 4, '#101020');        // olhos vazios
    if (!paz) {
      const l = (tick >> 2) % 8;
      px(c, 12, 12 + l, 1, 2, '#5ce1ff'); px(c, 19, 12 + ((l + 4) % 8), 1, 2, '#5ce1ff');   // lagrimas
      px(c, 13, 16, 6, 1, '#101020'); px(c, 12, 17, 1, 1, '#101020'); px(c, 19, 17, 1, 1, '#101020');
    } else {
      px(c, 12, 16, 1, 1, '#101020'); px(c, 13, 17, 6, 1, '#101020'); px(c, 19, 16, 1, 1, '#101020');
    }
    return cv;
  }
  G.spriteEco = spriteEco;

  class Eco extends Chefe {
    constructor(x, y) {
      super(x, y, 20, 24, 500, 'ECO DAS FENDAS');
      this.touch = 0; this.fly = true; this.fracF = 500;
      this.iniciou = false;
    }
    step(g) {
      this.anim++;
      this.y += Math.sin(this.t * 0.05) * 0.15;
      if (!this.iniciou && this.t > 70 && !g.player.dead) { this.iniciou = true; g.iniciaBatalha(this); }
    }
    hurt(g) {
      Sound.play('blocked');
      if (!this.avisou) { this.avisou = true; g.say('ELE NAO QUER LUTAR ASSIM...', 80); }
    }
    desenha(c, tick) {
      c.drawImage(spriteEco(tick, false), (this.cx - 16) | 0, (this.y - 8) | 0);
    }
  }

  /* ================= MUNDO 3 ================= */

  // O REFLEXO: uma copia sombria do heroi que repete cada passo, espelhada.
  // Golpes nao o ferem; so a lava (que ele pisa sem ver) queima. Abaixo da metade
  // o espelho vira: ele copia de cabeca para baixo. De tempos em tempos o vidro racha e ele caca.
  const ESPELHA = { left: 'right', right: 'left', up: 'up', down: 'down',
    upleft: 'upright', upright: 'upleft', downleft: 'downright', downright: 'downleft' };
  const INVERTE = { up: 'down', down: 'up', left: 'left', right: 'right',
    upleft: 'downleft', downleft: 'upleft', upright: 'downright', downright: 'upright' };

  class Reflexo extends Chefe {
    constructor(x, y) {
      super(x, y, 10, 10, 300, 'O REFLEXO');
      this.fly = true; this.touch = 0; this.alpha = 0; this.eixo = 1;
      this.cdTiro = 150; this.cdQuebra = 480; this.dirE = 'down'; this.cls = 'guerreiro';
      this.enter('surge', 60);
    }
    espelho(p) {
      return { x: VIEW_W - p.x - p.w, y: this.eixo === 2 ? VIEW_H - p.y - p.h : p.y };
    }
    naLava(g) {
      return G.tileAt(g.room, (this.cx / TILE) | 0, ((this.y + this.h - 3) / TILE) | 0) === G.T.LAVA;
    }
    queima(g) {
      G.Enemy.prototype.hurt.call(this, g, 30, 0, -1);
      this.knock = 0;
      if (this.dead) return;
      g.particles.burst(this.cx, this.cy, 26, 9, 2.4, 26);
      Sound.play('fire');
      g.shake(6);
      this.enter('livre', 110);
      if (!this.queimou) { this.queimou = true; g.say('A LAVA QUEIMOU O REFLEXO!', 100); }
    }
    step(g) {
      const p = g.player.dead ? g.alvo(this) : g.player;
      const m = this.espelho(p);
      this.cls = p.cls;
      this.anim++;
      if (!this.virou && this.hp < this.maxhp * 0.5) {
        this.virou = true; this.eixo = 2;
        this.enter('volta', 60);
        g.flashT = 12;
        Sound.play('boss');
        g.say('O REFLEXO INVERTEU O ESPELHO!\nAGORA ELE COPIA DE CABECA PARA BAIXO.', 160);
      }
      switch (this.state) {
        case 'surge':
          this.x = m.x; this.y = m.y;
          this.alpha = 1 - this.st / 60;
          if (--this.st <= 0) { this.alpha = 1; this.touch = DANO; this.enter('espelho', 0); g.say('ELE COPIA CADA PASSO SEU...', 110); }
          break;
        case 'espelho': {
          const mx = m.x - this.x, my = m.y - this.y;
          this.x = m.x; this.y = m.y;
          this.dirE = this.eixo === 2 ? INVERTE[ESPELHA[p.dir]] : ESPELHA[p.dir];
          if (Math.abs(mx) + Math.abs(my) > 0.1) this.anim += 2;
          if (--this.cdTiro <= 0) {
            this.cdTiro = this.furioso ? 100 : 150;
            tiros(g, this.cx, this.cy, Math.atan2(p.cy - this.cy, p.cx - this.cx), 3, 0.28, 1.8);
            Sound.play('shoot');
          }
          if (this.naLava(g)) { this.queima(g); break; }
          if (--this.cdQuebra <= 0) {
            this.cdQuebra = 480;
            this.enter('quebra', 150);
            g.shake(5);
            Sound.play('kill');
            g.say('O VIDRO RACHOU! ELE VEM ATRAS DE VOCE!', 90);
          }
          break;
        }
        case 'livre':
        case 'quebra': {
          const v = this.state === 'quebra' ? 1.45 : 1.15;
          const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
          G.moveEnt(this, g.room, (dx / d) * v, (dy / d) * v, true, false);
          this.dirE = G.dir8(dx, dy);
          this.anim += 2;
          if (this.state === 'quebra' && this.naLava(g)) { this.queima(g); break; }
          if (--this.st <= 0) { this.touch = 0; this.enter('volta', 45); }
          break;
        }
        case 'volta':
          this.x += (m.x - this.x) * 0.15;
          this.y += (m.y - this.y) * 0.15;
          if (--this.st <= 0) { this.touch = DANO; this.enter('espelho', 0); }
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      Sound.play('blocked');
      g.particles.burst(this.cx - dx * 6, this.cy - dy * 6, 6, 4, 1.6, 12);
      if (!this.avisou) { this.avisou = true; g.say('SEUS GOLPES SO ACERTAM O VIDRO...', 100); }
    }
    desenha(c, tick, S) {
      const arte = S.heroes[this.cls] || S.heroes.guerreiro;
      const img = arte.walk[this.dirE || 'down'][(this.anim >> 3) & 1];
      if (!Reflexo.cv) Reflexo.cv = G.mkCanvas(16, 16);
      const t = Reflexo.cv.getContext('2d');
      t.globalCompositeOperation = 'source-over';
      t.clearRect(0, 0, 16, 16);
      t.drawImage(img, 0, 0);
      t.globalCompositeOperation = 'source-atop';
      t.fillStyle = this.state === 'quebra' ? 'rgba(140,0,40,0.7)' : 'rgba(50,0,90,0.72)';
      t.fillRect(0, 0, 16, 16);
      t.globalCompositeOperation = 'source-over';
      const dx = (this.cx - 8) | 0, dy = (this.y + this.h - 14) | 0;
      if (this.eixo === 2) {
        c.save();
        c.translate(dx, dy + 16);
        c.scale(1, -1);
        c.drawImage(Reflexo.cv, 0, 0);
        c.restore();
      } else c.drawImage(Reflexo.cv, dx, dy);
      if ((tick >> 3) & 1) { px(c, dx + 6, dy + (this.eixo === 2 ? 10 : 5), 1, 1, '#ffffff'); px(c, dx + 9, dy + (this.eixo === 2 ? 10 : 5), 1, 1, '#ffffff'); }
      const rachas = 3 - Math.ceil((this.hp / this.maxhp) * 3);
      for (let k = 0; k < rachas; k++) G.linhaPx(c, dx + 3 + k * 4, dy + 2, dx + 6 + k * 3, dy + 12, '#c8e8ff', 0);
    }
  }

  // escudo do coracao: fragmento de cristal que gira em volta dele
  class EscudoNucleo extends G.Enemy {
    constructor(core, k, n) {
      super(core.cx, core.cy, 12, 12, 14);
      this.core = core; this.k = k; this.n = n;
      this.fly = true; this.touch = DANO; this.gib = 8; this.loot = 1;
    }
    step() {
      const a = this.core.ang * 2 + (this.k * Math.PI * 2) / this.n;
      const r = 40 + Math.sin(this.core.anim * 0.05) * 6;
      this.x = this.core.cx + Math.cos(a) * r - 6;
      this.y = this.core.cy + Math.sin(a) * r * 0.8 - 6;
      this.anim++;
    }
    hurt(g, dmg, dx, dy) { super.hurt(g, dmg, dx, dy); this.knock = 0; }
    draw(c, S, tick) {
      if (this.hurtT > 0 && (tick & 2)) return;
      const x = this.cx | 0, y = this.cy | 0, b = (tick >> 3) & 1;
      px(c, x - 1, y - 7, 3, 14, '#5a2a7a');
      px(c, x - 4, y - 4, 9, 8, '#5a2a7a');
      px(c, x - 3, y - 5, 7, 10, b ? '#b45cff' : '#8a3ad8');
      px(c, x - 1, y - 6, 3, 12, '#d9a6ff');
      px(c, x, y - 3, 1, 3, '#ffffff');
    }
  }

  // CORACAO DO COLAPSO: o coracao do mundo, podre. Parado no meio da arena.
  // Fase 1: 4 escudos de cristal protegem o nucleo; quebre todos para expor.
  // Fase 2: gravidade puxa todos para o centro enquanto espirais e ecos dos chefes caem.
  // Fase 3: o mundo encolhe, as bordas da arena viram vazio.
  class Coracao extends Chefe {
    constructor(x, y) {
      super(x, y, 32, 32, 520, 'CORACAO DO COLAPSO');
      this.fly = true; this.gib = 8;
      this.fase = 1; this.escudos = []; this.exposto = 0;
      this.ang = 0; this.anelN = 0; this.cdAnel = 60; this.cdAtk = 150; this.jorro = 0; this.cdEscudo = 600;
      this.enter('desperta', 80);
    }
    criaEscudos(g, n) {
      n = qtd(g, n);
      for (let k = 0; k < n; k++) {
        const e = new EscudoNucleo(this, k, n);
        e.step();
        g.addEnt(e);
        this.escudos.push(e);
        g.particles.burst(e.cx, e.cy, 8, 8, 1.6, 14);
      }
      Sound.play('cast');
    }
    step(g) {
      if (this.casa === undefined) this.casa = [this.x, this.y];
      this.x = this.casa[0]; this.y = this.casa[1];
      this.anim++;
      this.ang += 0.012 * this.fase;
      const f = this.hp / this.maxhp;
      const fase = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
      if (fase !== this.fase) {
        this.fase = fase;
        g.flashT = 14; g.shake(10);
        Sound.play('boss');
        g.say(fase === 2 ? 'O CORACAO PUXA TUDO PARA DENTRO!' : 'O MUNDO ESTA ENCOLHENDO!', 130);
        this.cdAnel = 60;
      }
      if (this.state === 'desperta') {
        if (--this.st <= 0) { this.criaEscudos(g, 4); this.enter('luta', 0); }
        return;
      }
      this.escudos = this.escudos.filter((e) => !e.dead);
      if (this.fase === 1) {
        if (!this.escudos.length && this.exposto <= 0) {
          this.exposto = 360;
          g.say('O NUCLEO ESTA EXPOSTO!', 90);
          Sound.play('secret');
        }
        if (this.exposto > 0 && --this.exposto === 0 && this.fase === 1) this.criaEscudos(g, 4);
      } else if (!this.escudos.length && --this.cdEscudo <= 0) {
        this.cdEscudo = 720;
        this.criaEscudos(g, 2);
      }

      if (this.fase >= 2) {                                 // gravidade
        const forca = this.fase === 2 ? 0.55 : 0.4;
        for (const p of g.players) {
          if (p.dead || p.roll > 0) continue;
          const dx = this.cx - p.cx, dy = this.cy - p.cy, d = Math.hypot(dx, dy) || 1;
          if (d > 22) G.moveEnt(p, g.room, (dx / d) * forca, (dy / d) * forca, false, false);
        }
        if ((this.anim & 1) === 0) {
          const a = rnd() * Math.PI * 2, r = 90 + rnd() * 60;
          g.particles.spawn(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r * 0.6, -Math.cos(a) * 1.6, -Math.sin(a), 40, 8, 1, 0);
        }
      }

      if (--this.cdAtk <= 0) this.ataque(g);
      if (this.jorro > 0) {
        this.jorro--;
        if (this.jorro % (this.fase === 3 ? 5 : 7) === 0) {
          const bracos = qtd(g, this.fase === 3 ? 3 : 2);
          for (let k = 0; k < bracos; k++) {
            const a = this.anim * 0.09 + (k * Math.PI * 2) / bracos;
            g.addEnt(new G.Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 1.35, Math.sin(a) * 1.35, 'dark', DANO));
          }
        }
      }
      if (this.fase === 3 && this.anelN < 2 && --this.cdAnel <= 0) {
        this.anelN++;
        this.encolhe(g, this.anelN);
        this.cdAnel = 480;
      }
    }
    ataque(g) {
      const k = this.cycle++ % 3, f = this.fase;
      if (k === 0) {
        anel(g, this.cx, this.cy, 12 + f * 4, 1.2, this.ang);
        Sound.play('boss');
        this.cdAtk = 110 - f * 15;
      } else if (k === 1) {
        this.jorro = 120;
        Sound.play('spin');
        this.cdAtk = 170;
      } else {
        // ecos dos chefes caidos: raios nos herois, onda de choque e rasgos
        for (const p of g.players) if (!p.dead) g.addEnt(new G.Marca(p.cx, p.cy, DANO));
        if (f >= 2) g.addEnt(new G.OndaInimiga(this.cx, this.cy + 16, 200, DANO));
        if (f === 3) { const p = g.alvo(this); g.addEnt(new Rasgo(p.cy, 'h')); g.addEnt(new Rasgo(p.cx, 'v')); }
        Sound.play('cast');
        this.cdAtk = 130 - f * 10;
      }
    }
    // as bordas viram vazio (anel 1 e depois anel 2); quem estiver em cima e empurrado para dentro
    encolhe(g, k) {
      const room = g.room, T = G.T;
      const linhas = [k, ROOM_H - 1 - k];
      const colunas = k === 1 ? [1, 2, ROOM_W - 2, ROOM_W - 3] : [3, 4, ROOM_W - 4, ROOM_W - 5];
      for (let x = 1; x < ROOM_W - 1; x++) for (const y of linhas) G.setTile(room, x, y, T.PIT);
      for (let y = 1; y < ROOM_H - 1; y++) for (const x of colunas) G.setTile(room, x, y, T.PIT);
      for (const p of g.players) {
        for (let n = 0; n < 120 && G.boxSolid(room, p.x, p.y, p.w, p.h, false); n++) {
          const dx = this.cx - p.cx, dy = this.cy - p.cy, d = Math.hypot(dx, dy) || 1;
          p.x += (dx / d) * 2; p.y += (dy / d) * 2;
        }
      }
      g.shake(12);
      Sound.play('kill');
      for (let n = 0; n < 40; n++) g.particles.spawn(rnd() * VIEW_W, (rnd() < 0.5 ? k : ROOM_H - 1 - k) * TILE + 8, 0, -0.5, 30, 8, 2, 0);
    }
    hurt(g, dmg, dx, dy) {
      if (this.state === 'desperta' || (this.fase === 1 && this.escudos.some((e) => !e.dead))) {
        Sound.play('blocked');
        g.particles.burst(this.cx - dx * 14, this.cy - dy * 14, 5, 8, 1.4, 10);
        if (!this.avisou) { this.avisou = true; g.say('OS ESCUDOS PROTEGEM O NUCLEO!', 90); }
        return;
      }
      super.hurt(g, dmg, dx, dy);
      this.knock = 0;
    }
    die(g) {
      if (g.room.meta.orig) { g.room.tiles.set(g.room.meta.orig); g.room.dirty = true; }
      for (const e of this.escudos) e.dead = true;
      super.die(g);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      const bate = (tick % (this.fase === 3 ? 24 : 40)) < 5 ? 2 : 0;
      disco(c, cx, cy, 17 + bate, '#2a0f1a');
      disco(c, cx, cy, 15 + bate, this.fase === 3 && (tick & 4) ? '#e33b4e' : '#8a1a30');
      disco(c, cx, cy, 11 + bate, '#c8304a');
      disco(c, cx - 3, cy - 4, 4, '#ff8090');
      G.linhaPx(c, cx - 10, cy - 8, cx + 2, cy + 3, '#12061c', 0);     // rachaduras
      G.linhaPx(c, cx + 2, cy + 3, cx + 9, cy - 2, '#12061c', 0);
      G.linhaPx(c, cx + 2, cy + 3, cx - 1, cy + 13, '#12061c', 0);
      const escudado = this.fase === 1 && this.escudos.some((e) => !e.dead);
      if (escudado) {
        c.strokeStyle = (tick & 8) ? 'rgba(180,92,255,0.8)' : 'rgba(217,166,255,0.6)';
        c.lineWidth = 1;
        c.beginPath(); c.arc(cx + 0.5, cy + 0.5, 21, 0, Math.PI * 2); c.stroke();
      }
      for (let k = 0; k < 6; k++) {                          // fragmentos orbitando
        const a = this.ang * 3 + k * 1.047, r = 24 + Math.sin(tick * 0.05 + k) * 2;
        px(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, 2, 2, '#ffd34d');
      }
    }
  }

  /* ================= mundo 4: DESERTO DOS ESPELHOS ================= */

  // RAINHA ESCARAVELHO: cava por baixo da areia (nao da para acertar), sai embaixo do heroi,
  // se enrola numa bola que ricocheteia nas paredes e chama escorpioes. Quando a bola bate
  // na parede ela fica tonta de barriga para cima: e a hora de bater (2x de dano).
  class Rainha extends Chefe {
    constructor(x, y) {
      super(x, y, 26, 20, 190, 'RAINHA ESCARAVELHO');
      this.gib = 9; this.filhos = 0; this.giro = 0;
      this.enter('anda', 70);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim++;
      switch (this.state) {
        case 'anda':
          this.chase(g, this.furioso ? 0.8 : 0.55);
          if (--this.st <= 0) {
            this.cycle++;
            if (this.cycle % 3 === 0 && this.filhos < (this.furioso ? 6 : 4)) this.enter('chama', 40);
            else if (this.cycle % 3 === 1) this.enter('cava', 70);
            else this.enter('enrola', 34);
          }
          break;
        case 'cava':                                   // debaixo da areia: imune e rapido
          this.touch = 0; this.alpha = 0.25;
          this.move(g, (dx / d) * 2.1, (dy / d) * 2.1);
          if ((g.tick & 2) === 0) g.particles.spawn(this.cx, this.cy + 6, (rnd() - 0.5) * 1.4, -0.7, 16, 1, 1, 0);
          if (--this.st <= 0 || d < 14) {
            this.alpha = 1; this.touch = DANO;
            g.particles.burst(this.cx, this.cy, 22, 1, 2.4, 24);
            g.shake(5);
            Sound.play('boss');
            this.enter('emerge', 26);
          }
          break;
        case 'emerge':
          if (--this.st <= 0) this.enter('anda', 60);
          break;
        case 'enrola':                                 // se enrola antes de rolar
          this.giro += 0.3;
          this.x += Math.sin(this.st * 0.9) * 0.6;
          if (--this.st <= 0) {
            this.bx = (dx / d) * (this.furioso ? 4.4 : 3.6);
            this.by = (dy / d) * (this.furioso ? 4.4 : 3.6);
            this.ricochete = this.furioso ? 3 : 2;
            Sound.play('swing');
            this.enter('bola', 200);
          }
          break;
        case 'bola': {
          this.giro += 0.45;
          const hit = G.moveEnt(this, g.room, this.bx, this.by, false, false);
          if ((g.tick & 1) === 0) g.particles.spawn(this.cx, this.cy + 6, -this.bx * 0.2, -this.by * 0.2, 12, 1, 1, 0);
          if (hit) {
            if (hit & 1) this.bx = -this.bx;
            if (hit & 2) this.by = -this.by;
            g.shake(6);
            Sound.play('goldhit');
            if (--this.ricochete <= 0) { this.enter('tonta', this.furioso ? 70 : 100); this.touch = 0; }
          }
          if (--this.st <= 0) { this.enter('anda', 60); this.touch = DANO; }
          break;
        }
        case 'tonta':
          this.giro = 0;
          if (--this.st <= 0) { this.touch = DANO; this.enter('anda', 50); }
          break;
        case 'chama':
          if (this.st === 20) {
            const n = qtd(g, this.furioso ? 3 : 2);
            for (let k = 0; k < n; k++) {
              const a = (k / n) * Math.PI * 2;
              const e = G.spawnEnemy('escorpiao', G.clamp(this.cx + Math.cos(a) * 30, 20, VIEW_W - 30),
                G.clamp(this.cy + Math.sin(a) * 24, 20, VIEW_H - 30));
              g.addEnt(e);
              g.particles.burst(e.cx, e.cy, 12, 1, 1.8, 18);
              this.filhos++;
            }
            Sound.play('secret');
            g.say('A RAINHA CHAMA A NINHADA!', 70);
          }
          if (--this.st <= 0) this.enter('anda', 60);
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.state === 'cava') { Sound.play('blocked'); return; }        // areia protege
      if (this.state === 'tonta') dmg *= 2;                                 // de barriga para cima
      else if (this.state === 'bola') { Sound.play('blocked'); return; }    // casco em rotacao
      super.hurt(g, dmg, dx, dy);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      if (this.state === 'cava') {                       // so o monte de areia andando
        px(c, cx - 10, cy + 2, 20, 4, '#c3ae76');
        px(c, cx - 7, cy, 14, 3, '#e8d9a2');
        px(c, cx - 3, cy - 2, 6, 2, '#f7eec9');
        return;
      }
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(cx - 12, (this.y + this.h + 1) | 0, 24, 3);
      const bola = this.state === 'bola' || this.state === 'enrola';
      if (bola) {
        disco(c, cx, cy, 12, '#7d4a1c');
        disco(c, cx, cy, 10, '#b8743a');
        for (let k = 0; k < 5; k++) {
          const a = this.giro + k * 1.25;
          px(c, cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, 3, 2, '#5c3313');
        }
        px(c, cx - 2, cy - 2, 4, 3, '#dda05c');
        return;
      }
      const tonta = this.state === 'tonta';
      px(c, cx - 13, cy - 8, 26, 16, tonta ? '#8a5f2a' : '#7d4a1c');
      px(c, cx - 11, cy - 7, 22, 12, '#b8743a');
      px(c, cx - 11, cy - 7, 22, 3, '#dda05c');
      for (let k = 0; k < 4; k++) px(c, cx - 11 + k * 6, cy - 4, 1, 9, '#7d4a1c');
      px(c, cx - 4, cy - 12, 8, 5, '#8a5f2a');           // cabeca
      px(c, cx - 6, cy - 14, 3, 3, '#dda05c'); px(c, cx + 3, cy - 14, 3, 3, '#dda05c');   // chifres
      const olho = tonta ? '#5c667e' : '#ffd34d';
      px(c, cx - 3, cy - 11, 2, 2, olho); px(c, cx + 1, cy - 11, 2, 2, olho);
      px(c, cx - 3, cy - 17, 6, 3, '#c79a1f');           // coroa
      px(c, cx - 4, cy - 15, 8, 2, '#ffd34d');
      if (tonta) {
        for (let k = 0; k < 3; k++) {
          const a = tick * 0.2 + k * 2.1;
          px(c, cx + Math.cos(a) * 12, cy - 20 + Math.sin(a) * 3, 2, 2, '#ffd34d');
        }
      }
    }
  }

  // espelho da esfinge: cristal que a protege; enquanto um estiver de pe ela nao sente nada
  class EspelhoEsfinge extends G.Enemy {
    constructor(dona, x, y) {
      super(x - 7, y - 12, 14, 24, 18);
      this.dona = dona; this.touch = 0; this.gib = 4; this.loot = 0; this.espelho = true;
    }
    step(g) {
      this.anim++;
      if ((g.tick & 15) === 0) g.particles.spawn(this.cx, this.cy - 8, 0, -0.3, 14, 4, 1, 0);
    }
    die(g) {
      this.dead = true;
      g.particles.burst(this.cx, this.cy, 22, 4, 2.4, 24, 2);
      g.shake(5);
      Sound.play('kill');
      if (this.dona && !this.dona.dead) this.dona.espelhoQuebrou(g);
    }
    draw(c, S, tick) {
      if (this.hurtT > 0 && (tick & 2)) return;
      const x = this.x | 0, y = this.y | 0;
      px(c, x - 1, y + 22, 16, 3, 'rgba(0,0,0,0.25)');
      px(c, x, y, 14, 24, '#4f6b7d');
      px(c, x + 1, y + 1, 12, 22, '#8fa9bd');
      px(c, x + 2, y + 2, 5, 20, '#cfe6f2');
      px(c, x + 9, y + 4, 3, 16, '#6d859a');
      const b = (tick >> 3) & 1;
      px(c, x + 4, y + 6 + b, 2, 2, '#ffffff');
      const trincas = 3 - Math.ceil((this.hp / this.maxhp) * 3);
      for (let k = 0; k < trincas; k++) G.linhaPx(c, x + 2 + k * 4, y + 3, x + 6 + k * 3, y + 20, '#2f3644', 0);
    }
  }

  // ESFINGE DE VIDRO: guarda quatro espelhos. Enquanto sobrar um, os golpes atravessam ela.
  // Quebre todos e ela fica exposta por 8 s antes de erguer os espelhos de novo.
  class Esfinge extends Chefe {
    constructor(x, y) {
      super(x, y, 28, 24, 200, 'ESFINGE DE VIDRO');
      this.gib = 4; this.espelhos = []; this.exposta = 0; this.cdFeixe = 120; this.rodada = 0;
      this.enter('desperta', 60);
    }
    ergueEspelhos(g) {
      this.espelhos = [];
      const cantos = [[52, 44], [VIEW_W - 52, 44], [52, VIEW_H - 40], [VIEW_W - 52, VIEW_H - 40]];
      const n = Math.max(2, 4 - this.rodada);
      for (let k = 0; k < n; k++) {
        const e = new EspelhoEsfinge(this, cantos[k][0], cantos[k][1]);
        this.espelhos.push(e);
        g.addEnt(e);
        g.particles.burst(e.cx, e.cy, 16, 4, 2, 22);
      }
      this.rodada++;
      Sound.play('secret');
      g.say('OS ESPELHOS SE ERGUEM: OS GOLPES NAO CHEGAM NELA.', 110);
    }
    vivos() { return this.espelhos.filter((e) => !e.dead).length; }
    espelhoQuebrou(g) {
      if (this.vivos() > 0) return;
      this.exposta = this.furioso ? 420 : 480;
      g.flashT = 10;
      Sound.play('boss');
      g.say('O ULTIMO ESPELHO CAIU! BATA NELA AGORA!', 110);
    }
    step(g) {
      const p = g.alvo(this);
      this.anim++;
      if (this.exposta > 0) {
        this.exposta--;
        if (this.exposta === 0) this.ergueEspelhos(g);
      }
      switch (this.state) {
        case 'desperta':
          if (--this.st <= 0) { this.ergueEspelhos(g); this.enter('ronda', 90); }
          break;
        case 'ronda': {
          const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
          if (d > 70) this.move(g, (dx / d) * 0.6, (dy / d) * 0.6);
          if (--this.cdFeixe <= 0) {
            this.cdFeixe = this.exposta > 0 ? 150 : this.furioso ? 80 : 110;
            this.enter('feixe', 40);
          }
          if (--this.st <= 0) this.enter('areia', 90);
          break;
        }
        case 'feixe':                                   // raio que ricocheteia nos espelhos vivos
          if (this.st === 20) {
            const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
            g.addEnt(new G.FeixeVazio(this.cx, this.cy, Math.cos(a), Math.sin(a)));
            for (const e of this.espelhos) {
              if (e.dead || !sai(g)) continue;
              const ea = Math.atan2(p.cy - e.cy, p.cx - e.cx);
              g.addEnt(new G.FeixeVazio(e.cx, e.cy, Math.cos(ea), Math.sin(ea)));
            }
            Sound.play('cast');
          }
          if (--this.st <= 0) this.enter('ronda', 80);
          break;
        case 'areia':                                   // sopro de areia em leque
          if (this.st % 12 === 0 && this.st > 30) {
            const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
            tiros(g, this.cx, this.cy, a, 5, 0.22, 1.9, 'rock');
            Sound.play('shoot');
          }
          if (--this.st <= 0) this.enter('ronda', 90);
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.vivos() > 0) {
        Sound.play('blocked');
        g.particles.burst(this.cx - dx * 6, this.cy - dy * 6, 6, 4, 1.6, 12);
        if (!this.avisou) { this.avisou = true; g.say('QUEBRE OS ESPELHOS PRIMEIRO.', 100); }
        return;
      }
      super.hurt(g, dmg * 2, dx, dy);                    // exposta: dano dobrado
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(cx - 13, (this.y + this.h + 1) | 0, 26, 3);
      const prot = this.vivos() > 0;
      px(c, cx - 14, cy - 6, 28, 14, '#6d859a');         // corpo de leoa
      px(c, cx - 13, cy - 5, 26, 10, prot ? '#8fa9bd' : '#c2a163');
      px(c, cx - 13, cy - 5, 26, 2, '#cfe6f2');
      px(c, cx - 15, cy + 4, 5, 4, '#6d859a'); px(c, cx + 10, cy + 4, 5, 4, '#6d859a');
      px(c, cx - 6, cy - 16, 12, 11, prot ? '#8fa9bd' : '#c2a163');   // cabeca
      px(c, cx - 8, cy - 15, 3, 9, '#cfe6f2'); px(c, cx + 5, cy - 15, 3, 9, '#cfe6f2');
      px(c, cx - 4, cy - 12, 3, 2, '#1d1a24'); px(c, cx + 1, cy - 12, 3, 2, '#1d1a24');
      px(c, cx - 2, cy - 8, 4, 1, '#5d7286');
      px(c, cx - 7, cy - 19, 14, 4, '#c79a1f');          // toucado
      px(c, cx - 6, cy - 18, 12, 1, '#ffd34d');
      if (prot) {
        for (let k = 0; k < 4; k++) {
          const a = tick * 0.05 + k * 1.57;
          px(c, cx + Math.cos(a) * 18, cy + Math.sin(a) * 12, 2, 2, '#cfe6f2');
        }
      } else if ((tick >> 2) & 1) {
        px(c, cx - 4, cy - 12, 3, 2, '#e84c3d'); px(c, cx + 1, cy - 12, 3, 2, '#e84c3d');
      }
    }
  }

  /* ================= mundo 5: GELEIRA DO SILENCIO ================= */

  // TITA DE GELO: a armadura de gelo segura quase tudo. Ela so racha com acertos
  // seguidos (3 em 1,5 s) ou com fogo; sem armadura ele fica exposto por 6 s.
  class TitaGelo extends Chefe {
    constructor(x, y) {
      super(x, y, 30, 28, 240, 'TITA DE GELO');
      this.gib = 4; this.armadura = 3; this.combo = 0; this.comboT = 0; this.exposto = 0;
      this.enter('anda', 80);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim++;
      if (this.comboT > 0 && --this.comboT === 0) this.combo = 0;
      if (this.exposto > 0 && --this.exposto === 0) {
        this.armadura = this.furioso ? 2 : 3;
        g.particles.burst(this.cx, this.cy, 26, 4, 2.2, 26);
        Sound.play('secret');
        g.say('O TITA SE RECONGELA!', 90);
      }
      switch (this.state) {
        case 'anda':
          this.chase(g, this.exposto > 0 ? 0.35 : this.furioso ? 0.7 : 0.5);
          if (--this.st <= 0) {
            this.cycle++;
            this.enter(['soco', 'estilhacos', 'sopro'][this.cycle % 3], this.cycle % 3 === 0 ? 30 : 70);
          }
          break;
        case 'soco':                                    // soco no chao: onda de gelo em anel
          if (--this.st === 0) {
            anel(g, this.cx, this.cy, 10, 1.9, rnd() * 0.6);
            g.addEnt(new G.OndaInimiga(this.cx, this.y + this.h, 170, DANO));
            g.shake(8);
            Sound.play('boss');
            this.enter('anda', 70);
          }
          break;
        case 'estilhacos':                              // lanca cacos que congelam
          if (this.st % 16 === 0) {
            const a = Math.atan2(dy, dx);
            const n = qtd(g, 3);
            for (let k = 0; k < n; k++) {
              const ang = a + (k - (n - 1) / 2) * 0.3;
              const t = new G.Shot(this.cx - 3, this.cy - 3, Math.cos(ang) * 2.1, Math.sin(ang) * 2.1, 'geloOrb', DANO);
              t.onHit = (gg, alvo) => { alvo.gelo = Math.max(alvo.gelo || 0, 70); };
              g.addEnt(t);
            }
            Sound.play('shoot');
          }
          if (--this.st <= 0) this.enter('anda', 60);
          break;
        case 'sopro':                                   // sopro que empurra e gela
          if (this.st % 6 === 0) {
            const a = Math.atan2(dy, dx);
            for (let k = 0; k < 3; k++) {
              const ang = a + (rnd() - 0.5) * 0.7;
              g.particles.spawn(this.cx + Math.cos(ang) * 16, this.cy + Math.sin(ang) * 16,
                Math.cos(ang) * 3, Math.sin(ang) * 3, 20, 4, 1, 0);
            }
            if (d < 90) {
              for (const q of g.players) {
                if (q.dead) continue;
                const qx = q.cx - this.cx, qy = q.cy - this.cy, qd = Math.hypot(qx, qy) || 1;
                if (qd > 90) continue;
                G.moveEnt(q, g.room, (qx / qd) * 2.2, (qy / qd) * 2.2, false, true);
                if (this.st % 30 === 0) q.hurt(g, 1, this.cx, this.cy);
              }
            }
          }
          if (--this.st <= 0) this.enter('anda', 70);
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.armadura > 0) {
        this.combo++;
        this.comboT = 90;                               // janela de 1,5 s
        g.particles.burst(this.cx - dx * 8, this.cy - dy * 8, 8, 4, 1.8, 14);
        if (this.combo >= 3) {
          this.combo = 0; this.comboT = 0;
          this.armadura--;
          g.shake(6);
          Sound.play('kill');
          if (this.armadura <= 0) {
            this.exposto = 360;
            g.flashT = 10;
            g.say('A ARMADURA DE GELO CAIU! BATA RAPIDO!', 110);
          } else g.say('UMA PLACA DE GELO RACHOU! (' + this.armadura + ' RESTAM)', 70);
        } else {
          Sound.play('blocked');
          if (!this.avisou) { this.avisou = true; g.say('GOLPES SEGUIDOS RACHAM O GELO.', 100); }
        }
        return;
      }
      super.hurt(g, dmg, dx, dy);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(cx - 14, (this.y + this.h + 1) | 0, 28, 3);
      const gelo = this.armadura > 0;
      px(c, cx - 13, cy - 14, 26, 28, '#4a5a6b');        // corpo
      px(c, cx - 11, cy - 13, 22, 24, gelo ? '#6fb6d8' : '#8a7f74');
      px(c, cx - 11, cy - 13, 22, 4, gelo ? '#a8e3f7' : '#b0a496');
      px(c, cx - 16, cy - 8, 4, 14, gelo ? '#4f93b8' : '#6b6154');   // bracos
      px(c, cx + 12, cy - 8, 4, 14, gelo ? '#4f93b8' : '#6b6154');
      px(c, cx - 6, cy - 20, 12, 8, gelo ? '#6fb6d8' : '#8a7f74');   // cabeca
      px(c, cx - 4, cy - 17, 3, 2, '#eaffff'); px(c, cx + 2, cy - 17, 3, 2, '#eaffff');
      if (gelo) {
        for (let k = 0; k < this.armadura; k++) {        // picos de gelo restantes
          px(c, cx - 10 + k * 9, cy - 26 + (k & 1) * 2, 3, 7, '#bfeeff');
          px(c, cx - 10 + k * 9, cy - 24 + (k & 1) * 2, 1, 5, '#eaffff');
        }
      } else if ((tick >> 3) & 1) {
        px(c, cx - 4, cy - 17, 3, 2, '#e84c3d'); px(c, cx + 2, cy - 17, 3, 2, '#e84c3d');
      }
      if (this.exposto > 0 && (tick >> 2) & 1) px(c, cx - 12, cy - 22, 24, 1, '#ffd34d');
    }
  }

  // estalactite do arauto: cai do teto, marca o chao e vira espinho de gelo
  class Estalactite extends G.Enemy {
    constructor(x, y) {
      super(x - 5, y - 10, 10, 12, 6);
      this.fly = false; this.touch = 0; this.gib = 4; this.loot = 0;
      this.queda = 40; this.caiu = false; this.vida = 600;
    }
    step(g) {
      if (!this.caiu) {
        if (--this.queda <= 0) {
          this.caiu = true; this.touch = DANO;
          g.shake(4);
          Sound.play('hit');
          for (const p of g.players) {
            if (!p.dead && G.dist(p.cx, p.cy, this.cx, this.cy) < 14) p.hurt(g, DANO, this.cx, this.cy);
          }
          g.particles.burst(this.cx, this.cy, 14, 4, 2, 20);
        }
        return;
      }
      if (--this.vida <= 0) this.dead = true;
    }
    draw(c, S, tick) {
      if (this.hurtT > 0 && (tick & 2)) return;
      const x = this.cx | 0, y = (this.y + this.h) | 0;
      if (!this.caiu) {
        if ((this.queda >> 1) & 1) return;
        px(c, x - 5, y - 2, 10, 2, 'rgba(120,200,240,0.6)');
        px(c, x - 1, y - 30 + this.queda, 2, 6, '#bfeeff');
        return;
      }
      px(c, x - 5, y - 2, 10, 2, 'rgba(0,0,0,0.25)');
      px(c, x - 4, y - 12, 8, 12, '#6fb6d8');
      px(c, x - 2, y - 14, 4, 4, '#a8e3f7');
      px(c, x - 3, y - 11, 2, 9, '#eaffff');
    }
  }

  // ARAUTO DO INVERNO: voa na nevasca. O vento empurra o heroi para um lado da arena,
  // ele derruba estalactites do teto e solta a matilha de lobos do gelo.
  class Arauto extends Chefe {
    constructor(x, y) {
      super(x, y, 22, 20, 210, 'ARAUTO DO INVERNO');
      this.fly = true; this.gib = 4;
      this.vento = [1, 0]; this.trocaVento = 240; this.lobos = 0;
      this.enter('voa', 90);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim++;
      // nevasca constante: empurra todo mundo e enche a tela de flocos
      if (--this.trocaVento <= 0) {
        this.trocaVento = this.furioso ? 180 : 260;
        const a = rnd() * Math.PI * 2;
        this.vento = [Math.cos(a), Math.sin(a)];
        Sound.play('spin');
        g.say('O VENTO MUDA!', 60);
      }
      const forca = this.furioso ? 0.55 : 0.35;
      for (const q of g.players) {
        if (q.dead) continue;
        G.moveEnt(q, g.room, this.vento[0] * forca, this.vento[1] * forca, false, true);
      }
      if ((g.tick & 1) === 0) {
        g.particles.spawn(rnd() * VIEW_W, rnd() * VIEW_H, this.vento[0] * 2.4, this.vento[1] * 2.4, 22, 4, 1, 0);
      }
      switch (this.state) {
        case 'voa':
          this.move(g, (dx / d) * 0.9 + Math.cos(this.t * 0.05) * 0.6, (dy / d) * 0.9 + Math.sin(this.t * 0.05) * 0.6);
          if (--this.st <= 0) {
            this.cycle++;
            if (this.cycle % 3 === 2 && this.lobos < (this.furioso ? 6 : 4)) this.enter('matilha', 40);
            else this.enter(this.cycle % 2 ? 'gelo' : 'estalactites', 80);
          }
          break;
        case 'estalactites':
          if (this.st % 20 === 0) {
            const n = qtd(g, 2);
            for (let k = 0; k < n; k++) {
              const tx = G.clamp(p.cx + (rnd() - 0.5) * 70, 24, VIEW_W - 24);
              const ty = G.clamp(p.cy + (rnd() - 0.5) * 50, 24, VIEW_H - 24);
              g.addEnt(new Estalactite(tx, ty));
            }
            Sound.play('cast');
          }
          if (--this.st <= 0) this.enter('voa', 70);
          break;
        case 'gelo':                                    // espiral de cacos gelados
          if (this.st % 10 === 0) {
            const a = this.st * 0.35;
            const t = new G.Shot(this.cx - 3, this.cy - 3, Math.cos(a) * 2, Math.sin(a) * 2, 'geloOrb', DANO);
            t.onHit = (gg, alvo) => { alvo.gelo = Math.max(alvo.gelo || 0, 60); };
            g.addEnt(t);
            const t2 = new G.Shot(this.cx - 3, this.cy - 3, -Math.cos(a) * 2, -Math.sin(a) * 2, 'geloOrb', DANO);
            t2.onHit = t.onHit;
            g.addEnt(t2);
          }
          if (--this.st <= 0) this.enter('voa', 70);
          break;
        case 'matilha':
          if (this.st === 20) {
            const n = qtd(g, 2);
            for (let k = 0; k < n; k++) {
              const e = G.spawnEnemy('lobogelo', G.clamp(this.cx - 20 + k * 40, 20, VIEW_W - 30), G.clamp(this.cy + 16, 20, VIEW_H - 30));
              g.addEnt(e);
              g.particles.burst(e.cx, e.cy, 12, 4, 1.8, 18);
              this.lobos++;
            }
            Sound.play('secret');
            g.say('A MATILHA DO INVERNO!', 70);
          }
          if (--this.st <= 0) this.enter('voa', 70);
          break;
      }
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      const f = (tick >> 3) & 1;
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(cx - 9, (this.y + this.h + 4) | 0, 18, 3);
      px(c, cx - 18, cy - 6 + f * 2, 10, 4, '#bfeeff');   // asas de vento
      px(c, cx + 8, cy - 6 + f * 2, 10, 4, '#bfeeff');
      px(c, cx - 20, cy - 3 + f, 6, 2, '#6fb6d8');
      px(c, cx + 14, cy - 3 + f, 6, 2, '#6fb6d8');
      px(c, cx - 8, cy - 10, 16, 20, '#2f5a74');         // manto
      px(c, cx - 7, cy - 9, 14, 16, '#4f93b8');
      px(c, cx - 7, cy - 9, 14, 3, '#6fb6d8');
      px(c, cx - 5, cy - 16, 10, 8, '#d8e8f2');          // rosto de gelo
      px(c, cx - 3, cy - 13, 2, 2, '#5ce1ff'); px(c, cx + 1, cy - 13, 2, 2, '#5ce1ff');
      px(c, cx - 6, cy - 20, 3, 5, '#bfeeff'); px(c, cx + 3, cy - 20, 3, 5, '#bfeeff');   // chifres de gelo
      const a = tick * 0.08;                              // seta do vento
      px(c, cx + this.vento[0] * 22, cy + this.vento[1] * 22 + Math.sin(a) * 2, 3, 3, '#eaffff');
    }
  }

  /* ================= mundo 6: FORJA DO MUNDO ================= */

  // MESTRE FORJADOR: martela o chao e joga lava. Cada martelada esquenta o martelo;
  // quando o calor enche, ele precisa parar para esfriar: nesse tempo leva o dobro de dano.
  class Forjador extends Chefe {
    constructor(x, y) {
      super(x, y, 26, 26, 280, 'MESTRE FORJADOR');
      this.gib = 9; this.calor = 0; this.esfria = 0; this.martelo = 0;
      this.enter('anda', 70);
    }
    esquenta(g, n) {
      this.calor = Math.min(100, this.calor + n);
      if (this.calor < 100) return;
      this.calor = 0;
      this.esfria = this.furioso ? 200 : 260;
      this.enter('esfriando', this.esfria);
      g.flashT = 8;
      g.shake(6);
      Sound.play('boss');
      g.say('O MARTELO SUPERAQUECEU! ELE PRECISA ESFRIAR.', 110);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim++;
      if (this.martelo > 0) this.martelo--;
      switch (this.state) {
        case 'anda':
          this.chase(g, this.furioso ? 0.65 : 0.45);
          if (--this.st <= 0) {
            this.cycle++;
            if (this.cycle % 4 === 3) this.enter('jorro', 90);
            else if (this.cycle % 2 === 0) this.enter('martelada', 34);
            else this.enter('fornalha', 80);
          }
          break;
        case 'martelada':                               // ergue e bate: onda + rasgo de brasa
          this.martelo = 12;
          if (--this.st <= 0) {
            g.addEnt(new G.OndaInimiga(this.cx, this.y + this.h, 190, DANO));
            g.addEnt(new Rasgo(p.cx, 'v'));
            g.shake(9);
            Sound.play('goldhit');
            this.esquenta(g, 34);
            if (this.state === 'martelada') this.enter('anda', 60);
          }
          break;
        case 'fornalha':                                // cospe bolas de fogo em leque
          if (this.st % 18 === 0) {
            const a = Math.atan2(dy, dx);
            tiros(g, this.cx, this.cy, a, 3, 0.3, 2.1, 'fire');
            Sound.play('fire');
            this.esquenta(g, 10);
          }
          if (--this.st <= 0 && this.state === 'fornalha') this.enter('anda', 60);
          break;
        case 'jorro':                                   // pocas de lava em volta
          if (this.st % 22 === 0) {
            const n = qtd(g, 2);
            for (let k = 0; k < n; k++) {
              const ax = G.clamp(p.cx + (rnd() - 0.5) * 80, 24, VIEW_W - 24);
              const ay = G.clamp(p.cy + (rnd() - 0.5) * 56, 24, VIEW_H - 24);
              g.addEnt(new G.PocaLava(ax, ay));
            }
            Sound.play('fire');
            this.esquenta(g, 14);
          }
          if (--this.st <= 0 && this.state === 'jorro') this.enter('anda', 70);
          break;
        case 'esfriando':                               // ofegante, sem atacar: janela do heroi
          if ((g.tick & 3) === 0) g.particles.spawn(this.cx + (rnd() - 0.5) * 16, this.cy - 10, 0, -0.7, 20, 5, 1, 0);
          if (--this.st <= 0) { this.esfria = 0; this.enter('anda', 50); }
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.state === 'esfriando') dmg *= 2;
      super.hurt(g, dmg, dx, dy);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      const quente = this.calor > 60 && this.state !== 'esfriando';
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(cx - 12, (this.y + this.h + 1) | 0, 24, 3);
      px(c, cx - 11, cy - 10, 22, 22, '#2c2428');        // corpo
      px(c, cx - 9, cy - 9, 18, 18, quente ? '#8a3a20' : '#4a3c42');
      px(c, cx - 9, cy - 9, 18, 3, quente ? '#c8431a' : '#5c4a50');
      px(c, cx - 6, cy - 18, 12, 9, '#5c4a50');          // elmo
      px(c, cx - 5, cy - 15, 10, 3, this.state === 'esfriando' ? '#5c667e' : '#ffab3d');
      px(c, cx - 7, cy - 20, 14, 3, '#3a2f33');
      for (let k = 0; k < 3; k++) px(c, cx - 7 + k * 6, cy - 4, 2, 10, quente ? '#ffab3d' : '#2c2428');
      const mh = this.martelo > 0 ? -16 : -4;            // martelo
      px(c, cx + 12, cy + mh, 4, 14, '#6b4a2a');
      px(c, cx + 9, cy + mh - 4, 10, 6, '#8f96a8');
      px(c, cx + 10, cy + mh - 3, 8, 2, '#c8cede');
      if (quente) px(c, cx + 9, cy + mh - 4, 10, 1, '#ffe680');
      // barra de calor por cima
      const w = Math.round((this.calor / 100) * 22);
      px(c, cx - 11, cy - 26, 22, 3, '#2c2428');
      px(c, cx - 11, cy - 26, w, 3, this.calor > 70 ? '#ffe680' : '#c8431a');
      if (this.state === 'esfriando' && (tick >> 2) & 1) px(c, cx - 11, cy - 26, 22, 3, '#7ff2ff');
    }
  }

  // segmento do corpo da serpente: so a ponta da cauda sente dor
  class Anel extends G.Enemy {
    constructor(dona, k) {
      super(dona.cx, dona.cy, 14, 14, 26);
      this.dona = dona; this.k = k; this.fly = true; this.touch = DANO;
      this.gib = 9; this.loot = 0; this.hist = [];
    }
    get cauda() { return this.dona.dead ? false : this.dona.ultimo() === this; }
    step(g) {
      this.anim++;
      if ((g.tick & 7) === 0 && this.cauda) g.particles.spawn(this.cx, this.cy, 0, -0.4, 12, 9, 1, 0);
    }
    hurt(g, dmg, dx, dy) {
      if (!this.cauda) {                                 // escamas de obsidiana: so a cauda abre
        Sound.play('blocked');
        g.particles.burst(this.cx - dx * 6, this.cy - dy * 6, 5, 9, 1.4, 12);
        return;
      }
      super.hurt(g, dmg, dx, dy);
      this.knock = 0;
    }
    die(g) {
      super.die(g);
      if (this.dona && !this.dona.dead) this.dona.perdeuAnel(g);
    }
    draw(c, S, tick) {
      if (this.hurtT > 0 && (tick & 2)) return;
      const x = this.cx | 0, y = this.cy | 0;
      const cauda = this.cauda;
      disco(c, x, y, 7, '#1b1420');
      disco(c, x, y, 6, cauda ? '#c8431a' : '#4a3c42');
      disco(c, x - 1, y - 1, 3, cauda ? '#ffab3d' : '#6b5560');
      if (cauda && ((tick >> 2) & 1)) px(c, x - 1, y - 1, 3, 3, '#ffe680');
    }
  }

  // SERPENTE DE MAGMA: corre pela arena em anel. O corpo e escama dura: so a ponta
  // da cauda pode ser cortada, e cada anel perdido deixa a serpente mais rapida e curta.
  class Serpente extends Chefe {
    constructor(x, y) {
      super(x, y, 18, 18, 150, 'SERPENTE DE MAGMA');
      this.fly = true; this.gib = 9; this.touch = DANO;
      this.aneis = []; this.trilha = []; this.ang = 0; this.cdCuspe = 120;
      this.enter('nada', 0);
    }
    ultimo() {
      for (let i = this.aneis.length - 1; i >= 0; i--) if (!this.aneis[i].dead) return this.aneis[i];
      return null;
    }
    perdeuAnel(g) {
      const vivos = this.aneis.filter((a) => !a.dead).length;
      g.shake(5);
      if (vivos === 0) {
        g.say('A SERPENTE PERDEU O CORPO INTEIRO!', 100);
        this.touchExposto = true;
        return;
      }
      g.say('ANEL CORTADO! FALTAM ' + vivos + '.', 70);
    }
    step(g) {
      const p = g.alvo(this);
      this.anim++;
      if (!this.aneis.length) {                          // monta o corpo no primeiro quadro
        for (let k = 0; k < 6; k++) {
          const a = new Anel(this, k);
          this.aneis.push(a);
          g.addEnt(a);
        }
        g.say('CORTE A PONTA DA CAUDA: O RESTO E PEDRA.', 120);
      }
      // cabeca: nada pela arena atras do heroi, em curva suave
      const alvo = Math.atan2(p.cy - this.cy, p.cx - this.cx);
      let dif = alvo - this.ang;
      while (dif > Math.PI) dif -= Math.PI * 2;
      while (dif < -Math.PI) dif += Math.PI * 2;
      const vivos = this.aneis.filter((a) => !a.dead).length;
      const vel = (this.furioso ? 2.2 : 1.7) + (6 - vivos) * 0.12;
      this.ang += G.clamp(dif, -0.055, 0.055);
      const hit = G.moveEnt(this, g.room, Math.cos(this.ang) * vel, Math.sin(this.ang) * vel, true, false);
      if (hit) this.ang += Math.PI * 0.5;
      // rastro por onde o corpo passa
      this.trilha.unshift([this.cx, this.cy]);
      if (this.trilha.length > 130) this.trilha.length = 130;
      let i = 0;
      for (const a of this.aneis) {
        if (a.dead) continue;
        i++;
        const t = this.trilha[Math.min(this.trilha.length - 1, i * 14)];
        if (t) { a.x = t[0] - a.w / 2; a.y = t[1] - a.h / 2; }
      }
      if ((g.tick & 3) === 0) g.particles.spawn(this.cx, this.cy, 0, -0.5, 14, 9, 1, 0);
      if (--this.cdCuspe <= 0) {                         // cuspe de magma
        this.cdCuspe = this.furioso ? 70 : 110;
        const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
        tiros(g, this.cx, this.cy, a, 3, 0.26, 2.2, 'fire');
        if (this.furioso && sai(g)) g.addEnt(new G.PocaLava(G.clamp(p.cx, 24, VIEW_W - 24), G.clamp(p.cy, 24, VIEW_H - 24)));
        Sound.play('fire');
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.aneis.some((a) => !a.dead)) {             // cabeca so abre depois do corpo todo
        Sound.play('blocked');
        g.particles.burst(this.cx - dx * 6, this.cy - dy * 6, 5, 9, 1.4, 12);
        return;
      }
      super.hurt(g, dmg, dx, dy);
    }
    die(g) {
      for (const a of this.aneis) if (!a.dead) { a.dead = true; }
      super.die(g);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      const a = this.ang;
      disco(c, cx, cy, 9, '#1b1420');
      disco(c, cx, cy, 8, '#8a3a20');
      disco(c, cx, cy, 6, '#c8431a');
      const bx = cx + Math.cos(a) * 5, by = cy + Math.sin(a) * 5;
      px(c, bx - 2, by - 2, 5, 5, '#ffab3d');            // boca
      if ((tick >> 2) & 1) px(c, bx - 1, by - 1, 3, 3, '#ffe680');
      const nx = Math.cos(a + 1.57) * 5, ny = Math.sin(a + 1.57) * 5;
      px(c, cx + nx - 1, cy + ny - 1, 3, 3, '#ffe680');  // olhos
      px(c, cx - nx - 1, cy - ny - 1, 3, 3, '#ffe680');
      for (let k = 0; k < 3; k++) {                      // chifres de obsidiana
        const ha = a + (k - 1) * 0.8;
        px(c, cx - Math.cos(ha) * 9, cy - Math.sin(ha) * 9, 2, 2, '#3d2f4a');
      }
    }
  }

  /* ================= mundo 7: ILHAS DO CEU ================= */

  // ROC DOS VENTOS: circula muito alto (nao da para acertar), joga penas-lamina e
  // mergulha em linha reta. Se o mergulho bate na parede, ele cai tonto no chao.
  class Roc extends Chefe {
    constructor(x, y) {
      super(x, y, 30, 22, 240, 'ROC DOS VENTOS');
      this.fly = true; this.gib = 5; this.alto = 1; this.touch = 0;
      this.enter('circula', 110);
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim++;
      switch (this.state) {
        case 'circula': {
          this.alto = Math.min(1, this.alto + 0.04);
          this.touch = 0;
          const a = this.t * 0.03;
          const alvoX = VIEW_W / 2 + Math.cos(a) * 90, alvoY = VIEW_H / 2 + Math.sin(a) * 52;
          const ax = alvoX - this.cx, ay = alvoY - this.cy, ad = Math.hypot(ax, ay) || 1;
          G.moveEnt(this, g.room, (ax / ad) * 2.2, (ay / ad) * 2.2, true, false);
          if (this.st % (this.furioso ? 26 : 40) === 0) {   // penas-lamina caem na vertical
            const n = qtd(g, 2);
            for (let k = 0; k < n; k++) {
              const px2 = G.clamp(p.cx + (rnd() - 0.5) * 60, 20, VIEW_W - 20);
              g.addEnt(new Pena(px2, 8));
            }
            Sound.play('shoot');
          }
          if (--this.st <= 0) {
            this.cycle++;
            this.enter(this.cycle % 3 === 2 ? 'vendaval' : 'mira', this.cycle % 3 === 2 ? 130 : 40);
          }
          break;
        }
        case 'mira':                                    // desce mirando o heroi
          this.alto = Math.max(0.3, this.alto - 0.02);
          this.move(g, (dx / d) * 0.8, (dy / d) * 0.8);
          if (--this.st <= 0) {
            this.bx = (dx / d) * (this.furioso ? 5.4 : 4.4);
            this.by = (dy / d) * (this.furioso ? 5.4 : 4.4);
            this.alto = 0; this.touch = DANO;
            Sound.play('boss');
            this.enter('mergulho', 60);
          }
          break;
        case 'mergulho': {
          const hit = G.moveEnt(this, g.room, this.bx, this.by, false, false);
          if ((g.tick & 1) === 0) g.particles.spawn(this.cx, this.cy, -this.bx * 0.2, -this.by * 0.2, 12, 4, 1, 0);
          if (hit) {
            g.shake(8);
            Sound.play('goldhit');
            this.touch = 0;
            this.enter('caido', this.furioso ? 90 : 130);
          } else if (--this.st <= 0) { this.touch = 0; this.enter('circula', 120); }
          break;
        }
        case 'caido':                                   // no chao, sem asas: 2x de dano
          if ((g.tick & 7) === 0) g.particles.spawn(this.cx + (rnd() - 0.5) * 18, this.cy, 0, -0.4, 16, 5, 1, 0);
          if (--this.st <= 0) this.enter('circula', 110);
          break;
        case 'vendaval':                                // bate as asas: puxa todos para ele
          if (this.st % 4 === 0) {
            for (const q of g.players) {
              if (q.dead) continue;
              const qx = this.cx - q.cx, qy = this.cy - q.cy, qd = Math.hypot(qx, qy) || 1;
              G.moveEnt(q, g.room, (qx / qd) * 1.4, (qy / qd) * 1.4, false, true);
            }
            for (let k = 0; k < 3; k++) {
              const a = rnd() * Math.PI * 2, r = 60 + rnd() * 40;
              g.particles.spawn(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r,
                -Math.cos(a) * 2.6, -Math.sin(a) * 2.6, 18, 4, 1, 0);
            }
          }
          if (this.st % 30 === 0) anel(g, this.cx, this.cy, 8, 1.7, rnd());
          if (--this.st <= 0) this.enter('circula', 100);
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.alto > 0.6) {                            // alto demais
        Sound.play('blocked');
        if (!this.avisou) { this.avisou = true; g.say('ELE VOA ALTO DEMAIS. ESPERE O MERGULHO.', 100); }
        return;
      }
      if (this.state === 'caido') dmg *= 2;
      super.hurt(g, dmg, dx, dy);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      const f = (tick >> 3) & 1;
      const sombra = 10 + this.alto * 8;
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect((cx - sombra) | 0, (this.y + this.h + 6 + this.alto * 10) | 0, sombra * 2, 3);
      const caido = this.state === 'caido';
      const wy = caido ? 6 : f ? -4 : 2;
      px(c, cx - 30, cy + wy, 18, 6, '#c8cede');         // asas
      px(c, cx + 12, cy + wy, 18, 6, '#c8cede');
      px(c, cx - 30, cy + wy + 5, 16, 2, '#8f96a8');
      px(c, cx + 14, cy + wy + 5, 16, 2, '#8f96a8');
      px(c, cx - 11, cy - 8, 22, 18, '#8a7f9a');         // corpo
      px(c, cx - 9, cy - 7, 18, 14, '#b3a9c4');
      px(c, cx - 5, cy - 16, 11, 9, '#e8e2d0');          // cabeca
      px(c, cx - 3, cy - 13, 2, 2, caido ? '#5c667e' : '#ffd34d');
      px(c, cx + 2, cy - 13, 2, 2, caido ? '#5c667e' : '#ffd34d');
      px(c, cx + 5, cy - 11, 6, 3, '#c85a1a');           // bico
      px(c, cx - 6, cy + 9, 3, 4, '#c8a03a'); px(c, cx + 3, cy + 9, 3, 4, '#c8a03a');
      if (caido) {
        for (let k = 0; k < 3; k++) {
          const a = tick * 0.2 + k * 2.1;
          px(c, cx + Math.cos(a) * 14, cy - 22 + Math.sin(a) * 3, 2, 2, '#ffd34d');
        }
      }
    }
  }

  // pena-lamina do roc: cai marcada e fica espetada no chao por um tempo
  class Pena extends G.Enemy {
    constructor(x, y) {
      super(x - 3, y, 6, 10, 4);
      this.touch = 0; this.gib = 5; this.loot = 0; this.vy = 2.6; this.fincada = 0;
    }
    step(g) {
      if (this.fincada > 0) {
        if (--this.fincada <= 0) this.dead = true;
        return;
      }
      this.y += this.vy;
      for (const p of g.players) if (!p.dead && this.hits(p)) { p.hurt(g, DANO, this.cx, this.cy); this.dead = true; return; }
      if (this.y > VIEW_H - 18 || G.boxSolid(g.room, this.x, this.y + this.h, this.w, 2, false)) {
        this.fincada = 180;
        this.touch = 1;
        g.particles.burst(this.cx, this.cy + 6, 8, 5, 1.4, 14);
      }
    }
    draw(c, S, tick) {
      if (this.hurtT > 0 && (tick & 2)) return;
      const x = this.cx | 0, y = this.y | 0;
      px(c, x - 1, y, 3, 10, '#e8e2d0');
      px(c, x - 1, y, 1, 10, '#ffffff');
      px(c, x - 2, y + 8, 5, 3, '#8f96a8');
      if (this.fincada > 0 && (tick >> 2) & 1) px(c, x - 3, y + 10, 7, 1, 'rgba(200,220,255,0.5)');
    }
  }

  // pilar de tempestade: o guardiao se recarrega nele; derrubar os pilares o deixa exposto
  class PilarTempestade extends G.Enemy {
    constructor(dono, x, y) {
      super(x - 8, y - 14, 16, 28, 22);
      this.dono = dono; this.touch = 0; this.gib = 5; this.loot = 0; this.carga = 0;
    }
    step(g) {
      this.anim++;
      if (this.carga > 0) {
        this.carga--;
        if ((g.tick & 3) === 0) g.particles.spawn(this.cx, this.cy - 12, (rnd() - 0.5) * 1.2, -1, 14, 1, 1, 0);
      }
    }
    die(g) {
      super.die(g);
      if (this.dono && !this.dono.dead) this.dono.pilarCaiu(g);
    }
    draw(c, S, tick) {
      if (this.hurtT > 0 && (tick & 2)) return;
      const x = this.x | 0, y = this.y | 0;
      px(c, x - 1, y + 26, 18, 3, 'rgba(60,80,140,0.3)');
      px(c, x, y, 16, 28, '#4b5a80');
      px(c, x + 1, y + 1, 14, 26, '#6d7fa8');
      px(c, x + 2, y + 2, 4, 24, '#8f9ec8');
      px(c, x + 5, y + 6, 6, 3, '#bfe4ff');
      px(c, x + 6, y + 9, 4, 8, '#bfe4ff');
      if (this.carga > 0 && ((tick >> 2) & 1)) px(c, x + 3, y - 4, 10, 4, '#ffe680');
    }
  }

  // GUARDIAO DA TEMPESTADE: fica ligado a um pilar, imune, disparando raios marcados.
  // Derrube o pilar em que ele esta ligado e ele cai no chao, exposto, ate achar outro.
  class Guardiao extends Chefe {
    constructor(x, y) {
      super(x, y, 22, 24, 230, 'GUARDIAO DA TEMPESTADE');
      this.fly = true; this.gib = 1; this.pilares = []; this.ligado = null;
      this.enter('desperta', 60);
    }
    criaPilares(g) {
      const pos = [[56, 46], [VIEW_W - 56, 46], [56, VIEW_H - 40], [VIEW_W - 56, VIEW_H - 40]];
      for (const [x, y] of pos) {
        const pi = new PilarTempestade(this, x, y);
        this.pilares.push(pi);
        g.addEnt(pi);
      }
      g.say('ELE SE LIGA AOS PILARES. DERRUBE O PILAR ACESO.', 130);
    }
    pilaresVivos() { return this.pilares.filter((p) => !p.dead); }
    pilarCaiu(g) {
      if (this.ligado && this.ligado.dead) {
        this.ligado = null;
        this.enter('caido', this.furioso ? 150 : 210);
        g.flashT = 10;
        g.shake(7);
        Sound.play('kill');
        g.say('O GUARDIAO CAIU! BATA ENQUANTO ELE ESTA NO CHAO!', 110);
      }
    }
    ligaEm(g) {
      const livres = this.pilaresVivos();
      if (!livres.length) { this.enter('caido', 99999); return; }   // sem pilares: exposto de vez
      this.ligado = livres[(rnd() * livres.length) | 0];
      this.ligado.carga = 999;
      this.x = this.ligado.cx - this.w / 2;
      this.y = this.ligado.y - this.h;
      g.particles.burst(this.cx, this.cy, 18, 1, 2.2, 22);
      Sound.play('cast');
      this.enter('ligado', this.furioso ? 240 : 300);
    }
    step(g) {
      const p = g.alvo(this);
      this.anim++;
      switch (this.state) {
        case 'desperta':
          if (--this.st <= 0) { this.criaPilares(g); this.ligaEm(g); }
          break;
        case 'ligado':
          this.y += Math.sin(this.t * 0.08) * 0.3;
          if (this.st % (this.furioso ? 52 : 74) === 0) {          // raios marcados no chao
            const n = qtd(g, 2);
            for (let k = 0; k < n; k++) {
              const mx = G.clamp(p.cx + (rnd() - 0.5) * 60, 24, VIEW_W - 24);
              const my = G.clamp(p.cy + (rnd() - 0.5) * 44, 24, VIEW_H - 24);
              g.addEnt(new G.Marca(mx, my, DANO));
            }
            Sound.play('cast');
          }
          if (this.st % 90 === 0) {
            const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
            tiros(g, this.cx, this.cy, a, 5, 0.25, 2.2, 'spark');
            Sound.play('shoot');
          }
          if (--this.st <= 0) {                                     // troca de pilar
            if (this.ligado) this.ligado.carga = 0;
            this.enter('voando', 50);
          }
          break;
        case 'voando': {
          const alvo = this.pilaresVivos()[0];
          if (alvo) {
            const ax = alvo.cx - this.cx, ay = (alvo.y - this.h) - this.y, ad = Math.hypot(ax, ay) || 1;
            G.moveEnt(this, g.room, (ax / ad) * 2.4, (ay / ad) * 2.4, true, false);
          }
          if (--this.st <= 0) this.ligaEm(g);
          break;
        }
        case 'caido':                                               // sem pilar: exposto
          if ((g.tick & 7) === 0) g.particles.spawn(this.cx + (rnd() - 0.5) * 14, this.cy, 0, -0.5, 16, 1, 1, 0);
          if (this.st % 70 === 0) {
            const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
            tiros(g, this.cx, this.cy, a, 3, 0.3, 1.8, 'spark');
          }
          if (--this.st <= 0) this.ligaEm(g);
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      if (this.state !== 'caido') {
        Sound.play('blocked');
        g.particles.burst(this.cx - dx * 6, this.cy - dy * 6, 6, 1, 1.6, 12);
        if (!this.avisou) { this.avisou = true; g.say('O PILAR ACESO PROTEGE ELE.', 100); }
        return;
      }
      super.hurt(g, dmg * 2, dx, dy);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      const ligado = this.state === 'ligado';
      if (ligado && this.ligado) {                        // arco de energia ate o pilar
        G.linhaPx(c, cx, cy + 8, this.ligado.cx, this.ligado.cy - 8, (tick >> 1) & 1 ? '#ffe680' : '#7ff2ff', 0);
      }
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(cx - 9, (this.y + this.h + 3) | 0, 18, 3);
      px(c, cx - 10, cy - 10, 20, 22, '#2f3a5a');         // manto
      px(c, cx - 9, cy - 9, 18, 18, ligado ? '#4b5a80' : '#3a4560');
      px(c, cx - 9, cy - 9, 18, 3, '#8f9ec8');
      px(c, cx - 5, cy - 18, 10, 9, '#bfe4ff');           // rosto de nuvem
      px(c, cx - 3, cy - 15, 2, 2, ligado ? '#ffe680' : '#5c667e');
      px(c, cx + 1, cy - 15, 2, 2, ligado ? '#ffe680' : '#5c667e');
      px(c, cx - 14, cy - 6, 5, 12, '#6d7fa8'); px(c, cx + 9, cy - 6, 5, 12, '#6d7fa8');
      if (ligado) {
        for (let k = 0; k < 4; k++) {
          const a = tick * 0.12 + k * 1.57;
          px(c, cx + Math.cos(a) * 16, cy + Math.sin(a) * 14, 2, 2, '#ffe680');
        }
      }
    }
  }

  /* ================= mundo 8: O VAZIO ENTRE MUNDOS ================= */

  // uma das faces satelites da trindade: o dano nela vai para a vida unica das tres
  class FaceVazio extends G.Enemy {
    constructor(dona, k) {
      super(dona.cx, dona.cy, 16, 16, 9999);
      this.dona = dona; this.k = k; this.fly = true; this.touch = DANO;
      this.gib = 8; this.loot = 0; this.ativa = true; this.cd = 90 + k * 40;
    }
    step(g) {
      this.anim++;
      const d = this.dona;
      if (d.dead) { this.dead = true; return; }
      const a = d.ang + (this.k * Math.PI * 2) / 3;
      const r = this.ativa ? 46 + Math.sin(d.anim * 0.04 + this.k) * 8 : 26;
      this.x = d.cx + Math.cos(a) * r - this.w / 2;
      this.y = d.cy + Math.sin(a) * r * 0.75 - this.h / 2;
      this.touch = this.ativa ? DANO : 0;
      if (!this.ativa) return;
      if (--this.cd > 0) return;
      const p = g.alvo(this);
      const ang = Math.atan2(p.cy - this.cy, p.cx - this.cx);
      if (this.k === 0) {                                 // face da ira: rajada reta
        this.cd = d.furioso ? 70 : 110;
        tiros(g, this.cx, this.cy, ang, 3, 0.22, 2.3);
        Sound.play('shoot');
      } else if (this.k === 1) {                          // face do medo: feixe marcado
        this.cd = d.furioso ? 110 : 160;
        g.addEnt(new G.FeixeVazio(this.cx, this.cy, Math.cos(ang), Math.sin(ang)));
        Sound.play('cast');
      } else {                                            // face do esquecimento: cacos vivos
        this.cd = d.furioso ? 150 : 210;
        const c = G.spawnEnemy('caco', G.clamp(this.cx, 20, VIEW_W - 30), G.clamp(this.cy, 20, VIEW_H - 30));
        g.addEnt(c);
        g.particles.burst(c.cx, c.cy, 12, 8, 1.8, 18);
        Sound.play('secret');
      }
    }
    hurt(g, dmg, dx, dy) {
      if (!this.ativa) { Sound.play('blocked'); return; }
      this.hurtT = 8;
      this.dona.hurt(g, dmg, dx, dy);                     // vida unica das tres faces
    }
    draw(c, S, tick) {
      if (!this.ativa) return;
      if (this.hurtT > 0 && (tick & 2)) return;
      const x = this.cx | 0, y = this.cy | 0;
      const cor = this.k === 0 ? '#e84c3d' : this.k === 1 ? '#5ce1ff' : '#b45cff';
      disco(c, x, y, 8, '#0e0a18');
      disco(c, x, y, 7, '#2a1f45');
      px(c, x - 4, y - 3, 3, 3, cor); px(c, x + 2, y - 3, 3, 3, cor);
      px(c, x - 3, y + 3, 7, 1, cor);
      for (let k = 0; k < 4; k++) {
        const a = tick * 0.06 + k * 1.57 + this.k;
        px(c, x + Math.cos(a) * 9, y + Math.sin(a) * 9, 1, 1, cor);
      }
    }
  }

  // TRES FACES DO VAZIO: tres mascaras com uma vida so. Cada terco de vida perdido
  // fecha uma face, e as que sobram ficam mais rapidas e atacam mais.
  class Trindade extends Chefe {
    constructor(x, y) {
      super(x, y, 20, 20, 330, 'AS TRES FACES DO VAZIO');
      this.fly = true; this.touch = 0; this.gib = 8;
      this.faces = []; this.ang = 0; this.fechadas = 0; this.cdRasgo = 180;
      this.enter('desperta', 60);
    }
    ativas() { return this.faces.filter((f) => f.ativa); }
    fecha(g) {
      const vivas = this.ativas();
      if (vivas.length <= 1) return;
      const f = vivas[vivas.length - 1];
      f.ativa = false;
      this.fechadas++;
      g.flashT = 10;
      g.shake(6);
      Sound.play('boss');
      g.say('UMA FACE SE FECHA. AS OUTRAS ACORDAM DE VEZ!', 110);
    }
    step(g) {
      const p = g.alvo(this);
      this.anim++;
      if (!this.faces.length) {
        for (let k = 0; k < 3; k++) {
          const f = new FaceVazio(this, k);
          this.faces.push(f);
          g.addEnt(f);
        }
        g.say('TRES MASCARAS, UMA VIDA SO.', 120);
      }
      this.ang += 0.012 + this.fechadas * 0.01;
      const alvoFrac = 1 - (this.fechadas + 1) / 3;
      if (this.hp <= this.maxhp * alvoFrac && this.fechadas < 2) this.fecha(g);
      switch (this.state) {
        case 'desperta':
          if (--this.st <= 0) this.enter('gira', 200);
          break;
        case 'gira': {                                    // o nucleo persegue devagar
          const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
          G.moveEnt(this, g.room, (dx / d) * (0.5 + this.fechadas * 0.25), (dy / d) * (0.5 + this.fechadas * 0.25), true, false);
          if (--this.cdRasgo <= 0) {                      // rasgos do vazio cortando a sala
            this.cdRasgo = this.furioso ? 130 : 190;
            g.addEnt(new Rasgo(p.cy, 'h'));
            if (this.fechadas > 0) g.addEnt(new Rasgo(p.cx, 'v'));
            Sound.play('cast');
          }
          if (--this.st <= 0) this.enter('convergem', 120);
          break;
        }
        case 'convergem':                                 // as faces fecham o circulo e disparam anel
          if (this.st === 60) {
            anel(g, this.cx, this.cy, 12 + this.fechadas * 4, 1.9, rnd());
            Sound.play('nova');
            g.shake(5);
          }
          if (--this.st <= 0) this.enter('gira', 200);
          break;
      }
    }
    hurt(g, dmg, dx, dy) {
      super.hurt(g, dmg, dx, dy);
      this.knock = 0;
    }
    die(g) {
      for (const f of this.faces) f.dead = true;
      super.die(g);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      disco(c, cx, cy, 11, '#0e0a18');
      disco(c, cx, cy, 9, '#2a1f45');
      disco(c, cx, cy, 5, ((tick >> 3) & 1) ? '#b45cff' : '#7f3fd8');
      px(c, cx - 1, cy - 1, 3, 3, '#f0d8ff');
      for (const f of this.faces) {                        // fios ligando o nucleo as faces
        if (!f.ativa) continue;
        G.linhaPx(c, cx, cy, f.cx, f.cy, 'rgba(180,92,255,0.45)', 0);
      }
    }
  }

  // fio do tecelao: uma linha que gira em volta dele e corta quem encostar
  class Fio {
    constructor(dono, ang, vel, len) {
      this.dono = dono; this.ang = ang; this.vel = vel; this.len = len;
      this.x = 0; this.y = VIEW_H + 60; this.w = 0; this.h = 0;
      this.dead = false; this.cd = 0;
    }
    update(g) {
      if (this.dono.dead) { this.dead = true; return; }
      this.ang += this.vel;
      if (this.cd > 0) this.cd--;
      const ox = this.dono.cx, oy = this.dono.cy;
      const dx = Math.cos(this.ang), dy = Math.sin(this.ang);
      for (const p of g.players) {
        if (p.dead || this.cd > 0) continue;
        const px2 = p.cx - ox, py2 = p.cy - oy;
        const proj = px2 * dx + py2 * dy;
        if (proj < 6 || proj > this.len) continue;
        const perp = Math.abs(px2 * -dy + py2 * dx);
        if (perp > 5) continue;
        p.hurt(g, DANO, ox, oy);
        this.cd = 40;
      }
      if ((g.tick & 3) === 0) {
        const r = 20 + rnd() * (this.len - 20);
        g.particles.spawn(ox + dx * r, oy + dy * r, 0, 0, 10, 8, 1, 0);
      }
    }
    draw(c) {
      const ox = this.dono.cx, oy = this.dono.cy;
      const x1 = ox + Math.cos(this.ang) * this.len, y1 = oy + Math.sin(this.ang) * this.len;
      G.linhaPx(c, ox, oy, x1, y1, this.cd > 0 ? 'rgba(180,92,255,0.4)' : '#d9a6ff', 0);
    }
  }

  // TECELAO DO FIM: o ultimo guardiao. Tece fios que varrem a arena, puxa tudo para o
  // centro e chama os ecos dos chefes que voce ja derrotou. Tres fases, uma por terco de vida.
  class Tecelao extends Chefe {
    constructor(x, y) {
      super(x, y, 30, 30, 620, 'TECELAO DO FIM');
      this.fly = true; this.gib = 8; this.touch = DANO;
      this.fios = []; this.fase = 1; this.cdEco = 240; this.ang = 0;
      this.enter('desperta', 90);
    }
    teceFios(g, n, vel) {
      for (const f of this.fios) f.dead = true;
      this.fios = [];
      for (let k = 0; k < n; k++) {
        const f = new Fio(this, (k / n) * Math.PI * 2, vel, 150);
        this.fios.push(f);
        g.addEnt(f);
      }
      Sound.play('spin');
    }
    passaFase(g, f) {
      this.fase = f;
      g.flashT = 14;
      g.shake(9);
      Sound.play('boss');
      if (f === 2) {
        this.teceFios(g, 3, 0.012);
        g.say('O TECELAO PUXA OS FIOS DO MUNDO!', 130);
      } else {
        this.teceFios(g, 4, -0.017);
        g.say('ULTIMA FASE: TUDO VOLTA PARA O VAZIO.', 140);
      }
    }
    eco(g, p) {                                            // ecos dos chefes anteriores
      const k = (rnd() * 4) | 0;
      if (k === 0) {                                       // devorador: rasgos cruzados
        g.addEnt(new Rasgo(p.cy, 'h'));
        g.addEnt(new Rasgo(p.cx, 'v'));
      } else if (k === 1) {                                // arauto: estalactites
        for (let i = 0; i < qtd(g, 3); i++) {
          g.addEnt(new Estalactite(G.clamp(p.cx + (rnd() - 0.5) * 90, 24, VIEW_W - 24),
            G.clamp(p.cy + (rnd() - 0.5) * 60, 24, VIEW_H - 24)));
        }
      } else if (k === 2) {                                // roc: chuva de penas
        for (let i = 0; i < qtd(g, 3); i++) g.addEnt(new Pena(20 + rnd() * (VIEW_W - 40), 8));
      } else {                                             // forjador: pocas de lava
        for (let i = 0; i < qtd(g, 2); i++) {
          g.addEnt(new G.PocaLava(G.clamp(p.cx + (rnd() - 0.5) * 80, 24, VIEW_W - 24),
            G.clamp(p.cy + (rnd() - 0.5) * 50, 24, VIEW_H - 24)));
        }
      }
      Sound.play('cast');
    }
    step(g) {
      const p = g.alvo(this);
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      this.anim++;
      this.ang += 0.02;
      if (this.fase === 1 && this.hp < this.maxhp * 0.66) this.passaFase(g, 2);
      else if (this.fase === 2 && this.hp < this.maxhp * 0.33) this.passaFase(g, 3);
      if (this.fase === 3) {                               // puxa todo mundo para o centro
        for (const q of g.players) {
          if (q.dead) continue;
          const qx = this.cx - q.cx, qy = this.cy - q.cy, qd = Math.hypot(qx, qy) || 1;
          if (qd < 20) continue;
          G.moveEnt(q, g.room, (qx / qd) * 0.7, (qy / qd) * 0.7, false, true);
        }
      }
      switch (this.state) {
        case 'desperta':
          this.alpha = 1 - this.st / 90;
          if (--this.st <= 0) { this.alpha = 1; this.teceFios(g, 2, 0.01); this.enter('tece', 200); g.say('OS FIOS CORTAM: NAO FIQUE NA LINHA.', 130); }
          break;
        case 'tece': {
          const v = 0.5 + this.fase * 0.2;
          G.moveEnt(this, g.room, (dx / d) * v, (dy / d) * v, true, false);
          if (--this.cdEco <= 0) {
            this.cdEco = this.fase === 3 ? 150 : this.fase === 2 ? 200 : 260;
            this.enter('eco', 50);
          }
          if (this.st % 70 === 0) {
            const a = Math.atan2(dy, dx);
            tiros(g, this.cx, this.cy, a, 3 + this.fase, 0.24, 2);
            Sound.play('shoot');
          }
          if (--this.st <= 0) this.enter('novelo', 120);
          break;
        }
        case 'eco':
          if (this.st === 25) this.eco(g, p);
          if (--this.st <= 0) this.enter('tece', 200);
          break;
        case 'novelo':                                     // se enrola e solta aneis
          if (this.st % 34 === 0) {
            anel(g, this.cx, this.cy, 10 + this.fase * 3, 1.8, rnd());
            Sound.play('nova');
          }
          if (--this.st <= 0) this.enter('tece', 200);
          break;
      }
    }
    die(g) {
      for (const f of this.fios) f.dead = true;
      super.die(g);
    }
    desenha(c, tick) {
      const cx = this.cx | 0, cy = this.cy | 0;
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(cx - 12, (this.y + this.h + 2) | 0, 24, 3);
      for (let k = 0; k < 8; k++) {                        // pernas de aranha-tecela
        const a = this.ang * (k & 1 ? -1 : 1) + k * 0.78;
        const r = 20 + Math.sin(tick * 0.06 + k) * 3;
        G.linhaPx(c, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, '#2a1f45', 0);
        px(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 2, '#5a2a7a');
      }
      disco(c, cx, cy, 14, '#0e0a18');
      disco(c, cx, cy, 12, '#241a3d');
      disco(c, cx, cy + 2, 8, '#3a2a5a');
      const cor = this.fase === 3 ? '#e84c3d' : this.fase === 2 ? '#ffd34d' : '#b45cff';
      for (let k = 0; k < 4; k++) px(c, cx - 7 + k * 4, cy - 6, 2, 2, cor);   // olhos em fila
      px(c, cx - 5, cy + 1, 10, 2, '#0e0a18');
      for (let k = 0; k < 5; k++) px(c, cx - 5 + k * 2, cy + 1, 1, 2, '#eef2ff');
      if ((tick >> 3) & 1) disco(c, cx, cy, 3, cor);
    }
  }

  G.CHEFES = {
    devorador: Devorador, colosso: Colosso,
    mariposa: Mariposa, eco: Eco,
    reflexo: Reflexo, coracao: Coracao,
    rainha: Rainha, esfinge: Esfinge,
    tita: TitaGelo, arauto: Arauto,
    forjador: Forjador, serpente: Serpente,
    roc: Roc, guardiao: Guardiao,
    trindade: Trindade, tecelao: Tecelao
  };
})(window.AURUM = window.AURUM || {});
