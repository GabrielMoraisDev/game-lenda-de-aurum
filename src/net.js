/* net.js - multijogador.
   O anfitriao roda o jogo inteiro (os dois herois). O convidado so manda os
   comandos e recebe a tela pronta, os sons e a musica.
   Dois transportes, mesmo protocolo:
   - 'ws':  aberto pelo servidor.js (rede local). O servidor repassa as mensagens.
   - 'p2p': site estatico (GitHub Pages, arquivo local...). Conexao direta WebRTC via
            PeerJS; o anfitriao ganha um CODIGO DE SALA e faz o papel do servidor. */
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

  const Net = {
    ws: null,
    ips: [], porta: 0,
    transporte: null,     // 'ws' | 'p2p' (definido por detectar())
    codigo: '',           // p2p: codigo da sala do anfitriao
    peer: null, conn: null,
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
      const recebe = (m) => {
        if (m && m.t === 'ola') { this.ips = m.ips || []; this.porta = m.porta || 0; }
        onMsg(m);
      };
      if (this.transporte === 'ws') this.conectarWS(primeira, recebe);
      else this.conectarP2P(primeira, recebe);
    },

    /* ---------- WebSocket (servidor.js) ---------- */

    conectarWS(primeira, onMsg) {
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      ws.binaryType = 'blob';
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify(primeira));
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') { onMsg({ t: 'quadro', blob: ev.data }); return; }
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        onMsg(m);
      };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.encerrou(); } };
    },

    /* ---------- WebRTC (PeerJS) ---------- */

    conectarP2P(primeira, onMsg) {
      const sessao = {};
      this.ultimoRx = Date.now();
      clearInterval(this._vigia);
      this._vigia = setInterval(() => {         // WebRTC demora a notar que o outro fechou a aba
        if (this._sessao !== sessao) { clearInterval(this._vigia); return; }
        if (this.conn && this.conn.open && Date.now() - this.ultimoRx > SILENCIO) onMsg({ t: 'saiu' });
      }, 1000);
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

    // anfitriao: registra "PREFIXO+codigo" e espera o convidado
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
        if (this.conn) {                               // sala cheia
          conn.on('open', () => { conn.send({ t: 'erro', msg: 'A SALA JA ESTA CHEIA' }); setTimeout(() => conn.close(), 500); });
          return;
        }
        this.conn = conn;
        this.ultimoRx = Date.now();
        conn.on('data', (d) => {
          const m = this.decodifica(d);
          if (!m) return;
          if (m.t === 'entrar') {                      // o anfitriao faz o papel do servidor
            conn.send({ t: 'sala', modo: primeira.modo });
            onMsg({ t: 'entrou', cls: m.cls });
            return;
          }
          onMsg(m);
        });
        const saiu = () => {
          if (this.conn !== conn) return;
          this.conn = null;
          if (this._sessao === sessao) onMsg({ t: 'saiu' });
        };
        conn.on('close', saiu);
        conn.on('error', saiu);
      });
      peer.on('error', (e) => {
        if (this._sessao !== sessao) return;
        if (e && e.type === 'unavailable-id' && tentativa < 5) {   // codigo em uso: sorteia outro
          peer.destroy();
          this.hospedar(primeira, onMsg, sessao, tentativa + 1);
          return;
        }
        if (this.conn) return;                         // ja conectado: erro do servidor de sinalizacao nao importa
        onMsg({ t: 'erro', msg: 'NAO FOI POSSIVEL CRIAR A SALA' });
      });
      peer.on('disconnected', () => {                  // perdeu o servidor de sinalizacao: tenta voltar
        if (this._sessao === sessao && !peer.destroyed && !this.conn) peer.reconnect();
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
        conn.on('data', (d) => { const m = this.decodifica(d); if (m) onMsg(m); });
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

    // quadros chegam como binario; o resto como objeto
    decodifica(d) {
      this.ultimoRx = Date.now();
      if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) return { t: 'quadro', blob: new Blob([d]) };
      if (typeof Blob !== 'undefined' && d instanceof Blob) return { t: 'quadro', blob: d };
      if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return null; } }
      return d && typeof d === 'object' ? d : null;
    },

    /* ---------- comum ---------- */

    encerrou() {
      this.eco = false;
      const f = this._fim;
      if (f) f();
    },

    aberto() {
      if (this.ws) return this.ws.readyState === 1;
      return !!this.conn && this.conn.open;
    },
    enviar(m) {
      if (!this.aberto()) return;
      if (this.ws) this.ws.send(JSON.stringify(m));
      else this.conn.send(m);
    },
    enviarBin(b) {
      if (!this.aberto()) return;
      if (this.ws) { this.ws.send(b); return; }
      const conn = this.conn;
      b.arrayBuffer().then((buf) => { if (this.conn === conn && conn.open) conn.send(buf); });
    },
    folga() {
      if (!this.aberto()) return false;
      if (this.ws) return this.ws.bufferedAmount < FOLGA;
      const dc = this.conn.dataChannel;
      return (this.conn.bufferSize || 0) < 4 && (!dc || dc.bufferedAmount < FOLGA);
    },
    // formato do quadro: PNG na rede local, WebP (bem menor) pela internet
    formatoQuadro() { return this.ws ? ['image/png'] : ['image/webp', 0.9]; },

    fechar() {
      this.eco = false;
      clearInterval(this._vigia);
      this._sessao = null;
      this._fim = null;
      this.codigo = '';
      if (this.ws) {
        const w = this.ws;
        this.ws = null;
        try { w.close(); } catch (e) { /* ja fechado */ }
      }
      if (this.conn) { const c = this.conn; this.conn = null; try { c.close(); } catch (e) { /* ja fechado */ } }
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

    TAM_CODIGO, LETRAS,
    eco: false            // anfitriao com convidado: repete sons e musica no convidado
  };
  G.Net = Net;
  // fechou a aba: avisa o outro na hora (senao o WebRTC leva varios segundos para perceber)
  addEventListener('pagehide', () => { if (Net.conn) Net.enviar({ t: 'saiu' }); });

  // entrada do convidado, vista pelo anfitriao
  class RemoteInput {
    constructor() { this.d = 0; this.h = 0; }
    receber(m) { this.d = m.d | 0; this.h |= m.h | 0; }   // apertos acumulam ate o proximo quadro
    down(a) { return !!(this.d & BIT[a]); }
    hit(a) { return !!(this.h & BIT[a]); }
    endFrame() { this.h = 0; }
  }
  G.RemoteInput = RemoteInput;

  // sons e musica do anfitriao tambem tocam no convidado
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
