
'use strict';

const DURACAO_ANIM = 1.4;
const CM = 100;

const estado = {
  ativa: 'FL',
  angulos: Object.fromEntries(PERNAS.map(p => [p, HOME.slice()])),
  anim: null,
};

const $ = s => document.querySelector(s);

let bancada;
const mostradores = [];

const POSES = {
  neutra: [0.0, 0.9, -1.5],
  agachar: [0.0, 1.7, -2.5],
  esticar: [0.0, 0.35, -0.95],
};

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
  setInterval(publicarPose, 2000);
}

function trocarPerna(perna) {
  estado.ativa = perna;
  estado.anim = null;
  mapaPernas($('#mapa'), perna, trocarPerna);
  $('#perna-atual').textContent = `${perna} · ${NOME_PERNA[perna]}`;
  refrescar();
}

function girarJunta(i, valor) {
  estado.anim = null;
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
  const s = 3 * t * t - 2 * t * t * t;
  estado.angulos[a.perna] = a.ini.map((v, i) => v + (a.fim[i] - v) * s);
  refrescar();
  if (estado.anim) requestAnimationFrame(passoAnim);
}

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

  const classe = erro < 1e-3 ? 'bate' : 'nao-bate';
  $('#ik-conf').innerHTML =
    qb.map((v, i) => `<span class="par"><i>q${i + 1}'</i>` +
      `<b>${fmtGrau(v * GRAU)}</b></span>`).join('') +
    `<span class="par ${classe}"><i>erro</i><b>${erro.toFixed(4)}°</b></span>`;
}

const fmtGrau = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '°';
const fmtM = v => (v >= 0 ? '+' : '') + v.toFixed(4) + ' m';

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

  return `<div class="mat"><i class="colch e"></i><div class="grade">${g}</div>` +
         `<i class="colch d"></i></div>`;
}

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

function marcarEspelho(ligado) {
  ponte.ligado = ligado;
}

document.addEventListener('DOMContentLoaded', () => {
  iniciar();

  $('#detalhes').addEventListener('toggle', () => { if ($('#detalhes').open) refrescar(); });
});
