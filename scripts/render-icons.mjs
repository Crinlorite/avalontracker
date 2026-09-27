// One-shot: rasterizes src/app/icon.svg into the PNG sizes Next.js /
// iOS / Android / PWA expect. Run manually after editing icon.svg.
//
//   node scripts/render-icons.mjs
//
// Not part of the build because the SVG rarely changes and Sharp's
// native bindings can be slow on cold installs.

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
// Logo «el portal» (fuente: repo avalontracker-kmp, design/logo/generate.py):
//   src/app/icon.svg = public/icon.svg  → esquinas redondeadas (favicon SVG, BrandMark)
//   public/brand/avalon-logo.svg        → a sangre (iOS pone su máscara)
//   public/brand/avalon-logo-maskable.svg → contenido en el 80 % central (PWA «maskable»)
const read = (p) => readFileSync(join(repoRoot, p));

const targets = [
  { out: 'src/app/apple-icon.png', size: 180, src: 'public/brand/avalon-logo.svg' },          // iOS home screen
  { out: 'public/icon-192.png',    size: 192, src: 'public/brand/avalon-logo-maskable.svg' }, // Android chrome manifest
  { out: 'public/icon-512.png',    size: 512, src: 'public/brand/avalon-logo-maskable.svg' }, // PWA install splash
];

for (const t of targets) {
  const svg = read(t.src);
  const png = await sharp(svg, { density: 300 })
    .resize(t.size, t.size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(repoRoot, t.out), png);
  console.log(`${t.out}  ${t.size}×${t.size}  ${(png.length / 1024).toFixed(1)} KB`);
}

// favicon.ico (16/32/48) desde el icono redondeado: PNG embebidos en un ICO (formato ICONDIR).
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((n) => sharp(read('src/app/icon.svg'), { density: 300 }).resize(n, n).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((n, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(n, e); header.writeUInt8(n, e + 1); header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync(join(repoRoot, 'src/app/favicon.ico'), Buffer.concat([header, ...pngs]));
console.log('src/app/favicon.ico  16/32/48');
