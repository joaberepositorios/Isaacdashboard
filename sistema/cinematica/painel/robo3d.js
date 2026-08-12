/* ===========================================================================
   BANCADA EM 3D  --  canvas 2D puro, sem WebGL e sem biblioteca

   Substitui a janela do MuJoCo. Nao ha' malha nem iluminacao: ha' uma camera
   em orbita, uma projecao em perspectiva e um pintor que ordena as faces por
   profundidade (algoritmo do pintor). Isso e' o suficiente para ler a POSE,
   que e' o que a bancada ensina -- e roda em qualquer maquina com navegador,
   sem GPU, sem instalar nada.

   Convencao de mundo, a mesma do MuJoCo:  +X frente,  +Y esquerda,  +Z cima.
   =========================================================================== */

'use strict';

const CAMERA_INICIAL = { az: 140, el: 16, dist: 1.85 };

/* Raio da esfera que precisa caber na tela, medido do alvo da camera: cobre o
   tronco, a bancada e as quatro pernas em qualquer pose que os limites das
   juntas permitam, com folga para os rotulos. */
const RAIO_CENA = 0.62;
const FOV = 40;                       // campo vertical, em graus

class Bancada3D {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = Object.assign({}, CAMERA_INICIAL);
    this.alvo = [0, 0, GEO.Z_BASE * 0.62];
    this.cores = lerCores();
    this.angulos = {};
    this.ativa = 'FL';
    this.mostrarAlcance = true;
    this.zoomManual = false;
    this._ligarMouse();
    this._redimensionar();
    this.enquadrar();
    if (window.ResizeObserver) {
      new ResizeObserver(() => { this._redimensionar(); this.enquadrar(); this.desenhar(); })
        .observe(canvas.parentElement || canvas);
    }
  }

  definir(angulos, ativa) { this.angulos = angulos; this.ativa = ativa; this.desenhar(); }

  reiniciarCamera() {
    this.cam = Object.assign({}, CAMERA_INICIAL);
    this.zoomManual = false;
    this.enquadrar();
  }

  /** Distancia que faz o robo INTEIRO caber, considerando a forma do canvas.
      Numa cena alta e estreita quem aperta e' o campo horizontal, e nao o
      vertical -- por isso o menor dos dois manda. */
  enquadrar() {
    if (this.zoomManual) return;
    const semiV = (FOV / 2) * Math.PI / 180;
    const semiH = Math.atan(Math.tan(semiV) * (this.L / this.A));
    this.cam.dist = Math.min(4.0, (RAIO_CENA / Math.sin(Math.min(semiV, semiH))) * 1.02);
    this.desenhar();
  }

  /** de cima: mostra a abducao, que e o movimento dificil de ler de lado */
  verDeCima() { this.cam.el = 78; this.cam.az = 180; this.desenhar(); }

  /** de lado: o mesmo plano X-Z do diagrama "visto de lado" */
  verDeLado() { this.cam.el = 4; this.cam.az = 90; this.desenhar(); }

  /* ------------------------------------------------------------- mouse */

  _ligarMouse() {
    const cv = this.cv;
    let arrastando = false, ux = 0, uy = 0;

    const inicio = (x, y) => { arrastando = true; ux = x; uy = y; cv.style.cursor = 'grabbing'; };
    const move = (x, y) => {
      if (!arrastando) return;
      this.cam.az = (this.cam.az - (x - ux) * 0.42) % 360;
      this.cam.el = Math.max(-80, Math.min(85, this.cam.el + (y - uy) * 0.32));
      ux = x; uy = y;
      this.desenhar();
    };
    const fim = () => { arrastando = false; cv.style.cursor = 'grab'; };

    cv.style.cursor = 'grab';
    cv.addEventListener('mousedown', e => { e.preventDefault(); inicio(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', fim);
    cv.addEventListener('dblclick', () => this.reiniciarCamera());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomManual = true;   // a partir daqui o enquadramento e' do usuario
      this.cam.dist = Math.max(0.7, Math.min(4.0, this.cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
      this.desenhar();
    }, { passive: false });

    cv.addEventListener('touchstart', e => {
      if (e.touches.length === 1) { inicio(e.touches[0].clientX, e.touches[0].clientY); }
    }, { passive: true });
    cv.addEventListener('touchmove', e => {
      if (e.touches.length === 1) { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }
    }, { passive: false });
    cv.addEventListener('touchend', fim);
  }

  /* ------------------------------------------------------ projecao 3D->2D */

  _redimensionar() {
    const r = this.cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.L = Math.max(1, Math.round(r.width));
    this.A = Math.max(1, Math.round(r.height));
    this.cv.width = Math.round(this.L * dpr);
    this.cv.height = Math.round(this.A * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _montarCamera() {
    const az = this.cam.az / GRAU, el = this.cam.el / GRAU;
    const dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    this.olho = [
      this.alvo[0] + dir[0] * this.cam.dist,
      this.alvo[1] + dir[1] * this.cam.dist,
      this.alvo[2] + dir[2] * this.cam.dist,
    ];
    const f = [-dir[0], -dir[1], -dir[2]];              // frente
    let d = cruz(f, [0, 0, 1]);                          // direita
    const n = Math.hypot(d[0], d[1], d[2]) || 1;
    d = [d[0] / n, d[1] / n, d[2] / n];
    this.base = { f, d, c: cruz(d, f) };                 // cima = direita x frente
    this.foco = (this.A / 2) / Math.tan((FOV / 2) / GRAU);
  }

  /** ponto do mundo -> {x, y, z}; z e' a distancia ao longo do eixo da camera */
  proj(p) {
    const v = [p[0] - this.olho[0], p[1] - this.olho[1], p[2] - this.olho[2]];
    const b = this.base;
    const z = ponto(v, b.f);
    const k = this.foco / Math.max(z, 1e-6);
    return { x: this.L / 2 + ponto(v, b.d) * k, y: this.A / 2 - ponto(v, b.c) * k, z };
  }

  /* ------------------------------------------------------------- desenho */

  desenhar() {
    const ctx = this.ctx, C = this.cores;
    this._montarCamera();
    ctx.clearRect(0, 0, this.L, this.A);

    this._piso();

    // tudo o que tem volume entra numa lista e e' pintado do fundo para a
    // frente: sem isso a perna de tras aparece por cima do corpo
    const itens = [];
    this._bancada(itens);
    this._corpo(itens);
    for (const perna of PERNAS) this._perna(itens, perna);
    itens.sort((a, b) => b.z - a.z);
    for (const it of itens) it.pintar(ctx);

    this._rotulos();
    // a instrucao de camera mora fora do canvas, ao lado do botao Recentrar:
    // repetir dentro do desenho e' texto a mais na tela
  }

  _piso() {
    const ctx = this.ctx, C = this.cores;
    const lim = 1.2, passo = 0.2;
    ctx.lineWidth = 1;
    for (let i = -lim; i <= lim + 1e-9; i += passo) {
      const eixo = Math.abs(i) < 1e-9;
      ctx.strokeStyle = eixo ? C.axis : C.grid;
      this._linha([i, -lim, 0], [i, lim, 0]);
      this._linha([-lim, i, 0], [lim, i, 0]);
    }
  }

  /** segmento no mundo, recortado no plano da camera (senao vira lixo atras) */
  _linha(a, b, ctx) {
    ctx = ctx || this.ctx;
    const pa = this.proj(a), pb = this.proj(b);
    const perto = 0.05;
    if (pa.z < perto && pb.z < perto) return;
    let A = pa, B = pb;
    if (pa.z < perto || pb.z < perto) {
      const [dentro, fora] = pa.z >= perto ? [a, b] : [b, a];
      const zd = pa.z >= perto ? pa.z : pb.z, zf = pa.z >= perto ? pb.z : pa.z;
      const t = (zd - perto) / (zd - zf);
      const corte = [
        dentro[0] + (fora[0] - dentro[0]) * t,
        dentro[1] + (fora[1] - dentro[1]) * t,
        dentro[2] + (fora[2] - dentro[2]) * t,
      ];
      A = this.proj(dentro); B = this.proj(corte);
    }
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }

  /** face poligonal preenchida, com filete de borda */
  _face(itens, pts, preenche, borda) {
    const proj = pts.map(p => this.proj(p));
    if (proj.some(p => p.z < 0.05)) return;
    const z = proj.reduce((s, p) => s + p.z, 0) / proj.length;
    itens.push({
      z, pintar: ctx => {
        ctx.beginPath();
        ctx.moveTo(proj[0].x, proj[0].y);
        for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
        ctx.closePath();
        ctx.fillStyle = preenche;
        ctx.fill();
        if (borda) { ctx.strokeStyle = borda; ctx.lineWidth = 1; ctx.stroke(); }
      },
    });
  }

  _caixa(itens, centro, meio, preenche, borda) {
    const [cx, cy, cz] = centro, [hx, hy, hz] = meio;
    const v = [];
    for (const sz of [-1, 1]) for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
      v.push([cx + sx * hx, cy + sy * hy, cz + sz * hz]);
    }
    // indices dos 8 vertices: bit0 = x, bit1 = y, bit2 = z
    const faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6],
                   [0, 2, 6, 4], [1, 3, 7, 5]];
    for (const f of faces) this._face(itens, f.map(i => v[i]), preenche, borda);
  }

  _prisma(itens, cx, cy, z0, z1, raio, lados, preenche, borda) {
    const anel = z => {
      const p = [];
      for (let i = 0; i < lados; i++) {
        const a = (2 * Math.PI * i) / lados;
        p.push([cx + raio * Math.cos(a), cy + raio * Math.sin(a), z]);
      }
      return p;
    };
    const baixo = anel(z0), cima = anel(z1);
    for (let i = 0; i < lados; i++) {
      const j = (i + 1) % lados;
      this._face(itens, [baixo[i], baixo[j], cima[j], cima[i]], preenche, null);
    }
    this._face(itens, cima, preenche, borda);
  }

  _bancada(itens) {
    const C = this.cores;
    // o prato encosta na BARRIGA, nao no centro do tronco: senao ele atravessa
    // o corpo e o robo parece empalado
    const topoPrato = GEO.Z_BASE - GEO.CORPO[2];
    this._prisma(itens, 0, 0, 0, 0.032, 0.13, 20, C.suporte, C.suporteBorda);
    this._prisma(itens, 0, 0, 0.032, topoPrato - 0.014, 0.04, 14, C.suporte, C.suporteBorda);
    this._caixa(itens, [0, 0, topoPrato - 0.014], [0.10, 0.07, 0.014],
                C.suporte, C.suporteBorda);
  }

  _corpo(itens) {
    this._caixa(itens, [0, 0, GEO.Z_BASE], GEO.CORPO, this.cores.corpo, this.cores.corpoBorda);
  }

  _perna(itens, perna) {
    const C = this.cores;
    const q = this.angulos[perna] || HOME;
    const ativa = perna === this.ativa;
    const [qx, qy] = QUADRIL_XY[perna];
    const { pontos } = pontosDaCadeia(q, LADO[perna]);
    const mundo = pontos.map(p => [qx + p[0], qy + p[1], GEO.Z_BASE + p[2]]);

    const cor = ativa ? C.velvet : C.neutro;
    // raios reais dos elos, em metros (go2.xml: a coxa e uma caixa de meia
    // espessura 0.017). lineWidth e o DIAMETRO projetado, dai o 2.
    const raios = [0.020, 0.017, 0.013];   // abducao, coxa, canela

    for (let k = 0; k < 3; k++) {
      const a = mundo[k], b = mundo[k + 1];
      const pa = this.proj(a), pb = this.proj(b);
      if (pa.z < 0.05 || pb.z < 0.05) continue;
      const z = (pa.z + pb.z) / 2;
      const larg = Math.max(2, (raios[k] * 2 * this.foco) / z);
      itens.push({
        z, pintar: ctx => {
          ctx.lineCap = 'round';
          ctx.strokeStyle = cor;
          ctx.lineWidth = larg;
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          if (ativa) {   // filete claro por cima: da' volume sem gradiente
            ctx.strokeStyle = C.rosa;
            ctx.lineWidth = Math.max(1, larg * 0.16);
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          }
        },
      });
    }

    // juntas (aneis) e pe (disco cheio)
    for (let k = 0; k < 4; k++) {
      const p = this.proj(mundo[k]);
      if (p.z < 0.05) continue;
      const pe = k === 3;
      const r = Math.max(2, ((pe ? GEO.R_PE * 1.15 : 0.024) * this.foco) / p.z);
      itens.push({
        z: p.z - 1e-3, pintar: ctx => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
          // o miolo da junta e' o leito do palco, nao a cor da pagina: se for
          // a pagina, a junta vira um furo preto nas pernas apagadas
          ctx.fillStyle = pe ? (ativa ? C.velvet : C.neutro) : this.cores.palco;
          ctx.fill();
          ctx.lineWidth = Math.max(1, r * 0.34);
          ctx.strokeStyle = ativa ? (pe ? C.rosa : C.velvet) : C.neutro;
          ctx.stroke();
        },
      });
    }

    // prumo do pe ate' o chao: sem ele nao da' para julgar profundidade
    if (ativa) {
      const pe = mundo[3];
      itens.push({
        z: this.proj(pe).z + 5, pintar: c => {
          c.save();
          c.setLineDash([3, 4]);
          c.lineWidth = 1;
          c.strokeStyle = this.cores.rosaTxt;
          this._linha(pe, [pe[0], pe[1], 0], c);
          c.restore();
          const s = this.proj([pe[0], pe[1], 0]);
          if (s.z > 0.05) {
            c.beginPath();
            c.ellipse(s.x, s.y, Math.max(2, 0.03 * this.foco / s.z),
                      Math.max(1, 0.03 * this.foco / s.z * 0.4), 0, 0, 2 * Math.PI);
            c.fillStyle = this.cores.marcaChao;
            c.fill();
          }
        },
      });
    }
  }

  _rotulos() {
    const ctx = this.ctx, C = this.cores;
    ctx.font = '600 10.5px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const perna of PERNAS) {
      // afastado do quadril para fora do corpo, senao o rotulo cai em cima dele
      const [qx, qy] = QUADRIL_XY[perna];
      const p = this.proj([qx + Math.sign(qx) * 0.07, qy + Math.sign(qy) * 0.17,
                           GEO.Z_BASE + 0.09]);
      if (p.z < 0.05) continue;
      ctx.fillStyle = perna === this.ativa ? C.rosaTxt : C.muted;
      ctx.fillText(perna, p.x, p.y);
    }
  }

}

