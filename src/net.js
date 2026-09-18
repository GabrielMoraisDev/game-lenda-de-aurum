/* net.js - multijogador em rede local.
   O anfitriao roda o jogo inteiro (os dois herois). O convidado so manda os
   comandos e recebe a tela pronta, os sons e a musica. O servidor (servidor.js)
   apenas repassa as mensagens entre os dois. */
(function (G) {
  'use strict';

  const ACOES = ['up', 'down', 'left', 'right', 'attack', 'roll', 'special', 'spin', 'gold', 'fire', 'start', 'pause'];
  const BIT = {};
  ACOES.forEach((a, i) => { BIT[a] = 1 << i; });

  const Net = {
    ws: null,
    ips: [], porta: 0,

    // WebSocket so existe quando o jogo foi aberto pelo servidor (nao em file://)
    disponivel() { return /^https?:$/.test(location.protocol) && 'WebSocket' in window; },

    // primeira = {t:'criar', modo} ou {t:'entrar', cls}
    conectar(primeira, onMsg, onFim) {
      this.fechar();
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      ws.binaryType = 'blob';
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify(primeira));
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') { onMsg({ t: 'quadro', blob: ev.data }); return; }
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'ola') { this.ips = m.ips || []; this.porta = m.porta || 0; }
        onMsg(m);
      };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.eco = false; onFim(); } };
    },

    aberto() { return !!this.ws && this.ws.readyState === 1; },
    enviar(m) { if (this.aberto()) this.ws.send(JSON.stringify(m)); },
    enviarBin(b) { if (this.aberto()) this.ws.send(b); },
    folga() { return this.aberto() && this.ws.bufferedAmount < 262144; },   // nao empilha quadros

    fechar() {
      this.eco = false;
      if (!this.ws) return;
      const w = this.ws;
      this.ws = null;
      try { w.close(); } catch (e) { /* ja fechado */ }
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

    eco: false            // anfitriao com convidado: repete sons e musica no convidado
  };
  G.Net = Net;

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
