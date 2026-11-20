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
    if (o.holes && o.holes.some(h => pos.distanceTo(V(h.c)) < h.r)) continue;
    if (o.clipY != null && pos.y < o.clipY) continue;
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
    if (o.clipY != null && pos.y < o.clipY){ made++; continue; }
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

/* ---------- Scene 1: bone dragon peering over a platform ---------- */
function buildDragon(){
  const R = rng(11);
  const S = new Cloud(R);
  const TOP = -0.7, RIM = 1.25;

  const boneCol = (p, n, t) => {
    const v = fbm(p.x * 5 + 3, p.y * 5, p.z * 5);
    let c = mix3([0.5, 0.64, 0.76], [0.86, 0.94, 0.98], clamp01(v * 1.5 - 0.15));
    if (fbm(p.x * 13, p.y * 13, p.z * 13) > 0.68) c = mix3(c, [0.28, 0.4, 0.52], 0.6); // cracks
    return c;
  };
  const armCol = (p, n, t) => mix3(boneCol(p, n, t), [0.3, 0.42, 0.55], 0.25);
  const darkBone = (p, n, t) => mix3([0.12, 0.18, 0.28], [0.34, 0.46, 0.6], clamp01(t * 0.7 + hash3(p.x * 40, p.y * 40, p.z * 40) * 0.2));
  const clawCol = (p, n, t) => mix3([0.85, 0.9, 0.92], [0.98, 0.72, 0.46], clamp01(t * 1.3 - 0.2));
  const stone = (p, n) => {
    const v = fbm(p.x * 3 + 9, p.y * 3, p.z * 3);
    let c = mix3([0.07, 0.11, 0.18], [0.2, 0.3, 0.42], clamp01(v * 1.6 - 0.25));
    // flagstone seams
    const gx = Math.abs(((p.x * 2.6 + Math.floor(p.z * 2.6) * 0.5) % 1 + 1) % 1 - 0.5), gz = Math.abs(((p.z * 2.6) % 1 + 1) % 1 - 0.5);
    if (n.y > 0.8 && (gx > 0.45 || gz > 0.45)) c = mix3(c, [0.05, 0.08, 0.13], 0.7);
    return c;
  };

  /* platform */
  const rimR = (th) => RIM * (0.94 + 0.06 * vnoise(Math.cos(th) * 2 + 4, Math.sin(th) * 2, 0.5));
  for (let i = 0; i < 9000; i++){
    const th = R() * Math.PI * 2, r = RIM * Math.sqrt(R());
    if (r > rimR(th)) continue;
    const pos = new THREE.Vector3(r * Math.cos(th), TOP + (vnoise(pos0(th, r)[0], 0, pos0(th, r)[1]) - 0.5) * 0.03, r * Math.sin(th));
    S.push(pos, new THREE.Vector3(0, 1, 0), stone(pos, { y: 1 }), 0.07);
  }
  function pos0(th, r){ return [r * Math.cos(th) * 3, r * Math.sin(th) * 3]; }
  for (let i = 0; i < 6500; i++){ // rounded rocky underside
    const th = R() * Math.PI * 2, d = Math.pow(R(), 0.9);
    const rr = rimR(th) * Math.cos(d * 1.3) * (0.95 + 0.1 * vnoise(th * 4, d * 4, 1));
    const pos = new THREE.Vector3(rr * Math.cos(th), TOP - Math.sin(d * 1.3) * 0.5, rr * Math.sin(th));
    const nor = new THREE.Vector3(Math.cos(th) * Math.cos(d * 1.3), -Math.sin(d * 1.3), Math.sin(th) * Math.cos(d * 1.3));
    const v = fbm(pos.x * 4, pos.y * 4, pos.z * 4);
    S.push(pos, nor, mix3([0.05, 0.08, 0.13], [0.2, 0.3, 0.42], clamp01(v * 1.4 - 0.2) * (1 - d * 0.6)), 0.08);
  }
  // rubble along the rim
  for (let j = 0; j < 22; j++){
    const th = R() * Math.PI * 2, sz = 0.05 + R() * 0.08, rr = rimR(th) - 0.05 - R() * 0.1;
    ellipsoid(S, { c: [rr * Math.cos(th), TOP + sz * 0.4, rr * Math.sin(th)], r: [sz, sz * 0.7, sz], color: (p, n) => stone(p, { y: 0 }), size: 0.05, density: 1600 });
  }
  // glowing rune circle (group 5)
  const RC = [0.05, TOP + 0.012, 0.35];
  for (let i = 0; i < 1600; i++){
    const th = R() * Math.PI * 2;
    let r;
    const pick = R();
    if (pick < 0.35) r = 0.36 + (R() - 0.5) * 0.03;
    else if (pick < 0.55) r = 0.27 + (R() - 0.5) * 0.02;
    else if (pick < 0.75){ // star lines
      const k = Math.floor(R() * 5), a0 = k * Math.PI * 2 / 5, a1 = a0 + Math.PI * 4 / 5, f = R();
      const x = Math.cos(a0) * (1 - f) + Math.cos(a1) * f, z = Math.sin(a0) * (1 - f) + Math.sin(a1) * f;
      const pos = new THREE.Vector3(RC[0] + x * 0.27, RC[1], RC[2] + z * 0.27);
      S.push(pos, new THREE.Vector3(0, 1, 0), [0.5, 0.82, 0.95], 0.04, { e: 0.8, g: 5 });
      continue;
    } else r = R() * 0.26;
    const glow = pick < 0.75;
    const pos = new THREE.Vector3(RC[0] + r * Math.cos(th), RC[1], RC[2] + r * Math.sin(th));
    S.push(pos, new THREE.Vector3(0, 1, 0), glow ? [0.55, 0.85, 0.98] : [0.22, 0.38, 0.5], 0.045, { e: glow ? 0.8 : 0.25, g: 5 });
  }
  // torches
  const torches = [[-0.42, 0.6], [0.48, 0.78]];
  for (const [x, z] of torches){
    tube(S, { pts: [[x, TOP, z], [x, TOP + 0.42, z]], r: () => 0.025, color: () => [0.08, 0.1, 0.14], size: 0.04, density: 3000 });
    cone(S, [x, TOP + 0.42, z], [x, TOP + 0.36, z], 0.06, { color: () => [0.2, 0.18, 0.18], size: 0.035, density: 4000 });
  }
  // striped stalagmites around the edge
  const stal = [[-1.15, -0.25, 1.05, 0.2], [-1.2, 0.35, 0.65, 0.14], [-0.95, -0.75, 0.75, 0.15], [1.15, -0.4, 1.15, 0.2], [1.2, 0.25, 0.7, 0.14], [0.9, -0.85, 0.6, 0.13], [-0.6, -1.05, 0.5, 0.11], [0.5, 1.15, 0.45, 0.1]];
  for (const [x, z, h, rad] of stal){
    tube(S, { pts: [[x, TOP - 0.1, z], [x * 1.02, TOP + h, z * 1.02]], r: (t) => rad * Math.pow(1 - t, 0.9) + 0.006,
      color: (p, n, t) => { const band = Math.floor(t * 7) % 2; const c = mix3([0.16, 0.26, 0.38], [0.42, 0.58, 0.7], t * 0.6 + (n.x * 0.3 + 0.2)); return band ? mix3(c, [0.08, 0.13, 0.2], 0.45) : c; },
      size: 0.055, density: 1500 });
  }

  /* skull (group 1) — chin resting over the back of the platform, facing +z */
  const sk = (o) => ellipsoid(S, { g: 1, color: boneCol, ...o });
  const sockets = [{ c: [-0.33, 0.47, -0.1], r: 0.15 }, { c: [0.33, 0.47, -0.1], r: 0.15 }];
  const nostrils = [{ c: [-0.13, 0.27, 0.92], r: 0.065 }, { c: [0.13, 0.27, 0.92], r: 0.065 }];
  sk({ c: [0, 0.4, -0.45], r: [0.42, 0.25, 0.55], holes: sockets });
  sk({ c: [0, 0.22, 0.35], r: [0.29, 0.13, 0.66], rot: [0.15, 0, 0], holes: [...nostrils, ...sockets] });
  sk({ c: [0, 0.36, 0.0], r: [0.36, 0.17, 0.36], holes: sockets });
  for (const s of [-1, 1]){
    tube(S, { pts: [[s * 0.18, 0.63, 0.06], [s * 0.38, 0.62, -0.1], [s * 0.47, 0.55, -0.32]], r: () => 0.06, color: boneCol, g: 1 }); // brow
    tube(S, { pts: [[s * 0.3, 0.28, 0.05], [s * 0.45, 0.3, -0.3], [s * 0.42, 0.28, -0.7]], r: () => 0.06, color: boneCol, g: 1 }); // cheekbone
    ellipsoid(S, { c: [s * 0.29, 0.46, -0.16], r: [0.09, 0.12, 0.1], color: () => [0.04, 0.06, 0.1], g: 1, size: 0.05, density: 2500 }); // socket depth
    ellipsoid(S, { c: [s * 0.31, 0.46, -0.08], r: [0.06, 0.065, 0.05], color: () => [1.0, 0.62, 0.25], e: 1.3, g: 2, size: 0.045, density: 4000 });
    ellipsoid(S, { c: [s * 0.12, 0.25, 0.9], r: [0.045, 0.04, 0.04], color: () => [0.03, 0.04, 0.07], g: 1, size: 0.04, density: 4000 });
    // horns
    tube(S, { pts: [[s * 0.2, 0.66, -0.45], [s * 0.3, 1.1, -0.72], [s * 0.38, 1.62, -1.1]], r: (t) => 0.13 * Math.pow(1 - t, 0.9) + 0.01, color: boneCol, g: 1, density: 1100 });
    // upper teeth
    for (let k = 0; k < 9; k++){
      const f = k / 8;
      const x = s * (0.27 - f * 0.14), z = -0.1 + f * 0.95, y = 0.06 - f * 0.04;
      const L = 0.1 + (k === 7 ? 0.1 : 0) + hash3(k, s, 3) * 0.05;
      cone(S, [x, y, z], [x * 0.95, y - L, z + 0.02], 0.035, { color: (p, n, t) => mix3([0.8, 0.88, 0.92], [1, 1, 1], t), g: 1, size: 0.04, density: 3500 });
    }
  }
  // frill of long dark spikes fanning out behind the skull
  for (let k = 0; k < 13; k++){
    const a = -1.25 + k / 12 * 2.5;
    const len = 0.9 + hash3(k, 7, 1) * 0.6 - Math.abs(a) * 0.15;
    const dir = new THREE.Vector3(Math.sin(a) * 1.1, Math.cos(a) * 0.85 + 0.25, -0.75).normalize();
    const base = new THREE.Vector3(Math.sin(a) * 0.25, 0.48 + Math.cos(a) * 0.18, -0.85);
    cone(S, base.toArray(), base.clone().addScaledVector(dir, len).toArray(), 0.045, { color: darkBone, g: 1, size: 0.045, density: 1500 });
  }
  // lower jaw (group 8, hinged near the back)
  ellipsoid(S, { c: [0, -0.1, 0.22], r: [0.26, 0.09, 0.6], rot: [-0.04, 0, 0], color: boneCol, g: 8 });
  ellipsoid(S, { c: [0, -0.03, 0.18], r: [0.16, 0.04, 0.42], color: () => [0.5, 0.2, 0.12], e: 0.12, g: 8, size: 0.05, density: 1600 }); // tongue / throat glow
  for (const s of [-1, 1]){
    for (let k = 0; k < 8; k++){
      const f = k / 7;
      const x = s * (0.23 - f * 0.12), z = -0.02 + f * 0.75, y = -0.03;
      cone(S, [x, y, z], [x * 0.95, y + 0.09 + hash3(k, s, 9) * 0.05, z - 0.02], 0.03, { color: (p, n, t) => mix3([0.8, 0.88, 0.92], [1, 1, 1], t), g: 8, size: 0.04, density: 3500 });
    }
  }

  // enlarge and seat the whole head (groups 1, 2, 8) so the chin rests on the back rim
  {
    const k = 1.15, O = [0, 0.2, -0.9], off = [0, -0.3, -0.8];
    for (let i = 0; i < S.i; i++){
      const g = S.m[i * 3];
      if (g !== 1 && g !== 2 && g !== 8) continue;
      for (let a = 0; a < 3; a++) S.p[i * 3 + a] = (S.p[i * 3 + a] - O[a]) * k + O[a] + off[a];
      S.s[i] *= 1.1;
    }
  }

  /* neck vertebrae arching back (group 6, u = 1 at the skull) */
  const neck = new THREE.CatmullRomCurve3([[0, 0.0, -1.75], [0, 0.4, -2.25], [0, 0.3, -2.8], [0, -0.2, -3.1], [0, -0.85, -3.15]].map(V));
  for (let k = 0; k < 14; k++){
    const t = k / 13, P = neck.getPointAt(t), T = neck.getTangentAt(t);
    const D = new THREE.Vector3().crossVectors(T, new THREE.Vector3(1, 0, 0)).normalize();
    const sz = 0.13 - t * 0.03, u = 1 - t;
    ellipsoid(S, { c: P.toArray(), r: [sz * 1.1, sz * 0.9, sz * 0.9], color: boneCol, g: 6, u, size: 0.06, density: 1300 });
    const len = 0.32 + Math.sin(t * Math.PI) * 0.15;
    cone(S, P.toArray(), P.clone().addScaledVector(D, len).addScaledVector(T, -len * 0.45).toArray(), 0.05, { color: darkBone, g: 6, uMap: () => u, size: 0.05, density: 1500 });
    for (const s of [-1, 1]) cone(S, P.toArray(), P.clone().add(new THREE.Vector3(s * sz * 2.2, -0.03, 0)).toArray(), 0.035, { color: boneCol, g: 6, uMap: () => u, size: 0.045, density: 2500 });
  }

  /* arms arching up and clawed hands gripping the rim */
  for (const s of [-1, 1]){
    const sh = [s * 0.8, -0.45, -1.35], el = [s * 1.45, 0.62, -0.6], wr = [s * 1.34, -0.44, 0.3];
    tube(S, { pts: [sh, [s * 1.2, 0.2, -1.1], el], r: (t) => 0.1 - t * 0.02, color: armCol, g: 9 });
    ellipsoid(S, { c: el, r: [0.11, 0.11, 0.11], color: armCol, g: 9 });
    for (const o of [-1, 1]){ // radius + ulna
      tube(S, { pts: [[el[0] + o * 0.05, el[1], el[2] + o * 0.04], [s * (1.5 + o * 0.03), 0.15, -0.1 + o * 0.04], [wr[0] + o * 0.04, wr[1] + 0.05, wr[2] + o * 0.06]],
        r: (t) => 0.05 - t * 0.01, color: armCol, g: 9 });
    }
    ellipsoid(S, { c: wr, r: [0.13, 0.1, 0.16], color: boneCol, g: 9 });
    for (let k = 0; k < 4; k++){
      const a = (k - 1.5) * 0.36;
      const d = new THREE.Vector3(-s * Math.cos(a), 0, Math.sin(a)).normalize();
      const W = V(wr);
      const k1 = W.clone().addScaledVector(d, 0.3).add(new THREE.Vector3(0, -0.08, 0));
      const k2 = W.clone().addScaledVector(d, 0.58).add(new THREE.Vector3(0, -0.24, 0));
      const tip = W.clone().addScaledVector(d, 0.82).add(new THREE.Vector3(0, -0.31, 0));
      const fs = { color: boneCol, g: 10, k: k + (s > 0 ? 4 : 0) };
      tube(S, { ...fs, pts: [W.toArray(), k1.toArray()], r: () => 0.055 });
      ellipsoid(S, { ...fs, c: k1.toArray(), r: [0.065, 0.065, 0.065], u: 0.5, size: 0.05, density: 2500 });
      tube(S, { ...fs, pts: [k1.toArray(), k2.toArray()], r: () => 0.05, uMap: (t) => 0.5 + t * 0.3 });
      ellipsoid(S, { ...fs, c: k2.toArray(), r: [0.055, 0.055, 0.055], u: 0.8, size: 0.05, density: 2500 });
      tube(S, { ...fs, pts: [k2.toArray(), tip.toArray()], r: (t) => 0.06 * (1 - t) + 0.006, color: clawCol, uMap: (t) => 0.8 + t * 0.2, density: 1600 });
    }
  }

  /* soft layers */
  const spark = new Cloud(R, true);
  for (let i = 0; i < 600; i++){
    const th = R() * Math.PI * 2, r = 0.3 + 2.6 * Math.sqrt(R());
    spark.push(new THREE.Vector3(r * Math.cos(th), -1.4 + R() * 3.6, r * Math.sin(th)), null,
      R() < 0.85 ? [0.55, 0.8, 0.95] : [1.0, 0.72, 0.4], 0.03 + R() * 0.03, { a: 0.85, g: 0, u: R(), k: R() * 10 });
  }
  const glow = new Cloud(R, true);
  for (const [x, z] of torches){
    for (let i = 0; i < 70; i++) glow.push(new THREE.Vector3(x, TOP + 0.47, z), null, [1.0, 0.62, 0.22], 0.06, { a: 0.3, g: 1, u: R(), k: R() * 10 });
    for (let i = 0; i < 40; i++) glow.push(new THREE.Vector3(x, TOP + 0.47, z), null, [1.0, 0.55, 0.2], 0.035, { a: 0.9, g: 4, u: R(), k: R() * 10 });
  }
  for (let i = 0; i < 160; i++){ // frosty breath from the jaws
    glow.push(new THREE.Vector3(0, -0.33, 0.43), null, [0.5, 0.75, 0.95], 0.06, { a: 0.12, g: 3, u: R(), k: R() * 10 });
  }
  for (let i = 0; i < 90; i++){
    const th = R() * Math.PI * 2, r = 0.36 * Math.sqrt(R());
    glow.push(new THREE.Vector3(RC[0] + r * Math.cos(th), TOP, RC[2] + r * Math.sin(th)), null, [0.55, 0.88, 1.0], 0.04, { a: 0.8, g: 2, u: R(), k: R() * 10 });
  }

  return { solid: S, soft: [{ cloud: spark, additive: true, order: 2 }, { cloud: glow, additive: true, order: 3 }] };
}

