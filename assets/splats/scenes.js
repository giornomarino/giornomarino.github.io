// Procedural splat scenes. Every model is built from point samples scattered
// over simple shapes (ellipsoids, tubes, triangles), coloured with noise.
import * as THREE from '../vendor/three.module.min.js';

/* ---------- utilities ---------- */
function rng(seed){
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z){ const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z){
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}
function fbm(x, y, z){ return vnoise(x, y, z) * 0.5 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.2; }
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

class Cloud {
  constructor(R, soft = false){
    this.R = R; this.soft = soft;
    this.p = []; this.n = []; this.c = []; this.s = []; this.e = []; this.m = []; this.sc = []; this.a = [];
    this.i = 0;
  }
  push(p, n, c, s, o = {}){
    const R = this.R;
    this.p.push(p.x, p.y, p.z);
    if (!this.soft) { this.n.push(n.x, n.y, n.z); this.e.push(o.e || 0); }
    else this.a.push(o.a ?? 1);
    this.c.push(c[0], c[1], c[2]);
    this.s.push(s * (0.85 + R() * 0.3));
    this.m.push(o.g || 0, o.u || 0, o.k ?? this.i * 0.618);
    // starting offset for the "assemble" intro
    const th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1), sp = (o.spread || 2.2) * (0.4 + R());
    this.sc.push(Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp + 0.6, Math.sin(ph) * Math.sin(th) * sp);
    this.i++;
  }
}

const tmpM = new THREE.Matrix4();
function ellipsoid(cl, o){
  const R = cl.R, r = o.r, c = V(o.c);
  const p = 1.6, area = 4 * Math.PI * Math.pow((Math.pow(r[0] * r[1], p) + Math.pow(r[0] * r[2], p) + Math.pow(r[1] * r[2], p)) / 3, 1 / p);
  const n = Math.ceil(area * (o.density || 900));
  const rot = o.rot ? tmpM.clone().makeRotationFromEuler(new THREE.Euler(...o.rot)) : null;
  for (let i = 0; i < n; i++){
    const th = R() * Math.PI * 2, z = 2 * R() - 1, q = Math.sqrt(1 - z * z);
    const d = new THREE.Vector3(q * Math.cos(th), z, q * Math.sin(th));
    const depth = 1 - R() * (o.fill || 0.06);
    const pos = new THREE.Vector3(d.x * r[0], d.y * r[1], d.z * r[2]).multiplyScalar(depth);
    const nor = new THREE.Vector3(d.x / r[0], d.y / r[1], d.z / r[2]).normalize();
    if (rot){ pos.applyMatrix4(rot); nor.applyMatrix4(rot); }
    pos.add(c);
    cl.push(pos, nor, o.color(pos, nor, 0, R), o.size || 0.07, { e: o.e, g: o.g, u: o.u ?? 0, k: o.k });
  }
}

function tube(cl, o){
  const R = cl.R;
  const curve = new THREE.CatmullRomCurve3(o.pts.map(V), false, 'centripetal');
  const len = curve.getLength();
  let rmax = 0, rsum = 0;
  for (let i = 0; i <= 20; i++){ const r = o.r(i / 20); rmax = Math.max(rmax, r); rsum += r; }
  const area = len * 2 * Math.PI * (rsum / 21) + 0.01;
  const n = Math.max(24, Math.ceil(area * (o.density || 900)));
  const up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(1, 0, 0);
  let made = 0, guard = 0;
  while (made < n && guard++ < n * 8){
    const t = R();
    const rad = o.r(t);
    if (R() > Math.max(0.2, rad / rmax)) continue;
    const P = curve.getPointAt(t), T = curve.getTangentAt(t);
    const a = Math.abs(T.y) < 0.92 ? up : ax;
    const N1 = new THREE.Vector3().crossVectors(T, a).normalize();
    const B = new THREE.Vector3().crossVectors(T, N1).normalize();
    const th = R() * Math.PI * 2;
    const dir = N1.multiplyScalar(Math.cos(th)).add(B.multiplyScalar(Math.sin(th)));
    const pos = P.clone().addScaledVector(dir, rad * (1 - R() * 0.08));
    cl.push(pos, dir, o.color(pos, dir, t, R), (o.size || 0.07) * (o.sizeT ? o.sizeT(t) : 1),
      { e: typeof o.e === 'function' ? o.e(t) : o.e, g: o.g, u: o.uMap ? o.uMap(t) : t, k: o.k });
    made++;
  }
  return curve;
}

function cone(cl, base, tip, r0, o){
  return tube(cl, { ...o, pts: [base, tip], r: (t) => r0 * Math.pow(1 - t, o.pow || 1) + 0.004 });
}

