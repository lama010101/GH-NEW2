// BRAND-BUILD-PURPLEICONS-1015-002 — generate the brand icon set.
//
// NOTE: sharp is NOT a repo dependency. Install it for the run only:
//   npm install --no-save sharp
// then run from the repo root:
//   node scripts/dev/generate-brand-icons.mjs
//
// Symbol normalization: the source symbol-white.png has gray-white shading and a
// translucent fringe. We set R=G=B=255 on every pixel while keeping the alpha
// channel byte-for-byte unchanged, giving a clean white symbol that preserves
// the design's translucency when composited over the brand purple.

import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BRAND_TS = 'src/core/brand.ts';
const SYMBOL_SRC = 'docs/ui/assets/symbol-white.png';

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };

const brandSrc = readFileSync(BRAND_TS, 'utf8');
const hexMatch = brandSrc.match(/BRAND_PRIMARY_HEX\s*=\s*"(#[0-9a-fA-F]{6})"/);
if (!hexMatch) fail(`BRAND_PRIMARY_HEX hex literal not found in ${BRAND_TS}`);
const HEX = hexMatch[1];
const BRAND = {
  r: parseInt(HEX.slice(1, 3), 16),
  g: parseInt(HEX.slice(3, 5), 16),
  b: parseInt(HEX.slice(5, 7), 16),
};

// --- Load symbol, find alpha-bbox (alpha > 8), crop, normalize to white ---
const { data: raw, info } = await sharp(SYMBOL_SRC)
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (raw[(y * info.width + x) * 4 + 3] > 8) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) fail('symbol has no pixels with alpha > 8');
const cropW = maxX - minX + 1, cropH = maxY - minY + 1;

const { data: cropRaw, info: cinfo } = await sharp(SYMBOL_SRC)
  .extract({ left: minX, top: minY, width: cropW, height: cropH })
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < cropRaw.length; i += 4) {
  cropRaw[i] = 255; cropRaw[i + 1] = 255; cropRaw[i + 2] = 255;
}
const symBuf = await sharp(cropRaw, {
  raw: { width: cinfo.width, height: cinfo.height, channels: 4 },
}).png().toBuffer();

async function resizedSymbol(target) {
  const { data, info: rinfo } = await sharp(symBuf)
    .resize(target, target, { fit: 'inside', kernel: 'lanczos3' })
    .png().toBuffer({ resolveWithObject: true });
  return { data, w: rinfo.width, h: rinfo.height };
}

async function tile(size, fillRatio, { flatten = false } = {}) {
  const target = Math.round(size * fillRatio);
  const { data, w, h } = await resizedSymbol(target);
  let img = sharp({
    create: { width: size, height: size, channels: 4, background: { ...BRAND, alpha: 255 } },
  }).composite([{
    input: data,
    left: Math.round((size - w) / 2),
    top: Math.round((size - h) / 2),
  }]);
  if (flatten) img = img.removeAlpha();
  return img.png().toBuffer();
}

async function badge(size, fillRatio) {
  const target = Math.round(size * fillRatio);
  const { data, w, h } = await resizedSymbol(target);
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: data,
    left: Math.round((size - w) / 2),
    top: Math.round((size - h) / 2),
  }]).png().toBuffer();
}

function buildIco(entries) { // entries: [{ size, buf }] PNG-compressed
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type 1 = ICO
  header.writeUInt16LE(entries.length, 4); // count
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  const blobs = [];
  entries.forEach((e, i) => {
    const b = e.size === 256 ? 0 : e.size;
    dir.writeUInt8(b, i * 16);                    // width
    dir.writeUInt8(b, i * 16 + 1);                // height
    dir.writeUInt8(0, i * 16 + 2);                // colorCount
    dir.writeUInt8(0, i * 16 + 3);                // reserved
    dir.writeUInt16LE(1, i * 16 + 4);             // planes
    dir.writeUInt16LE(32, i * 16 + 6);            // bitCount
    dir.writeUInt32LE(e.buf.length, i * 16 + 8);  // bytesInRes
    dir.writeUInt32LE(offset, i * 16 + 12);       // imageOffset
    blobs.push(e.buf);
    offset += e.buf.length;
  });
  return Buffer.concat([header, dir, ...blobs]);
}

// --- Generate ---
const out = {};
out['public/icons/icon-192.png'] = await tile(192, 0.60);
out['public/icons/icon-512.png'] = await tile(512, 0.60);
out['public/icons/icon-maskable-512.png'] = await tile(512, 0.52);
out['public/icons/apple-touch-icon.png'] = await tile(180, 0.60, { flatten: true });
out['public/icons/badge-96.png'] = await badge(96, 0.80);

const ico16 = await tile(16, 0.78);
const ico32 = await tile(32, 0.72);
const ico48 = await tile(48, 0.72);
out['src/app/favicon.ico'] = buildIco([
  { size: 16, buf: ico16 },
  { size: 32, buf: ico32 },
  { size: 48, buf: ico48 },
]);

for (const [p, buf] of Object.entries(out)) writeFileSync(p, buf);

// --- Self-check ---
const results = [];
const errors = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  if (!ok) errors.push(`${name}: ${detail}`);
};

const expectSize = {
  'public/icons/icon-192.png': 192,
  'public/icons/icon-512.png': 512,
  'public/icons/icon-maskable-512.png': 512,
  'public/icons/apple-touch-icon.png': 180,
  'public/icons/badge-96.png': 96,
};

const decoded = {};
for (const p of Object.keys(expectSize)) {
  decoded[p] = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = decoded[p].info;
  check(`(i) ${p} size`, width === expectSize[p] && height === expectSize[p], `${width}x${height}`);
}

