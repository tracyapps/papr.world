import { Buffer } from 'node:buffer';
import { posix } from 'node:path';

/**
 * Folder-driven loose-resource artwork.
 *
 * A file at materials/resources/<form>/<resource-id>.svg is both the default
 * build/display tile and the ink sampled into this form's loose silhouettes.
 * These definitions own shape only. Gameplay family, rarity, recipes, and
 * obtain routes continue to live in the simulation catalogs.
 */
export const RESOURCE_LOOSE_TEMPLATES = {
  wood: {
    orientation: 'flat', width: 512, height: 192,
    paths: [
      'M34 80 C92 57 168 68 239 51 C321 32 405 45 478 72 L468 112 C391 97 320 111 245 126 C166 142 91 129 42 118 Z',
      'M28 98 C85 69 150 81 214 67 C298 49 385 53 483 79 L474 118 C389 101 304 113 221 133 C151 149 80 137 35 123 Z',
      'M40 62 C111 78 171 59 244 67 C325 76 389 55 474 67 L480 108 C397 101 332 124 246 112 C169 101 106 124 33 103 Z',
      'M27 77 C105 45 169 69 238 55 C318 39 401 48 484 85 L462 127 C388 94 312 101 242 119 C163 138 94 123 39 116 Z',
      'M31 109 C105 76 173 89 244 69 C321 47 401 56 481 94 L466 130 C387 105 318 114 247 135 C169 157 91 143 37 129 Z',
      'M43 71 C112 55 178 74 239 60 C318 42 395 52 474 74 L468 116 C392 105 320 118 245 128 C169 139 101 124 35 111 Z',
    ],
  },
  stone: {
    orientation: 'flat', width: 360, height: 300,
    paths: [
      'M52 88 L128 36 L244 47 L316 119 L291 224 L205 269 L91 237 L35 164 Z',
      'M70 55 L191 31 L303 89 L321 181 L249 264 L127 251 L42 177 Z',
      'M39 112 L106 47 L225 34 L318 101 L300 218 L211 274 L82 235 L31 168 Z',
      'M59 74 L164 34 L280 63 L325 151 L273 247 L151 269 L47 201 L32 126 Z',
      'M43 95 L121 39 L251 45 L323 135 L292 238 L178 275 L65 224 L28 151 Z',
      'M68 44 L211 35 L314 112 L306 209 L220 271 L103 252 L35 173 L42 91 Z',
    ],
  },
  fiber: {
    orientation: 'standing', width: 256, height: 440,
    paths: [
      'M106 416 C103 326 100 234 82 145 C74 104 88 62 111 27 C116 112 127 201 131 290 C139 202 156 109 181 42 C188 112 173 207 158 286 C177 222 194 174 218 132 C215 224 183 323 158 418 Z',
      'M78 418 C91 319 96 224 74 117 C70 78 86 45 102 24 C112 123 124 216 128 302 C135 205 154 101 177 35 C186 129 167 236 155 310 C176 252 197 205 218 169 C207 266 181 351 161 420 Z',
      'M94 421 C88 334 91 244 64 158 C55 123 63 87 84 53 C105 135 119 225 126 314 C132 225 139 133 159 45 C180 98 172 185 157 283 C178 218 197 166 218 137 C218 237 187 334 161 421 Z',
      'M80 418 C94 326 101 239 82 140 C75 94 89 54 112 20 C117 116 124 207 128 292 C140 207 157 120 181 58 C185 130 171 223 158 298 C180 246 197 211 217 183 C205 278 183 352 160 420 Z',
      'M101 420 C96 325 98 235 75 129 C69 94 83 52 103 30 C111 119 123 211 128 303 C138 205 155 104 179 34 C187 119 169 217 157 297 C178 228 198 176 220 144 C215 239 184 337 159 420 Z',
      'M86 419 C93 332 99 246 73 154 C64 115 72 74 94 42 C109 127 121 217 128 309 C136 225 151 142 174 61 C186 128 171 224 158 301 C178 248 197 203 216 174 C208 267 183 347 160 420 Z',
    ],
  },
  soil: {
    orientation: 'flat', width: 380, height: 280,
    paths: [
      'M34 184 C55 102 113 54 192 48 C270 42 331 91 346 170 C316 226 258 249 181 247 C104 245 57 226 34 184 Z',
      'M29 170 C55 95 121 50 205 52 C284 54 333 104 350 183 C313 232 252 249 172 244 C96 239 49 217 29 170 Z',
      'M37 190 C45 112 102 59 183 49 C271 38 333 91 345 163 C327 222 264 250 185 248 C105 247 55 229 37 190 Z',
      'M31 178 C52 104 110 54 195 48 C278 43 333 97 348 177 C316 228 255 252 176 245 C99 239 49 218 31 178 Z',
    ],
  },
  board: {
    orientation: 'flat', width: 520, height: 260,
    paths: [
      'M35 73 L475 42 L493 171 L52 216 Z',
      'M28 104 L482 54 L495 177 L48 215 Z',
      'M43 55 L488 84 L478 206 L29 173 Z',
      'M31 82 L474 47 L493 190 L52 218 Z',
    ],
  },
  brick: {
    orientation: 'flat', width: 420, height: 280,
    paths: [
      'M45 69 L365 48 L382 203 L62 229 Z',
      'M37 88 L374 54 L388 198 L55 229 Z',
      'M55 49 L383 82 L369 226 L38 197 Z',
      'M42 65 L367 51 L384 212 L55 227 Z',
    ],
  },
  textile: {
    orientation: 'flat', width: 420, height: 320,
    paths: [
      'M44 72 C121 43 190 67 252 49 C309 33 355 58 381 92 L356 257 C291 238 235 271 169 253 C112 238 71 255 38 231 Z',
      'M38 92 C102 52 171 69 236 51 C307 31 357 66 384 108 L363 263 C302 243 241 274 174 252 C117 234 73 258 39 222 Z',
      'M51 57 C116 76 180 52 244 64 C307 77 351 59 379 81 L364 251 C299 242 243 274 177 252 C115 232 73 248 39 218 Z',
      'M43 75 C105 48 168 68 231 52 C300 34 353 61 384 103 L358 263 C296 238 236 271 170 252 C112 235 73 255 38 225 Z',
    ],
  },
};

