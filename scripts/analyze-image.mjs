#!/usr/bin/env node
/**
 * analyze-image.mjs
 * Diagnostic: Analyze pixel characteristics of a room PNG
 * to help tune seat detection parameters.
 *
 * Usage: node scripts/analyze-image.mjs "public/maps/YPHSL SMU Hall B1-1.png"
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const imgPath = process.argv[2];
if (!imgPath) {
  console.error('Usage: node scripts/analyze-image.mjs <image-path>');
  process.exit(1);
}

const fullPath = path.resolve(imgPath);
const buf = fs.readFileSync(fullPath);
const img = await loadImage(buf);
const w = img.width;
const h = img.height;

console.log(`Image: ${path.basename(fullPath)}`);
console.log(`Size: ${w} × ${h}`);

const canvas = createCanvas(w, h);
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0);
const { data } = ctx.getImageData(0, 0, w, h);

// Histogram of brightness
const histogram = new Int32Array(256);
const rHist = new Int32Array(256);
const gHist = new Int32Array(256);
const bHist = new Int32Array(256);

for (let i = 0; i < w * h; i++) {
  const idx = i * 4;
  const r = data[idx], g = data[idx + 1], b = data[idx + 2];
  const brightness = Math.round((r + g + b) / 3);
  histogram[brightness]++;
  rHist[r]++;
  gHist[g]++;
  bHist[b]++;
}

// Find peaks
console.log('\n--- Brightness Histogram (ranges) ---');
const ranges = [
  [0, 30, 'Very dark (text/lines)'],
  [31, 80, 'Dark'],
  [81, 120, 'Dark-mid'],
  [121, 160, 'Mid'],
  [161, 200, 'Light-mid'],
  [201, 230, 'Light'],
  [231, 255, 'Very light (background)'],
];

for (const [lo, hi, label] of ranges) {
  let count = 0;
  for (let b = lo; b <= hi; b++) count += histogram[b];
  const pct = ((count / (w * h)) * 100).toFixed(2);
  console.log(`  ${label} [${lo}-${hi}]: ${count.toLocaleString()} px (${pct}%)`);
}

// Color analysis: check if seats are a specific color
console.log('\n--- Color spots check (sample points) ---');
// Sample the center area
const cx = Math.round(w / 2);
const cy = Math.round(h / 2);
const samplePoints = [
  [cx, cy],
  [cx - 200, cy],
  [cx + 200, cy],
  [cx, cy - 200],
  [cx, cy + 200],
];

for (const [x, y] of samplePoints) {
  const idx = (y * w + x) * 4;
  const r = data[idx], g = data[idx + 1], b = data[idx + 2];
  const brightness = Math.round((r + g + b) / 3);
  console.log(`  (${x}, ${y}): rgb(${r}, ${g}, ${b}) brightness=${brightness}`);
}

// Find the dominant colors
console.log('\n--- Top colors (quantized to 32-step) ---');
const colorBuckets = new Map();
for (let i = 0; i < w * h; i++) {
  const idx = i * 4;
  const r = Math.round(data[idx] / 32) * 32;
  const g = Math.round(data[idx + 1] / 32) * 32;
  const b = Math.round(data[idx + 2] / 32) * 32;
  const key = `${r},${g},${b}`;
  colorBuckets.set(key, (colorBuckets.get(key) ?? 0) + 1);
}

const sorted = [...colorBuckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [color, count] of sorted) {
  const pct = ((count / (w * h)) * 100).toFixed(2);
  console.log(`  rgb(${color}): ${count.toLocaleString()} px (${pct}%)`);
}

// Look specifically at seat number regions: small text characters are typically
// very dark pixels on a lighter background. Let's count how many pixels have
// brightness < 50 (likely text/numbers) vs brightness > 200 (background)
const veryDark = histogram.slice(0, 50).reduce((a, b) => a + b, 0);
const veryLight = histogram.slice(200).reduce((a, b) => a + b, 0);
console.log(`\nVery dark pixels (< 50 brightness): ${veryDark.toLocaleString()} (${((veryDark / (w * h)) * 100).toFixed(2)}%)`);
console.log(`Very light pixels (> 200 brightness): ${veryLight.toLocaleString()} (${((veryLight / (w * h)) * 100).toFixed(2)}%)`);
