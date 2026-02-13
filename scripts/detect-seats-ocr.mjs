#!/usr/bin/env node
/**
 * detect-seats-ocr.mjs  (v4 — OCR digit detection)
 *
 * Uses Tesseract.js OCR on contrast-boosted B&W masked images to find
 * seat number digits and their positions.
 *
 * Strategy:
 *   1. Load masked B&W image from public/maps-masked/
 *   2. Upscale 2x for better digit recognition
 *   3. Threshold to pure B&W
 *   4. Run Tesseract OCR with digits-only whitelist, PSM 11 (sparse text)
 *   5. Extract word-level bounding boxes containing digits
 *   6. Scale positions back to original coordinates
 *   7. Cluster nearby detections, deduplicate
 *   8. Row-based filtering to remove noise
 *   9. Validate against extracted capacity
 *
 * Usage:
 *   node scripts/detect-seats-ocr.mjs                              # all rooms
 *   node scripts/detect-seats-ocr.mjs "LKCSB Seminar Room 2-1"     # one room
 *   DEBUG=1 node scripts/detect-seats-ocr.mjs                      # debug PNGs
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import Tesseract from 'tesseract.js';

const ROOT = process.cwd();
const MASKED_DIR = path.join(ROOT, 'public', 'maps-masked');
const REGISTRY_PATH = path.join(ROOT, 'src', 'data', 'registry.json');
const CAPACITY_PATH = path.join(ROOT, 'scripts', 'capacity-results.json');
const DEBUG = process.env.DEBUG === '1';
const DEBUG_DIR = path.join(ROOT, 'public', 'maps', 'debug');
const SINGLE = process.argv[2] || null;

/* ─── Tuneable parameters ─── */
const SCALE = 2;              // upscale factor for OCR
const BW_THRESHOLD = 180;     // grayscale threshold for B&W conversion
const BORDER_MARGIN = 50;     // ignore detections near image edge
const BOTTOM_EXCLUDE = 0.90;  // ignore bottom 10% (caption area)
const TOP_EXCLUDE = 0.04;     // ignore top 4%
const DEDUP_RADIUS = 20;      // merge detections within this distance
const ROW_TOLERANCE = 40;     // Y-tolerance for grouping into rows
const MIN_ROW_SIZE = 1;       // minimum seats in a row to keep (1 = no row filter)

/* ─── Helpers ─── */
function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function groupByRow(seats, tolerance) {
  const sorted = [...seats].sort((a, b) => a.y - b.y);
  const rows = [];
  const used = new Set();
  for (const seat of sorted) {
    if (used.has(seat)) continue;
    const row = [seat];
    used.add(seat);
    for (const other of sorted) {
      if (used.has(other)) continue;
      if (Math.abs(other.y - seat.y) <= tolerance) {
        row.push(other);
        used.add(other);
      }
    }
    rows.push(row);
  }
  return rows;
}

async function processRoom(worker, roomFile, capacity) {
  const filePath = path.join(MASKED_DIR, roomFile + '.png');
  if (!fs.existsSync(filePath)) {
    return { seats: [], stats: { error: 'file not found' } };
  }

  const buf = fs.readFileSync(filePath);
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;

  // --- Step 1: Upscale & threshold ---
  const upW = w * SCALE;
  const upH = h * SCALE;
  const canvas = createCanvas(upW, upH);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, upW, upH);

  const imageData = ctx.getImageData(0, 0, upW, upH);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const bw = gray < BW_THRESHOLD ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = bw;
  }
  ctx.putImageData(imageData, 0, 0);
  const ocrBuf = canvas.toBuffer('image/png');

  // --- Step 2: OCR ---
  const result = await worker.recognize(ocrBuf, {}, { blocks: true });

  // --- Step 3: Extract word bounding boxes ---
  const words = [];
  for (const block of result.data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const word of line.words || []) {
          if (/\d/.test(word.text)) {
            words.push({
              text: word.text,
              x: Math.round((word.bbox.x0 + word.bbox.x1) / 2 / SCALE),
              y: Math.round((word.bbox.y0 + word.bbox.y1) / 2 / SCALE),
              bw: Math.round((word.bbox.x1 - word.bbox.x0) / SCALE),
              bh: Math.round((word.bbox.y1 - word.bbox.y0) / SCALE),
              confidence: word.confidence,
            });
          }
        }
      }
    }
  }
  const totalWords = words.length;

  // --- Step 4: Position filtering ---
  let seats = words.filter(
    (s) =>
      s.x > BORDER_MARGIN &&
      s.x < w - BORDER_MARGIN &&
      s.y > h * TOP_EXCLUDE &&
      s.y < h * BOTTOM_EXCLUDE
  );
  const afterBorder = seats.length;

  // --- Step 5: Size filtering ---
  seats = seats.filter((s) => s.bw < 100 && s.bh < 60);
  const afterSize = seats.length;

  // --- Step 6: Deduplication ---
  const deduped = [];
  const usedIdx = new Set();
  for (let i = 0; i < seats.length; i++) {
    if (usedIdx.has(i)) continue;
    const group = [seats[i]];
    usedIdx.add(i);
    for (let j = i + 1; j < seats.length; j++) {
      if (usedIdx.has(j)) continue;
      if (dist(seats[i], seats[j]) < DEDUP_RADIUS) {
        group.push(seats[j]);
        usedIdx.add(j);
      }
    }
    group.sort((a, b) => b.confidence - a.confidence);
    deduped.push(group[0]);
  }
  seats = deduped;
  const afterDedup = seats.length;

  // --- Step 7: Row-based filtering ---
  const rows = groupByRow(seats, ROW_TOLERANCE);
  seats = rows.filter((r) => r.length >= MIN_ROW_SIZE).flat();
  const afterRow = seats.length;

  // --- Debug image ---
  if (DEBUG) {
    if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const dbgCanvas = createCanvas(w, h);
    const dbgCtx = dbgCanvas.getContext('2d');
    dbgCtx.drawImage(img, 0, 0);

    // Draw all OCR words in light blue
    for (const wd of words) {
      dbgCtx.strokeStyle = 'rgba(0, 150, 255, 0.4)';
      dbgCtx.lineWidth = 1;
      dbgCtx.strokeRect(wd.x - wd.bw / 2, wd.y - wd.bh / 2, wd.bw, wd.bh);
      dbgCtx.fillStyle = 'rgba(0, 150, 255, 0.6)';
      dbgCtx.font = '10px sans-serif';
      dbgCtx.fillText(wd.text, wd.x - wd.bw / 2, wd.y - wd.bh / 2 - 2);
    }

    // Draw kept seats as green circles
    for (const s of seats) {
      dbgCtx.beginPath();
      dbgCtx.arc(s.x, s.y, 10, 0, 2 * Math.PI);
      dbgCtx.strokeStyle = 'lime';
      dbgCtx.lineWidth = 2;
      dbgCtx.stroke();
      dbgCtx.fillStyle = 'lime';
      dbgCtx.font = 'bold 12px sans-serif';
      dbgCtx.fillText(s.text, s.x + 12, s.y + 4);
    }

    dbgCtx.fillStyle = 'red';
    dbgCtx.font = 'bold 32px sans-serif';
    dbgCtx.fillText(`OCR: ${seats.length} / Cap: ${capacity ?? '?'}`, 20, 40);

    fs.writeFileSync(
      path.join(DEBUG_DIR, roomFile + '_ocr.png'),
      dbgCanvas.toBuffer('image/png')
    );
  }

  return {
    seats,
    stats: { totalWords, afterBorder, afterSize, afterDedup, afterRow, final: seats.length },
  };
}

