
'use strict';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, atrib) {
  const e = document.createElementNS(NS, tag);
  for (const k in atrib) e.setAttribute(k, atrib[k]);
  return e;
}

function corToken(nome, alt) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || alt;
}

function pontoAng(cx, cy, r, a) {
  return [cx - r * Math.sin(a), cy + r * Math.cos(a)];
}

function arco(cx, cy, r, a0, a1) {
  const p = pontoAng(cx, cy, r, a0), q = pontoAng(cx, cy, r, a1);
  const grande = (a1 - a0) > Math.PI ? 1 : 0;
  return `M${p[0].toFixed(2)} ${p[1].toFixed(2)} A${r} ${r} 0 ${grande} 1 ` +
         `${q[0].toFixed(2)} ${q[1].toFixed(2)}`;
}

const L = 116, A = 124, CX = 58, CY = 49, R = 33;

class Mostrador {

  constructor(host, rotulo, ajuda, aoMudar) {
    this.host = host;
    this.aoMudar = aoMudar;
    this.valor = 0;
    this.lo = -1;
    this.hi = 1;

    const s = svgEl('svg', {
      class: 'mostrador', viewBox: `0 0 ${L} ${A}`, height: A,
      role: 'slider', tabindex: '0', 'aria-label': rotulo,
    });
    this.svg = s;

    s.appendChild(svgEl('circle', { class: 'm-anel', cx: CX, cy: CY, r: R }));
    s.appendChild(svgEl('path', { class: 'm-trilho', d: '' }));
    this.trilho = s.lastChild;
    s.appendChild(svgEl('path', { class: 'm-cheio', d: '' }));
    this.cheio = s.lastChild;
    s.appendChild(svgEl('line', { class: 'm-zero' }));
    this.zero = s.lastChild;
    s.appendChild(svgEl('line', { class: 'm-ponteiro' }));
    this.ponteiro = s.lastChild;
    s.appendChild(svgEl('circle', { class: 'm-eixo', cx: CX, cy: CY, r: 4 }));
    s.appendChild(svgEl('circle', { class: 'm-alca', r: 7 }));
    this.alca = s.lastChild;

    this.num = svgEl('text', { class: 'm-num', x: CX, y: A - 15, 'text-anchor': 'middle' });
    this.rot = svgEl('text', { class: 'm-rot', x: CX, y: A - 3, 'text-anchor': 'middle' });
    this.rot.textContent = rotulo;
    s.appendChild(this.num);
    s.appendChild(this.rot);

    host.innerHTML = '';
    host.appendChild(s);
    if (ajuda) host.title = ajuda;

    this._ligar();
  }

  definir(valor, lo, hi) {
    this.valor = valor;
    if (lo !== undefined) { this.lo = lo; this.hi = hi; }
    this._pintar();
  }

  _pintar() {
    const a = this.valor;
    this.trilho.setAttribute('d', arco(CX, CY, R, this.lo, this.hi));

    const ancora = Math.max(this.lo, Math.min(this.hi, 0));
    this.cheio.setAttribute('d', a >= ancora ? arco(CX, CY, R, ancora, a)
                                            : arco(CX, CY, R, a, ancora));

    const temZero = this.lo <= 0 && this.hi >= 0;
    this.zero.style.display = temZero ? '' : 'none';
    const z1 = pontoAng(CX, CY, R - 9, 0), z2 = pontoAng(CX, CY, R + 8, 0);
    this.zero.setAttribute('x1', z1[0]); this.zero.setAttribute('y1', z1[1]);
    this.zero.setAttribute('x2', z2[0]); this.zero.setAttribute('y2', z2[1]);

    const p = pontoAng(CX, CY, R - 10, a);
    this.ponteiro.setAttribute('x1', CX); this.ponteiro.setAttribute('y1', CY);
    this.ponteiro.setAttribute('x2', p[0]); this.ponteiro.setAttribute('y2', p[1]);
    this.alca.setAttribute('cx', p[0]); this.alca.setAttribute('cy', p[1]);

    const g = a * 180 / Math.PI;
    this.num.textContent = (g >= 0 ? '+' : '') + g.toFixed(0) + '°';

    const nolimite = a <= this.lo + 1e-4 || a >= this.hi - 1e-4;
    this.svg.classList.toggle('no-limite', nolimite);
    this.svg.setAttribute('aria-valuenow', g.toFixed(0));
  }

