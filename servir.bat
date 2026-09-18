@echo off
REM Sobe o servidor do jogo e abre no navegador.
REM Com Node: jogo + multijogador em rede local (servidor.js).
REM Sem Node: so o modo solo (index.html tambem funciona direto no navegador).
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080/
  node servidor.js
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  echo Node nao encontrado: multijogador desligado. Instale o Node.js para jogar em rede.
  start "" http://localhost:8080/
  python -m http.server 8080
  goto :eof
)
echo Node e Python nao encontrados. Abrindo index.html direto no navegador (so modo solo).
start "" index.html