async function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  const capacities = JSON.parse(fs.readFileSync(CAPACITY_PATH, 'utf-8'));

  const worker = await Tesseract.createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: '11',
  });

  let rooms;
  if (SINGLE) {
    rooms = registry.rooms.filter((r) => {
      const name = r.image.replace(/^\/maps(-masked)?\//, '').replace(/\.png$/i, '');
      return name === SINGLE || r.id === SINGLE;
    });
    if (rooms.length === 0) {
      console.error(`Room not found: ${SINGLE}`);
      await worker.terminate();
      process.exit(1);
    }
  } else {
    rooms = registry.rooms;
  }

  console.log(`Processing ${rooms.length} rooms with OCR (${SCALE}x upscale)...\n`);

  let exact = 0, close = 0, off = 0;
  const results = [];
  let totalDetected = 0, totalCapacity = 0;

  for (const room of rooms) {
    const name = room.image.replace(/^\/maps(-masked)?\//, '').replace(/\.png$/i, '');
    const capacity = capacities[name] ?? room.capacity ?? null;

    process.stdout.write(`${name}... `);
    const { seats, stats } = await processRoom(worker, name, capacity);

    if (stats.error) {
      console.log(`x ${stats.error}`);
      continue;
    }

    const diff = capacity != null ? seats.length - capacity : null;
    const absDiff = diff != null ? Math.abs(diff) : Infinity;
    const diffStr = diff != null
      ? (diff === 0 ? 'EXACT' : (diff > 0 ? `+${diff}` : `${diff}`))
      : '?';

    if (diff === 0) exact++;
    else if (absDiff <= 3) close++;
    else off++;

    totalDetected += seats.length;
    totalCapacity += capacity ?? 0;

    console.log(
      `${seats.length} (cap=${capacity}, ${diffStr}) ` +
      `[w:${stats.totalWords} b:${stats.afterBorder} s:${stats.afterSize} d:${stats.afterDedup} r:${stats.afterRow}]`
    );

    room.seats = seats.map((s, i) => ({ id: String(i + 1), x: s.x, y: s.y }));
    results.push({ name, detected: seats.length, capacity, diff });
  }

  await worker.terminate();

  if (!SINGLE) {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    console.log(`\nUpdated registry.json`);
  }

  console.log(`\n========= Summary =========`);
  console.log(`Exact match:  ${exact}`);
  console.log(`Within +/-3:  ${close}`);
  console.log(`Off by more:  ${off}`);
  console.log(`Total detected: ${totalDetected}`);
  console.log(`Total capacity: ${totalCapacity}`);

  const sorted = results
    .filter((r) => r.diff != null)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  console.log(`\nWorst mismatches:`);
  sorted.slice(0, 15).forEach((r) => {
    console.log(`  ${r.name}: ${r.detected} vs ${r.capacity} (${r.diff > 0 ? '+' : ''}${r.diff})`);
  });
}

main().catch(console.error);
