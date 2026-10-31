// ---------------------------------------------------------------------------
// Timeline globale + utilitaires d'animation (tout est déterministe : f(t))
// Film « Exprnc. » — POV onirique : porte -> 4 visions -> puzzle -> logo
// ---------------------------------------------------------------------------
export const FPS = 30;
export const DURATION = 23;
export const FRAMES = FPS * DURATION;
export const SHUTTER = 0.5; // obturateur 180° pour le flou de mouvement

// Moments clés (secondes) — lus aussi par le sound design (prep/sound.py)
export const CUES = {
  doorOpen: 0.7,
  threshold: 2.1,
  v1: [2.35, 5.05],
  v2: [5.25, 7.95],
  v3: [8.15, 10.85],
  v4: [11.05, 13.75],
  stumble: 14.25,
  lookDown: 14.6,
  pick1: [15.15, 16.45],
  pick2: [16.6, 17.75],
  pick3: [17.9, 19.0],
  press: 19.25,
  stepBack: 19.45,
  sweep: 20.0,
  tagline: 20.35,
};
export const VISIONS = [CUES.v1, CUES.v2, CUES.v3, CUES.v4];
export const PICKS = [CUES.pick1, CUES.pick2, CUES.pick3];
export const WALK_SPEED = 1.45; // m/s

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const remap = (t, a, b) => clamp((t - a) / (b - a));
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const E = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  smoother: (t) => t * t * t * (t * (t * 6 - 15) + 10),
};

// Courbe d'accélération façon CSS cubic-bezier(x1, y1, x2, y2)
export function bezierEase(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      const d = dx(t);
      if (Math.abs(e) < 1e-6) break;
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    t = clamp(t);
    // bisection de secours
    let lo = 0, hi = 1;
    for (let i = 0; i < 20 && Math.abs(sx(t) - x) > 1e-5; i++) {
      if (sx(t) > x) hi = t; else lo = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

// Réponse indicielle d'un ressort amorti (0 -> 1, avec dépassement)
export function spring(t, freq = 2.0, damp = 0.55) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const z = damp;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

// Générateur pseudo-aléatoire déterministe
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bruit 1D lisse (value noise) pour les tremblements de caméra
export function noise1(x, seed = 0) {
  const h = (n) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return mix(h(i), h(i + 1), u) * 2 - 1;
}

// Nombre de sous-images (flou de mouvement) selon l'intensité du mouvement
export function samplesAt(t) {
  const near = (a, w) => Math.abs(t - a) < w;
  if (t >= 1.6 && t < 2.5) return 7;
  for (const [a, b] of VISIONS) if (near(a, 0.45) || near(b, 0.45)) return 8;
  if (t >= 14.15 && t < 14.9) return 10;
  if (t >= 15.1 && t < 19.5) return 8;
  if (t >= 19.5) return 4;
  return 5;
}

// Interpolation cubique monotone (Fritsch-Carlson) : trajectoires C1 sans dépassement
export function monotoneCubic(xs, ys, x, startSlopeFactor = 0) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array(n).fill(0);
  m[0] = d[0] * startSlopeFactor;
  m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  let k = 0;
  while (x > xs[k + 1]) k++;
  const hh = xs[k + 1] - xs[k];
  const t = (x - xs[k]) / hh;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * hh * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * hh * m[k + 1];
}
