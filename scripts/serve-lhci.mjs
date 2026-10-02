#!/usr/bin/env node
// Small owned static server for LHCI. Uses an OS-assigned loopback port.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import path from 'node:path';
import process from 'node:process';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.woff2', 'font/woff2'], ['.txt', 'text/plain; charset=utf-8'],
]);

export function acceptsEncoding(header, encoding) {
  const preferences = new Map();
  for (const token of String(header ?? '').split(',')) {
    const [name, ...parameters] = token.trim().toLowerCase().split(';');
    if (!name) continue;
    const qParameter = parameters.map((part) => part.trim()).find((part) => part.startsWith('q='));
    const quality = qParameter ? Number(qParameter.slice(2)) : 1;
    preferences.set(name, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0);
  }
  return preferences.get(encoding) ?? preferences.get('*') ?? 0;
}

export async function encodedResponse(body, contentType, acceptEncoding) {
  if (!/^(text\/|application\/(?:javascript|json|xml|wasm))|\+xml(?:;|$)/i.test(contentType)) {
    return { body, contentEncoding: null };
  }
  const brQuality = acceptsEncoding(acceptEncoding, 'br');
  const gzipQuality = acceptsEncoding(acceptEncoding, 'gzip');
  if (brQuality > 0 && brQuality >= gzipQuality) {
    return {
      body: await brotli(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }),
      contentEncoding: 'br',
    };
  }
  if (gzipQuality > 0) return { body: await gzipAsync(body), contentEncoding: 'gzip' };
  return { body, contentEncoding: null };
}

export function createHandler(root) {
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); }
    catch { res.writeHead(400).end('Bad path'); return; }
    let file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end('Forbidden'); return; }
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const source = await readFile(file);
      const contentType = types.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream';
      const { body, contentEncoding } = await encodedResponse(source, contentType, req.headers['accept-encoding']);
      res.writeHead(200, {
        'content-type': contentType,
        'content-length': body.length,
        'cache-control': 'public, must-revalidate, max-age=30',
        vary: 'Accept-Encoding',
        ...(contentEncoding ? { 'content-encoding': contentEncoding } : {}),
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = path.resolve(process.argv[2] ?? 'site');
  const server = createServer(createHandler(root));
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    process.stdout.write(`PORT=${address.port}\n`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
