#!/usr/bin/env node
/**
 * detect-seats.mjs  (v3 — improved filtering of letters/labels)
 *
 * Strategy:
 *   1. Convert to grayscale, filter out red-dominant pixels (room boundaries)
 *   2. Aggressive threshold (<= 50 brightness) to isolate seat-number text
 *   3. Tiny dilation (radius 2) to connect character strokes, not merge cells
 *   4. Connected-component labelling
 *   5. Filter for digit-sized components (small bounding box, low pixel count)
 *   6. Cluster nearby text components into seat positions
 *   7. De-duplicate and sort in reading order
 *   8. Grid regularity filter (row neighbours)
 *   9. Gap-based outlier/header/label removal
 *  10. Intra-row consistency filter (split at large gaps)
 *
 * Optionally outputs debug images to public/maps/debug/ when DEBUG=1.
 *
 * Usage:
 *   node scripts/detect-seats.mjs              # process all rooms
 *   node scripts/detect-seats.mjs <roomId>     # process one room only
 *   DEBUG=1 node scripts/detect-seats.mjs      # also write debug PNGs
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'src', 'data', 'registry.json');
const DEBUG = process.env.DEBUG === '1';

/* ─── Tuneable parameters ─── */

// Phase 1: Binary mask
const BRIGHTNESS_THRESHOLD = 50;
const RED_RATIO_THRESHOLD = 0.45;

// Phase 2: Dilation
const DILATION_RADIUS = 2;

// Phase 3: Component filtering
const MIN_COMPONENT_DIM = 5;
const MAX_COMPONENT_DIM = 55;
const MIN_DARK_PIXELS = 15;
const MAX_DARK_PIXELS = 1500;
const MIN_ASPECT = 0.15;
const MAX_ASPECT = 6.0;

// Phase 4: Clustering
const CLUSTER_RADIUS = 45;

// Phase 5: Post-filtering
const BORDER_MARGIN = 40;
const BOTTOM_EXCLUDE = 0.92;
const TOP_EXCLUDE = 0.04;
const FINAL_MERGE_RADIUS = 40;

// Phase 8: Grid regularity
const ROW_TOLERANCE = 35;
const MIN_ROW_NEIGHBORS = 3;

// Phase 10: Intra-row consistency
const MAX_SEAT_GAP = 200;
const MIN_SEGMENT_SIZE = 2;

/* ─── Helpers ─── */

function groupByAxis(positions, tolerance, axis) {
  const sorted = [...positions].sort((a, b) => a[axis] - b[axis]);
  const groups = [];
  const used = new Set();
  for (const pos of sorted) {
    if (used.has(pos)) continue;
    const group = [pos];
    used.add(pos);
    for (const other of sorted) {
      if (used.has(other)) continue;
      if (Math.abs(other[axis] - pos[axis]) <= tolerance) {
        group.push(other);
        used.add(other);
      }
    }
    groups.push(group);
  }
  groups.sort((a, b) => {
    const avgA = a.reduce((s, p) => s + p[axis], 0) / a.length;
    const avgB = b.reduce((s, p) => s + p[axis], 0) / b.length;
    return avgA - avgB;
  });
  return groups;
}

function computeGaps(groups, axis) {
  const avgs = groups.map((g) => g.reduce((s, p) => s + p[axis], 0) / g.length);
  const gaps = [];
  for (let i = 1; i < avgs.length; i++) gaps.push(avgs[i] - avgs[i - 1]);
  return gaps;
}

