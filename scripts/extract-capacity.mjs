#!/usr/bin/env node
/**
 * extract-capacity.mjs
 *
 * Reads the "SEATING CAPACITY: XX" text from the bottom-left region of each room PNG
 * using OCR (tesseract.js). Outputs a JSON mapping of filename → capacity.
 *
 * Usage:
 *   node scripts/extract-capacity.mjs              # extract all
 *   node scripts/extract-capacity.mjs --apply       # extract and update registry.json
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import Tesseract from 'tesseract.js';

const ROOT = process.cwd();
const MAPS_DIR = path.join(ROOT, 'public', 'maps');
const REGISTRY = path.join(ROOT, 'src', 'data', 'registry.json');
const APPLY = process.argv.includes('--apply');

// Region with capacity text: bottom 15% of height, left 70% of width
const Y_START = 0.85;
const X_END = 0.70;

async function extractCapacity(filePath) {
  const buf = fs.readFileSync(filePath);
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;

  // Crop to bottom-left region
  const cropY = Math.floor(h * Y_START);
  const cropW = Math.floor(w * X_END);
  const cropH = h - cropY;

  const canvas = createCanvas(cropW, cropH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // High-contrast preprocessing: convert to grayscale and threshold
  const imageData = ctx.getImageData(0, 0, cropW, cropH);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const bw = gray < 128 ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = bw;
  }
  ctx.putImageData(imageData, 0, 0);

  const pngBuf = canvas.toBuffer('image/png');
  
  const { data: { text } } = await Tesseract.recognize(pngBuf, 'eng', {
    logger: () => {},
  });

  // Look for "CAPACITY" followed by a number
  const match = text.match(/CAPACITY\s*[:;|]\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Fallback: look for any standalone number near "SEAT" text
  const fallback = text.match(/SEAT\w*\s+\w*\s*[:;|]?\s*(\d+)/i);
  if (fallback) {
    return parseInt(fallback[1], 10);
  }

  return null;
}

async function main() {
  const files = fs.readdirSync(MAPS_DIR).filter((f) => f.endsWith('.png')).sort();
  const results = {};
  let found = 0;
  let notFound = 0;

  console.log(`Processing ${files.length} room images...\n`);

  for (const file of files) {
    const filePath = path.join(MAPS_DIR, file);
    const capacity = await extractCapacity(filePath);
    const name = file.replace('.png', '');
    results[name] = capacity;
    
    if (capacity !== null) {
      console.log(`✓ ${name}: ${capacity}`);
      found++;
    } else {
      console.log(`✗ ${name}: NOT FOUND`);
      notFound++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Found: ${found}/${files.length}`);
  console.log(`Missing: ${notFound}/${files.length}`);

  // Save raw results
  const outPath = path.join(ROOT, 'scripts', 'capacity-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${outPath}`);

  if (APPLY) {
    // Update registry.json
    const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf-8'));
    let updated = 0;
    for (const room of registry.rooms) {
      const name = room.image.replace(/^\/maps\//, '').replace(/\.png$/i, '');
      if (results[name] !== null && results[name] !== undefined) {
        room.capacity = results[name];
        updated++;
      }
    }
    fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2));
    console.log(`Updated ${updated} rooms in registry.json`);
  }
}

main().catch(console.error);
