import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages cannot send response headers, so the security policy has to travel in
 * the document itself (DECISIONS.md D12). It is injected for production builds only —
 * the dev server needs the inline React-refresh preamble that this policy forbids.
 *
 * `frame-ancestors` is deliberately absent: browsers ignore it in a <meta> tag and log
 * a warning. Framing is refused at runtime instead — see src/lib/frame-guard.ts.
 */
function securityHeaders(): Plugin {
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const endpoint = process.env.VITE_COUNT_ENDPOINT;
      const connect = ['\'self\''];
      if (endpoint) {
        try {
          connect.push(new URL(endpoint).origin);
        } catch {
          throw new Error(`VITE_COUNT_ENDPOINT is not a valid URL: ${endpoint}`);
        }
      }

      const csp = [
        "default-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        "form-action 'none'",
        // 'wasm-unsafe-eval' is required to instantiate the MediaPipe vision runtime.
        "script-src 'self' 'wasm-unsafe-eval'",
        "worker-src 'self' blob:",
        // React and Motion write inline style attributes.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        `connect-src ${connect.join(' ')}`,
      ].join('; ');

      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
            injectTo: 'head-prepend',
          },
          {
            tag: 'meta',
            attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig({
  // GitHub Pages serves project sites from /<repo>/, so the deploy workflow sets
  // BASE_PATH. Local dev and custom domains stay at the root.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), securityHeaders()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // getUserMedia needs a secure context. localhost qualifies, so plain http is
    // fine here; testing on a phone over LAN needs `--host` plus an https tunnel.
    host: true,
  },
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
