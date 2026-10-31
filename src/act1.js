// ---------------------------------------------------------------------------
// ACTE 1 — Typographie cinétique (Canvas 2D)
//   « Expérience » se construit, les voyelles tombent, les consonnes se
//   resserrent en « Exprnc. », puis le mot est découpé en 3 pièces de puzzle
//   (mêmes lignes de coupe que le logo) qui chutent hors champ.
// ---------------------------------------------------------------------------
import { E, CUES, remap, mix, clamp, spring, rng } from './timeline.js';

const CREAM_TOP = '#F3F0EA';
const CREAM_BOT = '#E2DED6';

export class Act1 {
  constructor(canvas, logo) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.S = this.W / 1920;
    this.logo = logo;
    this.layer = document.createElement('canvas');
    this.layer.width = this.W;
    this.layer.height = this.H;
    this.lctx = this.layer.getContext('2d');
    this.layout();
    this.buildCuts();
    this.buildMotes();
  }

  // ------------------------------------------------------------------ mise en page
  layout() {
    const { ctx, S } = this;
    const LS = -0.025;
    const font = (fs) => `900 ${fs}px Mont900`;
    ctx.font = font(200);
    ctx.letterSpacing = `${LS * 200}px`;
    const w200 = ctx.measureText('Expérience').width - LS * 200;
    const FS = (200 * (1240 * S)) / w200;
    this.FS = FS;
    this.fontStr = font(FS);
    this.ls = LS * FS;
    ctx.font = this.fontStr;
    ctx.letterSpacing = `${this.ls}px`;
    const xsOf = (str) => {
      const xs = [];
      for (let i = 0; i <= str.length; i++) xs.push(ctx.measureText(str.slice(0, i)).width);
      return xs;
    };
    const A = 'Expérience';
    const B = 'Exprnc.';
    const xa = xsOf(A);
    const xb = xsOf(B);
    const wa = xa[A.length] - this.ls;
    const wb = xb[B.length] - this.ls;
    const x0a = this.W / 2 - wa / 2;
    const x0b = this.W / 2 - wb / 2;
    this.capH = ctx.measureText('E').actualBoundingBoxAscent;
    this.xh = ctx.measureText('x').actualBoundingBoxAscent;
    this.baseY = this.H / 2 + this.capH / 2 - 0.01 * FS;

    const metrics = (ch) => {
      const m = ctx.measureText(ch);
      const l = -m.actualBoundingBoxLeft;
      const r = m.actualBoundingBoxRight;
      return { pcx: (l + r) / 2, pcy: (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 };
    };
    const mapB = { 0: 0, 1: 1, 2: 2, 4: 3, 7: 4, 8: 5 };
    this.glyphs = [];
    let v = 0;
    for (let i = 0; i < A.length; i++) {
      const ch = A[i];
      const g = { ch, i, xA: x0a + xa[i], ...metrics(ch), vowel: !(i in mapB) };
      if (g.vowel) {
        g.vi = v++;
      } else {
        g.bi = mapB[i];
        g.xB = x0b + xb[mapB[i]];
      }
      this.glyphs.push(g);
    }
    this.dot = { ch: '.', xB: x0b + xb[6], ...metrics('.') };
    this.wordB = { x0: x0b, w: wb, xs: xb.map((x) => x + x0b) };
  }

  // ------------------------------------------------------------------ lignes de coupe (issues du logo)
  buildCuts() {
    const { ctx, logo } = this;
    // centre du contre-poinçon du « p » (trouvé par analyse du glyphe)
    const pCounter = this.findCounter('p');
    const xb = this.wordB.xs;
    const k = this.xh / 260; // hauteur d'x du logo ≈ 260 px
    const knobs = logo.knobs;
    const targets = [
      [xb[2] + pCounter[0], this.baseY - pCounter[1]],
      [xb[4] - 0.035 * this.FS, this.baseY - 0.5 * this.xh],
    ];
    this.cuts = logo.cuts.map((pts, ci) => {
      const [kx, ky] = knobs[ci];
      const [tx, ty] = targets[ci];
      const P = pts.map(([x, y]) => [tx + (x - kx) * k, ty + (y - ky) * k]);
      // longueur cumulée
      const L = [0];
      for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      return { P, L, len: L[L.length - 1] };
    });
    const ext = (P) => [[P[0][0], P[0][1] - 3000], ...P, [P[P.length - 1][0], P[P.length - 1][1] + 3000]];
    const c1 = ext(this.cuts[0].P);
    const c2 = ext(this.cuts[1].P);
    const poly = (pts) => {
      const p = new Path2D();
      pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
      return p;
    };
    const far = 1e4;
    this.regions = [
      poly([...c1, [-far, c1[c1.length - 1][1]], [-far, c1[0][1]]]),
      poly([...c1, ...c2.slice().reverse()]),
      poly([...c2, [far, c2[c2.length - 1][1]], [far, c2[0][1]]]),
    ];
    const cx1 = this.cuts[0].P.reduce((s, p) => s + p[0], 0) / this.cuts[0].P.length;
    const cx2 = this.cuts[1].P.reduce((s, p) => s + p[0], 0) / this.cuts[1].P.length;
    const midY = this.baseY - this.xh / 2;
    this.partPivots = [
      [(this.wordB.x0 + cx1) / 2, midY],
      [(cx1 + cx2) / 2, midY],
      [(cx2 + this.wordB.x0 + this.wordB.w) / 2, midY],
    ];
  }

  findCounter(ch) {
    const c = document.createElement('canvas');
    const s = Math.ceil(this.FS * 1.4);
    c.width = s;
    c.height = s;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.font = this.fontStr;
    x.fillStyle = '#fff';
    const ox = 0.2 * this.FS;
    const oy = 1.0 * this.FS;
    x.fillText(ch, ox, oy);
    const d = x.getImageData(0, 0, s, s).data;
    const ink = new Uint8Array(s * s);
    for (let i = 0; i < s * s; i++) ink[i] = d[i * 4 + 3] > 128 ? 1 : 0;
    const seen = new Uint8Array(s * s);
    const st = [0];
    seen[0] = 1;
    while (st.length) {
      const p = st.pop();
      const px = p % s, py = (p / s) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue;
        const q = ny * s + nx;
        if (!seen[q] && !ink[q]) {
          seen[q] = 1;
          st.push(q);
        }
      }
    }
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < s * s; i++)
      if (!ink[i] && !seen[i]) {
        sx += i % s;
        sy += (i / s) | 0;
        n++;
      }
    if (!n) return [0.4 * this.FS, 0.5 * this.xh];
    return [sx / n - ox, oy - sy / n];
  }

  buildMotes() {
    const r = rng(11);
    this.motes = [];
    for (let i = 0; i < 80; i++) {
      const z = r();
      this.motes.push({
        x: r() * this.W,
        y: r() * this.H,
        z,
        size: mix(1.0, 9, z * z) * this.S,
        a: mix(0.05, 0.2, r()) * (1 - 0.5 * z),
        sp: mix(6, 26, r()) * this.S,
        ph: r() * 6.283,
        f: mix(0.3, 0.9, r()),
      });
    }
  }

  // ------------------------------------------------------------------ dessin
  drawGlyph(ctx, g, x, y, rot = 0, sx = 1, sy = 1, alpha = 1) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + g.pcx, y - g.pcy);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    // dégradé vertical subtil, exprimé dans le repère du glyphe
    const gr = ctx.createLinearGradient(0, g.pcy - this.capH, 0, g.pcy + 0.2 * this.FS);
    gr.addColorStop(0, CREAM_TOP);
    gr.addColorStop(1, CREAM_BOT);
    ctx.fillStyle = gr;
    ctx.fillText(g.ch, -g.pcx, g.pcy);
    ctx.restore();
  }

  background(ctx, t, shift) {
    const { W, H, S } = this;
    ctx.fillStyle = '#0a0908';
    ctx.fillRect(0, 0, W, H);
    const fade = E.outCubic(remap(t, 0.0, 0.7));
    const cy = H * 0.47 + shift;
    const g = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, H * 0.95);
    g.addColorStop(0, `rgba(66,59,52,${0.95 * fade})`);
    g.addColorStop(0.35, `rgba(38,34,30,${0.8 * fade})`);
    g.addColorStop(1, 'rgba(10,9,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // poussières en suspension (bokeh)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const yy = (((m.y - t * m.sp + shift * (0.6 + m.z)) % (H + 60)) + H + 60) % (H + 60) - 30;
      const xx = m.x + Math.sin(t * m.f + m.ph) * 14 * S;
      const rr = m.size;
      const gr = ctx.createRadialGradient(xx, yy, 0, xx, yy, rr);
      const a = m.a * fade;
      gr.addColorStop(0, `rgba(255,236,214,${a})`);
      gr.addColorStop(0.55, `rgba(255,236,214,${a * 0.55})`);
      gr.addColorStop(1, 'rgba(255,236,214,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(xx, yy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  draw(t) {
    const { ctx, W, H, S, FS } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const shift = -E.inCubic(remap(t, 3.85, 4.3)) * 160 * S;
    this.background(ctx, t, shift);

    // léger travelling avant continu
    let push = 1 + 0.05 * E.inOutSine(remap(t, 0.2, 4.25));
    // petit « punch » quand le point tombe
    if (t > CUES.dotLand) push *= 1 + 0.009 * Math.exp(-(t - CUES.dotLand) * 11) * Math.cos((t - CUES.dotLand) * 22);
    ctx.translate(W / 2, H / 2);
    ctx.scale(push, push);
    ctx.translate(-W / 2, -H / 2);
    ctx.font = this.fontStr;
    ctx.letterSpacing = '0px';

    if (t < CUES.cut1) this.drawWord(ctx, t);
    else this.drawCut(ctx, t);
  }

  drawWord(ctx, t) {
    const { FS, S, baseY } = this;
    const lastReveal = CUES.lettersIn + 9 * 0.055 + 0.75;
    ctx.save();
    if (t < lastReveal) {
      ctx.beginPath();
      ctx.rect(-1e4, -1e4, 3e4, 1e4 + baseY + 0.3 * FS);
      ctx.clip();
    }
    for (const g of this.glyphs) {
      const r0 = CUES.lettersIn + g.i * 0.055;
      const u = remap(t, r0, r0 + 0.75);
      const e = E.outExpo(u);
      let dy = (1 - e) * 1.08 * FS;
      let rot = (1 - E.outCubic(u)) * 0.1 * (g.i % 2 ? 1 : -1);
      let x = g.xA;
      let sx = 1, sy = 1;
      if (g.vowel) {
        const f0 = CUES.vowelsDrop + g.vi * 0.075;
        const ua = remap(t, f0 - 0.16, f0);
        dy -= Math.sin(Math.PI * E.outQuad(ua)) * 0.07 * FS * (t < f0 ? 1 : 0);
        const dir = g.vi % 2 ? 1 : -1;
        if (t > f0) {
          const tau = t - f0;
          dy += 220 * S * tau + 0.5 * 6200 * S * tau * tau;
          rot += dir * (1.8 * tau + 6.5 * tau * tau);
          x += dir * 70 * S * tau;
          sx = Math.cos(tau * 7.0 * (g.vi % 2 ? 1 : 0.6));
        }
      } else {
        const order = Math.abs(g.bi - 2.5) * 0.018;
        const s = spring(t - CUES.closeUp - order, 1.45, 0.66);
        x = mix(g.xA, g.xB, s);
      }
      this.drawGlyph(ctx, g, x, baseY + dy, rot, sx, sy, clamp(u * 3));
    }
    ctx.restore();
    // le point final
    const d0 = CUES.dotLand - 0.26;
    if (t > d0) {
      const u = remap(t, d0, CUES.dotLand);
      let y = baseY - (1 - u * u) * (baseY + 140 * S);
      let sx = 1, sy = 1;
      if (t >= CUES.dotLand) {
        const tau = t - CUES.dotLand;
        y = baseY - 0.12 * FS * Math.abs(Math.sin((Math.PI * tau) / 0.19)) * Math.exp(-tau * 7.5);
        const sq = Math.exp(-tau * 26);
        sy = 1 - 0.3 * sq;
        sx = 1 + 0.22 * sq;
      } else {
        sy = 1 + 0.25 * u * u;
        sx = 1 - 0.12 * u * u;
      }
      this.drawGlyph(ctx, this.dot, this.dot.xB, y, 0, sx, sy, 1);
    }
  }

  // point le long d'une polyligne à l'abscisse curviligne s
  pointAt(cut, s) {
    const { P, L } = cut;
    s = clamp(s, 0, cut.len);
    let lo = 0, hi = L.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (L[m] < s) lo = m; else hi = m;
    }
    const f = (s - L[lo]) / Math.max(1e-6, L[hi] - L[lo]);
    return [mix(P[lo][0], P[hi][0], f), mix(P[lo][1], P[hi][1], f)];
  }

  strokePartial(ctx, cut, s0, s1) {
    const { P, L } = cut;
    ctx.beginPath();
    let started = false;
    const a = this.pointAt(cut, s0);
    ctx.moveTo(a[0], a[1]);
    for (let i = 0; i < P.length; i++) {
      if (L[i] <= s0) continue;
      if (L[i] >= s1) break;
      ctx.lineTo(P[i][0], P[i][1]);
      started = true;
    }
    const b = this.pointAt(cut, s1);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    return started;
  }

  drawCut(ctx, t) {
    const { lctx, S, FS, baseY } = this;
    // 1. couche texte « Exprnc. » au repos
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, this.W, this.H);
    lctx.font = this.fontStr;
    lctx.letterSpacing = '0px';
    for (const g of this.glyphs) if (!g.vowel) this.drawGlyph(lctx, g, g.xB, baseY);
    this.drawGlyph(lctx, this.dot, this.dot.xB, baseY);

    // 2. découpe progressive (gomme le long du tracé)
    const prog = [
      E.inOutCubic(remap(t, CUES.cut1, CUES.cut1 + 0.38)),
      E.inOutCubic(remap(t, CUES.cut2, CUES.cut2 + 0.38)),
    ];
    const sep = E.outCubic(remap(t, 3.79, 3.93));
    lctx.globalCompositeOperation = 'destination-out';
    lctx.lineCap = 'round';
    lctx.lineJoin = 'round';
    lctx.lineWidth = (2.2 + 3.5 * sep) * S;
    this.cuts.forEach((c, i) => {
      if (prog[i] > 0) this.strokePartial(lctx, c, 0, prog[i] * c.len);
    });
    lctx.globalCompositeOperation = 'source-over';

    // 3. trois morceaux : écartement puis chute
    const parts = [
      { dx: -15 * S, dy: 2 * S, rot: -0.03, fall: 3.93, dir: -1 },
      { dx: 0, dy: -9 * S, rot: 0.012, fall: 3.89, dir: 1 },
      { dx: 15 * S, dy: 3 * S, rot: 0.035, fall: 3.96, dir: 1 },
    ];
    parts.forEach((p, i) => {
      const tau = Math.max(0, t - p.fall);
      const dx = p.dx * sep + p.dir * 80 * S * tau;
      const dy = p.dy * sep + 260 * S * tau + 0.5 * 9800 * S * tau * tau;
      const rot = p.rot * sep + p.dir * (0.5 * tau + 2.6 * tau * tau);
      const [px, py] = this.partPivots[i];
      ctx.save();
      ctx.translate(px + dx, py + dy);
      ctx.rotate(rot);
      ctx.translate(-px, -py);
      ctx.clip(this.regions[i]);
      ctx.drawImage(this.layer, 0, 0);
      ctx.restore();
    });

    // 4. étincelle qui « découpe » + traîne lumineuse
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.cuts.forEach((c, i) => {
      const p = prog[i];
      const t0 = i ? CUES.cut2 : CUES.cut1;
      if (p <= 0) return;
      const head = p * c.len;
      // traîne
      const trail = 140 * S;
      ctx.lineCap = 'round';
      for (let k = 0; k < 14; k++) {
        const a = head - (trail * (k + 1)) / 14;
        const b = head - (trail * k) / 14;
        if (b <= 0) continue;
        const alpha = (1 - k / 14) ** 2 * (p < 1 ? 1 : Math.max(0, 1 - (t - t0 - 0.38) * 6));
        if (alpha <= 0.002) continue;
        ctx.strokeStyle = `rgba(255,214,170,${0.55 * alpha})`;
        ctx.lineWidth = 2.4 * S;
        this.strokePartial(ctx, c, Math.max(0, a), b);
      }
      // lueur résiduelle sur tout le tracé, qui s'éteint
      const residual = Math.max(0, 1 - (t - t0) / 0.55) * 0.22 * (1 - sep);
      if (residual > 0.003) {
        ctx.strokeStyle = `rgba(255,200,150,${residual})`;
        ctx.lineWidth = 1.6 * S;
        this.strokePartial(ctx, c, 0, head);
      }
      // tête de l'étincelle
      if (p < 1) {
        const [hx, hy] = this.pointAt(c, head);
        const R = 34 * S;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, R);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.12, 'rgba(255,240,215,0.95)');
        g.addColorStop(0.35, 'rgba(255,180,110,0.35)');
        g.addColorStop(1, 'rgba(255,150,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hx, hy, R, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }
}