function tri(cl, a, b, c, o){
  const R = cl.R, A = V(a), B = V(b), C = V(c);
  const e1 = B.clone().sub(A), e2 = C.clone().sub(A);
  const nrm = new THREE.Vector3().crossVectors(e1, e2);
  const area = nrm.length() / 2; nrm.normalize();
  const n = Math.ceil(area * (o.density || 600));
  for (let i = 0; i < n; i++){
    let u = R(), v = R(); if (u + v > 1){ u = 1 - u; v = 1 - v; }
    const pos = A.clone().addScaledVector(e1, u).addScaledVector(e2, v);
    const nn = R() < 0.5 ? nrm.clone() : nrm.clone().negate();
    cl.push(pos, nn, o.color(pos, nn, u + v, R), o.size || 0.06, { e: o.e, g: o.g, u: o.uOf ? o.uOf(pos) : 0, k: o.k });
  }
}

function softBlob(cl, center, radii, n, o){
  const R = cl.R;
  for (let i = 0; i < n; i++){
    const th = R() * Math.PI * 2, z = 2 * R() - 1, q = Math.sqrt(1 - z * z), d = Math.pow(R(), 0.4);
    const pos = new THREE.Vector3(q * Math.cos(th) * radii[0], z * radii[1], q * Math.sin(th) * radii[2]).multiplyScalar(d).add(V(center));
    cl.push(pos, null, o.color(pos, d, R), o.size, { a: o.a, g: o.g, u: o.u ?? R(), k: R() * 10 });
  }
}

