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
const svgPath = join(repoRoot, 'src', 'app', 'icon.svg');
const svg = readFileSync(svgPath);

const targets = [
  { out: 'src/app/apple-icon.png', size: 180 },     // iOS home screen
  { out: 'public/icon-192.png',    size: 192 },     // Android chrome manifest
  { out: 'public/icon-512.png',    size: 512 },     // PWA install splash
];

for (const t of targets) {
  const png = await sharp(svg, { density: 300 })
    .resize(t.size, t.size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(repoRoot, t.out), png);
  console.log(`${t.out}  ${t.size}×${t.size}  ${(png.length / 1024).toFixed(1)} KB`);
}
