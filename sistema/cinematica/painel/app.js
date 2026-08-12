
'use strict';

const DURACAO_ANIM = 1.4;
const CM = 100;

const estado = {
  ativa: 'FL',
  selecao: ['FL'],
  angulos: Object.fromEntries(PERNAS.map(p => [p, HOME.slice()])),
  anim: null,
};

function limitesSelecao() {
  return [0, 1, 2].map(i => [
    Math.max(...estado.selecao.map(p => LIMITES[p][i][0])),
    Math.min(...estado.selecao.map(p => LIMITES[p][i][1])),
  ]);
}

const $ = s => document.querySelector(s);

let bancada;
let alternativas = [];
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
  $('#pose-outra').addEventListener('click', () => {
    if (alternativas) irPara(alternativas);
  });
  $('#recentrar').addEventListener('click', () => bancada.reiniciarCamera());
  $('#ver-cima').addEventListener('click', () => bancada.verDeCima());
  $('#ver-lado').addEventListener('click', () => bancada.verDeLado());

  const t = autotesteFkIk();
  $('#autoteste').textContent =
    `autoteste ${t.ok ? 'ok' : 'ATENCAO'} · erro ${(t.erroMax * 1000).toFixed(4)} mm`;
  $('#autoteste').classList.toggle('falhou', !t.ok);

  montarTiles();
  trocarPerna('FL');
  setInterval(publicarPose, 2000);
  setInterval(() => {
    amostrar();
    if ($('#detalhes').open) pintarTiles();
  }, PERIODO_AMOSTRA);
}

const PERIODO_AMOSTRA = 50;

function trocarPerna(alvo, aditivo) {
  let sel = estado.selecao.slice();

  if (alvo === TODAS) {
    sel = aditivo && PERNAS.every(p => sel.indexOf(p) >= 0) ? [estado.ativa] : PERNAS.slice();
  } else if (aditivo) {
    sel = sel.indexOf(alvo) >= 0 ? sel.filter(p => p !== alvo) : [alvo].concat(sel);
    if (!sel.length) sel = [alvo];
  } else {
    sel = [alvo];
  }

  estado.selecao = sel;
  estado.ativa = sel.indexOf(alvo) >= 0 ? alvo : sel[0];
  estado.anim = null;

  // com pernas de limites diferentes juntas, o mostrador so pode oferecer a
  // interseccao -- entao quem estiver fora dela entra, senao o angulo mostrado
  // seria inalcancavel para parte da selecao
  const lim = limitesSelecao();
  for (const p of estado.selecao) {
    estado.angulos[p] = estado.angulos[p].map(
      (v, i) => Math.max(lim[i][0], Math.min(lim[i][1], v)));
  }

  limparHistorico();
  amostrar();
  mapaPernas($('#mapa'), estado.selecao, trocarPerna);
  $('#perna-atual').textContent = sel.length === 1
    ? `${sel[0]} · ${NOME_PERNA[sel[0]]}`
    : PERNAS.filter(p => sel.indexOf(p) >= 0).join(' ');
  refrescar();
}

function girarJunta(i, valor) {
  estado.anim = null;
  for (const p of estado.selecao) {
    const q = estado.angulos[p].slice();
    q[i] = Math.max(LIMITES[p][i][0], Math.min(LIMITES[p][i][1], valor));
    estado.angulos[p] = q;
  }
  refrescar();
}

