// ---------------------------------------------------------------------------
// ACTE 2 — Les 3 pièces du logo tombent au sol, restent éparpillées, puis
// s'assemblent toutes seules pour former le logo final (three.js).
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { E, CUES, ACT2, remap, mix, clamp, smoothstep, rng, noise1, bezierEase, monotoneCubic } from './timeline.js';

const PX = 0.01; // 1 px du logo source = 0.01 unité monde
const TH = 26; // épaisseur d'une pièce (px)
const BT = 2.4; // biseau : hauteur
const BS = 2.2; // biseau : largeur
const THW = TH * PX;
const BG = new THREE.Color('#0b0a09');

// ------------------------------------------------------------- ombres douces PCSS
const SPOT = { pos: new THREE.Vector3(-6.5, 23, -8.5), target: new THREE.Vector3(0.3, 0, 0.6), angle: 0.56, near: 14, far: 42, size: 2.2 };

function patchShadows() {
  if (THREE.ShaderChunk.__pcss) return;
  const tanHalf = Math.tan(SPOT.angle);
  const pcss = /* glsl */ `
  #define PCSS_NEAR ${SPOT.near.toFixed(3)}
  #define PCSS_FAR ${SPOT.far.toFixed(3)}
  #define PCSS_TAN ${tanHalf.toFixed(5)}
  #define PCSS_LIGHT ${SPOT.size.toFixed(3)}
  #define PCSS_BLOCKER 12
  #define PCSS_PCF 24
  float pcssLin( float z ) {
    float ndc = z * 2.0 - 1.0;
    return ( 2.0 * PCSS_NEAR * PCSS_FAR ) / ( PCSS_FAR + PCSS_NEAR - ndc * ( PCSS_FAR - PCSS_NEAR ) );
  }
  float pcssShadow( sampler2D shadowMap, vec2 mapSize, float seed, vec4 sc ) {
    vec2 uv = sc.xy;
    float zR = pcssLin( sc.z );
    float rot = fract( sin( dot( gl_FragCoord.xy + seed * 17.137, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;
    float fw = 2.0 * zR * PCSS_TAN;
    float searchUV = PCSS_LIGHT * 0.45 / fw;
    float sum = 0.0;
    float nb = 0.0;
    for ( int i = 0; i < PCSS_BLOCKER; i ++ ) {
      float r = sqrt( ( float( i ) + 0.5 ) / float( PCSS_BLOCKER ) );
      float a = float( i ) * 2.39996323 + rot;
      float d = unpackRGBAToDepth( texture2D( shadowMap, uv + vec2( cos( a ), sin( a ) ) * r * searchUV ) );
      if ( d < sc.z ) { sum += pcssLin( d ); nb += 1.0; }
    }
    if ( nb < 0.5 ) return 1.0;
    float zB = sum / nb;
    float pen = PCSS_LIGHT * ( zR - zB ) / zB;
    float fuv = max( pen / fw, 1.25 / mapSize.x );
    float lit = 0.0;
    for ( int i = 0; i < PCSS_PCF; i ++ ) {
      float r = sqrt( ( float( i ) + 0.5 ) / float( PCSS_PCF ) );
      float a = float( i ) * 2.39996323 + rot;
      lit += step( sc.z, unpackRGBAToDepth( texture2D( shadowMap, uv + vec2( cos( a ), sin( a ) ) * r * fuv ) ) );
    }
    return lit / float( PCSS_PCF );
  }
  `;
  let chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  chunk = chunk.replace('#ifdef USE_SHADOWMAP', '#ifdef USE_SHADOWMAP\n' + pcss);
  chunk = chunk.replace(
    '#if defined( SHADOWMAP_TYPE_PCF )',
    'return mix( 1.0, pcssShadow( shadowMap, shadowMapSize, shadowRadius, shadowCoord ), shadowIntensity );\n#if defined( SHADOWMAP_TYPE_PCF )'
  );
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk;
  THREE.ShaderChunk.__pcss = true;
}

