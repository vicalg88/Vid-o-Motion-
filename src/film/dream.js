// ---------------------------------------------------------------------------
// Outils « rêve » : dissolution des souvenirs, étiquettes, rubans, particules
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { smoothstep, rng, mix } from '../timeline.js';

export const NOISE_GLSL = /* glsl */ `
float dHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

// Uniformes partagés par tous les matériaux d'une vision
export function visionUniforms(edgeColor) {
  return { uReveal: { value: 0 }, uEdge: { value: new THREE.Color(edgeColor) } };
}

// Courbe d'apparition / disparition d'une vision
export function revealAt(t, [a, b], fin = 0.6, fout = 0.55) {
  return smoothstep(a - 0.2, a - 0.2 + fin, t) * (1 - smoothstep(b - fout + 0.1, b + 0.1, t));
}

/**
 * Ajoute à un matériau three.js :
 *  - une dissolution par bruit 3D (le souvenir se matérialise avec des bords lumineux)
 *  - optionnellement un liseré de Fresnel (rim)
 */
export function dreamify(mat, U, opts = {}) {
  const rim = opts.rim || 0;
  const rimColor = new THREE.Color(opts.rimColor || U.uEdge.value);
  const scale = opts.noiseScale || 2.3;
  const lit = !!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial || mat.isMeshLambertMaterial);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uReveal = U.uReveal;
    sh.uniforms.uEdge = U.uEdge;
    sh.uniforms.uRimColor = { value: rimColor };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDreamW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n vDreamW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    let fs = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDreamW;\nuniform float uReveal;\nuniform vec3 uEdge;\nuniform vec3 uRimColor;\n' + NOISE_GLSL)
      .replace(
        'void main() {',
        `void main() {
  float dn = dNoise( vDreamW * ${scale.toFixed(2)} ) * 0.62 + dNoise( vDreamW * ${(scale * 3.4).toFixed(2)} + 7.1 ) * 0.38;
  float dth = 1.03 - uReveal * 1.06;
  if ( dn < dth ) discard;
  float dEdge = ( 1.0 - smoothstep( 0.0, 0.07, dn - dth ) ) * step( 0.0005, 1.0 - uReveal );`
      );
    let add = 'gl_FragColor.rgb += uEdge * dEdge * 5.0;';
    if (rim && lit) add += `\n  float dRim = pow( 1.0 - clamp( abs( dot( normal, normalize( vViewPosition ) ) ), 0.0, 1.0 ), 2.6 );\n  gl_FragColor.rgb += uRimColor * dRim * ${rim.toFixed(2)};`;
    fs = fs.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  ' + add);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `dream-${rim}-${scale}-${lit}`;
  return mat;
}

// ---------------------------------------------------------------------------
// Ruban le long d'une courbe (pellicule, tapis rouge, coulée de liquide)
export function ribbonGeometry(curve, width, segments, twist = 0) {
  const frames = curve.computeFrenetFrames(segments, false);
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  const len = curve.getLength();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = curve.getPointAt(u);
    const n = frames.normals[i].clone();
    const b = frames.binormals[i].clone();
    if (twist) {
      const a = twist * u;
      const nb = b.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a));
      n.multiplyScalar(Math.cos(a)).addScaledVector(b, -Math.sin(a));
      b.copy(nb);
    }
    for (let s = 0; s < 2; s++) {
      const sg = s ? 0.5 : -0.5;
      pos.push(p.x + b.x * width * sg, p.y + b.y * width * sg, p.z + b.z * width * sg);
      nor.push(n.x, n.y, n.z);
      uv.push(u * len, s);
    }
    if (i < segments) {
      const a0 = i * 2;
      idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------
// Étiquette de concept (texte en 3D, se matérialise comme le reste)
export function makeLabel(U, title, subtitle, opts = {}) {
  const W = 2048;
  const H = 400;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#fff';
  const fs = opts.size || 118;
  x.font = `800 ${fs}px Mont800`;
  x.letterSpacing = `${fs * 0.16}px`;
  x.shadowColor = opts.glow || 'rgba(255,220,180,0.9)';
  x.shadowBlur = 26;
  x.fillText(title, W / 2 + fs * 0.08, 190);
  x.shadowBlur = 0;
  if (subtitle) {
    x.font = `600 ${fs * 0.36}px Mont600`;
    x.letterSpacing = `${fs * 0.36 * 0.42}px`;
    x.globalAlpha = 0.85;
    x.fillText(subtitle, W / 2 + fs * 0.07, 290);
    x.globalAlpha = 0.6;
    x.fillRect(W / 2 - 60, 225, 120, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const width = opts.width || 2.4;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(opts.color || '#fff').multiplyScalar(opts.intensity || 1.6),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  dreamify(mat, U, { noiseScale: 6 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * H) / W), mat);
  m.renderOrder = 20;
  return m;
}

// ---------------------------------------------------------------------------
// Champ de particules GPU (poussière, paillettes, bulles, flashs…)
//   mode 0 : dérive douce   1 : montée (bulles)   2 : tourbillon   3 : scintillement fixe
export class ParticleField {
  constructor({ count, box, color, colors, size = [2, 6], seed = 1, mode = 0, speed = 1, alpha = [0.3, 0.9], twinkle = 0.6, bokeh = 1, H = 1080 }) {
    const r = rng(seed);
    const P = [], C = [], S = [], PH = [], A = [];
    const pal = (colors || [color || '#ffffff']).map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      P.push(mix(box[0][0], box[1][0], r()), mix(box[0][1], box[1][1], r()), mix(box[0][2], box[1][2], r()));
      const cc = pal[Math.floor(r() * pal.length)];
      C.push(cc.r, cc.g, cc.b);
      S.push(mix(size[0], size[1], r() ** 1.6));
      PH.push(r() * 100, r(), r());
      A.push(mix(alpha[0], alpha[1], r()));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('aPh', new THREE.Float32BufferAttribute(PH, 3));
    g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(A, 1));
    this.u = {
      uTime: { value: 0 },
      uReveal: { value: 1 },
      uFocus: { value: 4 },
      uAperture: { value: 0 },
      uPx: { value: H / 1080 },
      uBoxMin: { value: new THREE.Vector3(...box[0]) },
      uBoxMax: { value: new THREE.Vector3(...box[1]) },
      uSpeed: { value: speed },
      uTwinkle: { value: twinkle },
      uBokeh: { value: bokeh },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      defines: { MODE: mode },
      vertexShader: /* glsl */ `
        uniform float uTime, uReveal, uFocus, uAperture, uPx, uSpeed, uTwinkle, uBokeh;
        uniform vec3 uBoxMin, uBoxMax;
        attribute vec3 aColor; attribute float aSize; attribute vec3 aPh; attribute float aAlpha;
        varying vec3 vCol; varying float vA; varying float vSoft;
        void main(){
          vec3 p = position;
          vec3 bs = uBoxMax - uBoxMin;
          float t = uTime * uSpeed;
          #if MODE == 0
            p += vec3(sin(t * 0.31 + aPh.x) * 0.25, sin(t * 0.23 + aPh.x * 1.7) * 0.18 + t * 0.05 * (aPh.y - 0.3), cos(t * 0.27 + aPh.x * 0.7) * 0.25);
          #elif MODE == 1
            p.y = uBoxMin.y + mod(p.y - uBoxMin.y + t * (0.25 + 0.5 * aPh.y), bs.y);
            p.x += sin(t * 2.0 + aPh.x) * 0.03;
          #elif MODE == 2
            vec3 c = (uBoxMin + uBoxMax) * 0.5;
            vec2 dd = p.xz - c.xz;
            float a = t * (0.25 + 0.35 * aPh.y) ;
            p.xz = c.xz + mat2(cos(a), -sin(a), sin(a), cos(a)) * dd;
            p.y += sin(t * 0.7 + aPh.x) * 0.12;
          #endif
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = max(0.05, -mv.z);
          float sz = max(1.2, aSize * uPx * (3.0 / d));
          float coc = uAperture * abs(d - uFocus) / d * uPx * uBokeh;
          float s = max(sz, coc * 2.0);
          float tw = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (3.0 + 5.0 * aPh.z) + aPh.x * 6.28));
          vA = aAlpha * uReveal * tw * (sz * sz) / (s * s);
          vSoft = clamp((s - sz) / (sz * 2.0 + 1.0), 0.0, 1.0);
          vCol = aColor;
          gl_PointSize = s;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA; varying float vSoft;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c) * 2.0;
          float disc = smoothstep(1.0, 0.7, r) * (0.8 + 0.2 * r);
          float g = exp(-r * r * 4.5);
          float m = mix(g, disc, vSoft);
          float a = m * vA;
          if (a < 0.0015) discard;
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
  }
  update(t, reveal, focus, aperture) {
    this.u.uTime.value = t;
    this.u.uReveal.value = reveal;
    this.u.uFocus.value = focus;
    this.u.uAperture.value = aperture;
  }
}

// Petit utilitaire : fond « lueur » additive derrière une vision (halo coloré dans le noir)
export function glowSprite(color, size, intensity = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(color).multiplyScalar(intensity),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.renderOrder = 2;
  return m;
}
