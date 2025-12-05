import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@components': fileURLToPath(new URL('./components', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      '.trycloudflare.com', // allow all cloudflared links
      '.cfargotunnel.com',  // alternate domain cloudflared uses
      'localhost',
    ],
  },
});
