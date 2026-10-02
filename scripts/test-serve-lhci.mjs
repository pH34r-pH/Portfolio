#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { createHandler, encodedResponse, acceptsEncoding } from './serve-lhci.mjs';

assert.equal(acceptsEncoding('gzip;q=0, br;q=0.5', 'gzip'), 0);
assert.equal(acceptsEncoding('gzip;q=0, br;q=0.5', 'br'), 0.5);
assert.equal(acceptsEncoding('*;q=0.3', 'gzip'), 0.3);
assert.equal(acceptsEncoding('br;q=bogus', 'br'), 0);

const fixture = Buffer.from('Portfolio compression fixture '.repeat(100));
const br = await encodedResponse(fixture, 'text/html; charset=utf-8', 'gzip;q=0.7, br;q=1');
assert.equal(br.contentEncoding, 'br');
assert.deepEqual(brotliDecompressSync(br.body), fixture);
const gz = await encodedResponse(fixture, 'text/css; charset=utf-8', 'br;q=0, gzip;q=0.9');
assert.equal(gz.contentEncoding, 'gzip');
assert.deepEqual(gunzipSync(gz.body), fixture);
const identity = await encodedResponse(fixture, 'application/octet-stream', 'br, gzip');
assert.equal(identity.contentEncoding, null);
assert.deepEqual(identity.body, fixture);

const root = await mkdtemp(path.join(tmpdir(), 'lhci-server-test-'));
const routeDir = path.join(root, 'about');
await mkdir(routeDir);
await writeFile(path.join(routeDir, 'index.html'), fixture);
const server = createServer(createHandler(root));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/about/`, { headers: { 'accept-encoding': 'br' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), 'br');
  assert.equal(response.headers.get('vary'), 'Accept-Encoding');
  assert.equal(response.headers.get('cache-control'), 'public, must-revalidate, max-age=30');
  assert.ok(Number(response.headers.get('content-length')) < fixture.length);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture);
  const noCompression = await fetch(`http://127.0.0.1:${port}/about/`, { headers: { 'accept-encoding': 'br;q=0, gzip;q=0' } });
  assert.equal(noCompression.headers.get('content-encoding'), null);
  assert.equal(Number(noCompression.headers.get('content-length')), fixture.length);
  assert.deepEqual(Buffer.from(await noCompression.arrayBuffer()), await readFile(path.join(routeDir, 'index.html')));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(root, { recursive: true, force: true });
}

process.stdout.write('LHCI compressed-server negotiation tests passed.\n');