const DRAGON_COMMON = /* glsl */`
  float lunge(float t){ return pow(max(0.0, sin(t * 0.45 - 0.5)), 10.0); }
  vec3 headX(vec3 p, float w, float t){
    vec3 piv = vec3(0.0, 0.0, -2.3);
    float L = lunge(t);
    float ax = (0.045 * sin(t * 0.8) - 0.1 * L) * w;
    float ay = 0.12 * sin(t * 0.33) * w;
    vec3 q = rotY(rotX(p - piv, ax), ay) + piv;
    return q + vec3(0.0, 0.02 + 0.02 * sin(t * 1.3), 0.14 * L) * w;
  }
  vec3 headN(vec3 n, float w, float t){
    float L = lunge(t);
    return rotY(rotX(n, (0.045 * sin(t * 0.8) - 0.1 * L) * w), 0.12 * sin(t * 0.33) * w);
  }
`;
const DRAGON_SOLID = DRAGON_COMMON + /* glsl */`
  void animate(inout vec3 p, inout vec3 n, inout vec3 c, inout float e, inout float s, vec3 m, float t){
    float g = m.x;
    if (g == 8.0){ // lower jaw: open, then follow the head
      vec3 hinge = vec3(0.0, -0.238, -1.125);
      float a = 0.14 + 0.07 * (0.5 + 0.5 * sin(t * 1.1)) + 0.22 * lunge(t);
      p = rotX(p - hinge, a) + hinge; n = rotX(n, a);
      p = headX(p, 1.0, t); n = headN(n, 1.0, t);
    } else if (g == 1.0 || g == 2.0){
      p = headX(p, 1.0, t); n = headN(n, 1.0, t);
      if (g == 2.0) e = 1.0 + 0.7 * (0.5 + 0.5 * sin(t * 2.0)) + lunge(t);
    } else if (g == 6.0){
      float w = m.y * m.y;
      p = headX(p, w, t); n = headN(n, w, t);
    } else if (g == 9.0){
      p.y += sin(t * 0.8 + sign(p.x)) * 0.025 * smoothstep(-0.4, 0.9, p.y);
    } else if (g == 10.0){ // fingers tap/grip
      float k = m.z;
      float lift = max(0.0, sin(t * 0.9 + k * 1.7)) * 0.06 * m.y;
      p.y += lift;
    } else if (g == 5.0){
      vec2 d = p.xz - vec2(0.05, 0.35);
      float r = length(d);
      float ang = atan(d.y, d.x);
      float wv = 0.5 + 0.5 * sin(ang * 5.0 + t * 1.2) * sin(r * 20.0 - t * 2.0);
      e *= 0.6 + 0.6 * wv;
      c *= 0.8 + 0.35 * wv;
    }
  }
`;
const DRAGON_SOFT = DRAGON_COMMON + /* glsl */`
  void animateSoft(inout vec3 p, inout vec3 c, inout float a, inout float s, vec3 m, float t){
    float g = m.x;
    if (g == 0.0){
      p.y = mod(p.y + 1.4 + t * 0.1 * (0.5 + m.y), 3.6) - 1.4;
      p.x += sin(t * 0.5 + m.z * 6.0) * 0.12;
      p.z += cos(t * 0.4 + m.z * 4.0) * 0.12;
      a *= 0.25 + 0.75 * pow(0.5 + 0.5 * sin(t * (1.2 + m.y * 2.0) + m.z * 20.0), 4.0);
    } else if (g == 1.0){ // torch flame
      float f = fract(t * 1.6 + m.y);
      vec3 j = vec3(hash(m.z) - 0.5, 0.0, hash(m.z + 1.7) - 0.5);
      p += j * 0.07 * (1.0 - f) + vec3(sin(t * 7.0 + m.z) * 0.01, f * 0.16, 0.0);
      s *= 1.0 - f * 0.6;
      c = mix(vec3(1.0, 0.85, 0.5), vec3(0.9, 0.35, 0.1), f);
      a *= (1.0 - f);
    } else if (g == 4.0){ // embers
      float f = fract(t * 0.3 + m.y);
      p += vec3(sin(t + m.z * 4.0) * 0.12 * f, f * 1.1, cos(t * 0.7 + m.z * 3.0) * 0.12 * f);
      a *= (1.0 - f) * step(0.5, hash(m.z + floor(t * 0.3 + m.y)));
    } else if (g == 3.0){ // breath
      float f = fract(t * 0.22 + m.y);
      vec3 j = vec3(hash(m.z) - 0.5, hash(m.z + 1.3) - 0.5, hash(m.z + 2.7) - 0.5);
      p += vec3(0.0, -0.25, 0.9) * f + j * f * 0.7;
      p = headX(p, 1.0 - f, t);
      s *= 1.0 + f * 2.5;
      a *= sin(f * 3.14159);
    } else { // rune motes
      float f = fract(t * 0.18 + m.y);
      p.y += f * 1.0;
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
    title: { zh: '冰霜骨龙', en: 'Frost Bone Dragon' },
    build: buildDragon,
    solidAnim: DRAGON_SOLID, softAnim: DRAGON_SOFT,
    background: '#04070c',
    camera: [-4.7, 1.5, 3.1], target: [0, -0.1, -0.5], fov: 38,
    light: [0.2, 0.9, 0.55], lightColor: [0.95, 1.0, 1.05], ambient: [0.13, 0.17, 0.24], rim: [0.12, 0.22, 0.34],
    palette: ['#04070c', '#08101a', '#0e1a28', '#152638', '#1e344a', '#29445c', '#36566f', '#476b84', '#5d849b', '#7aa0b4',
      '#9bbccb', '#bdd7e0', '#dcecf0', '#f4fbfc', '#ffd890', '#f0a050', '#c0602a', '#7a3418', '#2a1408'],
    dither: 0.08,
    autoRotateSpeed: 0.45, swayRange: 0.85,
    minDistance: 3, maxDistance: 9,
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