  _anguloDe(ev) {
    const r = this.svg.getBoundingClientRect();
    const k = L / r.width;
    const x = (ev.clientX - r.left) * k - CX;
    const y = (ev.clientY - r.top) * (A / r.height) - CY;
    let a = Math.atan2(-x, y);

    while (a - this.valor > Math.PI) a -= 2 * Math.PI;
    while (this.valor - a > Math.PI) a += 2 * Math.PI;
    return Math.max(this.lo, Math.min(this.hi, a));
  }

  _ligar() {
    const s = this.svg;
    let arrastando = false;

    const mover = ev => {
      if (!arrastando) return;
      ev.preventDefault();
      this.aoMudar(this._anguloDe(ev));
    };

    s.addEventListener('pointerdown', ev => {
      arrastando = true;

      try { s.setPointerCapture(ev.pointerId); } catch (e) {}
      s.classList.add('pegando');
      this.aoMudar(this._anguloDe(ev));
    });
    s.addEventListener('pointermove', mover);
    const soltar = ev => {
      arrastando = false;
      s.classList.remove('pegando');
      try { s.releasePointerCapture(ev.pointerId); } catch (e) {}
    };
    s.addEventListener('pointerup', soltar);
    s.addEventListener('pointercancel', soltar);

    s.addEventListener('keydown', ev => {
      const passo = (ev.shiftKey ? 10 : 2) * Math.PI / 180;
      let v = null;
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') v = this.valor - passo;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') v = this.valor + passo;
      if (ev.key === 'Home') v = this.lo;
      if (ev.key === 'End') v = this.hi;
      if (v === null) return;
      ev.preventDefault();
      this.aoMudar(Math.max(this.lo, Math.min(this.hi, v)));
    });
  }
}

