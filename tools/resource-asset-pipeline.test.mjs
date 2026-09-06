import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
  createLooseVariantSvg,
  generatedResourceArtModule,
  looseVariantCount,
  looseVariantRuntimePath,
  parseDirectResourcePath,
  parseResourceTilePath,
} from './resource-asset-pipeline.mjs';

const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#c96"/></svg>';

describe('resource asset pipeline', () => {
  test('discovers resource tiles from their loose-form folder', () => {
    expect(parseResourceTilePath('materials/resources/stone/slate.svg')).toEqual({
      looseTemplate: 'stone',
      resourceId: 'slate',
    });
    expect(parseResourceTilePath('materials/surfaces/slate.svg')).toBeNull();
    expect(parseResourceTilePath('props/slate.svg')).toBeNull();
    expect(parseDirectResourcePath('resources/seeds/buttonbloom-seeds.svg')).toEqual({
      looseTemplate: 'seed',
      orientation: 'flat',
      resourceId: 'buttonbloom-seeds',
    });
    expect(parseDirectResourcePath('resources/stones/slate.svg')).toBeNull();
  });

  test('rejects unknown template folders and unsafe ids', () => {
    expect(() => parseResourceTilePath('materials/resources/ore/slate.svg')).toThrow(/unknown loose-resource folder/i);
    expect(() => parseResourceTilePath('materials/resources/stone/Slate 2.svg')).toThrow(/lowercase letters, digits, and dashes/i);
    expect(() => parseResourceTilePath('materials/resources/stone/Slate.svg')).toThrow(/lowercase letters, digits, and dashes/i);
  });

  test('creates deterministic but distinct masked variants from the default tile', () => {
    const first = createLooseVariantSvg({
      sourceSvg: tile,
      resourceId: 'slate',
      looseTemplate: 'stone',
      variantIndex: 0,
    });
    const repeated = createLooseVariantSvg({
      sourceSvg: tile,
      resourceId: 'slate',
      looseTemplate: 'stone',
      variantIndex: 0,
    });
    const second = createLooseVariantSvg({
      sourceSvg: tile,
      resourceId: 'slate',
      looseTemplate: 'stone',
      variantIndex: 1,
    });

    expect(first).toBe(repeated);
    expect(first).not.toBe(second);
    expect(first).toContain('data:image/svg+xml;base64,');
    expect(first).toContain('fill="url(#tile)"');
  });

  test('uses predictable loose output names and emits generated presentation data', () => {
    expect(looseVariantCount('wood')).toBe(6);
    expect(looseVariantRuntimePath('redwood-clippings', 2)).toBe(
      'assets/runtime/resources/redwood-clippings/loose-03.png',
    );

    const module = generatedResourceArtModule([{
      resourceId: 'slate',
      surface: 'assets/runtime/materials/resources/stone/slate.png',
      surfaceColorways: [{ id: 'blue', label: 'Blue', runtime: 'assets/runtime/materials/resources/stone/slate.blue.png' }],
      looseTemplate: 'stone',
      loose: [{ runtime: 'assets/runtime/resources/slate/loose-01.png', aspectRatio: 1.2 }],
    }]);

    expect(module).toContain('GENERATED_RESOURCE_ART');
    expect(module).toContain('"surfaceUrl": "/assets/runtime/materials/resources/stone/slate.png"');
    expect(module).toContain('"sourceUrl": "/assets/runtime/resources/slate/loose-01.png"');
    expect(module).not.toContain('Do not edit by hand.\\n\\n');
  });

  test('renders a loose variant as a transparent PNG at its template size', async () => {
    const workDir = mkdtempSync(join(tmpdir(), 'papr-resource-art-'));
    const output = join(workDir, 'slate.png');
    const markup = createLooseVariantSvg({
      sourceSvg: tile,
      resourceId: 'slate',
      looseTemplate: 'stone',
      variantIndex: 0,
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 360, height: 300 } });
      await page.goto(`data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`, { waitUntil: 'load' });
      await page.screenshot({ path: output, omitBackground: true });
      const png = readFileSync(output);
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(360);
      expect(png.readUInt32BE(20)).toBe(300);
      const alphaMean = Number(execFileSync('magick', [
        output, '-alpha', 'extract', '-format', '%[fx:mean]', 'info:',
      ], { encoding: 'utf8' }));
      expect(alphaMean).toBeGreaterThan(0.2);
      expect(alphaMean).toBeLessThan(0.9);
    } finally {
      await browser.close();
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