// ------------------------------------------------------------- reflet balayant (shine)
const SWEEP = { uSweep: { value: -40 }, uSweepAmt: { value: 0 } };
function addSweep(mat, strength = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSweep = SWEEP.uSweep;
    sh.uniforms.uSweepAmt = SWEEP.uSweepAmt;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPosS;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWPosS = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPosS;\nuniform float uSweep;\nuniform float uSweepAmt;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float swd = ( vWPosS.x * 0.93 + vWPosS.z * 0.37 ) - uSweep;
        float band = exp( - swd * swd / 1.6 ) * 0.3 + exp( - swd * swd / 0.09 ) * 0.55;
        gl_FragColor.rgb += vec3( 1.0, 0.96, 0.9 ) * band * uSweepAmt * ${strength.toFixed(2)};`
      );
  };
  mat.customProgramCacheKey = () => 'sweep' + strength;
}

// ------------------------------------------------------------- utilitaires
function quatYaw(a) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
}
function cubicBezier3(p0, p1, p2, p3, s, out) {
  const u = 1 - s;
  out.set(0, 0, 0)
    .addScaledVector(p0, u * u * u)
    .addScaledVector(p1, 3 * u * u * s)
    .addScaledVector(p2, 3 * u * s * s)
    .addScaledVector(p3, s * s * s);
  return out;
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class Act2 {
  constructor(renderer, logo, W, H) {
    patchShadows();
    this.r = renderer;
    this.logo = logo;
    this.W = W;
    this.H = H;
    this.scene = new THREE.Scene();
    this.scene.background = BG.clone();
    this.scene.fog = new THREE.Fog(BG.clone(), 30, 80);
    this.camera = new THREE.PerspectiveCamera(34, W / H, 0.5, 300);
    const [bx0, by0, bx1, by1] = logo.stickerBBox;
    this.LCX = (bx0 + bx1) / 2;
    this.LCY = (by0 + by1) / 2;
    this.exposure = 1.0;
    this.bloomStrength = 0.4;
    this.camState = { focus: 25, aperture: 0 };
    this.buildEnv();
    this.buildTextures();
    this.buildFloor();
    this.buildPieces();
    this.buildLights();
    this.buildSeams();
    this.buildParticles();
    this.depthHidden = [this.points, ...this.seams.map((s) => s.mesh)];
  }

  // --------------------------------------------------------------- environnement
  buildEnv() {
    const pmrem = new THREE.PMREMGenerator(this.r);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.14;
    pmrem.dispose();
  }

  // --------------------------------------------------------------- textures (impression du logo)
  buildTextures() {
    const L = this.logo;
    const TW = 4096;
    const k = TW / L.width;
    const TH2 = Math.round(L.height * k);
    const c = document.createElement('canvas');
    c.width = TW;
    c.height = TH2;
    const x = c.getContext('2d');
    x.fillStyle = L.colors.cream;
    x.fillRect(0, 0, TW, TH2);
    // lettres (remplissage pair-impair)
    const p = new Path2D();
    for (const ring of L.letters) {
      ring.forEach(([px, py], i) => (i ? p.lineTo(px * k, py * k) : p.moveTo(px * k, py * k)));
      p.closePath();
    }
    x.fillStyle = '#121212';
    x.fill(p, 'evenodd');
    // lignes de découpe blanches (comme sur le logo)
    x.strokeStyle = '#ffffff';
    x.lineWidth = L.lineWidth * k;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    for (const cut of L.cuts) {
      x.beginPath();
      cut.forEach(([px, py], i) => (i ? x.lineTo(px * k, py * k) : x.moveTo(px * k, py * k)));
      x.stroke();
    }
    // grain papier très léger
    const n = document.createElement('canvas');
    n.width = n.height = 256;
    const nx = n.getContext('2d');
    const img = nx.createImageData(256, 256);
    const rr = rng(5);
    for (let i = 0; i < 256 * 256; i++) {
      const v = 128 + (rr() - 0.5) * 40;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    nx.putImageData(img, 0, 0);
    x.globalAlpha = 0.06;
    x.globalCompositeOperation = 'overlay';
    x.fillStyle = x.createPattern(n, 'repeat');
    x.fillRect(0, 0, TW, TH2);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';

    this.logoTex = new THREE.CanvasTexture(c);
    this.logoTex.colorSpace = THREE.SRGBColorSpace;
    this.logoTex.anisotropy = this.r.capabilities.getMaxAnisotropy();
    this.logoTex.generateMipmaps = true;
    this.logoTex.minFilter = THREE.LinearMipmapLinearFilter;

    // texture de sol : béton/papier sombre très subtil
    const f = document.createElement('canvas');
    f.width = f.height = 1024;
    const fx = f.getContext('2d');
    const fi = fx.createImageData(1024, 1024);
    const r2 = rng(9);
    // value-noise multi-octaves
    const grid = (s) => {
      const g = [];
      for (let i = 0; i < (s + 1) * (s + 1); i++) g.push(r2());
      return (u, v) => {
        const X = u * s, Y = v * s;
        const i = Math.floor(X), j = Math.floor(Y);
        const fu = X - i, fv = Y - j;
        const a = g[(j % s) * (s + 1) + (i % s)], b = g[(j % s) * (s + 1) + ((i + 1) % s)];
        const cc = g[((j + 1) % s) * (s + 1) + (i % s)], d = g[((j + 1) % s) * (s + 1) + ((i + 1) % s)];
        const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
        return mix(mix(a, b, su), mix(cc, d, su), sv);
      };
    };
    const o1 = grid(8), o2 = grid(32), o3 = grid(128);
    for (let y = 0; y < 1024; y++)
      for (let xx = 0; xx < 1024; xx++) {
        const u = xx / 1024, v = y / 1024;
        const val = 0.35 * o1(u, v) + 0.3 * o2(u, v) + 0.35 * o3(u, v) + (r2() - 0.5) * 0.35;
        const g = 124 + (val - 0.5) * 34;
        const i = (y * 1024 + xx) * 4;
        fi.data[i] = g * 1.0;
        fi.data[i + 1] = g * 0.985;
        fi.data[i + 2] = g * 0.965;
        fi.data[i + 3] = 255;
      }
    fx.putImageData(fi, 0, 0);
    this.floorTex = new THREE.CanvasTexture(f);
    this.floorTex.colorSpace = THREE.SRGBColorSpace;
    this.floorTex.wrapS = this.floorTex.wrapT = THREE.RepeatWrapping;
    this.floorTex.repeat.set(5, 5);
    this.floorTex.anisotropy = this.r.capabilities.getMaxAnisotropy();
  }

  // --------------------------------------------------------------- sol
  buildFloor() {
    const g = new THREE.PlaneGeometry(140, 140);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#77726b'),
      map: this.floorTex,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.5,
    });
    this.floor = new THREE.Mesh(g, m);
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  // --------------------------------------------------------------- pièces
  buildPieceGeometry(outline, cx, cy) {
    const L = this.logo;
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x - cx, -(y - cy))));
    const uvGen = {
      generateTopUV(geometry, v, a, b, c) {
        const f = (i) => new THREE.Vector2((v[i * 3] + cx) / L.width, 1 - (cy - v[i * 3 + 1]) / L.height);
        return [f(a), f(b), f(c)];
      },
      generateSideWallUV(geometry, v, a, b, c, d) {
        const P = (i) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
        const [ax, ay, az] = P(a), [bx, by, bz] = P(b), [cx2, cy2, cz] = P(c), [dx, dy, dz] = P(d);
        const s = 0.01;
        if (Math.abs(ay - by) < Math.abs(ax - bx))
          return [new THREE.Vector2(ax * s, az * s), new THREE.Vector2(bx * s, bz * s), new THREE.Vector2(cx2 * s, cz * s), new THREE.Vector2(dx * s, dz * s)];
        return [new THREE.Vector2(ay * s, az * s), new THREE.Vector2(by * s, bz * s), new THREE.Vector2(cy2 * s, cz * s), new THREE.Vector2(dy * s, dz * s)];
      },
    };
    let geo = new THREE.ExtrudeGeometry(shape, {
      depth: TH - 2 * BT,
      bevelEnabled: true,
      bevelThickness: BT,
      bevelSize: BS,
      bevelOffset: -BS,
      bevelSegments: 5,
      steps: 1,
      curveSegments: 1,
      UVGenerator: uvGen,
    });
    geo = toCreasedNormals(geo, (40 * Math.PI) / 180);
    // séparation des groupes : dessus (impression) / dessous / tranche
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const uv = geo.attributes.uv.array;
    const caps = geo.groups.find((g) => g.materialIndex === 0);
    const sides = geo.groups.find((g) => g.materialIndex === 1);
    const top = [], bot = [], side = [];
    const zMid = (TH - 2 * BT) / 2;
    for (let v = caps.start; v < caps.start + caps.count; v += 3) {
      const z = (pos[v * 3 + 2] + pos[(v + 1) * 3 + 2] + pos[(v + 2) * 3 + 2]) / 3;
      (z > zMid ? top : bot).push(v);
    }
    for (let v = sides.start; v < sides.start + sides.count; v += 3) side.push(v);
    const order = [...top, ...bot, ...side];
    const P2 = new Float32Array(order.length * 9);
    const N2 = new Float32Array(order.length * 9);
    const U2 = new Float32Array(order.length * 6);
    order.forEach((v0, ti) => {
      for (let j = 0; j < 3; j++) {
        const v = v0 + j;
        const o = (ti * 3 + j) * 3;
        P2[o] = pos[v * 3];
        P2[o + 1] = pos[v * 3 + 1];
        P2[o + 2] = pos[v * 3 + 2];
        N2[o] = nor[v * 3];
        N2[o + 1] = nor[v * 3 + 1];
        N2[o + 2] = nor[v * 3 + 2];
        U2[(ti * 3 + j) * 2] = uv[v * 2];
        U2[(ti * 3 + j) * 2 + 1] = uv[v * 2 + 1];
      }
    });
    // normales strictement planes sur le dessus et le dessous
    for (let ti = 0; ti < top.length + bot.length; ti++) {
      const nz = ti < top.length ? 1 : -1;
      for (let j = 0; j < 3; j++) {
        const o = (ti * 3 + j) * 3;
        N2[o] = 0;
        N2[o + 1] = 0;
        N2[o + 2] = nz;
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P2, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
    out.addGroup(0, top.length * 3, 0);
    out.addGroup(top.length * 3, bot.length * 3, 1);
    out.addGroup((top.length + bot.length) * 3, side.length * 3, 2);
    // extrusion selon +Y, base à y=0, centrée verticalement autour du pivot
    out.rotateX(-Math.PI / 2);
    out.translate(0, BT - TH / 2, 0);
    out.scale(PX, PX, PX);
    out.computeBoundingSphere();
    return out;
  }

  buildPieces() {
    const L = this.logo;
    const top = new THREE.MeshPhysicalMaterial({
      map: this.logoTex,
      roughness: 0.74,
      metalness: 0,
      specularIntensity: 0.4,
      envMapIntensity: 0.6,
    });
    addSweep(top, 1.0);
    const bottom = new THREE.MeshStandardMaterial({ color: new THREE.Color('#cbc4b8'), roughness: 0.92 });
    const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f4f1ea'), roughness: 0.62 });
    addSweep(edge, 0.45);
    this.materials = { top, bottom, edge };

    // positions éparpillées au sol (relatives à la position finale) + lacet
    const scatter = [
      { off: [-2.0, 1.75], yaw: 0.3, slide: [-0.18, 0.1], tumble: [0.6, 0, 1], spin: 0 },
      { off: [0.75, -2.85], yaw: -0.55, slide: [0.08, -0.16], tumble: [1, 0, -0.3], spin: 0 },
      { off: [2.15, 2.05], yaw: 0.46, slide: [0.2, 0.12], tumble: [-0.4, 0, 1], spin: 0 },
    ];
    this.pieces = L.pieces.map((pc, i) => {
      const [cx, cy] = pc.centroid;
      const geo = this.buildPieceGeometry(pc.outline, cx, cy);
      const mesh = new THREE.Mesh(geo, [top, bottom, edge]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.add(mesh);
      this.scene.add(group);
      const final = new THREE.Vector3((cx - this.LCX) * PX, THW / 2, (cy - this.LCY) * PX);
      const sc = scatter[i];
      const rest = new THREE.Vector3(final.x + sc.off[0], THW / 2, final.z + sc.off[1]);
      const piece = {
        i,
        mesh,
        group,
        cx,
        cy,
        outline: pc.outline,
        final,
        rest,
        restYaw: sc.yaw,
        slide: sc.slide,
        tumbleAxis: new THREE.Vector3(...sc.tumble).normalize(),
        land: CUES.land[i],
        lift: CUES.lift[i],
        lock: CUES.lock[i],
      };
      piece.arrive = piece.lock - 0.32;
      piece.drop = piece.lock - 0.16;
      piece.hoverH = i === 1 ? 0.6 : 1.0;
      piece.decal = this.buildDecal(pc, cx, cy);
      return piece;
    });
  }

  // ombre de contact (occlusion) sous chaque pièce
  buildDecal(pc, cx, cy) {
    const [x0, y0, x1, y1] = pc.bbox;
    const m = 70; // marge px
    const w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
    const s = 0.5;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * s);
    c.height = Math.ceil(h * s);
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, c.width, c.height);
    x.filter = `blur(${10 * s}px)`;
    x.fillStyle = '#fff';
    x.beginPath();
    pc.outline.forEach(([px, py], i) => {
      const X = (px - x0 + m) * s, Y = (py - y0 + m) * s;
      i ? x.lineTo(X, Y) : x.moveTo(X, Y);
    });
    x.closePath();
    x.fill();
    const tex = new THREE.CanvasTexture(c);
    const g = new THREE.PlaneGeometry(w * PX, h * PX);
    g.rotateX(-Math.PI / 2);
    // centre du plan -> centre bbox ; on décale pour que le pivot soit le centroïde
    g.translate(((x0 + x1) / 2 - cx) * PX, 0, ((y0 + y1) / 2 - cy) * PX);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: tex,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    return mesh;
  }

  // --------------------------------------------------------------- lumières
  buildLights() {
    const key = new THREE.SpotLight(0xfffaf3, 2.5, 0, SPOT.angle, 1.0, 0);
    key.position.copy(SPOT.pos);
    key.target.position.copy(SPOT.target);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = SPOT.near;
    key.shadow.camera.far = SPOT.far;
    key.shadow.bias = -0.00025;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 1;
    this.scene.add(key, key.target);
    this.key = key;

    const rim = new THREE.DirectionalLight(0xdde6ff, 0.4);
    rim.position.set(10, 5, -16);
    this.scene.add(rim);
    this.rim = rim;

    const fill = new THREE.HemisphereLight(0xfbf8f4, 0x0b0a09, 0.12);
    this.scene.add(fill);
  }

  // --------------------------------------------------------------- flash le long des jointures
  buildSeams() {
    const L = this.logo;
    this.seams = L.cutsInside.map((pts) => {
      const P = pts.map(([x, y]) => new THREE.Vector3((x - this.LCX) * PX, THW + 0.004, (y - this.LCY) * PX));
      const n = P.length;
      const cum = [0];
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
      const len = cum[n - 1];
      const hw = 0.13;
      const pos = new Float32Array(n * 2 * 3);
      const aS = new Float32Array(n * 2);
      const aSide = new Float32Array(n * 2);
      const idx = [];
      for (let i = 0; i < n; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
        const tx = b.x - a.x, tz = b.z - a.z;
        const tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl, nz = tx / tl;
        for (let s = 0; s < 2; s++) {
          const sg = s ? 1 : -1;
          const o = (i * 2 + s) * 3;
          pos[o] = P[i].x + nx * hw * sg;
          pos[o + 1] = P[i].y;
          pos[o + 2] = P[i].z + nz * hw * sg;
          aS[i * 2 + s] = cum[i] / len;
          aSide[i * 2 + s] = sg;
        }
        if (i < n - 1) {
          const a0 = i * 2, a1 = i * 2 + 1, b0 = i * 2 + 2, b1 = i * 2 + 3;
          idx.push(a0, b0, a1, a1, b0, b1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
      g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uAmt: { value: 0 }, uHead: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.66) } },
        vertexShader: /* glsl */ `
          attribute float aS; attribute float aSide;
          varying float vS; varying float vSide;
          void main(){ vS = aS; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uAmt; uniform float uHead; uniform vec3 uColor;
          varying float vS; varying float vSide;
          void main(){
            float core = exp(-vSide * vSide * 70.0) * 1.7;
            float glow = exp(-vSide * vSide * 7.0) * 0.45;
            float headD = (vS - uHead) / 0.09;
            float head = exp(-headD * headD) * 3.2;
            float passed = smoothstep(uHead + 0.02, uHead - 0.05, vS);
            float a = (core + glow) * (0.55 * passed + head) * uAmt;
            gl_FragColor = vec4(uColor * a, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return { mesh, mat };
    });
  }

  // --------------------------------------------------------------- particules (poussière, étincelles, bokeh)
  buildParticles() {
    const r = rng(42);
    const O = [], V = [], B = [], LF = [], SZ = [], SD = [], K = [], A = [];
    const push = (o, v, birth, life, size, kind, alpha) => {
      O.push(o.x, o.y, o.z);
      V.push(v.x, v.y, v.z);
      B.push(birth);
      LF.push(life);
      SZ.push(size);
      SD.push(r());
      K.push(kind);
      A.push(alpha);
    };
    const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
    // échantillonnage du contour d'une pièce dans une pose donnée
    const sampleOutline = (outline, cx, cy, pos, yaw, n) => {
      const pts = [];
      const cum = [0];
      for (let i = 1; i <= outline.length; i++) {
        const a = outline[i - 1], b = outline[i % outline.length];
        cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
      }
      const total = cum[cum.length - 1];
      const q = quatYaw(yaw);
      for (let k = 0; k < n; k++) {
        const s = r() * total;
        let j = 1;
        while (cum[j] < s) j++;
        const a = outline[j - 1], b = outline[j % outline.length];
        const f = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
        const lx = (mix(a[0], b[0], f) - cx) * PX, lz = (mix(a[1], b[1], f) - cy) * PX;
        const tx = (b[0] - a[0]), tz = (b[1] - a[1]);
        const tl = Math.hypot(tx, tz) || 1;
        // normale sortante (contour orienté) : on la choisit pointant loin du centre
        let nx = tz / tl, nz = -tx / tl;
        if (nx * lx + nz * lz < 0) { nx = -nx; nz = -nz; }
        const p = v3(lx, 0, lz).applyQuaternion(q).add(pos);
        const nn = v3(nx, 0, nz).applyQuaternion(q);
        pts.push({ p, n: nn });
      }
      return pts;
    };
    // 1) bouffées de poussière à l'impact au sol
    this.pieces.forEach((pc) => {
      const pos = v3(pc.rest.x + pc.slide[0] * 0.4, 0.02, pc.rest.z + pc.slide[1] * 0.4);
      for (const { p, n } of sampleOutline(pc.outline, pc.cx, pc.cy, pos, pc.restYaw, 170)) {
        const sp = mix(0.6, 2.8, r() ** 1.5);
        const tang = v3(-n.z, 0, n.x).multiplyScalar((r() - 0.5) * 0.9);
        push(p.clone().add(v3(0, r() * 0.05, 0)), n.clone().multiplyScalar(sp).add(tang).add(v3(0, mix(0.1, 0.55, r()), 0)), pc.land + r() * 0.04, mix(0.6, 1.3, r()), mix(5, 12, r()), 0, mix(0.035, 0.11, r()));
      }
    });
    // 2) étincelles le long de la jointure à chaque verrouillage
    const L = this.logo;
    const seamLock = [CUES.lock[0], CUES.lock[2]];
    L.cutsInside.forEach((pts, ci) => {
      for (let k = 0; k < 90; k++) {
        const [x, y] = pts[Math.floor(r() * pts.length)];
        const p = v3((x - this.LCX) * PX, THW + 0.02, (y - this.LCY) * PX);
        const v = v3((r() - 0.5) * 1.6, mix(0.8, 2.8, r()), (r() - 0.5) * 1.6);
        push(p, v, seamLock[ci] + r() * 0.06, mix(0.3, 0.75, r()), mix(2.2, 4.8, r()), 2, mix(0.5, 1.0, r()));
      }
    });
    // 3) anneau de poussière autour du logo au « clac » final
    {
      const pseudo = { outline: L.sticker, cx: this.LCX, cy: this.LCY };
      for (const { p, n } of sampleOutline(pseudo.outline, pseudo.cx, pseudo.cy, v3(0, 0.02, 0), 0, 300)) {
        const sp = mix(1.2, 4.2, r() ** 1.3);
        push(p, n.clone().multiplyScalar(sp).add(v3(0, mix(0.05, 0.4, r()), 0)), CUES.press + r() * 0.03, mix(0.8, 1.8, r()), mix(4, 9, r()), 0, mix(0.05, 0.13, r()));
      }
    }
    // 4) poussières en suspension (bokeh)
    for (let k = 0; k < 260; k++) {
      push(v3(mix(-17, 17, r()), mix(0.4, 11, r()), mix(-13, 15, r())), v3(0, 0, 0), -100, 1e4, mix(1.6, 4.2, r()), 1, mix(0.05, 0.17, r()));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(O, 3));
    g.setAttribute('aVel', new THREE.Float32BufferAttribute(V, 3));
    g.setAttribute('aBirth', new THREE.Float32BufferAttribute(B, 1));
    g.setAttribute('aLife', new THREE.Float32BufferAttribute(LF, 1));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(SZ, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(SD, 1));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(K, 1));
    g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(A, 1));
    this.pMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFocus: { value: 25 },
        uAperture: { value: 0 },
        uPx: { value: this.H / 1080 },
        uMotes: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uFocus, uAperture, uPx, uMotes;
        attribute vec3 aVel; attribute float aBirth, aLife, aSize, aSeed, aKind, aAlpha;
        varying float vA; varying float vSoft; varying vec3 vCol;
        void main(){
          float age = uTime - aBirth;
          vec3 p = position;
          float a = 0.0;
          vec3 col = vec3(0.92, 0.86, 0.78);
          if (aKind < 0.5) {
            float k = 3.4;
            p += aVel * (1.0 - exp(-k * age)) / k;
            p.y += 0.12 * age;
            p.x += sin(age * 2.3 + aSeed * 6.28) * 0.06 * age;
            float lf = age / aLife;
            a = aAlpha * smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.25, 1.0, lf));
          } else if (aKind < 1.5) {
            p += vec3(sin(uTime * 0.21 + aSeed * 12.0) * 0.7, sin(uTime * 0.17 + aSeed * 7.0) * 0.4 + uTime * 0.1, cos(uTime * 0.19 + aSeed * 9.0) * 0.7);
            a = aAlpha * uMotes;
            col = vec3(1.0, 0.93, 0.84);
          } else {
            float k = 1.6;
            p += aVel * (1.0 - exp(-k * age)) / k;
            p.y -= 2.6 * age * age;
            float lf = age / aLife;
            a = aAlpha * (1.0 - lf) * (1.0 - lf);
            col = vec3(1.0, 0.84, 0.62) * 3.2;
          }
          if (age < 0.0 || age > aLife) a = 0.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = max(0.1, -mv.z);
          float sz = max(1.4, aSize * uPx * (28.0 / d));
          float coc = uAperture * abs(d - uFocus) / d * uPx;
          float s = max(sz, coc * 2.0);
          vA = a * (sz * sz) / (s * s);
          vSoft = clamp((s - sz) / (sz * 2.0 + 1.0), 0.0, 1.0);
          vCol = col;
          gl_PointSize = s;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vSoft; varying vec3 vCol;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c) * 2.0;
          float disc = smoothstep(1.0, 0.72, r) * (0.85 + 0.15 * r);
          float g = exp(-r * r * 4.0);
          float m = mix(g, disc, vSoft);
          float a = m * vA;
          if (a < 0.0008) discard;
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.points = new THREE.Points(g, this.pMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.scene.add(this.points);
  }

  // =============================================================== ANIMATION
  piecePose(pc, t, outPos, outQuat) {
    const rest = pc.rest;
    const qRest = quatYaw(pc.restYaw);
    let lift = 0;
    // --- chute depuis le haut du cadre
    if (t < pc.land) {
      const tau = pc.land - t;
      const h = 15 * tau + 0.5 * 85 * tau * tau;
      outPos.set(rest.x - pc.slide[0] * 3 * tau, rest.y + h, rest.z - pc.slide[1] * 3 * tau);
      const tumble = new THREE.Quaternion().setFromAxisAngle(pc.tumbleAxis, 2.6 * tau + 3.0 * tau * tau);
      outQuat.copy(qRest).premultiply(tumble);
      return 0;
    }
    // --- au sol : rebond, glissade, bascule amortie
    const tauL = t - pc.land;
    const ex = 1 - Math.exp(-tauL * 9);
    const yaw = pc.restYaw + 0.07 * ex * (pc.i === 1 ? -1 : 1);
    const bx = rest.x + pc.slide[0] * ex;
    const bz = rest.z + pc.slide[1] * ex;
    const bounce = 0.3 * Math.abs(Math.sin((Math.PI * tauL) / 0.21)) * Math.exp(-tauL * 7.5) * (tauL < 0.9 ? 1 : 0);
    const rock = 0.075 * Math.exp(-tauL * 6.5) * Math.sin((2 * Math.PI * tauL) / 0.19);
    const groundPos = new THREE.Vector3(bx, rest.y + bounce, bz);
    const groundQuat = quatYaw(yaw).premultiply(new THREE.Quaternion().setFromAxisAngle(pc.tumbleAxis, rock));
    // tremblement (« magnétisme ») avant l'envol, qui s'estompe pendant le décollage
    const tr = smoothstep(CUES.tremble, pc.lift, t) * (1 - smoothstep(pc.lift, pc.lift + 0.3, t));
    const jitter = new THREE.Quaternion();
    let jy = 0;
    if (tr > 0) {
      const f = 38;
      const jx = noise1(t * f, pc.i * 3.1) * 0.022 * tr;
      const jz = noise1(t * f, pc.i * 7.7 + 1) * 0.022 * tr;
      jitter.setFromEuler(new THREE.Euler(jx, 0, jz));
      jy = 0.04 * smoothstep(CUES.tremble, pc.lift, t) ** 2;
    }
    if (t < pc.lift) {
      outPos.copy(groundPos);
      outPos.y += jy;
      outQuat.copy(groundQuat).premultiply(jitter);
      return 0;
    }
    // --- vol vers la position de survol
    const hover = new THREE.Vector3(pc.final.x, pc.final.y + pc.hoverH, pc.final.z);
    const flyEase = bezierEase(0.45, 0.0, 0.2, 1.0);
    const u = remap(t, pc.lift, pc.arrive);
    const s = flyEase(u);
    if (t < pc.drop) {
      const P0 = groundPos.clone();
      P0.y += jy;
      const P1 = groundPos.clone().add(new THREE.Vector3(0, 2.6 + pc.i * 0.25, 0));
      const P2 = hover.clone().add(new THREE.Vector3(0, 1.5, 0));
      cubicBezier3(P0, P1, P2, hover, s, outPos);
      outPos.y += 0.012 * Math.sin((t - pc.arrive) * 25) * remap(t, pc.arrive, pc.arrive + 0.05);
      const qa = groundQuat.clone().slerp(new THREE.Quaternion(), s);
      // flourish : tonneau pour la pièce centrale, pirouette pour celle de droite, inclinaison pour celle de gauche
      const fl = E.inOutCubic(remap(u, 0.12, 0.86));
      let extra;
      if (pc.i === 1) extra = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fl * Math.PI * 2);
      else if (pc.i === 2) extra = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -fl * Math.PI * 2);
      else extra = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32 * Math.sin(Math.PI * s), 0, -0.42 * Math.sin(Math.PI * s)));
      outQuat.copy(qa).multiply(extra).premultiply(jitter);
      lift = 1;
      return lift;
    }
    // --- descente verticale et emboîtement
    if (t < pc.lock) {
      const ud = E.inQuad(remap(t, pc.drop, pc.lock));
      outPos.set(pc.final.x, mix(hover.y, pc.final.y, ud), pc.final.z);
      outQuat.identity();
      return 1;
    }
    // --- verrouillée
    const tk = t - pc.lock;
    outPos.copy(pc.final);
    outPos.y += 0.035 * Math.abs(Math.sin((Math.PI * tk) / 0.09)) * Math.exp(-tk * 22) * (tk < 0.3 ? 1 : 0);
    outQuat.identity();
    return 1;
  }

  cameraAt(t) {
    // keyframes : [t, az, el, dist, fov, tx, tz] — interpolés par spline monotone (aucun à-coup)
    const K = [
      [ACT2, -0.22, 0.86, 26.0, 35, 0.4, 0.7],
      [4.9, -0.17, 0.58, 23.6, 34, 0.3, 0.5],
      [5.55, -0.09, 0.53, 22.6, 33, 0.25, 0.35],
      [6.3, -0.045, 0.8, 24.6, 30.5, 0.12, 0.55],
      [7.1, -0.012, 1.08, 28.2, 27, 0.04, 0.8],
      [8.0, 0.0, Math.PI / 2, 33.0, 24, 0.0, 1.0],
      [10.0, 0.0, Math.PI / 2, 31.4, 24, 0.0, 1.0],
    ];
    const xs = K.map((k) => k[0]);
    const v = [1, 2, 3, 4, 5, 6].map((j) => monotoneCubic(xs, K.map((k) => k[j]), t, 1.7));
    return { az: v[0], el: v[1], dist: v[2], fov: v[3], tx: v[4], tz: v[5] };
  }

  update(t, seed = 0) {
    // -------- pièces
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (const pc of this.pieces) {
      this.piecePose(pc, t, pos, quat);
      pc.group.position.copy(pos);
      pc.group.quaternion.copy(quat);
      // respiration finale
      const br = Math.sin(Math.PI * remap(t, CUES.press, CUES.press + 0.22));
      pc.group.scale.setScalar(1 + 0.006 * br);
      // ombre de contact
      const h = Math.max(0, pos.y - THW / 2);
      const e = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
      pc.decal.position.set(pos.x, 0.004, pos.z);
      pc.decal.rotation.set(0, e.y, 0);
      pc.decal.scale.setScalar(1 + h * 0.3);
      pc.decal.material.opacity = 0.72 * Math.exp(-h / 0.32) * (t >= pc.land - 0.03 ? 1 : 0);
    }

    // -------- caméra
    const c = this.cameraAt(t);
    const target = new THREE.Vector3(c.tx, 0, c.tz);
    const dir = new THREE.Vector3(Math.sin(c.az) * Math.cos(c.el), Math.sin(c.el), Math.cos(c.az) * Math.cos(c.el));
    const cam = this.camera;
    cam.position.copy(target).addScaledVector(dir, c.dist);
    const fwd = dir.clone().negate();
    const right = new THREE.Vector3(Math.cos(c.az), 0, -Math.sin(c.az));
    const up = new THREE.Vector3().crossVectors(right, fwd);
    cam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, dir));
    // tremblement caméra aux impacts
    const hits = [
      [CUES.land[0], 0.006], [CUES.land[1], 0.004], [CUES.land[2], 0.005],
      [CUES.lock[1], 0.0025], [CUES.lock[0], 0.003], [CUES.lock[2], 0.003], [CUES.press, 0.0055],
    ];
    let sh = 0;
    for (const [th, amp] of hits) if (t > th) sh += amp * Math.exp(-(t - th) * 9);
    if (sh > 1e-5) {
      const f = 26;
      cam.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(noise1(t * f, 1) * sh, noise1(t * f, 2) * sh, noise1(t * f, 3) * sh * 0.5)));
    }
    cam.fov = c.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    // -------- profondeur de champ (dépend de l'élévation)
    const topDown = smoothstep(1.05, 1.45, c.el);
    // mise au point sur le barycentre des pièces
    const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let fd = 0;
    for (const pc of this.pieces) fd += pc.group.position.clone().sub(cam.position).dot(fw);
    this.camState.focus = fd / this.pieces.length;
    this.camState.aperture = 12 * (1 - topDown);
    this.pMat.uniforms.uTime.value = t;
    this.pMat.uniforms.uFocus.value = this.camState.focus;
    this.pMat.uniforms.uAperture.value = this.camState.aperture;
    this.pMat.uniforms.uMotes.value = mix(1, 0.35, smoothstep(6.5, 8.0, t)) * smoothstep(ACT2, ACT2 + 0.3, t);

    // -------- brouillard (fond infini)
    this.scene.fog.near = c.dist * 1.2;
    this.scene.fog.far = c.dist * 2.7;

    // -------- flashs des jointures
    const seamT = [CUES.lock[0], CUES.lock[2]];
    this.seams.forEach((s, i) => {
      const t0 = seamT[i];
      const head = E.outCubic(remap(t, t0 - 0.02, t0 + 0.3)) * 1.15;
      const press = Math.exp(-Math.max(0, t - CUES.press) * 4.5) * (t > CUES.press ? 1 : 0);
      const amt = (t > t0 - 0.02 ? Math.exp(-Math.max(0, t - t0 - 0.12) * 3.2) : 0) + 1.2 * press;
      s.mat.uniforms.uHead.value = t > CUES.press ? Math.max(head, E.outCubic(remap(t, CUES.press, CUES.press + 0.35)) * 1.15) : head;
      s.mat.uniforms.uAmt.value = amt;
    });

    // -------- reflet balayant final
    const sw = remap(t, CUES.sweep, CUES.sweep + 0.95);
    SWEEP.uSweep.value = mix(-12, 13, E.inOutSine(sw));
    SWEEP.uSweepAmt.value = Math.sin(Math.PI * sw) * 0.72;

    // -------- lumière : léger « souffle » à l'assemblage, bruit PCSS par sous-image
    this.key.intensity = 2.5 * (1 - 0.08 * Math.sin(Math.PI * remap(t, CUES.tremble, CUES.lock[1]))) + 0.35 * Math.exp(-Math.max(0, t - CUES.press) * 3) * (t > CUES.press ? 1 : 0);
    this.key.shadow.radius = 1 + (seed % 97);
    this.exposure = 1.0;
    this.bloomStrength = 0.24 + 0.3 * Math.exp(-Math.max(0, t - CUES.press) * 3) * (t > CUES.press ? 1 : 0);
    this.bloomThreshold = 1.0;
  }
}
