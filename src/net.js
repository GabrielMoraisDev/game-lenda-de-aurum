/* net.js - multijogador.
   O anfitriao roda o jogo inteiro (todos os herois). Cada convidado so manda os
   comandos e recebe a tela pronta, os sons e a musica. Quantos convidados quiserem.
   Dois transportes, mesmo protocolo:
   - 'ws':  aberto pelo servidor.js (rede local). O servidor repassa as mensagens.
   - 'p2p': site estatico (GitHub Pages, arquivo local...). Conexao direta WebRTC via
            PeerJS; o anfitriao ganha um CODIGO DE SALA e faz o papel do servidor.
   Cada convidado tem um id (2, 3, 4...) que e o numero do jogador dele.
   Quadros binarios: [tipo, n, id1..idn, imagem]; n = 0 manda para todos. */
(function (G) {
  'use strict';

  const ACOES = ['up', 'down', 'left', 'right', 'attack', 'roll', 'special', 'spin', 'gold', 'fire', 'start', 'pause'];
  const BIT = {};
  ACOES.forEach((a, i) => { BIT[a] = 1 << i; });

  const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
  const PREFIXO = 'lenda-de-aurum-sala-';           // id do anfitriao no servidor publico do PeerJS
  const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // sem I, O, 0 e 1 (confundem)
  const TAM_CODIGO = 5;
  const FOLGA = 262144;                             // nao empilha quadros no canal
  const SILENCIO = 12000;                           // p2p: 12 s sem receber nada = o outro caiu
  const PING = 3000;                                // p2p: sinal de vida na sala de espera
  const MAX_ID = 255;                               // o id cabe em um byte do cabecalho do quadro

  const QUADRO = { CHEIO: 0, MUNDO: 1, HUD: 2 };    // MUNDO: tela sem HUD proprio; HUD: so a faixa de cima

  function carregaPeerJS() {
    if (window.Peer) return Promise.resolve();
    if (carregaPeerJS.p) return carregaPeerJS.p;
    carregaPeerJS.p = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.onload = () => (window.Peer ? ok() : falha());
      s.onerror = () => { carregaPeerJS.p = null; falha(); };
      document.head.appendChild(s);
    });
    return carregaPeerJS.p;
  }

  function novoCodigo() {
    let c = '';
    for (let i = 0; i < TAM_CODIGO; i++) c += LETRAS[(Math.random() * LETRAS.length) | 0];
    return c;
  }

  function primeiroLivre(usados) {
    let id = 2;
    while (usados.has(id)) id++;
    return id;
  }

  const Net = {
    ws: null,
    ips: [], porta: 0,
    transporte: null,     // 'ws' | 'p2p' (definido por detectar())
    papel: null,          // 'host' | 'guest'
    id: 0,                // convidado: o numero do jogador dele
    codigo: '',           // p2p: codigo da sala do anfitriao
    peer: null,
    conn: null,           // convidado p2p: conexao com o anfitriao
    conns: new Map(),     // anfitriao p2p: id do convidado -> conexao
    _fim: null,

    // o servidor.js responde em /aurum-servidor; sem ele (GitHub Pages etc.) vai de P2P
    detectar() {
      if (this.transporte) return Promise.resolve(this.transporte);
      const p2p = () => (this.transporte = 'p2p');
      if (!/^https?:$/.test(location.protocol) || !window.fetch) return Promise.resolve(p2p());
      return fetch('aurum-servidor', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (this.transporte = j && j.aurum ? 'ws' : 'p2p'))
        .catch(p2p);
    },

    disponivel() { return 'WebSocket' in window || 'RTCPeerConnection' in window; },

    // codigo de sala vindo no link (?sala=XXXXX)
    codigoDoLink() {
      const m = /[?&]sala=([A-Za-z0-9]+)/.exec(location.search);
      return m ? m[1].toUpperCase().slice(0, TAM_CODIGO) : '';
    },

    linkDaSala() {
      return location.origin + location.pathname + '?sala=' + this.codigo;
    },

    // primeira = {t:'criar', modo} ou {t:'entrar', cls, codigo}
    conectar(primeira, onMsg, onFim) {
      this.fechar();
      this._fim = onFim;
      this.papel = primeira.t === 'criar' ? 'host' : 'guest';
      const recebe = (m) => {
        if (m.t === 'ping') return;
        if (m.t === 'ola') { this.ips = m.ips || []; this.porta = m.porta || 0; }
        if (m.t === 'sala' && m.id) this.id = m.id;
        onMsg(m);
      };
      if (this.transporte === 'ws') this.conectarWS(primeira, recebe);
      else this.conectarP2P(primeira, recebe);
    },

    /* ---------- WebSocket (servidor.js) ---------- */

    conectarWS(primeira, onMsg) {
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify(primeira));
      ws.onmessage = (ev) => {
        const m = this.decodifica(ev.data);
        if (m) onMsg(m);
      };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.encerrou(); } };
    },

    /* ---------- WebRTC (PeerJS) ---------- */

    conectarP2P(primeira, onMsg) {
      const sessao = {};
      this.ultimoRx = Date.now();
      this._ultPing = 0;
      clearInterval(this._vigia);
      this._vigia = setInterval(() => this.vigiar(sessao, onMsg), 1000);
      this._sessao = sessao;
      const vivo = () => this._sessao === sessao;
      carregaPeerJS().then(() => {
        if (!vivo()) return;
        if (primeira.t === 'criar') this.hospedar(primeira, onMsg, sessao, 0);
        else this.entrar(primeira, onMsg, sessao);
      }).catch(() => {
        if (vivo()) onMsg({ t: 'erro', msg: 'SEM INTERNET PARA O MULTIJOGADOR' });
      });
    },

    // WebRTC demora a notar que o outro fechou a aba; o ping mantem viva a sala de espera
    vigiar(sessao, onMsg) {
      if (this._sessao !== sessao) { clearInterval(this._vigia); return; }
      const agora = Date.now();
      const ping = agora - this._ultPing > PING;
      if (ping) this._ultPing = agora;
      if (this.papel === 'guest') {
        const c = this.conn;
        if (!c || !c.open) return;
        if (agora - this.ultimoRx > SILENCIO) onMsg({ t: 'saiu' });
        else if (ping) c.send({ t: 'ping' });
        return;
      }
      for (const c of Array.from(this.conns.values())) {
        if (agora - c.ultimoRx > SILENCIO) c.sair();
        else if (ping && c.open) c.send({ t: 'ping' });
      }
    },

    // anfitriao: registra "PREFIXO+codigo" e recebe quantos convidados vierem
    hospedar(primeira, onMsg, sessao, tentativa) {
      const codigo = novoCodigo();
      const peer = new window.Peer(PREFIXO + codigo);
      this.peer = peer;
      peer.on('open', () => {
        if (this._sessao !== sessao) return;
        this.codigo = codigo;
        onMsg({ t: 'codigo', codigo });
      });
      peer.on('connection', (conn) => {
        if (this._sessao !== sessao) { conn.close(); return; }
        let id = 0;
        conn.ultimoRx = Date.now();
        conn.sair = () => {
          if (!id || this.conns.get(id) !== conn) return;
          this.conns.delete(id);
          try { conn.close(); } catch (e) { /* ja fechado */ }
          if (this._sessao === sessao) onMsg({ t: 'saiu', id });
        };
        conn.on('data', (d) => {
          conn.ultimoRx = Date.now();
          const m = this.decodifica(d);
          if (!m || m.t === 'ping') return;
          if (!id) {                                   // o anfitriao faz o papel do servidor
            if (m.t !== 'entrar') return;
            const livre = primeiroLivre(this.conns);
            if (livre > MAX_ID) {
              conn.send({ t: 'erro', msg: 'A SALA ESTA CHEIA' });
              setTimeout(() => conn.close(), 500);
              return;
            }
            id = livre;
            this.conns.set(id, conn);
            conn.send({ t: 'sala', modo: primeira.modo, id });
            onMsg({ t: 'entrou', id, cls: m.cls });
            return;
          }
          if (m.t === 'saiu') { conn.sair(); return; }
          m.id = id;
          onMsg(m);
        });
        conn.on('close', conn.sair);
        conn.on('error', conn.sair);
      });
      peer.on('error', (e) => {
        if (this._sessao !== sessao) return;
        if (e && e.type === 'unavailable-id' && tentativa < 5) {   // codigo em uso: sorteia outro
          peer.destroy();
          this.hospedar(primeira, onMsg, sessao, tentativa + 1);
          return;
        }
        if (this.codigo) return;                       // sala ja aberta: erro de um convidado nao derruba a sala
        onMsg({ t: 'erro', msg: 'NAO FOI POSSIVEL CRIAR A SALA' });
      });
      peer.on('disconnected', () => {                  // perdeu o servidor de sinalizacao: volta para aceitar quem chegar
        if (this._sessao === sessao && !peer.destroyed) peer.reconnect();
      });
    },

    // convidado: conecta no codigo digitado
    entrar(primeira, onMsg, sessao) {
      const codigo = String(primeira.codigo || '').toUpperCase();
      const peer = new window.Peer();
      this.peer = peer;
      let abriu = false;
      const timer = setTimeout(() => {
        if (this._sessao === sessao && !abriu) onMsg({ t: 'erro', msg: 'SALA ' + codigo + ' NAO ENCONTRADA' });
      }, 15000);
      peer.on('open', () => {
        if (this._sessao !== sessao) return;
        const conn = peer.connect(PREFIXO + codigo, { reliable: true });
        this.conn = conn;
        conn.on('open', () => {
          abriu = true;
          this.ultimoRx = Date.now();
          clearTimeout(timer);
          conn.send({ t: 'entrar', cls: primeira.cls });
        });
        conn.on('data', (d) => {
          this.ultimoRx = Date.now();
          const m = this.decodifica(d);
          if (m) onMsg(m);
        });
        const caiu = () => {
          if (this.conn !== conn) return;
          this.conn = null;
          if (this._sessao === sessao) this.encerrou();
        };
        conn.on('close', caiu);
        conn.on('error', caiu);
      });
      peer.on('error', (e) => {
        if (this._sessao !== sessao) return;
        clearTimeout(timer);
        if (abriu) return;
        onMsg({ t: 'erro', msg: e && e.type === 'peer-unavailable' ? 'SALA ' + codigo + ' NAO ENCONTRADA' : 'FALHA NA CONEXAO' });
      });
    },

    // quadros chegam como binario; o resto como objeto (p2p) ou texto JSON (ws)
    decodifica(d) {
      if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) {
        const b = d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
        if (b.length < 2) return null;
        return { t: 'quadro', tipo: b[0], blob: new Blob([b.subarray(2 + b[1])]) };
      }
      if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return null; } }
      return d && typeof d === 'object' ? d : null;
    },

    /* ---------- comum ---------- */

    encerrou() {
      this.eco = false;
      const f = this._fim;
      if (f) f();
    },

    // anfitriao: `para` manda so para aquele convidado; sem ele, para todos
    enviar(m, para) {
      if (this.ws) {
        if (this.ws.readyState === 1) this.ws.send(JSON.stringify(para ? Object.assign({ para }, m) : m));
        return;
      }
      if (this.papel === 'guest') { if (this.conn && this.conn.open) this.conn.send(m); return; }
      if (para) { const c = this.conns.get(para); if (c && c.open) c.send(m); return; }
      for (const c of this.conns.values()) if (c.open) c.send(m);
    },

    // anfitriao: um quadro codificado para os convidados `ids`
    enviarBin(blob, tipo, ids) {
      blob.arrayBuffer().then((buf) => {
        if (this.ws) {
          if (this.ws.readyState !== 1) return;
          // rede local: sobe uma vez so, o servidor copia para cada convidado da lista
          const out = new Uint8Array(2 + ids.length + buf.byteLength);
          out[0] = tipo; out[1] = ids.length;
          ids.forEach((id, k) => { out[2 + k] = id; });
          out.set(new Uint8Array(buf), 2 + ids.length);
          this.ws.send(out.buffer);
          return;
        }
        const out = new Uint8Array(2 + buf.byteLength);
        out[0] = tipo;
        out.set(new Uint8Array(buf), 2);
        for (const id of ids) {
          const c = this.conns.get(id);
          if (c && c.open) c.send(out.buffer);
        }
      });
    },

    // o canal ate o convidado `id` aguenta mais um quadro?
    folga(id) {
      if (this.ws) return this.ws.readyState === 1 && this.ws.bufferedAmount < FOLGA;
      const c = this.conns.get(id);
      if (!c || !c.open) return false;
      const dc = c.dataChannel;
      return (c.bufferSize || 0) < 4 && (!dc || dc.bufferedAmount < FOLGA);
    },

    // formato do quadro: PNG na rede local, WebP pela internet (mais leve quanto mais gente,
    // porque o anfitriao sobe um quadro para cada convidado)
    formatoQuadro(convidados) {
      if (this.ws) return ['image/png'];
      return ['image/webp', Math.max(0.55, 0.9 - 0.05 * Math.max(0, convidados - 1))];
    },

    fechar() {
      this.eco = false;
      clearInterval(this._vigia);
      this._sessao = null;
      this._fim = null;
      this.codigo = '';
      this.papel = null;
      this.id = 0;
      if (this.ws) {
        const w = this.ws;
        this.ws = null;
        try { w.close(); } catch (e) { /* ja fechado */ }
      }
      if (this.conn) { const c = this.conn; this.conn = null; try { c.close(); } catch (e) { /* ja fechado */ } }
      const cs = Array.from(this.conns.values());
      this.conns.clear();
      for (const c of cs) { try { c.close(); } catch (e) { /* ja fechado */ } }
      if (this.peer) { const p = this.peer; this.peer = null; try { p.destroy(); } catch (e) { /* ja fechado */ } }
    },

    // mascara de bits das acoes seguradas (d) e apertadas neste quadro (h)
    mascara(input) {
      let d = 0, h = 0;
      for (const a of ACOES) {
        if (input.down(a)) d |= BIT[a];
        if (input.hit(a)) h |= BIT[a];
      }
      return { d, h };
    },

    TAM_CODIGO, LETRAS, QUADRO,
    eco: false            // anfitriao com convidados: repete sons e musica neles
  };
  G.Net = Net;
  // fechou a aba: avisa na hora (senao o WebRTC leva varios segundos para perceber)
  addEventListener('pagehide', () => { if (Net.papel) Net.enviar({ t: 'saiu' }); });

  // entrada de um convidado, vista pelo anfitriao
  class RemoteInput {
    constructor() { this.d = 0; this.h = 0; }
    receber(m) { this.d = m.d | 0; this.h |= m.h | 0; }   // apertos acumulam ate o proximo quadro
    down(a) { return !!(this.d & BIT[a]); }
    hit(a) { return !!(this.h & BIT[a]); }
    endFrame() { this.h = 0; }
  }
  G.RemoteInput = RemoteInput;

  // sons e musica do anfitriao tambem tocam nos convidados
  const Sound = G.Sound, Music = G.Music;
  const play = Sound.play.bind(Sound);
  Sound.play = function (n) { play(n); if (Net.eco) Net.enviar({ t: 'som', n }); };
  const mset = Music.set.bind(Music), mstop = Music.stop.bind(Music);
  Music.set = function (n) {
    const mudou = Music.name !== n;
    mset(n);
    if (mudou && Net.eco) Net.enviar({ t: 'mus', n });
  };
  Music.stop = function () { mstop(); if (Net.eco) Net.enviar({ t: 'mus', n: null }); };
  // o convidado toca sem repetir
  Net.tocarSom = play;
  Net.tocarMusica = (n) => { if (n) mset(n); else mstop(); };
})(window.AURUM = window.AURUM || {});
