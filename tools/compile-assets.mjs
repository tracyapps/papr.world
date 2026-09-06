import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  createLooseVariantSvg,
  generatedResourceArtModule,
  looseTemplateDimensions,
  looseVariantCount,
  looseVariantRuntimePath,
  parseDirectResourcePath,
  parseResourceTilePath,
} from './resource-asset-pipeline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(root, 'assets/source');
const runtimeRoot = resolve(root, 'assets/runtime');
const manifestPath = resolve(runtimeRoot, 'asset-manifest.json');
const generatedResourceArtPath = resolve(root, 'src/game/resourceArt.generated.ts');
// Large environment cutouts (especially the new canopy-height trees) need
// more vertical detail than the original prototype cap allowed. 4096 remains
// broadly WebGL-safe; artists can explicitly request another ceiling with
// ASSET_MAX_SIZE when preparing a specialized build.
const maxRuntimeDimension = Number(process.env.ASSET_MAX_SIZE ?? 4096);

const ignoredNames = new Set(['.DS_Store', '.gitkeep']);
const rasterExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
const modelExtensions = new Set(['.glb', '.gltf']);
const passthroughExtensions = new Set(['.json']);
const supportedExtensions = new Set([
  '.svg',
  ...rasterExtensions,
  ...modelExtensions,
  ...passthroughExtensions,
]);

mkdirSync(runtimeRoot, { recursive: true });

function previousGeneratedLooseFiles() {
  if (!existsSync(manifestPath)) return [];
  try {
    const previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return (previous.resources ?? [])
      .flatMap((resource) => resource.loose ?? [])
      .map((entry) => entry.runtime)
      .filter((path) => typeof path === 'string'
        && /^assets\/runtime\/resources\/[a-z0-9-]+\/loose-\d+\.png$/.test(path));
  } catch {
    // A malformed old manifest should not prevent rebuilding a correct one.
    return [];
  }
}

function findImageMagickCommand() {
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
    return 'magick';
  } catch {
    return 'convert';
  }
}

function toPosixPath(path) {
  return path.split(sep).join('/');
}

function toAssetKey(relativeSourcePath) {
  const parsed = relativeSourcePath.replace(/\.[^.]+$/, '');
  return toPosixPath(parsed)
    .split('/')
    .map((part) => part.replace(/_/g, '-'))
    .join('.');
}

function inferUsage(relativeSourcePath, extension) {
  const [folder] = toPosixPath(relativeSourcePath).split('/').map((part) => part.toLowerCase());

  if (folder === 'materials') return 'material';
  if (folder === 'props') return 'prop';
  if (folder === 'ui') return 'ui';
  if (folder === 'avatars') return 'avatar';
  if (folder === 'creatures') return 'creature';
  if (folder === 'characters') return 'character';
  if (folder === 'textures') return 'texture';
  if (modelExtensions.has(extension)) return 'model';

  return 'asset';
}

function walkFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredNames.has(entry.name)) continue;

    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function getImageSize(path) {
  try {
    const output = execFileSync(imageMagickCommand, ['identify', '-format', '%w %h', path], {
      encoding: 'utf8',
    });
    const [width, height] = output.trim().split(/\s+/).map(Number);
    return Number.isFinite(width) && Number.isFinite(height) ? `${width}x${height}` : null;
  } catch {
    return null;
  }
}

function isLargerThanMax(size) {
  if (!size) return false;
  const [width, height] = size.split('x').map(Number);
  return width > maxRuntimeDimension || height > maxRuntimeDimension;
}

function getDimensions(size) {
  if (!size) return null;
  const [width, height] = size.split('x').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

function getRuntimeDimensions(size) {
  const dimensions = getDimensions(size);
  if (!dimensions) {
    return {
      width: maxRuntimeDimension,
      height: maxRuntimeDimension,
    };
  }

  const scale = Math.min(1, maxRuntimeDimension / Math.max(dimensions.width, dimensions.height));
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));

  return {
    width,
    height,
  };
}

