// ---------------------------------------------------------------------------
// Textures procédurales (Canvas 2D) pour les visions
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { rng } from '../timeline.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function roundRect(x, X, Y, W, H, R) {
  x.beginPath();
  x.moveTo(X + R, Y);
  x.arcTo(X + W, Y, X + W, Y + H, R);
  x.arcTo(X + W, Y + H, X, Y + H, R);
  x.arcTo(X, Y + H, X, Y, R);
  x.arcTo(X, Y, X + W, Y, R);
  x.closePath();
}

// ------------------------------------------------------------------ enseignes de cartes
export function suitPath(suit) {
  const p = new Path2D();
  if (suit === 'h') {
    p.moveTo(0, 0.95);
    p.bezierCurveTo(-1.5, -0.05, -0.62, -1.15, 0, -0.42);
    p.bezierCurveTo(0.62, -1.15, 1.5, -0.05, 0, 0.95);
  } else if (suit === 'd') {
    p.moveTo(0, -1);
    p.quadraticCurveTo(0.35, -0.4, 0.75, 0);
    p.quadraticCurveTo(0.35, 0.4, 0, 1);
    p.quadraticCurveTo(-0.35, 0.4, -0.75, 0);
    p.quadraticCurveTo(-0.35, -0.4, 0, -1);
  } else if (suit === 's') {
    p.moveTo(0, -1);
    p.bezierCurveTo(1.5, 0.0, 0.62, 0.95, 0.08, 0.42);
    p.quadraticCurveTo(0.1, 0.8, 0.38, 1.0);
    p.lineTo(-0.38, 1.0);
    p.quadraticCurveTo(-0.1, 0.8, -0.08, 0.42);
    p.bezierCurveTo(-0.62, 0.95, -1.5, 0.0, 0, -1);
  } else {
    p.arc(0, -0.5, 0.42, 0, Math.PI * 2);
    p.moveTo(0.95, 0.12);
    p.arc(0.5, 0.12, 0.42, 0, Math.PI * 2);
    p.moveTo(-0.08, 0.12);
    p.arc(-0.5, 0.12, 0.42, 0, Math.PI * 2);
    p.moveTo(0.12, 0.2);
    p.quadraticCurveTo(0.12, 0.8, 0.4, 1.0);
    p.lineTo(-0.4, 1.0);
    p.quadraticCurveTo(-0.12, 0.8, -0.12, 0.2);
  }
  return p;
}
function drawSuit(x, suit, cx, cy, s, rot = 0) {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(s, s);
  x.fill(suitPath(suit));
  x.restore();
}

export function cardFace(rank, suit) {
  const [c, x] = canvas(512, 716);
  roundRect(x, 4, 4, 504, 708, 38);
  x.fillStyle = '#f6f2ea';
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.12)';
  x.lineWidth = 4;
  x.stroke();
  const red = suit === 'h' || suit === 'd';
  const col = red ? '#c3142e' : '#141414';
  x.fillStyle = col;
  x.textAlign = 'center';
  x.font = '800 92px Mont800';
  x.fillText(rank, 62, 110);
  drawSuit(x, suit, 62, 160, 30);
  x.save();
  x.translate(512, 716);
  x.rotate(Math.PI);
  x.fillText(rank, 62, 110);
  drawSuit(x, suit, 62, 160, 30);
  x.restore();
  if (rank === 'A') drawSuit(x, suit, 256, 358, 120);
  else {
    x.strokeStyle = col;
    x.lineWidth = 6;
    roundRect(x, 112, 150, 288, 416, 18);
    x.stroke();
    x.font = '900 230px Mont900';
    x.fillText(rank, 256, 440);
    drawSuit(x, suit, 256, 520, 34);
  }
  return tex(c);
}

export function cardBack() {
  const [c, x] = canvas(512, 716);
  roundRect(x, 4, 4, 504, 708, 38);
  x.fillStyle = '#f6f2ea';
  x.fill();
  roundRect(x, 30, 30, 452, 656, 24);
  x.fillStyle = '#8f0f22';
  x.fill();
  x.save();
  x.clip();
  x.strokeStyle = 'rgba(255,215,160,0.35)';
  x.lineWidth = 3;
  for (let i = -720; i < 720; i += 34) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 716, 716);
    x.stroke();
    x.beginPath();
    x.moveTo(i + 716, 0);
    x.lineTo(i, 716);
    x.stroke();
  }
  x.restore();
  x.strokeStyle = '#d9b26a';
  x.lineWidth = 6;
  roundRect(x, 48, 48, 416, 620, 18);
  x.stroke();
  x.beginPath();
  x.arc(256, 358, 88, 0, Math.PI * 2);
  x.fillStyle = '#8f0f22';
  x.fill();
  x.stroke();
  x.fillStyle = '#e9c98a';
  x.textAlign = 'center';
  x.font = '900 110px Mont900';
  x.fillText('E', 256, 398);
  return tex(c);
}

