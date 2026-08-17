// SVG path geometry for the avatar shape compiler.
//
// Why this exists: shapes are drawn in whatever vector tool feels right, so
// every source file arrives with its own viewBox, its own units, and
// sometimes a rotate() on a group. Rather than making the artist normalize
// by hand, we normalize here — measure the real ink, fit it into the design
// sheet, and BAKE the transform into the emitted path data.
//
// Baking matters: if we shipped a <g transform="scale(...)"> instead, the
// cut-edge stroke width would scale with the shape and a small cutout would
// get a hairline edge while a big one got a fat one. Baked coordinates mean
// one stroke width reads identically on all 58 shapes.
//
// Supported path commands: M L H V C S Q T A Z (absolute + relative). Arcs are
// converted to cubics at parse time — an arc's bounding box cannot be read off
// its endpoints (a semicircle's bulge is the whole shape), and a stamp drawn
// as a <circle> would otherwise measure as zero-height and fail to fit.
//
// Transforms: matrix, translate, scale, rotate, skewX, skewY.

// ---- affine matrices --------------------------------------------------------
// [a c e]
// [b d f]  — same order as SVG's matrix(a b c d e f).

export const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiply(m, n) {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

function apply(m, x, y) {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

/** Parse an SVG transform attribute into a single matrix. */
export function parseTransform(value) {
  let matrix = IDENTITY;
  if (!value) return matrix;
  const pattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = pattern.exec(value))) {
    const name = match[1];
    const n = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.some((v) => !Number.isFinite(v))) throw new Error(`bad transform "${match[0]}"`);
    const rad = (deg) => (deg * Math.PI) / 180;
    let step;
    if (name === 'matrix' && n.length === 6) {
      step = { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] };
    } else if (name === 'translate') {
      step = { ...IDENTITY, e: n[0] ?? 0, f: n[1] ?? 0 };
    } else if (name === 'scale') {
      step = { ...IDENTITY, a: n[0] ?? 1, d: n[1] ?? n[0] ?? 1 };
    } else if (name === 'rotate') {
      const cos = Math.cos(rad(n[0] ?? 0));
      const sin = Math.sin(rad(n[0] ?? 0));
      const rotation = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      if (n.length >= 3) {
        // rotate(angle cx cy) === translate(cx cy) rotate(angle) translate(-cx -cy)
        step = multiply(
          multiply({ ...IDENTITY, e: n[1], f: n[2] }, rotation),
          { ...IDENTITY, e: -n[1], f: -n[2] },
        );
      } else {
        step = rotation;
      }
    } else if (name === 'skewX') {
      step = { ...IDENTITY, c: Math.tan(rad(n[0] ?? 0)) };
    } else if (name === 'skewY') {
      step = { ...IDENTITY, b: Math.tan(rad(n[0] ?? 0)) };
    } else {
      throw new Error(`unsupported transform "${name}"`);
    }
    matrix = multiply(matrix, step);
  }
  return matrix;
}

// ---- path parsing -----------------------------------------------------------

const ARG_COUNT = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Endpoint-parameterized arc → a run of cubic segments (SVG spec F.6.5).
 *
 * Everything downstream — measuring, transforming, flattening — then deals
 * with four curve types instead of five, and gets correct bounds for free.
 */
function arcToCubics(x1, y1, rxRaw, ryRaw, angleDeg, largeArc, sweep, x2, y2) {
  if (rxRaw === 0 || ryRaw === 0) return [{ command: 'L', values: [x2, y2] }];
  let rx = Math.abs(rxRaw);
  let ry = Math.abs(ryRaw);
  const phi = (angleDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Radii too small to reach: scale them up, as the spec requires.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const grow = Math.sqrt(lambda);
    rx *= grow;
    ry *= grow;
  }

  const sign = largeArc !== sweep ? 1 : -1;
  const numerator =
    rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angleOf = (ux, uy) => Math.atan2(uy, ux);
  const theta1 = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta =
    angleOf((-x1p - cxp) / rx, (-y1p - cyp) / ry) - theta1;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  // A cubic approximates at most a quarter turn well; split accordingly.
  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / pieces;
  const kappa = (4 / 3) * Math.tan(step / 4);

  const point = (theta) => [
    cx + rx * Math.cos(theta) * cosPhi - ry * Math.sin(theta) * sinPhi,
    cy + rx * Math.cos(theta) * sinPhi + ry * Math.sin(theta) * cosPhi,
  ];
  const derivative = (theta) => [
    -rx * Math.sin(theta) * cosPhi - ry * Math.cos(theta) * sinPhi,
    -rx * Math.sin(theta) * sinPhi + ry * Math.cos(theta) * cosPhi,
  ];

  const segments = [];
  for (let i = 0; i < pieces; i += 1) {
    const start = theta1 + i * step;
    const end = start + step;
    const [sx, sy] = point(start);
    const [ex, ey] = point(end);
    const [dsx, dsy] = derivative(start);
    const [dex, dey] = derivative(end);
    segments.push({
      command: 'C',
      values: [
        sx + kappa * dsx,
        sy + kappa * dsy,
        ex - kappa * dex,
        ey - kappa * dey,
        ex,
        ey,
      ],
    });
  }
  return segments;
}

