/* servidor.js - serve o jogo e repassa as mensagens do multijogador em rede local.
   Sem dependencias: so Node.  Uso:  node servidor.js   (porta: PORT=9000 node servidor.js)
   Uma sala por vez: o primeiro que "cria" e o anfitriao, o segundo que "entra" e o convidado. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORTA = Number(process.env.PORT) || 8080;
const RAIZ = __dirname;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml'
};

function ipsDaRede() {
  const out = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const a of lista || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

/* ---------- arquivos ---------- */

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/aurum-servidor') {                 // o jogo pergunta: tem servidor? entao usa WebSocket
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ aurum: true, porta: PORTA }));
    return;
  }
  if (rel === '/') rel = '/index.html';
  const arq = path.normalize(path.join(RAIZ, rel));
  if (!arq.startsWith(RAIZ + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(arq, (err, dados) => {
    if (err) { res.writeHead(404); res.end('nao encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(dados);
  });
});

/* ---------- WebSocket minimo (RFC 6455) ---------- */

function enviar(sock, op, dados) {
  if (!sock || sock.destroyed) return;
  const n = dados.length;
  let cab;
  if (n < 126) cab = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { cab = Buffer.alloc(4); cab[0] = 0x80 | op; cab[1] = 126; cab.writeUInt16BE(n, 2); }
  else { cab = Buffer.alloc(10); cab[0] = 0x80 | op; cab[1] = 127; cab.writeBigUInt64BE(BigInt(n), 2); }
  sock.write(Buffer.concat([cab, dados]));
}
const enviarTexto = (sock, obj) => enviar(sock, 1, Buffer.from(JSON.stringify(obj)));

// le quadros do cliente (sempre mascarados); junta fragmentos
function leitor(sock, onMsg) {
  let buf = Buffer.alloc(0), partes = [], opFrag = 0;
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masc = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const offMasc = off;
      if (masc) off += 4;
      if (buf.length < off + len) return;
      const dados = Buffer.from(buf.subarray(off, off + len));
      if (masc) for (let i = 0; i < dados.length; i++) dados[i] ^= buf[offMasc + (i & 3)];
      buf = buf.subarray(off + len);

      if (op === 8) { enviar(sock, 8, Buffer.alloc(0)); sock.end(); return; }
      if (op === 9) { enviar(sock, 10, dados); continue; }
      if (op === 10) continue;
      if (op !== 0) { opFrag = op; partes = []; }
      partes.push(dados);
      if (fin) { onMsg(opFrag, Buffer.concat(partes)); partes = []; }
    }
  });
}

/* ---------- sala ---------- */

let anfitriao = null, convidado = null, modo = null;

server.on('upgrade', (req, sock) => {
  if ((req.url || '').split('?')[0] !== '/ws') { sock.destroy(); return; }
  const chave = req.headers['sec-websocket-key'];
  if (!chave) { sock.destroy(); return; }
  const aceite = crypto.createHash('sha1').update(chave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + aceite + '\r\n\r\n');
  sock.setNoDelay(true);
  enviarTexto(sock, { t: 'ola', ips: ipsDaRede(), porta: PORTA });

  let papel = null;
  leitor(sock, (op, dados) => {
    if (!papel) {                      // primeira mensagem define o papel
      let m = null;
      try { m = JSON.parse(dados.toString()); } catch (e) { /* ignora */ }
      if (m && m.t === 'criar') {
        if (anfitriao) { enviarTexto(sock, { t: 'erro', msg: 'JA EXISTE UMA SALA ABERTA' }); return; }
        anfitriao = sock; papel = 'host'; modo = m.modo;
        console.log('Sala criada (' + modo + '). Aguardando o jogador 2...');
      } else if (m && m.t === 'entrar') {
        if (!anfitriao) { enviarTexto(sock, { t: 'erro', msg: 'NENHUMA SALA ABERTA' }); return; }
        if (convidado) { enviarTexto(sock, { t: 'erro', msg: 'A SALA JA ESTA CHEIA' }); return; }
        convidado = sock; papel = 'guest';
        enviarTexto(anfitriao, { t: 'entrou', cls: m.cls });
        enviarTexto(sock, { t: 'sala', modo });
        console.log('Jogador 2 entrou (' + m.cls + ').');
      }
      return;
    }
    const outro = papel === 'host' ? convidado : anfitriao;   // repassa tal como veio
    enviar(outro, op, dados);
  });

  const sair = () => {
    if (papel === 'host' && anfitriao === sock) {
      anfitriao = null; modo = null;
      if (convidado) enviarTexto(convidado, { t: 'saiu' });
      console.log('Anfitriao saiu. Sala fechada.');
    } else if (papel === 'guest' && convidado === sock) {
      convidado = null;
      if (anfitriao) enviarTexto(anfitriao, { t: 'saiu' });
      console.log('Jogador 2 saiu.');
    }
    papel = null;
  };
  sock.on('close', sair);
  sock.on('error', sair);
});

server.listen(PORTA, '0.0.0.0', () => {
  console.log('A Lenda de Aurum');
  console.log('  Neste PC:      http://localhost:' + PORTA + '/');
  for (const ip of ipsDaRede()) console.log('  Na rede local: http://' + ip + ':' + PORTA + '/');
  console.log('Multijogador: um cria a sala (N no titulo), o outro abre o endereco da rede e entra.');
});