// --- Colorways --------------------------------------------------------------
//
// A pattern can ship a `<name>.colors.json` sidecar beside its SVG, and this
// compiler then emits one PNG per colorway *in addition to* the default
// render:
//
//   sticks-kraft-twigs.svg
//   sticks-kraft-twigs.colors.json
//     -> sticks-kraft-twigs.png              (the artwork's own :root values)
//        sticks-kraft-twigs.terracotta.png
//        sticks-kraft-twigs.moss.png
//
// The override is applied in the browser, as an inline style on the SVG root
// element, so no file on disk is ever rewritten and an inline style always
// beats the `:root` rule in the artwork's own <style> block — no specificity
// fight, no find-and-replace, no duplicated drawings.
//
// That makes a colorway simply a map of custom-property name to value: a
// pattern exposing one variable and a pattern exposing four are handled
// identically, and any property a colorway does not mention keeps whatever
// the artwork declares. It is not limited to colour either — `--stroke-width`,
// `--opacity`, anything the SVG reads through var() varies the same way.
//
// The one authoring rule: declare every tweakable value on `:root` and read
// it with var(). Variables declared on an inner <g> are not reachable.
//
// See docs/colorway-guide.md.

const colorwaySuffix = '.colors.json';

function isColorwaySidecar(path) {
  return toPosixPath(path).toLowerCase().endsWith(colorwaySuffix);
}

/** Colorways declared beside an SVG, or [] when it has no sidecar.
 *  Throws on a malformed sidecar rather than silently compiling fewer
 *  variants than the artist wrote. */
function readColorways(svgPath) {
  const sidecarPath = svgPath.replace(/\.svg$/i, colorwaySuffix);
  if (!existsSync(sidecarPath)) return [];

  const relativeSidecar = toPosixPath(relative(root, sidecarPath));
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(sidecarPath, 'utf8'));
  } catch (error) {
    throw new Error(`${relativeSidecar} is not valid JSON: ${error.message}`);
  }

  // Generator-made SVGs (svgbackgrounds.com and friends) very often *declare*
  // a palette in :root that the shapes then ignore, having baked the chosen
  // colours in as literal hex. Overriding such a property changes nothing, and
  // the compiler would cheerfully write several identical PNGs under different
  // colorway names. Warn — loudly, once per property — rather than ship them.
  const artwork = readFileSync(svgPath, 'utf8');

  return Object.entries(parsed).map(([id, entry]) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(
        `${relativeSidecar}: colorway id "${id}" must be lowercase letters, digits and dashes — it becomes part of a filename.`,
      );
    }

    const vars = entry?.vars;
    if (!vars || typeof vars !== 'object' || Object.keys(vars).length === 0) {
      throw new Error(`${relativeSidecar}: colorway "${id}" needs a non-empty "vars" object.`);
    }

    for (const property of Object.keys(vars)) {
      if (!property.startsWith('--')) {
        throw new Error(
          `${relativeSidecar}: colorway "${id}" sets "${property}" — every key must be a CSS custom property starting with "--".`,
        );
      }
      if (!artwork.includes(`var(${property}`)) {
        console.warn(
          `WARNING ${relativeSidecar}: colorway "${id}" overrides ${property}, but the artwork never reads it with var(${property}). That colorway will render identically to the default — the shapes are probably still using literal hex.`,
        );
      }
    }

    return { id, label: typeof entry.label === 'string' ? entry.label : id, vars };
  });
}

/** Override custom properties as an inline style on the SVG root element.
 *  Every property *any* colorway of this pattern touches is cleared first, so
 *  one render can never inherit a previous one's overrides. */
async function applyColorway(page, colorway, clearProperties) {
  if (!colorway && clearProperties.length === 0) return;

  await page.evaluate(
    ({ vars, clear }) => {
      const { style } = document.documentElement;
      for (const property of clear) style.removeProperty(property);
      for (const [property, value] of Object.entries(vars)) {
        style.setProperty(property, value);
      }
    },
    { vars: colorway?.vars ?? {}, clear: clearProperties },
  );
}

async function renderSvgWithBrowser(
  page,
  sourcePath,
  runtimePath,
  sourceSize,
  colorway = null,
  clearProperties = [],
) {
  const dimensions = getRuntimeDimensions(sourceSize);
  await page.setViewportSize(dimensions);
  const sourceUrl = pathToFileURL(sourcePath).href;
  await page.goto(sourceUrl, {
    timeout: 15000,
    waitUntil: 'load',
  });
  await applyColorway(page, colorway, clearProperties);
  await page.screenshot({
    omitBackground: true,
    path: runtimePath,
  });
}