function medianOf(arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Detect seat positions in a PNG image.
 * Returns array of { id, x, y } pixel coordinates.
 */
async function detectSeats(imagePath, roomId) {
  const buf = fs.readFileSync(imagePath);
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  /* ─── Phase 1: High-contrast binary mask ─── */
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const brightness = (r + g + b) / 3;
      const total = r + g + b;
      if (total > 0 && r / total > RED_RATIO_THRESHOLD && r > 100) continue;
      mask[y * w + x] = brightness <= BRIGHTNESS_THRESHOLD ? 1 : 0;
    }
  }

  /* ─── Phase 2: Small dilation to connect character strokes ─── */
  const dilated = new Uint8Array(w * h);
  const R = DILATION_RADIUS;
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      if (mask[y * w + x]) {
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            if (dx * dx + dy * dy <= R * R) {
              dilated[(y + dy) * w + (x + dx)] = 1;
            }
          }
        }
      }
    }
  }

  /* ─── Phase 3: Connected-component labelling (BFS) ─── */
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

  /* ─── Phase 4: Filter for digit-sized components ─── */
  const textBlobs = [];
  for (const c of components) {
    const bw = c.maxX - c.minX;
    const bh = c.maxY - c.minY;
    if (bw < MIN_COMPONENT_DIM || bh < MIN_COMPONENT_DIM) continue;
    if (bw > MAX_COMPONENT_DIM || bh > MAX_COMPONENT_DIM) continue;
    if (c.count < MIN_DARK_PIXELS || c.count > MAX_DARK_PIXELS) continue;
    const ar = bw / (bh || 1);
    if (ar < MIN_ASPECT || ar > MAX_ASPECT) continue;
    const cx = Math.round(c.minX + bw / 2);
    const cy = Math.round(c.minY + bh / 2);
    if (cx < BORDER_MARGIN || cx > w - BORDER_MARGIN) continue;
    if (cy < BORDER_MARGIN || cy > h - BORDER_MARGIN) continue;
    if (cy > h * BOTTOM_EXCLUDE) continue;
    if (cy < h * TOP_EXCLUDE) continue;
    textBlobs.push({ x: cx, y: cy, w: bw, h: bh, px: c.count });
  }

  /* ─── Phase 5: Cluster nearby text blobs into seat positions ─── */
  textBlobs.sort((a, b) => a.y - b.y || a.x - b.x);
  const used5 = new Set();
  const clusters = [];
  for (let i = 0; i < textBlobs.length; i++) {
    if (used5.has(i)) continue;
    let sx = textBlobs[i].x, sy = textBlobs[i].y, n = 1;
    used5.add(i);
    for (let j = i + 1; j < textBlobs.length; j++) {
      if (used5.has(j)) continue;
      const dx2 = textBlobs[j].x - textBlobs[i].x;
      const dy2 = textBlobs[j].y - textBlobs[i].y;
      if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < CLUSTER_RADIUS) {
        sx += textBlobs[j].x;
        sy += textBlobs[j].y;
        n++;
        used5.add(j);
      }
    }
    clusters.push({ x: Math.round(sx / n), y: Math.round(sy / n), n });
  }

  /* ─── Phase 6: Final de-duplication ─── */
  clusters.sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];
  const mergeUsed = new Set();
  for (let i = 0; i < clusters.length; i++) {
    if (mergeUsed.has(i)) continue;
    let sx = clusters[i].x, sy = clusters[i].y, nn = 1, tn = clusters[i].n;
    for (let j = i + 1; j < clusters.length; j++) {
      if (mergeUsed.has(j)) continue;
      const dx = clusters[j].x - clusters[i].x;
      const dy = clusters[j].y - clusters[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < FINAL_MERGE_RADIUS) {
        sx += clusters[j].x;
        sy += clusters[j].y;
        tn += clusters[j].n;
        nn++;
        mergeUsed.add(j);
      }
    }
    merged.push({ x: Math.round(sx / nn), y: Math.round(sy / nn), n: tn });
  }

  /* ─── Phase 7: Unused (reserved) ─── */

  /* ─── Phase 8: Grid regularity filter ─── */
  let gridFiltered = merged.filter((pos) => {
    let rowNeighbors = 0;
    for (const other of merged) {
      if (other === pos) continue;
      if (Math.abs(other.y - pos.y) <= ROW_TOLERANCE) rowNeighbors++;
    }
    return rowNeighbors >= MIN_ROW_NEIGHBORS;
  });

  /* ─── Phase 9: Remove outliers, label rows, and label columns ─── */
  // 1. Split at any large Y-gap (>3× median) and keep the largest cluster.
  // 2. Split at any large X-gap (>3× median) and keep the largest cluster.
  // 3. Remove boundary rows/columns that are likely column headers (A,B,C)
  //    or row-number labels via gap analysis + single-char blob-count (n≤1).
  if (gridFiltered.length > 10) {
    // Step 1: Split at large Y-gaps, keep the biggest row-cluster
    let rows = groupByAxis(gridFiltered, ROW_TOLERANCE, 'y');
    if (rows.length >= 3) {
      const rowGaps = computeGaps(rows, 'y');
      const medGap = medianOf(rowGaps);
      const threshold = medGap * 3;
      // Find all split points (gaps > threshold)
      const segments = [[]];
      segments[0].push(...rows[0]);
      for (let i = 0; i < rowGaps.length; i++) {
        if (rowGaps[i] > threshold) {
          segments.push([]);
        }
        segments[segments.length - 1].push(...rows[i + 1]);
      }
      if (segments.length > 1) {
        // Keep only the largest segment
        segments.sort((a, b) => b.length - a.length);
        const keepSet = new Set(segments[0]);
        gridFiltered = gridFiltered.filter((p) => keepSet.has(p));
      }
    }

    // Step 2: Remove edge rows that look like column headers (A,B,C)
    const COL_TOLERANCE = 30;
    const removePos = new Set();
    rows = groupByAxis(gridFiltered, ROW_TOLERANCE, 'y');
    if (rows.length >= 4) {
      const rowGaps = computeGaps(rows, 'y');
      const medGap = medianOf(rowGaps);
      const topRow = rows[0];
      if ((rowGaps[0] ?? 0) > medGap * 1.5 || topRow.every((p) => p.n <= 1))
        topRow.forEach((p) => removePos.add(p));
      const botRow = rows[rows.length - 1];
      if ((rowGaps[rowGaps.length - 1] ?? 0) > medGap * 1.5 || botRow.every((p) => p.n <= 1))
        botRow.forEach((p) => removePos.add(p));
    }

    // Step 3: Remove edge columns that look like row-number labels
    let step3 = gridFiltered.filter((p) => !removePos.has(p));
    const cols2 = groupByAxis(step3, COL_TOLERANCE, 'x');
    if (cols2.length >= 4) {
      const colGaps = computeGaps(cols2, 'x');
      const medColGap = medianOf(colGaps);
      const leftCol = cols2[0];
      if ((colGaps[0] ?? 0) > medColGap * 1.5 || leftCol.every((p) => p.n <= 1))
        leftCol.forEach((p) => removePos.add(p));
      const rightCol = cols2[cols2.length - 1];
      if ((colGaps[colGaps.length - 1] ?? 0) > medColGap * 1.5 || rightCol.every((p) => p.n <= 1))
        rightCol.forEach((p) => removePos.add(p));
    }

    gridFiltered = gridFiltered.filter((p) => !removePos.has(p));
  }

  /* ─── Phase 10: Intra-row consistency filter ─── */
  // Within each row, seats should be at close, regular spacing.
  // Huge gaps (>300 px) within a row indicate separate text regions.
  if (gridFiltered.length > 5) {
    const rowGroups = groupByAxis(gridFiltered, ROW_TOLERANCE, 'y');
    const kept = [];
    for (const row of rowGroups) {
      row.sort((a, b) => a.x - b.x);
      if (row.length <= 1) continue;
      const segments = [[row[0]]];
      for (let i = 1; i < row.length; i++) {
        if (row[i].x - row[i - 1].x > MAX_SEAT_GAP) {
          segments.push([row[i]]);
        } else {
          segments[segments.length - 1].push(row[i]);
        }
      }
      for (const seg of segments) {
        if (seg.length >= MIN_SEGMENT_SIZE) kept.push(...seg);
      }
    }
    gridFiltered = kept;
  }

  /* ─── Phase 11: Column consistency filter ─── */
  // Each position should align vertically with at least one other position.
  // Isolated x-positions are likely labels or annotations, not seats.
  if (gridFiltered.length > 5) {
    const COL_TOL = 30;
    gridFiltered = gridFiltered.filter((pos) => {
      let colNeighbors = 0;
      for (const other of gridFiltered) {
        if (other === pos) continue;
        if (Math.abs(other.x - pos.x) <= COL_TOL && Math.abs(other.y - pos.y) > ROW_TOLERANCE) {
          colNeighbors++;
        }
      }
      return colNeighbors >= 1;
    });
  }

  /* Sort in reading order: group into rows first, then left-to-right */
  gridFiltered.sort((a, b) => a.y - b.y);
  const sortedRows = [];
  const sortAssigned = new Set();
  for (const pos of gridFiltered) {
    if (sortAssigned.has(pos)) continue;
    const row = [pos];
    sortAssigned.add(pos);
    for (const other of gridFiltered) {
      if (sortAssigned.has(other)) continue;
      if (Math.abs(other.y - pos.y) <= ROW_TOLERANCE) {
        row.push(other);
        sortAssigned.add(other);
      }
    }
    row.sort((a, b) => a.x - b.x);
    sortedRows.push(row);
  }
  const orderedSeats = sortedRows.flat();
  const seats = orderedSeats.map((s, i) => ({ id: `${i + 1}`, x: s.x, y: s.y }));

  /* ─── Optional debug output ─── */
  if (DEBUG) {
    const debugDir = path.join(ROOT, 'public', 'maps', 'debug');
    fs.mkdirSync(debugDir, { recursive: true });

    const dbgCanvas = createCanvas(w, h);
    const dbgCtx = dbgCanvas.getContext('2d');
    const dbgData = dbgCtx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = dilated[i] ? 255 : 0;
      dbgData.data[i * 4] = v;
      dbgData.data[i * 4 + 1] = v;
      dbgData.data[i * 4 + 2] = v;
      dbgData.data[i * 4 + 3] = 255;
    }
    dbgCtx.putImageData(dbgData, 0, 0);
    dbgCtx.fillStyle = 'red';
    dbgCtx.strokeStyle = 'yellow';
    dbgCtx.lineWidth = 3;
    for (const s of seats) {
      dbgCtx.beginPath();
      dbgCtx.arc(s.x, s.y, 18, 0, Math.PI * 2);
      dbgCtx.fill();
      dbgCtx.stroke();
    }

    const overlayCanvas = createCanvas(w, h);
    const overlayCtx = overlayCanvas.getContext('2d');
    overlayCtx.drawImage(img, 0, 0);
    overlayCtx.fillStyle = 'rgba(0, 200, 0, 0.5)';
    overlayCtx.strokeStyle = 'rgba(0, 100, 0, 0.8)';
    overlayCtx.lineWidth = 3;
    for (const s of seats) {
      overlayCtx.beginPath();
      overlayCtx.arc(s.x, s.y, 18, 0, Math.PI * 2);
      overlayCtx.fill();
      overlayCtx.stroke();
    }

    const safeName = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(
      path.join(debugDir, `${safeName}_mask.png`),
      dbgCanvas.toBuffer('image/png'),
    );
    fs.writeFileSync(
      path.join(debugDir, `${safeName}_overlay.png`),
      overlayCanvas.toBuffer('image/png'),
    );
  }

  return seats;
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
      const seats = await detectSeats(imgPath, room.id);
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
