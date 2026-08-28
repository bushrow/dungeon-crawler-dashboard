import { resolve } from 'node:path';
// Import from 'vitest/config', not 'vite'. Vite's own defineConfig has no
// `test` key and will fail the type check.
import { defineConfig } from 'vitest/config';

const here = (p: string) => resolve(import.meta.dirname, p);

export default defineConfig({
  // Relative, not absolute. The build is served from /dcc/ alongside the other
  // projects, so the default '/' would emit /assets/index-HASH.js and 404 every
  // asset. './' works at a subpath, at a domain root, and from the filesystem.
  base: './',

  resolve: {
    alias: {
      '@dcc/core': here('packages/core/src/index.ts'),
      '@dcc/shell': here('apps/shell/src/index.ts'),
    },
  },

  build: {
    rollupOptions: {
      // Two apps, one build. Separate entries keep the app sources independent
      // while letting them share the shell and the access layer at zero cost.
      input: {
        index: here('index.html'),
        browser: here('apps/browser/index.html'),
        atlas: here('apps/atlas/index.html'),
        ledger: here('apps/ledger/index.html'),
      },
    },
  },

  test: {
    globals: true,
    environment: 'node',
  },
});