// ------------------------------------------------------------------ jetons de casino
export function chipTextures(base, accent = '#ffffff') {
  const [c, x] = canvas(512, 512);
  x.fillStyle = base;
  x.beginPath();
  x.arc(256, 256, 256, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = accent;
  for (let i = 0; i < 8; i++) {
    x.save();
    x.translate(256, 256);
    x.rotate((i / 8) * Math.PI * 2);
    x.fillRect(-26, -256, 52, 64);
    x.restore();
  }
  x.strokeStyle = accent;
  x.lineWidth = 8;
  x.setLineDash([22, 16]);
  x.beginPath();
  x.arc(256, 256, 158, 0, Math.PI * 2);
  x.stroke();
  x.setLineDash([]);
  x.beginPath();
  x.arc(256, 256, 128, 0, Math.PI * 2);
  x.fillStyle = 'rgba(255,255,255,0.12)';
  x.fill();
  x.fillStyle = accent;
  x.textAlign = 'center';
  x.font = '900 120px Mont900';
  x.fillText('E', 256, 298);
  const [c2, y] = canvas(512, 32);
  y.fillStyle = base;
  y.fillRect(0, 0, 512, 32);
  y.fillStyle = accent;
  for (let i = 0; i < 8; i++) y.fillRect(i * 64 + 20, 0, 24, 32);
  return { face: tex(c), side: tex(c2) };
}

// ------------------------------------------------------------------ roulette
export function rouletteTexture() {
  const [c, x] = canvas(1024, 1024);
  const C = 512;
  const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  // fond bois
  const wood = x.createRadialGradient(C, C, 0, C, C, C);
  wood.addColorStop(0, '#3a2412');
  wood.addColorStop(1, '#1d1007');
  x.fillStyle = wood;
  x.fillRect(0, 0, 1024, 1024);
  const n = order.length;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const num = order[i];
    x.beginPath();
    x.arc(C, C, 500, a0, a1);
    x.arc(C, C, 330, a1, a0, true);
    x.closePath();
    x.fillStyle = num === 0 ? '#0e7a3e' : reds.has(num) ? '#b5122b' : '#121212';
    x.fill();
    x.save();
    x.translate(C, C);
    x.rotate((a0 + a1) / 2 + Math.PI / 2);
    x.fillStyle = '#f3e7c9';
    x.textAlign = 'center';
    x.font = '800 40px Mont800';
    x.fillText(String(num), 0, -440);
    x.restore();
  }
  x.strokeStyle = '#d8b35f';
  x.lineWidth = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    x.beginPath();
    x.moveTo(C + Math.cos(a) * 330, C + Math.sin(a) * 330);
    x.lineTo(C + Math.cos(a) * 500, C + Math.sin(a) * 500);
    x.stroke();
  }
  x.lineWidth = 10;
  for (const r of [330, 500, 400]) {
    x.beginPath();
    x.arc(C, C, r, 0, Math.PI * 2);
    x.stroke();
  }
  // cône central doré
  const g = x.createRadialGradient(C - 60, C - 60, 10, C, C, 330);
  g.addColorStop(0, '#f6dc9b');
  g.addColorStop(0.5, '#a97a2c');
  g.addColorStop(1, '#4a3011');
  x.fillStyle = g;
  x.beginPath();
  x.arc(C, C, 322, 0, Math.PI * 2);
  x.fill();
  return tex(c);
}

// ------------------------------------------------------------------ dés
export function dieFaces() {
  const pips = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
  };
  return [1, 6, 2, 5, 3, 4].map((n) => {
    const [c, x] = canvas(256, 256);
    x.fillStyle = '#c4102a';
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#fbf6ee';
    for (const [u, v] of pips[n]) {
      x.beginPath();
      x.arc(u * 256, v * 256, 21, 0, Math.PI * 2);
      x.fill();
    }
    return tex(c);
  });
}

