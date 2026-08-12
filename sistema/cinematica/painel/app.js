/* ===========================================================================
   BANCADA  --  o que liga os controles, a matematica, o desenho e o MuJoCo

   Um estado so' (perna ativa + angulos de cada perna); tudo na tela e' funcao
   dele. Girou o mostrador ou escolheu uma pose -> a cinematica DIRETA recalcula
   onde o pe foi parar, e a telemetria, o desenho e o MuJoCo acompanham.

   A cinematica INVERSA continua em cinema.js e aparece na gaveta da
   matematica, que aplica a IK de volta na posicao do pe para conferir a
   direta. A entrada por coordenadas foi retirada da tela a pedido.

   A tela fala em CENTIMETROS. A matematica toda continua em metros; a
   conversao acontece so' na saida -- misturar unidade no meio da conta e'
   pedido de bug.
   =========================================================================== */

'use strict';

const DURACAO_ANIM = 1.4;
const CM = 100;                       // metro -> centimetro

const estado = {
  ativa: 'FL',
  angulos: Object.fromEntries(PERNAS.map(p => [p, HOME.slice()])),
  anim: null,
};

const $ = s => document.querySelector(s);

let bancada;                          // o desenho 3D; o elemento id 'cena' e outro
const mostradores = [];

/* ------------------------------------------------------------------ poses
   Poses prontas: e' o que um leigo experimenta antes de entender os angulos.
   Escolhidas dentro do limite mecanico das quatro pernas.                   */

const POSES = {
  neutra: [0.0, 0.9, -1.5],
  agachar: [0.0, 1.7, -2.5],
  esticar: [0.0, 0.35, -0.95],
};

/* ---------------------------------------------------------------- arranque */

function iniciar() {
  bancada = new Bancada3D($('#cena'));

  DESC_JUNTA.forEach((j, i) => {
    const caixa = document.createElement('div');
    $('#juntas').appendChild(caixa);
    mostradores.push(new Mostrador(caixa, j.nome, j.o_que, v => girarJunta(i, v)));
  });

  $('#pose-neutra').addEventListener('click', () => irPara(POSES.neutra));
  $('#pose-agachar').addEventListener('click', () => irPara(POSES.agachar));
  $('#pose-esticar').addEventListener('click', () => irPara(POSES.esticar));
  $('#recentrar').addEventListener('click', () => bancada.reiniciarCamera());
  $('#ver-cima').addEventListener('click', () => bancada.verDeCima());
  $('#ver-lado').addEventListener('click', () => bancada.verDeLado());

  const t = autotesteFkIk();
  $('#autoteste').textContent =
    `autoteste ${t.ok ? 'ok' : 'ATENCAO'} · erro ${(t.erroMax * 1000).toFixed(4)} mm`;
  $('#autoteste').classList.toggle('falhou', !t.ok);

  trocarPerna('FL');
  setInterval(publicarPose, 2000);    // e assim que o painel ve o MuJoCo subir
}

/* -------------------------------------------------------------- controles */

function trocarPerna(perna) {
  estado.ativa = perna;
  estado.anim = null;
  mapaPernas($('#mapa'), perna, trocarPerna);
  $('#perna-atual').textContent = `${perna} · ${NOME_PERNA[perna]}`;
  refrescar();
}

function girarJunta(i, valor) {
  estado.anim = null;                 // mexeu na mao: a animacao para
  const q = estado.angulos[estado.ativa].slice();
  q[i] = valor;
  estado.angulos[estado.ativa] = q;
  refrescar();
}

function irPara(qFim) {
  estado.anim = {
    perna: estado.ativa,
    ini: estado.angulos[estado.ativa].slice(),
    fim: qFim.map((v, i) => {
      const [lo, hi] = LIMITES[estado.ativa][i];
      return Math.max(lo, Math.min(hi, v));
    }),
    t0: performance.now() / 1000,
  };
  requestAnimationFrame(passoAnim);
}

function passoAnim() {
  const a = estado.anim;
  if (!a) return;
  let t = (performance.now() / 1000 - a.t0) / DURACAO_ANIM;
  if (t >= 1) { t = 1; estado.anim = null; }
  const s = 3 * t * t - 2 * t * t * t;              // smoothstep
  estado.angulos[a.perna] = a.ini.map((v, i) => v + (a.fim[i] - v) * s);
  refrescar();
  if (estado.anim) requestAnimationFrame(passoAnim);
}

/* -------------------------------------------------------------- refrescar */

function refrescar() {
  const perna = estado.ativa, lado = LADO[perna];
  const q = estado.angulos[perna];
  const { pontos, T } = pontosDaCadeia(q, lado);
  const pe = pontos[3];

  mostradores.forEach((m, i) => m.definir(q[i], LIMITES[perna][i][0], LIMITES[perna][i][1]));

  bancada.definir(estado.angulos, perna);
  telemetria(pe, lado);

  $('#vista-lat').innerHTML = vista2D(pontos, 0, 2);
  $('#vista-fro').innerHTML = vista2D(pontos, 1, 2);

  if ($('#detalhes').open) matematica(T, pe, q, lado);

  publicarPose();
}

/* A perna alcanca no maximo coxa + canela a partir do ombro; a altura util
   vai de 0 (pe encolhido no ombro) ate esse alcance para baixo. */
const ALCANCE = GEO.L_COXA + GEO.L_CANELA;