/* ---------- Scene 1: ice dragon ---------- */
function buildDragon(){
  const R = rng(11);
  const S = new Cloud(R);

  const scaleCol = (p, n) => {
    const v = fbm(p.x * 4 + 3, p.y * 4, p.z * 4);
    let c = mix3([0.17, 0.27, 0.46], [0.42, 0.58, 0.82], clamp01(v * 1.6 - 0.3));
    if (n.y < -0.35) c = mix3(c, [0.55, 0.68, 0.88], 0.35);
    if (hash3(p.x * 91, p.y * 91, p.z * 91) > 0.94) c = [0.78, 0.9, 1.0];
    return c;
  };
  const bone = (p, n, t) => {
    const v = fbm(p.x * 6, p.y * 6, p.z * 6);
    return mix3([0.62, 0.72, 0.88], [0.92, 0.96, 1.0], clamp01(v + t * 0.4));
  };
  const darkSpike = (p, n, t) => mix3([0.12, 0.17, 0.3], [0.36, 0.48, 0.68], t * 0.8 + hash3(p.x * 50, p.y, p.z) * 0.15);
  const rock = (p, n) => {
    const v = fbm(p.x * 2.5 + 9, p.y * 2.5, p.z * 2.5);
    let c = mix3([0.07, 0.1, 0.17], [0.22, 0.3, 0.44], clamp01(v * 1.5 - 0.2));
    if (n.y > 0.8 && v > 0.64) c = mix3(c, [0.5, 0.62, 0.8], 0.55);
    return c;
  };
  const ice = (p, n, t) => mix3([0.36, 0.58, 0.84], [0.82, 0.94, 1.0], clamp01(t * 0.9 + (n.x > 0.3 ? 0.25 : 0)));

  // rocky ledge
  const groundH = (x, z) => -1 + (fbm(x * 1.4 + 5, 0, z * 1.4) - 0.5) * 0.32 + Math.max(0, fbm(x * 3, 1, z * 3) - 0.62) * 0.6;
  const edge = (th) => 2.3 * (0.82 + 0.18 * vnoise(Math.cos(th) * 2 + 4, Math.sin(th) * 2, 0.5));
  for (let i = 0; i < 15000; i++){
    const th = R() * Math.PI * 2, r = 2.35 * Math.sqrt(R());
    if (r > edge(th)) continue;
    const x = r * Math.cos(th), z = r * Math.sin(th), y = groundH(x, z);
    const e = 0.03;
    const nor = new THREE.Vector3(groundH(x - e, z) - groundH(x + e, z), 2 * e, groundH(x, z - e) - groundH(x, z + e)).normalize();
    const pos = new THREE.Vector3(x, y, z);
    S.push(pos, nor, rock(pos, nor), 0.08);
  }
  for (let i = 0; i < 4200; i++){ // cliff skirt
    const th = R() * Math.PI * 2, d = Math.pow(R(), 0.8);
    const er = edge(th) * (1 - d * 0.35 - R() * 0.05);
    const x = er * Math.cos(th), z = er * Math.sin(th);
    const pos = new THREE.Vector3(x, groundH(x, z) - d * (0.6 + 0.35 * vnoise(th * 3, 2, 0)), z);
    const nor = new THREE.Vector3(Math.cos(th), -0.3, Math.sin(th)).normalize();
    S.push(pos, nor, mix3(rock(pos, nor), [0.04, 0.06, 0.1], d * 0.7), 0.085);
  }
  // glowing ice pool in front of the claws
  for (let i = 0; i < 900; i++){
    const th = R() * Math.PI * 2, r = 0.42 * Math.sqrt(R()) * (0.85 + 0.15 * Math.sin(th * 3));
    const pos = new THREE.Vector3(0.1 + r * Math.cos(th) * 1.3, -0.93, 1.05 + r * Math.sin(th));
    S.push(pos, new THREE.Vector3(0, 1, 0), mix3([0.3, 0.6, 0.9], [0.75, 0.92, 1.0], R() * 0.4 + (1 - r / 0.42) * 0.5), 0.07, { e: 0.6, g: 5 });
  }
  // ice crystals
  const crystals = [
    [1.45, 0.25, 0.75, 0.13, 0.25, 0.1], [1.7, -0.15, 0.55, 0.09, -0.3, 0.2], [1.25, 0.6, 0.45, 0.08, 0.2, -0.25],
    [1.6, 0.6, 1.0, 0.15, 0.05, -0.1], [1.95, 0.25, 0.4, 0.07, 0.4, 0.15],
    [-1.55, -0.45, 0.9, 0.14, -0.15, -0.2], [-1.8, -0.1, 0.55, 0.09, -0.4, 0.1], [-1.35, -0.9, 0.6, 0.1, 0.25, -0.3],
    [-0.95, 1.25, 0.4, 0.07, -0.2, 0.3], [-1.15, 1.05, 0.28, 0.05, 0.3, 0.2], [0.9, 1.35, 0.3, 0.06, 0.3, -0.2],
  ];
  for (const [x, z, h, rad, tx, tz] of crystals){
    const y0 = groundH(x, z) - 0.05;
    tube(S, {
      pts: [[x, y0, z], [x + tx * h, y0 + h, z + tz * h]],
      r: (t) => (t < 0.72 ? rad : rad * (1 - (t - 0.72) / 0.28)) + 0.004,
      color: ice, size: 0.06, e: (t) => 0.05 + t * 0.25, density: 1300,
    });
  }

  // body
  ellipsoid(S, { c: [0, -0.4, -0.15], r: [0.72, 0.6, 0.68], color: scaleCol, g: 7 });
  ellipsoid(S, { c: [0, -0.15, -0.8], r: [0.78, 0.58, 0.75], color: scaleCol, g: 7 });
  ellipsoid(S, { c: [0, -0.55, -1.45], r: [0.5, 0.36, 0.6], color: scaleCol });
  tube(S, { pts: [[0, -0.6, -1.7], [0.4, -0.85, -2.0], [1.1, -0.9, -1.8], [1.5, -0.85, -1.2]], r: (t) => 0.3 * (1 - t) + 0.03, color: scaleCol });
  // neck (group 6 follows the head partially)
  const neckPts = [[0, -0.05, -0.35], [0, 0.42, -0.1], [0.05, 0.78, 0.2], [0.1, 0.92, 0.42]];
  const neck = tube(S, { pts: neckPts, r: (t) => 0.36 - t * 0.14, color: scaleCol, g: 6 });

  // head (group 1)
  ellipsoid(S, { c: [0.1, 1.02, 0.6], r: [0.3, 0.26, 0.38], color: scaleCol, g: 1 });
  ellipsoid(S, { c: [0.12, 0.93, 1.0], r: [0.18, 0.14, 0.36], color: scaleCol, g: 1 });
  ellipsoid(S, { c: [0.12, 0.76, 0.86], r: [0.16, 0.07, 0.34], rot: [0.25, 0, 0], color: (p, n) => mix3(scaleCol(p, n), [0.1, 0.14, 0.24], 0.4), g: 1 });
  for (const s of [-1, 1]){
    ellipsoid(S, { c: [0.1 + s * 0.17, 1.13, 0.78], r: [0.1, 0.05, 0.16], color: scaleCol, g: 1 });            // brow
    ellipsoid(S, { c: [0.1 + s * 0.2, 1.06, 0.84], r: [0.055, 0.04, 0.05], color: () => [1.0, 0.62, 0.22], e: 1.2, g: 2, size: 0.05, density: 2500 });
    tube(S, { pts: [[0.1 + s * 0.16, 1.18, 0.52], [0.1 + s * 0.38, 1.48, 0.12], [0.1 + s * 0.48, 1.82, -0.38], [0.1 + s * 0.42, 2.05, -0.92]],
      r: (t) => 0.095 * (1 - t) + 0.008, color: bone, g: 1, size: 0.06, density: 1300 });
    cone(S, [0.1 + s * 0.26, 0.95, 0.58], [0.1 + s * 0.78, 1.08, 0.1], 0.05, { color: bone, g: 1, size: 0.05, density: 1300 });
    cone(S, [0.1 + s * 0.22, 0.85, 0.66], [0.1 + s * 0.62, 0.72, 0.2], 0.04, { color: bone, g: 1, size: 0.05, density: 1300 });
    for (let j = 0; j < 4; j++){
      const bz = 0.42 - j * 0.05, by = 1.1 - j * 0.07;
      cone(S, [0.1 + s * 0.12, by, bz], [0.1 + s * (0.3 + j * 0.12), by + 0.18 - j * 0.12, bz - 0.45 - j * 0.05], 0.035, { color: darkSpike, g: 1, size: 0.05, density: 1300 });
    }
    for (let j = 0; j < 5; j++){ // teeth
      const z = 0.82 + j * 0.08;
      cone(S, [0.12 + s * (0.14 - j * 0.015), 0.85, z], [0.12 + s * (0.14 - j * 0.015), 0.76, z + 0.02], 0.018, { color: () => [0.93, 0.97, 1.0], g: 1, size: 0.04, density: 3000 });
    }
  }
  // spines along the neck and back
  for (let j = 0; j < 9; j++){
    const t = j / 8;
    const P = neck.getPointAt(1 - t);
    const len = 0.28 + t * 0.25;
    cone(S, [P.x, P.y + 0.15, P.z - 0.18], [P.x, P.y + 0.15 + len * 0.6, P.z - 0.18 - len], 0.05, { color: darkSpike, g: 6, uMap: () => 1 - t, size: 0.055, density: 1300 });
  }
  // long dark spears radiating from the back
  const spears = [[-0.4, 1.7, -1.0, 1.0], [0.35, 1.9, -1.2, 1.1], [-1.1, 1.3, -1.1, 0.9], [1.0, 1.4, -1.3, 0.95], [-0.1, 1.2, -1.9, 0.8], [1.4, 0.8, -0.9, 0.8], [-1.5, 0.6, -0.6, 0.75]];
  for (const [dx, dy, dz, l] of spears){
    const base = [dx * 0.25, 0.1, -0.7 + dz * 0.1];
    cone(S, base, [base[0] + dx * l, base[1] + dy * l, base[2] + dz * l], 0.06, { color: darkSpike, size: 0.055, density: 1100 });
  }
  // front legs + claws
  for (const s of [-1, 1]){
    tube(S, { pts: [[s * 0.5, -0.25, 0.1], [s * 0.82, -0.5, 0.45], [s * 0.62, -0.88, 0.78]], r: (t) => 0.2 - t * 0.09, color: scaleCol });
    ellipsoid(S, { c: [s * 0.62, -0.9, 0.82], r: [0.16, 0.07, 0.16], color: scaleCol });
    for (let j = 0; j < 4; j++){
      const a = (j - 1.5) * 0.42 + (s > 0 ? 0.15 : -0.15);
      const dx = Math.sin(a), dz = Math.cos(a);
      tube(S, { pts: [[s * 0.62 + dx * 0.1, -0.9, 0.82 + dz * 0.1], [s * 0.62 + dx * 0.24, -0.86, 0.82 + dz * 0.24], [s * 0.62 + dx * 0.33, -0.97, 0.82 + dz * 0.33]],
        r: (t) => 0.035 * (1 - t) + 0.006, color: bone, size: 0.045, density: 2500, e: 0.1 });
    }
  }
  // wings (group 3)
  for (const s of [-1, 1]){
    const root = [s * 0.5, 0.15, -0.75], elbow = [s * 1.1, 0.95, -0.95], tip = [s * 1.55, 1.55, -1.3];
    tube(S, { pts: [root, elbow, tip], r: (t) => 0.1 - t * 0.06, color: bone, g: 3, size: 0.06 });
    const fingers = [[s * 2.25, 1.35, -1.65], [s * 2.15, 0.6, -1.55], [s * 1.9, -0.05, -1.35], [s * 1.35, -0.35, -1.1]];
    let prev = elbow;
    for (const f of fingers){
      cone(S, tip, f, 0.035, { color: bone, g: 3, size: 0.05, density: 1500 });
      tri(S, tip, prev, f, { color: (p, n, w) => mix3([0.1, 0.15, 0.27], [0.24, 0.34, 0.52], hash3(p.x * 40, p.y * 40, p.z * 40) * 0.6 + w * 0.2), g: 3, size: 0.055, density: 380 });
      prev = f;
    }
    tri(S, prev, root, elbow, { color: () => [0.13, 0.19, 0.32], g: 3, size: 0.055, density: 380 });
  }

  // soft layers
  const spark = new Cloud(R, true);
  for (let i = 0; i < 650; i++){
    const th = R() * Math.PI * 2, r = 0.3 + 2.8 * Math.sqrt(R());
    spark.push(new THREE.Vector3(r * Math.cos(th), -1.2 + R() * 3.8, r * Math.sin(th)), null,
      R() < 0.85 ? [0.55, 0.78, 1.0] : [1.0, 0.75, 0.4], 0.035 + R() * 0.03, { a: 0.9, g: 0, u: R(), k: R() * 10 });
  }
  const breath = new Cloud(R, true);
  for (let i = 0; i < 160; i++){
    breath.push(new THREE.Vector3(0.12, 0.8, 1.35), null, [0.45, 0.66, 0.92], 0.06, { a: 0.13, g: 1, u: R(), k: R() * 10 });
  }
  for (let i = 0; i < 140; i++){
    const th = R() * Math.PI * 2, r = 0.4 * Math.sqrt(R());
    breath.push(new THREE.Vector3(0.1 + r * Math.cos(th) * 1.3, -0.93, 1.05 + r * Math.sin(th)), null, [0.6, 0.9, 1.0], 0.045, { a: 0.8, g: 2, u: R(), k: R() * 10 });
  }

  return { solid: S, soft: [{ cloud: spark, additive: true, order: 2 }, { cloud: breath, additive: true, order: 3 }] };
}

