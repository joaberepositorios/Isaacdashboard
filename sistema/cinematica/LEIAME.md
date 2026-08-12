# Bancada de cinemática do Go2

A mesma bancada didática do `go2_cinematica.py`, agora leve e no navegador.
A página, de cima para baixo: **telemetria** (como está agora), a linha do meio
com o **robô** de um lado e a **mesa de comando** do outro, e por último a
**matemática**. O palco estica até a altura da coluna de controles, de modo que
os dois blocos começam e terminam na mesma linha.

A mesa de comando tem três grupos; cada um se anuncia por um ícone e uma
palavra, sem títulos nem parágrafos de explicação.

| grupo | o que faz |
|---|---|
| **Membro** | escolhe **uma ou mais** pernas no mapa do robô visto de cima |
| **Movimentação** | gira as juntas arrastando os mostradores — o trecho claro do anel é a faixa que a junta alcança de verdade, lida do `go2.xml` (**cinemática direta**) |
| **Poses** | Normal, Agachar, Esticar, Inverter, Frente, Tras |
| **A perna por fora** | as duas vistas 2D, de lado e de frente |

**Inverter** leva cada perna selecionada à *outra* configuração que põe o pé
dela exatamente no mesmo lugar. Ele fica desligado quando falta alternativa para
alguma das selecionadas: com uma perna, 18,4% das poses têm duas soluções; com
as quatro juntas, só 7,8%.

## Dois cenários

O grupo **Cenario** troca entre dois mundos. A troca vale também no MuJoCo: o
espelho remonta a cena e reabre a janela sozinho.

| | **1 · Bancada** | **2 · Solto** |
|---|---|---|
| o robô | preso no suporte | livre no chão |
| física | nenhuma — só cinemática | **completa**: gravidade, atrito, contato, torque |
| quem move as pernas | você, pelos mostradores | um controlador PD, a partir da velocidade que você pede |
| pode cair? | não | **sim** — e se levanta sozinho no lugar |
| controles | mostradores, poses, Inverter, marcha | Frente/Tras, virar, câmera, reiniciar |

No cenário 2 a pilotagem aparece embaixo dos botões de cenário: **‹** e **›**
viram, **Camera** cicla pelas nove vistas (chase-cam, superior, frontal,
traseira, as duas laterais, diagonal, primeira pessoa e livre) e **Reiniciar**
põe o robô de pé na origem. Os botões **Frente** e **Tras** mudam de sentido:
no cenário 1 animam as juntas, no cenário 2 mandam **velocidade** e quem produz
a marcha é o controlador do outro lado.

A marcha do cenário 2 é **crawl** — três patas no chão o tempo todo, com fases
FL 0, RR ¼, FR ½, RL ¾ — diferente do trote do cenário 1. Medido sem janela, a
100 Hz: parado ele fica de pé; a 0,40 m/s andou 1,98 m em 6 s; a −0,30 m/s
andou −1,48 m; girando a 0,5 rad/s virou 101° em 6 s. Nenhuma queda nesses
testes, mas **quedas são possíveis** — é física de verdade, e o console do
espelho imprime cada uma.

**A origem do cenário 2** é o `go2_visualizador2.py`. Duas coisas mudaram na
adaptação, e valem registro:

- O arquivo original **não roda**: a linha 1 é `izaodr# -*- coding: utf-8 -*-`,
  com lixo colado no início, que levanta `NameError` ao executar.
- A `ik_perna` dele carrega o mesmo defeito que esta bancada tinha — grampeia o
  alvo com `min(..., soma - 0.012)` e devolve resposta errada calada. Aqui ela
  foi reescrita para **recusar** o alvo fora de alcance; quando isso acontece a
  perna mantém o ângulo atual em vez de inventar um. Nos testes da marcha o
  contador de recusas ficou em zero, ou seja, a correção não estreitou nada.

O que ficou de fora do original: o dashboard em matplotlib, porque o navegador
já é o painel, e o piloto automático com rota circular.

## Ciclo de marcha

**Frente** e **Tras** põem as pernas selecionadas num ciclo de marcha contínuo.
Clicar de novo no mesmo botão para; mexer num mostrador, escolher uma pose ou
apertar o outro sentido também param.

O robô fica preso no suporte, então ele **não sai do lugar** — o pé é que
desenha o ciclo no ar. Para uma bancada de cinemática isso é a vantagem, não a
limitação: dá para ver a trajetória sem a física entrar no meio.

Como o ciclo é construído, em coordenadas da própria perna:

- **apoio** (metade do período): o pé fica na altura de trabalho, −30 cm, e
  desliza 12 cm de frente para trás. É esse deslize que empurraria o corpo para
  a frente se houvesse chão;
- **balanço** (a outra metade): o pé sobe 5 cm num arco de seno e volta à
  frente para recomeçar.

*Tras* espelha o avanço; a altura e o levantamento não mudam. Medido no
navegador: para a frente o pé apoiado desliza −20 cm em 3 s, para trás +20 cm.

O andar é **trote**, o mesmo do Go2 real: as diagonais andam juntas
(`FL`+`RR` contra `FR`+`RL`), com meio período de defasagem. Medida a diferença
de altura entre as diagonais durante a marcha: exatamente 0.

Os ângulos saem da **cinemática inversa**, não de curvas prontas — é o mesmo
código da gaveta da matemática. Antes de fechar, varri o ciclo inteiro nos dois
sentidos e nas quatro pernas, 16.008 pontos: nenhum alvo recusado, nenhuma
junta grampeada no limite, erro máximo de 1,3×10⁻¹³ mm entre o alvo e o pé
alcançado. A junta mais apertada é o joelho, que usa de −108° a −88° e tem 40°
de folga até o limite mecânico.

Com uma perna só selecionada, ela cumpre a própria fase e as outras ficam
paradas — serve para ver o ciclo isolado. A marcha continua enquanto você muda
a seleção, então dá para começar com uma perna e trazer as outras clicando no
tronco.

## Selecionar uma perna, duas, três ou todas

No mapa visto de cima:

| gesto | resultado |
|---|---|
| clique numa perna | só ela |
| **Ctrl** (ou **⌘**, ou **Shift**) + clique numa perna | põe ou tira da seleção |
| clique no **tronco** do robô | as quatro de uma vez |
| Ctrl + clique no tronco, com as quatro já escolhidas | volta para uma |

Tudo na mesa de comando passa a agir sobre a seleção inteira: mostradores,
poses e *Inverter*. A cena 3D e o **MuJoCo** destacam todas as escolhidas.

Três regras que evitam mentira quando há mais de uma perna:

- **Os mostradores oferecem a intersecção dos limites.** As dianteiras giram o
  quadril de −90° a 200°, as traseiras de −30° a 260°; com uma de cada lado
  selecionada o mostrador só vai de −30° a 200°, porque fora disso o ângulo
  mostrado seria inalcançável para parte da seleção. Ao mudar a seleção, quem
  estiver fora da intersecção entra nela — o movimento aparece na cena.
- **O ângulo é absoluto, não relativo.** Mexer um mostrador põe todas as
  selecionadas no mesmo ângulo. Se elas estavam diferentes, o primeiro
  arrasto as unifica.
- **A matemática segue a perna-guia**, que é a última que você clicou direto —
  ela aparece com o rótulo em ciano claro no mapa. Telemetria, matrizes, vistas
  2D e os traços de tempo são todos dela. *Inverter* é a exceção: ele calcula
  uma solução **por perna**, com o lado de cada uma.

Esse último ponto custou uma versão errada. Parecia que, por simetria, aplicar
os ângulos da guia nas outras preservaria o pé de todas. Não preserva: espelhar
em y exige inverter o sinal de q1, e aqui todas as pernas usam o *mesmo* q1. A
primeira versão deslocava o pé em até **326 mm**; a versão por perna erra
2×10⁻¹³ mm.

A **cinemática inversa** continua em `painel/cinema.js` e aparece na gaveta da
matemática, que aplica a IK de volta na posição do pé para conferir a direta. A
entrada por coordenadas foi retirada da tela a pedido.

## As quatro soluções, e por que só duas aparecem

Esta perna de 3 juntas tem **quatro** soluções analíticas de IK: o joelho dobra
para dois lados e a abdução resolve o triângulo de dois jeitos. Todas as quatro
põem o pé no mesmo ponto, com erro de 3×10⁻¹³ mm.

Mas os **limites mecânicos do `go2.xml` matam metade delas**: o joelho do Go2 só
existe entre −156° e −48°, sempre negativo, e o ramo "joelho para cima" produz
q3 entre 0° e 180°. Em 24.000 poses medidas ele coube nos limites **zero vez**.
O Go2 não inverte o joelho — quem inverte é a abdução.

Isso é a diferença entre *solução matemática* e *pose que o robô alcança*, e é a
razão de a IK receber os limites como argumento em vez de ignorá-los.