function tokenize(d) {
  const tokens = [];
  const pattern = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let match;
  while ((match = pattern.exec(d))) {
    tokens.push(match[1] ? { command: match[1] } : { number: Number(match[2]) });
  }
  return tokens;
}

/**
 * Parse path data into absolute segments: { command, values }, where H/V/S/T
 * are already expanded into L/C/Q so downstream code handles five shapes only.
 */
export function parsePath(d) {
  const tokens = tokenize(d);
  const segments = [];
  let i = 0;
  let command = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // Reflection points for smooth curves (S/T).
  let lastControl = null;
  let lastQuadControl = null;

  while (i < tokens.length) {
    if (tokens[i].command) {
      command = tokens[i].command;
      i += 1;
      if (command === 'Z' || command === 'z') {
        segments.push({ command: 'Z', values: [] });
        x = startX;
        y = startY;
        lastControl = null;
        lastQuadControl = null;
        continue;
      }
    } else if (command === null) {
      throw new Error('path data starts with a number');
    } else if (command === 'M') {
      command = 'L'; // repeated moveto args are implicit linetos
    } else if (command === 'm') {
      command = 'l';
    }

    const upper = command.toUpperCase();
    const relative = command !== upper;
    const count = ARG_COUNT[upper];
    const values = [];
    for (let n = 0; n < count; n += 1) {
      const token = tokens[i + n];
      if (!token || typeof token.number !== 'number') {
        throw new Error(`"${command}" is missing arguments`);
      }
      values.push(token.number);
    }
    i += count;

    if (upper === 'M' || upper === 'L') {
      const nx = relative ? x + values[0] : values[0];
      const ny = relative ? y + values[1] : values[1];
      segments.push({ command: upper, values: [nx, ny] });
      if (upper === 'M') {
        startX = nx;
        startY = ny;
      }
      x = nx;
      y = ny;
      lastControl = null;
      lastQuadControl = null;
    } else if (upper === 'H') {
      const nx = relative ? x + values[0] : values[0];
      segments.push({ command: 'L', values: [nx, y] });
      x = nx;
      lastControl = null;
      lastQuadControl = null;
    } else if (upper === 'V') {
      const ny = relative ? y + values[0] : values[0];
      segments.push({ command: 'L', values: [x, ny] });
      y = ny;
      lastControl = null;
      lastQuadControl = null;
    } else if (upper === 'C' || upper === 'S') {
      let c1x;
      let c1y;
      let c2x;
      let c2y;
      let nx;
      let ny;
      if (upper === 'C') {
        [c1x, c1y, c2x, c2y, nx, ny] = relative
          ? [x + values[0], y + values[1], x + values[2], y + values[3], x + values[4], y + values[5]]
          : values;
      } else {
        // S: first control is the reflection of the previous second control.
        c1x = lastControl ? 2 * x - lastControl[0] : x;
        c1y = lastControl ? 2 * y - lastControl[1] : y;
        [c2x, c2y, nx, ny] = relative
          ? [x + values[0], y + values[1], x + values[2], y + values[3]]
          : values;
      }
      segments.push({ command: 'C', values: [c1x, c1y, c2x, c2y, nx, ny] });
      lastControl = [c2x, c2y];
      lastQuadControl = null;
      x = nx;
      y = ny;
    } else if (upper === 'Q' || upper === 'T') {
      let cx;
      let cy;
      let nx;
      let ny;
      if (upper === 'Q') {
        [cx, cy, nx, ny] = relative
          ? [x + values[0], y + values[1], x + values[2], y + values[3]]
          : values;
      } else {
        cx = lastQuadControl ? 2 * x - lastQuadControl[0] : x;
        cy = lastQuadControl ? 2 * y - lastQuadControl[1] : y;
        [nx, ny] = relative ? [x + values[0], y + values[1]] : values;
      }
      segments.push({ command: 'Q', values: [cx, cy, nx, ny] });
      lastQuadControl = [cx, cy];
      lastControl = null;
      x = nx;
      y = ny;
    } else if (upper === 'A') {
      const [rx, ry, rotation, largeArc, sweep] = values;
      const nx = relative ? x + values[5] : values[5];
      const ny = relative ? y + values[6] : values[6];
      segments.push(...arcToCubics(x, y, rx, ry, rotation, largeArc, sweep, nx, ny));
      lastControl = null;
      lastQuadControl = null;
      x = nx;
      y = ny;
    }
  }
  return segments;
}

