import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(root, 'assets/source/textures');
const runtimeDir = resolve(root, 'assets/runtime/textures');
const metadataPath = resolve(root, 'assets/runtime/sample-assets.json');

mkdirSync(sourceDir, { recursive: true });
mkdirSync(runtimeDir, { recursive: true });
mkdirSync(dirname(metadataPath), { recursive: true });

function findImageMagickCommand() {
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
    return 'magick';
  } catch {
    return 'convert';
  }
}

const imageMagickCommand = findImageMagickCommand();

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function jitterColor(hex, amount, rng) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const shifted = channels.map((channel) => {
    const delta = Math.round((rng() - 0.5) * amount);
    return Math.max(0, Math.min(255, channel + delta));
  });
  return `#${shifted.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function paperSvg({
  id,
  width,
  height,
  base,
  fiber,
  line,
  seed,
  lined = false,
  torn = false,
  scraps = false,
  avatar = false,
}) {
  const rng = createRng(seed);
  const defs = [
    `<filter id="softNoise" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="3" seed="${seed}" result="noise"/>
      <feColorMatrix type="saturate" values="0.18"/>
      <feBlend in="SourceGraphic" in2="noise" mode="multiply"/>
    </filter>`,
  ];

  const shapes = [
    `<rect width="${width}" height="${height}" fill="${base}" filter="url(#softNoise)"/>`,
  ];

  if (lined) {
    for (let y = 42; y < height; y += 42) {
      shapes.push(`<path d="M0 ${y + (rng() - 0.5) * 1.2} H${width}" stroke="${line}" stroke-width="2" opacity="0.62"/>`);
    }
    shapes.push(`<path d="M82 0 V${height}" stroke="#df7770" stroke-width="3" opacity="0.55"/>`);
  }

  for (let i = 0; i < 170; i += 1) {
    const x = Math.round(rng() * width);
    const y = Math.round(rng() * height);
    const length = 8 + rng() * 34;
    const angle = rng() * Math.PI;
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    shapes.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${fiber}" stroke-width="${(0.4 + rng() * 1.2).toFixed(2)}" opacity="${(0.10 + rng() * 0.18).toFixed(2)}"/>`);
  }

  for (let i = 0; i < 50; i += 1) {
    const x = Math.round(rng() * width);
    const y = Math.round(rng() * height);
    const radius = 0.7 + rng() * 2.2;
    shapes.push(`<circle cx="${x}" cy="${y}" r="${radius.toFixed(1)}" fill="${jitterColor(base, 32, rng)}" opacity="${(0.08 + rng() * 0.13).toFixed(2)}"/>`);
  }

  if (torn) {
    const points = [];
    const steps = 30;
    for (let i = 0; i <= steps; i += 1) {
      points.push(`${(i / steps * width).toFixed(1)},${(12 + rng() * 28).toFixed(1)}`);
    }
    for (let i = 0; i <= steps; i += 1) {
      points.push(`${(width - i / steps * width).toFixed(1)},${(height - 16 - rng() * 30).toFixed(1)}`);
    }
    shapes.push(`<path d="M${points.join(' L')} Z" fill="none" stroke="#7c6c55" stroke-width="5" opacity="0.32"/>`);
    shapes.push(`<path d="M20 20 H${width - 20} V${height - 20} H20 Z" fill="none" stroke="#fff7df" stroke-width="14" opacity="0.18"/>`);
  }

  if (scraps) {
    for (let i = 0; i < 20; i += 1) {
      const x = 70 + rng() * (width - 140);
      const y = 80 + rng() * (height - 160);
      const w = 58 + rng() * 160;
      const h = 38 + rng() * 120;
      const rotate = (rng() - 0.5) * 70;
      const color = jitterColor(base, 44, rng);
      shapes.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}" stroke="#6d4b2f" stroke-width="2" opacity="0.92" transform="rotate(${rotate.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
    }
  }

  if (avatar) {
    shapes.length = 0;
    shapes.push(`<path d="M169 98 C204 55 268 58 302 104 C332 146 315 228 286 278 C318 315 306 405 250 422 C191 440 137 399 151 329 C107 284 122 155 169 98 Z" fill="#f6edcb" stroke="#6f553b" stroke-width="10"/>`);
    shapes.push(`<path d="M188 155 Q214 135 238 157" fill="none" stroke="#31251d" stroke-width="8" stroke-linecap="round"/>`);
    shapes.push(`<circle cx="202" cy="204" r="11" fill="#2f251d"/>`);
    shapes.push(`<circle cx="263" cy="204" r="11" fill="#2f251d"/>`);
    shapes.push(`<path d="M202 258 Q237 291 276 256" fill="none" stroke="#2f251d" stroke-width="8" stroke-linecap="round"/>`);
    shapes.push(`<path d="M152 288 L83 319" stroke="#6f553b" stroke-width="14" stroke-linecap="round"/>`);
    shapes.push(`<path d="M290 284 L359 309" stroke="#6f553b" stroke-width="14" stroke-linecap="round"/>`);
    shapes.push(`<path d="M189 417 L174 487" stroke="#6f553b" stroke-width="14" stroke-linecap="round"/>`);
    shapes.push(`<path d="M258 417 L281 487" stroke="#6f553b" stroke-width="14" stroke-linecap="round"/>`);
    shapes.push(`<path d="M176 114 L282 400" stroke="#fff7df" stroke-width="5" opacity="0.34"/>`);
    shapes.push(`<path d="M147 328 C191 341 249 340 298 320" fill="none" stroke="#d9c18f" stroke-width="6" opacity="0.7"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>${defs.join('\n')}</defs>
    ${shapes.join('\n')}
  </svg>`;
}

const assets = [
  {
    key: 'paper.construction.brown.01',
    file: 'paper_construction_brown_01',
    width: 512,
    height: 512,
    base: '#a96d3e',
    fiber: '#6f4228',
    line: '#815036',
    seed: 101,
    notes: 'Reusable 512px tile. Fibers should remain visible but not noisy at gameplay distance.',
  },
  {
    key: 'paper.construction.green.01',
    file: 'paper_construction_green_01',
    width: 512,
    height: 512,
    base: '#5f9355',
    fiber: '#2f5b38',
    line: '#3f7044',
    seed: 202,
    notes: 'Reusable 512px tile for foliage and simple walls. Avoid perfect flat color.',
  },
  {
    key: 'paper.notebook.blue-lined.01',
    file: 'paper_notebook_blue_lined_01',
    width: 512,
    height: 512,
    base: '#f4f1df',
    fiber: '#b9b29e',
    line: '#6c9fc4',
    seed: 303,
    lined: true,
    notes: 'Reusable 512px tile. Line spacing is exaggerated so it reads from the camera.',
  },
  {
    key: 'terrain.clearing.sheet.01',
    file: 'terrain_clearing_sheet_01',
    width: 1024,
    height: 1024,
    base: '#d9c997',
    fiber: '#88754d',
    line: '#ad9b6a',
    seed: 404,
    torn: true,
    notes: 'Larger 1024px ground sheet. Uses edge detail and broad stains for scale.',
  },
  {
    key: 'resource.brown-paper-patch.01',
    file: 'resource_brown_paper_patch_01',
    width: 512,
    height: 512,
    base: '#a96d3e',
    fiber: '#6f4228',
    line: '#815036',
    seed: 505,
    scraps: true,
    notes: 'Inspectable source texture for harvestable layered scraps.',
  },
  {
    key: 'avatar.placeholder.flat.01',
    file: 'avatar_placeholder_flat_01',
    width: 512,
    height: 512,
    base: '#f6edcb',
    fiber: '#9a865f',
    line: '#815036',
    seed: 606,
    avatar: true,
    notes: 'Transparent runtime PNG made from chroma-keyed source. Used before drawing exists.',
  },
];

const metadata = [];

for (const asset of assets) {
  const svg = paperSvg(asset);
  const svgPath = resolve(sourceDir, `${asset.file}.svg`);
  const pngPath = resolve(runtimeDir, `${asset.file}.png`);
  writeFileSync(svgPath, svg);

  execFileSync(imageMagickCommand, [
    '-background',
    'none',
    svgPath,
    pngPath,
  ]);

  metadata.push({
    key: asset.key,
    source: `assets/source/textures/${asset.file}.svg`,
    runtime: `assets/runtime/textures/${asset.file}.png`,
    size: `${asset.width}x${asset.height}`,
    notes: asset.notes,
  });
}

writeFileSync(metadataPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), assets: metadata }, null, 2)}\n`);

console.log(`Generated ${assets.length} sample assets.`);
