#!/usr/bin/env node
// Produce the canonical `thumbnail.webp` for community themes.
//
// Each thumbnail is normalised to 16:9 (1280x720, the native screenshot aspect
// so nothing is cropped for a standard screenshot), downscaled at most (never
// upscaled), and written as WebP (q80). Off-aspect sources are center
// cover-cropped to 16:9. The same conversion normalises contributor uploads in
// CI and (re)generates thumbnails in bulk from raw screenshots.
//
// Modes:
//   node scripts/make-webp.mjs --themes themes
//       For every themes/<id>/ that has a thumbnail.{png,jpg,jpeg} source,
//       write thumbnail.webp and delete the source. (CI normalise step.)
//
//   node scripts/make-webp.mjs --from-raws <dir> [--themes themes]
//       For every <dir>/<id>.{png,jpg,jpeg,webp} whose themes/<id>/ exists,
//       write themes/<id>/thumbnail.webp and remove any old non-webp source.
//       (Bulk regeneration from raw screenshots.)

import sharp from 'sharp';
import { readdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TARGET_W = 1280;
const TARGET_H = 720; // 16:9 — native screenshot aspect, so nothing is cropped
const QUALITY = 80;
const SOURCE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

/** Normalise `src` to a ≤1280x720 16:9 WebP (downscale only; a true 16:9
 *  screenshot is just resized, off-aspect sources are center cover-cropped). */
async function toWebp(src, out) {
  const info = await sharp(src, { failOn: 'none' })
    .resize(TARGET_W, TARGET_H, { fit: 'cover', position: 'centre', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(out);
  return info;
}

/** Find a thumbnail source in a theme folder (prefers a non-webp upload). */
function themeSource(dir) {
  for (const ext of ['.png', '.jpg', '.jpeg']) {
    const p = join(dir, `thumbnail${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const themesDir = resolve(arg('--themes') || join(REPO, 'themes'));
  const rawsDir = arg('--from-raws') ? resolve(arg('--from-raws')) : null;
  let ok = 0;
  let skip = 0;
  let fail = 0;

  if (rawsDir) {
    for (const f of readdirSync(rawsDir)) {
      if (!SOURCE_EXTS.includes(extname(f).toLowerCase())) continue;
      const id = basename(f, extname(f));
      const dir = join(themesDir, id);
      if (!existsSync(dir)) { console.warn(`skip ${id} (no theme folder)`); skip++; continue; }
      try {
        const out = join(dir, 'thumbnail.webp');
        const info = await toWebp(join(rawsDir, f), out);
        for (const ext of ['.png', '.jpg', '.jpeg']) {
          const old = join(dir, `thumbnail${ext}`);
          if (existsSync(old)) rmSync(old);
        }
        console.log(`ok   ${id.padEnd(24)} ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
        ok++;
      } catch (e) { console.warn(`FAIL ${id}: ${e.message}`); fail++; }
    }
  } else {
    for (const d of readdirSync(themesDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir = join(themesDir, d.name);
      const src = themeSource(dir);
      if (!src) { skip++; continue; }
      try {
        const out = join(dir, 'thumbnail.webp');
        const info = await toWebp(src, out);
        rmSync(src);
        console.log(`ok   ${d.name.padEnd(24)} ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
        ok++;
      } catch (e) { console.warn(`FAIL ${d.name}: ${e.message}`); fail++; }
    }
  }
  console.log(`\ndone: ${ok} converted, ${skip} skipped, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