const DRAGON_SOLID = /* glsl */`
  void animate(inout vec3 p, inout vec3 n, inout vec3 c, inout float e, inout float s, vec3 m, float t){
    float g = m.x;
    if (g == 1.0 || g == 2.0 || g == 6.0){
      vec3 pivot = vec3(0.1, 0.85, 0.3);
      float w = g == 6.0 ? m.y * m.y : 1.0;
      float ax = (sin(t * 0.7) * 0.07 - 0.02) * w, ay = sin(t * 0.43) * 0.16 * w;
      p = rotY(rotX(p - pivot, ax), ay) + pivot;
      n = rotY(rotX(n, ax), ay);
      if (g == 2.0) e = 1.0 + 0.6 * (0.5 + 0.5 * sin(t * 2.2));
    } else if (g == 3.0){
      float side = sign(p.x);
      vec3 pivot = vec3(side * 0.5, 0.15, -0.75);
      float a = (sin(t * 0.9) * 0.13 + 0.03) * side;
      p = rotY(rotZ(p - pivot, a), -a * 0.4) + pivot;
      n = rotY(rotZ(n, a), -a * 0.4);
    } else if (g == 5.0){
      float r = length((p.xz - vec2(0.1, 1.05)) * vec2(0.77, 1.0));
      float wv = 0.5 + 0.5 * sin(r * 26.0 - t * 2.5);
      c *= 0.82 + 0.3 * wv;
      e = 0.45 + 0.35 * wv;
    } else if (g == 7.0){
      vec3 ctr = vec3(0.0, -0.3, -0.5);
      p = ctr + (p - ctr) * (1.0 + 0.018 * sin(t * 1.4));
    }
  }
`;
const DRAGON_SOFT = /* glsl */`
  void animateSoft(inout vec3 p, inout vec3 c, inout float a, inout float s, vec3 m, float t){
    if (m.x == 0.0){
      p.y = mod(p.y + 1.2 + t * 0.1 * (0.5 + m.y), 3.8) - 1.2;
      p.x += sin(t * 0.5 + m.z * 6.0) * 0.12;
      p.z += cos(t * 0.4 + m.z * 4.0) * 0.12;
      a *= 0.25 + 0.75 * pow(0.5 + 0.5 * sin(t * (1.2 + m.y * 2.0) + m.z * 20.0), 4.0);
    } else if (m.x == 1.0){
      float f = fract(t * 0.25 + m.y);
      vec3 dir = normalize(vec3(sin(t * 0.43) * 0.25, -0.38, 1.0));
      vec3 j = vec3(hash(m.z) - 0.5, hash(m.z + 1.3) - 0.5, hash(m.z + 2.7) - 0.5);
      p += dir * f * 1.3 + j * f * 0.9;
      s *= 1.0 + f * 2.5;
      a *= sin(f * 3.14159) * (0.35 + 0.65 * smoothstep(-0.2, 0.8, sin(t * 0.6 - f * 2.0)));
    } else {
      float f = fract(t * 0.18 + m.y);
      p.y += f * 1.3;
      p.x += sin(t + m.z * 5.0) * 0.05 * f;
      a *= (1.0 - f) * smoothstep(0.0, 0.1, f);
    }
  }
`;

