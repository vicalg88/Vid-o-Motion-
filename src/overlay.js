// ---------------------------------------------------------------------------
// Calque 2D au-dessus de la 3D : signature finale sous le logo.
// ---------------------------------------------------------------------------
import { E, CUES, remap } from './timeline.js';

export const TAGLINE = "L'EXPÉRIENCE, PIÈCE PAR PIÈCE.";

export class Overlay {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.S = this.W / 1920;
    const ctx = this.ctx;
    this.fs = 31 * this.S;
    this.ls = 0.36 * this.fs;
    ctx.font = `600 ${this.fs}px Mont600`;
    ctx.letterSpacing = `${this.ls}px`;
    this.xs = [];
    for (let i = 0; i <= TAGLINE.length; i++) this.xs.push(ctx.measureText(TAGLINE.slice(0, i)).width);
    this.w = this.xs[TAGLINE.length] - this.ls;
    this.x0 = this.W / 2 - this.w / 2;
    this.y = 792 * this.S;
  }

  draw(t) {
    const { ctx, S } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    if (t < CUES.tagline) return;
    ctx.font = `600 ${this.fs}px Mont600`;
    ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic';
    const n = TAGLINE.length;
    for (let i = 0; i < n; i++) {
      const ch = TAGLINE[i];
      if (ch === ' ') continue;
      // révélation depuis le centre vers l'extérieur
      const centerDist = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
      const t0 = CUES.tagline + centerDist * 0.32;
      const u = remap(t, t0, t0 + 0.6);
      if (u <= 0) continue;
      const a = E.outCubic(u);
      const dy = (1 - E.outQuart(u)) * 16 * S;
      ctx.fillStyle = `rgba(236,233,226,${0.86 * a})`;
      ctx.fillText(ch, this.x0 + this.xs[i], this.y + dy);
    }
    // fin filet décoratif
    const lu = E.inOutCubic(remap(t, CUES.tagline + 0.15, CUES.tagline + 0.9));
    if (lu > 0) {
      const lw = 64 * S * lu;
      ctx.fillStyle = `rgba(236,233,226,${0.45 * lu})`;
      ctx.fillRect(this.W / 2 - lw / 2, this.y + 30 * S, lw, 1.5 * S);
    }
  }
}
