import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5174,
      strictPort: true,
      // Allow opening the dev server through an ngrok tunnel (e.g. on a phone).
      allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
      // /api/* is forwarded to the BEE-OAK server (local by default) so phones on ngrok reach it too.
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://localhost:3010', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
        // Admin dashboard (partners portal) talks to its own API target, by default the production-DB server.
        '/admin-api': { target: env.ADMIN_PROXY_TARGET || env.API_PROXY_TARGET || 'http://localhost:3010', changeOrigin: true, rewrite: (p) => p.replace(/^\/admin-api/, '') },
      },
    },
    preview: { port: 5174, strictPort: true },
  };
});
