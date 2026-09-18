import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Two pages: the game (index.html) and the avatar studio that My desk opens
// without entering a world (studio/index.html). Both are served under /play/.
//
// envPrefix: the game reads the Clerk PUBLISHABLE key (public by design — it
// is in every page that signs in) under the same name the Astro site already
// uses, so there is one variable to set in Vercel, not two. Secret keys never
// start with PUBLIC_CLERK_, so nothing private can leak through this prefix.
export default defineConfig({
  envPrefix: ['VITE_', 'PUBLIC_CLERK_'],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        studio: fileURLToPath(new URL('./studio/index.html', import.meta.url)),
      },
    },
  },
});
