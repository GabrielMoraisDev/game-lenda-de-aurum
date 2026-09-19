# A Lenda de Aurum

Action-RPG top-down no estilo Zelda clássico, rodando no navegador. Sem dependências,
sem build, sem arquivos de imagem ou áudio: todo o pixel art é desenhado por código em
canvases offscreen no boot, e a trilha sonora é sintetizada via Web Audio.

## Como jogar

Abra `index.html` no navegador (duplo clique já funciona — os scripts são clássicos, não módulos).
Se preferir servidor local: `servir.bat` ou `python -m http.server 8080`.

### Multijogador pela internet (GitHub Pages ou qualquer site estático)

Sem servidor próprio: cada navegador se conecta direto no de quem hospeda (WebRTC, via [PeerJS](https://peerjs.com),
carregado do CDN só quando você abre o multijogador; o servidor público do PeerJS só apresenta um ao outro).
Não há limite fixo de jogadores: entra quem tiver o código.

1. Quem hospeda aperta **N** no título, **CRIAR SALA**, escolhe o modo (no VS, também a arena) e o herói.
   A tela mostra um **código de sala** de 5 letras (C copia o link `...?sala=CODIGO`).
2. Os outros abrem o jogo, apertam **N**, **ENTRAR NA SALA**, digitam o código (ou abrem o link, que já
   vem com ele) e escolhem o herói. Cada um vira o jogador 2, 3, 4...
3. Na **sala de espera** todos veem quem já entrou. O anfitrião aperta **ENTER** para começar (no VS precisa
   de pelo menos mais um jogador).
4. A sala continua aberta durante a partida: quem chegar depois **entra no meio** (no cooperativo e no
   competitivo, ao lado do anfitrião; no VS, assiste e entra na próxima rodada). O código aparece no menu (ESC).

Precisa de internet em todos. Em algumas redes muito fechadas (NAT simétrico, firewall de empresa) a conexão
direta pode não sair, porque não há servidor TURN.

### Multijogador em rede local

Precisa do [Node.js](https://nodejs.org) no PC de quem hospeda (sem pacotes extras). Quando o jogo é aberto
pelo `servidor.js`, ele percebe (rota `/aurum-servidor`) e usa o WebSocket local em vez do código de sala.

1. No PC que hospeda, rode `servir.bat` (ou `node servidor.js`). O terminal mostra os endereços,
   por exemplo `http://192.168.1.100:8080/`. Na primeira vez o Windows pergunta sobre o firewall:
   permita em **redes privadas**.
2. Quem hospeda abre `http://localhost:8080/`, aperta **N** no título, **CRIAR SALA**, escolhe o modo
   e o herói. A tela mostra o endereço para os outros.
3. Os outros, no mesmo Wi-Fi/rede, abrem esse endereço no navegador, apertam **N**,
   **ENTRAR NA SALA** e escolhem o herói. O anfitrião aperta ENTER para começar.

| Modo | Como funciona |
|---|---|
| **Cooperativo** | O jogo normal com todos. Quem cair volta em 4 s ao lado de quem está vivo; se todos caírem, é fim de jogo. Chaves e fragmentos valem para o grupo. |
| **Competitivo** | 3 minutos: quem matar mais bichos vence (empate no topo = empate). Aparecem inimigos novos o tempo todo na sala (até 6 vivos com 2 jogadores, +2 por jogador a mais, até 16). Quem cair volta em 3 s. Placar e cronômetro no topo da tela. |
| **VS** | **Todos contra todos** numa **arena fechada** (sem saídas), escolhida por quem cria a sala: Campo de Aurum, Caverna dos Goblins, Pântano Sombrio ou Castelo Sombrio. Os jogadores começam em roda, de frente para o centro. Sem monstros, **20 de vida** cada, mostrada em **barra** (no HUD e no placar do topo). Quem cai está eliminado e assiste; **o último de pé vence**. Todos os ataques e especiais acertam os oponentes (todo F — onda de choque, bola de fogo, meteoro, explosivos, tsunami, bomba nuclear e os F dos heróis novos — tira 2, o dobro de uma espada comum). X, C e V liberam com o **dano causado nos oponentes**: 3, 6 e 10 pontos de vida tirados. |

No fim do competitivo e do VS, o anfitrião aperta ENTER para jogar de novo (com todos que estão na sala) ou ESC para sair.

Como funciona: o PC do anfitrião roda o jogo inteiro com todos os heróis; cada convidado só envia os
comandos e recebe a tela pronta, os sons e a música, a 30 quadros por segundo. A imagem do jogo é a mesma
para todos, então o anfitrião a codifica **uma vez só** e cada convidado recebe à parte só a faixa do próprio
HUD (15 por segundo). Quem está com a loja aberta, caído ou no placar final recebe uma tela inteira só dele.
Assim todos veem sempre a mesma coisa, sem dessincronizar. A tela é compartilhada: todos ficam na mesma sala,
e quando um sai pela borda os outros vão junto. Cada jogador tem uma setinha de uma cor em cima do herói
(amarela = 1, azul = 2, vermelha = 3, verde = 4...).

**Quantos cabem:** pela internet, o anfitrião sobe um vídeo para cada convidado (cerca de 3 a 5 Mbps cada;
a qualidade da imagem cai um pouco a cada jogador a mais). Com internet doméstica comum, 3 a 5 convidados
rodam bem; mais que isso depende do upload de quem hospeda. Na rede local o anfitrião sobe cada quadro uma
vez só e o `servidor.js` copia para todos, então cabe bem mais gente. Um convidado com a conexão lenta
perde quadros sem atrasar os outros. O multijogador não mexe no save do modo solo.

### Controles

| Ação | Teclado | Gamepad | Toque |
|---|---|---|---|
| Mover (8 direções, com diagonais) | WASD / setas | direcional ou analógico | d-pad na tela |
| Atacar (espada, flecha ou magia) | J ou Z | A / X | botão A |
| Rolar / dash (invulnerável; 2× mais longo no arqueiro) | Espaço, K ou Shift | B / RB | botão ROL |
| **Habilidade especial** (recarga de 60 s, a única com recarga) | F | Y / RT | botão F |
| **Salva de flechas** (arqueiro; segure para 4 salvas) / **Investida** (guerreiro; segure para carregar; sem abates, recarrega em 3 s) / **Tempestade de raios** (mago) / **Estrelas ninja** (ninja) / **Tridente arremessado** (Percy; sem abates, 3 s de espera) / **3 minas** (bomber) — libera com **3 abates** | X | LT / LB | botão X |
| **4 giros de 360°** (arqueiro) / **Tornado** (guerreiro) / **Escudo** (mago) / **Velocidade** (ninja) / **Barreira de água** (Percy) / **Escudo de bombas** (bomber) — libera com **6 abates** | C | RB / R3 | botão C |
| **Flecha dourada** (arqueiro) / **Investida relâmpago** (guerreiro) / **Inferno** (mago) / **Névoa de veneno** (ninja) / **Redemoinho** (Percy) / **Bomba quicante** (bomber) — libera com **10 abates** | V | L3 | botão V |
| Escolher herói / confirmar | setas + Enter | direcional + Start | d-pad + ≡ |
| Começar / continuar | Enter | Start | ≡ |
| Menu: loja e mapa (pausa no solo) | Esc ou P | Select | ≡ |
| **Teleporte** para uma sala já visitada do mundo (não vale em luta com chefe) | T | — | — |
| Som liga/desliga | M | — | — |
| Multijogador (tela inicial) | N | — | — |
| FPS | F3 | — | — |

## Loja

O ESC abre o menu com duas abas: **LOJA** e **MAPA** (setas para os lados trocam). Na loja, setas para
cima e para baixo escolhem, J ou Enter compra, ESC fecha. Cada item se compra uma vez e fica no save.

| Preço | Item | Efeito |
|---|---|---|
| 100 moedas | Cura automática | recupera meio coração a cada 10 s |
| 200 moedas | Arma principal +1 | +1 de dano no ataque (J): espada, flecha, magia do cajado, katana ou tridente |
| 300 moedas | Velocidade +30% | anda 30% mais rápido (também vale no tornado do guerreiro e na velocidade do ninja) |
| 400 moedas | Demais armas +1 | +1 no dano base do X, C e V (multiplicado junto, ex.: investida máxima 3×) |

No solo o jogo fica pausado com o menu aberto. No multijogador **cada jogador abre a sua loja** e
compra com as próprias moedas; o jogo não pausa — quem está na loja fica parado.

## Os onze heróis

Ao começar um jogo novo você escolhe a classe na tela de seleção (setas escolhem, Enter confirma).
Cada uma tem sprites próprios nas 8 direções, ataque diferente e stats diferentes. A classe fica
gravada no save.

| Classe | Arma | Vida | Velocidade | Dano | Ataque |
|---|---|---|---|---|---|
| **Guerreiro** | Espada | 5 corações | 1,5 | 1 | Golpe em arco de 180°, curto alcance |
| **Arqueiro** | Arco | 5 corações | 1,7 | 1 | Flecha carregável, onda de choque, rolamento longo |
| **Mago** | Cajado | 5 corações | 1,20 | 2 | Cajado em arco + magia elemental |
| **Ninja** | Katana | 5 corações | 1,6 | 2 | Katana em arco de 180° (2× o dano da espada) |
| **Percy** | Tridente | 5 corações | 1,5 | 1 | Golpe da espada com 1,5× o alcance |
| **Bomber** | Bombas | 5 corações | 1,4 | 1 | Bombas em arco; a cada 10, uma grande |
| **Cronomante** | Relógio | 5 corações | 1,5 | 1 | Relógio que deixa o alvo lento |
| **Necromante** | Foice | 5 corações | 1,4 | 1 | Foice longa (1,3× o alcance) que rouba vida |
| **Engenheiro** | Rebitadora | 5 corações | 1,5 | 1 | Segure J: tiro automático |
| **Druida** | Espinhos | 5 corações | 1,5 | 1 | Espinho que prende; vira lobo ou urso |
| **Vampira** | Rapieira | 5 corações | 1,7 | 1 | Rapieira que rouba vida; abates curam |

Na tela de seleção os heróis ficam em duas linhas: setas para os lados passam por todos, para cima e
para baixo trocam de linha.

Cada 4 fragmentos sobem o dano de qualquer uma delas um nível (poder ×2, ×3, ×4 e ×5 com os dezesseis).

### Tiro carregado (arqueiro)

Segure o botão de ataque para puxar a corda e solte para atirar. Enquanto mira, o herói anda a 55%
da velocidade e faíscas convergem para a ponta da flecha. A barra de carga sobre a cabeça **só
aparece depois de 0,5 segundo segurando** — tiros rápidos não poluem a tela. Carga cheia em 0,75 s,
com um *ping* e a barra virando branca.

| Carga | Velocidade | Alcance | Tamanho ao sair | Dano | Atravessa | Empurrão |
|---|---|---|---|---|---|---|
| Tapa no botão | 2,6 | 81 px | 1,6× | 1 | — | 3× (~37 px) |
| 0,25 s | 3,5 | 117 px | 1,9× | 1 | — | 3× |
| 0,5 s | 4,5 | 153 px | 2,3× | 1 | — | 3× |
| Cheia (0,75 s) | 5,4 | 190 px | 2,6× | 2 | 1 inimigo | **até a parede ou a borda da sala** |

Todo disparo do arqueiro (tiro normal, salva do X, giro do C e flecha dourada) também **afasta o inimigo colado**, sem dano: quem estiver até 28 px à frente ou até 16 px em qualquer lado leva o empurrão triplo (~37 px). Chefes também são afastados; congelados e o golem não.

O empurrão comum (espada, magia) leva o inimigo ~12 px; a flecha normal leva 3× isso. A carga cheia
arrasta o inimigo a 6 px por quadro até ele bater numa parede ou na borda da sala. Chefes só levam o
empurrão triplo, e inimigo congelado ou paralisado não sai do lugar. A salva do X não mudou.

A flecha **sai grande e encolhe** durante o voo (2,55× → 0,85×) e tem **alcance limitado**: ao
esgotá-lo ela para com um estalo de partículas. O rastro é feito de ecos que guardam onde a flecha
esteve e com que tamanho — cada um com vida própria, sumindo **um por vez** enquanto a flecha
avança, e terminando de sumir depois que ela para (8 → 7 → … → 0).

### Salva de três flechas — tecla X (arqueiro)

Ataque especial que libera com **3 abates** (barra verde no HUD e na pausa).
Dispara **três flechas lado a lado**, uma por bloco (16 px de distância entre elas), cobrindo uma
parede de 3 blocos de altura quando você olha para os lados. As flechas da salva **sempre vão até o
fim da sala** (só param na parede ou na borda), sem precisar carregar.

| Como aperta | Salvas | Flechas | Dano | Atravessa |
|---|---|---|---|---|
| Tapa no X (ou soltar antes da carga cheia) | 1 | 3 | **2×** a flecha do Z | — |
| Segurar até a carga cheia (1,5 s, barra branca) | **4 seguidas** (uma a cada 10 quadros) | **12** | **2×** a flecha do Z | tudo pela frente |

Na chuva de flechas o herói pode andar e virar entre uma salva e outra, espalhando os tiros. Trocar de
sala cancela as salvas que faltam. As flechas encolhem ao longo dos primeiros 140 px (2,5× → 0,85×) e
estabilizam depois disso.

### Giro explosivo — tecla C (arqueiro)

O herói dá **4 voltas** no lugar, soltando **uma flecha em cada uma das 8 direções por volta** (direita,
diagonal, baixo, diagonal, esquerda, e assim por diante), uma a cada 3 quadros: **32 flechas em 1,6 s**,
4 em cada direção. Alcance de 120 px por flecha (7,5 blocos). As flechas são **explosivas**: explodem ao
acertar um inimigo, bater na parede ou chegar ao fim do alcance, e a explosão (raio de 1 bloco) dá **3× o
dano da flecha do Z** em todos por perto. O herói fica **invulnerável durante o giro**. Libera com
**6 abates**, barra roxa no HUD.

Serve para quando você é cercado: num teste com 8 inimigos em círculo ao redor, todos os 8 foram
atingidos.

### Flecha dourada — tecla V (arqueiro)

Solta uma flecha de ouro na direção encarada que **persegue o inimigo mais próximo**, vira aos poucos
até ele e atravessa paredes. Ao acertar, escolhe o próximo inimigo vivo que ainda não atingiu, e assim
por diante até **passar por todos os inimigos da sala** (inclusive os que nascem no meio, como os
filhotes de slime e caco). Cada um leva **4× o dano da flecha do Z** e os **monstros comuns morrem na
hora**; chefes e o oponente do VS só levam o dano. No **último inimigo** a flecha **crava**, pisca por
2/3 s e **explode** (raio de 2 blocos, 4× de novo em todos por perto). Sem inimigos na sala, voa reto
160 px e some. Libera com **10 abates**, barra dourada no HUD.

### Magia elemental (mago)

O ataque (J) varre o **cajado em arco de 180°**, igual à espada do guerreiro, com o dano normal do mago
(2, ou 4 com o fragmento). No meio da varredura sai a magia do elemento atual. Os elementos seguem uma
**ordem ponderada**: **10 tiros de fogo, 2 de gelo, 5 de fogo e 1 de raio**, e recomeça. O HUD mostra o elemento
atual, quantos tiros faltam dele (ex.: `FOGO x5`) e qual vem depois:

| Elemento | Dano do tiro | Efeito |
|---|---|---|
| **Fogo** | 2 | Só o dano do impacto (não queima) |
| **Gelo** | 1 | O inimigo fica **congelado por 10 s** num bloco de gelo: não anda, não ataca e não machuca no toque (pisca no último 1,5 s) |
| **Raio** | 1 | **Paralisa por 2 s** e **pula** para o inimigo mais próximo (até 3 blocos), em cadeia, até 4 inimigos extras; cada um leva 1 de dano e fica paralisado |

Gelo apaga o fogo e fogo derrete o gelo. Chefes sofrem menos (congelam 3 s, paralisam 1 s). No VS
os efeitos também pegam no oponente, mais curtos: congela 1,5 s, queima 3 s, paralisa 1 s.
Abates pela queimadura contam para quem lançou o fogo no competitivo.

### Habilidades do mago — X, C e V

| Tecla | Habilidade | O que faz | Libera com |
|---|---|---|---|
| **X** | Inferno | Ergue o cajado e bate no chão: um anel de fogo sai do mago e **paralisa todos da sala por 3 s**. **Não causa dano nenhum**: é controle puro | 3 abates |
| **C** | Escudo arcano | Uma bolha azul em volta do mago: **invulnerável por 6 s** (nada causa dano, nem queimadura ou choque); pisca no último 1,5 s | 6 abates |
| **V** | Tempestade de raios | Ergue o cajado e bate no chão: saem raios do mago até **todos os inimigos da sala**, que levam **1 de dano** e ficam **paralisados por 7 s**. É a única das três que fere | 10 abates |

O golpe no chão leva 1/3 de segundo erguendo o cajado; levar dano nesse meio cancela sem gastar o
especial. Os dois pegam qualquer um: monstros, chefes e, no VS, o oponente.

### O guerreiro

Cavaleiro loiro de cabelo espetado, armadura prateada com ombreiras, peitoral e capa azuis e cinto
dourado (desenho próprio em `drawKnight`, `src/art.js`).
O arqueiro é de pele clara, cabelo preto sem capuz e roupa preta com gola e cinto cinza; o mago usa
manto roxo com detalhe dourado e chapéu de aba larga.
Todos andam e atacam nas **8 direções** — cada direção tem pose própria (frente, costas, perfil e as
quatro diagonais em 3/4), mais duas poses de golpe por direção (preparação e impacto).

### Especiais do guerreiro — X, C e V

Mesmas teclas do arqueiro, com barras no HUD e abates que faltam na pausa. O X não depende de abates: recarrega em 5 s. A investida (X) e o tornado (C) deixam o guerreiro **invulnerável só no primeiro 1 s**
(depois disso ele pode levar dano, o que interrompe o golpe). A investida relâmpago (V) deixa o guerreiro **invulnerável por 3 s, piscando**,
contados a partir do golpe, e ele fica intocável durante todo o relâmpago. Nenhum dos três troca de sala nem pega
escada no meio.

| Tecla | Especial | O que faz | Dano | Libera com |
|---|---|---|---|---|
| X | Investida | **um aperto** (não precisa segurar): atravessa a sala até a parede ou a borda, com a espada à frente | **3×** a espada | sempre (5 s de recarga) |
| C | Tornado | **3 s girando** e correndo atrás do inimigo mais próximo com **o dobro da velocidade** de andar; cada volta acerta de novo | **2×** por volta | 6 abates |
| V | Investida relâmpago | avança em cada inimigo da sala, um por vez (sempre o mais próximo), atravessando paredes; quem é atingido fica **paralisado 5 s** | **4×** em cada | 10 abates |

Na investida cada inimigo leva o golpe uma vez. A relâmpago termina onde caiu o último inimigo;
se esse lugar for parede ou buraco, o guerreiro volta ao ponto de partida. Sem inimigos na sala ela
não sai e não gasta o especial.

### O ninja

Roupa preta, pano cobrindo o rosto e faixa vermelha na testa. Ataca com a **katana** (J), no mesmo arco de
180° da espada, com **2× o dano da espada** (2, ou 4 com o fragmento).

| Tecla | Habilidade | O que faz | Libera com |
|---|---|---|---|
| X | Estrelas ninja | **5 estrelas em leque** na direção encarada; atravessam paredes e inimigos até a borda da sala. Cada uma causa 1,5× a katana (3) | 3 abates |
| C | Velocidade | velocidade de andar **2,7 por 10 s** | 6 abates |
| V | Névoa de veneno | uma névoa cobre **a sala toda por 6 s**: todos os inimigos (e o oponente no VS) levam 1 de dano por segundo; o ninja é imune | 10 abates |
| F | Explosivos | um explosivo voa até **cada inimigo da sala** e explode nele: inimigos comuns morrem, chefes levam 1/3 da vida | recarga de 60 s |

### Percy

Cabelo preto bagunçado, camiseta laranja e calça jeans. Ataca com o **tridente** (J): o mesmo golpe em
arco de 180° da espada do guerreiro, com o mesmo dano, mas **1,5× o alcance**.

| Tecla | Habilidade | O que faz | Libera com |
|---|---|---|---|
| X | Tridente arremessado | arremessa o tridente na direção encarada: vai até a borda da sala e volta para a mão em **2 s**, atravessando paredes. **2× o dano** do tridente, acerta cada alvo na ida e na volta. Sem o tridente na mão, o J fica travado até ele voltar | sempre (3 s de espera) |
| C | Barreira de água | parede de **5 blocos** à frente do Percy por 8 s. Inimigos (e o oponente no VS) não atravessam e tiros inimigos se desfazem nela | 6 abates |
| V | Redemoinho | um tornado de água no meio da sala **puxa todos para o centro por 8 s** e no fim explode: quem estiver a até 3,5 blocos leva **4× o dano** do tridente | 10 abates |
| F | Tsunami | uma onda entra pela esquerda e **arrasta todos para a direita**; os monstros morrem afogados, chefes levam 1/3 da vida. No VS o oponente não morre: é arrastado até a borda direita e leva o dano de F do VS | recarga de 60 s |

### Bomber

Gorro de aviador, roupa verde-oliva e cinto amarelo.

| Tecla | Habilidade | O que faz | Libera com |
|---|---|---|---|
| J | Bomba | joga uma bomba em arco 3,5 blocos à frente; ela explode ao cair: **2× o dano** num raio de ~1 bloco. **A cada 10 bombas, uma grande** (mais longe, **5×** o dano, raio de ~3 blocos). O HUD mostra quantas faltam | — |
| X | 3 minas | cada aperto planta uma mina **onde o bomber está** (3 por uso). Arma em 0,5 s e explode quando um alvo pisa nela: 4× o dano num raio de ~2 blocos | 3 abates |
| C | Escudo de bombas | 6 bombas giram em volta dele por 7 s; cada uma explode ao encostar num alvo (3× o dano) e desfaz tiros inimigos. As que sobrarem **explodem todas juntas** no fim | 6 abates |
| V | Bomba quicante | vai **quicando de inimigo em inimigo**, sempre o mais próximo que ainda não atingiu, e explode em cada um: monstro morre na hora, chefe leva 1/3 da vida. Some depois do último. No VS não mata: tira 4× o dano | 10 abates |
| F | Bomba nuclear | cai no meio da sala; no impacto a tela fica branca e volta com fade. Monstros morrem, chefes levam 1/3 e o oponente no VS leva o dano de F onde estiver | recarga de 60 s |

### Cronomante — controla o tempo

| Tecla | Habilidade | O que faz | Libera com |
|---|---|---|---|
| J | Relógio | projétil com 2× o dano; quem é atingido fica **lento por 3 s** (age em metade dos quadros) | — |
| X | Rebobinar | **volta para onde estava 3 s atrás**, com a vida daquela hora se era maior, e limpa fogo, gelo, paralisia, lentidão e raízes. Deixa um rastro de fantasmas | 3 abates |
| C | Parar o tempo | **tudo para por 4 s**: monstros, tiros inimigos e, no VS, o oponente. Só o que os jogadores criaram continua andando (e dá para bater em todo mundo) | 6 abates |
| V | Paradoxo | marca todos com um relógio; **em 3 s cada um sofre de novo o dobro do dano que levou nesse tempo** (no mínimo 2; no VS no máximo 6). Combine com o C | 10 abates |
| F | Fim dos tempos | o tempo para, um relógio gigante gira e todos viram pó: monstros morrem, chefes levam 1/3 | recarga de 60 s |

### Necromante — mortos-vivos

| Tecla | Habilidade | O que faz | Libera com |
|---|---|---|---|
| J | Foice | golpe em arco com 1,3× o alcance; **a cada 4 golpes que acertam, cura meio coração** | — |
| X | Erguer os mortos | **3 esqueletos aliados por 15 s** que caçam o inimigo mais próximo (2× o dano; no VS, 1 por golpe). Sem inimigos, seguem o necromante | 3 abates |
| C | Corrente de almas | liga todos os inimigos por 6 s: **o dano que um leva vai para todos os outros**. Precisa de 2 alvos | 6 abates |
| V | Colheita | uma foice gigante corta a sala: **executa** quem está com metade da vida ou menos (chefe: 1/4 ou menos); os outros levam 3× o dano. Cada execução cura meio coração | 10 abates |
| F | Portal do submundo | poços abrem sob cada inimigo e mãos os arrastam para baixo: monstros morrem, chefes levam 1/3 | recarga de 60 s |

### Engenheiro — máquinas

| Tecla | Habilidade | O que faz | Libera com |
|---|---|---|---|
| J (segure) | Rebitadora | **tiro automático** enquanto segura: um prego a cada 7 quadros, com leve espalhamento. Anda a 55% da velocidade atirando | — |
| X | Torreta | coloca uma torreta que mira e atira sozinha por 20 s (alcance de 12 blocos). Até 2 ao mesmo tempo; a terceira troca a mais velha | 3 abates |
| C | Campo refletor | por 6 s, **tiros inimigos que chegam perto voltam** no inimigo mais próximo, com o dobro do dano | 6 abates |
| V | Laser | 3 s de feixe contínuo até a parede; o engenheiro fica parado **mirando com as setas** (8 direções) e tudo no caminho leva dano a cada 8 quadros | 10 abates |
| F | Enxame de drones | drones sobem em volta dele e mergulham, **um em cada inimigo**: monstros morrem, chefes levam 1/3 | recarga de 60 s |

### Druida — transformações

| Tecla | Habilidade | O que faz | Libera com |
|---|---|---|---|
| J | Espinho / garras | em forma humana atira um espinho que **prende o alvo por 1 s** (raízes). Transformado, ataca com garras em arco | — |
| X | Forma de lobo | por 12 s: velocidade **2,4** e mordida com **2×** o dano | 3 abates |
| C | Forma de urso | por 12 s: velocidade 1,1, patada com **3×** o dano e 1,2× o alcance, e **leva metade do dano** | 6 abates |
| V | Bosque sagrado | chão florido de ~3,5 blocos por 10 s: **cura meio coração a cada 1,5 s** de quem está dentro (os dois no cooperativo) e prende os inimigos dentro, com 1 de dano por segundo | 10 abates |
| F | Fúria da floresta | raízes com espinhos brotam sob cada inimigo: monstros morrem, chefes levam 1/3 | recarga de 60 s |

### Vampira — paga com sangue

X, C e V **não usam abates: custam vida** (1, 2 e 3 meios-corações) e têm recarga curta (1 s, 5 s e
10 s). Nunca deixam com 0 de vida: sem sangue suficiente, não saem. Para compensar, **cada abate cura
meio coração** e a rapieira rouba vida.

| Tecla | Habilidade | O que faz | Custo |
|---|---|---|---|
| J | Rapieira | golpe em arco (1,1× o alcance); **a cada 3 golpes que acertam, cura meio coração** | — |
| X | Lança de sangue | lança que atravessa paredes e todos os inimigos até a borda da sala, 3× o dano | 1 |
| C | Enxame de morcegos | por 2,5 s vira morcegos: **intocável**, velocidade 3, e cada inimigo que atravessa leva 2× o dano e **cura meio coração** | 2 |
| V | Banquete | fios de sangue ligam todos a ela: cada um leva 3× o dano e ela cura meio coração por alvo (até 3 corações) | 3 |
| F | Lua de sangue | a sala fica vermelha e todos são drenados: monstros morrem, chefes levam 1/3, e ela **volta com a vida cheia** | recarga de 60 s |

### O golpe de espada

Arco de **180° exatos**, com a **base do cabo cravada na mão**: o pomo fica parado e só a espada acima
dele inclina. São 32 sprites de lâmina gerados em volta desse pivô (um a cada 11,25°), cada um num
canvas de 48×48 com o pivô no centro. O golpe começa com a espada na vertical
apontada para cima, passa pela direção que o herói encara e termina na vertical apontada para baixo —
alinhado no eixo Y nas duas pontas. O arco espelha quando o herói olha para a esquerda, senão o golpe
sairia de baixo para cima.

- 20 frames: 5 de preparação, 11 de varredura, 4 de recuperação
- Rastro: cada eco da lâmina nasce com 3 quadros de vida e some sozinho, um por vez (alfa 0,42 → 0,19 → 0,05).
  O último eco nasce no fim da varredura, então o rastro zera exatamente quando o golpe termina. Faísca na ponta da lâmina
- O acerto acompanha a lâmina — três caixas amostradas ao longo dela, então o que a espada cruza
  durante a varredura é atingido (uma vez por golpe), não uma caixa fixa à frente
- O herói **não avança mais** ao atacar; ele fica plantado e gira a espada
- Lâmina e rastro ficam **atrás** do herói em sete das oito direções; só virado para baixo a espada passa na frente do corpo

### Habilidade especial (F)

**Guerreiro — Bola de Fogo**: lança um projétil na direção em que você está olhando. Ao encostar em
parede, inimigo ou no fim do alcance, ele detona numa explosão que toma a sala inteira.

**Mago — Meteoro Elemental**: um meteoro desce do alto da tela e cai **no meio da sala** (0,9 s, com a
sombra crescendo no ponto de impacto). No impacto a **tela inteira fica branca** por 0,4 s e volta ao
normal com um **fade** de 1,2 s — quando a imagem volta, os inimigos já estão todos mortos.

As explosões (e os explosivos do ninja) funcionam igual:

- **Inimigos comuns morrem de um hit**, sem exceção — a explosão ignora a armadura do cavaleiro
  e a fase intangível do Lich.
- **Chefes resistem**: levam 1/3 da vida máxima de dano, então não dá para vencer só com o fogo.
- **Recarga de 60 segundos**, com contador e barra no HUD (canto direito) e também na tela de pausa.

**Arqueiro — Onda de Choque**: em vez de projétil, um círculo de energia cresce a partir do herói
(4,2 px por quadro) até cobrir a sala inteira. Os inimigos morrem **na ordem em que a onda os
alcança** — num teste, alvos a 20, 60, 110 e 160 px morreram nos quadros 5, 14, 26 e 38. Quando o
círculo chega nas paredes, não sobrou nada vivo: inimigos nos quatro cantos da sala morrem todos.
**Chefes não morrem** — levam o mesmo 1/3 da vida máxima das outras habilidades e continuam de pé.

### X, C e V liberam por abate

**Um especial não recarrega a si mesmo:** abates e dano causados pelo X só carregam o C e o V (e assim por diante).
Vale para tudo que sai do especial: flechas, torretas e seus tiros, lacaios, bombas, névoa, queimadura do Inferno,
corrente de almas, e os especiais de estado (investida, tornado, relâmpago, forma de lobo/urso, laser, morcegos).

**Dano em chefe também carrega:** cada 2 de dano causado num chefe vale 1 abate (um golpe carrega no máximo 2,
para um especial forte não se recarregar sozinho). Golpes bloqueados (frente do Colosso, vidro do Reflexo,
escudos do Coração) não contam; queimadura e veneno contam. Ajuste em `DANO_POR_CARGA` e `CARGA_MAX_GOLPE` (`src/entities.js`).

X, C e V **não têm recarga por tempo**. Cada um tem um contador de abates desde a última vez que foi usado:

| Tecla | Abates para liberar |
|---|---|
| X | 3 |
| C | 6 |
| V | 10 |

Liberado, o especial fica pronto (barra cheia e **OK** no HUD) até você usar; ao usar, o contador daquele
especial volta a zero e os outros continuam contando. O jogo começa com os três travados. Apertar um travado
avisa quanto falta. No HUD cada um mostra `abates/necessários`; a pausa mostra quanto falta.

No **VS** não há monstros: cada ponto de vida tirado do oponente conta como um abate (tirar 3 de vida libera
o X, e assim por diante).

Só o **F** tem recarga (60 s). Cada inimigo morto ainda **adianta 0,5 s** dessa recarga. As barras do HUD
piscam em branco no momento do abate.

## A história

Há muito tempo, Aurum era um só mundo, sustentado pelo **Coração do Mundo**. No dia do **Colapso** o Coração
rachou e o mundo se partiu em mil universos. Das rachaduras nasceram as **fendas**; elas se fundiram umas nas
outras e abriram **portais** por toda a terra. Pelos portais vieram criaturas estranhas, de mundos que nunca
deviam se tocar, e elas caçam o que restou dos humanos. Os pedaços do Coração se espalharam por oito mundos: **dezesseis fragmentos**,
cada um nas garras de um **guardião das fendas**. Você é um dos últimos heróis: atravesse os portais, derrote os
monstros e **resgate os fragmentos do mundo**.

### Abertura

Todo jogo novo (solo ou cooperativo) começa com uma **abertura em cenas**, como um vídeo: o mundo inteiro
girando, o Coração batendo, o Colapso (tela treme, clarão, o cristal racha), o planeta se partindo em pedaços,
portais se abrindo sobre os morros, olhos vermelhos saindo de um portal enquanto as luzes da vila se apagam, os
os fragmentos sendo levados, e o seu herói no alto de uma colina ao pôr do sol. As legendas são digitadas letra
a letra e tocam sobre uma **trilha própria** (`historia`: lenta, em Lá menor, com acordes longos Am–F–C–G / Am–F–G–E).
**ENTER pula a história**; **J** avança uma cena. Ao atravessar o último portal, um final no mesmo estilo mostra
os fragmentos se juntando, o planeta se refazendo e as luzes da vila voltando.

## A campanha: oito mundos de 12 salas

Cada mundo tem **12 salas diferentes** em sequência (grid 4×3, percorrido em serpente), sempre com a mesma lógica:

| Sala | Papel |
|---|---|
| 1 | Início, com uma pedra de lore (dica do primeiro guardião) |
| 2, 4, 5 | Inimigos |
| 3 | Tesouro: baú com recipiente de coração |
| 6 | **Guardião 1** |
| 7 | Descanso: **fonte** que enche a vida, salva e vira ponto de retorno se você cair; pedra com dica do guardião 2 |
| 8, 9, 10 | Inimigos |
| 11 | **Guardião 2** |
| 12 | **Puzzle**: resolvido, abre o **portal** para o próximo mundo |

Só **6 das 12 salas** têm inimigos. Os dois guardiões têm **muita vida**, e **todo golpe deles tira 1 coração e
meio** (contato, tiros, ondas, raios). O F e a bola de fogo tiram só **1/6** da vida deles (nos chefes antigos, 1/3).
Cada guardião solta um **fragmento** (são **16 no total**, 2 por mundo); a cada 4 fragmentos o dano das armas
sobe um nível (poder ×2, ×3, ×4 e ×5).
Salas de guardião se fecham até ele cair.

| Mundo | Cenário | Inimigos | Puzzle |
|---|---|---|---|
| **1 - Aurum Fraturado** | campo | goblins, slimes, morcegos, machadeiros, arqueiros, aranhas, caçadores, bombardeiros | **Runas de luz**: 3×3 runas; pisar numa inverte ela e as vizinhas; acenda todas |
| **2 - Pântano das Fendas** | pântano | sapos, mosquitos, slimes, bruxas, aranhas, xamãs, fantasmas | **Canção do totem**: o totem acende uma sequência de cores; pise nas pedras na mesma ordem (3, 4 e 5 notas) |
| **3 - Cidadela do Vazio** | castelo | lanceiros, besteiros, gárgulas, esqueletos, feiticeiros, cavaleiros, golens | **Runas do mural**: 5 runas com 4 símbolos; pisar gira a runa e as duas do lado; iguale o mural |
| **4 - Deserto dos Espelhos** | dunas, arenito, cactos e chão de vidro | escorpiões, nômades, vermes das dunas, aranhas, caçadores, bombardeiros | **Runas do mural** |
| **5 - Geleira do Silêncio** | neve, gelo liso, pinheiros e paredes de gelo | lobos do gelo, oráculos do gelo, slimes, morcegos, cavaleiros, golens | **Runas de luz** |
| **6 - Forja do Mundo** | basalto, brasa, obsidiana e rios de lava | imps, golens de magma, machadeiros, gárgulas, besteiros, feiticeiros | **Canção do totem** |
| **7 - Ilhas do Céu** | nuvem firme, pedra flutuante e abismo azul | harpias, silfos do vento, morcegos, gárgulas, besteiros, xamãs | **Runas do mural** |
| **8 - O Vazio Entre Mundos** | chão de estrelas, fendas abertas e muralhas negras | cacos do vazio, olhos do vazio, fantasmas, feiticeiros, cavaleiros | **Runas de luz** |

Nos puzzles de runas há uma **pedra vermelha**. A pedra vermelha só existe no **Fácil**: pisar nela recomeça
o puzzle e mostra a **dica** (as runas da solução, calculada a partir do estado atual, piscam com moldura azul;
no mundo 3 o número em cima diz quantas vezes pisar). No Médio e no Difícil não há pedra nem dica.

### Dificuldade

Depois de escolher o herói aparece a tela de **dificuldade** (setas escolhem, Enter começa). Dá para trocar a
qualquer hora no menu (Esc), aba **MAPA**, com cima/baixo; a escolha fica salva. Vale para monstros que nascem
depois da troca.

| | Vida dos inimigos | Vida dos chefes | Ritmo dos chefes | Tiros, raios, escudos e invocações | Dano que você leva | Golpe de chefe | Moedas por monstro |
|---|---|---|---|---|---|---|---|
| **Fácil** | −30% | −30% | 75% (tudo mais lento) | 60% | metade (mínimo 1) | meio coração (qualquer golpe na luta com chefe) | **15** (5 moedas de 3) |
| **Médio** | normal | normal | normal | normal | normal | 1 coração e meio | **8** (4 moedas de 2) |
| **Difícil** | +40% | +50% | 120% | 135% | +50% | 2 corações e meio | **3** (3 moedas de 1) |

O ritmo vale para tudo que o chefe faz (andar, recarregar, preparar golpes); na batalha do Eco, para a
velocidade e a quantidade das balas. Os valores ficam em `DIFICULDADES` (`src/game.js`).

### Teleporte (T)

Abre o mapa do mundo atual: setas escolhem, Enter ou J teleporta, T ou Esc fecha. Só dá para ir a salas onde
você já esteve (ficam salvas no save), e não funciona com a sala do chefe fechada, no VS ou no competitivo.
Salas de inimigos já limpas continuam limpas.

No VS a dificuldade não muda nada. Ao cair e voltar (na fonte ou no começo do mundo), o herói volta com a **vida cheia**.

### Os dezesseis guardiões

| Mundo | Guardião | Vida | Mecânica |
|---|---|---|---|
| 1 | **Devorador de Fendas** | 150 | Abre 4 fendas na arena (6 abaixo da metade). Mergulha numa, some (intocável), uma outra brilha e ele sai dela num bote; depois fica **tonto** e leva 1,5× o dano. Também vomita sombras por todas as fendas e **rasga o espaço** em linhas que piscam e cortam a sala inteira. |
| 1 | **Colosso de Aurum** | 170 | Pedra pura pela frente: golpes de frente **não fazem nada**. Só o **núcleo nas costas** sente dor (2× o dano). Ele gira devagar para te encarar. Soco que solta onda de choque (role por cima), pedras em leque e **investida**: se bater na parede fica **atordoado** (2× de qualquer lado) e caem raios do teto. |
| 2 | **Mariposa do Abismo** | 230 | A arena fica **no escuro**: só a luz em volta do herói e dos **4 lampiões**. Encoste num lampião para acender. Ela odeia a luz mas não resiste: voa até um lampião aceso, **se queima**, cai e leva 2× o dano. O pó das asas apaga os lampiões por perto e solta espirais; também dá rasantes e chama mosquitos. Os olhos vermelhos aparecem no escuro. |
| 2 | **Eco das Fendas** | 500 | **Luta no estilo Undertale** (veja abaixo). |
| 3 | **O Reflexo** | 300 | Uma cópia sombria do seu herói que **repete cada passo, espelhada**. Golpes só acertam o vidro. A arena tem lava só do lado dele: posicione-se para que o espelho dele caia na **lava** (30 de dano por queimadura). Abaixo da metade o espelho **vira de cabeça para baixo** (copia invertido nos dois eixos). De tempos em tempos o vidro racha e ele te caça sozinho. |
| 3 | **Coração do Colapso** | 520 | O coração do mundo, podre, parado no centro. **Fase 1**: 4 escudos de cristal giram em volta e protegem o núcleo; quebre todos para expô-lo por 6 s. **Fase 2**: **gravidade** puxa todos para o centro (rolar escapa) enquanto espirais, anéis e ecos dos outros chefes (raios, ondas) caem. **Fase 3**: **o mundo encolhe**: as bordas da arena viram vazio, em dois anéis. |

| 4 | **Rainha Escaravelho** | 190 | **Cava** sob a areia (só aparece o monte de areia e ela fica intocável), sai embaixo de você e ataca. Se enrola numa **bola** que ricocheteia nas paredes: o casco em rotação não sente nada, mas depois do último ricochete ela fica **tonta de barriga para cima** (2× de dano). Também chama ninhadas de escorpiões. |
| 4 | **Esfinge de Vidro** | 200 | Ergue **4 espelhos** nos cantos da arena. Enquanto sobrar um, os golpes nela atravessam o vidro. Quebre todos e ela fica **exposta por 8 s levando o dobro de dano** — depois ergue os espelhos de novo (um a menos por rodada). Os espelhos também refletem o feixe dela. |
| 5 | **Titã de Gelo** | 240 | Coberto por **3 placas de armadura de gelo**. Um golpe solto não faz nada: só **3 acertos seguidos em 1,5 s** racham uma placa. Sem armadura ele fica **exposto por 6 s** e depois se recongela. Soco com onda de choque, estilhaços que congelam por 1 s e um sopro que empurra. |
| 5 | **Arauto do Inverno** | 210 | Traz a **nevasca**: um vento constante empurra você para um lado, e a direção muda de tempos em tempos (a seta de vento sai dele). Derruba **estalactites** marcadas no chão, faz espirais de cacos gelados e solta a **matilha de lobos do gelo**. |
| 6 | **Mestre Forjador** | 280 | Cada golpe dele **esquenta o martelo** (barra em cima da cabeça): martelada com onda e rasgo, leque de bolas de fogo e jorros de lava no chão. Quando o calor enche, ele para para **esfriar** e nesse tempo leva o **dobro de dano**. |
| 6 | **Serpente de Magma** | 150 + 6 anéis | O corpo tem **6 anéis** de escama que só passam correndo. Só a **ponta da cauda** pode ser cortada: cada anel cortado encurta e **acelera** a serpente. Com o corpo todo cortado, a cabeça finalmente abre. Cospe magma e deixa poças. |
| 7 | **Roc dos Ventos** | 240 | Circula **alto demais** para ser atingido, jogando penas-lâmina que ficam espetadas no chão. Desce, mira e **mergulha em linha reta**: se bater na parede, cai no chão e leva **2× de dano**. O vendaval das asas puxa todo mundo para ele. |
| 7 | **Guardião da Tempestade** | 230 | Fica **ligado a um dos 4 pilares** e nenhum golpe o alcança enquanto o pilar estiver de pé. Derrube o pilar aceso e ele **cai no chão, exposto (2× de dano)**, até se ligar a outro. Sem pilares, fica exposto de vez. Raios marcados no chão e rajadas de faísca. |
| 8 | **As Três Faces do Vazio** | 330 (uma vida só) | Três máscaras giram em volta do núcleo e **dividem a mesma vida**: bater em qualquer uma vale. Cada face ataca de um jeito (rajada reta, feixe marcado, cacos vivos). A cada terço de vida uma face **se fecha** e as que sobram ficam mais rápidas. |
| 8 | **Tecelão do Fim** | 620 | O último guardião, em **3 fases**. Tece **fios giratórios** que varreiam a arena (2, depois 3, depois 4): não fique na linha. Chama **ecos dos chefes que você já venceu** (rasgos, estalactites, chuva de penas, poças de lava) e, na fase final, **puxa todo mundo para o centro**. |

### Batalha estilo Undertale (Eco das Fendas)

Ao chegar perto do Eco a tela muda: fundo preto, o Eco no alto, uma caixa branca e os botões **LUTAR / AGIR /
ITEM / POUPAR** (setas escolhem, J ou Enter confirma, K ou Esc volta).

- **LUTAR**: um cursor corre a barra; aperte J perto do meio. Quanto mais no centro, mais dano (acerto perfeito = crítico).
- **AGIR**: ANALISAR, OUVIR, LEMBRAR, CANTAR e PROVOCAR. A ordem importa: **ouvir** revela os nomes, **lembrar**
  só funciona depois de ouvir, **cantar** só depois de lembrar. Isso enche a misericórdia; provocar deixa os ataques mais rápidos.
- **ITEM**: Pão de Aurum (+4, ×2) e Chá de Lírio (+8, ×1).
- **POUPAR**: com a misericórdia cheia (o nome fica amarelo), o Eco encontra paz e deixa o fragmento **e um coração extra**.
- **Turno do Eco**: a caixa encolhe e você controla a **alma** (coração vermelho) desviando das balas: chuva de
  lágrimas, fendas com uma brecha, anéis que se fecham, espiral e a **alma azul** (gravidade; seta para cima pula).
  Cada acerto tira 1 coração e meio da vida real do herói.

## O jogo

- Salas de 26×12 blocos, no formato tela-por-tela do Zelda 1 (a câmera desliza ao trocar de sala).
- **Inimigos**: goblin (perseguidor), goblin arqueiro, morcego, slime (divide ao morrer),
  esqueleto (investida em linha), cavaleiro (blindado, dano máximo 1 por golpe) e fantasma (atravessa paredes), mais:

  | Inimigo | Vida | Como luta |
  |---|---|---|
  | **Goblin machadeiro** | 5 | Corre até você, ergue o machado (treme) e avança num golpe que tira 1 coração; de meia distância arremessa o machado girando |
  | **Goblin xamã** | 4 | Mago: mantém distância, teleporta se você chega perto, lança 3 orbes sombrios e **cura** aliados feridos |
  | **Caçador** | 4 | Arqueiro humano que mira em qualquer ângulo, circula em volta de você e às vezes solta uma rajada de 3 flechas |
  | **Goblin bombardeiro** | 3 | Joga bombas em arco onde você está; a área pisca e explode depois de 0,7 s (1 coração) |
  | **Aranha** | 2 | Rápida, anda em zigue-zague e dá botes |
  | **Golem de pedra** | 14 | Lento e grande, não é empurrado, pisa no chão soltando uma onda (role por cima para escapar) |
  | **Sapo** | 3 | Pula até perto e dá uma linguada de 40 px |
  | **Mosquito gigante** | 2 | Voa em zigue-zague e dá picadas rápidas |
  | **Bruxa do pântano** | 5 | Joga frascos de veneno que viram uma poça (1 de dano a cada 0,5 s em quem pisa) e chama mosquitos |
  | **Lanceiro** | 6 | Alinha com você e dá uma estocada longa com a lança (1 coração) |
  | **Besteiro** | 5 | Mira em qualquer ângulo; virote rápido de 1 coração |
  | **Feiticeiro** | 6 | Anel de 6 orbes sombrios ou levanta esqueletos |
  | **Gárgula** | 7 | Parece uma estátua e não leva dano; quando você chega perto ela acorda, voa e mergulha |
  | **Escorpião de areia** | 5 | Circula em volta de você e dá uma ferroada que **paralisa 0,75 s** |
  | **Nômade das dunas** | 6 | Mantém distância e joga a **lâmina curva**, que vai e **volta para a mão** dele |
  | **Verme das dunas** | 8 | Cava sob a areia (**não dá para acertar**), emerge perto de você, morde e cospe areia; depois some de novo |
  | **Lobo do gelo** | 5 | Corre em matilha e **arremete deslizando** no gelo |
  | **Oráculo do gelo** | 7 | Recua e lança 3 orbes que **congelam por 1 s** |
  | **Imp da forja** | 4 | **Pisca** de um lado para o outro e cospe fogo (2 de dano) |
  | **Golem de magma** | 16 | Lento e duro; **deixa poças de lava** por onde passa e explode numa poça ao morrer |
  | **Harpia** | 6 | Voa **alto demais para ser atingida**, depois mergulha em linha reta |
  | **Silfo do vento** | 5 | Orbita você e solta **rajadas que empurram** |
  | **Olho do vazio** | 7 | Mantém distância e dispara um **feixe marcado no chão** (2 de dano) |
  | **Caco do vazio** | 6 | Gosma de escuridão que **se parte em dois** ao morrer, até três vezes |

  Quanto mais adiante no mundo, mais inimigos por sala e mais variados.
- **Moedas**: cada monstro comum explode em moedas que voam em arco e caem no chão; quem chegar perto pega
  (elas são atraídas de 2,5 blocos). Somem depois de 10 s. Às vezes cai um coração. **O total depende da
  dificuldade**: 15 no Fácil, 8 no Médio e 3 no Difícil. Ajuste em `moedas`/`pecas` dentro de `DIFICULDADES`
  (`src/game.js`).
- **Morrer para um chefe**: ao voltar (na fonte ou no começo do mundo) **todos os monstros do mundo renascem**;
  chefes já derrotados e baús abertos continuam como estavam. Morrer numa sala comum não reseta nada.
- **Progressão**: moedas, corações, recipientes de coração, 16 fragmentos (poder das armas sobe a cada 4),
  e a habilidade especial como carta na manga a cada 60 s. O portal do oitavo mundo leva ao final.
- **Extras**: arbustos cortáveis com drop, baús, pedras de lore, fonte de descanso com ponto de retorno,
  save automático em `localStorage`, minimapa na pausa (guardiões em vermelho, portal em roxo), controles de toque no celular.

O Reino de Aurum, as masmorras, o Pântano Sombrio e o Castelo Sombrio da versão anterior (com Grok, Troll,
Arquimago, Rei Goblin, Lich, Rei Sapo, Hidra, Cavaleiro Negro e Rei Sombrio) continuam no código (`genOverworld`,
`genDungeon`, `genPantano` em `src/world.js`), mas não fazem parte da campanha; os cenários deles viraram as
arenas do VS e a base visual dos oito mundos.

### Arte dos cenários

Grama, árvores, pedras, arbustos, água, areia, trilhas, paredes e pisos foram redesenhados com contorno, luz e
sombra. Cada tile estático tem **3 variações** escolhidas pela posição na sala, para o chão não parecer carimbado.

## Arquitetura

```
index.html      carrega os 10 scripts na ordem e chama AURUM.boot()
servidor.js     (Node) serve os arquivos e repassa as mensagens do multijogador via WebSocket (rede local)
style.css       layout, escala pixelada, botões de toque
src/core.js     matemática, input (teclado/gamepad/toque), áudio sintetizado,
                sequenciador de música, sistema de partículas
src/net.js      cliente de rede: WebSocket (servidor.js) ou WebRTC com código de sala (site estático),
                entrada remota de cada convidado, eco de sons e música
src/art.js      geração de todos os tiles e sprites em canvases offscreen
src/world.js    tiles, colisão, geração do mundo aberto e das masmorras, cache de sala
src/entities.js jogador, inimigos, chefes, projéteis, itens e baús
src/mundos.js   campanha: os 3 mundos de 12 salas, pedras de lore, fonte, lampiões e puzzles
src/chefes.js   os 6 guardiões das fendas
src/batalha.js  batalha estilo Undertale (Eco das Fendas)
src/historia.js abertura e final em cenas, com legenda digitada
src/game.js     máquina de estados, transições, HUD, save, loop principal, modos multijogador
```

### Decisões de desempenho

- **Resolução nativa 416×224** (salas de 26×12 blocos, formato largo perto do 16:9), ampliada pela GPU via CSS (`image-rendering: pixelated`) até **preencher a janela**, mantendo a proporção. O jogo entra em **tela cheia** no primeiro clique ou tecla; **duplo clique** alterna. Tamanho da sala: `ROOM_W`/`ROOM_H` em `src/core.js` (aberturas, trilhas e cruzamento são calculados a partir dele).
  O canvas nunca desenha em resolução alta — o custo por frame não muda com o tamanho da janela.
- **Fundo da sala em cache**: cada sala é rasterizada uma vez num canvas offscreen; por frame
  é 1 `drawImage`. Só os tiles animados (água, tochas) são redesenhados por cima. Cache LRU de 16 salas.
- **Sprites pré-renderizados** no boot; em runtime só há `drawImage`, nunca desenho vetorial.
- **Passo fixo de 60 Hz** com acumulador (máx. 6 passos por frame), render desacoplado.
- **Partículas em arrays tipados** com remoção por swap, zero alocação por frame.
- **Só a sala atual é simulada** — inimigos de outras salas não existem enquanto você não entra.
- Medido em cenário pesado (chefe + 12 inimigos + projéteis): ~0,13 ms de lógica por frame.

### Ajustes rápidos

- Classes do jogador: tabela `CLASSES` (vida, velocidade, dano, `dash` do rolamento, textos) e `ELEMENTS` (magias do mago) em `src/entities.js`.
- Tiro do arqueiro: `ATK_CHARGE_MAX`/`ATK_CHARGE_BAR` (tiro normal, Z) e `CHARGE_MAX`/`CHARGE_BAR` (especial, X), além de `ARROW_SPD`, `ARROW_RANGE`, `ARROW_SCALE`, `ARROW_SCALE_END` e `ARROW_ECHO` em `src/entities.js`.
- Abates para liberar X, C e V: `ABATES_X`, `ABATES_C` e `ABATES_V` em `src/entities.js`.
- Salva do X: `SP_RANGE_FULL` (alcance), `SP_RAJADAS`/`SP_RAJADA_T` (salvas da carga cheia e intervalo), `SP_SHRINK_FULL` e `SP_SPACING` em `src/entities.js`.
- Giro do C: `SPIN_VOLTAS`, `SPIN_TIME`, `SPIN_RANGE` e `SPIN_DIRS` em `src/entities.js`.
- Flecha dourada do V: `GOLD_SPD`, `GOLD_TURN`, `GOLD_MULT`, `GOLD_LIFE` e `GOLD_FREE` em `src/entities.js`.
- Especiais do guerreiro: `KN_DASH_*` (investida, X), `KN_GIRO_*` (giro triplo, C) e `KN_RUSH_*` (investida relâmpago, V) em `src/entities.js`.
- Arenas do VS: `ARENAS` e `genArena` em `src/world.js`.
- Multijogador pela internet: `PEERJS_URL`, `TAM_CODIGO` e `SILENCIO` (tempo sem resposta até considerar que o outro saiu) em `src/net.js`.
- Multijogador: `COMP_TEMPO`, `COMP_MAX`, `COMP_SPAWN`, `COMP_TIPOS`, `VS_HP` e `RESPAWN_*` em `src/game.js`; dano da onda e da explosão no VS em `PVP_F` (`src/entities.js`); porta do servidor com `PORT=9000 node servidor.js`.
- Empurrão da flecha: `EMPURRA_FLECHA` (multiplicador do tiro normal) e `EMPURRA_TOTAL_VEL` (velocidade do arrasto da carga cheia) em `src/entities.js`.
- Magias do mago: `CICLO_ELEM` (ordem ponderada dos elementos), `MG_*` (X, C e V: durações), `ELEMENTS` (dano e velocidade), `GELO_T`, `FOGO_T`/`FOGO_TICK`, `RAIO_T`, `RAIO_ALCANCE`, `RAIO_SALTOS`, `EFEITO_CHEFE`, `EFEITO_JOGADOR` e `MAGIA_SOLTA` (momento do golpe em que a magia sai) em `src/entities.js`.
- Onda de choque: `WAVE_SPEED` e `WAVE_MAX` em `src/entities.js`.
- Desconto da recarga do F por abate: `KILL_REFUND` em `src/entities.js` (em frames, 30 = 0,5 s).
- Dificuldade dos inimigos: `spd`, `hp` e `touch` das classes em `src/entities.js`.
- Quais inimigos aparecem onde: tabelas de `sorteia` em `genOverworld`/`genPantano`, `ESTILOS` (masmorras e castelo) e salas de chefe em `CHEFES_OW`/`CHEFES_PT` (`src/world.js`).
- Tamanho do mundo: `OW_COLS`/`OW_ROWS` e `DG_COLS`/`DG_ROWS` em `src/world.js`.
- Golpe: `ATK_WIND`/`ATK_SWING`/`ATK_REC` (duração de cada fase), `SWING_FROM`/`SWING_TO` (abertura do arco, em radianos), `BLADE_HITS` (alcance das caixas) e `HAND_OUT` (quanto a base do cabo se afasta do corpo; de frente e de costas ela fica centrada no personagem) em `src/entities.js`. Número de sprites de lâmina: `BLADE_STEPS` em `src/art.js`.
- Recarga da bola de fogo: `FIRE_CD` em `src/entities.js` (em frames, 60 = 1 s). Dano nos chefes: `novaBlast()` em `src/game.js`.
- Aparência do guerreiro: paleta `KN` e função `drawKnight` em `src/art.js`.
- Trilha sonora: arrays `lead`/`bass` de `Music.tracks` em `src/core.js` (notas MIDI, `-1` = pausa); `wave`, `vol`, `sus` e `pad` (acordes) opcionais, usados pela trilha `historia`.
- Campanha: `SALAS` (12 layouts em texto), `PAPEL` (o que cada sala é), `MUNDOS` (paleta, inimigos, guardiões, puzzle e textos das pedras) em `src/mundos.js`.
- Guardiões: vida no `super(...)` de cada classe e `DANO` (3 = 1 coração e meio) em `src/chefes.js`; `fracF` controla quanto o F tira.
- Batalha do Eco: `DANO`, `TURNO`, `ORDEM` (padrões por turno), `PADROES`, falas e itens em `src/batalha.js`.
- Fonte: pixel 5×7 proporcional desenhada por código (`GLIFOS` em `src/core.js`, `G.textoPixel`), sempre em escala inteira (1×, 2× ou 3×) para ficar nítida; `text()` em `src/game.js` converte o tamanho antigo em escala.
- Abertura: `CENAS_INTRO`/`CENAS_FIM` (texto, duração, sons e desenho de cada cena) em `src/historia.js`.

## Testado

Simulação headless (DOM falso em Node): 40.000 frames de jogo aleatório sem erros,
40 seeds × 2 masmorras com 100% das salas alcançáveis, chave e recipiente sempre presentes,
e os fluxos de porta trancada, escadas, morte/continuar, chefe e final verificados.
A bola de fogo foi testada em sala cheia (8 inimigos + chefe): sobra só o chefe, com exatamente
1/3 da vida perdida, e a recarga de 3600 frames bloqueia o segundo disparo.
Os sprites são rasterizados num canvas de verdade em Node e conferidos pixel a pixel, e o arco do
golpe é verificado quadro a quadro (ângulo inicial alto, final baixo) nas 8 direções, com acerto
confirmado em todas elas. As três classes têm teste próprio: cada uma acerta um alvo no alcance
esperado, o mago cicla fogo → gelo → raio, o gelo congela, o raio atravessa dois inimigos, a
habilidade especial limpa a sala nas três e o save preserva a classe escolhida.
O tiro carregado tem teste próprio: a carga escalando velocidade, alcance, tamanho e dano; a flecha
encolhendo ao longo do voo; a parada exata no limite de alcance; e os ecos do rastro sumindo um por
vez até a flecha morrer. A salva do X é verificada em número de flechas, espaçamento de 16 px,
alcance de 3 e 6 blocos, dano 2× e 4×, recarga de 3 s bloqueando o segundo uso e acerto nos três
alvos empilhados. A barra de carga é medida em pixels no rasterizador: 0 px com 0,5 s e 1,0 s de
carga, 22 px com 1,2 s. O desconto por abate é conferido abate a abate (3,0 → 2,5 → 2,0 → 1,5 s),
sem passar de zero, e numa sala inteira limpa de uma vez.
