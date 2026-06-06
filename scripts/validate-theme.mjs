#!/usr/bin/env node
// Validate one community theme folder against the Psysonic theme-store contract.
//
//   node scripts/validate-theme.mjs themes/<id>
//   node scripts/validate-theme.mjs            # validates every folder in themes/
//
// A theme folder must contain: manifest.json, theme.css, thumbnail.png.
// The CSS contract: a single [data-theme='<id>'] rule whose declarations are
// color-scheme plus custom properties drawn only from schema/allowed-tokens.json.
// Exits non-zero on the first failing theme; prints every problem it found.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import Ajv from 'ajv';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const tokens = JSON.parse(readFileSync(join(REPO, 'schema', 'allowed-tokens.json'), 'utf8'));
const manifestSchema = JSON.parse(readFileSync(join(REPO, 'schema', 'manifest.schema.json'), 'utf8'));

const noMeta = (o) => Object.keys(o || {}).filter((k) => !k.startsWith('$'));
const CORE = noMeta(tokens.core);
const OPTIONAL = noMeta(tokens.optional);
const GRANULAR = noMeta(tokens.granular);
// Core is required; optional + granular are allowed but never required.
const ALLOWED = new Set([...CORE, ...OPTIONAL, ...GRANULAR]);
const DATA_URI_TOKENS = new Set(tokens.dataUriTokens);
const SCHEME_VALUES = new Set(tokens.colorScheme.values);

// Thumbnail constraints.
const THUMB_MAX_BYTES = 300 * 1024;
const THUMB = { minW: 320, maxW: 960, minH: 200, maxH: 600, minAspect: 1.4, maxAspect: 1.7 };

const ajv = new Ajv({ allErrors: true });
const validateManifest = ajv.compile(manifestSchema);

