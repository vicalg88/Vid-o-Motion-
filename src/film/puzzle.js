// ---------------------------------------------------------------------------
// Les 3 pièces du logo : au sol, ramassées une à une, fixées sur un mur
// invisible (ondes lumineuses au contact), puis carton final.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES, PICKS, E, remap, mix, clamp, smoothstep, bezierEase, rng } from '../timeline.js';
import { Z_FLOOR_PIECES, Z_WALL, LOGO_Y } from './camera.js';

const PX = 0.0006; // 1 px du logo source = 0,6 mm  (logo ≈ 1 m de large)
const TH = 26; // épaisseur (px)
const BT = 2.4;
const BS = 2.2;
const THW = TH * PX;

const SWEEP = { uSweep: { value: -9 }, uSweepAmt: { value: 0 } };
function addSweep(mat, strength) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSweep = SWEEP.uSweep;
    sh.uniforms.uSweepAmt = SWEEP.uSweepAmt;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWS;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n vWS = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWS;\nuniform float uSweep;\nuniform float uSweepAmt;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float swd = ( vWS.x * 0.93 - vWS.y * 0.37 ) - uSweep;
        float band = exp( - swd * swd / 0.012 ) * 0.3 + exp( - swd * swd / 0.0009 ) * 0.6;
        gl_FragColor.rgb += vec3( 1.0, 0.96, 0.9 ) * band * uSweepAmt * ${strength.toFixed(2)};`
      );
  };
  mat.customProgramCacheKey = () => 'psweep' + strength;
}

function logoTexture(L, renderer) {
  const TW = 4096;
  const k = TW / L.width;
  const TH2 = Math.round(L.height * k);
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH2;
  const x = c.getContext('2d');
  x.fillStyle = L.colors.cream;
  x.fillRect(0, 0, TW, TH2);
  const p = new Path2D();
  for (const ring of L.letters) {
    ring.forEach(([px, py], i) => (i ? p.lineTo(px * k, py * k) : p.moveTo(px * k, py * k)));
    p.closePath();
  }
  x.fillStyle = '#121212';
  x.fill(p, 'evenodd');
  x.strokeStyle = '#ffffff';
  x.lineWidth = L.lineWidth * k;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  for (const cut of L.cuts) {
    x.beginPath();
    cut.forEach(([px, py], i) => (i ? x.lineTo(px * k, py * k) : x.moveTo(px * k, py * k)));
    x.stroke();
  }
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
  x.globalAlpha = 0.05;
  x.globalCompositeOperation = 'overlay';
  x.fillStyle = x.createPattern(n, 'repeat');
  x.fillRect(0, 0, TW, TH2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function pieceGeometry(L, outline, cx, cy) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x - cx, -(y - cy))));
  const uvGen = {
    generateTopUV(g, v, a, b, c) {
      const f = (i) => new THREE.Vector2((v[i * 3] + cx) / L.width, 1 - (cy - v[i * 3 + 1]) / L.height);
      return [f(a), f(b), f(c)];
    },
    generateSideWallUV(g, v, a, b, c, d) {
      const q = (i) => new THREE.Vector2(v[i * 3] * 0.01 + v[i * 3 + 1] * 0.01, v[i * 3 + 2] * 0.01);
      return [q(a), q(b), q(c), q(d)];
    },
  };
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth: TH - 2 * BT, bevelEnabled: true, bevelThickness: BT, bevelSize: BS, bevelOffset: -BS, bevelSegments: 5, steps: 1, curveSegments: 1, UVGenerator: uvGen,
  });
  geo = toCreasedNormals(geo, (40 * Math.PI) / 180);
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array, uv = geo.attributes.uv.array;
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
  const P2 = new Float32Array(order.length * 9), N2 = new Float32Array(order.length * 9), U2 = new Float32Array(order.length * 6);
  order.forEach((v0, ti) => {
    for (let j = 0; j < 3; j++) {
      const v = v0 + j, o = (ti * 3 + j) * 3;
      P2[o] = pos[v * 3]; P2[o + 1] = pos[v * 3 + 1]; P2[o + 2] = pos[v * 3 + 2];
      N2[o] = nor[v * 3]; N2[o + 1] = nor[v * 3 + 1]; N2[o + 2] = nor[v * 3 + 2];
      U2[(ti * 3 + j) * 2] = uv[v * 2]; U2[(ti * 3 + j) * 2 + 1] = uv[v * 2 + 1];
    }
  });
  for (let ti = 0; ti < top.length + bot.length; ti++) {
    const nz = ti < top.length ? 1 : -1;
    for (let j = 0; j < 3; j++) {
      const o = (ti * 3 + j) * 3;
      N2[o] = 0; N2[o + 1] = 0; N2[o + 2] = nz;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P2, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
  out.addGroup(0, top.length * 3, 0);
  out.addGroup(top.length * 3, bot.length * 3, 1);
  out.addGroup((top.length + bot.length) * 3, side.length * 3, 2);
  out.rotateX(-Math.PI / 2);
  out.translate(0, BT - TH / 2, 0); // centré sur l'épaisseur
  out.scale(PX, PX, PX);
  out.computeBoundingSphere();
  return out;
}

const qWall = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const yawQ = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
function bez(p0, p1, p2, p3, s) {
  const u = 1 - s;
  return new THREE.Vector3().addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * s).addScaledVector(p2, 3 * u * s * s).addScaledVector(p3, s * s * s);
}

export class Puzzle {
  constructor(world, logo) {
    this.world = world;
    this.L = logo;
    const [bx0, by0, bx1, by1] = logo.stickerBBox;
    this.LCX = (bx0 + bx1) / 2;
    this.LCY = (by0 + by1) / 2;
    const tex = logoTexture(logo, world.r);
    const top = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.72, metalness: 0, specularIntensity: 0.4, envMapIntensity: 0.6 });
    addSweep(top, 1.0);
    const bottom = new THREE.MeshStandardMaterial({ color: 0xcbc4b8, roughness: 0.92 });
    const edge = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 });
    addSweep(edge, 0.45);
    this.group = new THREE.Group();
    world.scene.add(this.group);
    // poses au sol (éparpillées) — légèrement de travers, une un peu à l'écart
    const floorPoses = [
      { x: -0.3, z: 0.06, yaw: 0.42 },
      { x: 0.2, z: -0.2, yaw: -0.7 },
      { x: 0.42, z: 0.24, yaw: 0.95 },
    ];
    this.pieces = logo.pieces.map((pc, i) => {
      const [cx, cy] = pc.centroid;
      const mesh = new THREE.Mesh(pieceGeometry(logo, pc.outline, cx, cy), [top, bottom, edge]);
      this.group.add(mesh);
      const fp = floorPoses[i];
      return {
        i, mesh, cx, cy, outline: pc.outline, bbox: pc.bbox,
        floorPos: new THREE.Vector3(fp.x, THW / 2, Z_FLOOR_PIECES + fp.z),
        floorQ: yawQ(fp.yaw),
        wallPos: new THREE.Vector3((cx - this.LCX) * PX, LOGO_Y - (cy - this.LCY) * PX, Z_WALL),
        win: PICKS[i],
      };
    });
    this.pieces.forEach((p) => (p.decal = this.makeDecal(p)));
    this.wallCenter = new THREE.Vector3(0, LOGO_Y, Z_WALL);
    this.makeRipples();
    this.makeSeams();
  }

  makeDecal(p) {
    const [x0, y0, x1, y1] = p.bbox;
    const m = 70, s = 0.5;
    const w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * s);
    c.height = Math.ceil(h * s);
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, c.width, c.height);
    x.filter = `blur(${10 * s}px)`;
    x.fillStyle = '#fff';
    x.beginPath();
    p.outline.forEach(([px, py], i) => (i ? x.lineTo((px - x0 + m) * s, (py - y0 + m) * s) : x.moveTo((px - x0 + m) * s, (py - y0 + m) * s)));
    x.closePath();
    x.fill();
    const g = new THREE.PlaneGeometry(w * PX, h * PX);
    g.rotateX(-Math.PI / 2);
    g.translate(((x0 + x1) / 2 - p.cx) * PX, 0, ((y0 + y1) / 2 - p.cy) * PX);
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: new THREE.CanvasTexture(c), transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.world.floor.hidden.push(mesh);
    return mesh;
  }

  // ondes sur le mur invisible
  makeRipples() {
    this.rippleU = {
      uC: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uT: { value: [-9, -9, -9] },
      uPress: { value: -9 },
      uLogoC: { value: new THREE.Vector2(0, LOGO_Y) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.rippleU,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uC[3]; uniform float uT[3]; uniform float uPress; uniform vec2 uLogoC;
        varying vec3 vW;
        float ring(vec2 p, vec2 c, float t){
          if (t < 0.0 || t > 1.6) return 0.0;
          float R = 0.03 + 0.62 * pow(t, 0.7);
          float d = length(p - c);
          float w = 0.008 + 0.022 * t;
          float a = exp(-pow((d - R) / w, 2.0)) * pow(1.0 - t / 1.6, 2.6) * 0.55;
          float inner = exp(-d * d / (0.01 + R * R * 0.3)) * exp(-t * 6.0) * 0.35;
          return a + inner;
        }
        void main(){
          vec2 p = vW.xy;
          float v = 0.0;
          for (int i = 0; i < 3; i++) v += ring(p, uC[i].xy, uT[i]);
          // onde finale (rectangle arrondi qui s'étend autour du logo)
          if (uPress > 0.0 && uPress < 1.6) {
            vec2 q = abs(p - uLogoC) - vec2(0.5, 0.155);
            float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
            float R = 0.02 + 0.9 * pow(uPress, 0.6);
            float w = 0.012 + 0.03 * uPress;
            v += exp(-pow((d - R) / w, 2.0)) * pow(1.0 - uPress / 1.6, 2.4) * 0.35;
          }
          vec3 col = vec3(0.92, 0.94, 1.0) * v * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ripple = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), mat);
    this.ripple.position.set(0, LOGO_Y, Z_WALL - THW / 2 - 0.002);
    this.ripple.renderOrder = 15;
    this.group.add(this.ripple);
  }

  makeSeams() {
    this.seams = this.L.cutsInside.map((pts) => {
      const P = pts.map(([x, y]) => new THREE.Vector3((x - this.LCX) * PX, LOGO_Y - (y - this.LCY) * PX, Z_WALL + THW / 2 + 0.0012));
      const n = P.length;
      const cum = [0];
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
      const len = cum[n - 1];
      const hw = 0.0085;
      const pos = new Float32Array(n * 6), aS = new Float32Array(n * 2), aSide = new Float32Array(n * 2);
      const idx = [];
      for (let i = 0; i < n; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
        const tx = b.x - a.x, ty = b.y - a.y;
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl;
        for (let s = 0; s < 2; s++) {
          const sg = s ? 1 : -1, o = (i * 2 + s) * 3;
          pos[o] = P[i].x + nx * hw * sg;
          pos[o + 1] = P[i].y + ny * hw * sg;
          pos[o + 2] = P[i].z;
          aS[i * 2 + s] = cum[i] / len;
          aSide[i * 2 + s] = sg;
        }
        if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
      g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uAmt: { value: 0 }, uHead: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.88, 0.7) } },
        vertexShader: `attribute float aS; attribute float aSide; varying float vS; varying float vSide; void main(){ vS = aS; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uAmt; uniform float uHead; uniform vec3 uColor; varying float vS; varying float vSide;
          void main(){ float core = exp(-vSide*vSide*70.0) * 1.7; float glow = exp(-vSide*vSide*7.0) * 0.45; float hd = (vS - uHead) / 0.09; float head = exp(-hd*hd) * 3.2; float passed = smoothstep(uHead + 0.02, uHead - 0.05, vS); gl_FragColor = vec4(uColor * (core + glow) * (0.55 * passed + head) * uAmt, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 16;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.world.floor.hidden.push(mesh);
      return { mesh, mat };
    });
  }

  // pose d'une pièce à l'instant t (body = position des yeux, sans l'orientation)
  pose(p, t, body) {
    const [p0, p1] = p.win;
    if (t < p0) return { pos: p.floorPos.clone(), q: p.floorQ.clone(), h: 0 };
    const dur = p1 - p0;
    const tLift = p0 + dur * 0.34;
    const tPress = p1 - 0.13;
    // point « dans la main » : devant le corps, sous les yeux, un peu à droite
    const hand = body.clone().add(new THREE.Vector3(0.05, -0.36, -0.6));
    const qHold = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.62, 0.0, -0.14));
    const approach = p.wallPos.clone().add(new THREE.Vector3(0, 0, 0.07));
    if (t < tLift) {
      const s = E.inOutCubic(remap(t, p0, tLift));
      const pos = bez(p.floorPos, p.floorPos.clone().add(new THREE.Vector3(0, 0.22, 0)), hand.clone().add(new THREE.Vector3(0, -0.12, 0.05)), hand, s);
      const q = p.floorQ.clone().slerp(qHold, E.inOutSine(s));
      return { pos, q, h: pos.y - THW / 2 };
    }
    if (t < tPress) {
      const s = bezierEase(0.45, 0.0, 0.25, 1.0)(remap(t, tLift, tPress));
      const pos = bez(hand, hand.clone().add(new THREE.Vector3(0, 0.08, -0.12)), approach.clone().add(new THREE.Vector3(0, 0, 0.14)), approach, s);
      const q = qHold.clone().slerp(qWall, E.inOutCubic(s));
      return { pos, q, h: 1 };
    }
    if (t < p1) {
      const s = E.inQuad(remap(t, tPress, p1));
      return { pos: approach.clone().lerp(p.wallPos, s), q: qWall.clone(), h: 1 };
    }
    // fixée : petit rebond au contact
    const tk = t - p1;
    const pos = p.wallPos.clone();
    pos.z += -0.006 * Math.exp(-tk * 16) * Math.sin(tk * 34);
    return { pos, q: qWall.clone(), h: 1 };
  }

  // point que le regard doit suivre pendant le ramassage
  focusPoint(t, body) {
    const items = [];
    this.pieces.forEach((p, i) => {
      const [p0, p1] = p.win;
      const w = smoothstep(p0 - 0.12, p0 + 0.2, t) * (1 - smoothstep(p1 + 0.05, p1 + 0.4, t));
      if (w <= 0) return;
      const tgt = this.pose(p, Math.max(p0, t - 0.08), body).pos;
      if (i > 0) tgt.lerp(this.wallCenter, 0.5 * (1 - smoothstep(p0, p0 + 0.4, t)));
      items.push([tgt, w]);
    });
    const wl = smoothstep(PICKS[2][1] + 0.05, PICKS[2][1] + 0.4, t);
    if (wl > 0) items.push([this.wallCenter.clone(), wl]);
    if (!items.length) return null;
    let W = 0;
    const p = new THREE.Vector3();
    for (const [v, w] of items) {
      p.addScaledVector(v, w);
      W += w;
    }
    return { p: p.multiplyScalar(1 / W), w: Math.min(1, W) };
  }

  update(t, body) {
    const visible = t > CUES.stumble - 1.5;
    this.group.visible = visible;
    if (!visible) return;
    this.pieces.forEach((p) => {
      const { pos, q, h } = this.pose(p, t, body);
      p.mesh.position.copy(pos);
      p.mesh.quaternion.copy(q);
      // le pied heurte la pièce n°3 lors du trébuchement : elle glisse un peu
      if (p.i === 2 && t >= CUES.stumble && t < p.win[0]) {
        const k = E.outCubic(remap(t, CUES.stumble, CUES.stumble + 0.35));
        p.mesh.position.x += 0.06 * k;
        p.mesh.position.z -= 0.09 * k;
        p.mesh.quaternion.premultiply(yawQ(0.35 * k));
      }
      const e = new THREE.Euler().setFromQuaternion(p.mesh.quaternion, 'YXZ');
      p.decal.position.set(p.mesh.position.x, 0.002, p.mesh.position.z);
      p.decal.rotation.set(0, e.y, 0);
      p.decal.material.opacity = 0.85 * Math.exp(-Math.max(0, h) / 0.06);
      p.decal.visible = t < p.win[0] + 0.6;
      const br = Math.sin(Math.PI * remap(t, CUES.press, CUES.press + 0.25));
      p.mesh.scale.setScalar(1 + 0.012 * br);
    });
    // ondes au contact du mur
    this.pieces.forEach((p, i) => {
      this.rippleU.uC.value[i].copy(p.wallPos);
      this.rippleU.uT.value[i] = t - p.win[1];
    });
    this.rippleU.uPress.value = t - CUES.press;
    // jointures qui s'illuminent quand les pièces s'emboîtent
    const seamT = [PICKS[1][1], PICKS[2][1]];
    this.seams.forEach((s, i) => {
      const t0 = seamT[i];
      const head = E.outCubic(remap(t, t0 - 0.02, t0 + 0.32)) * 1.15;
      const press = t > CUES.press ? Math.exp(-(t - CUES.press) * 4.0) : 0;
      s.mat.uniforms.uHead.value = t > CUES.press ? Math.max(head, E.outCubic(remap(t, CUES.press, CUES.press + 0.35)) * 1.15) : head;
      s.mat.uniforms.uAmt.value = (t > t0 - 0.02 ? Math.exp(-Math.max(0, t - t0 - 0.12) * 3.0) : 0) + 1.3 * press;
    });
    // reflet balayant final
    const sw = remap(t, CUES.sweep, CUES.sweep + 1.0);
    SWEEP.uSweep.value = mix(-1.3, 0.08, E.inOutSine(sw));
    SWEEP.uSweepAmt.value = Math.sin(Math.PI * sw) * 0.7;
  }
}
