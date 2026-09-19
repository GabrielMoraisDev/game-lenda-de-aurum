/* servidor.js - serve o jogo e repassa as mensagens do multijogador em rede local.
   Sem dependencias: so Node.  Uso:  node servidor.js   (porta: PORT=9000 node servidor.js)
   Uma sala por vez: o primeiro que "cria" e o anfitriao; todos os que "entram" sao convidados. */
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
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg'
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
    const cab = { 'Content-Type': TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream',
                  'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    // pedidos parciais (Range): o navegador usa para buscar e repetir as musicas
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && dados.length && (m[1] || m[2])) {
      const ini = m[1] ? Number(m[1]) : Math.max(0, dados.length - Number(m[2]));
      const fim = m[1] && m[2] ? Math.min(Number(m[2]), dados.length - 1) : dados.length - 1;
      if (ini > fim || ini >= dados.length) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + dados.length }); res.end(); return;
      }
      cab['Content-Range'] = 'bytes ' + ini + '-' + fim + '/' + dados.length;
      res.writeHead(206, cab);
      res.end(dados.subarray(ini, fim + 1));
      return;
    }
    res.writeHead(200, cab);
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

// uma sala por vez: um anfitriao e quantos convidados vierem (id 2, 3, 4... = numero do jogador)
let anfitriao = null, modo = null;
const convidados = new Map();
const MAX_ID = 255;                        // o id cabe em um byte do cabecalho do quadro
const LIMITE_FILA = 1 << 20;               // convidado lento: descarta quadros em vez de acumular

function primeiroLivre() {
  let id = 2;
  while (convidados.has(id)) id++;
  return id;
}

// quadro do anfitriao: [tipo, n, id1..idn, imagem]; vai tal como veio para cada id da lista
function repassaQuadro(dados) {
  const n = dados[1];
  const ids = n ? Array.from(dados.subarray(2, 2 + n)) : Array.from(convidados.keys());
  for (const id of ids) {
    const g = convidados.get(id);
    if (g && g.writableLength < LIMITE_FILA) enviar(g, 2, dados);
  }
}

function repassaTexto(dados) {
  let m = null;
  try { m = JSON.parse(dados.toString()); } catch (e) { return; }
  if (m && m.para) { const g = convidados.get(m.para); if (g) enviar(g, 1, dados); return; }
  for (const g of convidados.values()) enviar(g, 1, dados);
}

server.on('upgrade', (req, sock) => {
  if ((req.url || '').split('?')[0] !== '/ws') { sock.destroy(); return; }
  const chave = req.headers['sec-websocket-key'];
  if (!chave) { sock.destroy(); return; }
  const aceite = crypto.createHash('sha1').update(chave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + aceite + '\r\n\r\n');
  sock.setNoDelay(true);
  enviarTexto(sock, { t: 'ola', ips: ipsDaRede(), porta: PORTA });

  let papel = null, id = 0;
  leitor(sock, (op, dados) => {
    if (!papel) {                      // primeira mensagem define o papel
      let m = null;
      try { m = JSON.parse(dados.toString()); } catch (e) { /* ignora */ }
      if (m && m.t === 'criar') {
        if (anfitriao) { enviarTexto(sock, { t: 'erro', msg: 'JA EXISTE UMA SALA ABERTA' }); return; }
        anfitriao = sock; papel = 'host'; modo = m.modo;
        console.log('Sala criada (' + modo + '). Aguardando jogadores...');
      } else if (m && m.t === 'entrar') {
        if (!anfitriao) { enviarTexto(sock, { t: 'erro', msg: 'NENHUMA SALA ABERTA' }); return; }
        const livre = primeiroLivre();
        if (livre > MAX_ID) { enviarTexto(sock, { t: 'erro', msg: 'A SALA ESTA CHEIA' }); return; }
        id = livre; papel = 'guest';
        convidados.set(id, sock);
        enviarTexto(sock, { t: 'sala', modo, id });
        enviarTexto(anfitriao, { t: 'entrou', id, cls: m.cls });
        console.log('Jogador ' + id + ' entrou (' + m.cls + ').');
      }
      return;
    }
    if (papel === 'host') {
      if (op === 2) repassaQuadro(dados);
      else if (op === 1) repassaTexto(dados);
      return;
    }
    if (op !== 1 || !anfitriao || convidados.get(id) !== sock) return;
    let m = null;                        // convidado: o anfitriao precisa saber de quem veio
    try { m = JSON.parse(dados.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    m.id = id;
    enviarTexto(anfitriao, m);
  });

  const sair = () => {
    if (papel === 'host' && anfitriao === sock) {
      anfitriao = null; modo = null;
      for (const g of convidados.values()) enviarTexto(g, { t: 'saiu' });
      convidados.clear();
      console.log('Anfitriao saiu. Sala fechada.');
    } else if (papel === 'guest' && convidados.get(id) === sock) {
      convidados.delete(id);
      if (anfitriao) enviarTexto(anfitriao, { t: 'saiu', id });
      console.log('Jogador ' + id + ' saiu.');
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
  console.log('Multijogador: um cria a sala (N no titulo), os outros abrem o endereco da rede e entram.');
});
