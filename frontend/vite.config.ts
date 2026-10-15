/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/** Mirrors deploy/nginx.conf. React sets styles through the CSSOM, so only `style-src 'unsafe-inline'` is needed for style attributes. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
    // `vite preview` serves the production build with the same API proxy and security headers as deployment.
    preview: {
      port: 4173,
      proxy: { '/api': { target: env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080', changeOrigin: false } },
      headers: { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' },
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
