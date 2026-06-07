#!/usr/bin/env node
// Generate a simple solid-colour PNG placeholder thumbnail (no dependencies).
//
//   node scripts/make-thumbnail.mjs <out.png> [#hexcolor] [width] [height]
//
// Defaults: 1280x720 (16:9), mid-grey. Real submissions should replace this
// with an actual screenshot, but it produces a contract-valid placeholder.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body), 0);
  return Buffer.concat([len, body, crc]);
}

function solidPng(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  // 10,11,12 = compression, filter, interlace = 0

  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const off = y * rowLen;
    raw[off] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(s || '');
  const v = m ? m[1] : '3a3a44';
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/make-thumbnail.mjs <out.png> [#hex] [width] [height]');
  process.exit(2);
}
const color = hex(process.argv[3]);
const width = Number(process.argv[4]) || 1280;
const height = Number(process.argv[5]) || 720;
writeFileSync(out, solidPng(width, height, color));
console.log(`wrote ${out} (${width}x${height})`);
