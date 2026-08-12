
'use strict';

const GEO = {
  L_COXA: 0.213,
  L_CANELA: 0.213,
  L_ABD: 0.0955,
  R_PE: 0.022,
  Z_BASE: 0.55,

  CORPO: [0.1881, 0.07, 0.057],
};

const PERNAS = ['FL', 'FR', 'RL', 'RR'];

const NOME_PERNA = {
  FL: 'dianteira esquerda', FR: 'dianteira direita',
  RL: 'traseira esquerda', RR: 'traseira direita',
};

const QUADRIL_XY = {
  FL: [0.1934, 0.0465], FR: [0.1934, -0.0465],
  RL: [-0.1934, 0.0465], RR: [-0.1934, -0.0465],
};

const LADO = { FL: 1.0, FR: -1.0, RL: 1.0, RR: -1.0 };

const _ABD = [-1.0472, 1.0472];
const _JOELHO = [-2.7227, -0.83776];
const LIMITES = {
  FL: [_ABD, [-1.5708, 3.4907], _JOELHO],
  FR: [_ABD, [-1.5708, 3.4907], _JOELHO],
  RL: [_ABD, [-0.5236, 4.5379], _JOELHO],
  RR: [_ABD, [-0.5236, 4.5379], _JOELHO],
};

const HOME = [0.0, 0.9, -1.5];

const DESC_JUNTA = [
  { curto: 'q1', nome: 'abducao', eixo: 'eixo X', o_que: 'gira a perna inteira para o lado' },
  { curto: 'q2', nome: 'quadril', eixo: 'eixo Y', o_que: 'move a coxa para frente e para tras' },
  { curto: 'q3', nome: 'joelho', eixo: 'eixo Y', o_que: 'dobra a canela' },
];

const GRAU = 180 / Math.PI;

function Rx(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}

function Ry(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
}

function Trans(x, y, z) {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}

function mult(A, B) {
  const C = new Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += A[4 * i + k] * B[4 * k + j];
      C[4 * i + j] = s;
    }
  }
  return C;
}

function origem(T) { return [T[3], T[7], T[11]]; }

function fkPerna(q1, q2, q3, lado) {
  const T01 = mult(Rx(q1), Trans(0, lado * GEO.L_ABD, 0));
  const T12 = mult(Ry(q2), Trans(0, 0, -GEO.L_COXA));
  const T23 = mult(Ry(q3), Trans(0, 0, -GEO.L_CANELA));
  const T02 = mult(T01, T12);
  return { T01, T12, T23, T02, T03: mult(T02, T23) };
}

function pontosDaCadeia(q, lado) {
  const T = fkPerna(q[0], q[1], q[2], lado);
  return { pontos: [[0, 0, 0], origem(T.T01), origem(T.T02), origem(T.T03)], T };
}

function ikPerna(px, py, pz, lado) {
  const c = Math.sqrt(Math.max(py * py + pz * pz - GEO.L_ABD * GEO.L_ABD, 1e-9));
  const q1 = Math.atan2(pz, py) + Math.atan2(c, lado * GEO.L_ABD);
  const r = Math.min(Math.hypot(px, c), GEO.L_COXA + GEO.L_CANELA - 0.012);
  const cos3 = (r * r - GEO.L_COXA ** 2 - GEO.L_CANELA ** 2) / (2 * GEO.L_COXA * GEO.L_CANELA);
  const q3 = -Math.acos(Math.max(-1, Math.min(1, cos3)));
  const phi = Math.atan2(-GEO.L_CANELA * Math.sin(q3), GEO.L_COXA + GEO.L_CANELA * Math.cos(q3));
  return [q1, Math.atan2(-px, c) + phi, q3];
}

function alcancavel(px, py, pz, lado) {
  const q = ikPerna(px, py, pz, lado);
  const p = origem(fkPerna(q[0], q[1], q[2], lado).T03);
  return Math.hypot(p[0] - px, p[1] - py, p[2] - pz) < 1e-4;
}

function _sorteio(semente) {
  let a = semente >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function autotesteFkIk(n = 2000, semente = 20260811) {
  const r = _sorteio(semente);
  const faixa = (a, b) => a + r() * (b - a);
  let erroMax = 0;
  for (let i = 0; i < n; i++) {
    const lado = r() < 0.5 ? 1 : -1;
    const q1 = faixa(-0.5, 0.5), q2 = faixa(-1.2, 2.8), q3 = faixa(-2.5, -0.5);
    const p = origem(fkPerna(q1, q2, q3, lado).T03);
    const qb = ikPerna(p[0], p[1], p[2], lado);
    const pb = origem(fkPerna(qb[0], qb[1], qb[2], lado).T03);
    erroMax = Math.max(erroMax, Math.hypot(p[0] - pb[0], p[1] - pb[1], p[2] - pb[2]));
  }
  return { amostras: n, erroMax, ok: erroMax < 1e-4 };
}
