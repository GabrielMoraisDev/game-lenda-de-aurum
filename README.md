# A Lenda de Aurum

Action-RPG top-down no estilo Zelda clássico, rodando no navegador. Sem dependências,
sem build, sem arquivos de imagem ou áudio: todo o pixel art é desenhado por código em
canvases offscreen no boot, e a trilha sonora é sintetizada via Web Audio.

## Como jogar

Abra `index.html` no navegador (duplo clique já funciona — os scripts são clássicos, não módulos).
Se preferir servidor local: `servir.bat` ou `python -m http.server 8080`.

### Multijogador pela internet (GitHub Pages ou qualquer site estático)

Sem servidor próprio: os dois navegadores se conectam direto (WebRTC, via [PeerJS](https://peerjs.com),
carregado do CDN só quando você abre o multijogador; o servidor público do PeerJS só apresenta um ao outro).

1. Quem hospeda aperta **N** no título, **CRIAR SALA**, escolhe o modo (no VS, também a arena) e o herói.
   A tela mostra um **código de sala** de 5 letras (C copia o link `...?sala=CODIGO`).
2. O outro jogador abre o jogo, aperta **N**, **ENTRAR NA SALA**, digita o código (ou abre o link, que já
   vem com ele) e escolhe o herói. A partida começa sozinha.

Precisa de internet nos dois. Em algumas redes muito fechadas (NAT simétrico, firewall de empresa) a conexão
direta pode não sair, porque não há servidor TURN.

### Multijogador em rede local (2 jogadores)

Precisa do [Node.js](https://nodejs.org) no PC de quem hospeda (sem pacotes extras). Quando o jogo é aberto
pelo `servidor.js`, ele percebe (rota `/aurum-servidor`) e usa o WebSocket local em vez do código de sala.

1. No PC que hospeda, rode `servir.bat` (ou `node servidor.js`). O terminal mostra os endereços,
   por exemplo `http://192.168.1.100:8080/`. Na primeira vez o Windows pergunta sobre o firewall:
   permita em **redes privadas**.
2. Quem hospeda abre `http://localhost:8080/`, aperta **N** no título, **CRIAR SALA**, escolhe o modo
   e o herói. A tela mostra o endereço para o outro jogador.
3. O outro jogador, no mesmo Wi-Fi/rede, abre esse endereço no navegador, aperta **N**,
   **ENTRAR NA SALA** e escolhe o herói. A partida começa sozinha.

| Modo | Como funciona |
|---|---|
| **Cooperativo** | O jogo normal com os dois. Quem cair volta em 4 s ao lado do parceiro; se os dois caírem, é fim de jogo. Chaves e fragmentos valem para o grupo. |
| **Competitivo** | 3 minutos: quem matar mais bichos vence. Aparecem inimigos novos o tempo todo na sala (até 6 vivos). Quem cair volta em 3 s. Placar e cronômetro no topo da tela. |
| **VS** | Um contra o outro numa **arena fechada** (sem saídas), escolhida por quem cria a sala: Campo de Aurum, Caverna dos Goblins, Pântano Sombrio ou Castelo Sombrio. Sem monstros, **20 de vida** cada, mostrada em **barra** (no HUD e no placar do topo). Todos os ataques e especiais acertam o oponente (todo F — onda de choque, bola de fogo, meteoro, explosivos e tsunami — tira 2, o dobro de uma espada comum). X, C e V liberam com o **dano causado no oponente**: 3, 6 e 10 pontos de vida tirados. |

No fim do competitivo e do VS, o anfitrião aperta ENTER para jogar de novo ou ESC para sair.

Como funciona: o PC do anfitrião roda o jogo inteiro com os dois heróis; o convidado só envia os
comandos e recebe a tela pronta (com o HUD dele), os sons e a música, a 30 quadros por segundo
(cerca de 5 Mbps). Assim os dois veem sempre a mesma coisa, sem dessincronizar. A tela é compartilhada:
os dois ficam na mesma sala, e quando um sai pela borda o outro vai junto. Uma setinha amarela marca
o jogador 1 e uma azul o jogador 2. O multijogador não mexe no save do modo solo.

### Controles

| Ação | Teclado | Gamepad | Toque |
|---|---|---|---|
| Mover (8 direções, com diagonais) | WASD / setas | direcional ou analógico | d-pad na tela |
| Atacar (espada, flecha ou magia) | J ou Z | A / X | botão A |
| Rolar / dash (invulnerável; 2× mais longo no arqueiro) | Espaço, K ou Shift | B / RB | botão ROL |
| **Habilidade especial** (recarga de 60 s, a única com recarga) | F | Y / RT | botão F |
| **Salva de flechas** (arqueiro; segure para 4 salvas) / **Investida** (guerreiro; segure para carregar; sem abates, só 1 s de espera) / **Tempestade de raios** (mago) / **Estrelas ninja** (ninja) / **Tridente arremessado** (Percy) — libera com **3 abates** | X | LT / LB | botão X |
| **4 giros de 360°** (arqueiro) / **Tornado** (guerreiro) / **Escudo** (mago) / **Velocidade** (ninja) / **Barreira de água** (Percy) — libera com **6 abates** | C | RB / R3 | botão C |
| **Flecha dourada** (arqueiro) / **Investida relâmpago** (guerreiro) / **Inferno** (mago) / **Névoa de veneno** (ninja) / **Redemoinho** (Percy) — libera com **10 abates** | V | L3 | botão V |
| Escolher herói / confirmar | setas + Enter | direcional + Start | d-pad + ≡ |
| Começar / continuar | Enter | Start | ≡ |
| Menu: loja e mapa (pausa no solo) | Esc ou P | Select | ≡ |
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

## Os cinco heróis

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

O primeiro fragmento dobra o dano de qualquer uma delas (espada, flechas ou cajado de ouro).

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
| Tapa no X (ou soltar antes da carga cheia) | 1 | 3 | **2×** a flecha normal | — |
| Segurar até a carga cheia (1,5 s, barra branca) | **4 seguidas** (uma a cada 10 quadros) | **12** | **4×** | tudo pela frente |

Na chuva de flechas o herói pode andar e virar entre uma salva e outra, espalhando os tiros. Trocar de
sala cancela as salvas que faltam. As flechas encolhem ao longo dos primeiros 140 px (2,5× → 0,85×) e
estabilizam depois disso.

### Giro de 360° — tecla C (arqueiro)

O herói dá **4 voltas** no lugar, soltando **uma flecha em cada uma das 8 direções por volta** (direita,
diagonal, baixo, diagonal, esquerda, e assim por diante), uma a cada 3 quadros: **32 flechas em 1,6 s**,
4 em cada direção. Alcance de 120 px por flecha (7,5 blocos), dano de flecha normal, e o herói fica
**invulnerável durante o giro**. Libera com **6 abates**, barra roxa no HUD.

Serve para quando você é cercado: num teste com 8 inimigos em círculo ao redor, todos os 8 foram
atingidos.

### Flecha dourada — tecla V (arqueiro)

Solta uma flecha de ouro na direção encarada que **persegue o inimigo mais próximo**, vira aos poucos
até ele e atravessa paredes. Ao acertar, escolhe o próximo inimigo vivo que ainda não atingiu, e assim
por diante até **acertar todos os inimigos da sala** — então some num brilho dourado. Cada inimigo
leva **3× o dano de uma flecha comum** (3 no início, 6 com o fragmento), uma vez só. Sem inimigos na
sala, voa reto 160 px e some. Libera com **10 abates**, barra dourada no HUD.

### Magia elemental (mago)

O ataque (J) varre o **cajado em arco de 180°**, igual à espada do guerreiro, com o dano normal do mago
(2, ou 4 com o fragmento). No meio da varredura sai a magia do elemento atual. Os elementos seguem uma
**ordem ponderada**: **7 tiros de fogo, 4 de gelo e 2 de raio**, e recomeça. O HUD mostra o elemento
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
| **X** | Tempestade de raios | Ergue o cajado e bate no chão: saem raios do mago até **todos os inimigos da sala**, que levam **1 de dano** e ficam **paralisados por 7 s** | 3 abates |
| **C** | Escudo arcano | Uma bolha azul em volta do mago: **invulnerável por 6 s** (nada causa dano, nem queimadura ou choque); pisca no último 1,5 s | 6 abates |
| **V** | Inferno | Ergue o cajado e bate no chão: um anel de fogo sai do mago e **todos os inimigos pegam fogo e morrem** em 1 s | 10 abates |

O golpe no chão leva 1/3 de segundo erguendo o cajado; levar dano nesse meio cancela sem gastar o
especial. O X paralisa por 7 s qualquer um: monstros, chefes e, no VS, o oponente. No V os chefes levam
1/3 da vida e queimam; no VS o oponente só pega fogo.

### O guerreiro

Cavaleiro loiro de cabelo espetado, armadura prateada com ombreiras, peitoral e capa azuis e cinto
dourado (desenho próprio em `drawKnight`, `src/art.js`).
O arqueiro é de pele clara, cabelo preto sem capuz e roupa preta com gola e cinto cinza; o mago usa
manto roxo com detalhe dourado e chapéu de aba larga.
Todos andam e atacam nas **8 direções** — cada direção tem pose própria (frente, costas, perfil e as
quatro diagonais em 3/4), mais duas poses de golpe por direção (preparação e impacto).

### Especiais do guerreiro — X, C e V

Mesmas teclas do arqueiro, com barras no HUD e abates que faltam na pausa. O X não depende de abates: depois de usar, só espera 1 s. A investida (X) e a investida
relâmpago (V) deixam o guerreiro **invulnerável por 3 s, piscando**, contados a partir do golpe. Durante qualquer um dos três o
guerreiro fica intocável, e nenhum deles troca de sala nem pega escada no meio.

| Tecla | Especial | O que faz | Dano | Libera com |
|---|---|---|---|---|
| X (tapa) | Investida | dash com a espada à frente, 4 blocos (64 px) | 1× a espada | sempre (1 s de espera) |
| X (segurado) | Investida longa | segure até a barra aparecer (1 s): ao soltar, atravessa a sala até a parede ou a borda | 1× | sempre (1 s de espera) |
| X (barra cheia, 1,5 s) | Investida máxima | igual à longa | **3×** | sempre (1 s de espera) |
| C | Tornado | **7 s girando** e correndo atrás do inimigo mais próximo com **o dobro da velocidade** de andar; cada volta acerta de novo | **2×** por volta | 6 abates |
| V | Investida relâmpago | avança em cada inimigo da sala, um por vez (sempre o mais próximo), atravessando paredes; quem é atingido fica **paralisado 5 s** | **4×** em cada | 10 abates |

Na investida cada inimigo leva o golpe uma vez. A relâmpago termina onde caiu o último inimigo;
se esse lugar for parede ou buraco, o guerreiro volta ao ponto de partida. Sem inimigos na sala ela
não sai e não gasta o especial. Enquanto segura o X o guerreiro anda devagar e mira com a espada.

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
| X | Tridente arremessado | arremessa o tridente na direção encarada: vai até a borda da sala e volta para a mão em **2 s**, atravessando paredes. **2× o dano** do tridente, acerta cada alvo na ida e na volta. Sem o tridente na mão, o J fica travado até ele voltar | 3 abates |
| C | Barreira de água | parede de **5 blocos** à frente do Percy por 8 s. Inimigos (e o oponente no VS) não atravessam e tiros inimigos se desfazem nela | 6 abates |
| V | Redemoinho | um tornado de água no meio da sala **puxa todos para o centro por 8 s** e no fim explode: quem estiver a até 3,5 blocos leva **4× o dano** do tridente | 10 abates |
| F | Tsunami | uma onda entra pela esquerda e **arrasta todos para a direita**; os monstros morrem afogados, chefes levam 1/3 da vida. No VS o oponente não morre: é arrastado até a borda direita e leva o dano de F do VS | recarga de 60 s |

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

## O jogo

- **Mundo aberto** de 6×5 salas de 26×12 blocos, no formato tela-por-tela do Zelda 1 (a câmera desliza ao trocar de sala).
- **Dois mundos extras**, com entrada por portais no Reino (veja abaixo): o **Pântano Sombrio** e o **Castelo Sombrio**.
- **Duas masmorras** geradas proceduralmente (16 salas cada, árvore geradora + atalhos):
  chave escondida num baú, porta trancada, recipiente de coração num baú secundário e sala do chefe selada.
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

  Quanto mais longe do início, mais inimigos por sala e mais variados; as masmorras têm 1 inimigo a mais por sala.
- **Chefes das masmorras** (dão os fragmentos): Rei Goblin (investida, tremor de terra com pedras radiais,
  invoca goblins abaixo de 50% de vida) e Lich das Sombras (teletransporte, leque de bolas de fogo, anel de orbes,
  invoca lacaios). Ficam atrás da porta trancada; a chave está num baú da própria masmorra.
- **Chefes do mundo aberto**, nos cantos do mapa (a arena fecha até ele cair; dão recipiente de coração e 4 joias):

  | Chefe | Onde | Vida | Ataques |
  |---|---|---|---|
  | **Grok, o Machadeiro** | sudoeste (X1 Y5), perto do início | 34 | Giro com o machado atrás de você, leque de machados, grito que chama machadeiros |
  | **Troll da Floresta** | noroeste (X1 Y1) | 50 | Salta em cima de você e cai soltando uma onda, arremessa pedras (1 coração cada), tremor que espalha uma onda grande |
  | **Arquimago Sombrio** | sudeste (X6 Y5) | 46 | Some e reaparece, rajada e anel de fogo, raios marcados no chão (saia do círculo), invoca xamãs |

  Abaixo de 50% de vida todos ficam furiosos (mais rápidos, mais projéteis). No mapa da pausa as cavernas aparecem
  em amarelo e os chefes vivos em vermelho, mesmo antes de visitar.
- **Progressão**: moedas, corações, chaves, recipientes de coração, arma de ouro (dano dobrado)
  ao pegar o primeiro fragmento, e a habilidade especial como carta na manga a cada 60 s.
  Dois fragmentos = final.
- **Extras**: arbustos cortáveis com drop, baús, salas que exigem limpar os inimigos, save automático
  em `localStorage`, minimapa na pausa, controles de toque no celular.

## Os mundos

O Reino de Aurum (mundo aberto 6×5) liga tudo. No mapa da pausa as entradas aparecem sempre, mesmo antes de visitar:
cavernas em amarelo, o portal do pântano em verde, o do castelo em roxo e os chefes vivos em vermelho.

| Mundo | Entrada | Formato | Música | Chefes |
|---|---|---|---|---|
| **Reino de Aurum** | início | 6×5 salas, campo | campo | Grok, Troll da Floresta, Arquimago Sombrio |
| **Caverna dos Goblins** | caverna a oeste (X1 Y3) | masmorra 4×4 | masmorra | Rei Goblin (fragmento) |
| **Cripta das Sombras** | caverna a nordeste (X6 Y1) | masmorra 4×4 | masmorra | Lich das Sombras (fragmento) |
| **Pântano Sombrio** | portal verde a leste (X6 Y3) | 4×4 salas, campo | própria, lenta e arrastada | Rei Sapo, Hidra do Pântano |
| **Castelo Sombrio** | portal roxo ao norte (X3 Y1) | masmorra 4×4 | própria, marcha solene | Cavaleiro Negro (no meio), Rei Sombrio (sala do trono, trancada) |

Para voltar ao Reino, pise no portal (ou na escada) da sala de entrada de cada mundo. Morrer num mundo te devolve
ao começo dele. Salas de chefe fecham as portas assim que você entra (depois de sair de cima da porta) e só
abrem quando ele cai.

### Pântano Sombrio

Chão de charco com juncos e cogumelos, trilhas de lama, poças de água turva (algumas com vitórias-régias),
árvores secas e retorcidas e uma névoa verde por cima de tudo.

| Inimigo | Vida | Como luta |
|---|---|---|
| **Sapo** | 3 | Pula até perto e dá uma linguada de 40 px |
| **Mosquito gigante** | 2 | Voa em zigue-zague e dá picadas rápidas |
| **Bruxa do pântano** | 5 | Joga frascos de veneno que viram uma poça (1 de dano a cada 0,5 s em quem pisa) e chama mosquitos |

| Chefe | Vida | Ataques |
|---|---|---|
| **Rei Sapo** (X1 Y1) | 42 | Salta em cima de você e cai soltando uma onda, linguada de 96 px, cuspe de veneno em leque, coaxa chamando sapos |
| **Hidra do Pântano** (X4 Y1) | 64 | Três cabeças cospem veneno em sequência; mergulha (fica intocável) e reaparece em outro ponto com uma onda |

### Castelo Sombrio

Piso de pedra roxa com lajes vermelhas, paredes de tijolo com estandartes, pilares, fossos de lava e a sala do
trono com tapete vermelho. O Cavaleiro Negro guarda uma sala no meio do caminho; o Rei Sombrio fica atrás da
porta trancada (a chave está num baú do castelo).

| Inimigo | Vida | Como luta |
|---|---|---|
| **Lanceiro** | 6 | Alinha com você e dá uma estocada longa com a lança (1 coração) |
| **Besteiro** | 5 | Mira em qualquer ângulo; virote rápido de 1 coração |
| **Feiticeiro** | 6 | Anel de 6 orbes sombrios ou levanta esqueletos |
| **Gárgula** | 7 | Parece uma estátua e não leva dano; quando você chega perto ela acorda, voa e mergulha |

| Chefe | Vida | Ataques |
|---|---|---|
| **Cavaleiro Negro** | 48 | Armadura (no máximo 3 de dano por golpe), investidas em combo, giro com a espada, ondas sombrias |
| **Rei Sombrio** | 90 | Foices giratórias, pilares de raio marcados no chão, anel de sombras, some e reaparece do seu lado, chama lanceiros e besteiros |

Todos os chefes novos dão recipiente de coração e joias; os fragmentos continuam vindo do Rei Goblin e do Lich.

### Arte dos cenários

Grama, árvores, pedras, arbustos, água, areia, trilhas, paredes e pisos foram redesenhados com contorno, luz e
sombra. Cada tile estático tem **3 variações** escolhidas pela posição na sala, para o chão não parecer carimbado.

## Arquitetura

```
index.html      carrega os 6 scripts na ordem e chama AURUM.boot()
servidor.js     (Node) serve os arquivos e repassa as mensagens do multijogador via WebSocket (rede local)
style.css       layout, escala pixelada, botões de toque
src/core.js     matemática, input (teclado/gamepad/toque), áudio sintetizado,
                sequenciador de música, sistema de partículas
src/net.js      cliente de rede: WebSocket (servidor.js) ou WebRTC com código de sala (site estático),
                entrada remota do jogador 2, eco de sons e música
src/art.js      geração de todos os tiles e sprites em canvases offscreen
src/world.js    tiles, colisão, geração do mundo aberto e das masmorras, cache de sala
src/entities.js jogador, inimigos, chefes, projéteis, itens e baús
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
- Trilha sonora: arrays `lead`/`bass` de `Music.tracks` em `src/core.js` (notas MIDI, `-1` = pausa).

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
