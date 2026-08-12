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
| **Membro** | escolhe a perna clicando no mapa do robô visto de cima |
| **Movimentação** | gira as juntas arrastando os mostradores — o trecho claro do anel é a faixa que a junta alcança de verdade, lida do `go2.xml` (**cinemática direta**) |
| **Poses** | Normal, Agachar, Esticar |
| **A perna por fora** | as duas vistas 2D, de lado e de frente |

A **cinemática inversa** continua em `painel/cinema.js` e aparece na gaveta da
matemática, que aplica a IK de volta na posição do pé para conferir a direta. A
entrada por coordenadas foi retirada da tela a pedido.

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
espelho_mujoco.py    opcional: abre o MuJoCo e aplica a pose do painel ao vivo
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

- **autoteste**, na gaveta — 2000 poses aleatórias, erro máximo em milímetros;
- **"Conferência: IK aplicada de volta"**, na mesma gaveta — aplica a inversa na
  posição que a direta acabou de calcular e mostra o erro em graus. Enquanto ele
  ficar em `0.0000°`, direta e inversa concordam.

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