function medidor(host, op) {

  const l = 160, cx = 80, cy = 72, r = 56, esp = 9;
  const a = Math.ceil(cy + r / 2 + esp / 2) + 18;
  const DE = 210, ATE = -30;
  const ang = f => (DE + (ATE - DE) * Math.max(0, Math.min(1, f))) * Math.PI / 180;
  const pt = (g, raio) => [cx + raio * Math.cos(g), cy - raio * Math.sin(g)];
  const arc = (f0, f1, raio) => {
    const p = pt(ang(f0), raio), q = pt(ang(f1), raio);
    const grande = Math.abs(ang(f1) - ang(f0)) > Math.PI ? 1 : 0;
    return `M${p[0].toFixed(1)} ${p[1].toFixed(1)} A${raio} ${raio} 0 ${grande} 1 ` +
           `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  };

  const s = svgEl('svg', { class: 'medidor', viewBox: `0 0 ${l} ${a}`, height: a });
  s.appendChild(svgEl('path', { d: arc(0, 1, r), class: 'g-trilho', 'stroke-width': esp }));

  const f = Math.max(0, Math.min(1, op.fracao));
  s.appendChild(svgEl('path', {
    d: arc(0, Math.max(f, 0.001), r), 'stroke-width': esp,
    class: 'g-cheio' + (op.alerta ? ' alerta' : ''),
  }));

  for (const k of [0, 0.5, 1]) {
    const g = ang(k), p1 = pt(g, r - esp / 2 - 3), p2 = pt(g, r - esp / 2 - 7);
    s.appendChild(svgEl('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], class: 'g-risco' }));
  }

  const t = svgEl('text', { x: cx, y: cy - 8, 'text-anchor': 'middle', class: 'g-num' });
  t.textContent = op.texto;
  s.appendChild(t);
  if (op.sub) {
    const u = svgEl('text', { x: cx, y: cy + 9, 'text-anchor': 'middle', class: 'g-sub' });
    u.textContent = op.sub;
    s.appendChild(u);
  }
  const e1 = svgEl('text', { x: 10, y: a - 4, class: 'g-lim' });
  e1.textContent = op.min;
  const e2 = svgEl('text', { x: l - 10, y: a - 4, 'text-anchor': 'end', class: 'g-lim' });
  e2.textContent = op.max;
  s.appendChild(e1); s.appendChild(e2);

  host.innerHTML = '';
  host.appendChild(s);
}

function vista2D(pontos, ii, jj) {
  const l = 300, alt = 230, m = 22;
  const ALC = GEO.L_COXA + GEO.L_CANELA;
  const lim = ALC + GEO.L_ABD + 0.03;
  const ex = v => m + ((v + lim) / (2 * lim)) * (l - 2 * m);
  const ey = v => m + ((0.06 - v) / (0.06 + lim)) * (alt - 2 * m);
  const p = pontos.map(q => [ex(q[ii]), ey(q[jj])]);

  let s = `<svg class="vista" viewBox="0 0 ${l} ${alt}" height="86"
            preserveAspectRatio="xMidYMid meet">`;
  s += `<line class="v-eixo" x1="${m}" y1="${ey(0).toFixed(1)}" x2="${l - m}" y2="${ey(0).toFixed(1)}"/>`;
  s += `<line class="v-eixo" x1="${ex(0).toFixed(1)}" y1="${m}" x2="${ex(0).toFixed(1)}" y2="${alt - m}"/>`;

  const r = (ALC / (2 * lim)) * (l - 2 * m);
  s += `<circle class="v-alcance" cx="${p[1][0].toFixed(1)}" cy="${p[1][1].toFixed(1)}" r="${r.toFixed(1)}"/>`;

  const larg = [10, 8.5, 7];
  for (let k = 0; k < 3; k++) {
    s += `<line class="v-elo" x1="${p[k][0].toFixed(1)}" y1="${p[k][1].toFixed(1)}"
           x2="${p[k + 1][0].toFixed(1)}" y2="${p[k + 1][1].toFixed(1)}" stroke-width="${larg[k]}"/>`;
  }
  for (let k = 1; k < 3; k++) {
    s += `<circle class="v-junta" cx="${p[k][0].toFixed(1)}" cy="${p[k][1].toFixed(1)}" r="6"/>`;
  }
  s += `<circle class="v-pe" cx="${p[3][0].toFixed(1)}" cy="${p[3][1].toFixed(1)}" r="8"/>`;
  return s + '</svg>';
}

const TODAS = '*';

function mapaPernas(host, selecao, aoEscolher) {
  const l = 230, alt = 98, cx = l / 2, cy = alt / 2 + 3;
  const s = svgEl('svg', { class: 'mapa', viewBox: `0 0 ${l} ${alt}`, height: alt });
  const escolhida = p => selecao.indexOf(p) >= 0;
  const todas = PERNAS.every(escolhida);

  const tronco = svgEl('g', {
    class: 'mapa-tronco' + (todas ? ' ativa' : ''),
    role: 'button', tabindex: '0', 'aria-pressed': String(todas),
  });
  tronco.appendChild(svgEl('rect', {
    class: 'mapa-corpo', x: cx - 19, y: cy - 27, width: 38, height: 54, rx: 8,
  }));
  const disparar = (alvo, ev) => aoEscolher(alvo, ev.ctrlKey || ev.metaKey || ev.shiftKey);
  tronco.addEventListener('click', ev => disparar(TODAS, ev));
  tronco.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); disparar(TODAS, ev); }
  });
  s.appendChild(tronco);

  const seta = svgEl('path', { class: 'mapa-frente', d: `M${cx} ${cy - 36} l5 9 h-10 z` });
  s.appendChild(seta);
  const rf = svgEl('text', { class: 'mapa-rot', x: cx, y: cy - 40, 'text-anchor': 'middle' });
  rf.textContent = 'frente';
  s.appendChild(rf);

  const casas = { FL: [-1, -1], FR: [1, -1], RL: [-1, 1], RR: [1, 1] };
  for (const perna of PERNAS) {
    const [sx, sy] = casas[perna];
    const x = cx + sx * 60, y = cy + sy * 19;
    const g = svgEl('g', {
      class: 'mapa-perna' + (escolhida(perna) ? ' ativa' : '') +
             (selecao[0] === perna && selecao.length > 1 ? ' guia' : ''),
      role: 'button', tabindex: '0', 'aria-pressed': String(escolhida(perna)),
    });
    g.appendChild(svgEl('rect', { x: x - 25, y: y - 13, width: 50, height: 26, rx: 7 }));
    const t = svgEl('text', { x, y: y + 5, 'text-anchor': 'middle' });
    t.textContent = perna;
    g.appendChild(t);
    g.addEventListener('click', ev => disparar(perna, ev));
    g.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); disparar(perna, ev); }
    });
    s.appendChild(g);
  }

  host.innerHTML = '';
  host.appendChild(s);
}

const TRACO_L = 180;
const TRACO_A = 48;
const TRACO_PAD = 6;
const TRACO_JANELA = 160;

class Traco {

  constructor(host) {
    this.L = TRACO_L;
    this.lo = 0;
    this.hi = 1;
    this.alerta = false;
    this.svg = svgEl('svg', {
      class: 'traco', viewBox: `0 0 ${TRACO_L} ${TRACO_A}`,
      height: TRACO_A, 'aria-hidden': 'true',
    });
    this.zero = svgEl('line', { class: 't-zero' });
    this.linha = svgEl('polyline', { class: 't-linha' });
    this.cruz = svgEl('line', { class: 't-cruz' });
    this.anel = svgEl('circle', { class: 't-anel', r: 5.5 });
    this.ponto = svgEl('circle', { class: 't-ponto', r: 3.5 });
    this.svg.append(this.zero, this.linha, this.cruz, this.anel, this.ponto);
    host.appendChild(this.svg);
    this.serie = [];

    // 1 unidade do viewBox = 1 pixel: sem isso o SVG estica e deforma
    // a espessura da linha e os pontos viram elipses
    if (typeof ResizeObserver !== 'undefined') {
      this.observador = new ResizeObserver(() => this.medir());
      this.observador.observe(this.svg);
    }
    this.medir();
  }

  medir() {
    const l = Math.round(this.svg.getBoundingClientRect().width);
    if (!l || l === this.L) return;
    this.L = l;
    this.svg.setAttribute('viewBox', `0 0 ${l} ${TRACO_A}`);
    if (this.serie.length) this.definir(this.serie, this.lo, this.hi, this.alerta);
  }

  emX(i, n) {
    const largura = this.L - 2 * TRACO_PAD;
    return this.L - TRACO_PAD - (n - 1 - i) * (largura / (TRACO_JANELA - 1));
  }

  emY(v) {
    const t = (v - this.lo) / (this.hi - this.lo || 1);
    return TRACO_A - TRACO_PAD - Math.max(0, Math.min(1, t)) * (TRACO_A - 2 * TRACO_PAD);
  }

  definir(serie, lo, hi, alerta) {
    this.serie = serie;
    this.lo = lo;
    this.hi = hi;
    this.alerta = !!alerta;
    this.svg.classList.toggle('alerta', this.alerta);

    const n = serie.length;
    const visiveis = Math.min(n, TRACO_JANELA);
    const ini = n - visiveis;

    if (lo < 0 && hi > 0) {
      const y = this.emY(0).toFixed(2);
      this.zero.setAttribute('x1', TRACO_PAD);
      this.zero.setAttribute('x2', this.L - TRACO_PAD);
      this.zero.setAttribute('y1', y);
      this.zero.setAttribute('y2', y);
      this.zero.style.display = '';
    } else {
      this.zero.style.display = 'none';
    }

    const pts = [];
    for (let i = ini; i < n; i++) {
      pts.push(this.emX(i - ini, visiveis).toFixed(2) + ',' + this.emY(serie[i]).toFixed(2));
    }
    this.linha.setAttribute('points', pts.join(' '));

    this.marcar(visiveis - 1, visiveis, serie[n - 1], false);
  }

  marcar(i, n, valor, comCruz) {
    if (i < 0 || valor === undefined) {
      this.ponto.style.display = 'none';
      this.anel.style.display = 'none';
      this.cruz.style.display = 'none';
      return;
    }
    const x = this.emX(i, n), y = this.emY(valor);
    for (const e of [this.anel, this.ponto]) {
      e.setAttribute('cx', x.toFixed(2));
      e.setAttribute('cy', y.toFixed(2));
      e.style.display = '';
    }
    if (comCruz) {
      this.cruz.setAttribute('x1', x.toFixed(2));
      this.cruz.setAttribute('x2', x.toFixed(2));
      this.cruz.setAttribute('y1', 2);
      this.cruz.setAttribute('y2', TRACO_A - 2);
      this.cruz.style.display = '';
    } else {
      this.cruz.style.display = 'none';
    }
  }

  indiceEm(clienteX) {
    const cx = this.svg.getBoundingClientRect();
    const n = Math.min(this.serie.length, TRACO_JANELA);
    if (!n || cx.width === 0) return -1;
    const px = clienteX - cx.left;
    let melhor = -1, dist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(this.emX(i, n) - px);
      if (d < dist) { dist = d; melhor = i; }
    }
    return melhor;
  }
}
