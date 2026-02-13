#!/usr/bin/env node
/**
 * mask-outside-boundary.mjs
 *
 * For each room PNG, detects the red boundary line and masks everything
 * outside it with white. Saves masked copies alongside originals.
 *
 * Strategy:
 *   1. Find red pixels (R channel dominant, R > 150, R/total > 0.45)
 *   2. Create a binary mask of red boundary pixels
 *   3. Dilate the red mask to close small gaps in the boundary
 *   4. Flood-fill from edges (outside region) stopping at the red boundary
 *   5. Everything reached by flood-fill → white
 *   6. Red boundary pixels → white (the boundary itself is also removed)
 *
 * Output:
 *   - Originals stay in public/maps/ (untouched)
 *   - Masked copies go to public/maps-masked/
 *
 * Usage:
 *   node scripts/mask-outside-boundary.mjs           # process all
 *   node scripts/mask-outside-boundary.mjs --dry      # preview without writing
 *   node scripts/mask-outside-boundary.mjs --file "LKCSB Seminar Room 2-1.png"
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = process.cwd();
const MAPS_DIR = path.join(ROOT, 'public', 'maps');
const OUT_DIR = path.join(ROOT, 'public', 'maps-masked');
const DRY_RUN = process.argv.includes('--dry');
const SINGLE_FILE = process.argv.find((a, i) => process.argv[i - 1] === '--file');

// Red detection thresholds
const RED_MIN = 140;         // minimum R channel
const RED_RATIO = 0.42;      // R / (R+G+B) ratio
const GREEN_MAX = 120;       // max green/blue for red detection
const DILATE_R = 4;          // dilation radius for closing boundary gaps

function isRedPixel(r, g, b) {
  const total = r + g + b;
  if (total < 50) return false; // too dark
  return r >= RED_MIN && r / total >= RED_RATIO && g <= GREEN_MAX && b <= GREEN_MAX;
}

function dilate(mask, w, h, radius) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        out[y * w + x] = 1;
        continue;
      }
      let found = false;
      outer: for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            if (dx * dx + dy * dy <= radius * radius && mask[ny * w + nx]) {
              found = true;
            }
          }
        }
      }
      if (found) out[y * w + x] = 1;
    }
  }
  return out;
}

async function processImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Step 1: Build red pixel mask
  let redMask = new Uint8Array(w * h);
  let redCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isRedPixel(data[i], data[i + 1], data[i + 2])) {
        redMask[y * w + x] = 1;
        redCount++;
      }
    }
  }

  if (redCount < 100) {
    console.log(`  ⚠ Only ${redCount} red pixels found — skipping`);
    return { masked: false, reason: 'no red boundary' };
  }

  // Step 2: Dilate red mask to close gaps
  const boundary = dilate(redMask, w, h, DILATE_R);

  // Step 3: Flood-fill from edges (BFS), stopping at boundary
  const outside = new Uint8Array(w * h); // 1 = outside the boundary
  const queue = [];

  // Seed from all 4 edges
  for (let x = 0; x < w; x++) {
    if (!boundary[x]) { outside[x] = 1; queue.push(x); }                       // top
    const bot = (h - 1) * w + x;
    if (!boundary[bot]) { outside[bot] = 1; queue.push(bot); }                  // bottom
  }
  for (let y = 0; y < h; y++) {
    const left = y * w;
    if (!boundary[left] && !outside[left]) { outside[left] = 1; queue.push(left); }
    const right = y * w + (w - 1);
    if (!boundary[right] && !outside[right]) { outside[right] = 1; queue.push(right); }
  }

  // BFS flood fill
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;

    const neighbors = [];
    if (x > 0) neighbors.push(idx - 1);
    if (x < w - 1) neighbors.push(idx + 1);
    if (y > 0) neighbors.push(idx - w);
    if (y < h - 1) neighbors.push(idx + w);

    for (const n of neighbors) {
      if (!outside[n] && !boundary[n]) {
        outside[n] = 1;
        queue.push(n);
      }
    }
  }

  // Step 4: Paint outside region and red boundary white
  let whitened = 0;
  for (let idx = 0; idx < w * h; idx++) {
    if (outside[idx] || redMask[idx]) {
      const i = idx * 4;
      data[i] = 255;     // R
      data[i + 1] = 255; // G
      data[i + 2] = 255; // B
      // keep alpha
      whitened++;
    }
  }

  // Step 5: Convert to high-contrast B&W
  // Boost blacks/grays: apply gamma correction (< 1 darkens midtones)
  // then convert to grayscale
  const GAMMA = 0.45; // < 1 = darken midtones, boost contrast
  const gammaLUT = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    gammaLUT[i] = Math.round(255 * Math.pow(i / 255, GAMMA));
  }

  for (let idx = 0; idx < w * h; idx++) {
    if (outside[idx] || redMask[idx]) continue; // already white
    const i = idx * 4;
    // Convert to grayscale first
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    // Apply gamma to boost contrast (darken grays)
    const boosted = gammaLUT[gray];
    data[i] = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
  }

  ctx.putImageData(imageData, 0, 0);

  const outPath = path.join(OUT_DIR, path.basename(filePath));
  if (!DRY_RUN) {
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  }

  const pct = ((whitened / (w * h)) * 100).toFixed(1);
  return { masked: true, redCount, whitened, pct };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  let files;
  if (SINGLE_FILE) {
    files = [SINGLE_FILE];
  } else {
    files = fs.readdirSync(MAPS_DIR).filter((f) => f.endsWith('.png')).sort();
  }

  if (DRY_RUN) console.log('DRY RUN — no files will be written.\n');

  console.log(`Processing ${files.length} images...\n`);

  let success = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(MAPS_DIR, file);
    const name = file.replace('.png', '');
    process.stdout.write(`${name}... `);

    const result = await processImage(filePath);
    if (result.masked) {
      console.log(`✓ red=${result.redCount} masked=${result.pct}%`);
      success++;
    } else {
      console.log(`✗ ${result.reason}`);
      skipped++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Masked: ${success}/${files.length}`);
  console.log(`Skipped: ${skipped}/${files.length}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch(console.error);