export const RESOURCE_TEMPLATE_IDS = Object.freeze(Object.keys(RESOURCE_LOOSE_TEMPLATES));

const DIRECT_RESOURCE_FOLDERS = {
  seeds: { orientation: 'flat' },
};

/** Return the resource tile encoded by a source-relative POSIX path. */
export function parseResourceTilePath(relativeSourcePath) {
  const normalized = relativeSourcePath.replaceAll('\\', '/');
  const match = /^materials\/resources\/([^/]+)\/([^/]+)\.svg$/i.exec(normalized);
  if (!match) return null;

  const looseTemplate = match[1].toLowerCase();
  const resourceId = match[2];
  if (!(looseTemplate in RESOURCE_LOOSE_TEMPLATES)) {
    throw new Error(
      `${normalized}: unknown loose-resource folder "${looseTemplate}". Expected one of ${RESOURCE_TEMPLATE_IDS.join(', ')}.`,
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(resourceId)) {
    throw new Error(`${normalized}: resource filenames must use lowercase letters, digits, and dashes.`);
  }

  return { looseTemplate, resourceId };
}

/** Direct transparent resource art that deliberately has no tiling surface. */
export function parseDirectResourcePath(relativeSourcePath) {
  const normalized = relativeSourcePath.replaceAll('\\', '/');
  const match = /^resources\/([^/]+)\/([^/]+)\.svg$/i.exec(normalized);
  if (!match) return null;

  const folder = match[1].toLowerCase();
  const resourceId = match[2];
  const definition = DIRECT_RESOURCE_FOLDERS[folder];
  if (!definition) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(resourceId)) {
    throw new Error(`${normalized}: resource filenames must use lowercase letters, digits, and dashes.`);
  }
  return { resourceId, looseTemplate: folder.slice(0, -1), orientation: definition.orientation };
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sampleSettings(resourceId, variantIndex, width, height) {
  const hash = hashText(`${resourceId}:${variantIndex}`);
  return {
    offsetX: -Math.round((hash & 255) / 255 * width),
    offsetY: -Math.round(((hash >>> 8) & 255) / 255 * height),
    rotation: (((hash >>> 16) & 31) - 15) * 0.45,
    scale: 0.72 + ((hash >>> 21) & 31) / 100,
  };
}

/** A standalone transparent SVG ready for Chromium rasterization. */
export function createLooseVariantSvg({ sourceSvg, sourceImageDataUrl, resourceId, looseTemplate, variantIndex }) {
  const template = RESOURCE_LOOSE_TEMPLATES[looseTemplate];
  if (!template) throw new Error(`Unknown resource loose template: ${looseTemplate}`);
  const path = template.paths[variantIndex];
  if (!path) throw new Error(`${looseTemplate} has no loose variant ${variantIndex + 1}.`);

  const sourceUrl = sourceImageDataUrl
    ?? `data:image/svg+xml;base64,${Buffer.from(sourceSvg).toString('base64')}`;
  const sample = sampleSettings(resourceId, variantIndex, template.width, template.height);
  const patternSize = Math.max(96, Math.round(180 * sample.scale));

  // Baked thickness: the same silhouette sitting just behind the face, a
  // little larger and much darker, so a piece reads as cut from something
  // with substance rather than printed onto the ground. It is scaled about
  // the centre and only slightly offset, deliberately — a heavily one-sided
  // edge would imply a light direction, and these pieces are spun to random
  // angles in the world, so the implied light would disagree with the scene
  // on most of them. A rim that shows a little on every side survives any
  // rotation.
  const centreX = template.width / 2;
  const centreY = template.height / 2;
  const edgeDrop = Math.max(3, Math.round(template.height * 0.022));
  const edgeTransform = `translate(${centreX} ${centreY + edgeDrop}) scale(1.035) translate(${-centreX} ${-centreY})`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${template.width}" height="${template.height}" viewBox="0 0 ${template.width} ${template.height}">
  <defs>
    <pattern id="tile" patternUnits="userSpaceOnUse" width="${patternSize}" height="${patternSize}" patternTransform="translate(${sample.offsetX} ${sample.offsetY}) rotate(${sample.rotation.toFixed(2)})">
      <image href="${sourceUrl}" width="${patternSize}" height="${patternSize}" preserveAspectRatio="none"/>
    </pattern>
    <filter id="paper-edge" x="-12%" y="-16%" width="124%" height="132%">
      <feDropShadow dx="3" dy="5" stdDeviation="3" flood-color="#241b16" flood-opacity="0.28"/>
    </filter>
    <linearGradient id="face-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="0.52" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#2a1f19" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <g filter="url(#paper-edge)">
    <path d="${path}" fill="#2f241d" fill-opacity="0.88" transform="${edgeTransform}"/>
    <path d="${path}" fill="url(#tile)" stroke="#392c24" stroke-opacity="0.34" stroke-width="4" stroke-linejoin="round"/>
    <path d="${path}" fill="url(#face-shade)"/>
  </g>
</svg>`;
}

export function looseVariantCount(looseTemplate) {
  const template = RESOURCE_LOOSE_TEMPLATES[looseTemplate];
  if (!template) throw new Error(`Unknown resource loose template: ${looseTemplate}`);
  return template.paths.length;
}

export function looseTemplateDimensions(looseTemplate) {
  const template = RESOURCE_LOOSE_TEMPLATES[looseTemplate];
  if (!template) throw new Error(`Unknown resource loose template: ${looseTemplate}`);
  return { width: template.width, height: template.height };
}

export function looseVariantRuntimePath(resourceId, variantIndex) {
  return posix.join('assets/runtime/resources', resourceId, `loose-${String(variantIndex + 1).padStart(2, '0')}.png`);
}

export function generatedResourceArtModule(resourceRecords) {
  const records = Object.fromEntries(resourceRecords.map((record) => [record.resourceId, {
    surfaceUrl: record.surface ? `/${record.surface}` : null,
    colorways: record.surfaceColorways.map((entry) => ({ id: entry.id, label: entry.label, sourceUrl: `/${entry.runtime}` })),
    looseTemplate: record.looseTemplate,
    orientation: record.orientation ?? RESOURCE_LOOSE_TEMPLATES[record.looseTemplate]?.orientation ?? 'flat',
    variants: record.loose.map((entry) => ({
      sourceUrl: `/${entry.runtime}`,
      aspectRatio: entry.aspectRatio,
    })),
  }]));

  return `// Generated by tools/compile-assets.mjs. Do not edit by hand.\n\nexport const GENERATED_RESOURCE_ART = ${JSON.stringify(records, null, 2)} as const;\n`;
}
