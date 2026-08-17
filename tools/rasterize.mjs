// A tiny software rasterizer, so shapes and stamps can be eyeballed with no
// browser and no dependencies — over ssh, from a terminal, or by an agent
// with no display. Shared by both preview tools.
//
// Deliberately crude: flatten curves to polygons, scanline fill with the
// even-odd rule (which gives holes — the reel wells in the cassette, the gap
// in a doughnut — for free), supersample for edges. It is a proofreading
// tool, not a renderer; the browser is still the source of truth.

import { deflateSync } from 'node:zlib';

/** Path segments → closed polygons, curves flattened by sampling. */
export function flatten(segments, steps = 16) {
  const polygons = [];
  let current = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const push = (px, py) => current.push([px, py]);
  const close = () => {
    if (current.length > 2) polygons.push(current);
    current = [];
  };

  for (const { command, values } of segments) {
    if (command === 'M') {
      close();
      [x, y] = values;
      startX = x;
      startY = y;
      push(x, y);
    } else if (command === 'L') {
      [x, y] = values;
      push(x, y);
    } else if (command === 'C') {
      const [c1x, c1y, c2x, c2y, nx, ny] = values;
      for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        const u = 1 - t;
        push(
          u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * nx,
          u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ny,
        );
      }
      x = nx;
      y = ny;
    } else if (command === 'Q') {
      const [cx, cy, nx, ny] = values;
      for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        const u = 1 - t;
        push(u * u * x + 2 * u * t * cx + t * t * nx, u * u * y + 2 * u * t * cy + t * t * ny);
      }
      x = nx;
      y = ny;
    } else if (command === 'Z') {
      close();
      x = startX;
      y = startY;
      push(x, y);
    }
  }
  close();
  return polygons;
}

/** A plain RGB image buffer with a flat background. */
export function createImage(width, height, background) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = background[0];
    pixels[i + 1] = background[1];
    pixels[i + 2] = background[2];
  }
  return { pixels, width, height };
}

/** Even-odd scanline fill of `polygons` into `image` at a scale and offset. */
export function fillPolygons(image, polygons, originX, originY, scale, color) {
  const { pixels, width, height } = image;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const [, py] of polygon) {
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  if (!Number.isFinite(minY)) return;

  const top = Math.max(0, Math.floor(minY * scale + originY));
  const bottom = Math.min(Math.ceil(maxY * scale + originY), height - 1);

  for (let py = top; py <= bottom; py += 1) {
    const sampleY = (py + 0.5 - originY) / scale;
    const crossings = [];
    for (const polygon of polygons) {
      for (let i = 0; i < polygon.length; i += 1) {
        const [ax, ay] = polygon[i];
        const [bx, by] = polygon[(i + 1) % polygon.length];
        if (ay === by) continue;
        if (sampleY >= Math.min(ay, by) && sampleY < Math.max(ay, by)) {
          crossings.push(ax + ((sampleY - ay) / (by - ay)) * (bx - ax));
        }
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const left = Math.max(0, Math.round(crossings[i] * scale + originX));
      const right = Math.min(width - 1, Math.round(crossings[i + 1] * scale + originX));
      for (let px = left; px <= right; px += 1) {
        const index = (py * width + px) * 3;
        pixels[index] = color[0];
        pixels[index + 1] = color[1];
        pixels[index + 2] = color[2];
      }
    }
  }
}

// ---- minimal PNG writer ------------------------------------------------------

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(image) {
  const { pixels, width, height } = image;
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0; // filter: none
    pixels.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
