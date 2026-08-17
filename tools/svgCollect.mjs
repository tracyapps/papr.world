// Read an SVG file's drawable geometry as absolute path segments.
//
// Shared by the shape compiler and the headless preview so both see exactly
// the same geometry — a shape that previews correctly cannot compile to
// something else.
//
// <path> is the native form; <rect>, <circle>, <ellipse>, <polygon> and
// <polyline> are converted so artwork can be exported straight from a drawing
// tool. <line> is skipped (no area to fill in a solid cutout); <text> and
// <image> are refused. transform= on the element or any ancestor <g> applies.

import { IDENTITY, multiply, parsePath, parseTransform, transformSegments } from './svgPathFit.mjs';

const number = (raw, fallback = 0) => {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
};

function attributesOf(tag) {
  const found = {};
  for (const match of tag.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) found[match[1]] = match[2];
  return found;
}

/** Primitive → path data, so the rest of the pipeline only knows about paths. */
function primitiveToPath(name, attrs, note) {
  if (name === 'rect') {
    const x = number(attrs.x);
    const y = number(attrs.y);
    const w = number(attrs.width);
    const h = number(attrs.height);
    if (w <= 0 || h <= 0) return null;
    // Rounded corners would need arcs; nothing in the library uses them, and
    // silently squaring them off would be a lie, so say so.
    if (attrs.rx || attrs.ry) {
      note.warn(`<rect> corner radius ignored — convert it to a <path> to keep it`);
    }
    return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
  }
  if (name === 'circle' || name === 'ellipse') {
    const cx = number(attrs.cx);
    const cy = number(attrs.cy);
    const rx = name === 'circle' ? number(attrs.r) : number(attrs.rx);
    const ry = name === 'circle' ? number(attrs.r) : number(attrs.ry);
    if (rx <= 0 || ry <= 0) return null;
    // Two half-arcs: the classic circle-as-path, valid under any transform.
    return (
      `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} ` +
      `A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
    );
  }
  if (name === 'polygon' || name === 'polyline') {
    const points = (attrs.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
    if (points.length < 6 || points.some((v) => !Number.isFinite(v))) return null;
    let d = `M${points[0]} ${points[1]}`;
    for (let i = 2; i + 1 < points.length; i += 2) d += ` L${points[i]} ${points[i + 1]}`;
    return name === 'polygon' ? `${d} Z` : d;
  }
  return null;
}

/**
 * @param svg raw file contents
 * @param handlers optional { error(message), warn(message) }; both default to
 *   throwing/ignoring so the preview tool can stay terse and the compiler can
 *   collect every problem in one pass.
 */
/**
 * Which recolourable role a drawn element belongs to.
 *
 * Explicit wins: data-role="ink" or class="ink". Otherwise it is inferred from
 * the fill's lightness, so a plain black-and-white export from any drawing
 * tool lands in the right roles without markup: dark ink, light paper, and the
 * middle third shadow.
 */
function roleOf(attrs, note) {
  const explicit = (attrs['data-role'] ?? '').trim().toLowerCase();
  if (explicit) return explicit;
  const fromClass = (attrs.class ?? '')
    .split(/\s+/)
    .map((name) => name.toLowerCase())
    .find((name) => name === 'ink' || name === 'paper' || name === 'shadow');
  if (fromClass) return fromClass;

  const fill = (attrs.fill ?? '').trim().toLowerCase();
  if (fill === 'none') return 'ink';
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(fill)
    ? fill.length === 4
      ? `#${fill[1]}${fill[1]}${fill[2]}${fill[2]}${fill[3]}${fill[3]}`
      : fill
    : null;
  if (fill === 'white') return 'paper';
  if (!hex) {
    if (fill) note.warn(`fill "${fill}" is not a hex colour — treating it as ink`);
    return 'ink';
  }
  const value = Number.parseInt(hex.slice(1), 16);
  const lightness =
    (0.299 * ((value >> 16) & 0xff) + 0.587 * ((value >> 8) & 0xff) + 0.114 * (value & 0xff)) / 255;
  if (lightness < 0.34) return 'ink';
  if (lightness > 0.72) return 'paper';
  return 'shadow';
}

/**
 * Like `collect`, but keeps each element separate and tagged with its role —
 * what stamps need, since a stamp is several parts that recolour differently.
 * Returns `[{ role, segments }]` in document (paint) order.
 */
export function collectParts(svg, handlers = {}) {
  return collect(svg, handlers, { split: true });
}

export function collect(svg, handlers = {}, options = {}) {
  const note = {
    error: handlers.error ?? ((message) => {
      throw new Error(message);
    }),
    warn: handlers.warn ?? (() => {}),
  };

  const segments = [];
  /** Role-tagged parts, only built when the caller asked for the split form. */
  const parts = [];
  const stack = [IDENTITY];
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g;
  let match;

  while ((match = tagPattern.exec(svg))) {
    const [, closing, name, rawAttrs, selfClosing] = match;
    const current = stack[stack.length - 1];

    if (closing) {
      if ((name === 'g' || name === 'svg') && stack.length > 1) stack.pop();
      continue;
    }
    if (name === 'style' || name === 'defs' || name === 'title' || name === 'desc') continue;

    const attrs = attributesOf(`<${name}${rawAttrs}>`);
    let local = IDENTITY;
    try {
      local = parseTransform(attrs.transform);
    } catch (error) {
      note.error(error.message);
    }
    const matrix = multiply(current, local);

    if (name === 'g' || name === 'svg') {
      if (!selfClosing) stack.push(matrix);
      continue;
    }
    if (name === 'line') {
      note.warn(`<line> skipped — a filled cutout can't show a zero-width line`);
      continue;
    }
    if (name === 'text' || name === 'image') {
      note.error(`contains <${name}> — a silhouette must be geometry, not ${name}`);
      continue;
    }

    const d = name === 'path' ? (attrs.d ?? '').trim() : primitiveToPath(name, attrs, note);
    if (!d) continue;

    try {
      const placed = transformSegments(parsePath(d), matrix);
      segments.push(...placed);
      if (options.split) {
        const role = roleOf(attrs, note);
        const previous = parts[parts.length - 1];
        // Consecutive same-role elements merge: an eye pair drawn as two
        // circles is one part, not two, so the renderer emits one <path>.
        if (previous && previous.role === role) previous.segments.push(...placed);
        else parts.push({ role, segments: placed });
      }
    } catch (error) {
      note.error(`<${name}> — ${error.message}`);
    }
  }

  return options.split ? parts : segments;
}
