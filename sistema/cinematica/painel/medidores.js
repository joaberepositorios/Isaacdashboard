/* ===========================================================================
   MOSTRADORES  --  as pecas de leitura e de controle da bancada

   Duas coisas moram aqui:

     Mostrador  o controle das juntas. O ponteiro NAO e' uma barra disfarcada
                de redondo: ele aponta para onde o elo aponta de verdade, e o
                arco cinza e' o limite mecanico lido do go2.xml. Arrastar o
                ponteiro gira a junta.

     medidor    leitura pura, no formato do painel do Isaac: arco de 240
                graus, ponteiro fino, numero grande. Nao se arrasta.

   Convencao do ponteiro, a mesma da vista lateral:
       zero aponta para BAIXO (elo pendurado), e o angulo cresce girando o
       elo para tras -- exatamente como a perna se move na tela.
   =========================================================================== */

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

/* ----------------------------------------------------------- ponto e arco */

/** posicao na circunferencia para o angulo de junta a (rad) */
function pontoAng(cx, cy, r, a) {
  return [cx - r * Math.sin(a), cy + r * Math.cos(a)];
}

/** caminho SVG de a0 ate a1 (a1 > a0), no sentido em que a junta gira */
function arco(cx, cy, r, a0, a1) {
  const p = pontoAng(cx, cy, r, a0), q = pontoAng(cx, cy, r, a1);
  const grande = (a1 - a0) > Math.PI ? 1 : 0;
  return `M${p[0].toFixed(2)} ${p[1].toFixed(2)} A${r} ${r} 0 ${grande} 1 ` +
         `${q[0].toFixed(2)} ${q[1].toFixed(2)}`;
}

/* =========================================================== MOSTRADOR ==== */

const L = 116, A = 124, CX = 58, CY = 49, R = 33;

class Mostrador {
  /** host: onde desenhar; aoMudar(rad) chamado enquanto o usuario arrasta */
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

    // anel completo bem apagado: sem ele, uma junta de faixa curta (a abducao
    // so' anda 120 graus) fica um arco solto no meio do vazio
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
    // o preenchido sai do zero (elo pendurado) e vai ate o valor, mostrando de
    // relance o quanto a junta girou e para que lado. O joelho do Go2 nunca
    // chega a zero -- para ele, a ancora e o limite mais perto do zero.
    const ancora = Math.max(this.lo, Math.min(this.hi, 0));
    this.cheio.setAttribute('d', a >= ancora ? arco(CX, CY, R, ancora, a)
                                            : arco(CX, CY, R, a, ancora));

    // o risco do zero so' faz sentido onde o zero existe (o joelho nao passa la)
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
    // encostou no limite: o numero avisa, porque o ponteiro parado sozinho
    // parece um travamento do programa
    const nolimite = a <= this.lo + 1e-4 || a >= this.hi - 1e-4;
    this.svg.classList.toggle('no-limite', nolimite);
    this.svg.setAttribute('aria-valuenow', g.toFixed(0));
  }

  /** angulo da junta que corresponde ao ponto (x, y) da tela */
  _anguloDe(ev) {
    const r = this.svg.getBoundingClientRect();
    const k = L / r.width;
    const x = (ev.clientX - r.left) * k - CX;
    const y = (ev.clientY - r.top) * (A / r.height) - CY;
    let a = Math.atan2(-x, y);
    // desdobra para o giro mais proximo: sem isso, uma junta que vai ate 260
    // graus daria um salto ao cruzar a volta
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
      // capturar pode falhar (ponteiro ja solto, evento sintetico): o arrasto
      // continua funcionando sem a captura, so' perde o rastro fora do SVG
      try { s.setPointerCapture(ev.pointerId); } catch (e) { /* segue */ }
      s.classList.add('pegando');
      this.aoMudar(this._anguloDe(ev));
    });
    s.addEventListener('pointermove', mover);
    const soltar = ev => {
      arrastando = false;
      s.classList.remove('pegando');
      try { s.releasePointerCapture(ev.pointerId); } catch (e) { /* ja solto */ }
    };
    s.addEventListener('pointerup', soltar);
    s.addEventListener('pointercancel', soltar);

    // teclado: o mostrador e um controle, entao tem que dar para usar sem mouse
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

/* ============================================================= MEDIDOR ==== */

/** leitura em arco de 240 graus, no formato do painel do Isaac */
function medidor(host, op) {
  /* Geometria conferida: com varredura de 240 graus, as pontas do arco caem a
     r*sin(30) ABAIXO do centro. O quadro precisa de cy + r/2 + metade da
     espessura, senao as duas pontas saem cortadas -- que era o que acontecia
     com cy=84, r=62 num quadro de 104 (a ponta caia em 115). */
  const l = 160, cx = 80, cy = 72, r = 56, esp = 9;
  const a = Math.ceil(cy + r / 2 + esp / 2) + 18;   // +18 para os rotulos
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

  // riscos: so' os extremos e o meio. Mais que isso vira decoracao
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

/* =============================================== VISTAS DE LADO E DE FRENTE */

/** O bonequinho de palitos, sem rotulo em cada junta: o desenho ja diz.
    Ele vive numa coluna estreita, entao o traco e' proporcionalmente mais
    grosso e o nome da vista fica FORA do SVG, em HTML -- texto dentro de um
    SVG encolhido junto com a figura vira ilegivel. */
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

/* ================================================= MAPA DAS QUATRO PERNAS ==
   Visto de cima, com a frente do robo para cima: clicar na perna e' mais
   direto do que decorar que "RL" quer dizer traseira esquerda.             */

function mapaPernas(host, ativa, aoEscolher) {
  const l = 230, alt = 98, cx = l / 2, cy = alt / 2 + 3;
  const s = svgEl('svg', { class: 'mapa', viewBox: `0 0 ${l} ${alt}`, height: alt });

  s.appendChild(svgEl('rect', {
    class: 'mapa-corpo', x: cx - 19, y: cy - 27, width: 38, height: 54, rx: 8,
  }));
  const seta = svgEl('path', { class: 'mapa-frente', d: `M${cx} ${cy - 36} l5 9 h-10 z` });
  s.appendChild(seta);
  const rf = svgEl('text', { class: 'mapa-rot', x: cx, y: cy - 40, 'text-anchor': 'middle' });
  rf.textContent = 'frente';
  s.appendChild(rf);

  // posicao ESQUEMATICA, nao proporcional: na escala real as duas pernas da
  // frente ficam a 9 cm uma da outra e o desenho vira um borrao
  const casas = { FL: [-1, -1], FR: [1, -1], RL: [-1, 1], RR: [1, 1] };
  for (const perna of PERNAS) {
    const [sx, sy] = casas[perna];
    const x = cx + sx * 60, y = cy + sy * 19;
    const g = svgEl('g', {
      class: 'mapa-perna' + (perna === ativa ? ' ativa' : ''),
      role: 'button', tabindex: '0', 'aria-pressed': String(perna === ativa),
    });
    g.appendChild(svgEl('rect', { x: x - 25, y: y - 13, width: 50, height: 26, rx: 7 }));
    const t = svgEl('text', { x, y: y + 5, 'text-anchor': 'middle' });
    t.textContent = perna;
    g.appendChild(t);
    g.addEventListener('click', () => aoEscolher(perna));
    g.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); aoEscolher(perna); }
    });
    s.appendChild(g);
  }

  host.innerHTML = '';
  host.appendChild(s);
}