/** Collect problems for one theme folder; return an array of message strings. */
function validateTheme(folder) {
  const errors = [];
  const id = basename(folder);
  const push = (m) => errors.push(m);

  // ---- files present ----
  const manifestPath = join(folder, 'manifest.json');
  const cssPath = join(folder, 'theme.css');
  const thumbPath = join(folder, 'thumbnail.png');
  for (const [label, p] of [['manifest.json', manifestPath], ['theme.css', cssPath], ['thumbnail.png', thumbPath]]) {
    if (!existsSync(p)) push(`missing ${label}`);
  }
  if (errors.length) return errors; // nothing else is meaningful without the files

  // ---- manifest ----
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    push(`manifest.json is not valid JSON: ${e.message}`);
    return errors;
  }
  if (!validateManifest(manifest)) {
    for (const e of validateManifest.errors) {
      push(`manifest${e.instancePath || ''} ${e.message}`);
    }
  }
  if (manifest.id !== undefined && manifest.id !== id) {
    push(`manifest.id "${manifest.id}" must equal the folder name "${id}"`);
  }

  // ---- css ----
  const css = readFileSync(cssPath, 'utf8');
  let root;
  try {
    root = postcss.parse(css, { from: cssPath });
  } catch (e) {
    push(`theme.css does not parse: ${e.message}`);
    return errors;
  }

  // No at-rules at all (@import / @media / @keyframes ...).
  root.walkAtRules((at) => push(`@${at.name} is not allowed in a theme.css`));

  // Exactly one rule, selecting exactly [data-theme='<id>'].
  const rules = [];
  root.walkRules((r) => rules.push(r));
  if (rules.length === 0) {
    push('theme.css has no [data-theme] rule');
    return errors;
  }
  if (rules.length > 1) {
    push(`theme.css must contain exactly one rule; found ${rules.length}`);
  }
  const rule = rules[0];
  const wantSelectors = new Set([`[data-theme='${id}']`, `[data-theme="${id}"]`]);
  if (!wantSelectors.has(rule.selector.trim())) {
    push(`selector must be exactly [data-theme='${id}'] (got: ${rule.selector.trim()})`);
  }

  // Declarations: color-scheme + whitelisted custom props only.
  const seen = new Set();
  let scheme = null;
  rule.walkDecls((decl) => {
    const prop = decl.prop.trim();
    const value = decl.value.trim();

    if (prop === 'color-scheme') {
      scheme = value;
      if (!SCHEME_VALUES.has(value)) push(`color-scheme must be one of ${[...SCHEME_VALUES].join(' | ')} (got: ${value})`);
      return;
    }
    if (!prop.startsWith('--')) {
      push(`only custom properties and color-scheme are allowed (found plain property: ${prop})`);
      return;
    }
    if (!ALLOWED.has(prop)) {
      push(`token ${prop} is not in the contract whitelist`);
      return;
    }
    if (seen.has(prop)) push(`token ${prop} is declared more than once`);
    seen.add(prop);

    // Value safety.
    const lower = value.toLowerCase();
    if (lower.includes('@import')) push(`${prop}: @import is not allowed`);
    if (/expression\s*\(/.test(lower) || lower.includes('javascript:')) push(`${prop}: forbidden value`);
    const urls = lower.match(/url\(([^)]*)\)/g) || [];
    for (const u of urls) {
      const isData = /url\(\s*["']?\s*data:/.test(u);
      if (!isData) push(`${prop}: only url(data:...) is allowed (got: ${u})`);
      else if (!DATA_URI_TOKENS.has(prop)) push(`${prop}: data-URI values are only allowed on ${[...DATA_URI_TOKENS].join(', ')}`);
    }
  });

  if (scheme === null) push('color-scheme is required');
  if (manifest.mode && scheme && manifest.mode !== scheme) {
    push(`manifest.mode "${manifest.mode}" must match color-scheme "${scheme}"`);
  }

  // All core tokens required.
  for (const t of CORE) {
    if (!seen.has(t)) push(`missing required core token ${t}`);
  }

  // ---- thumbnail ----
  validateThumbnail(thumbPath, push);

  return errors;
}

/** PNG sanity: magic bytes, size cap, dimensions from the IHDR chunk. */
function validateThumbnail(path, push) {
  const buf = readFileSync(path);
  const size = statSync(path).size;
  if (size > THUMB_MAX_BYTES) push(`thumbnail.png is ${(size / 1024).toFixed(0)} KB; cap is ${THUMB_MAX_BYTES / 1024} KB`);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || !sig.every((b, i) => buf[i] === b)) {
    push('thumbnail.png is not a valid PNG');
    return;
  }
  // IHDR is the first chunk: length(4) "IHDR"(4) width(4) height(4) ...
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const aspect = width / height;
  if (width < THUMB.minW || width > THUMB.maxW) push(`thumbnail width ${width}px outside ${THUMB.minW}-${THUMB.maxW}px`);
  if (height < THUMB.minH || height > THUMB.maxH) push(`thumbnail height ${height}px outside ${THUMB.minH}-${THUMB.maxH}px`);
  if (aspect < THUMB.minAspect || aspect > THUMB.maxAspect) {
    push(`thumbnail aspect ${aspect.toFixed(2)} outside ${THUMB.minAspect}-${THUMB.maxAspect} (recommended 720x450)`);
  }
}

// ---- entry point ----
function main() {
  const arg = process.argv[2];
  let folders;
  if (arg) {
    folders = [resolve(arg)];
  } else {
    const themesDir = join(REPO, 'themes');
    folders = existsSync(themesDir)
      ? readdirSync(themesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(themesDir, d.name))
      : [];
  }

  if (folders.length === 0) {
    console.log('No theme folders to validate.');
    return;
  }

  let failed = 0;
  for (const folder of folders) {
    const id = basename(folder);
    const errors = validateTheme(folder);
    if (errors.length === 0) {
      console.log(`PASS  ${id}`);
    } else {
      failed++;
      console.log(`FAIL  ${id}`);
      for (const e of errors) console.log(`        - ${e}`);
    }
  }

  if (failed > 0) {
    console.log(`\n${failed} theme(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${folders.length} theme(s) valid.`);
}

main();
