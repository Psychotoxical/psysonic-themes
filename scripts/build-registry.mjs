#!/usr/bin/env node
// Regenerate registry.json from every theme manifest under themes/.
//
//   node scripts/build-registry.mjs
//
// registry.json is the single file the app reads (over jsDelivr). It is
// AUTO-GENERATED — never hand-edit it. CSS and thumbnails are referenced by
// relative path and fetched on demand; the client prepends the CDN base.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const themesDir = join(REPO, 'themes');

const SCHEMA_VERSION = 1;

function build() {
  const themes = [];
  if (existsSync(themesDir)) {
    const ids = readdirSync(themesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const id of ids) {
      const manifestPath = join(themesDir, id, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      themes.push({
        id: m.id,
        name: m.name,
        author: m.author,
        version: m.version,
        description: m.description,
        mode: m.mode,
        ...(m.tags ? { tags: m.tags } : {}),
        ...(m.minAppVersion ? { minAppVersion: m.minAppVersion } : {}),
        css: `themes/${id}/theme.css`,
        thumbnail: `themes/${id}/thumbnail.webp`,
      });
    }
  }

  const registry = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    themes,
  };
  writeFileSync(join(REPO, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');
  console.log(`registry.json: ${themes.length} theme(s)`);
}

build();
