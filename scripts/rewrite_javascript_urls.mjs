#!/usr/bin/env node
import fs from 'node:fs';
import * as acorn from 'acorn';

const quotedAttribute = /((?:\bhref|\bsrc|\baction|\bposter|\bcontent|\bdata-[\w:-]+)\s*=\s*)(["'])\/(?!\/)([^"'`\s>]*)/gi;
const unquotedAttribute = /((?:\bhref|\bsrc|\baction|\bposter|\bcontent|\bdata-[\w:-]+)=)\/(?!\/)([^"'`\s>]*)/gi;
const cssUrl = /(url\(\s*)(["']?)\/(?!\/)([^"')\s]*)(["']?)/gi;
const cssImport = /(@import\s+)(["'])\/(?!\/)([^"']*)/gi;
const srcset = /(\bsrcset\s*=\s*)(["'])(.*?)(\2)/gis;
const rootInSrcset = /(^|,\s*)\/(?!\/)([^\s,]+)/g;
const urlArgument = /\b(?:fetch|import|URL|register)\s*\(\s*$/i;
const urlProperty = /\b(?:href|src|url|uri|endpoint|baseUrl|baseURL|publicPath|serviceWorkerUrl)\s*[:=]\s*$/i;
const locationAssignment = /\b(?:window\.)?location(?:\.href)?\s*=\s*$/i;

function prefixUrl(basePath, value) {
  const url = new URL(value, 'https://pages.invalid');
  const path = url.pathname;
  if (path === basePath || path.startsWith(`${basePath}/`)) return `${path}${url.search}${url.hash}`;
  return `${basePath}${path}${url.search}${url.hash}`;
}

function rewriteMarkupUrls(value, basePath) {
  let updated = value.replace(cssUrl, (_match, prefix, quote, path, ending) =>
    `${prefix}${quote}${prefixUrl(basePath, `/${path}`)}${ending}`);
  updated = updated.replace(cssImport, (_match, prefix, quote, path) =>
    `${prefix}${quote}${prefixUrl(basePath, `/${path}`)}`);
  updated = updated.replace(srcset, (_match, prefix, quote, list) =>
    `${prefix}${quote}${list.replace(rootInSrcset, (_item, gap, path) => `${gap}${prefixUrl(basePath, `/${path}`)}`)}${quote}`);
  updated = updated.replace(quotedAttribute, (_match, prefix, quote, path) =>
    `${prefix}${quote}${prefixUrl(basePath, `/${path}`)}`);
  return updated.replace(unquotedAttribute, (_match, prefix, path) =>
    `${prefix}${prefixUrl(basePath, `/${path}`)}`);
}

function isUrlContext(source, start) {
  const prefix = source.slice(Math.max(0, start - 160), start);
  return urlArgument.test(prefix) || urlProperty.test(prefix) || locationAssignment.test(prefix);
}

function rewriteLiteral(value, basePath, jupyterBasePath, urlContext) {
  if (value === '/api/service-worker-heartbeat' && jupyterBasePath) {
    return prefixUrl(jupyterBasePath, value);
  }
  const updated = rewriteMarkupUrls(value, basePath);
  if (urlContext && updated.startsWith('/') && !updated.startsWith('//')) {
    return prefixUrl(basePath, updated);
  }
  return updated;
}

function quoteTemplate(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('`', '\\`')
    .replace(/\$\{/g, '\\${').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

function rewriteSource(source, basePath, jupyterBasePath) {
  const tokenizer = acorn.tokenizer(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  const replacements = [];
  let token = tokenizer.getToken();
  while (token.type.label !== 'eof') {
    const { label } = token.type;
    if ((label === 'string' || label === 'template') && typeof token.value === 'string') {
      const value = rewriteLiteral(token.value, basePath, jupyterBasePath, isUrlContext(source, token.start));
      if (value !== token.value) {
        const text = label === 'string' ? JSON.stringify(value) : quoteTemplate(value);
        replacements.push([token.start, token.end, text]);
      }
    }
    token = tokenizer.getToken();
  }
  let output = source;
  for (const [start, end, text] of replacements.reverse()) output = `${output.slice(0, start)}${text}${output.slice(end)}`;
  return output;
}

function parseOptions(args) {
  const options = { files: [] };
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === '--stdin') options.stdin = true;
    else if (item === '--base-path') options.basePath = args[++index];
    else if (item === '--jupyter-base-path') options.jupyterBasePath = args[++index];
    else if (item === '--files') options.files = args.slice(index + 1);
  }
  if (!options.basePath) throw new Error('--base-path is required');
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.stdin) {
    let source = '';
    for await (const chunk of process.stdin) source += chunk;
    process.stdout.write(rewriteSource(source, options.basePath, options.jupyterBasePath));
    return;
  }
  let changed = 0;
  for (const file of options.files) {
    const original = fs.readFileSync(file, 'utf8');
    const updated = rewriteSource(original, options.basePath, options.jupyterBasePath);
    if (updated !== original) {
      fs.writeFileSync(file, updated, 'utf8');
      changed += 1;
    }
  }
  process.stdout.write(`${changed}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
