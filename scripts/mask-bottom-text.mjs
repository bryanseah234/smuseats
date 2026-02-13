#!/usr/bin/env node
/**
 * mask-bottom-text.mjs
 *
 * Paints a white rectangle over the bottom-left region of every room PNG
 * to cover building/room name text that interferes with seat detection.
 * Based on analysis: text sits at y=80-95%, x=0-65%.
 *
 * Usage:
 *   node scripts/mask-bottom-text.mjs          # process all PNGs
 *   node scripts/mask-bottom-text.mjs --dry    # preview without writing
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = process.cwd();
const MAPS_DIR = path.join(ROOT, 'public', 'maps');
const DRY_RUN = process.argv.includes('--dry');

// Region to mask: bottom 20% of height, left 70% of width
const Y_START_RATIO = 0.80;
const X_END_RATIO = 0.70;

async function maskImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const yStart = Math.floor(h * Y_START_RATIO);
  const xEnd = Math.floor(w * X_END_RATIO);

  // Fill with white to match background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, yStart, xEnd, h - yStart);

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  }

  const name = path.basename(filePath);
  console.log(`${DRY_RUN ? '[DRY] ' : '✓ '}${name}: masked y=${yStart}-${h} x=0-${xEnd}`);
}

async function main() {
  const files = fs.readdirSync(MAPS_DIR).filter((f) => f.endsWith('.png'));

  if (DRY_RUN) console.log('DRY RUN — no files will be modified.\n');

  let count = 0;
  for (const file of files) {
    await maskImage(path.join(MAPS_DIR, file));
    count++;
  }

  console.log(`\n${DRY_RUN ? 'Would process' : 'Processed'} ${count} images.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