/* ---------- Scene 2: squid in the rain ---------- */
function buildSquid(){
  const R = rng(23);
  const S = new Cloud(R);

  const red = (p, n) => {
    const v = fbm(p.x * 5 + 1, p.y * 5, p.z * 5);
    let c = mix3([0.55, 0.13, 0.15], [0.86, 0.3, 0.24], clamp01(v * 1.7 - 0.35));
    if (fbm(p.x * 11, p.y * 11, p.z * 11) > 0.66) c = [0.4, 0.08, 0.12];
    if (n.y > 0.55 && hash3(p.x * 70, p.y * 70, p.z * 70) > 0.9) c = [0.98, 0.62, 0.52]; // wet highlights
    return c;
  };

  // puddle
  const pEdge = (th) => 1.75 * (0.86 + 0.14 * vnoise(Math.cos(th) * 1.8 + 7, Math.sin(th) * 1.8, 0.2));
  for (let i = 0; i < 9500; i++){
    const th = R() * Math.PI * 2, r = 1.8 * Math.sqrt(R());
    if (r > pEdge(th)) continue;
    const pos = new THREE.Vector3(r * Math.cos(th), -1.0, r * Math.sin(th));
    const v = fbm(pos.x * 2, 0, pos.z * 2);
    let c = mix3([0.08, 0.12, 0.18], [0.2, 0.27, 0.38], v);
    if (hash3(pos.x * 60, 0, pos.z * 60) > 0.95) c = [0.45, 0.56, 0.72];
    const dz = Math.hypot(pos.x, pos.z - 0.1);
    if (dz < 0.75) c = mix3(c, [0.42, 0.14, 0.18], (1 - dz / 0.75) * 0.55); // reflection of the squid
    S.push(pos, new THREE.Vector3(0, 1, 0), c, 0.075, { g: 5 });
  }
  // muddy ground ring + skirt
  for (let i = 0; i < 7000; i++){
    const th = R() * Math.PI * 2, r = 1.4 + 0.95 * Math.sqrt(R());
    const pe = pEdge(th), oe = 2.25 * (0.9 + 0.1 * vnoise(th * 2, 3, 1));
    if (r < pe || r > oe) continue;
    const x = r * Math.cos(th), z = r * Math.sin(th);
    const y = -1.0 + (r - pe) * 0.12 + (fbm(x * 3, 2, z * 3) - 0.5) * 0.12;
    const pos = new THREE.Vector3(x, y, z);
    const v = fbm(x * 3, 5, z * 3);
    S.push(pos, new THREE.Vector3(0, 1, 0), mix3([0.07, 0.09, 0.12], [0.2, 0.24, 0.3], v), 0.08);
  }
  for (let i = 0; i < 3500; i++){
    const th = R() * Math.PI * 2, d = Math.pow(R(), 0.8);
    const er = 2.25 * (0.9 + 0.1 * vnoise(th * 2, 3, 1)) * (1 - d * 0.3);
    const pos = new THREE.Vector3(er * Math.cos(th), -0.95 - d * 0.55, er * Math.sin(th));
    S.push(pos, new THREE.Vector3(Math.cos(th), -0.2, Math.sin(th)).normalize(), mix3([0.12, 0.15, 0.2], [0.03, 0.04, 0.06], d), 0.085);
  }
  // stones around the puddle
  for (let j = 0; j < 16; j++){
    const th = j / 16 * Math.PI * 2 + R() * 0.3, r = pEdge(th) + 0.05 + R() * 0.12, sz = 0.07 + R() * 0.12;
    ellipsoid(S, { c: [r * Math.cos(th), -0.98 + sz * 0.3, r * Math.sin(th)], r: [sz * 1.2, sz * 0.6, sz], rot: [0, R() * 3, 0],
      color: (p, n) => n.y > 0.6 && hash3(p.x * 80, p.y * 80, p.z * 80) > 0.6 ? [0.62, 0.72, 0.85] : mix3([0.2, 0.25, 0.32], [0.38, 0.45, 0.55], R()), size: 0.06, density: 1400 });
  }

  // squid
  const H = [0, -0.55, 0.1];
  ellipsoid(S, { c: H, r: [0.38, 0.32, 0.36], color: red, g: 1 });
  const mantle = tube(S, {
    pts: [[0, -0.4, 0.05], [-0.08, 0.2, -0.05], [-0.16, 0.8, -0.15], [-0.3, 1.45, -0.3]],
    r: (t) => 0.36 * (1 - Math.pow(t, 2.2)) * (0.85 + 0.32 * Math.sin(t * 3.0)) + 0.01,
    color: red, g: 3, density: 1000,
  });
  const tipP = mantle.getPointAt(1), finA = mantle.getPointAt(0.58), finM = mantle.getPointAt(0.8);
  for (const s of [-1, 1]){
    const outer = [finM.x + s * 0.48, finM.y - 0.08, finM.z + 0.04];
    const finCol = (p) => mix3([0.72, 0.22, 0.22], [0.95, 0.45, 0.38], hash3(p.x * 30, p.y * 30, p.z * 30) * 0.5);
    tri(S, tipP.toArray(), finA.toArray(), outer, { color: finCol, g: 3, size: 0.06, density: 900, uOf: (p) => (p.y + 0.4) / 1.85 });
  }
  for (const s of [-1, 1]){
    const dir = new THREE.Vector3(s, 0.05, 0.75).normalize();
    const ec = V(H).addScaledVector(dir, 0.3).add(new THREE.Vector3(0, 0.06, 0));
    ellipsoid(S, { c: ec.toArray(), r: [0.13, 0.13, 0.13], color: () => [0.96, 0.9, 0.7], g: 1, size: 0.05, density: 2500 });
    const ic = ec.clone().addScaledVector(dir, 0.06);
    ellipsoid(S, { c: ic.toArray(), r: [0.095, 0.095, 0.095], color: () => [1.0, 0.78, 0.25], e: 0.55, g: 1, size: 0.045, density: 3500 });
    const pc = ec.clone().addScaledVector(dir, 0.13);
    ellipsoid(S, { c: pc.toArray(), r: [0.035, 0.06, 0.035], color: () => [0.03, 0.02, 0.04], g: 1, size: 0.035, density: 6000 });
  }
  // eight arms lying in the puddle (group 4, k = arm index)
  for (let k = 0; k < 8; k++){
    const a = k / 8 * Math.PI * 2 + 0.2;
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), q = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(k % 2 ? 1 : -1);
    const L = 1 + (hash3(k, 1, 2) - 0.5) * 0.35;
    const root = new THREE.Vector3(0, -0.76, 0.1).addScaledVector(d, 0.2);
    const P = (dd, y, qq) => root.clone().addScaledVector(d, dd).add(new THREE.Vector3(0, y, 0)).addScaledVector(q, qq).toArray();
    tube(S, {
      pts: [P(0, 0, 0), P(0.35 * L, -0.15, 0), P(0.75 * L, -0.19, 0.05), P(1.05 * L, -0.14, 0.12), P(1.18 * L, 0.08, 0.22), P(1.08 * L, 0.26, 0.32)],
      r: (t) => 0.095 * Math.pow(1 - t, 0.8) + 0.012,
      color: (p, n, t) => n.y < -0.2 && (t * 30) % 1 < 0.5 ? [0.98, 0.72, 0.64] : red(p, n),
      g: 4, k, density: 1100,
    });
  }
  // two long tentacles reaching up (group 2)
  for (const s of [-1, 1]){
    tube(S, {
      pts: [[s * 0.15, -0.7, 0.25], [s * 0.55, -0.62, 0.45], [s * 0.95, -0.22, 0.5], [s * 1.12, 0.32, 0.35], [s * 0.98, 0.76, 0.22], [s * 0.74, 0.86, 0.36]],
      r: (t) => 0.055 * (1 - t) + 0.016 + 0.045 * Math.exp(-Math.pow((t - 0.86) / 0.07, 2)),
      color: (p, n, t) => (n.x * -s > 0.45 && (t * 34) % 1 < 0.5) ? [0.98, 0.72, 0.64] : red(p, n),
      g: 2, k: s, density: 1100,
    });
  }

  // storm cloud
  const cloud = new Cloud(R, true);
  const blobs = [[0, 2.3, 0, 0.75], [-0.85, 2.2, 0.2, 0.6], [0.85, 2.25, -0.1, 0.62], [-0.4, 2.55, -0.3, 0.55], [0.45, 2.6, 0.25, 0.52],
    [-1.4, 2.1, -0.2, 0.42], [1.4, 2.15, 0.25, 0.45], [0.1, 2.15, 0.65, 0.5], [-0.2, 2.2, -0.7, 0.5]];
  blobs.forEach(([x, y, z, r], bi) => {
    softBlob(cloud, [x, y, z], [r * 1.2, r * 0.6, r], 420, {
      color: (p, d, RR) => mix3([0.08, 0.1, 0.14], [0.24, 0.28, 0.36], clamp01((p.y - 1.9) / 0.9 + RR() * 0.25)),
      size: 0.24 + R() * 0.12, a: 0.55, g: 0, u: bi / 9,
    });
  });
  // rain: each drop is three points stacked into a streak; position.y stores the streak index
  const rain = new Cloud(R, true);
  for (let i = 0; i < 850; i++){
    const th = R() * Math.PI * 2, r = 1.55 * Math.sqrt(R()), sp = R(), ph = R();
    for (let j = 0; j < 3; j++){
      rain.push(new THREE.Vector3(r * Math.cos(th), j, r * Math.sin(th)), null, [0.55, 0.68, 0.9], 0.032, { a: 0.42 * (1 - j * 0.3), g: 1, u: sp, k: ph });
    }
  }
  for (let i = 0; i < 110; i++){
    const th = R() * Math.PI * 2, r = 1.6 * Math.sqrt(R()), ph = R();
    for (let j = 0; j < 7; j++){
      rain.push(new THREE.Vector3(r * Math.cos(th), -0.98, r * Math.sin(th)), null, [0.7, 0.82, 1.0], 0.03, { a: 0.55, g: 2, u: j / 7, k: ph });
    }
  }

  return { solid: S, soft: [{ cloud, additive: false, order: 2 }, { cloud: rain, additive: true, order: 3 }] };
}