// ---- measuring --------------------------------------------------------------

/**
 * Tight-ish bounding box. Curves are flattened by sampling rather than solved
 * analytically: 32 samples per curve is well under a hundredth of a sheet unit
 * of error at these sizes, and the fit already keeps a visible margin.
 */
export function measure(segments) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const see = (px, py) => {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  };

  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const STEPS = 32;

  for (const { command, values } of segments) {
    if (command === 'M') {
      [x, y] = values;
      startX = x;
      startY = y;
      see(x, y);
    } else if (command === 'L') {
      [x, y] = values;
      see(x, y);
    } else if (command === 'C') {
      const [c1x, c1y, c2x, c2y, nx, ny] = values;
      for (let s = 1; s <= STEPS; s += 1) {
        const t = s / STEPS;
        const u = 1 - t;
        see(
          u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * nx,
          u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ny,
        );
      }
      x = nx;
      y = ny;
    } else if (command === 'Q') {
      const [cx, cy, nx, ny] = values;
      for (let s = 1; s <= STEPS; s += 1) {
        const t = s / STEPS;
        const u = 1 - t;
        see(u * u * x + 2 * u * t * cx + t * t * nx, u * u * y + 2 * u * t * cy + t * t * ny);
      }
      x = nx;
      y = ny;
    } else if (command === 'Z') {
      x = startX;
      y = startY;
    }
  }
  if (!Number.isFinite(minX)) throw new Error('path has no drawable points');
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ---- transforming + serializing --------------------------------------------

/**
 * Apply a matrix to parsed segments. Every command is a run of points by the
 * time it gets here (arcs became cubics at parse time), so this is uniform —
 * including under skew and non-uniform scale, which arcs could not survive.
 */
export function transformSegments(segments, matrix) {
  return segments.map(({ command, values }) => {
    if (command === 'Z') return { command, values: [] };
    const out = [];
    for (let i = 0; i + 1 < values.length; i += 2) {
      const [tx, ty] = apply(matrix, values[i], values[i + 1]);
      out.push(tx, ty);
    }
    return { command, values: out };
  });
}

const round = (value, places) => {
  const factor = 10 ** places;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
};

export function serializePath(segments, places = 2) {
  return segments
    .map(({ command, values }) =>
      command === 'Z' ? 'Z' : `${command}${values.map((v) => round(v, places)).join(' ')}`,
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fit measured ink into a box: one uniform scale (the longest side governs, so
 * nothing is ever stretched), centred horizontally, and anchored to the box's
 * ground line so every cutout stands on the same baseline.
 *
 * The box is the *cutout* area, which since 2026-08-15 is smaller than the
 * sheet — the ring around it is where glued-on arms, legs and hair live.
 */
export function fitMatrix(bounds, box, padding) {
  const usableWidth = box.width - padding.x * 2;
  const usableHeight = box.height - padding.top - padding.bottom;
  const scale = Math.min(usableWidth / bounds.width, usableHeight / bounds.height);
  const drawnWidth = bounds.width * scale;
  const drawnHeight = bounds.height * scale;
  const originX = box.x ?? 0;
  const originY = box.y ?? 0;
  const offsetX = originX + (box.width - drawnWidth) / 2 - bounds.minX * scale;
  const offsetY = originY + box.height - padding.bottom - drawnHeight - bounds.minY * scale;
  return {
    matrix: { a: scale, b: 0, c: 0, d: scale, e: offsetX, f: offsetY },
    scale,
    drawnWidth,
    drawnHeight,
  };
}
