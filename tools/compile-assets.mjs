import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(root, 'assets/source');
const runtimeRoot = resolve(root, 'assets/runtime');
const manifestPath = resolve(runtimeRoot, 'asset-manifest.json');
// Large environment cutouts (especially the new canopy-height trees) need
// more vertical detail than the original prototype cap allowed. 4096 remains
// broadly WebGL-safe; artists can explicitly request another ceiling with
// ASSET_MAX_SIZE when preparing a specialized build.
const maxRuntimeDimension = Number(process.env.ASSET_MAX_SIZE ?? 4096);

const ignoredNames = new Set(['.DS_Store']);
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

async function renderSvgWithBrowser(page, sourcePath, runtimePath, sourceSize) {
  const dimensions = getRuntimeDimensions(sourceSize);
  await page.setViewportSize(dimensions);
  const sourceUrl = pathToFileURL(sourcePath).href;
  await page.goto(sourceUrl, {
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
const manifestEntries = [];
const skipped = [];
let browser = null;
let page = null;

try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const sourcePath of sourceFiles) {
    const extension = extname(sourcePath).toLowerCase();
    const relativeSourcePath = toPosixPath(relative(sourceRoot, sourcePath));

    if (!supportedExtensions.has(extension)) {
      skipped.push(relativeSourcePath);
      continue;
    }

    const runtimePath = getRuntimePath(sourcePath, extension);
    mkdirSync(dirname(runtimePath), { recursive: true });
    const sourceSize = extension === '.svg' || rasterExtensions.has(extension) ? getImageSize(sourcePath) : null;
    const usage = inferUsage(relativeSourcePath, extension);

    if (extension === '.svg') {
      try {
        await renderSvgWithBrowser(page, sourcePath, runtimePath, sourceSize, usage);
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
  }
} finally {
  await page?.close();
  await browser?.close();
}

writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceRoot: 'assets/source',
      runtimeRoot: 'assets/runtime',
      maxRuntimeDimension,
      assets: manifestEntries,
      skipped,
    },
    null,
    2,
  )}\n`,
);

console.log(`Compiled ${manifestEntries.length} assets.`);
console.log(`Manifest: ${toPosixPath(relative(root, manifestPath))}`);

if (skipped.length > 0) {
  console.log(`Skipped ${skipped.length} unsupported files.`);
}
