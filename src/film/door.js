// ---------------------------------------------------------------------------
// La porte : silhouette noire cernée de lumière, qui s'ouvre sur le rêve
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CUES, E, remap, smoothstep } from '../timeline.js';
import { glowSprite, ParticleField } from './dream.js';

export class Door {
  constructor() {
    const g = (this.group = new THREE.Group());
    const dark = new THREE.MeshStandardMaterial({ color: 0x0d0c0b, roughness: 0.55, metalness: 0.0 });
    const W = 0.96, H = 2.12;
    // chambranle
    const postGeo = new THREE.BoxGeometry(0.07, H + 0.07, 0.14);
    const p1 = new THREE.Mesh(postGeo, dark);
    p1.position.set(-W / 2 - 0.035, (H + 0.07) / 2, 0);
    const p2 = p1.clone();
    p2.position.x = W / 2 + 0.035;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, 0.07, 0.14), dark);
    lintel.position.set(0, H + 0.035, 0);
    g.add(p1, p2, lintel);
    // battant (pivot sur la charnière gauche)
    this.hinge = new THREE.Group();
    this.hinge.position.set(-W / 2, 0, -0.02);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.026, H - 0.02, 0.045), dark);
    leaf.position.set(W / 2, H / 2, 0);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xcaa56a, roughness: 0.3, metalness: 1.0 });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.03), handleMat);
    handle.position.set(W - 0.12, 1.02, 0.045);
    this.hinge.add(leaf, handle);
    g.add(this.hinge);
    // lumière de l'autre côté
    const lc = document.createElement('canvas');
    lc.width = 128;
    lc.height = 256;
    const lx = lc.getContext('2d');
    const lg = lx.createRadialGradient(64, 120, 4, 64, 120, 150);
    lg.addColorStop(0, '#ffffff');
    lg.addColorStop(0.45, '#d9cbb8');
    lg.addColorStop(1, '#6e6255');
    lx.fillStyle = lg;
    lx.fillRect(0, 0, 128, 256);
    const ltex = new THREE.CanvasTexture(lc);
    ltex.colorSpace = THREE.SRGBColorSpace;
    this.lightMat = new THREE.MeshBasicMaterial({ map: ltex, color: new THREE.Color(1.0, 0.93, 0.82).multiplyScalar(2) });
    this.light = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.lightMat);
    this.light.position.set(0, H / 2, -0.09);
    g.add(this.light);
    // filets de lumière qui filtrent autour du battant fermé
    this.leakMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.9, 0.75).multiplyScalar(6) });
    const strips = [
      [0.012, H - 0.02, W / 2 - 0.007, H / 2],
      [0.012, H - 0.02, -W / 2 + 0.007, H / 2],
      [W - 0.02, 0.012, 0, H - 0.007],
      [W - 0.02, 0.014, 0, 0.008],
    ];
    this.leaks = strips.map(([w, h, x, y]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.leakMat);
      m.position.set(x, y, -0.05);
      g.add(m);
      return m;
    });
    // halo derrière la porte
    this.glow = glowSprite('#ffe6c8', 3.2, 0.7);
    this.glow.position.set(0, 1.1, -0.3);
    g.add(this.glow);
    // rayons de lumière (god rays) qui sortent par l'embrasure
    const rc = document.createElement('canvas');
    rc.width = 64;
    rc.height = 512;
    const rx = rc.getContext('2d');
    const rg = rx.createLinearGradient(0, 0, 0, 512);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    rx.fillStyle = rg;
    rx.fillRect(0, 0, 64, 512);
    rx.globalCompositeOperation = 'destination-in';
    const sg = rx.createLinearGradient(0, 0, 64, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0)');
    sg.addColorStop(0.5, 'rgba(0,0,0,1)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    rx.fillStyle = sg;
    rx.fillRect(0, 0, 64, 512);
    const rtex = new THREE.CanvasTexture(rc);
    this.rayMat = new THREE.MeshBasicMaterial({ map: rtex, color: new THREE.Color(1.0, 0.9, 0.76), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide });
    this.rays = [];
    const rays = [[-0.32, 1.7, 0.28, 0.18], [0.05, 1.95, 0.45, -0.05], [0.3, 1.5, 0.3, -0.22], [-0.1, 1.1, 0.5, 0.08], [0.22, 0.75, 0.32, -0.12], [-0.28, 0.5, 0.26, 0.2]];
    rays.forEach(([x0, y0, w, ang]) => {
      const geo = new THREE.PlaneGeometry(w, 4.5);
      geo.translate(0, -2.25, 0);
      geo.rotateX(-Math.PI / 2 + 0.12);
      const m = new THREE.Mesh(geo, this.rayMat);
      m.position.set(x0, y0, -0.12);
      m.rotation.y = ang;
      m.rotation.z = ang * 0.5;
      g.add(m);
      this.rays.push(m);
    });
    this.motes = new ParticleField({ count: 260, box: [[-0.8, 0.05, -0.4], [0.8, 2.3, 2.8]], colors: ['#fff3e0', '#ffe2bd'], size: [1.5, 5], seed: 3, mode: 0, speed: 0.5, alpha: [0.2, 0.8], twinkle: 0.6 });
    g.add(this.motes.points);
    // nappe de lumière au sol devant la porte
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.moveTo(78, 0);
    x.lineTo(178, 0);
    x.lineTo(256, 512);
    x.lineTo(0, 512);
    x.closePath();
    x.filter = 'blur(6px)';
    x.fill();
    this.spillMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c),
      color: new THREE.Color(1.0, 0.9, 0.78),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    this.spill = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), this.spillMat);
    this.spill.rotation.x = -Math.PI / 2;
    this.spill.position.set(0, 0.003, 1.7);
    g.add(this.spill);
  }

  update(t) {
    const open = E.outCubic(remap(t, CUES.doorOpen, CUES.doorOpen + 1.15));
    this.hinge.rotation.y = -1.85 * open;
    // la lumière s'intensifie en s'approchant, puis s'efface au passage du seuil
    const pass = 1 - smoothstep(CUES.threshold - 0.25, CUES.threshold + 0.02, t);
    const appear = smoothstep(0.0, 0.5, t);
    this.lightMat.color.setRGB(1.0, 0.93, 0.82).multiplyScalar((0.7 + 1.0 * open) * pass * appear);
    this.leakMat.color.setRGB(1.0, 0.9, 0.75).multiplyScalar(6 * appear * (1 - open * 0.7) * pass);
    this.glow.material.opacity = 0.45 * open * pass;
    this.spillMat.opacity = 0.55 * open * pass;
    this.rayMat.opacity = 0.22 * open * pass;
    this.motes.update(t, open * pass, 2.0, 4);
    this.group.visible = t < CUES.threshold + 0.15;
  }
}
