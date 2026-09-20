// Drawing the treasure map onto a canvas. Kept free of the game (no
// renderer, no avatar) so it can be rendered on its own — for previews,
// tests, or a future printable map.

import type { Biome } from '../sim/catalogs/biomes';
import {
  BIOME_MAP_NAMES,
  bearingBetween,
  compassArrow,
  distanceWords,
} from '../world/biomeCompass';
import { PAGE_SIZE } from '../world/types';
import { EXPLORED_THRESHOLD, type TreasureMapModel } from './treasureMapModel';

// ---- Palette: watercolour washes, sepia ink ---------------------------------

// Chosen to be told apart at a glance — two greens that differ in value as
// well as hue, a warm sand, a cool slate — and never relied on alone: every
// land is also named on the map and in the list beside it.
export const WASH: Record<Biome, string> = {
  clearing: '#e8d6a0',
  forest: '#3f6e3f',
  meadow: '#b8d27a',
  dunes: '#e8b35e',
  scrapflats: '#8f93a3',
  tropical: '#1f8a78',
  swamp: '#485d43',
  wetland: '#6e8e72',
  'rocky-highlands': '#7c7d7a',
  savanna: '#c3a957',
  badlands: '#b56c4b',
  'bamboo-forest': '#4d7d45',
};
const PARCHMENT = '#efe0b9';
const INK = '#3b2a1a';
const RED_INK = '#b3261e';
const HANDWRITING = '"Bradley Hand", "Segoe Print", "Marker Felt", "Comic Sans MS", cursive';

const HERE_BE: Partial<Record<Biome, string>> = {
  tropical: 'here be monkeys',
  dunes: 'here be sand, lots',
  scrapflats: 'here be scraps',
  forest: 'here be tall trees',
  meadow: 'here be tall grass',
  swamp: 'here be frogs',
  wetland: 'here be reeds',
  'rocky-highlands': 'here be high places',
  savanna: 'here be wide skies',
  badlands: 'here be red stone',
  'bamboo-forest': 'here be bamboo',
};

// ---- A tiny seeded random, so the wobble is the same every time you look ---

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Drawing -----------------------------------------------------------------

type Rect = { x: number; y: number; w: number; h: number };