// qFim: um array (o mesmo alvo para todas) ou um objeto {perna: array}
function irPara(qFim) {
  const pernas = estado.selecao.slice();
  const alvo = p => (Array.isArray(qFim) ? qFim : qFim[p]);
  estado.anim = {
    pernas,
    ini: Object.fromEntries(pernas.map(p => [p, estado.angulos[p].slice()])),
    fim: Object.fromEntries(pernas.map(p => [p, alvo(p).map((v, i) => {
      const [lo, hi] = LIMITES[p][i];
      return Math.max(lo, Math.min(hi, v));
    })])),
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
  for (const p of a.pernas) {
    estado.angulos[p] = a.ini[p].map((v, i) => v + (a.fim[p][i] - v) * s);
  }
  refrescar();
  if (estado.anim) requestAnimationFrame(passoAnim);
}

function refrescar() {
  const perna = estado.ativa, lado = LADO[perna];
  const q = estado.angulos[perna];
  const { pontos, T } = pontosDaCadeia(q, lado);
  const pe = pontos[3];

  const lim = limitesSelecao();
  mostradores.forEach((m, i) => m.definir(q[i], lim[i][0], lim[i][1]));

  bancada.definir(estado.angulos, estado.selecao);
  telemetria(pe, lado);

  $('#vista-lat').innerHTML = vista2D(pontos, 0, 2);
  $('#vista-fro').innerHTML = vista2D(pontos, 1, 2);

  // uma alternativa POR perna, cada uma com o seu lado: aplicar a solucao da
  // guia nas outras moveria o pe delas -- espelhar em y exige inverter q1, e
  // aqui todas usam o mesmo q1
  alternativas = null;
  const porPerna = {};
  for (const p of estado.selecao) {
    const qp = estado.angulos[p];
    const pep = origem(fkPerna(qp[0], qp[1], qp[2], LADO[p]).T03);
    const alt = solucoesIk(pep[0], pep[1], pep[2], LADO[p], lim)
      .filter(s => s.q.some((v, i) => Math.abs(v - qp[i]) > 1e-4));
    if (!alt.length) { $('#pose-outra').disabled = true; break; }
    porPerna[p] = alt[0].q;
  }
  if (Object.keys(porPerna).length === estado.selecao.length) {
    alternativas = porPerna;
    $('#pose-outra').disabled = false;
  }

  if ($('#detalhes').open) matematica(T);

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

function matematica(T) {
  $('#m01').innerHTML = matrizHTML(T.T01);
  $('#m12').innerHTML = matrizHTML(T.T12);
  $('#m23').innerHTML = matrizHTML(T.T23);
  $('#m03').innerHTML = matrizHTML(T.T03);
  pintarTiles();
}

const JANELA_HIST = 160;
const CHAVES = ['x', 'y', 'z', 'q1', 'q2', 'q3', 'erro'];
const hist = Object.fromEntries(CHAVES.map(k => [k, []]));
const FMT = {
  x: v => fmtM(v), y: v => fmtM(v), z: v => fmtM(v),
  q1: v => fmtGrau(v), q2: v => fmtGrau(v), q3: v => fmtGrau(v),
  erro: v => v.toFixed(4) + '°',
};
const ROTULO = { x: 'x', y: 'y', z: 'z', q1: "q1'", q2: "q2'", q3: "q3'", erro: 'erro' };

let tiles = null;
let ultimo = null;

function limparHistorico() {
  for (const k of CHAVES) hist[k].length = 0;
  ultimo = null;
}

function amostrar() {
  const perna = estado.ativa, lado = LADO[perna];
  const q = estado.angulos[perna];
  const pe = origem(fkPerna(q[0], q[1], q[2], lado).T03);
  const s = ikPerna(pe[0], pe[1], pe[2], lado, RAMOS[0], LIMITES[perna]);

  const erro = s.ok ? Math.max(...s.qLim.map((v, i) => difAngulo(v, q[i]))) * GRAU : 180;
  const qg = s.ok ? s.qLim.map(v => v * GRAU) : [0, 0, 0];

  const valores = { x: pe[0], y: pe[1], z: pe[2], q1: qg[0], q2: qg[1], q3: qg[2], erro };
  for (const k of CHAVES) {
    hist[k].push(valores[k]);
    if (hist[k].length > JANELA_HIST) hist[k].shift();
  }
  ultimo = { s, erro, valores };
}

function montarTiles() {
  const criar = (cont, chaves) => chaves.map(k => {
    const par = document.createElement('span');
    par.className = 'par';
    const rot = document.createElement('i');
    rot.textContent = ROTULO[k];
    const val = document.createElement('b');
    par.append(rot, val);
    cont.appendChild(par);
    const t = { k, par, val, traco: new Traco(par), lendo: -1 };
    t.traco.svg.addEventListener('pointermove', ev => {
      t.lendo = t.traco.indiceEm(ev.clientX);
      pintarTiles();
    });
    t.traco.svg.addEventListener('pointerleave', () => { t.lendo = -1; pintarTiles(); });
    return t;
  });

  $('#pe-pos').innerHTML = '';
  $('#ik-conf').innerHTML = '';
  tiles = criar($('#pe-pos'), ['x', 'y', 'z'])
    .concat(criar($('#ik-conf'), ['q1', 'q2', 'q3', 'erro']));
}

const EIXO = ALCANCE + GEO.L_ABD;

function dominios() {
  const lim = LIMITES[estado.ativa];
  return {
    x: [-EIXO, EIXO], y: [-EIXO, EIXO], z: [-EIXO, EIXO],
    q1: [lim[0][0] * GRAU, lim[0][1] * GRAU],
    q2: [lim[1][0] * GRAU, lim[1][1] * GRAU],
    q3: [lim[2][0] * GRAU, lim[2][1] * GRAU],
    erro: [0, 180],
  };
}

function pintarTiles() {
  if (!tiles || !ultimo) return;
  const dom = dominios();
  const s = ultimo.s;

  for (const t of tiles) {
    const serie = hist[t.k];
    const [lo, hi] = dom[t.k];
    const alerta = t.k === 'erro' ? ultimo.erro >= 1e-3
      : (t.k[0] === 'q' ? !!(s.ok && s.preso[+t.k[1] - 1]) : false);

    t.traco.definir(serie, lo, hi, alerta);

    const n = Math.min(serie.length, JANELA_HIST);
    const lendo = t.lendo >= 0 && t.lendo < n;
    const i = lendo ? t.lendo : n - 1;
    const v = serie[serie.length - n + i];

    if (lendo) t.traco.marcar(i, n, v, true);
    t.val.textContent = v === undefined ? '--' : FMT[t.k](v);
    t.par.classList.toggle('lendo', lendo);
    t.par.classList.toggle('nao-bate', alerta);
    t.par.classList.toggle('bate', t.k === 'erro' && !alerta);
  }
}

function difAngulo(a, b) {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
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
  const carga = {
    ativa: estado.ativa, selecao: estado.selecao.slice(), angulos: estado.angulos,
  };
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
