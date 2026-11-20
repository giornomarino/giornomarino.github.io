// Birthday Cake Castle — built with @shapeshift-labs/ink-studio (MIT).
(function (root) {
  const DIGITS = {
    '3': ['111110', '111111', '000011', '011110', '011110', '000011', '111111', '111110'],
    '0': ['011110', '111111', '110011', '110011', '110011', '110011', '111111', '011110']
  };
  // bitmap of a short string drawn with the system CJK font (browser only)
  function glyphRows(text, px) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    const w = px * text.length + 4, h = px + 4;
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.font = `900 ${px}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif`;
    g.fillText(text, 2, h / 2 + 1);
    const d = g.getImageData(0, 0, w, h).data, rows = [];
    for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) r += d[(y * w + x) * 4 + 3] > 110 ? '1' : '0'; rows.push(r); }
    // trim empty borders
    while (rows.length && !rows[0].includes('1')) rows.shift();
    while (rows.length && !rows[rows.length - 1].includes('1')) rows.pop();
    let l = Infinity, r = -1;
    for (const row of rows) { const a = row.indexOf('1'), b = row.lastIndexOf('1'); if (a >= 0) { l = Math.min(l, a); r = Math.max(r, b); } }
    return rows.map(row => row.slice(l, r + 1));
  }

  const NAME = (root && root.PARTY_NAME) || '沈婷婷';
  const def = ({ makeBuilder, makeSculpt, KIT: K }) => ({
    id: 'party',
    name: 'Birthday Cake Castle',
    seed: 30,
    build(seed) {
      const M = K.M;
      const B = makeBuilder(seed, [
        0x0a0a1e, 0x16163a, 0x24244e, 0x3a3a6a,             // 0-3 night
        0x3b1f17, 0x5e3424, 0x8a5236, 0xc98a52, 0xf0c27e,   // 4-8 chocolate, cookie
        0xfff4e0, 0xffe0ec, 0xff9ec6, 0xf2629e, 0xb02a5a,   // 9-13 cream, pinks
        0xe8302e, 0x8a1420, 0x3fa04a, 0x9ee6c8,             // 14-17 strawberry, leaf, mint
        0xc9b0ff, 0x8a6ad8, 0x9ad8ff,                       // 18-20 lavender, blue
        0xffcf5a, 0xffe9a0, 0xff8a2a, 0xffffff,             // 21-24 gold, flame, white
        0xd8dcf0, 0x8f96c8, 0x2a1a10, 0x5a5a7a, 0x9a9ab8    // 25-29 plate, wick, smoke
      ]);
      const S = K.sculpt(makeSculpt(B)),
        rig = K.rig(B, S),
        cap = K.light.capture(B, S);
      S.sun = B.norm([-0.45, 0.75, 0.5]);
      S.view = B.norm([0.25, 0.3, 0.92]);
      S.res = 0.09;
      S.amb = 0.24;
      S.sky = 0.32;
      S.lights.push({ p: [0, 4.6, 0], r: 5.5, s: 0.7 }, { p: [0, 1.8, 3.4], r: 3, s: 0.35 });

      const sprinkle = [11, 17, 18, 20, 21, 24, 12];
      const spr = (x, y, z, t, dens = 0.86) => {
        const h = B.n3(x * 37.3, y * 37.3, z * 37.3);
        return h > dens ? sprinkle[Math.floor(B.n3(x * 91, y * 91, z * 91) * 7) % 7] : undefined;
      };
      // a cake tier: sponge sides with filling stripes, frosting on top
      const tierMat = (y0, h, sponge, filling, frost, dens) => ({
        r: sponge,
        tex: (x, y, z, ny, t) => {
          if (ny > 0.55 || y > y0 + h - 0.12) return spr(x, y, z, t, dens) ?? S.pick(frost, t);
          const f = ((y - y0) / h) * 3;
          if (Math.abs(f - Math.round(f)) < 0.12 && f > 0.5) return S.pick(filling, t);
          return undefined;
        }
      });
      const FROST_PINK = [12, 11, 10, 9], FROST_WHITE = [10, 9, 9, 24], FROST_LAV = [19, 18, 18, 24];
      function tier(y0, h, r, sponge, filling, frost, dens) {
        S.lathe([0, y0, 0], h, t => r * (t > 0.92 ? 1 - (t - 0.92) * 0.6 : 1), tierMat(y0, h, sponge, filling, frost, dens), { res: 0.08 });
        // drips of frosting over the edge
        const n = Math.round(r * 9);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + B.n3(i, r, 1), len = 0.18 + B.n3(i * 3, r, 2) * 0.42;
          S.ball([Math.cos(a) * (r + 0.02), y0 + h - len * 0.5, Math.sin(a) * (r + 0.02)], [0.12, len * 0.55, 0.12], { r: frost }, { res: 0.05 });
        }
        S.torus([0, y0 + h - 0.02, 0], r - 0.08, 0.1, { r: frost, tex: (x, y, z, ny, t) => spr(x, y, z, t, 0.8) }, { res: 0.05 });
      }

      /* floating plate on cream clouds */
      S.lathe([0, -0.35, 0], 0.32, t => 4.6 - (1 - t) * 0.5, { r: [26, 25, 25, 24], tex: (x, y, z, ny) => (ny > 0.6 && Math.hypot(x, z) > 4.1 ? S.pick([19, 18], 0.5) : undefined) }, { res: 0.1 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, r = 3.4 + B.n3(i, 2, 2) * 1.3;
        S.ball([Math.cos(a) * r, -0.85 - B.n3(i, 3, 1) * 0.5, Math.sin(a) * r], 0.7 + B.n3(i, 4, 1) * 0.5, { r: [3, 10, 9, 24] }, { res: 0.12 });
      }

      /* three cake tiers */
      tier(0, 1.5, 3.1, [4, 5, 5, 6], [8, 9], FROST_PINK, 0.86);
      tier(1.5, 1.25, 2.15, [12, 11, 11, 10], [9, 24], FROST_WHITE, 0.83);
      tier(2.75, 1.05, 1.3, [8, 9, 9, 24], [18, 19], FROST_LAV, 0.84);

      /* battlements: cookie blocks and macarons round the bottom tier */
      const COOKIE = { r: [6, 7, 8, 8], mod: (x, y, z) => 0.18 * (B.n3(x * 4, y * 4, z * 4) - 0.5) };
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2, x = Math.cos(a) * 2.75, z = Math.sin(a) * 2.75;
        if (Math.abs(a - Math.PI / 2) < 0.25) continue; // gap above the gate
        if (i % 2) S.box([x, 1.72, z], [0.22, 0.24, 0.16], COOKIE, { res: 0.055, rotY: -a });
        else {
          const col = [[17, 24], [11, 10], [18, 24], [21, 22]][(i / 2) % 4];
          S.ball([x, 1.62, z], [0.22, 0.09, 0.22], { r: col }, { res: 0.045 });
          S.ball([x, 1.72, z], [0.19, 0.04, 0.19], { r: [9, 24] }, { res: 0.04 });
          S.ball([x, 1.82, z], [0.22, 0.09, 0.22], { r: col }, { res: 0.045 });
        }
      }
      /* the gate: a cookie arch with a chocolate door */
      K.build.arch(S, [0, 0, 3.05], { span: 1.3, height: 1.45, depth: 0.4, thick: 0.24, mats: { stone: COOKIE }, res: 0.06 });
      S.box([0, 0.55, 3.0], [0.42, 0.55, 0.08], { r: [4, 5, 6], tex: (x, y) => (Math.abs(((x + 0.42) * 4) % 1 - 0.5) > 0.44 || Math.abs(((y) * 4) % 1 - 0.5) > 0.44 ? 4 : undefined) }, { res: 0.04 });

      /* strawberries round the middle tier */
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.26, x = Math.cos(a) * 1.85, z = Math.sin(a) * 1.85;
        S.ball([x, 2.95, z], [0.22, 0.26, 0.22], { r: [15, 14, 14, 11], tex: (px, py, pz) => (B.n3(px * 60, py * 60, pz * 60) > 0.8 ? 22 : undefined) }, { res: 0.04 });
        S.lathe([x, 3.17, z], 0.08, t => 0.16 * (1 - t), { r: [16, 17] }, { res: 0.035 });
      }

      /* wafer towers with whipped-cream roofs and cherries */
      const TOWERS = [];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 3.35, z = Math.sin(a) * 3.35;
        const h = 3.4 + (k % 2) * 0.5;
        const stripe = k % 2 ? [11, 12] : [17, 20];
        S.lathe([x, 0, z], h, t => 0.5 - t * 0.05 + (t > 0.93 ? 0.1 : 0), {
          r: [7, 8, 8, 9],
          tex: (px, py, pz, ny, t) => (Math.sin(Math.atan2(pz - z, px - x) * 3 + py * 3.2) > 0.55 ? S.pick(stripe, t) : undefined)
        }, { res: 0.07 });
        for (let j = 0; j < 3; j++) {
          const wa = a + Math.PI + (j - 1) * 0.0 , wy = 0.9 + j * 0.9;
          const dir = [Math.cos(a + Math.PI * 0.85), Math.sin(a + Math.PI * 0.85)];
          const r0 = 0.49 - (wy / h) * 0.05;
          S.box([x + dir[0] * r0, wy, z + dir[1] * r0], [0.1, 0.17, 0.1], { r: [21, 22, 24], em: true }, { res: 0.04, rotY: -(a + Math.PI * 0.85) });
        }
        // swirl roof
        S.lathe([x, h + 0.1, z], 1.6, t => Math.max(0.03, (1 - Math.pow(t, 0.9)) * 0.64 * (0.86 + 0.14 * Math.sin(t * 26))), { r: [10, 9, 9, 24] }, { res: 0.05 });
        S.ball([x, h + 1.82, z], 0.2, { r: [15, 14, 14, 24] }, { res: 0.035 });
        S.lathe([x, h + 1.95, z], 0.3, t => 0.025, { r: [16, 17] }, { res: 0.03 });
        TOWERS.push([x, z, h]);
      }

      /* candles on the top tier (flames are separate rig parts) */
      const CANDLES = [];
      const top = 3.8;
      const candleMat = (cx, cz, a, b) => ({ r: [a[0], a[1]], tex: (x, y, z, ny, t) => (Math.sin(Math.atan2(z - cz, x - cx) * 1 + y * 22) > 0.2 ? S.pick(b, t) : undefined) });
      for (let i = 0; i < 11; i++) {
        const center = i === 10;
        const a = (i / 10) * Math.PI * 2, rr = center ? 0 : 0.9;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = center ? 0.95 : 0.62 + (i % 3) * 0.06;
        const colors = [[[24, 10], [11, 12]], [[24, 9], [20, 18]], [[24, 10], [17, 16]], [[22, 24], [21, 23]]][i % 4];
        S.lathe([x, top - 0.05, z], h, t => (center ? 0.13 : 0.1), candleMat(x, z, colors[0], colors[1]), { res: 0.03 });
        S.lathe([x, top - 0.05 + h, z], 0.09, t => 0.012, { r: [27, 4] }, { res: 0.02 });
        const tip = [x, top + h + 0.04, z];
        const fh = center ? 0.3 : 0.24;
        S.ball([tip[0], tip[1] + fh, tip[2]], [fh * 0.5, fh, fh * 0.5], { r: [23, 23, 21, 21], em: true }, { res: 0.028, ghost: true, tag: 'flame' + i });
        S.ball([tip[0], tip[1] + fh * 0.75, tip[2]], [fh * 0.22, fh * 0.45, fh * 0.22], { r: [21, 22, 22], em: true }, { res: 0.022, ghost: true, tag: 'flame' + i });
        CANDLES.push({ tip, lit: true, life: 1, grit: 0.6 + B.n3(i, 7, 7) * 0.9, lean: 0 });
      }

      /* balloons drifting round the castle */
      const BALLOONS = [];
      [[-6.2, 5.6, -1.5, [11, 12]], [5.8, 6.6, -2.4, [17, 16]], [6.4, 4.2, 2.6, [18, 19]], [-5.6, 3.8, 3.0, [21, 23]], [1.2, 8.2, -5.6, [20, 18]]].forEach(([x, y, z, col], i) => {
        const tag = 'balloon' + i;
        S.ball([x, y, z], [0.62, 0.74, 0.62], { r: [col[1], col[0], col[0], 24] }, { res: 0.07, tag });
        S.lathe([x, y - 0.82, z], 0.1, t => 0.08 * (1 - t), { r: [col[1], col[0]] }, { res: 0.03, tag });
        S.lathe([x, y - 2.6, z], 1.8, t => 0.012, { r: [25, 24] }, { res: 0.03, tag });
        BALLOONS.push([x, y, z]);
      });

      /* stars */
      K.seed(77);
      for (let i = 0; i < 240; i++) {
        const th = K.rnd() * Math.PI * 2, ph = Math.acos(K.rnd() * 1.6 - 0.6), r = 24 + K.rnd() * 4;
        S.ball([Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.8 + 3, Math.sin(ph) * Math.sin(th) * r], 0.035 + K.rnd() * 0.05,
          { r: K.rnd() < 0.3 ? [11, 10, 24] : K.rnd() < 0.5 ? [18, 24] : [20, 24], em: true }, { res: 0.09, ghost: true });
      }

      /* the reveal: a big "30" and 生日快乐, hidden until the candles are out */
      const TNAME = [0, 14.15, 0], T30 = [0, 10.8, 0], THB = [0, 7.7, 0];
      // each pixel is a dark back plate plus a bright face, so the letters read as solid blocks
      const voxel = (c, v, d, back, face, tag) => {
        S.box([c[0], c[1], c[2] - d * 0.55], [v * 0.52, v * 0.52, d * 0.5], { r: back, em: true }, { res: Math.min(0.06, v * 0.4), tag });
        S.box([c[0], c[1], c[2] + d * 0.1], [v * 0.44, v * 0.44, d * 0.18], { r: face, em: true }, { res: Math.min(0.05, v * 0.35), tag });
      };
      {
        const v = 0.44, cols = 13, w = cols * v, h = 8 * v;
        ['3', '0'].forEach((ch, ci) => DIGITS[ch].forEach((row, ry) => [...row].forEach((bit, rx) => {
          if (bit !== '1') return;
          voxel([T30[0] - w / 2 + (ci * 7 + rx + 0.5) * v, T30[1] + h / 2 - (ry + 0.5) * v, T30[2]], v, 0.5, [15, 23], [21, 21, 22], 't30');
        })));
      }
      const nm = glyphRows(NAME, 20);
      if (nm) {
        const v = 0.13, w = nm[0].length * v, h = nm.length * v;
        nm.forEach((row, ry) => [...row].forEach((bit, rx) => {
          if (bit !== '1') return;
          voxel([TNAME[0] - w / 2 + (rx + 0.5) * v, TNAME[1] + h / 2 - (ry + 0.5) * v, TNAME[2]], v, 0.28, [19, 19], [18, 18, 18], 'tname');
        }));
      }
      const hb = glyphRows('生日快乐', 17);
      if (hb) {
        const v = 0.13, w = hb[0].length * v, h = hb.length * v;
        hb.forEach((row, ry) => [...row].forEach((bit, rx) => {
          if (bit !== '1') return;
          voxel([THB[0] - w / 2 + (rx + 0.5) * v, THB[1] + h / 2 - (ry + 0.5) * v, THB[2]], v, 0.26, [13, 13], [12, 11, 11], 'thb');
        }));
      }
      S.bake();

      K.caustic(B, [0, top + 0.02, 0], 1.1, [22, 21, 23], { a: 0.5, zs: 1, n: 24 });
      K.mist(B, { rad: 9, zs: 1, y: -2.5, depth: 1.4, n: 110, cols: [2, 3], a: 0.12, size: [0.9, 1.8], drift: 0.3, where: () => true });
      K.glint(B, [0.6, top + 0.1, 0.6], [0.1, 1, 0.2], 0.2, 24);

      const pool = K.pool(B, 520), poolSmoke = K.pool(B, 160),
        W = B.finish({
          cam: { target: [0, 3.2, 0], dist: 20, pitch: 0.3, yaw: 0.08, sway: 0.12 },
          detail: 12,
          palName: 'Birthday Cake Castle',
          dither: 0.26,
          radius: 10,
          ao: { k: 0.45, range: 0.7 },
          fog: { c: 2, start: 0.72, max: 0.3 },
          refract: 6
        }),
        st = K.stage(W);
      rig.bind(st);

      const flow = K.flow.around(K.flow.sum(K.flow.curl(0.5, 0.9), K.flow.wind([0.05, 0.3, 0.05])), S.sdf, 0.4);
      const ps = K.particles(st, pool, { flow, ground: () => -6 });
      const smoke = st.add(K.smoke(st, poolSmoke, {
        at: [0, top + 1, 0], ramp: [28, 28, 29, 29, 25], sun: S.sun, rate: 0, life: 2.6, size: [0.06, 0.35], a: 0.55, shadow: 0.6, rise: 1.4,
        flow: K.flow.sum(K.flow.wind([0.1, 0.2, 0]), K.flow.curl(0.4, 0.9))
      }));
      const candleLamp = { p: [0, top + 1, 0], r: 6, s: 0.6 };
      const lit = K.light.system(st, cap, [candleLamp]);
      st.add(lit);
      st.add(ps);

      const HIDE = [0, -300, 0];
      const party = {
        blowing: 0, wind: [1, 0, 0], total: CANDLES.length, litCount: CANDLES.length, revealAt: null, done: false, yaw: W.cam.yaw,
        onChange: null,
        relight() {
          for (const c of CANDLES) { c.lit = true; c.life = 1; c.lean = 0; }
          this.litCount = CANDLES.length; this.revealAt = null; this.done = false; this._fw = 0; this._allOutAt = null;
          for (const c of CANDLES) ps.sparks(c.tip, 4, [24, 22, 21], null, 1.2);
          this.onChange && this.onChange(this);
        }
      };
      W.party = party;
      let nextSpark = 0;
      st.add({
        update(dt, t) {
          const p = party;
          // candles: flicker, lean in the wind, go out
          const gust = p.blowing;
          for (let i = 0; i < CANDLES.length; i++) {
            const c = CANDLES[i];
            if (c.lit) {
              const target = gust * (0.55 + 0.25 * Math.sin(t * 17 + i));
              c.lean += (target - c.lean) * Math.min(1, dt * 10);
              if (gust > 0.05) {
                c.life -= dt * gust * (1.15 / c.grit) * (0.75 + 0.5 * Math.sin(t * 5 + i * 2.3) ** 2);
                if (c.life <= 0) {
                  c.lit = false; p.litCount--;
                  smoke.burst([c.tip[0], c.tip[1] + 0.12, c.tip[2]], 7);
                  p.onChange && p.onChange(p);
                }
              }
              const fl = Math.sin(t * 11 + i * 1.7) * 0.06 + Math.sin(t * 23 + i) * 0.03;
              const axis = [-p.wind[2], 0, p.wind[0]];
              const R = M.mul(M.rot(axis, -c.lean * 0.9), M.rot([0, 0, 1], fl));
              rig.set('flame' + i, R, c.tip, [c.tip[0] + p.wind[0] * c.lean * 0.08, c.tip[1] + Math.sin(t * 9 + i) * 0.01, c.tip[2] + p.wind[2] * c.lean * 0.08]);
            } else rig.set('flame' + i, M.rot([0, 1, 0], 0), c.tip, HIDE);
          }
          // reveal once every flame is out
          if (p.litCount === 0 && p._allOutAt == null) p._allOutAt = t;
          if (p._allOutAt != null && p.revealAt == null && t - p._allOutAt > 1.1) { p.revealAt = t; p.onChange && p.onChange(p); }
          if (p.revealAt != null) {
            const k = Math.min(1, (t - p.revealAt) / 1.6), e = 1 - Math.pow(1 - k, 3);
            const k2 = Math.min(1, Math.max(0, (t - p.revealAt - 0.5) / 1.6)), e2 = 1 - Math.pow(1 - k2, 3);
            const face = M.rot([0, 1, 0], p.yaw);
            const bob = Math.sin(t * 1.4) * 0.12;
            rig.set('t30', face, T30, [T30[0], T30[1] - 2.5 * (1 - e) + bob, T30[2]]);
            if (k2 > 0) rig.set('thb', face, THB, [THB[0], THB[1] - 2.0 * (1 - e2) + bob * 0.7, THB[2]]);
            else rig.set('thb', face, THB, HIDE);
            const k3 = Math.min(1, Math.max(0, (t - p.revealAt - 1.0) / 1.6)), e3 = 1 - Math.pow(1 - k3, 3);
            if (k3 > 0) rig.set('tname', face, TNAME, [TNAME[0], TNAME[1] - 2.0 * (1 - e3) + bob * 1.2, TNAME[2]]);
            else rig.set('tname', face, TNAME, HIDE);
            // fireworks
            if (t >= (p._fw || 0)) {
              p._fw = t + 0.35 + K.rnd() * 0.4;
              const a = K.rnd() * Math.PI * 2, r = 3 + K.rnd() * 4;
              const cols = [[24, 11, 12, 13], [24, 22, 21, 23], [24, 17, 16], [24, 18, 19], [24, 20, 18]][Math.floor(K.rnd() * 5)];
              ps.sparks([Math.cos(a) * r, 6 + K.rnd() * 5, Math.sin(a) * r], 36, cols, null, 4.5 + K.rnd() * 2);
              lit.flash(0.25, 0.12);
            }
            if (k3 === 1 && !p.done) { p.done = true; p.onChange && p.onChange(p); }
          } else {
            rig.set('t30', M.rot([0, 1, 0], 0), T30, HIDE);
            rig.set('thb', M.rot([0, 1, 0], 0), THB, HIDE);
            rig.set('tname', M.rot([0, 1, 0], 0), TNAME, HIDE);
          }
          BALLOONS.forEach(([x, y, z], i) => rig.set('balloon' + i, M.rot([0, 0, 1], Math.sin(t * 0.7 + i) * 0.06), [x, y - 2.6, z], [x, y - 2.6 + Math.sin(t * 0.8 + i * 1.9) * 0.35, z]));
          rig.apply();
          // ambient sparkles, warm while the candles burn
          if (t >= nextSpark) {
            nextSpark = t + 0.12;
            const a = K.rnd() * Math.PI * 2, r = 1 + K.rnd() * 4;
            ps.embers([Math.cos(a) * r, 0.5 + K.rnd() * 3, Math.sin(a) * r], 1, K.rnd() < 0.5 ? [24, 10, 11] : [24, 18, 20]);
          }
          candleLamp.s = (0.12 + 0.55 * (p.litCount / p.total)) * (0.92 + 0.08 * Math.sin(t * 13));
          lit.touch();
        },
        poke(hit) {
          if (!hit) return;
          ps.sparks(hit.p, 18, [24, 11, 18, 21, 17], null, 4);
        }
      });
      return W;
    }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = def;
  else root.PARTY_SCENE = def;
})(this);