export function drawTreasureMap(
  ctx: CanvasRenderingContext2D,
  size: number,
  model: TreasureMapModel,
  headingDegrees: number,
): void {
  const random = seededRandom((model.originPx * 73856093) ^ (model.originPz * 19349663));
  const margin = Math.round(size * 0.05);
  const pages = model.radiusPages * 2 + 1;
  const cell = (size - margin * 2) / pages;
  const firstPx = model.originPx - model.radiusPages;
  const firstPz = model.originPz - model.radiusPages;
  const toX = (worldX: number) => margin + (worldX / PAGE_SIZE - firstPx + 0.5) * cell;
  const toY = (worldZ: number) => margin + (worldZ / PAGE_SIZE - firstPz + 0.5) * cell;
  const inner: Rect = { x: margin, y: margin, w: size - margin * 2, h: size - margin * 2 };
  const inView = (x: number, y: number, pad = 0) =>
    x >= inner.x + pad && x <= inner.x + inner.w - pad && y >= inner.y + pad && y <= inner.y + inner.h - pad;

  // Parchment, with a darker, toasted edge and a few flecks.
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = PARCHMENT;
  ctx.fillRect(0, 0, size, size);
  const toast = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.75);
  toast.addColorStop(0, 'rgb(255 250 230 / 0)');
  toast.addColorStop(1, 'rgb(120 80 30 / 0.35)');
  ctx.fillStyle = toast;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i += 1) {
    ctx.fillStyle = `rgb(90 60 20 / ${0.04 + random() * 0.08})`;
    ctx.fillRect(random() * size, random() * size, 1 + random() * 1.5, 1 + random() * 1.5);
  }

  // Watercolour washes: one pixel per page, stretched smooth, so land
  // shapes bleed softly into each other like paint on damp paper.
  const wash = document.createElement('canvas');
  wash.width = pages;
  wash.height = pages;
  const washCtx = wash.getContext('2d');
  if (washCtx) {
    // Unwalked pages are painted as the model's smoothed hearsay (`shown`).
    model.cells.forEach((c) => {
      const walked = c.explored >= EXPLORED_THRESHOLD;
      washCtx.globalAlpha = walked ? 0.9 : 0.55;
      washCtx.fillStyle = WASH[c.shown];
      washCtx.fillRect(c.px - firstPx, c.pz - firstPz, 1, 1);
    });
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Softer the further out you look: far away is hearsay.
    const softness = model.radiusPages > 15 ? 1.4 : 0.45;
    if ('filter' in ctx) ctx.filter = `blur(${Math.max(1, cell * softness)}px)`;
    ctx.drawImage(wash, inner.x, inner.y, inner.w, inner.h);
    ctx.restore();
  }

  // Where you have been: pencil hatching, and a wobbly inked shoreline
  // around the edge of what you know.
  const explored = new Set(
    model.cells.filter((c) => c.explored >= EXPLORED_THRESHOLD).map((c) => `${c.px},${c.pz}`),
  );
  if (explored.size > 0) {
    ctx.save();
    ctx.beginPath();
    for (const key of explored) {
      const [px, pz] = key.split(',').map(Number) as [number, number];
      ctx.rect(margin + (px - firstPx) * cell, margin + (pz - firstPz) * cell, cell + 0.5, cell + 0.5);
    }
    ctx.clip();
    ctx.strokeStyle = 'rgb(59 42 26 / 0.22)';
    ctx.lineWidth = 1;
    const step = Math.max(4, cell / 5);
    ctx.beginPath();
    for (let d = -size; d < size * 2; d += step) {
      ctx.moveTo(d, 0);
      ctx.lineTo(d - size, size);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, cell * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const wobble = () => (random() - 0.5) * Math.min(3, cell * 0.12);
    const edge = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.moveTo(x1 + wobble(), y1 + wobble());
      ctx.quadraticCurveTo((x1 + x2) / 2 + wobble() * 2, (y1 + y2) / 2 + wobble() * 2, x2 + wobble(), y2 + wobble());
    };
    for (const key of explored) {
      const [px, pz] = key.split(',').map(Number) as [number, number];
      const left = margin + (px - firstPx) * cell;
      const top = margin + (pz - firstPz) * cell;
      if (!explored.has(`${px},${pz - 1}`)) edge(left, top, left + cell, top);
      if (!explored.has(`${px},${pz + 1}`)) edge(left, top + cell, left + cell, top + cell);
      if (!explored.has(`${px - 1},${pz}`)) edge(left, top, left, top + cell);
      if (!explored.has(`${px + 1},${pz}`)) edge(left + cell, top, left + cell, top + cell);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Labels never overlap one another; later ones politely step aside.
  const placed: Rect[] = [];
  const collides = (r: Rect) => placed.some((p) =>
    r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
  const write = (
    text: string,
    x: number,
    y: number,
    options: { size: number; color?: string; italic?: boolean; align?: CanvasTextAlign; force?: boolean },
  ): boolean => {
    ctx.font = `${options.italic ? 'italic ' : ''}600 ${options.size}px ${HANDWRITING}`;
    ctx.textAlign = options.align ?? 'center';
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(text).width;
    const left = options.align === 'left' ? x : options.align === 'right' ? x - width : x - width / 2;
    const rect = { x: left - 3, y: y - options.size / 2 - 2, w: width + 6, h: options.size + 4 };
    if (!options.force && (collides(rect) || !inView(rect.x, rect.y) || !inView(rect.x + rect.w, rect.y + rect.h))) {
      return false;
    }
    placed.push(rect);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgb(239 224 185 / 0.9)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = options.color ?? INK;
    ctx.fillText(text, x, y);
    return true;
  };

  const labelSize = Math.round(Math.max(12, Math.min(17, size / 38)));

  /** A place's name: below it if there is room, else above, right, left. */
  const writeNear = (text: string, x: number, y: number, fontSize: number) => {
    const gap = fontSize + 2;
    if (write(text, x, y + gap, { size: fontSize })) return;
    if (write(text, x, y - gap, { size: fontSize })) return;
    if (write(text, x + 10, y, { size: fontSize, align: 'left' })) return;
    if (write(text, x - 10, y, { size: fontSize, align: 'right' })) return;
    if (write(text, x + 8, y - gap, { size: fontSize, align: 'left' })) return;
    write(text, x - 8, y + gap, { size: fontSize, align: 'right' });
  };

  // You, first — nothing may cover the "you are here".
  const youX = toX(model.centerX);
  const youY = toY(model.centerZ);
  ctx.save();
  ctx.translate(youX, youY);
  ctx.rotate((headingDegrees * Math.PI) / 180);
  ctx.fillStyle = '#fff8e2';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(7, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  placed.push({ x: youX - 10, y: youY - 11, w: 20, h: 22 });
  write('you', youX, youY + 18, { size: labelSize - 1, italic: true });

  // Places: home is the red X, of course.
  const edgePoint = (x: number, y: number, pad: number) => {
    // Where the line from you to (x, y) leaves the map, pulled in by `pad`.
    const dx = x - youX;
    const dy = y - youY;
    const tx = dx === 0 ? Infinity : ((dx > 0 ? inner.x + inner.w - pad : inner.x + pad) - youX) / dx;
    const ty = dy === 0 ? Infinity : ((dy > 0 ? inner.y + inner.h - pad : inner.y + pad) - youY) / dy;
    const t = Math.min(tx, ty);
    return { x: youX + dx * t, y: youY + dy * t };
  };
  for (const place of model.places) {
    const x = toX(place.x);
    const y = toY(place.z);
    if (!inView(x, y, 6)) {
      if (place.kind !== 'home') continue;
      const edge = edgePoint(x, y, 18);
      const arrow = compassArrow(bearingBetween(model.centerX, model.centerZ, place.x, place.z));
      write(`${arrow} home`, edge.x, edge.y, { size: labelSize, color: RED_INK, force: true });
      continue;
    }
    ctx.save();
    ctx.lineCap = 'round';
    if (place.kind === 'home') {
      ctx.strokeStyle = RED_INK;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8);
      ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8);
      ctx.lineTo(x - 8, y + 8);
      ctx.stroke();
      placed.push({ x: x - 10, y: y - 10, w: 20, h: 20 });
      ctx.restore();
      write('home', x, y + 18, { size: labelSize + 1, color: RED_INK, force: true });
      continue;
    }
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#fff8e2';
    ctx.lineWidth = 1.6;
    if (place.kind === 'mill' || place.kind === 'shop') {
      // A tiny house: square and a roof.
      ctx.beginPath();
      ctx.rect(x - 5, y - 2, 10, 8);
      ctx.moveTo(x - 7, y - 1);
      ctx.lineTo(x, y - 8);
      ctx.lineTo(x + 7, y - 1);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    placed.push({ x: x - 8, y: y - 9, w: 16, h: 16 });
    writeNear(place.name, x, y, labelSize - 2);
  }

  // Regions you have walked, biggest first, in plain ink.
  for (const region of model.regions.slice(0, 14)) {
    write(region.text, toX(region.x), toY(region.z), { size: labelSize });
  }

  // Rumours: the biggest stretch of each land you have not really walked
  // gets a guess with a question mark (two per land when looking far and
  // wide) — the biggest also gets a "here be". Enough to orient; few enough
  // to read.
  const flourished = new Set<Biome>();
  const shown = new Set<Biome>();
  const perLand = new Map<Biome, number>();
  const maxPerLand = model.radiusPages > 15 ? 2 : 1;
  for (const land of model.lands) {
    shown.add(land.biome);
    if (land.explored >= 0.5) continue;
    if ((perLand.get(land.biome) ?? 0) >= maxPerLand) continue;
    perLand.set(land.biome, (perLand.get(land.biome) ?? 0) + 1);
    const x = toX(land.x);
    const y = toY(land.z);
    const big = land.pages >= (model.radiusPages > 15 ? 30 : 10);
    if (!write(`${BIOME_MAP_NAMES[land.biome]}?`, x, y, { size: big ? labelSize + 2 : labelSize, italic: true })) {
      continue;
    }
    const flourish = HERE_BE[land.biome];
    if (flourish && big && !flourished.has(land.biome)) {
      if (write(flourish, x, y + labelSize + 2, { size: labelSize - 3, italic: true })) flourished.add(land.biome);
    }
  }
  // Lands with no stretch on this sheet: an arrow at the edge pointing on.
  for (const hint of model.rumours) {
    if (shown.has(hint.biome)) continue;
    const x = toX(hint.x);
    const y = toY(hint.z);
    const edge = inView(x, y, 30) ? { x, y } : edgePoint(x, y, 34);
    write(`${compassArrow(hint.bearing)} ${BIOME_MAP_NAMES[hint.biome]}, ${distanceWords(hint.distance)}`, edge.x, edge.y, {
      size: labelSize - 1,
      italic: true,
    });
  }

  // Scale bar: about a minute's walk.
  const minute = (186 / PAGE_SIZE) * cell;
  const barX = inner.x + 14;
  const barY = inner.y + inner.h - 16;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + minute, barY);
  ctx.moveTo(barX, barY - 4);
  ctx.lineTo(barX, barY + 4);
  ctx.moveTo(barX + minute, barY - 4);
  ctx.lineTo(barX + minute, barY + 4);
  ctx.stroke();
  ctx.restore();
  write("a minute's walk", barX, barY - 11, { size: labelSize - 3, align: 'left', force: true });

  // Compass rose, bottom right.
  const roseR = Math.max(18, size * 0.045);
  const roseX = inner.x + inner.w - roseR - 12;
  const roseY = inner.y + inner.h - roseR - 14;
  ctx.save();
  ctx.translate(roseX, roseY);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, roseR * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const long = i % 2 === 0;
    const reach = long ? roseR : roseR * 0.55;
    ctx.save();
    ctx.rotate((i * Math.PI) / 4);
    ctx.beginPath();
    ctx.moveTo(0, -reach);
    ctx.lineTo(reach * 0.14, 0);
    ctx.lineTo(0, reach * 0.1);
    ctx.lineTo(-reach * 0.14, 0);
    ctx.closePath();
    if (i === 0) ctx.fillStyle = RED_INK;
    else ctx.fillStyle = long ? INK : 'rgb(59 42 26 / 0.5)';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  placed.push({ x: roseX - roseR, y: roseY - roseR, w: roseR * 2, h: roseR * 2 });
  write('N', roseX, roseY - roseR - 9, { size: labelSize - 1, force: true });

  // A hand-ruled double border.
  ctx.save();
  ctx.strokeStyle = INK;
  const wobbleLine = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.moveTo(x1, y1);
    const steps = 6;
    for (let s = 1; s <= steps; s += 1) {
      ctx.lineTo(
        x1 + ((x2 - x1) * s) / steps + (random() - 0.5) * 1.6,
        y1 + ((y2 - y1) * s) / steps + (random() - 0.5) * 1.6,
      );
    }
  };
  for (const [inset, width] of [[margin * 0.55, 2], [margin * 0.8, 1]] as const) {
    ctx.lineWidth = width;
    ctx.beginPath();
    const a = inset;
    const b = size - inset;
    wobbleLine(a, a, b, a);
    wobbleLine(b, a, b, b);
    wobbleLine(b, b, a, b);
    wobbleLine(a, b, a, a);
    ctx.stroke();
  }
  ctx.restore();
}
