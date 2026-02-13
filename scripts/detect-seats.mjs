#!/usr/bin/env node
/**
 * detect-seats.mjs
 * Analyses each room PNG in public/maps/ and detects seat-icon positions
 * using connected-component labelling on dark pixels.
 *
 * Usage:
 *   node scripts/detect-seats.mjs            # process all rooms
 *   node scripts/detect-seats.mjs <roomId>   # process one room only
 *
 * Writes updated seats back into src/data/registry.json.
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'src', 'data', 'registry.json');

/* ─── Tuneable parameters ─── */
const BRIGHTNESS_THRESHOLD = 120; // pixels darker than this are "dark"
const DILATION_RADIUS = 4;        // px — merges chair outline + number text
const MIN_SIZE = 20;              // min bounding-box dimension (px)
const MAX_SIZE = 120;             // max bounding-box dimension (px)
const MIN_ASPECT = 0.4;
const MAX_ASPECT = 2.5;
const MIN_DARK_PIXELS = 400;      // minimum dark pixels in the component
const MAX_FILL_RATIO = 0.85;       // reject solid blobs (walls, furniture)
const BORDER_MARGIN = 30;         // ignore components near image edges
const MERGE_RADIUS = 50;          // px — de-duplicate centres within this distance

/**
 * Detect seat positions in a PNG image.
 * Returns array of {x, y} pixel coordinates.
 */
async function detectSeats(imagePath) {
  const buf = fs.readFileSync(imagePath);
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  /* 1. Binary mask of dark pixels */
  const isDark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      isDark[y * w + x] = brightness < BRIGHTNESS_THRESHOLD ? 1 : 0;
    }
  }

  /* 2. Dilate to merge nearby parts (chair outline + number) */
  const dilated = new Uint8Array(w * h);
  const R = DILATION_RADIUS;
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      if (isDark[y * w + x]) {
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            dilated[(y + dy) * w + (x + dx)] = 1;
          }
        }
      }
    }
  }

  /* 3. Connected-component labelling (BFS) */
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const components = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dilated[y * w + x] || labels[y * w + x]) continue;

      const label = nextLabel++;
      const stack = [[x, y]];
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
        const pi = cy * w + cx;
        if (!dilated[pi] || labels[pi]) continue;
        labels[pi] = label;
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        stack.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
      }

      components.push({ label, minX, minY, maxX, maxY, count });
    }
  }

  /* 4. Filter for seat-like components */
  const seats = [];
  for (const c of components) {
    const bw = c.maxX - c.minX;
    const bh = c.maxY - c.minY;
    const ar = bw / (bh || 1);
    const cx = Math.round(c.minX + bw / 2);
    const cy = Math.round(c.minY + bh / 2);

    // Size filter
    if (bw < MIN_SIZE || bw > MAX_SIZE || bh < MIN_SIZE || bh > MAX_SIZE) continue;
    // Aspect ratio filter
    if (ar < MIN_ASPECT || ar > MAX_ASPECT) continue;
    // Dark pixel count filter
    if (c.count < MIN_DARK_PIXELS) continue;
    // Fill ratio filter — reject solid dark blobs (walls, furniture)
    const area = (bw + 1) * (bh + 1);
    if (c.count / area > MAX_FILL_RATIO) continue;
    // Border exclusion
    if (cx < BORDER_MARGIN || cx > w - BORDER_MARGIN) continue;
    if (cy < BORDER_MARGIN || cy > h - BORDER_MARGIN) continue;
    // Bottom edge exclusion (legend/title area — typically bottom 8%)
    if (cy > h * 0.92) continue;

    seats.push({ x: cx, y: cy, w: bw, h: bh, px: c.count });
  }

  /* 5. De-duplicate: merge seats whose centres are within MERGE_RADIUS */
  seats.sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];
  const used = new Set();
  for (let i = 0; i < seats.length; i++) {
    if (used.has(i)) continue;
    let sx = seats[i].x, sy = seats[i].y, n = 1;
    for (let j = i + 1; j < seats.length; j++) {
      if (used.has(j)) continue;
      const dx = seats[j].x - seats[i].x;
      const dy = seats[j].y - seats[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < MERGE_RADIUS) {
        sx += seats[j].x;
        sy += seats[j].y;
        n++;
        used.add(j);
      }
    }
    merged.push({ x: Math.round(sx / n), y: Math.round(sy / n) });
  }

  /* 6. Sort by y then x (reading order) and assign IDs */
  merged.sort((a, b) => a.y - b.y || a.x - b.x);
  return merged.map((s, i) => ({ id: `${i + 1}`, x: s.x, y: s.y }));
}

/* ─── Main ─── */
async function main() {
  const targetRoomId = process.argv[2] || null;
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

  let processed = 0;
  let totalSeats = 0;

  for (const room of registry.rooms) {
    if (targetRoomId && room.id !== targetRoomId) continue;

    const imgPath = path.join(ROOT, 'public', room.image);
    if (!fs.existsSync(imgPath)) {
      console.log(`⚠  Skipping ${room.id}: image not found (${room.image})`);
      continue;
    }

    try {
      const seats = await detectSeats(imgPath);
      room.seats = seats;
      processed++;
      totalSeats += seats.length;
      console.log(`✓  ${room.id}: ${seats.length} seats detected`);
    } catch (err) {
      console.error(`✗  ${room.id}: ${err.message}`);
    }
  }

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
  console.log(`\nDone — ${processed} rooms processed, ${totalSeats} total seats detected.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
