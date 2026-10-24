'use strict';

/* ==========================================================================
   The FatBoy figure
   The logo is a vector trace (see figure-data.js). `figureShape` warps it:
   at progress 0 it is the original drawing, at 1 the lean version at goal weight.
   `main(p)` and `soft(p)` are SVG path data; the soft strokes fade out (`softOpacity(p)`).
   ========================================================================== */
const figureShape = (() => {
  const { y0, step, front, back, contours } = FIGURE_DATA;
  const MAX_PIECE = 20; // curves longer than this are split so the warp follows them closely

  const lerp = (a, b, t) => a + (b - a) * t;

  // A straight line as a cubic whose control points sit a third of the way along it.
  const line = (from, to) => [
    lerp(from[0], to[0], 1 / 3), lerp(from[1], to[1], 1 / 3),
    lerp(from[0], to[0], 2 / 3), lerp(from[1], to[1], 2 / 3),
    to[0], to[1],
  ];

  // Every traced segment becomes cubics [x1, y1, x2, y2, x3, y3], so there is one case to handle.
  function toCubics(from, seg) {
    if (seg.length === 6) return [seg];
    // A corner segment is two straight lines: from -> corner -> end.
    const corner = [seg[0], seg[1]];
    return [line(from, corner), line(corner, [seg[2], seg[3]])];
  }

  // Cut a cubic into `count` pieces that together trace the same curve.
  function subdivide(from, [x1, y1, x2, y2, x3, y3], count) {
    const at = t => {
      const u = 1 - t;
      return [
        u * u * u * from[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * from[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ];
    };
    const slope = t => {
      const u = 1 - t;
      return [
        3 * (u * u * (x1 - from[0]) + 2 * u * t * (x2 - x1) + t * t * (x3 - x2)),
        3 * (u * u * (y1 - from[1]) + 2 * u * t * (y2 - y1) + t * t * (y3 - y2)),
      ];
    };
    const pieces = [];
    for (let i = 0; i < count; i++) {
      const t0 = i / count;
      const t1 = (i + 1) / count;
      const a = at(t0), b = at(t1), da = slope(t0), db = slope(t1);
      const k = (t1 - t0) / 3;
      pieces.push([a[0] + da[0] * k, a[1] + da[1] * k, b[0] - db[0] * k, b[1] - db[1] * k, b[0], b[1]]);
    }
    return pieces;
  }

  // Strokes that read as sagging fat (the fold under the chest, the neck fold) fade out as the figure slims.
  const SOFT = new Set([5, 10]);

  const shapes = contours.map(({ start, segs }, index) => {
    const pieces = [];
    let from = start;
    for (const seg of segs) {
      for (const cubic of toCubics(from, seg)) {
        const reach = Math.hypot(cubic[4] - from[0], cubic[5] - from[1]);
        pieces.push(...subdivide(from, cubic, Math.max(1, Math.ceil(reach / MAX_PIECE))));
        from = [cubic[4], cubic[5]];
      }
    }
    return { start, pieces, soft: SOFT.has(index) };
  });

  const sample = (table, y) => {
    const position = clamp((y - y0) / step, 0, table.length - 1);
    const low = Math.floor(position);
    const high = Math.min(table.length - 1, low + 1);
    return table[low] + (table[high] - table[low]) * (position - low);
  };

  // Where the front of the body sits when lean: a neck that drops straight into a modest chest, a flat
  // stomach, then the belt and legs return to the original drawing. Each pair is [y, x].
  const LEAN_FRONT = [
    [330, sample(front, 330)], [360, 492], [390, 476], [420, 460], [450, 446], [480, 438], [520, 436],
    [560, 438], [620, 442], [700, 446], [780, 442], [840, 424], [900, 396], [960, 392], [1000, sample(front, 1000)],
  ];
  const leanFront = y => {
    const next = Math.max(1, LEAN_FRONT.findIndex(([keyY]) => keyY >= y));
    const [y1, x1] = LEAN_FRONT[next - 1];
    const [y2, x2] = LEAN_FRONT[next];
    return x1 + ((x2 - x1) * clamp(y - y1, 0, y2 - y1)) / (y2 - y1);
  };

  // How far the back is pulled in at each height: no shoulder hump, a flat upper back, a trim waist.
  const BACK_TRIM = [[330, 0], [360, 12], [390, 26], [420, 36], [450, 42], [480, 44], [520, 44], [570, 38], [620, 30], [700, 22], [760, 14], [820, 6], [870, 0]];
  const trimAt = y => {
    const next = BACK_TRIM.findIndex(([keyY]) => keyY >= y);
    if (next <= 0) return 0;
    const [y1, t1] = BACK_TRIM[next - 1];
    const [y2, t2] = BACK_TRIM[next];
    return t1 + ((t2 - t1) * (y - y1)) / (y2 - y1);
  };
  const leanBack = y => sample(back, y) - 0.85 * trimAt(y);

  const smooth = (from, to, value) => {
    const t = clamp((value - from) / (to - from), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // The jaw line and the front of the neck are lifted so the chin sits on a clean angle, with no second chin.
  const jawLift = (x, y) =>
    54 * smooth(462, 548, x) * (1 - smooth(585, 640, x)) * smooth(270, 300, y) * (1 - smooth(335, 410, y));

  // The drawing has a second curve under the chin. Everything between the chin line and that curve is
  // squashed flat onto the chin line, so the jaw reads as one clean line (jawLift takes over toward the neck).
  const CHIN_LINE = 284;
  const chinTuck = (x, y) =>
    clamp(y - CHIN_LINE, 0, 32) * smooth(430, 485, x) * (1 - smooth(500, 560, x)) * (1 - smooth(335, 410, y));
  const faceLift = (x, y) => Math.max(jawLift(x, y), chinTuck(x, y));

  // The face and neck lose their softness first: gone by about a quarter of the way to lean.
  const faceAmount = progress => clamp(progress * 4, 0, 1);

  // Rows below the neck are re-spaced between the front and back outlines, so the
  // belly, arm and belt keep their shape while the whole torso gets slimmer.
  function warp(x, y, progress) {
    if (y > y0) {
      const front0 = sample(front, y);
      const back0 = sample(back, y);
      const front1 = front0 + (leanFront(y) - front0) * progress;
      const back1 = back0 + (leanBack(y) - back0) * progress;
      return [front1 + ((x - front0) / (back0 - front0)) * (back1 - front1), y - faceLift(x, y) * faceAmount(progress)];
    }
    // A slimmer face: pull the jaw and cheeks slightly toward the centre line.
    const jaw = Math.max(0, 1 - Math.abs(y - 250) / 100);
    const centre = 570;
    return [centre + (x - centre) * (1 - 0.07 * progress * jaw), y - faceLift(x, y) * faceAmount(progress)];
  }

  const round = n => Math.round(n * 10) / 10;

  const outline = (progress, wantSoft) => {
    const point = (x, y) => warp(x, y, progress).map(round).join(' ');
    return shapes.filter(({ soft }) => soft === wantSoft).map(({ start, pieces }) => {
      const curves = pieces.map(p => `C${point(p[0], p[1])} ${point(p[2], p[3])} ${point(p[4], p[5])}`);
      return `M${point(start[0], start[1])}${curves.join('')}Z`;
    }).join('');
  };

  // Where the jaw meets the ear. The traced drawing leaves the jawline hanging in the air once it is
  // lifted, so a short stroke carries it round the angle of the jaw and up the ramus to the earlobe.
  const EAR_FOOT = [576, 243];
  const JAW_END = [552, 310];
  const HALF_WIDTH = 2.2;
  const ramus = progress => {
    const amount = faceAmount(progress);
    if (amount < 0.05) return '';
    const e = warp(JAW_END[0], JAW_END[1], progress);
    const top = [e[0] + (EAR_FOOT[0] - e[0]) * amount, e[1] + (EAR_FOOT[1] - e[1]) * amount];
    const c1 = [e[0] + 12, e[1] + 2 * amount];
    const c2 = [top[0] - 1, top[1] + 15 * amount];
    const at = t => {
      const u = 1 - t;
      return [0, 1].map(i => u * u * u * e[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * top[i]);
    };
    const left = [];
    const right = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [x, y] = at(t);
      const [x2, y2] = at(Math.min(1, t + 0.02));
      const [x1, y1] = at(Math.max(0, t - 0.02));
      const length = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / length;
      const ny = (x2 - x1) / length;
      left.push([x + nx * HALF_WIDTH, y + ny * HALF_WIDTH]);
      right.push([x - nx * HALF_WIDTH, y - ny * HALF_WIDTH]);
    }
    const points = left.concat(right.reverse()).map(([x, y]) => `${round(x)} ${round(y)}`);
    return `M${points[0]}L${points.slice(1).join('L')}Z`;
  };

  return {
    main: progress => outline(progress, false) + ramus(progress),
    soft: progress => outline(progress, true),
    softOpacity: progress => clamp(1 - progress * 1.6, 0, 1),
  };
})();
