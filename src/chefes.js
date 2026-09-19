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

  G.CHEFES = {
    devorador: Devorador, colosso: Colosso,
    mariposa: Mariposa, eco: Eco,
    reflexo: Reflexo, coracao: Coracao
  };
})(window.AURUM = window.AURUM || {});
