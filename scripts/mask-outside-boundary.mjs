#!/usr/bin/env node
/**
 * mask-outside-boundary.mjs
 *
 * For each room PNG:
 *   1. White-out the bottom-left corner text (small rectangle, just enough
 *      to cover the room/building label).
 *   2. Apply levels adjustment (slope * pixel + offset).
 *   3. Apply threshold (pixel < T → black, else → white).
 *
 * No red-boundary detection or outside masking — keeps the full image.
 *
 * Output:
 *   - Originals stay in public/maps/ (untouched)
 *   - Processed copies go to public/maps-masked/
 *
 * Usage:
 *   node scripts/mask-outside-boundary.mjs                                # process all
 *   node scripts/mask-outside-boundary.mjs --dry                          # preview only
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

// --- Enhancement settings (chosen via /compare) ---
const SLOPE = 1;           // levels: multiply
const OFFSET = 4;          // levels: add
const THRESHOLD = 240;     // pixels < T → black, >= T → white

// --- Bottom-left text mask region ---
// Text sits roughly at y = 90-97%, x = 0-40% (compact rectangle)
const TEXT_Y_START = 0.90;
const TEXT_X_END = 0.40;

async function processImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Step 1: White-out bottom-left text
  const yStart = Math.floor(h * TEXT_Y_START);
  const xEnd = Math.floor(w * TEXT_X_END);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, yStart, xEnd, h - yStart);

  // Step 2 + 3: Read pixels, apply levels then threshold
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Grayscale luminance
    let gray = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
    );

    // Levels: slope * value + offset
    gray = Math.min(255, Math.max(0, SLOPE * gray + OFFSET));

    // Threshold
    const v = gray < THRESHOLD ? 0 : 255;

    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);

  const outPath = path.join(OUT_DIR, path.basename(filePath));
  if (!DRY_RUN) {
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  }

  return { success: true };
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

  console.log(`Processing ${files.length} images (slope=${SLOPE}, offset=${OFFSET}, threshold=${THRESHOLD})...\n`);

  let count = 0;
  for (const file of files) {
    const filePath = path.join(MAPS_DIR, file);
    const name = file.replace('.png', '');
    process.stdout.write(`${name}... `);

    await processImage(filePath);
    console.log('done');
    count++;
  }

  console.log(`\n--- Done: ${count}/${files.length} processed ---`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch(console.error);
