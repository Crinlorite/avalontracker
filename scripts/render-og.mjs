// One-shot: builds public/og-image.svg with Inter embedded as base64
// data URIs, then rasterizes to public/og-image.png (1200×630).
//
//   node scripts/render-og.mjs
//
// Inter is fetched from rsms.me (canonical mirror) on first run and
// cached under scripts/.fonts/ so subsequent renders are offline.

import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const fontDir = join(__dirname, '.fonts');
mkdirSync(fontDir, { recursive: true });

const FONTS = [
  { name: 'Inter-Bold',   weight: 700, url: 'https://rsms.me/inter/font-files/Inter-Bold.woff2' },
  { name: 'Inter-Medium', weight: 500, url: 'https://rsms.me/inter/font-files/Inter-Medium.woff2' },
  { name: 'Inter-SemiBold', weight: 600, url: 'https://rsms.me/inter/font-files/Inter-SemiBold.woff2' },
];

async function getFont(f) {
  const file = join(fontDir, `${f.name}.woff2`);
  if (!existsSync(file)) {
    console.log(`fetching ${f.url}`);
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, buf);
  }
  return readFileSync(file);
}

function fontFace({ weight }, b64) {
  return `@font-face{font-family:'Inter';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}

const fontBytes = await Promise.all(FONTS.map(getFont));
const style = FONTS.map((f, i) => fontFace(f, fontBytes[i].toString('base64'))).join('');

const logoB64 = (await sharp(readFileSync(join(repoRoot, 'public/icon.svg')), { density: 300 }).resize(360, 360).png().toBuffer()).toString('base64');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Avalon Tracker — Caminos de Avalon en vivo para tu clan">
  <defs>
    <style>${style}</style>

    <radialGradient id="bg" cx="50%" cy="45%" r="70%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="60%" stop-color="#0b0a2e"/>
      <stop offset="100%" stop-color="#030712"/>
    </radialGradient>

    <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#a5b4fc"/>
      <stop offset="55%" stop-color="#c4b5fd"/>
      <stop offset="100%" stop-color="#e9d5ff"/>
    </linearGradient>

    <radialGradient id="portalGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f5d0fe"/>
      <stop offset="45%" stop-color="#c084fc"/>
      <stop offset="100%" stop-color="#6b21a8" stop-opacity="0"/>
    </radialGradient>

    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <filter id="portalGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="14" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#312e81" stroke-width="0.5" stroke-opacity="0.25"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>

  <!-- Roads graph: top band. Dimmed (stroke-opacity 0.28) so it
       recedes behind the wordmark instead of competing for attention. -->
  <g stroke="#6366f1" stroke-width="1.5" fill="none" stroke-opacity="0.28">
    <line x1="90"   y1="140" x2="215"  y2="95"/>
    <line x1="215"  y1="95"  x2="345"  y2="175"/>
    <line x1="345"  y1="175" x2="475"  y2="105"/>
    <line x1="475"  y1="105" x2="605"  y2="195"/>
    <line x1="605"  y1="195" x2="745"  y2="130"/>
    <line x1="745"  y1="130" x2="875"  y2="210"/>
    <line x1="875"  y1="210" x2="1005" y2="115"/>
    <line x1="1005" y1="115" x2="1120" y2="210"/>
    <line x1="215"  y1="95"  x2="345"  y2="55"/>
    <line x1="475"  y1="105" x2="560"  y2="50"/>
    <line x1="745"  y1="130" x2="820"  y2="60"/>
    <line x1="1005" y1="115" x2="1090" y2="65"/>
  </g>
  <g fill="#818cf8" opacity="0.55">
    <circle cx="90"   cy="140" r="4"/>
    <circle cx="215"  cy="95"  r="4"/>
    <circle cx="345"  cy="175" r="4"/>
    <circle cx="475"  cy="105" r="4"/>
    <circle cx="605"  cy="195" r="4.5"/>
    <circle cx="745"  cy="130" r="4"/>
    <circle cx="875"  cy="210" r="4"/>
    <circle cx="1005" cy="115" r="4"/>
    <circle cx="1120" cy="210" r="4"/>
    <circle cx="345"  cy="55"  r="3" opacity="0.6"/>
    <circle cx="560"  cy="50"  r="3" opacity="0.6"/>
    <circle cx="820"  cy="60"  r="3" opacity="0.6"/>
    <circle cx="1090" cy="65"  r="3" opacity="0.6"/>
  </g>

  <!-- Roads graph: bottom band -->
  <g stroke="#6366f1" stroke-width="1.5" fill="none" stroke-opacity="0.28">
    <line x1="75"   y1="500" x2="205"  y2="555"/>
    <line x1="205"  y1="555" x2="355"  y2="490"/>
    <line x1="355"  y1="490" x2="495"  y2="570"/>
    <line x1="495"  y1="570" x2="635"  y2="495"/>
    <line x1="635"  y1="495" x2="770"  y2="560"/>
    <line x1="770"  y1="560" x2="910"  y2="490"/>
    <line x1="910"  y1="490" x2="1045" y2="555"/>
    <line x1="1045" y1="555" x2="1155" y2="490"/>
    <line x1="205"  y1="555" x2="275"  y2="595"/>
    <line x1="495"  y1="570" x2="420"  y2="600"/>
    <line x1="770"  y1="560" x2="690"  y2="605"/>
    <line x1="1045" y1="555" x2="975"  y2="600"/>
  </g>
  <g fill="#818cf8" opacity="0.55">
    <circle cx="75"   cy="500" r="4"/>
    <circle cx="205"  cy="555" r="4"/>
    <circle cx="355"  cy="490" r="4"/>
    <circle cx="495"  cy="570" r="4"/>
    <circle cx="635"  cy="495" r="4"/>
    <circle cx="770"  cy="560" r="4.5"/>
    <circle cx="910"  cy="490" r="4"/>
    <circle cx="1045" cy="555" r="4"/>
    <circle cx="1155" cy="490" r="4"/>
    <circle cx="275"  cy="595" r="3" opacity="0.6"/>
    <circle cx="420"  cy="600" r="3" opacity="0.6"/>
    <circle cx="690"  cy="605" r="3" opacity="0.6"/>
    <circle cx="975"  cy="600" r="3" opacity="0.6"/>
  </g>

  <!-- Logo «el portal» (public/icon.svg) a la izquierda del título -->
  <image href="data:image/png;base64,${logoB64}" x="52" y="228" width="176" height="176"/>

  <!-- Wordmark block -->
  <g font-family="Inter, 'Segoe UI', system-ui, -apple-system, sans-serif">
    <text x="692" y="253" text-anchor="middle"
          font-size="21" font-weight="600"
          fill="#a5b4fc" letter-spacing="8" opacity="0.92">
      ALBION ONLINE · CLAN COMPANION
    </text>

    <text x="692" y="362" text-anchor="middle"
          font-size="118" font-weight="700"
          fill="url(#titleGrad)">
      Avalon Tracker
    </text>

    <text x="692" y="430" text-anchor="middle"
          font-size="33" font-weight="500"
          fill="#cbd5e1" letter-spacing="1">
      Caminos de Avalon en vivo · coordinación de clan
    </text>
  </g>

  <!-- Brand footer -->
  <g font-family="Inter, 'Segoe UI', system-ui, -apple-system, sans-serif" text-anchor="middle">
    <text x="600" y="595" font-size="19" font-weight="600"
          fill="#64748b" letter-spacing="6">
      BY CRINTECH STUDIOS · avalontracker.app
    </text>
  </g>
</svg>`;

writeFileSync(join(repoRoot, 'public/og-image.svg'), svg);
console.log(`og-image.svg  (${(svg.length / 1024).toFixed(1)} KB with embedded fonts)`);

const png = await sharp(Buffer.from(svg), { density: 200 })
  .resize(1200, 630)
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(join(repoRoot, 'public/og-image.png'), png);
console.log(`og-image.png  1200×630  ${(png.length / 1024).toFixed(1)} KB`);