// ------------------------------------------------------------------ minuteur d'escape game (7 segments)
const SEG = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};
function drawDigit(x, d, X, Y, w, h, on, off) {
  const t = w * 0.18;
  const seg = {
    a: [X + t, Y, w - 2 * t, t],
    d: [X + t, Y + h - t, w - 2 * t, t],
    g: [X + t, Y + h / 2 - t / 2, w - 2 * t, t],
    f: [X, Y + t, t, h / 2 - 1.5 * t],
    b: [X + w - t, Y + t, t, h / 2 - 1.5 * t],
    e: [X, Y + h / 2 + t / 2, t, h / 2 - 1.5 * t],
    c: [X + w - t, Y + h / 2 + t / 2, t, h / 2 - 1.5 * t],
  };
  for (const k of 'abcdefg') {
    x.fillStyle = SEG[d].includes(k) ? on : off;
    const [a, b, cw, ch] = seg[k];
    x.fillRect(a + 2, b + 2, cw - 4, ch - 4);
  }
}
export class TimerTexture {
  constructor() {
    [this.c, this.x] = canvas(1024, 256);
    this.texture = tex(this.c);
    this.last = '';
  }
  set(str) {
    if (str === this.last) return;
    this.last = str;
    const x = this.x;
    x.clearRect(0, 0, 1024, 256);
    x.fillStyle = 'rgba(20,0,0,0.85)';
    roundRect(x, 6, 6, 1012, 244, 26);
    x.fill();
    let X = 70;
    for (const ch of str) {
      if (ch === ':') {
        x.fillStyle = '#ff2a3a';
        x.fillRect(X + 8, 90, 20, 20);
        x.fillRect(X + 8, 150, 20, 20);
        X += 44;
      } else {
        x.shadowColor = '#ff1a2e';
        x.shadowBlur = 18;
        drawDigit(x, +ch, X, 40, 100, 176, '#ff3346', 'rgba(255,40,60,0.07)');
        x.shadowBlur = 0;
        X += 124;
      }
    }
    this.texture.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ pellicule
export function filmStripTexture(seed = 3) {
  const [c, x] = canvas(1024, 256);
  const r = rng(seed);
  x.fillStyle = '#0c0b0a';
  x.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 4; i++) {
    const X = i * 256 + 18;
    const g = x.createLinearGradient(X, 40, X + 220, 216);
    const hue = [28, 200, 12, 330][(i + seed) % 4];
    g.addColorStop(0, `hsl(${hue},45%,${30 + r() * 20}%)`);
    g.addColorStop(1, `hsl(${hue + 20},35%,${10 + r() * 10}%)`);
    x.fillStyle = g;
    x.fillRect(X, 44, 220, 168);
    // silhouette dans chaque image
    x.fillStyle = 'rgba(0,0,0,0.75)';
    const sx = X + 60 + r() * 100;
    x.beginPath();
    x.arc(sx, 120, 18, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(sx - 38, 212);
    x.quadraticCurveTo(sx - 34, 142, sx, 140);
    x.quadraticCurveTo(sx + 34, 142, sx + 38, 212);
    x.fill();
  }
  // perforations (transparentes)
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16; i++) {
    roundRect(x, i * 64 + 18, 10, 28, 20, 5);
    x.fill();
    roundRect(x, i * 64 + 18, 226, 28, 20, 5);
    x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------ clap de cinéma
export function slateTexture() {
  const [c, x] = canvas(1024, 820);
  x.fillStyle = '#121212';
  x.fillRect(0, 0, 1024, 820);
  x.strokeStyle = '#efe9dc';
  x.lineWidth = 6;
  x.strokeRect(30, 30, 964, 760);
  x.beginPath();
  x.moveTo(30, 300);
  x.lineTo(994, 300);
  x.moveTo(30, 520);
  x.lineTo(994, 520);
  x.moveTo(512, 300);
  x.lineTo(512, 790);
  x.stroke();
  x.fillStyle = '#efe9dc';
  x.font = '900 120px Mont900';
  x.textAlign = 'center';
  x.fillText('MURDER PARTY', 512, 210);
  x.font = '600 44px Mont600';
  x.textAlign = 'left';
  x.fillText('SCÈNE', 60, 360);
  x.fillText('PRISE', 542, 360);
  x.fillText('RÉAL.', 60, 580);
  x.fillText('LIEU', 542, 580);
  x.font = '900 120px Mont900';
  x.fillText('7', 200, 480);
  x.fillText('3', 700, 480);
  x.font = '800 64px Mont800';
  x.fillText('EXPRNC.', 60, 700);
  x.fillText('FESTIVAL', 542, 700);
  return tex(c);
}
export function clapStripes() {
  const [c, x] = canvas(1024, 160);
  x.fillStyle = '#f2efe8';
  x.fillRect(0, 0, 1024, 160);
  x.fillStyle = '#111';
  for (let i = -2; i < 12; i++) {
    x.beginPath();
    x.moveTo(i * 128, 160);
    x.lineTo(i * 128 + 64, 160);
    x.lineTo(i * 128 + 64 + 80, 0);
    x.lineTo(i * 128 + 80, 0);
    x.fill();
  }
  return tex(c);
}

// ------------------------------------------------------------------ contour à la craie (progression encodée dans R)
export function chalkOutlineTexture() {
  const [c, x] = canvas(1024, 1024);
  x.clearRect(0, 0, 1024, 1024);
  const P = [
    [512, 120], [560, 130], [585, 175], [578, 225], [548, 258], [600, 285], [690, 250], [800, 200], [830, 230], [720, 320],
    [640, 360], [640, 480], [660, 600], [740, 760], [770, 880], [725, 900], [650, 780], [560, 640], [512, 610], [470, 640],
    [400, 790], [330, 910], [285, 890], [330, 760], [380, 600], [395, 480], [390, 360], [300, 330], [190, 300], [180, 260],
    [300, 255], [430, 285], [476, 258], [446, 225], [440, 175], [465, 130], [512, 120],
  ];
  // lissage Catmull-Rom
  const pts = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 12; k++) {
      const t = k / 12, t2 = t * t, t3 = t2 * t;
      const f = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(P[P.length - 1]);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.lineWidth = 13;
  for (let i = 1; i < pts.length; i++) {
    const v = Math.round((i / pts.length) * 255);
    x.strokeStyle = `rgb(${v},255,255)`;
    x.beginPath();
    x.moveTo(pts[i - 1][0], pts[i - 1][1]);
    x.lineTo(pts[i][0], pts[i][1]);
    x.stroke();
  }
  const t = tex(c, false);
  return t;
}

// ------------------------------------------------------------------ marqueurs de preuve
export function markerTexture(n) {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#f2c230';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#111';
  x.textAlign = 'center';
  x.font = '900 170px Mont900';
  x.fillText(String(n), 128, 192);
  return tex(c);
}

// ------------------------------------------------------------------ empreinte digitale
export function fingerprintTexture() {
  const [c, x] = canvas(1024, 1024);
  const r = rng(17);
  x.clearRect(0, 0, 1024, 1024);
  x.strokeStyle = '#ffffff';
  x.lineCap = 'round';
  for (let k = 0; k < 34; k++) {
    const rad = 26 + k * 13;
    x.lineWidth = 5.5;
    let a = 0;
    while (a < Math.PI * 2) {
      const len = 0.4 + r() * 1.6;
      const a1 = Math.min(Math.PI * 2, a + len);
      x.beginPath();
      for (let s = 0; s <= 24; s++) {
        const aa = a + ((a1 - a) * s) / 24;
        const wob = Math.sin(aa * 3 + k * 0.4) * 8 + Math.sin(aa * 7 + k) * 3;
        const rr = rad + wob;
        const px = 512 + Math.cos(aa) * rr * 0.78;
        const py = 540 + Math.sin(aa) * rr * (aa > Math.PI ? 1.18 : 1.0);
        s ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke();
      a = a1 + 0.06 + r() * 0.12;
    }
  }
  // masque ovale
  x.globalCompositeOperation = 'destination-in';
  const g = x.createRadialGradient(512, 520, 200, 512, 520, 470);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 1024);
  x.globalCompositeOperation = 'source-over';
  return tex(c);
}

// ------------------------------------------------------------------ documents confidentiels
export function documentTexture(seed) {
  const [c, x] = canvas(512, 724);
  const r = rng(seed);
  x.fillStyle = '#ede8dd';
  x.fillRect(0, 0, 512, 724);
  x.fillStyle = '#1a1a1a';
  x.font = '800 30px Mont800';
  x.fillText('DOSSIER N° ' + (100 + Math.floor(r() * 899)), 40, 70);
  x.fillStyle = '#2b2b2b';
  // photo
  x.fillStyle = '#9c9a95';
  x.fillRect(330, 100, 140, 170);
  x.fillStyle = '#2a2a2a';
  x.beginPath();
  x.arc(400, 165, 32, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(340, 270);
  x.quadraticCurveTo(345, 205, 400, 202);
  x.quadraticCurveTo(455, 205, 460, 270);
  x.fill();
  // lignes de texte et caviardage
  let y = 120;
  while (y < 690) {
    const w = 120 + r() * 160;
    const red = r() < 0.3;
    x.fillStyle = red ? '#0d0d0d' : '#8c8880';
    x.fillRect(40, y, (y < 290 ? Math.min(w, 260) : w + 120) * (red ? 1 : 1), red ? 20 : 9);
    y += red ? 34 : 26;
  }
  // tampon
  x.save();
  x.translate(250, 520);
  x.rotate(-0.28);
  x.strokeStyle = 'rgba(200,20,30,0.9)';
  x.lineWidth = 8;
  x.strokeRect(-190, -48, 380, 96);
  x.fillStyle = 'rgba(200,20,30,0.9)';
  x.font = '900 52px Mont900';
  x.textAlign = 'center';
  x.fillText('CONFIDENTIEL', 0, 18);
  x.restore();
  return tex(c);
}

// ------------------------------------------------------------------ silhouettes humaines
export function silhouetteTexture(variant = 0, glow = false) {
  const [c, x] = canvas(512, 1024);
  x.clearRect(0, 0, 512, 1024);
  if (glow) x.filter = 'blur(14px)';
  x.fillStyle = glow ? '#ffffff' : '#040405';
  // tête + cou
  x.beginPath();
  x.ellipse(256, 178, 56, 68, 0, 0, Math.PI * 2);
  x.fill();
  x.fillRect(234, 230, 44, 50);
  if (variant === 1) {
    // chapeau (fedora)
    x.beginPath();
    x.ellipse(256, 130, 104, 15, 0, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(196, 132);
    x.quadraticCurveTo(196, 70, 230, 66);
    x.quadraticCurveTo(256, 82, 282, 66);
    x.quadraticCurveTo(316, 70, 316, 132);
    x.closePath();
    x.fill();
  }
  // buste, épaules, bras séparés du torse
  x.beginPath();
  x.moveTo(228, 266);
  x.bezierCurveTo(200, 282, 150, 285, 118, 312);
  x.bezierCurveTo(92, 334, 86, 372, 84, 420);
  x.lineTo(70, 700);
  x.quadraticCurveTo(72, 732, 94, 736);
  x.lineTo(114, 730);
  x.lineTo(126, 474);
  x.lineTo(136, 474);
  x.lineTo(142, 1024);
  x.lineTo(370, 1024);
  x.lineTo(376, 474);
  x.lineTo(386, 474);
  x.lineTo(398, 730);
  x.lineTo(418, 736);
  x.quadraticCurveTo(440, 732, 442, 700);
  x.lineTo(428, 420);
  x.bezierCurveTo(426, 372, 420, 334, 394, 312);
  x.bezierCurveTo(362, 285, 312, 282, 284, 266);
  x.closePath();
  x.fill();
  x.filter = 'none';
  // fondu vers le bas
  x.globalCompositeOperation = 'destination-in';
  const g = x.createLinearGradient(0, 700, 0, 1024);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 1024);
  x.globalCompositeOperation = 'source-over';
  return tex(c);
}

// ------------------------------------------------------------------ rondelles d'agrumes
export function citrusTexture(kind) {
  const [c, x] = canvas(512, 512);
  const col = { lemon: ['#f7e04a', '#fff5b0', '#f1c21b'], lime: ['#8fd14f', '#d9f5b5', '#4f9a2a'], orange: ['#ff9a2e', '#ffd9a6', '#e8711a'] }[kind];
  x.fillStyle = col[2];
  x.beginPath();
  x.arc(256, 256, 256, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = col[1];
  x.beginPath();
  x.arc(256, 256, 226, 0, Math.PI * 2);
  x.fill();
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2 + 0.05, a1 = ((i + 1) / 10) * Math.PI * 2 - 0.05;
    const g = x.createRadialGradient(256, 256, 20, 256, 256, 210);
    g.addColorStop(0, col[1]);
    g.addColorStop(1, col[0]);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(256 + Math.cos((a0 + a1) / 2) * 22, 256 + Math.sin((a0 + a1) / 2) * 22);
    x.arc(256, 256, 206, a0, a1);
    x.closePath();
    x.fill();
  }
  return tex(c);
}

// ------------------------------------------------------------------ bruit (sol, poussières)
export function noiseTexture(size = 256, seed = 4) {
  const [c, x] = canvas(size, size);
  const img = x.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (r() - 0.5) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