const tilePaths = [
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/icon-maskable-512.png',
  'public/icons/apple-touch-icon.png',
];
for (const p of tilePaths) {
  const { data, info: di } = decoded[p];
  const ch = di.channels;
  const i = (1 * di.width + 1) * ch;
  const rgbOk = data[i] === BRAND.r && data[i + 1] === BRAND.g && data[i + 2] === BRAND.b;
  const aOk = ch === 4 ? data[i + 3] === 255 : true;
  check(`(ii) ${p} px(1,1)`, rgbOk && aOk,
    `rgba(${data[i]},${data[i + 1]},${data[i + 2]},${ch === 4 ? data[i + 3] : '-'}) want ${HEX}${ch === 4 ? ' a255' : ''}`);
}

function diffBBox(data, di, ch, thr) {
  let x0 = di.width, y0 = di.height, x1 = -1, y1 = -1;
  for (let y = 0; y < di.height; y++) {
    for (let x = 0; x < di.width; x++) {
      const i = (y * di.width + x) * ch;
      const d = Math.max(
        Math.abs(data[i] - BRAND.r),
        Math.abs(data[i + 1] - BRAND.g),
        Math.abs(data[i + 2] - BRAND.b));
      if (d > thr) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

for (const p of tilePaths) {
  const { data, info: di } = decoded[p];
  const ch = di.channels;
  const c = di.width / 2;
  const b0 = diffBBox(data, di, ch, 0);
  const b60 = diffBBox(data, di, ch, 60);
  if (!b0) { check(`(iii-a) ${p} placement`, false, 'no differing pixels'); continue; }
  const c0x = (b0.x0 + b0.x1) / 2, c0y = (b0.y0 + b0.y1) / 2;
  const off0x = c0x - c, off0y = c0y - c;
  check(`(iii-a) ${p} placement`, Math.abs(off0x) <= 1.5 && Math.abs(off0y) <= 1.5,
    `diff>0 bbox ${b0.x0},${b0.y0}-${b0.x1},${b0.y1} center ${c0x.toFixed(1)},${c0y.toFixed(1)} off ${off0x.toFixed(1)},${off0y.toFixed(1)}`);
  if (p.includes('maskable')) {
    const R = 0.40 * di.width;
    const corners = [[b0.x0, b0.y0], [b0.x1, b0.y0], [b0.x0, b0.y1], [b0.x1, b0.y1]];
    const worst = Math.max(...corners.map(([x, y]) => Math.hypot(x - c, y - c)));
    check(`(iii-b) ${p} safe-zone`, worst <= R, `worst-corner r=${worst.toFixed(1)} <= ${R}`);
  }
  if (b60) {
    const c60x = (b60.x0 + b60.x1) / 2, c60y = (b60.y0 + b60.y1) / 2;
    const off60x = c60x - c, off60y = c60y - c;
    check(`(iii-c) ${p} core-offset`, Math.abs(off60x) <= 6 && Math.abs(off60y) <= 6,
      `diff>60 bbox ${b60.x0},${b60.y0}-${b60.x1},${b60.y1} center ${c60x.toFixed(1)},${c60y.toFixed(1)} off ${off60x.toFixed(1)},${off60y.toFixed(1)} (informational; ceiling 6)`);
  }
}

{
  const p = 'public/icons/badge-96.png';
  const { data, info: di } = decoded[p];
  const ch = di.channels;
  const cornerA = data[3];
  let bx0 = di.width, by0 = di.height, bx1 = -1, by1 = -1, minCh = 255;
  for (let y = 0; y < di.height; y++) {
    for (let x = 0; x < di.width; x++) {
      const i = (y * di.width + x) * ch;
      if (data[i + 3] > 8) {
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
        const m = Math.min(data[i], data[i + 1], data[i + 2]);
        if (m < minCh) minCh = m;
      }
    }
  }
  const margin = bx1 >= 0 && bx0 >= 5 && by0 >= 5 && (di.width - 1 - bx1) >= 5 && (di.height - 1 - by1) >= 5;
  check(`(iv) ${p}`, cornerA === 0 && margin && minCh >= 250,
    `px(0,0) a=${cornerA} bbox ${bx0},${by0}-${bx1},${by1} minChannel=${minCh}`);
}

{
  const p = 'public/icons/apple-touch-icon.png';
  const meta = await sharp(p).metadata();
  check(`(v) ${p} channels`, meta.channels === 3, `channels=${meta.channels}`);
}

{
  const p = 'src/app/favicon.ico';
  const buf = readFileSync(p);
  const reserved = buf.readUInt16LE(0), type = buf.readUInt16LE(2), count = buf.readUInt16LE(4);
  const sizes = [];
  let decOk = reserved === 0 && type === 1 && count === 3;
  if (decOk) {
    for (let i = 0; i < count; i++) {
      const w = buf.readUInt8(i * 16 + 6) || 256;
      const h = buf.readUInt8(i * 16 + 7) || 256;
      sizes.push(w);
      const bytes = buf.readUInt32LE(i * 16 + 14);
      const off = buf.readUInt32LE(i * 16 + 18);
      try {
        const m = await sharp(buf.subarray(off, off + bytes)).metadata();
        if (m.width !== w || m.height !== h) decOk = false;
      } catch { decOk = false; }
    }
    decOk = decOk && JSON.stringify(sizes) === JSON.stringify([16, 32, 48]);
  }
  check(`(vi) ${p} ICO`, decOk, `reserved=${reserved} type=${type} count=${count} sizes=[${sizes.join(',')}]`);
}

console.log('\nself-check results:');
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
if (errors.length) { console.error(`\n${errors.length} check(s) failed`); process.exit(1); }
console.log(`\nall checks passed (hex ${HEX}, symbol crop ${cropW}x${cropH})`);
