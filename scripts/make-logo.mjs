#!/usr/bin/env node
/**
 * make-logo.mjs
 * Creates a transparent-background version of favicon.png for the hero section.
 * Replaces white/near-white pixels with transparency.
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'public', 'favicon.png');
const OUTPUT = path.join(ROOT, 'public', 'logo.png');

async function main() {
  const buf = fs.readFileSync(INPUT);
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Sample corners to check background color
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  corners.forEach(([x, y]) => {
    const i = (y * w + x) * 4;
    console.log(`Corner (${x},${y}): rgba(${data[i]}, ${data[i+1]}, ${data[i+2]}, ${data[i+3]})`);
  });

  // Make white/near-white pixels transparent
  const THRESHOLD = 240; // pixels with all RGB channels above this become transparent
  let transparent = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r >= THRESHOLD && g >= THRESHOLD && b >= THRESHOLD) {
      data[i + 3] = 0; // set alpha to 0
      transparent++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  fs.writeFileSync(OUTPUT, canvas.toBuffer('image/png'));
  console.log(`\n✓ Created ${OUTPUT}`);
  console.log(`  Made ${transparent} pixels transparent out of ${w * h} total`);
}

main().catch(console.error);