const SQUID_SOLID = /* glsl */`
  void animate(inout vec3 p, inout vec3 n, inout vec3 c, inout float e, inout float s, vec3 m, float t){
    float g = m.x;
    float bob = sin(t * 1.1) * 0.035;
    if (g == 1.0 || g == 3.0){
      vec3 piv = vec3(0.0, -0.5, 0.1);
      if (g == 3.0){
        float h = max(p.y - piv.y, 0.0);
        float a = sin(t * 0.8) * 0.06 * h;
        float b = cos(t * 0.6) * 0.05 * h;
        p = rotX(rotZ(p - piv, a), b) + piv;
        // breathing: pulse the mantle outward a touch
        p.xz += n.xz * 0.025 * sin(t * 2.0) * smoothstep(-0.4, 0.4, p.y);
      }
      p.y += bob;
    } else if (g == 4.0 || g == 2.0){
      float u = m.y, k = m.z;
      float amp = g == 2.0 ? 0.26 : 0.15;
      float sp = g == 2.0 ? 1.4 : 1.0;
      float w = u * u;
      p.x += sin(t * 1.6 * sp + u * 5.0 + k * 1.7) * w * amp;
      p.z += cos(t * 1.3 * sp + u * 4.0 + k * 2.3) * w * amp;
      p.y += (0.5 + 0.5 * sin(t * 1.1 * sp + u * 3.0 + k)) * w * amp * 0.9 + bob * (1.0 - u);
    } else if (g == 5.0){
      float r = length(p.xz - vec2(0.0, 0.1));
      c *= 0.88 + 0.28 * pow(0.5 + 0.5 * sin(r * 13.0 - t * 2.6), 3.0);
    }
  }
`;
const SQUID_SOFT = /* glsl */`
  void animateSoft(inout vec3 p, inout vec3 c, inout float a, inout float s, vec3 m, float t){
    if (m.x == 0.0){
      p.x += sin(t * 0.35 + m.z * 5.0 + p.y * 2.0) * 0.08;
      p.z += cos(t * 0.3 + m.z * 3.0) * 0.06;
      p.y += sin(t * 0.5 + m.z) * 0.03;
      float fl = smoothstep(0.97, 1.0, sin(t * 0.75)) * (0.55 + 0.45 * sin(t * 37.0));
      c += vec3(0.55, 0.62, 0.8) * fl * (0.3 + hash(m.z));
    } else if (m.x == 1.0){
      float f = fract(t * (0.5 + 0.3 * m.y) + m.z);
      float j = p.y;
      p.y = 1.95 - f * 2.95 + j * 0.075;
      p.x += f * 0.18;
      a *= smoothstep(0.0, 0.06, f);
    } else {
      float f = fract(t * 0.85 + m.z);
      float ang = m.y * 6.28318 + m.z * 3.0;
      float r = f * 0.15;
      p.x += cos(ang) * r;
      p.z += sin(ang) * r;
      p.y += sin(f * 3.14159) * 0.07;
      a *= 1.0 - f;
    }
  }
`;

