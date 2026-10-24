'use strict';

/* ==========================================================================
   The FatBoy figure, seen from the front
   Drawn in code, in the same line style as the side view. `frontShape(p)` gives SVG path data for
   progress p: 0 is the starting body, 1 is lean at goal weight. Everything is built from a few
   widths that ease between the two, so the slider and the weight-loss tween just work.
   `main` is the outline, `soft` the sagging folds (they fade as p grows), `lean` the muscle
   lines (they fade in), `dots` the eyes and chest dots (drawn as thick round dots).
   ========================================================================== */
const frontShape = (() => {
  const mix = (a, b, t) => a + (b - a) * t;
  const r1 = n => Math.round(n * 10) / 10;
  const mirror = pts => pts.map(([x, y]) => [1000 - x, y]);

  // A smooth curve through the points (Catmull-Rom turned into cubic segments).
  function spline(pts, closed = false) {
    const n = pts.length;
    const at = i => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  }
  // The same curve drawn on both sides of the centre line.
  const pair = pts => spline(pts) + spline(mirror(pts));

  return progress => {
    const p = Math.min(1, Math.max(0, progress));
    const L = (heavy, lean) => mix(heavy, lean, p);
    const left = x => 500 - x; // distance from the centre line -> x on the left

    /* head */
    const cheek = L(106, 94), jaw = L(92, 72), chin = L(54, 38), chinY = L(324, 310);
    const headLeft = [[500, 46], [left(52), 56], [left(cheek - 10), 104], [left(cheek), 176], [left(cheek - 4), 224], [left(jaw), 266], [left(chin), 302]];
    const head = spline([...headLeft, [500, chinY], ...mirror(headLeft).reverse().slice(0, -1)], true);
    const hairline = spline([[left(cheek - 4), 150], [left(cheek - 22), 112], [left(46), 96], [500, 104], [500 + 46, 96], [500 + cheek - 22, 112], [500 + cheek - 4, 150]]);
    const part = spline([[left(46), 96], [left(70), 112], [left(80), 134]]);
    const ear = pts => spline(pts);
    const ears = ear([[left(cheek - 2), 160], [left(cheek + 18), 166], [left(cheek + 16), 206], [left(cheek - 2), 228]])
      + ear(mirror([[left(cheek - 2), 160], [left(cheek + 18), 166], [left(cheek + 16), 206], [left(cheek - 2), 228]]));
    const brows = spline([[left(64), 160], [left(44), 152], [left(22), 156]]) + spline(mirror([[left(64), 160], [left(44), 152], [left(22), 156]]));
    const nose = 'M500 188C494 210 490 222 482 230C494 238 506 238 518 230';
    const mouth = `M${left(32)} 266C${left(14)} ${L(274, 272)} ${500 + 14} ${L(274, 272)} ${500 + 32} 266`;

    /* neck, shoulders, arms */
    const neck = L(80, 52), sh = L(232, 198), armA = L(92, 62), armB = L(70, 46);
    const shoulder = [[left(neck), 292], [left(neck + 2), 338], [left(neck + 34), 366], [left(sh - 46), 384], [left(sh), 410]];
    const armOut = [[left(sh), 410], [left(sh + 14), 452], [left(sh + 32), 530], [left(sh + 56), 620], [left(sh + 84), 720], [left(sh + 112), 820], [left(sh + 122), 862]];
    const armThick = [0, armA, armA, mix(armA, armB, 0.5), armB, armB, armB];
    const armIn = armOut.slice(1).map(([x, y], i) => [x + armThick[i + 1], y]);
    const armpit = armIn[0];

    /* torso */
    const chest = L(170, 150), belly = L(222, 138), waist = L(196, 134);
    const torso = [armpit, [left(chest + 6), 540], [left(chest + 2), 600], [left(belly - 12), 660], [left(belly), 715], [left(waist + 6), 770], [left(waist), 800]];

    /* waistband and shorts */
    const bandTop = L(796, 786), sag = L(26, 8);
    const w = waist + 6;
    const band = `M${left(w)} ${bandTop}Q500 ${bandTop + sag} ${500 + w} ${bandTop}`
      + `M${left(w + 2)} ${bandTop + 38}Q500 ${bandTop + 38 + sag} ${500 + w + 2} ${bandTop + 38}`
      + `M${left(w)} ${bandTop}L${left(w + 2)} ${bandTop + 38}M${500 + w} ${bandTop}L${500 + w + 2} ${bandTop + 38}`
      + `M${left(w + 4)} ${bandTop + 38}L${left(w + 14)} 868M${500 + w + 4} ${bandTop + 38}L${500 + w + 14} 868M500 ${bandTop + 38 + sag}L500 868`;

    const ny = L(716, 700);
    const navel = `M500 ${ny - 11}C492 ${ny - 4} 492 ${ny + 4} 500 ${ny + 11}C508 ${ny + 4} 508 ${ny - 4} 500 ${ny - 11}Z`;

    const main = head + hairline + part + ears + brows + nose + mouth
      + spline(shoulder) + spline(mirror(shoulder)) + spline(armOut) + spline(mirror(armOut)) + spline(armIn) + spline(mirror(armIn))
      + spline(torso) + spline(mirror(torso)) + band + navel;

    /* soft lines: the folds under the chest and belly, a second chin */
    const fold = y => spline([[left(chest - 30), y], [left(60), y + 22], [500, y + 26]]) + spline(mirror([[left(chest - 30), y], [left(60), y + 22], [500, y + 26]]));
    const soft = fold(L(566, 556)) + spline([[left(belly - 40), L(704, 700)], [left(70), L(742, 730)], [500, L(752, 738)], [500 + 70, L(742, 730)], [500 + belly - 40, L(704, 700)]])
      + spline([[left(chin + 14), chinY - 8], [left(26), chinY + 14], [500 + 26, chinY + 14], [500 + chin + 14, chinY - 8]]);

    /* lean lines: chest, and the line down the middle */
    const lean = spline([[left(chest - 14), 520], [left(70), 556], [500 - 8, 548]]) + spline(mirror([[left(chest - 14), 520], [left(70), 556], [500 - 8, 548]]))
      + 'M500 452L500 540M500 596C494 600 494 604 500 608M500 640C494 644 494 648 500 652';

    const dots = `M${left(42)} 182h.1M${500 + 42} 182h.1`;
    const chestDots = `M${left(78)} ${L(548, 528)}h.1M${500 + 78} ${L(548, 528)}h.1`;

    return { main, soft, lean, dots, chestDots, softOpacity: Math.min(1, Math.max(0, 1 - p * 1.6)), leanOpacity: Math.min(1, Math.max(0, (p - 0.4) * 1.7)) };
  };
})();
