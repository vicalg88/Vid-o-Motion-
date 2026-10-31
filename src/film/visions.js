// ---------------------------------------------------------------------------
// Les 4 visions oniriques (concepts Exprnc.)
//   1. Escape game — Casino        (gauche)
//   2. Murder party — Festival de cinéma (droite)
//   3. Undercover                   (gauche)
//   4. Exprnc. Food — cocktails      (droite)
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { E, remap, mix, clamp, smoothstep, rng, noise1 } from '../timeline.js';
import { dreamify, visionUniforms, revealAt, makeLabel, ParticleField, ribbonGeometry, glowSprite } from './dream.js';
import * as TX from './textures.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ base
class Vision {
  constructor(world, { center, window, edge, rig, label }) {
    this.world = world;
    this.window = window;
    this.center = center;
    this.frame = new THREE.Group();
    this.frame.position.copy(center);
    this.U = visionUniforms(edge);
    this.rig = rig;
    this.root = new THREE.Group(); // contenu animé
    this.frame.add(this.root);
    world.scene.add(this.frame);
    if (label) {
      this.label = makeLabel(this.U, label[0], label[1], { width: 2.3, glow: label[2] });
      this.label.position.set(0, -0.86, 0.95);
      this.frame.add(this.label);
    }
    this.mats = [];
  }
  // le cadre regarde la position de la caméra au milieu de la fenêtre de regard
  orient(camPos) {
    const d = camPos.clone().sub(this.center);
    this.frame.rotation.y = Math.atan2(d.x, d.z);
    this.frame.updateMatrixWorld(true);
  }
  m(mat, opts) {
    dreamify(mat, this.U, opts);
    this.mats.push(mat);
    return mat;
  }
  reveal(t) {
    return revealAt(t, this.window);
  }
  update(t) {
    const r = this.reveal(t);
    this.U.uReveal.value = r;
    this.frame.visible = r > 0.001;
    this.r = r;
    return r;
  }
}

function lathe(profile, seg = 64) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