Dentro da cena, três ferramentas de câmera: recentrar, ver de cima, ver de
lado. Acima dela, quatro medidores de telemetria dizem onde o pé está; no pé da
coluna de controles, as duas vistas mostram a perna de lado e de frente. As
matrizes 4×4 da cadeia ficam numa gaveta no rodapé, fechada por padrão.

O que cada peça faz está na própria peça: o anel mostra o limite e o mostrador
mostra o ângulo, virando âmbar quando a junta trava.

A tela fala em **centímetros e graus**; a matemática continua toda em metros e
radianos, e a conversão acontece só na borda.

**Cor:** a bancada é escura, em ciano e azul escuro. Os tokens ficam em
`painel/cinematica.css`, sobre `painel/estilo.css`, que traz só a gramática
comum — régua, filete, malha — e nenhuma cor própria.

A regra que organiza a paleta é **o ciano informa, o azul escuro é material**:
sobre a página o ciano `#22d3e8` mede 10,99 e faz o dado (ponteiro, arco cheio,
perna ativa, translação das matrizes); o azul escuro `#073b4a` mede 1,65 e
nunca escreve — ele é o trilho, o leito do palco e o tronco do robô, e serve de
leito para o ciano por cima (6,66).

**Sem barra no topo:** a perna selecionada aparece no cabeçalho do grupo
*Membro* e o autoteste está na gaveta da matemática. Não há indicador do MuJoCo
na tela — quem quer saber se o espelho engatou olha o console dele.

## Rodar

```
python cinematica.py
```

Abre sozinho em <http://localhost:8790>. Opções: `--porta 9000`, `--aberto`
(aceita conexões de outras máquinas), `--sem-navegador`.

**Requisitos: Python 3.7 ou mais novo e um navegador. Só isso** — nenhum
`pip install`, nada para baixar, sem GPU. A pasta é fechada em si: basta
copiá-la inteira.

## Com o MuJoCo junto

Num PC que tenha MuJoCo instalado, abra um segundo terminal:

```
python espelho_mujoco.py
```

Ele abre a janela 3D real, com as malhas do Go2 montadas na bancada, e aplica
**ao vivo** o que você faz no painel: mostradores, troca de perna (a ativa fica
destacada lá também) e poses. O console do espelho imprime `painel conectado`
quando engata e `painel fora do ar` se cair.

Como funciona: o painel **publica** a pose no servidor a cada mudança; o
espelho **assina** — o pedido dele fica pendurado até a pose mudar, em vez de
perguntar em laço. Medido daqui: **28 ms** entre mexer o slider no navegador e
a pose chegar do outro lado, sem laço de espera queimando CPU.

Opções: `--porta 8790` (a mesma do painel), `--maquina <ip>` se o painel estiver
noutro computador. O modelo é procurado em `modelo_go2/`, em
`~/Downloads/go2_cinematica_ws/` e no diretório atual; se não houver nenhum, é
baixado uma vez.

O espelho é **opcional e de mão única**: sem ele o painel funciona igual, e
fechá-lo não afeta em nada quem está no navegador.

## O que mudou em relação ao script original

| | `go2_cinematica.py` | aqui |
|---|---|---|
| 3D | MuJoCo + janela OpenGL | canvas 2D com projeção própria |
| modelo | 17 arquivos baixados do `mujoco_menagerie` | nada para baixar |
| interface | matplotlib (TkAgg/Qt) numa 2ª janela | uma página só |
| instalação | `pip install mujoco matplotlib` | biblioteca padrão |
| medidas e limites | lidos do modelo em tempo de execução | constantes anotadas com a linha de origem no `go2.xml` |

**A matemática é a mesma**, portada linha a linha para `painel/cinema.js`. Foi
conferida contra as funções originais em Python: 200 poses, diferença máxima de
7×10⁻¹¹ (só o arredondamento da comparação). O autoteste round-trip
FK → IK → FK roda ao abrir a página e o resultado fica na gaveta da matemática
— se ele reprovar, o texto fica âmbar.

**O que ficou de fora:** as malhas do robô (o corpo e os elos são caixas e
segmentos) e a física. Nada disso participa do cálculo de pose — a bancada
prende o robô no suporte justamente para tirar a física do caminho.

## Arquivos

