// Arcane Skyreach — a magical night diorama built with @shapeshift-labs/ink-studio (MIT).
(function (root) {
  const def = ({ makeBuilder, makeSculpt, KIT: K }) => ({
    id: 'arcane',
    name: 'Arcane Skyreach',
    seed: 23,
    build(seed) {
      const V = K.V, M = K.M;
      const B = makeBuilder(seed, [
        0x070814, 0x111428, 0x1c2140, 0x2c3358, 0x434c74, 0x67709a, 0x9aa2c4, // 0-6 void + stone
        0x16352e, 0x22604c, 0x3e9a6a,                                         // 7-9 moss
        0x123a5a, 0x1f6f9a, 0x3fb4d8, 0x9ef0ff, 0xe8fdff,                     // 10-14 crystal
        0x2a1450, 0x5a2a92, 0x9a52d8, 0xd8a2ff,                               // 15-18 arcane violet
        0xb8862a, 0xffcf5a, 0xfff2b0,                                         // 19-21 gold
        0x141a34, 0x252c52, 0xffffff,                                         // 22-24 mist, white
        0x3a1a3a, 0x6a3a5a, 0xff7ac8, 0xffc8ec                                // 25-28 bark, blossom
      ]);
      const S = K.sculpt(makeSculpt(B)),
        rig = K.rig(B, S),
        cap = K.light.capture(B, S);

      S.sun = B.norm([-0.5, 0.7, -0.5]);
      S.view = B.norm([0.3, 0.25, 0.92]);
      S.res = 0.1;
      S.amb = 0.2;
      S.sky = 0.3;
      S.lights.push({ p: [-1.2, 8.2, -0.8], r: 7, s: 0.7 }, { p: [1.8, 2.6, 1.1], r: 3.6, s: 0.5 }, { p: [0.3, 0.4, 1.9], r: 2.6, s: 0.45 });

      const STONE = {
        r: [1, 2, 3, 4, 5, 6],
        mod: (x, y, z) => 0.25 * (B.n3(x * 0.7, y * 0.7, z * 0.7) - 0.5),
        tex: (x, y, z, ny, t) => (ny > 0.55 && B.n3(x * 0.6 + 3, y * 0.6, z * 0.6) > 0.5 ? S.pick([7, 8, 9], t) : undefined)
      };
      const TOWER = { r: [2, 3, 4, 5, 6], mod: (x, y, z) => 0.12 * (B.n3(x * 1.4, y * 1.4, z * 1.4) - 0.5) };
      const H = { hold: true };

      /* main floating island */
      const isle = t => (t < 0.78 ? 0.2 + Math.pow(t / 0.78, 0.8) * 4.1 + 0.25 * Math.sin(t * 19) : 4.3 - (t - 0.78) * 1.3);
      S.lathe([0, -4.6, 0], 4.6, isle, STONE, { res: 0.11, bump: [0.22, 0.85] });
      for (const [rx, ry, rz, rad, h] of [[-1.9, -3.5, 1.2, 0.9, 2.4], [2.1, -3.2, -1.0, 0.8, 2.2], [0.6, -3.7, 2.0, 0.6, 1.8], [-1.2, -3.0, -2.0, 0.7, 2.0]])
        S.lathe([rx, ry, rz], h, t => 0.07 + Math.pow(t, 0.85) * rad, { r: [1, 2, 3, 4] }, { res: 0.11, bump: [0.16, 1.1] });

      /* wizard tower */
      const TX = -1.3, TZ = -0.9;
      const towerProf = t => 0.95 - t * 0.38 + (t > 0.97 ? 0.25 : 0) + (Math.abs(t - 0.5) < 0.02 ? 0.12 : 0);
      S.lathe([TX, 0, TZ], 6.4, towerProf, TOWER, { res: 0.085 });
      S.lathe([TX, 6.35, TZ], 0.35, [0.85, 0.95], TOWER, { res: 0.08 });          // crown
      for (let i = 0; i < 8; i++) {                                               // crenellations
        const a = (i / 8) * Math.PI * 2;
        S.box([TX + Math.cos(a) * 0.82, 6.85, TZ + Math.sin(a) * 0.82], [0.13, 0.17, 0.13], TOWER, { res: 0.06, rotY: a });
      }
      for (let k = 0; k < 9; k++) {                                               // lit windows spiralling up
        const y = 1.0 + k * 0.6, a = k * 2.1 + 0.6, r = 0.95 - (y / 6.4) * 0.38;
        S.box([TX + Math.cos(a) * r, y, TZ + Math.sin(a) * r], [0.1, 0.18, 0.1], { r: [19, 20, 21], em: true }, { res: 0.045, rotY: -a });
      }
      S.torus([TX, 3.25, TZ], 0.8, 0.07, { r: [16, 17, 18], em: true }, { res: 0.05 });   // rune band

      /* rune circle and standing stones */
      S.torus([0.6, 0.06, 1.7], 1.05, 0.05, { r: [19, 20, 21], em: true }, { res: 0.045 });
      S.torus([0.6, 0.06, 1.7], 0.72, 0.035, { r: [16, 17, 18], em: true }, { res: 0.04 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        S.box([0.6 + Math.cos(a) * 1.45, 0.45, 1.7 + Math.sin(a) * 1.45], [0.14, 0.45 + (i % 2) * 0.15, 0.1], TOWER, { res: 0.06, rotY: a });
      }
      for (const [bx, bz, br] of [[3.2, -0.6, 0.5], [-3.3, 0.6, 0.55], [2.4, 2.6, 0.4], [-2.6, 2.5, 0.42]]) S.rock([bx, 0.2 + br * 0.3, bz], br, STONE, { res: 0.1 });

      /* spirit blossom tree */
      const tree = K.grow.branch({ at: [2.2, 0.05, -0.4], len: 2.0, r: 0.16, depth: 3, forks: 3, spread: 0.72, shrink: 0.66, segs: 5, droop: 0.1, seed: 5 });
      K.grow.limbs(S, tree, { r: [25, 26, 26, 5] }, { res: 0.06 });
      S.bake();
      for (const tip of tree.tips) {
        S.ball(tip.p, 0.24 + 0.1 * B.n3(tip.p[0], tip.p[1], tip.p[2]), { r: [16, 27, 27, 28], em: true }, { res: 0.06, ghost: true, tag: 'bloom' });
      }

      /* small floating islets (each its own rig part) */
      const ISLETS = [[-6.2, 1.6, -3.0, 1.2], [6.4, 2.6, -2.2, 1.0], [5.2, -1.2, 3.6, 0.9], [-5.6, -0.8, 3.4, 0.8], [0.8, 4.8, -6.4, 1.1]];
      ISLETS.forEach(([x, y, z, s], i) => {
        const tag = 'islet' + i;
        S.lathe([x, y - 2.2 * s, z], 2.3 * s, t => (t < 0.8 ? 0.1 + Math.pow(t / 0.8, 0.8) * 1.2 * s : 1.2 * s - (t - 0.8) * 0.8 * s), STONE, { res: 0.1, tag });
        if (i % 2 === 0) {
          for (let c = 0; c < 4; c++) {
            const a = c * 1.7 + i, h = (0.55 + (c % 3) * 0.25) * s;
            S.lathe([x + Math.cos(a) * 0.35 * s, y + 0.05, z + Math.sin(a) * 0.35 * s], h, t => Math.max(0.02, (1 - t) * 0.16 * s), { r: [10, 11, 12, 13], em: true }, { res: 0.045, tag });
          }
        } else {
          S.ball([x, y + 0.35 * s, z], [0.45 * s, 0.38 * s, 0.45 * s], { r: [8, 9, 27, 28], em: true }, { res: 0.06, tag });
        }
      });

      /* floating arcane crystal above the tower + orbiting rune stones */
      const CC = [TX, 8.4, TZ];
      const CRYSTAL = K.look.jelly([15, 16, 11, 12, 13], { depth: 1.3, k: 0.9, glow: [12, 13, 13, 14, 18], at: 0.24, core: { p: CC, r: 0.4, k: 0.9 }, gloss: { c: 24, at: 0.985, c2: 14, at2: 0.965 } });
      S.lathe([CC[0], CC[1], CC[2]], 1.3, t => Math.max(0.03, (1 - t) * 0.6), CRYSTAL, { res: 0.055, tag: 'crystal', whole: true });
      S.lathe([CC[0], CC[1] - 0.95, CC[2]], 0.95, t => Math.max(0.03, t * 0.6), CRYSTAL, { res: 0.055, tag: 'crystal', whole: true });
      S.ball(CC, [0.25, 0.42, 0.25], { r: [13, 14, 24], em: true }, { ghost: true, res: 0.045, tag: 'crystal' });
      const RUNES = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, rad = 1.6 + (i % 2) * 0.3;
        const pos = [CC[0] + Math.cos(a) * rad, CC[1] + Math.sin(i * 1.9) * 0.4, CC[2] + Math.sin(a) * rad];
        RUNES.push({ pos, a, rad, y0: pos[1] });
        S.box(pos, [0.12, 0.2, 0.05], i % 2 ? { r: [16, 17, 18], em: true } : { r: [19, 20, 21], em: true }, { res: 0.04, tag: 'rune' + i, rotY: a });
      }

      K.seed(99);
      /* moon and stars far away */
      S.ball([-32, 11, -21], 4.2, { r: [6, 19, 20, 21, 21], em: true, mod: (x, y, z) => 0.55 * (B.n3(x * 0.55, y * 0.55, z * 0.55) - 0.5) }, { res: 0.2 });
      for (let i = 0; i < 260; i++) {
        const th = K.rnd() * Math.PI * 2, ph = Math.acos(K.rnd() * 1.6 - 0.6), r = 24 + K.rnd() * 4;
        S.ball([Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.8 + 2, Math.sin(ph) * Math.sin(th) * r], 0.035 + K.rnd() * 0.05,
          { r: K.rnd() < 0.25 ? [16, 17, 18] : K.rnd() < 0.5 ? [11, 12, 13] : [12, 13, 14], em: true }, { res: 0.09, ghost: true });
      }
      S.bake();

      K.caustic(B, [0.6, 0.08, 1.7], 1.0, [21, 20, 19, 17], { a: 0.55, zs: 1, n: 26 });
      K.shafts(B, { from: [-16, 8.5, -11], dir: [0.74, -0.42, 0.52], len: 17, r: 0.7, n: 16, col: 21, a: 0.06 });
      K.shafts(B, { from: [-1.3, 9.5, -0.9], dir: [0, -1, 0], len: 3.2, r: 0.35, n: 10, col: 13, a: 0.07 });
      K.mist(B, { rad: 9, zs: 1, y: -4.5, depth: 1.6, n: 120, cols: [22, 23], a: 0.13, size: [0.9, 1.8], drift: 0.35, where: () => true });
      K.glint(B, [CC[0] + 0.25, CC[1] + 0.55, CC[2] + 0.4], [0.2, 1, 0], 0.24, 24);

      const pool = K.pool(B, 420),
        W = B.finish({
          cam: { target: [0, 2.2, 0], dist: 27, pitch: 0.12, yaw: 0.55, sway: 0.15 },
          detail: 12,
          palName: 'Arcane Skyreach',
          dither: 0.28,
          radius: 10,
          ao: { k: 0.5, range: 0.7 },
          fog: { c: 22, start: 0.7, max: 0.32 },
          refract: 6
        }),
        st = K.stage(W);
      rig.bind(st);

      const flow = K.flow.around(K.flow.sum(K.flow.curl(0.5, 0.8), K.flow.wind([0.08, 0.3, 0.04])), S.sdf, 0.5);
      const ps = K.particles(st, pool, { flow, ground: () => -8 });
      const cryLamp = { p: CC.slice(), r: 7, s: 0.55 }, treeLamp = { p: [2.2, 2.8, -0.4], r: 3.8, s: 0.4 };
      const lit = K.light.system(st, cap, [cryLamp, treeLamp]);
      let next = 0;
      st.add(lit);
      st.add(ps);
      st.add({
        update(dt, t) {
          const bob = Math.sin(t * 1.3) * 0.25;
          rig.set('crystal', M.rot([0, 1, 0], t * 0.5), CC, [CC[0], CC[1] + bob, CC[2]]);
          for (let i = 0; i < RUNES.length; i++) {
            const r = RUNES[i], ang = r.a + t * (i % 2 ? -0.35 : 0.45);
            rig.set('rune' + i, M.rot([0, 1, 0], -ang + r.a), r.pos, [CC[0] + Math.cos(ang) * r.rad, r.y0 + bob + Math.sin(t * 1.7 + i) * 0.2, CC[2] + Math.sin(ang) * r.rad]);
          }
          ISLETS.forEach(([x, y, z], i) => {
            rig.set('islet' + i, M.rot([0, 1, 0], Math.sin(t * 0.2 + i) * 0.1), [x, y, z], [x, y + Math.sin(t * 0.6 + i * 1.7) * 0.3, z]);
          });
          rig.apply();
          if (t >= next) {
            next = t + 0.08;
            const a = K.rnd() * Math.PI * 2, r = 0.5 + K.rnd() * 3.6;
            ps.embers([Math.cos(a) * r, 0.3, Math.sin(a) * r], 1, K.rnd() < 0.5 ? [13, 12, 11] : [18, 17, 16]);
            if (K.rnd() < 0.5) ps.embers([2.2 + (K.rnd() - 0.5) * 2.4, 2.4 + K.rnd(), -0.4 + (K.rnd() - 0.5) * 2.4], 1, [28, 27, 16]);
            if (K.rnd() < 0.3) ps.embers([CC[0], CC[1] + bob, CC[2]], 1, [14, 13, 18]);
          }
          cryLamp.p[1] = CC[1] + bob;
          cryLamp.s = 0.5 + 0.12 * Math.sin(t * 2.2);
          treeLamp.s = 0.36 + 0.06 * Math.sin(t * 1.4);
          lit.touch();
        },
        poke(hit) {
          if (!hit) return;
          ps.sparks(hit.p, 20, [24, 14, 13, 18, 21], null, 4.5);
          lit.flash(0.35, 0.18);
        }
      });
      return W;
    }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = def;
  else root.ARCANE_SCENE = def;
})(this);