// =========================================================================== 1. CASINO
export class CasinoVision extends Vision {
  constructor(world, opts) {
    super(world, {
      ...opts,
      edge: '#ffbf5a',
      label: ['ESCAPE GAME', 'CASINO', 'rgba(255,200,120,0.95)'],
      rig: {
        key: { pos: [-1.6, 2.8, 2.6], target: [0.2, 0, 0], color: '#ffe0b0', intensity: 3.2, angle: 0.75 },
        a: { pos: [2.0, 0.9, -1.4], color: '#ff2440', intensity: 9 },
        b: { pos: [-1.8, -1.0, -0.6], color: '#26d07c', intensity: 4 },
      },
    });
    const R = this.root;
    const gold = this.m(new THREE.MeshStandardMaterial({ color: 0xd7a650, metalness: 1, roughness: 0.26 }));
    // --- roulette
    this.wheel = new THREE.Group();
    this.wheel.position.set(0.55, 0.1, -0.55);
    this.wheel.rotation.set(1.05, 0.0, -0.16);
    const rim = new THREE.Mesh(lathe([[0.74, -0.06], [0.9, -0.02], [0.97, 0.06], [0.93, 0.11], [0.8, 0.08], [0.76, 0.03]], 96), this.m(new THREE.MeshStandardMaterial({ color: 0x3b2311, roughness: 0.35, metalness: 0.1 })));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.955, 0.022, 12, 140), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    this.spin = new THREE.Group();
    const disk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.78, 0.05, 96),
      [this.m(new THREE.MeshStandardMaterial({ color: 0x2a170a, roughness: 0.5 })), this.m(new THREE.MeshStandardMaterial({ map: TX.rouletteTexture(), roughness: 0.32, metalness: 0.15 })), this.m(new THREE.MeshStandardMaterial({ color: 0x120a04 }))]
    );
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.2, 48), gold);
    cone.position.y = 0.12;
    this.spin.add(disk, cone);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 12), gold);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = (i * Math.PI) / 2;
      arm.position.y = 0.22;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), gold);
      ball.position.set(Math.cos((i * Math.PI) / 2) * 0.18, 0.22, -Math.sin((i * Math.PI) / 2) * 0.18);
      this.spin.add(arm, ball);
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), this.m(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.1 })));
    this.wheel.add(rim, ring, this.spin, this.ball);
    R.add(this.wheel);
    // --- cartes en spirale
    const ranks = [['A', 's'], ['K', 'h'], ['Q', 'd'], ['J', 'c'], ['A', 'h'], ['K', 's'], ['A', 'd'], ['Q', 'h']];
    const back = TX.cardBack();
    this.cards = ranks.map(([rk, st], i) => {
      const g = new THREE.Group();
      const geo = new THREE.PlaneGeometry(0.4, 0.56);
      const front = new THREE.Mesh(geo, this.m(new THREE.MeshStandardMaterial({ map: TX.cardFace(rk, st), roughness: 0.35, alphaTest: 0.5, side: THREE.FrontSide })));
      const bk = new THREE.Mesh(geo, this.m(new THREE.MeshStandardMaterial({ map: back, roughness: 0.35, alphaTest: 0.5, side: THREE.FrontSide })));
      bk.rotation.y = Math.PI;
      g.add(front, bk);
      R.add(g);
      return { g, i, ph: i * 0.78 };
    });
    // --- jetons
    const chipCols = [['#b3122e', '#f3ead8'], ['#141414', '#e8c770'], ['#0f6a3f', '#f3ead8'], ['#1d4fa3', '#f3ead8'], ['#e9e2d2', '#b3122e']];
    const chipMats = chipCols.map(([b, a]) => {
      const t = TX.chipTextures(b, a);
      return [
        this.m(new THREE.MeshStandardMaterial({ map: t.side, roughness: 0.4 })),
        this.m(new THREE.MeshStandardMaterial({ map: t.face, roughness: 0.4 })),
        this.m(new THREE.MeshStandardMaterial({ map: t.face, roughness: 0.4 })),
      ];
    });
    const chipGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.02, 48);
    const r = rng(21);
    this.chips = [];
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(chipGeo, chipMats[i % chipMats.length]);
      const u = i / 18;
      this.chips.push({ mesh, u, rx: r() * 6, ry: r() * 6, sp: mix(0.5, 1.4, r()), off: V3((r() - 0.5) * 0.5, (r() - 0.5) * 0.3, (r() - 0.5) * 0.5) });
      R.add(mesh);
    }
    // pile de jetons
    this.stack = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(chipGeo, chipMats[(i * 2) % chipMats.length]);
      c.position.set((r() - 0.5) * 0.01, i * 0.021, (r() - 0.5) * 0.01);
      c.rotation.y = r() * 6;
      this.stack.add(c);
    }
    this.stack.position.set(-0.55, -0.85, 0.55);
    this.stack.rotation.set(0.35, 0, -0.25);
    R.add(this.stack);
    // --- dés
    const dieMats = TX.dieFaces().map((map) => this.m(new THREE.MeshPhysicalMaterial({ map, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 })));
    this.dice = [0, 1].map((i) => {
      const d = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.15, 0.15, 4, 0.022), dieMats);
      d.position.set(-1.05 + i * 0.32, -0.25 + i * 0.22, 0.75 - i * 0.2);
      R.add(d);
      return d;
    });
    // --- minuteur
    this.timer = new TX.TimerTexture();
    this.timer.set('00:59:59');
    const timerMat = this.m(new THREE.MeshBasicMaterial({ map: this.timer.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(1.6), transparent: true, depthWrite: false }));
    this.timerMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), timerMat);
    this.timerMesh.position.set(-0.95, 0.95, -0.2);
    this.timerMesh.rotation.set(0.05, 0.28, 0.04);
    R.add(this.timerMesh);
    // --- cadenas + clé
    this.lock = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.22, 0.08, 4, 0.02), gold);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.017, 12, 40, Math.PI), this.m(new THREE.MeshStandardMaterial({ color: 0xcfcfd4, metalness: 1, roughness: 0.2 })));
    shackle.position.y = 0.17;
    const legs = [-1, 1].map((s) => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.07, 12), shackle.material);
      l.position.set(s * 0.085, 0.135, 0);
      return l;
    });
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.022, 20), this.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.35).multiplyScalar(3) })));
    hole.position.set(0, -0.01, 0.041);
    this.lock.add(body, shackle, ...legs, hole);
    this.lock.position.set(-1.45, 0.2, 0.15);
    R.add(this.lock);
    // halo et poussière dorée
    const glow = glowSprite('#ff9a3a', 5.2, 0.35);
    glow.position.set(0.3, 0.1, -1.6);
    R.add(glow);
    this.glow = glow;
    this.pf = new ParticleField({ count: 420, box: [[-2.4, -1.4, -1.8], [2.4, 1.6, 1.2]], colors: ['#ffd27a', '#ffb347', '#fff1c9'], size: [1.5, 5], seed: 31, mode: 2, speed: 0.5, alpha: [0.25, 0.9], twinkle: 0.8, H: world.H });
    this.frame.add(this.pf.points);
  }

  update(t, focus, aperture) {
    const r = super.update(t);
    if (!this.frame.visible) return;
    const tau = t - this.window[0];
    this.pf.update(t, r, focus, aperture);
    this.glow.material.opacity = r;
    this.root.position.y = Math.sin(tau * 0.6) * 0.03;
    this.root.rotation.y = 0.12 * Math.sin(tau * 0.25);
    this.spin.rotation.y = tau * 0.9;
    const ba = -tau * 2.6;
    this.ball.position.set(Math.cos(ba) * 0.62, 0.09 + 0.01 * Math.abs(Math.sin(tau * 9)), Math.sin(ba) * 0.62);
    // cartes : spirale autour de la roulette
    this.cards.forEach((c) => {
      const a = c.ph + tau * 0.32;
      const rad = 1.35 + 0.18 * Math.sin(c.i * 1.7);
      c.g.position.set(Math.cos(a) * rad + 0.3, -0.75 + c.i * 0.22 + Math.sin(tau * 0.8 + c.i) * 0.04, Math.sin(a) * rad * 0.55 - 0.4);
      c.g.rotation.set(0.25 * Math.sin(tau * 0.5 + c.i), -a + Math.PI / 2 + Math.sin(tau * 0.7 + c.i) * 0.6, 0.2 * Math.sin(c.i));
    });
    // jetons : cascade au ralenti en diagonale
    this.chips.forEach((c) => {
      const u = (c.u + tau * 0.07) % 1;
      const p = V3(mix(-1.7, 1.9, u), mix(1.35, -1.05, u) + Math.sin(u * 6 + c.rx) * 0.08, mix(0.2, -0.3, u)).add(c.off);
      c.mesh.position.copy(p);
      c.mesh.rotation.set(c.rx + tau * c.sp, c.ry + tau * c.sp * 0.6, 0.4);
      const s = smoothstep(0, 0.08, u) * (1 - smoothstep(0.92, 1, u));
      c.mesh.scale.setScalar(Math.max(0.001, s));
    });
    this.stack.rotation.y = tau * 0.3;
    this.dice.forEach((d, i) => {
      d.rotation.set(tau * (0.7 + i * 0.3) + i, tau * (0.5 + i * 0.2), tau * 0.3 + i * 2);
      d.position.y = -0.25 + i * 0.22 + Math.sin(tau * 1.1 + i) * 0.05;
    });
    // minuteur qui décompte (secondes du film)
    const remain = 59 * 60 + 59 - Math.floor(Math.max(0, tau + 0.4));
    const mm = Math.floor(remain / 60), ss = remain % 60;
    this.timer.set(`00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
    this.lock.rotation.set(0.15 * Math.sin(tau * 0.6), 0.4 + 0.5 * Math.sin(tau * 0.35), 0.1 * Math.sin(tau * 0.8));
  }
}

// =========================================================================== 2. MURDER PARTY / FESTIVAL
export class CinemaVision extends Vision {
  constructor(world, opts) {
    super(world, {
      ...opts,
      edge: '#ff3a52',
      label: ['MURDER PARTY', 'FESTIVAL DE CINÉMA', 'rgba(255,120,130,0.95)'],
      rig: {
        key: { pos: [1.2, 2.9, 2.6], target: [0, -0.3, 0], color: '#fff2e4', intensity: 3.0, angle: 0.8 },
        a: { pos: [-1.6, 1.0, -1.8], color: '#ff1a3a', intensity: 10 },
        b: { pos: [2.2, -0.2, 0.4], color: '#9cc3ff', intensity: 5 },
      },
    });
    const R = this.root;
    const gold = this.m(new THREE.MeshStandardMaterial({ color: 0xd7a650, metalness: 1, roughness: 0.24 }));
    // --- tapis rouge qui ondule et monte dans le noir
    this.carpetCurve = new THREE.CatmullRomCurve3([V3(-0.2, -1.25, 1.6), V3(0.05, -1.05, 0.2), V3(0.35, -0.75, -1.4), V3(-0.15, -0.05, -3.2), V3(0.6, 1.1, -5.2), V3(0.1, 2.4, -7.0)]);
    this.carpetGeo = ribbonGeometry(this.carpetCurve, 1.05, 160);
    this.carpetBase = this.carpetGeo.attributes.position.array.slice();
    const cc = document.createElement('canvas');
    cc.width = 64;
    cc.height = 256;
    const cx = cc.getContext('2d');
    cx.fillStyle = '#7d0716';
    cx.fillRect(0, 0, 64, 256);
    cx.fillStyle = '#5a040f';
    cx.fillRect(0, 0, 64, 16);
    cx.fillRect(0, 240, 64, 16);
    cx.fillStyle = '#d4a24c';
    cx.fillRect(0, 18, 64, 5);
    cx.fillRect(0, 233, 64, 5);
    const ct = new THREE.CanvasTexture(cc);
    ct.colorSpace = THREE.SRGBColorSpace;
    ct.wrapS = THREE.RepeatWrapping;
    ct.rotation = 0;
    this.carpet = new THREE.Mesh(
      this.carpetGeo,
      this.m(new THREE.MeshPhysicalMaterial({ map: ct, roughness: 0.75, sheen: 1, sheenColor: new THREE.Color('#ff5a6a'), sheenRoughness: 0.45, side: THREE.DoubleSide }))
    );
    // UV : u (longueur) -> on veut les bandes le long de la largeur => échange via onBeforeCompile simple
    const uv = this.carpetGeo.attributes.uv.array;
    for (let i = 0; i < uv.length; i += 2) {
      const u = uv[i], v = uv[i + 1];
      uv[i] = u * 0.5;
      uv[i + 1] = v;
    }
    ct.repeat.set(1, 1);
    R.add(this.carpet);
    // --- poteaux dorés + cordons de velours
    const postGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.8, 16);
    const topGeo = new THREE.SphereGeometry(0.048, 20, 14);
    const baseGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.03, 32);
    const velvet = this.m(new THREE.MeshPhysicalMaterial({ color: 0x7a0614, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#ff3b4e') }));
    this.posts = [];
    const pp = [[-0.85, 0.6], [-0.75, -0.6], [0.95, 0.5], [1.05, -0.65]];
    pp.forEach(([x, z]) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(postGeo, gold);
      p.position.y = 0.4;
      const tp = new THREE.Mesh(topGeo, gold);
      tp.position.y = 0.82;
      const b = new THREE.Mesh(baseGeo, gold);
      g.add(p, tp, b);
      g.position.set(x, -1.25, z);
      R.add(g);
      this.posts.push(g);
    });
    [[0, 1], [2, 3]].forEach(([i, j]) => {
      const a = this.posts[i].position.clone().add(V3(0, 0.8, 0));
      const b = this.posts[j].position.clone().add(V3(0, 0.8, 0));
      const mid = a.clone().lerp(b, 0.5).add(V3(0, -0.22, 0));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 40, 0.018, 10), velvet);
      R.add(tube);
    });
    // --- pellicules qui tourbillonnent
    this.films = [0, 1].map((k) => {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 2.4 + k * 2.2;
        pts.push(V3(Math.cos(a) * (1.55 + 0.2 * k), -1.0 + i * 0.17 + k * 0.2, Math.sin(a) * 0.9 - 0.5));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tex = TX.filmStripTexture(3 + k);
      tex.repeat.set(1 / 1.1, 1);
      const mesh = new THREE.Mesh(
        ribbonGeometry(curve, 0.2, 220, 1.5),
        this.m(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0.55, 0.5, 0.45), roughness: 0.4, metalness: 0.2, alphaTest: 0.5, side: THREE.DoubleSide }))
      );
      R.add(mesh);
      return { mesh, tex };
    });
    // --- clap de cinéma
    this.clap = new THREE.Group();
    const slate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.025), [
      this.m(new THREE.MeshStandardMaterial({ color: 0x111111 })), this.m(new THREE.MeshStandardMaterial({ color: 0x111111 })),
      this.m(new THREE.MeshStandardMaterial({ color: 0x111111 })), this.m(new THREE.MeshStandardMaterial({ color: 0x111111 })),
      this.m(new THREE.MeshStandardMaterial({ map: TX.slateTexture(), roughness: 0.5 })), this.m(new THREE.MeshStandardMaterial({ color: 0x111111 })),
    ]);
    const stripes = TX.clapStripes();
    const stripeMat = this.m(new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.4 }));
    const blackM = this.m(new THREE.MeshStandardMaterial({ color: 0x111111 }));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.075, 0.025), [blackM, blackM, blackM, blackM, stripeMat, stripeMat]);
    bar.position.set(0, 0.29, 0);
    this.clapArm = new THREE.Group();
    this.clapArm.position.set(-0.31, 0.33, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.075, 0.025), [blackM, blackM, blackM, blackM, stripeMat, stripeMat]);
    arm.position.set(0.31, 0.0375, 0);
    this.clapArm.add(arm);
    this.clap.add(slate, bar, this.clapArm);
    this.clap.position.set(-1.05, 0.35, 0.35);
    R.add(this.clap);
    // --- contour à la craie (se dessine) + marqueurs de preuve
    this.chalkU = { uProg: { value: 0 } };
    const chalkMat = new THREE.MeshBasicMaterial({ map: TX.chalkOutlineTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const cu = this.chalkU;
    const prevCompile = null;
    chalkMat.onBeforeCompile = (sh) => {
      sh.uniforms.uProg = cu.uProg;
      sh.uniforms.uReveal = this.U.uReveal;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uProg;\nuniform float uReveal;')
        .replace(
          '#include <map_fragment>',
          `vec4 ch = texture2D( map, vMapUv );
           float drawn = step( ch.r, uProg ) * ch.a;
           float head = exp( -pow( ( ch.r - uProg ) / 0.02, 2.0 ) ) * ch.a;
           diffuseColor = vec4( vec3( 1.0, 0.97, 0.92 ) * ( drawn * 1.6 + head * 6.0 ), ( drawn + head ) * uReveal );`
        );
    };
    chalkMat.customProgramCacheKey = () => 'chalk';
    this.chalk = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), chalkMat);
    this.chalk.position.set(1.35, -0.55, 0.35);
    this.chalk.rotation.set(-0.95, -0.35, 0.5);
    R.add(this.chalk);
    this.markers = [1, 2, 3].map((n, i) => {
      const g = new THREE.Group();
      const mat = this.m(new THREE.MeshStandardMaterial({ map: TX.markerTexture(n), roughness: 0.5, side: THREE.DoubleSide }));
      const a = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), mat);
      a.rotation.x = -0.45;
      a.position.set(0, 0.055, 0.025);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), mat);
      b.rotation.x = 0.45;
      b.position.set(0, 0.055, -0.025);
      g.add(a, b);
      g.position.set(1.0 + i * 0.32, -0.78 + i * 0.12, 0.75 - i * 0.22);
      R.add(g);
      return g;
    });
    // --- flashs des photographes
    const fr = rng(9);
    this.flashes = [];
    for (let i = 0; i < 14; i++) {
      const s = glowSprite('#ffffff', 0.5, 4);
      s.position.set(mix(-2.3, 2.3, fr()), mix(-0.8, 1.6, fr()), mix(-2.6, -0.6, fr()));
      s.userData = { t0: fr() * 2.4, per: mix(0.9, 1.7, fr()) };
      R.add(s);
      this.flashes.push(s);
    }
    // --- faisceaux de projecteurs
    this.beams = [0, 1].map((k) => {
      const geo = new THREE.ConeGeometry(0.6, 7, 32, 1, true);
      geo.translate(0, -3.5, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 }, uC: { value: new THREE.Color(k ? '#ffd6d6' : '#dfe8ff') } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uA; uniform vec3 uC; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 1.5); float l = smoothstep(0.0, 0.15, vUv.y) * pow(vUv.y, 1.8); gl_FragColor = vec4(uC * f * l * uA, 1.0); }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(k ? 1.6 : -1.7, -1.3, -2.4);
      R.add(m);
      return m;
    });
    const glow = glowSprite('#ff2a45', 5.5, 0.32);
    glow.position.set(0, 0, -2.0);
    R.add(glow);
    this.glow = glow;
    this.pf = new ParticleField({ count: 380, box: [[-2.4, -1.4, -2.2], [2.4, 1.8, 1.2]], colors: ['#ffffff', '#ffd0d4', '#ff6a7a'], size: [1.4, 4.5], seed: 41, mode: 0, speed: 0.8, alpha: [0.2, 0.75], twinkle: 0.9, H: world.H });
    this.frame.add(this.pf.points);
  }

  update(t, focus, aperture) {
    const r = super.update(t);
    if (!this.frame.visible) return;
    const tau = t - this.window[0];
    this.pf.update(t, r, focus, aperture);
    this.glow.material.opacity = r;
    this.root.rotation.y = -0.1 * Math.sin(tau * 0.3);
    // ondulation du tapis
    const pos = this.carpetGeo.attributes.position.array;
    const base = this.carpetBase;
    for (let i = 0; i < pos.length; i += 3) {
      const k = i / 3;
      const seg = Math.floor(k / 2) / 160;
      pos[i + 1] = base[i + 1] + Math.sin(seg * 9 - tau * 1.6) * 0.07 * seg * 1.5;
      pos[i] = base[i] + Math.sin(seg * 5 - tau * 1.1) * 0.05 * seg;
    }
    this.carpetGeo.attributes.position.needsUpdate = true;
    this.carpetGeo.computeVertexNormals();
    this.posts.forEach((p, i) => (p.position.y = -1.25 + Math.sin(tau * 0.9 + i) * 0.03));
    this.films.forEach((f, k) => {
      f.tex.offset.x = -tau * 0.35 * (k ? 1 : -1);
      f.mesh.rotation.y = tau * 0.12 * (k ? -1 : 1);
    });
    // clap : s'ouvre puis « clap ! »
    const tc = 0.95;
    const open = tau < tc ? E.outCubic(remap(tau, 0.0, 0.7)) : 1 - E.inQuad(remap(tau, tc, tc + 0.09));
    const bounce = tau > tc + 0.09 ? 0.06 * Math.exp(-(tau - tc - 0.09) * 18) * Math.abs(Math.sin((tau - tc) * 40)) : 0;
    this.clapArm.rotation.z = 0.62 * open + bounce;
    this.clap.rotation.set(0.12 + 0.05 * Math.sin(tau * 0.8), 0.45 + 0.15 * Math.sin(tau * 0.4), -0.08);
    this.clap.position.y = 0.35 + Math.sin(tau * 0.7) * 0.04;
    this.chalkU.uProg.value = E.inOutSine(remap(tau, 0.35, 2.0));
    this.markers.forEach((m, i) => (m.rotation.y = tau * 0.4 + i));
    // flashs (dont un gros flash synchronisé avec le clap)
    this.flashes.forEach((s, i) => {
      const { t0, per } = s.userData;
      const ph = ((tau - t0) % per + per) % per;
      let f = Math.exp(-ph * 22) * (ph < 0.25 ? 1 : 0);
      if (i === 0) f = Math.max(f, Math.exp(-Math.max(0, tau - tc - 0.09) * 14) * (tau > tc + 0.09 ? 1.6 : 0));
      s.material.opacity = f * r;
      s.scale.setScalar(0.6 + f * 0.8);
    });
    this.beams.forEach((b, k) => {
      b.rotation.z = (k ? -0.35 : 0.35) + Math.sin(tau * 0.5 + k * 2) * 0.25;
      b.rotation.x = -0.25 + Math.sin(tau * 0.37 + k) * 0.1;
      b.material.uniforms.uA.value = 0.25 * r;
    });
  }
}

// =========================================================================== 3. UNDERCOVER
function maskShape() {
  const s = new THREE.Shape();
  // demi-contour droit (x >= 0), symétrisé : ailes pointues vers le haut
  s.moveTo(0, 0.045);
  s.bezierCurveTo(0.06, 0.075, 0.13, 0.07, 0.2, 0.085);
  s.bezierCurveTo(0.29, 0.1, 0.36, 0.15, 0.43, 0.2);
  s.bezierCurveTo(0.41, 0.1, 0.37, 0.0, 0.3, -0.06);
  s.bezierCurveTo(0.24, -0.11, 0.15, -0.105, 0.08, -0.07);
  s.bezierCurveTo(0.05, -0.05, 0.03, -0.03, 0.0, -0.035);
  s.bezierCurveTo(-0.03, -0.03, -0.05, -0.05, -0.08, -0.07);
  s.bezierCurveTo(-0.15, -0.105, -0.24, -0.11, -0.3, -0.06);
  s.bezierCurveTo(-0.37, 0.0, -0.41, 0.1, -0.43, 0.2);
  s.bezierCurveTo(-0.36, 0.15, -0.29, 0.1, -0.2, 0.085);
  s.bezierCurveTo(-0.13, 0.07, -0.06, 0.075, 0.0, 0.045);
  for (const sx of [-1, 1]) {
    const h = new THREE.Path();
    h.moveTo(sx * 0.07, 0.0);
    h.bezierCurveTo(sx * 0.1, 0.045, sx * 0.2, 0.05, sx * 0.27, 0.025);
    h.bezierCurveTo(sx * 0.22, -0.035, sx * 0.12, -0.04, sx * 0.07, 0.0);
    s.holes.push(h);
  }
  return s;
}

export class UndercoverVision extends Vision {
  constructor(world, opts) {
    super(world, {
      ...opts,
      edge: '#46dcff',
      label: ['UNDERCOVER', 'IDENTITÉ SECRÈTE', 'rgba(120,220,255,0.95)'],
      rig: {
        key: { pos: [-0.8, 2.6, 2.6], target: [0, 0.2, 0], color: '#dfeeff', intensity: 2.6, angle: 0.7 },
        a: { pos: [0.4, 0.8, -2.2], color: '#25d4ff', intensity: 12 },
        b: { pos: [2.3, -0.3, 0.6], color: '#ff1f35', intensity: 5 },
      },
    });
    const R = this.root;
    // --- empreinte digitale géante
    const fp = TX.fingerprintTexture();
    this.fp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), this.m(new THREE.MeshBasicMaterial({ map: fp, color: new THREE.Color('#38d8ff').multiplyScalar(0.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.fp.position.set(0.1, 0.2, -2.4);
    R.add(this.fp);
    // --- silhouettes (qui est l'agent infiltré ?)
    this.sils = [-1.15, 0.0, 1.15].map((x, i) => {
      const g = new THREE.Group();
      const glowM = this.m(new THREE.MeshBasicMaterial({ map: TX.silhouetteTexture(i === 1 ? 1 : 0, true), color: new THREE.Color(i === 1 ? '#ff3346' : '#38d8ff').multiplyScalar(1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const glowP = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), glowM);
      glowP.position.z = -0.02;
      glowP.scale.setScalar(1.06);
      const body = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), this.m(new THREE.MeshBasicMaterial({ map: TX.silhouetteTexture(i === 1 ? 1 : 0, false), transparent: true, alphaTest: 0.5 })));
      g.add(glowP, body);
      g.position.set(x, -0.35, -1.0 - (i === 1 ? 0.35 : 0));
      g.scale.setScalar(i === 1 ? 1.05 : 0.95);
      R.add(g);
      return g;
    });
    // --- masque noir laqué au premier plan
    const mg = new THREE.ExtrudeGeometry(maskShape(), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 28 });
    const pos = mg.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - pos.getX(i) * pos.getX(i) * 1.1);
    mg.computeVertexNormals();
    this.mask = new THREE.Mesh(mg, [
      this.m(new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }), { rim: 1.2, rimColor: '#7fe6ff' }),
      this.m(new THREE.MeshStandardMaterial({ color: 0xd7a650, metalness: 1, roughness: 0.25 })),
    ]);
    this.mask.scale.setScalar(1.25);
    this.mask.position.set(0.0, 0.62, 0.55);
    R.add(this.mask);
    // --- rayons lasers rouges
    const laserMat = this.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.08, 0.12).multiplyScalar(5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const lg = new THREE.CylinderGeometry(0.005, 0.005, 7, 6);
    this.lasers = [0, 1, 2, 3, 4].map((i) => {
      const m = new THREE.Mesh(lg, laserMat);
      m.position.set(0, -0.9 + i * 0.42, -0.3 - (i % 2) * 0.6);
      m.rotation.z = Math.PI / 2 + (i % 2 ? 0.35 : -0.3);
      R.add(m);
      return m;
    });
    const lglow = this.m(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.1, 0.15).multiplyScalar(0.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const lgg = new THREE.CylinderGeometry(0.03, 0.03, 7, 8);
    this.lasers.forEach((l) => l.add(new THREE.Mesh(lgg, lglow)));
    // --- documents confidentiels
    const dr = rng(5);
    this.docs = [0, 1, 2, 3, 4, 5].map((i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.48), this.m(new THREE.MeshStandardMaterial({ map: TX.documentTexture(10 + i), roughness: 0.7, side: THREE.DoubleSide })));
      m.userData = { a: (i / 6) * Math.PI * 2, r: 1.6 + dr() * 0.5, y: -0.7 + dr() * 1.8, s: mix(0.12, 0.25, dr()), ph: dr() * 6 };
      R.add(m);
      return m;
    });
    // ligne de scan
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.012), this.m(new THREE.MeshBasicMaterial({ color: new THREE.Color('#46dcff').multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.scan.position.z = -0.6;
    R.add(this.scan);
    const glow = glowSprite('#1aa8ff', 5.5, 0.3);
    glow.position.set(0, 0.1, -2.6);
    R.add(glow);
    this.glow = glow;
    this.pf = new ParticleField({ count: 420, box: [[-2.4, -1.4, -2.2], [2.4, 1.8, 1.2]], colors: ['#7fe6ff', '#bff3ff', '#ff4050'], size: [1.2, 4], seed: 51, mode: 1, speed: 0.6, alpha: [0.2, 0.8], twinkle: 0.7, H: world.H });
    this.frame.add(this.pf.points);
  }

  update(t, focus, aperture) {
    const r = super.update(t);
    if (!this.frame.visible) return;
    const tau = t - this.window[0];
    this.pf.update(t, r, focus, aperture);
    this.glow.material.opacity = r;
    this.root.rotation.y = 0.1 * Math.sin(tau * 0.3);
    this.fp.rotation.z = tau * 0.08;
    this.sils.forEach((s, i) => (s.position.y = -0.35 + Math.sin(tau * 0.6 + i * 1.3) * 0.03));
    this.mask.rotation.set(0.1 + 0.08 * Math.sin(tau * 0.7), -0.35 + 0.55 * Math.sin(tau * 0.45), 0.06 * Math.sin(tau * 0.9));
    this.mask.position.y = 0.62 + Math.sin(tau * 0.8) * 0.04;
    this.lasers.forEach((l, i) => {
      l.rotation.z = Math.PI / 2 + (i % 2 ? 0.35 : -0.3) + Math.sin(tau * 0.6 + i) * 0.12;
      l.position.y = -0.9 + i * 0.42 + Math.sin(tau * 0.5 + i * 2) * 0.1;
    });
    this.docs.forEach((d) => {
      const u = d.userData;
      const a = u.a + tau * u.s;
      d.position.set(Math.cos(a) * u.r, u.y + Math.sin(tau * 0.7 + u.ph) * 0.08, Math.sin(a) * u.r * 0.6 - 0.6);
      d.rotation.set(Math.sin(tau * 0.9 + u.ph) * 0.4, -a + 1.2, Math.sin(tau * 0.6 + u.ph) * 0.3);
    });
    this.scan.position.y = mix(1.3, -1.3, (tau * 0.45) % 1);
  }
}

// =========================================================================== 4. EXPRNC. FOOD — cocktails
export class FoodVision extends Vision {
  constructor(world, opts) {
    super(world, {
      ...opts,
      edge: '#ff5ab8',
      label: ['EXPRNC. FOOD', 'CRÉEZ VOS COCKTAILS', 'rgba(255,150,210,0.95)'],
      rig: {
        key: { pos: [0.8, 2.8, 2.6], target: [0, 0, 0], color: '#fff0e2', intensity: 2.8, angle: 0.75 },
        a: { pos: [-1.8, 0.6, -1.6], color: '#ff2fa0', intensity: 11 },
        b: { pos: [2.1, -0.4, -0.2], color: '#ffb02e', intensity: 7 },
      },
    });
    const R = this.root;
    const glassMat = () =>
      this.m(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 3, specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false }), { rim: 1.6, rimColor: '#fff3fb' });
    const liquidMat = (c) => this.m(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.85, roughness: 0.15, transparent: true, opacity: 0.9 }), { rim: 0.8, rimColor: c });
    // martini
    const martini = new THREE.Group();
    martini.add(new THREE.Mesh(lathe([[0.005, 0], [0.16, 0.005], [0.17, 0.02], [0.02, 0.03], [0.015, 0.33], [0.03, 0.36], [0.27, 0.58], [0.28, 0.59]], 64), glassMat()));
    const ml = new THREE.Mesh(lathe([[0.0, 0.37], [0.03, 0.375], [0.235, 0.545], [0.0, 0.545]], 64), liquidMat('#ff3d8b'));
    martini.add(ml);
    // coupe
    const coupe = new THREE.Group();
    coupe.add(new THREE.Mesh(lathe([[0.005, 0], [0.15, 0.005], [0.16, 0.02], [0.02, 0.03], [0.015, 0.3], [0.06, 0.33], [0.2, 0.38], [0.25, 0.46], [0.255, 0.5]], 64), glassMat()));
    coupe.add(new THREE.Mesh(lathe([[0, 0.315], [0.06, 0.335], [0.19, 0.385], [0.235, 0.455], [0, 0.455]], 64), liquidMat('#ffa62b')));
    // tumbler haut
    const high = new THREE.Group();
    high.add(new THREE.Mesh(lathe([[0.005, 0], [0.15, 0.0], [0.155, 0.02], [0.16, 0.62], [0.162, 0.63]], 64), glassMat()));
    high.add(new THREE.Mesh(lathe([[0, 0.03], [0.14, 0.03], [0.145, 0.46], [0, 0.46]], 64), liquidMat('#84ff4a')));
    martini.position.set(-0.85, -0.25, 0.25);
    coupe.position.set(0.8, 0.0, -0.2);
    high.position.set(0.05, -0.75, 0.6);
    [martini, coupe, high].forEach((g) => g.scale.setScalar(1.45));
    this.glasses = [martini, coupe, high];
    this.glasses.forEach((g) => R.add(g));
    // coulée lumineuse qui remplit le martini
    const pour = new THREE.CatmullRomCurve3([V3(0.3, 1.75, -0.7), V3(-0.1, 1.45, -0.35), V3(-0.5, 1.05, 0.05), V3(-0.8, 0.72, 0.22), V3(-0.85, 0.55, 0.25)]);
    const pc = document.createElement('canvas');
    pc.width = 256;
    pc.height = 16;
    const px = pc.getContext('2d');
    const pg = px.createLinearGradient(0, 0, 256, 0);
    pg.addColorStop(0, '#ff5ab8');
    pg.addColorStop(0.5, '#ffb347');
    pg.addColorStop(1, '#ff5ab8');
    px.fillStyle = pg;
    px.fillRect(0, 0, 256, 16);
    const ptex = new THREE.CanvasTexture(pc);
    ptex.colorSpace = THREE.SRGBColorSpace;
    ptex.wrapS = THREE.RepeatWrapping;
    this.pourTex = ptex;
    this.pour = new THREE.Mesh(new THREE.TubeGeometry(pour, 100, 0.022, 12), this.m(new THREE.MeshBasicMaterial({ map: ptex, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    ptex.repeat.set(3, 1);
    R.add(this.pour);
    // agrumes, glaçons, menthe, cerises
    const fr = rng(13);
    this.items = [];
    const kinds = ['lemon', 'lime', 'orange', 'lime', 'lemon'];
    const rindCol = { lemon: '#f1c21b', lime: '#4f9a2a', orange: '#e8711a' };
    kinds.forEach((k, i) => {
      const face = this.m(new THREE.MeshStandardMaterial({ map: TX.citrusTexture(k), roughness: 0.45, emissive: new THREE.Color(rindCol[k]), emissiveIntensity: 0.12 }));
      const rind = this.m(new THREE.MeshStandardMaterial({ color: rindCol[k], roughness: 0.5 }));
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.022, 48), [rind, face, face]);
      this.items.push({ m, a: (i / kinds.length) * Math.PI * 2, r: 1.45 + fr() * 0.35, y: -0.8 + fr() * 1.7, sp: mix(0.15, 0.3, fr()), rot: fr() * 6 });
      R.add(m);
    });
    const iceMat = this.m(new THREE.MeshPhysicalMaterial({ color: 0xdff6ff, roughness: 0.08, transparent: true, opacity: 0.35, envMapIntensity: 2.5, depthWrite: false }), { rim: 1.4, rimColor: '#cfefff' });
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.11, 0.11, 3, 0.018), iceMat);
      this.items.push({ m, a: fr() * 6.28, r: 0.9 + fr() * 1.1, y: -1.0 + fr() * 2.2, sp: mix(0.1, 0.25, fr()) * (fr() < 0.5 ? -1 : 1), rot: fr() * 6 });
      R.add(m);
    }
    const leaf = new THREE.Shape();
    leaf.moveTo(0, -0.09);
    leaf.quadraticCurveTo(0.07, -0.02, 0, 0.09);
    leaf.quadraticCurveTo(-0.07, -0.02, 0, -0.09);
    const leafMat = this.m(new THREE.MeshStandardMaterial({ color: 0x3fbf4a, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x0f4012 }));
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(leaf, 12), leafMat);
      this.items.push({ m, a: fr() * 6.28, r: 1.1 + fr() * 0.8, y: -0.6 + fr() * 1.6, sp: mix(0.15, 0.3, fr()), rot: fr() * 6 });
      R.add(m);
    }
    const cherryMat = this.m(new THREE.MeshPhysicalMaterial({ color: 0xc8001e, roughness: 0.15, clearcoat: 1, emissive: 0x300006 }));
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 16), cherryMat));
      const stem = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(0, 0.03, 0), V3(0.02, 0.1, 0), V3(0.06, 0.14, 0)), 12, 0.004, 6), leafMat);
      g.add(stem);
      this.items.push({ m: g, a: fr() * 6.28, r: 1.0 + fr() * 0.9, y: -0.5 + fr() * 1.5, sp: mix(0.15, 0.3, fr()), rot: fr() * 6 });
      R.add(g);
    }
    const glow = glowSprite('#ff3da5', 5.5, 0.32);
    glow.position.set(0, 0, -2.2);
    R.add(glow);
    this.glow = glow;
    this.pf = new ParticleField({ count: 460, box: [[-2.4, -1.5, -2.0], [2.4, 1.8, 1.2]], colors: ['#ffd1ec', '#ffffff', '#ffc477', '#c9ffb0'], size: [1.5, 5.5], seed: 61, mode: 1, speed: 0.55, alpha: [0.2, 0.8], twinkle: 0.6, H: world.H });
    this.frame.add(this.pf.points);
  }

  update(t, focus, aperture) {
    const r = super.update(t);
    if (!this.frame.visible) return;
    const tau = t - this.window[0];
    this.pf.update(t, r, focus, aperture);
    this.glow.material.opacity = r;
    this.root.rotation.y = -0.12 * Math.sin(tau * 0.3);
    this.glasses.forEach((g, i) => {
      g.rotation.set(0.12 * Math.sin(tau * 0.6 + i), tau * 0.25 * (i % 2 ? -1 : 1), 0.1 * Math.sin(tau * 0.5 + i * 2) + (i === 0 ? -0.08 : 0));
      g.position.y = [-0.25, 0.0, -0.75][i] + Math.sin(tau * 0.8 + i * 1.7) * 0.05;
    });
    this.pourTex.offset.x = -tau * 1.6;
    this.items.forEach((it) => {
      const a = it.a + tau * it.sp;
      it.m.position.set(Math.cos(a) * it.r, it.y + Math.sin(tau * 0.9 + it.rot) * 0.07, Math.sin(a) * it.r * 0.55 - 0.3);
      it.m.rotation.set(it.rot + tau * 0.6, it.rot * 0.5 + tau * 0.4, tau * 0.3);
    });
  }
}
