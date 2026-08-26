#!/usr/bin/env node
/**
 * Puts the generated reference where the site can serve it.
 *
 * tools/build-reference.mjs writes docs-site/. That is its own output and
 * predates the site. This copies it to site/public/reference/, which is where
 * BOTH the dev server and the production build pick it up — so /reference in
 * `npm run site:dev` is the same page as /reference on papr.world, instead of
 * a link that only works after a full deploy build.
 *
 * site/public/reference/ is generated and gitignored. Never edit it.
 *
 * Run: npm run reference:stage   (site:dev and build:web both do this for you)
 */

import { rm, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../docs-site/', import.meta.url));
const to = fileURLToPath(new URL('../site/public/reference/', import.meta.url));

await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });

console.log('Reference staged at site/public/reference/');