function telemetria(pe, lado) {
  const dist = Math.hypot(pe[0], pe[1] - lado * GEO.L_ABD, pe[2]);
  const fracao = dist / ALCANCE;

  medidor($('#g-altura'), {
    fracao: Math.min(1, -pe[2] / ALCANCE),
    texto: (pe[2] * CM).toFixed(1), sub: 'cm', min: '0', max: `-${(ALCANCE * CM).toFixed(0)}`,
  });
  medidor($('#g-avanco'), {
    fracao: (pe[0] + ALCANCE) / (2 * ALCANCE),
    texto: (pe[0] >= 0 ? '+' : '') + (pe[0] * CM).toFixed(1), sub: 'cm',
    min: `-${(ALCANCE * CM).toFixed(0)}`, max: `+${(ALCANCE * CM).toFixed(0)}`,
  });
  medidor($('#g-lado'), {
    fracao: (pe[1] + ALCANCE) / (2 * ALCANCE),
    texto: (pe[1] >= 0 ? '+' : '') + (pe[1] * CM).toFixed(1), sub: 'cm',
    min: `-${(ALCANCE * CM).toFixed(0)}`, max: `+${(ALCANCE * CM).toFixed(0)}`,
  });
  medidor($('#g-estica'), {
    fracao, alerta: fracao > 0.95,
    texto: (fracao * 100).toFixed(0), sub: '%', min: '0', max: '100%',
  });
}

function matematica(T, pe, q, lado) {
  $('#m01').innerHTML = matrizHTML(T.T01);
  $('#m12').innerHTML = matrizHTML(T.T12);
  $('#m23').innerHTML = matrizHTML(T.T23);
  $('#m03').innerHTML = matrizHTML(T.T03);

  $('#pe-pos').innerHTML = ['x', 'y', 'z'].map((e, i) =>
    `<span class="par"><i>${e}</i><b>${fmtM(pe[i])}</b></span>`).join('');

  const qb = ikPerna(pe[0], pe[1], pe[2], lado);
  const erro = Math.max(...qb.map((v, i) => Math.abs(v - q[i]))) * GRAU;
  // o erro e' o veredito da conferencia: fica em destaque quando desmente
  const classe = erro < 1e-3 ? 'bate' : 'nao-bate';
  $('#ik-conf').innerHTML =
    qb.map((v, i) => `<span class="par"><i>q${i + 1}'</i>` +
      `<b>${fmtGrau(v * GRAU)}</b></span>`).join('') +
    `<span class="par ${classe}"><i>erro</i><b>${erro.toFixed(4)}°</b></span>`;
}

const fmtGrau = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '°';
const fmtM = v => (v >= 0 ? '+' : '') + v.toFixed(4) + ' m';

/* Uma matriz homogenea e' quase toda zero e um. Escrever "+0.0000" dezesseis
   vezes esconde justamente o que muda: os zeros viram "0", os unitarios viram
   "1", e so' o que tem conteudo aparece com as quatro casas. E o que sobra na
   tela e' a ESTRUTURA da matriz -- que e' o que se quer enxergar. */
function celula(v) {
  if (Math.abs(v) < 5e-5) return { txt: '0', cls: 'zero' };
  if (Math.abs(v - 1) < 5e-5) return { txt: '1', cls: 'um' };
  if (Math.abs(v + 1) < 5e-5) return { txt: '-1', cls: 'um' };
  return { txt: (v >= 0 ? '+' : '') + v.toFixed(4), cls: '' };
}

function matrizHTML(T) {
  let g = '';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const c = celula(T[4 * i + j]);
      const papel = i === 3 ? 'homog' : (j === 3 ? 'transl' : 'rot');
      g += `<span class="cel ${papel} ${c.cls}">${c.txt}</span>`;
    }
  }
  // os colchetes sao elementos proprios: com borda no container eles ficariam
  // colados no numero e a matriz pareceria uma tabela
  return `<div class="mat"><i class="colch e"></i><div class="grade">${g}</div>` +
         `<i class="colch d"></i></div>`;
}

/* ------------------------------------------------------- ponte com o MuJoCo
   Tudo o que muda a pose e' publicado, e o espelho aplica no MuJoCo de
   verdade. Na animacao a pose muda a 60 Hz; vai no maximo a cada 33 ms, mas o
   ULTIMO estado sempre vai -- senao o MuJoCo pararia um passo atras.        */

const ponte = { emVoo: false, atrasado: null, ultimo: 0, ligado: null };
const PERIODO_ENVIO = 33;

function publicarPose() {
  const agora = performance.now();
  const carga = { ativa: estado.ativa, angulos: estado.angulos };
  if (ponte.emVoo || agora - ponte.ultimo < PERIODO_ENVIO) {
    ponte.atrasado = carga;
    if (!ponte.emVoo) setTimeout(escoar, PERIODO_ENVIO);
    return;
  }
  enviar(carga);
}

function escoar() {
  if (ponte.atrasado && !ponte.emVoo) {
    const c = ponte.atrasado;
    ponte.atrasado = null;
    enviar(c);
  }
}

function enviar(carga) {
  ponte.emVoo = true;
  ponte.ultimo = performance.now();
  fetch('/api/pose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(carga),
  })
    .then(r => r.json())
    .then(r => marcarEspelho(!!r.espelho))
    .catch(() => marcarEspelho(false))
    .finally(() => { ponte.emVoo = false; escoar(); });
}

/* A tela nao mostra mais o estado do espelho: quem quer saber se o MuJoCo esta
   recebendo olha o console do espelho_mujoco.py, que imprime "painel conectado"
   e "painel fora do ar". O estado continua sendo guardado aqui porque o
   servidor responde isso a cada publicacao -- e' de graca, e volta a aparecer
   na hora que alguem quiser um indicador de novo. */
function marcarEspelho(ligado) {
  ponte.ligado = ligado;
}

document.addEventListener('DOMContentLoaded', () => {
  iniciar();
  // a matematica so' e desenhada quando alguem abre a gaveta
  $('#detalhes').addEventListener('toggle', () => { if ($('#detalhes').open) refrescar(); });
});
