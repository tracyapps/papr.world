// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

/**
 * The public site. Deliberately boring config.
 *
 * Astro ships ZERO JavaScript unless a page explicitly asks for it, so every
 * page here is HTML + CSS until one of the files in src/scripts/ is imported.
 * That is the whole reason this framework was chosen: the fun stuff is opt-in
 * per page, and the rest of the site is plain markup you can edit by hand.
 */
export default defineConfig({
  site: 'https://papr.world',
  // The generated catalog (/reference) and the game (/play) are copied into
  // the deploy tree by tools/build-web.mjs. Astro never sees them, so it must
  // not try to prerender or link-check those paths.
  build: { format: 'directory' },
  // Writes /sitemap-index.xml from the pages that actually exist, so it never
  // needs maintaining. robots.txt points at it.
  //
  // customPages adds /reference, which Astro cannot discover on its own: it is
  // a generated page staged into public/ by tools/stage-reference.mjs rather
  // than a route in src/pages.
  integrations: [sitemap({ customPages: ['https://papr.world/reference/'] })],
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          // Tokens AND the paper mixins are injected into every .astro
          // <style lang="scss"> block, so a component file can say
          // $font-hand or @include card() with no @use line of its own.
          // Both files are pure definitions and emit no CSS, so injecting
          // them everywhere costs nothing in the output.
          additionalData: '@use "src/styles/tokens" as *; @use "src/styles/paper" as *;',
          loadPaths: [fileURLToPath(new URL('./', import.meta.url))],
        },
      },
    },
  },
});