```
cinematica.py        servidor (http.server da biblioteca padrão) e a ponte /api/pose
espelho_mujoco.py    opcional: abre o MuJoCo, escolhe o cenário e aplica o painel ao vivo
cenario_livre.py     cenário 2: cena sem suporte, marcha crawl com física completa e as 9 câmeras
painel/index.html    a página
painel/cinema.js     matrizes, FK, IK, limites de junta e autoteste
painel/medidores.js  mostrador arrastável, medidor de telemetria, vistas e mapa
painel/robo3d.js     câmera em órbita, projeção e desenho da bancada
painel/app.js        estado, animação, telemetria e a ponte com o MuJoCo
painel/estilo.css    a gramática comum: régua, filete, malha, sem cor própria
painel/cinematica.css  a paleta e o específico daqui
```

## Conferir que continua certo

Com o servidor no ar, a página faz duas afirmações verificáveis:

- **autoteste**, na gaveta. Ele tem duas metades, e a segunda é a que importa:

  1. Sorteia poses na faixa mecânica inteira das quatro pernas, calcula o pé
     pela direta e exige que a inversa **aceite** o alvo e volte nele — nos
     quatro ramos. Pega inversa estreita demais.
  2. Sorteia alvos **numa caixa em volta do quadril**, a maioria fora do
     alcance, e exige que a inversa ou **recuse** o alvo, ou o alcance de
     verdade. Pega inversa que finge ter resolvido.

  A metade 2 é a que o autoteste antigo não tinha: ele só alimentava alvos que a
  direta acabara de produzir, então era incapaz, por construção, de flagrar uma
  inversa que grampeia o alvo e devolve resposta errada calada.

Cada valor da gaveta traz um **traço de tempo** embaixo do número: uma janela
dos últimos 8 segundos, amostrada a 20 Hz. O número dá a precisão, o traço dá o
movimento. Passar o mouse por cima varre o passado — o número mostra a amostra
sob o cursor e volta ao vivo quando o mouse sai.

Os sete traços são **gráficos separados de série única**, não um gráfico com
várias linhas. Duas razões: a bancada tem identidade fechada em ciano e azul
escuro, e três séries num mesmo eixo exigiriam três matizes distinguíveis sob
daltonismo, o que obrigaria a inventar cor nova; e x, y e z já são grandezas que
o leitor compara uma a uma. O traço usa `--azul-medio` (4,17:1 sobre a página) e
o ponto atual `--ciano` (10,99:1) — de-ênfase para a história, acento para o
agora.

O eixo vertical é **fixo**, nunca ajustado ao que está na tela: x, y e z
compartilham `±(alcance + abdução) = ±0,5215 m`, medido para cobrir os extremos
reais (varredura de 480.000 poses deu no máximo 0,399 m). Escala automática
faria uma perna parada parecer agitada, e domínio curto demais acharia o valor
no topo sem avisar. Os ângulos usam o limite mecânico da própria junta.

Trocar de perna **zera a história** — misturar duas pernas no mesmo traço seria
mentira.

- **"Conferência: IK aplicada de volta"**, na mesma gaveta — aplica a inversa na
  posição que a direta acabou de calcular e mostra o erro em graus. **Zero não é
  o único resultado certo:** se a perna estiver na segunda solução (depois de
  *Inverter*), a inversa devolve a primeira e o erro aparece em âmbar, com o
  valor da diferença. Isso é a IK escolhendo entre soluções, não desacordo entre
  direta e inversa. Cada `q'` também fica âmbar se tiver sido grampeado no
  limite da junta.

Com o espelho ligado, dá para conferir a mesma coisa contra o modelo real: a
ponta da cadeia no MuJoCo cai exatamente onde o painel calculou (erro de 10⁻¹⁶ m,
o limite do ponto flutuante).

**Detalhe que confunde:** o "pé" do painel é a **ponta da cadeia**
(0, 0, −0,213 do joelho). A esfera de contato do `go2.xml` fica 2 mm atrás dela,
em `pos="-0.002 0 -0.213"`. Não é erro de cálculo — é onde o Go2 real encosta
no chão.

**Dois limites diferentes:** o alcance do braço da perna e o limite mecânico da
junta. O joelho do Go2 não estica além de −48°, então o pé nunca chega aos
0,426 m que a soma coxa + canela sugere — o medidor de esticamento marca isso
antes de 100%, e o mostrador do joelho fica âmbar quando trava.

## Licença e material de terceiros

O código desta pasta está sob **MIT** — veja `LICENSE` na raiz do repositório.

Isso **não** cobre o modelo do Unitree Go2. As malhas e o `go2.xml` que o
`espelho_mujoco.py` carrega vêm do `mujoco_menagerie`, têm licença própria e não
são redistribuídos aqui: o espelho os procura na máquina ou os baixa uma vez.
As medidas e os limites de junta usados no painel são **fatos numéricos lidos
desse modelo**, não cópia do arquivo.
