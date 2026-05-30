// ios-app/scripts/generate-icon.mjs
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const S = 1024; // icon size in px

// ── Geometry (all values in px at 1024×1024) ──────────────────────────────
// Card stack: centred, 54% wide × 60% tall
const CW = Math.round(S * 0.54);   // 553
const CH = Math.round(S * 0.60);   // 614
const CX = Math.round((S - CW) / 2); // 235  (left edge of front card)
const CY = Math.round((S - CH) / 2); // 205  (top edge of front card)
const CR = Math.round(S * 0.055);  // 56   (corner radius)

// Rotation pivot: bottom-centre of the front card
const PX = CX + CW / 2;           // 511.5
const PY = CY + CH;                // 819

// Task lines: inside front card with ~7% horizontal, ~6.5% vertical padding
const LP = Math.round(CW * 0.07);  // 39  (horizontal padding each side)
const LX = CX + LP;                // 274 (left edge of lines)
const LW = CW - LP * 2;            // 475 (max line width)
const LH = Math.round(S * 0.045); // 46  (line height)
const LR = Math.round(LH / 2);    // 23  (pill radius)

// Vertical distribution of 4 lines inside padded card interior
const topPad   = Math.round(CH * 0.065); // 40
const intH     = CH - topPad * 2;        // 534
const lineGap  = Math.round((intH - LH * 4) / 5); // 70
const line1Y   = CY + topPad + lineGap;
const line2Y   = line1Y + LH + lineGap;
const line3Y   = line2Y + LH + lineGap;
const line4Y   = line3Y + LH + lineGap;

// ── SVG ───────────────────────────────────────────────────────────────────
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background gradient: indigo → purple at 145° -->
    <linearGradient id="bg" x1="14%" y1="0%" x2="86%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <!-- Radial shine top-right -->
    <radialGradient id="shine" cx="82%" cy="18%" r="45%" fx="82%" fy="18%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <!-- Drop shadow for front card -->
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="${Math.round(S * 0.02)}" stdDeviation="${Math.round(S * 0.03)}" flood-color="#000000" flood-opacity="0.20"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  <!-- Shine overlay -->
  <rect width="${S}" height="${S}" fill="url(#shine)"/>

  <!-- Card back: rotated -11° around bottom-centre -->
  <rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="${CR}"
        fill="#ffffff" fill-opacity="0.18"
        transform="rotate(-11, ${PX}, ${PY})"/>

  <!-- Card middle: rotated -4° around bottom-centre -->
  <rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="${CR}"
        fill="#ffffff" fill-opacity="0.42"
        transform="rotate(-4, ${PX}, ${PY})"/>

  <!-- Card front: no rotation, drop shadow -->
  <rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="${CR}"
        fill="#ffffff" filter="url(#shadow)"/>

  <!-- Task line 1: Done (green, 65%) -->
  <rect x="${LX}" y="${line1Y}" width="${Math.round(LW * 0.65)}" height="${LH}" rx="${LR}" fill="#22c55e"/>
  <!-- Task line 2: In-progress (indigo, 88%) -->
  <rect x="${LX}" y="${line2Y}" width="${Math.round(LW * 0.88)}" height="${LH}" rx="${LR}" fill="#6366f1"/>
  <!-- Task line 3: To-do (grey, 75%) -->
  <rect x="${LX}" y="${line3Y}" width="${Math.round(LW * 0.75)}" height="${LH}" rx="${LR}" fill="#e2e8f0"/>
  <!-- Task line 4: To-do (grey, 50%) -->
  <rect x="${LX}" y="${line4Y}" width="${Math.round(LW * 0.50)}" height="${LH}" rx="${LR}" fill="#e2e8f0"/>
</svg>`;

// ── Output paths ──────────────────────────────────────────────────────────
const assetOut  = join(ROOT, 'assets', 'icon.png');
const xcodeOut  = join(ROOT, 'ios', 'Todo', 'Images.xcassets',
                       'AppIcon.appiconset', 'App-Icon-1024x1024@1x.png');

mkdirSync(join(ROOT, 'assets'), { recursive: true });

const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

await sharp(pngBuffer).toFile(assetOut);
await sharp(pngBuffer).toFile(xcodeOut);

console.log(`✓ icon.png written (${pngBuffer.length} bytes)`);
console.log(`  → ${assetOut}`);
console.log(`  → ${xcodeOut}`);