export const SCENES = {
  dragon: {
    title: { zh: '冰龙', en: 'Ice Dragon' },
    build: buildDragon,
    solidAnim: DRAGON_SOLID, softAnim: DRAGON_SOFT,
    background: '#04060c',
    camera: [1.7, 1.0, 7.4], target: [0, 0.3, 0], fov: 36,
    light: [-0.5, 0.75, 0.55], lightColor: [0.78, 0.84, 0.95], ambient: [0.2, 0.24, 0.34], rim: [0.18, 0.3, 0.5],
    palette: ['#04060c', '#0a1020', '#111a30', '#1a2742', '#243556', '#2f466c', '#3d5a85', '#4f71a0', '#6689ba', '#84a6d2',
      '#a6c4e8', '#c8def5', '#eef6ff', '#8fe3ff', '#5fb8f0', '#ff9a3c', '#ffd27a', '#8a4420'],
    dither: 0.085,
    autoRotateSpeed: 0.55,
  },
  squid: {
    title: { zh: '雨中的乌贼', en: 'Squid in the Rain' },
    build: buildSquid,
    solidAnim: SQUID_SOLID, softAnim: SQUID_SOFT,
    background: '#05070b',
    camera: [0, 1.0, 8.4], target: [0, 0.55, 0], fov: 36,
    light: [0.35, 0.9, 0.55], lightColor: [0.85, 0.9, 1.0], ambient: [0.26, 0.29, 0.37], rim: [0.28, 0.36, 0.55],
    palette: ['#05070b', '#0d1118', '#161c26', '#222b38', '#2f3b4c', '#44536a', '#627592', '#8aa0c0', '#b9cbe4', '#e8f0ff',
      '#3a0f17', '#5e1620', '#8a2228', '#b8352f', '#dd5a45', '#f08a72', '#ffc2a8', '#ffd35a', '#fff1b0', '#020203'],
    dither: 0.085,
    autoRotateSpeed: 0.5,
  },
};
