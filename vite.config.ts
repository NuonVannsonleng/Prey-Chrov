import { defineConfig } from 'vitest/config';
import pkg from './package.json';

export default defineConfig({
  base: './',
  // Shown on the menu and in the credits; comes from package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
});