/**
 * The tile again, small, purely to be the ink inside a loose silhouette.
 *
 * The loose variants draw the tile into a pattern about 180px across, so
 * embedding the full-resolution runtime PNG was between wasteful and fatal:
 * a 2000x1200 tile of a dense repeating pattern renders to ~3.8MB, becomes
 * ~5MB of base64 inside the composed SVG, and then ~7MB again as a
 * `data:image/svg+xml;base64,` URL — past what Chromium will navigate to.
 * That is what killed the 2026-09-06 compile on `wood/paddle-cactus.svg`,
 * one file short of writing the manifest, and it would have killed any
 * future large tile the same way.
 *
 * Rendering a second small screenshot costs one fast page load and makes the
 * embed ~50KB regardless of how big the artwork is.
 */
const PATTERN_SWATCH_MAX = 512;

async function renderPatternSwatch(page, sourcePath, sourceSize) {
  const dimensions = getDimensions(sourceSize) ?? { width: PATTERN_SWATCH_MAX, height: PATTERN_SWATCH_MAX };
  const scale = Math.min(1, PATTERN_SWATCH_MAX / Math.max(dimensions.width, dimensions.height));
  await page.setViewportSize({
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
  });
  // A fresh navigation, so no colorway custom properties from an earlier
  // render leak in: loose artwork always samples the default colors.
  await page.goto(pathToFileURL(sourcePath).href, { timeout: 15000, waitUntil: 'load' });
  return page.screenshot({ omitBackground: true });
}

async function renderSvgMarkupWithBrowser(page, markup, runtimePath, dimensions) {
  await page.setViewportSize(dimensions);
  await page.goto(`data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`, {
    timeout: 15000,
    waitUntil: 'load',
  });
  await page.screenshot({
    omitBackground: true,
    path: runtimePath,
  });
}

function getRuntimePath(sourcePath, extension) {
  const relativeSourcePath = relative(sourceRoot, sourcePath);
  const runtimeRelativePath =
    extension === '.svg'
      ? relativeSourcePath.replace(/\.svg$/i, '.png')
      : relativeSourcePath;
  return resolve(runtimeRoot, runtimeRelativePath);
}

const imageMagickCommand = findImageMagickCommand();
const sourceFiles = walkFiles(sourceRoot).sort();
const staleLooseCandidates = previousGeneratedLooseFiles();
const manifestEntries = [];
const resourceRecords = [];
const seenResourceIds = new Set();
const skipped = [];
/**
 * A file that failed and the reason why.
 *
 * The compile used to be all-or-nothing: any exception anywhere aborted the
 * run before the manifest and `resourceArt.generated.ts` were written, so one
 * unrenderable tile meant every other resource silently had no art — the game
 * fell back to primitives and nothing said why. Failing loudly was right;
 * throwing away twenty-three good renders to do it was not. Now each file is
 * caught on its own, everything that worked is written, and the run still
 * ends non-zero with the failures listed.
 */
const failures = [];
let browser = null;
let page = null;

