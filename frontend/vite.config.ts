/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Set VITE_BASE_PATH (e.g. "/solace/") to serve under a sub-path behind a reverse proxy.
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080', changeOrigin: false },
      },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 600 },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
