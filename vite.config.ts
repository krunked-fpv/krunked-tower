import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function localCustomPackMiddleware(): Plugin {
  const assetsRoot = path.resolve(process.cwd(), '.krunked-tower-assets');
  const mimeTypes: Record<string, string> = {
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.bin': 'application/octet-stream',
  };

  return {
    name: 'krunked-local-custom-pack',
    configureServer(server) {
      server.middlewares.use('/custom-pack', (req, res, next) => {
        const rawUrl = (req.url ?? '/').split('?')[0];
        const rel = decodeURIComponent(rawUrl).replace(/^\/+/, '');
        const fullPath = path.resolve(assetsRoot, rel);
        if (!fullPath.startsWith(assetsRoot) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(fullPath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [localCustomPackMiddleware()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