try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const sourcePath of sourceFiles) {
    const extension = extname(sourcePath).toLowerCase();
    const relativeSourcePath = toPosixPath(relative(sourceRoot, sourcePath));
    try {

      // A colorway sidecar is an input to its SVG's render, not an asset of
      // its own — it must not be copied into runtime/ as .json passthrough.
      if (isColorwaySidecar(sourcePath)) continue;

      if (!supportedExtensions.has(extension)) {
        skipped.push(relativeSourcePath);
        continue;
      }

      const runtimePath = getRuntimePath(sourcePath, extension);
      mkdirSync(dirname(runtimePath), { recursive: true });
      const sourceSize = extension === '.svg' || rasterExtensions.has(extension) ? getImageSize(sourcePath) : null;
      const usage = inferUsage(relativeSourcePath, extension);
      const resourceTile = extension === '.svg' ? parseResourceTilePath(relativeSourcePath) : null;
      const directResource = extension === '.svg' ? parseDirectResourcePath(relativeSourcePath) : null;

      const colorways = extension === '.svg' ? readColorways(sourcePath) : [];
      const colorwayProperties = [...new Set(colorways.flatMap((entry) => Object.keys(entry.vars)))];
      const renderedColorways = [];

      if (extension === '.svg') {
        try {
          await renderSvgWithBrowser(page, sourcePath, runtimePath, sourceSize, null, colorwayProperties);
        } catch (error) {
          console.warn(`Browser SVG render failed for ${relativeSourcePath}; falling back to ImageMagick.`);
          console.warn(error instanceof Error ? error.message : String(error));
          execFileSync(imageMagickCommand, [
            '-background',
            'none',
            sourcePath,
            '-resize',
            `${maxRuntimeDimension}x${maxRuntimeDimension}>`,
            runtimePath,
          ]);
        }

        for (const colorway of colorways) {
          const colorwayPath = runtimePath.replace(/\.png$/i, `.${colorway.id}.png`);

          // Deliberately no ImageMagick fallback for a colorway: ImageMagick
          // cannot apply the custom-property overrides, so falling back would
          // write a file *named* for the colorway containing the artwork's
          // default colours — a wrong asset that looks like a right one. If the
          // browser render fails here, the build should stop and say so.
          await renderSvgWithBrowser(
            page,
            sourcePath,
            colorwayPath,
            sourceSize,
            colorway,
            colorwayProperties,
          );

          manifestEntries.push({
            key: `${toAssetKey(relativeSourcePath)}.${colorway.id}`,
            source: toPosixPath(relative(root, sourcePath)),
            runtime: toPosixPath(relative(root, colorwayPath)),
            type: 'texture',
            usage,
            colorway: { id: colorway.id, label: colorway.label, vars: colorway.vars },
            sourceSize,
            size: getImageSize(colorwayPath),
          });
          renderedColorways.push({
            id: colorway.id,
            label: colorway.label,
            runtime: toPosixPath(relative(root, colorwayPath)),
          });
        }
      } else if (rasterExtensions.has(extension) && isLargerThanMax(sourceSize)) {
        execFileSync(imageMagickCommand, [
          sourcePath,
          '-resize',
          `${maxRuntimeDimension}x${maxRuntimeDimension}>`,
          runtimePath,
        ]);
      } else {
        copyFileSync(sourcePath, runtimePath);
      }

      const runtimeRelativePath = toPosixPath(relative(root, runtimePath));
      const sourceRelativePath = toPosixPath(relative(root, sourcePath));
      const size = rasterExtensions.has(extension) || extension === '.svg' ? getImageSize(runtimePath) : null;

      manifestEntries.push({
        key: toAssetKey(relativeSourcePath),
        source: sourceRelativePath,
        runtime: runtimeRelativePath,
        type: extension === '.svg' || rasterExtensions.has(extension) ? 'texture' : 'asset',
        usage,
        sourceSize,
        size,
      });

      if (resourceTile) {
        if (seenResourceIds.has(resourceTile.resourceId)) {
          throw new Error(
            `${relativeSourcePath}: duplicate resource id "${resourceTile.resourceId}". A resource may have only one default tile.`,
          );
        }
        seenResourceIds.add(resourceTile.resourceId);

        const swatch = await renderPatternSwatch(page, sourcePath, sourceSize);
        const sourceImageDataUrl = `data:image/png;base64,${swatch.toString('base64')}`;
        const loose = [];
        const dimensions = looseTemplateDimensions(resourceTile.looseTemplate);
        const variantCount = looseVariantCount(resourceTile.looseTemplate);

        for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
          const runtimeRelative = looseVariantRuntimePath(resourceTile.resourceId, variantIndex);
          const looseRuntimePath = resolve(root, runtimeRelative);
          mkdirSync(dirname(looseRuntimePath), { recursive: true });
          const markup = createLooseVariantSvg({
            sourceImageDataUrl,
            resourceId: resourceTile.resourceId,
            looseTemplate: resourceTile.looseTemplate,
            variantIndex,
          });
          await renderSvgMarkupWithBrowser(page, markup, looseRuntimePath, dimensions);

          const looseSize = getImageSize(looseRuntimePath);
          loose.push({
            runtime: runtimeRelative,
            size: looseSize,
            aspectRatio: dimensions.width / dimensions.height,
          });
          manifestEntries.push({
            key: `resource.${resourceTile.resourceId}.loose-${String(variantIndex + 1).padStart(2, '0')}`,
            source: sourceRelativePath,
            runtime: runtimeRelative,
            type: 'texture',
            usage: 'resource',
            generated: {
              kind: 'loose-resource',
              looseTemplate: resourceTile.looseTemplate,
              variant: variantIndex + 1,
            },
            sourceSize,
            size: looseSize,
          });
        }

        resourceRecords.push({
          resourceId: resourceTile.resourceId,
          source: sourceRelativePath,
          surface: runtimeRelativePath,
          surfaceColorways: renderedColorways,
          looseTemplate: resourceTile.looseTemplate,
          loose,
        });
      } else if (directResource) {
        if (seenResourceIds.has(directResource.resourceId)) {
          throw new Error(
            `${relativeSourcePath}: duplicate resource id "${directResource.resourceId}". A resource may have only one art source.`,
          );
        }
        seenResourceIds.add(directResource.resourceId);
        const dimensions = getDimensions(size);
        resourceRecords.push({
          resourceId: directResource.resourceId,
          source: sourceRelativePath,
          surface: null,
          surfaceColorways: [],
          looseTemplate: directResource.looseTemplate,
          orientation: directResource.orientation,
          loose: [{
            runtime: runtimeRelativePath,
            size,
            aspectRatio: dimensions ? dimensions.width / dimensions.height : 1,
          }],
        });
      }
    } catch (error) {
      failures.push({
        source: relativeSourcePath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
} finally {
  await page?.close();
  await browser?.close();
}

const currentLooseFiles = new Set(resourceRecords.flatMap((resource) => resource.loose.map((entry) => entry.runtime)));
/**
 * Never sweep away the previous artwork of a resource that failed *this*
 * run — the file it came from is still there, and deleting its last good
 * render would turn a fixable compile error into lost art.
 */
const failedResourceIds = new Set(
  failures
    .map((entry) => /^materials\/resources\/[^/]+\/(.+)\.svg$/i.exec(entry.source)?.[1]
      ?? /^resources\/[^/]+\/(.+)\.svg$/i.exec(entry.source)?.[1])
    .filter(Boolean),
);
for (const stalePath of staleLooseCandidates) {
  if (currentLooseFiles.has(stalePath)) continue;
  const owner = /^assets\/runtime\/resources\/([^/]+)\//.exec(stalePath)?.[1];
  if (owner && failedResourceIds.has(owner)) continue;
  rmSync(resolve(root, stalePath), { force: true });
}

writeFileSync(generatedResourceArtPath, generatedResourceArtModule(resourceRecords));

writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceRoot: 'assets/source',
      runtimeRoot: 'assets/runtime',
      maxRuntimeDimension,
      assets: manifestEntries,
      resources: resourceRecords,
      skipped,
      failures,
    },
    null,
    2,
  )}\n`,
);

const colorwayCount = manifestEntries.filter((entry) => entry.colorway).length;

console.log(`Compiled ${manifestEntries.length} assets${colorwayCount > 0 ? ` (${colorwayCount} of them colorway variants)` : ''}.`);
console.log(`Manifest: ${toPosixPath(relative(root, manifestPath))}`);

if (skipped.length > 0) {
  console.log(`Skipped ${skipped.length} unsupported files.`);
}

console.log(`Resource art: ${resourceRecords.length} materials, ${resourceRecords.reduce((total, entry) => total + entry.loose.length, 0)} loose variants.`);

if (failures.length > 0) {
  // Loud, last, and non-zero — but everything that rendered is already
  // written, so a rerun after the fix only has to redo what broke.
  console.error(`\n${failures.length} file${failures.length === 1 ? '' : 's'} FAILED and produced no art:`);
  for (const failure of failures) console.error(`  ✗ ${failure.source}\n      ${failure.reason}`);
  console.error('\nEverything else was written. Fix these and run again.');
  process.exitCode = 1;
}