/* ------------------------------------------------------------- utilitarios */

function cruz(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function ponto(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** as cores vem do CSS, pelo PAPEL que cumprem: trocar a paleta da pagina
    troca o desenho junto, sem editar este arquivo */
function lerCores() {
  const s = getComputedStyle(document.documentElement);
  const v = (nome, alt) => (s.getPropertyValue(nome) || '').trim() || alt;
  return {
    fundo: v('--fundo', '#05090d'),
    palco: v('--azul-fundo', '#04222c'),   // o leito atras da cena
    grid: v('--grid-3d', '#dae7ec'),
    axis: v('--axis-3d', '#b0c8d2'),
    muted: v('--muted', '#5d7b87'),
    neutro: v('--neutro', '#93a9b3'),      // perna nao selecionada
    velvet: v('--acento', '#0a6076'),      // perna ativa
    rosa: v('--acento-claro', '#22d3e8'),  // filete de volume por cima do elo
    rosaTxt: v('--acento', '#0a6076'),
    corpo: v('--corpo-3d', '#dde9ee'),
    corpoBorda: v('--corpo-borda-3d', '#a3bcc6'),
    // o suporte e preto na bancada real; aqui ele e' um cinza-azul claro, com
    // filete para ter forma sem virar um bloco chapado no meio da cena
    suporte: v('--suporte-3d', '#e6eff2'),
    suporteBorda: v('--corpo-borda-3d', '#a3bcc6'),
    marcaChao: v('--acento-fundo', '#22d3e8'),
  };
}
