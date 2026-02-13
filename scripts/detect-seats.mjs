#!/usr/bin/env node
/**
 * detect-seats.mjs  (v2 — high-contrast text-based detection)
 *
 * Strategy:
 *   1. Convert to grayscale, filter out red-dominant pixels (room boundaries)
 *   2. Aggressive threshold (<= 80 brightness) to isolate seat-number text
 *   3. Tiny dilation (radius 2) to connect character strokes, not merge cells
 *   4. Connected-component labelling
 *   5. Filter for digit-sized components (small bounding box, low pixel count)
 *   6. Cluster nearby text components into seat positions
 *   7. De-duplicate and sort in reading order
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
const BRIGHTNESS_THRESHOLD = 50;   // only keep truly black text pixels
const RED_RATIO_THRESHOLD = 0.45;  // skip red-dominant pixels (room boundaries)

// Phase 2: Dilation — just enough to connect broken character strokes
const DILATION_RADIUS = 2;

// Phase 3: Component filtering — looking for individual digit/text blobs
const MIN_COMPONENT_DIM = 5;       // min bounding-box dimension (px)
const MAX_COMPONENT_DIM = 55;      // max bounding-box dimension (px)
const MIN_DARK_PIXELS = 15;        // min dark pixels in a character stroke
const MAX_DARK_PIXELS = 1500;      // max — reject walls/large shapes
const MIN_ASPECT = 0.15;           // allow tall narrow digits like "1"
const MAX_ASPECT = 6.0;

// Phase 4: Clustering — group nearby text blobs into seat positions
const CLUSTER_RADIUS = 45;         // px — digits within this distance = same seat

// Phase 5: Post-filtering
const BORDER_MARGIN = 40;          // ignore detections near image edges
const BOTTOM_EXCLUDE = 0.92;       // exclude bottom 8% (title/legend area)
const TOP_EXCLUDE = 0.04;          // exclude top 4% (title area)
const FINAL_MERGE_RADIUS = 40;     // de-duplicate final seat centres

// Phase 6: Grid regularity — seats appear in rows with many neighbours
const ROW_TOLERANCE = 35;          // px — positions within this Y-range = same row
const MIN_ROW_NEIGHBORS = 3;       // must have at least this many row-neighbours to keep

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

      // Skip red-dominant pixels (room boundary lines)
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

    // Border exclusion
    if (cx < BORDER_MARGIN || cx > w - BORDER_MARGIN) continue;
    if (cy < BORDER_MARGIN || cy > h - BORDER_MARGIN) continue;
    if (cy > h * BOTTOM_EXCLUDE) continue;
    if (cy < h * TOP_EXCLUDE) continue;

    textBlobs.push({ x: cx, y: cy, w: bw, h: bh, px: c.count });
  }

  /* ─── Phase 5: Cluster nearby text blobs into seat positions ─── */
  // Each seat cell may contain 1-2 digit text characters; cluster them
  textBlobs.sort((a, b) => a.y - b.y || a.x - b.x);
  const used = new Set();
  const clusters = [];

  for (let i = 0; i < textBlobs.length; i++) {
    if (used.has(i)) continue;
    let sx = textBlobs[i].x, sy = textBlobs[i].y, n = 1;
    used.add(i);

    for (let j = i + 1; j < textBlobs.length; j++) {
      if (used.has(j)) continue;
      const dx2 = textBlobs[j].x - textBlobs[i].x;
      const dy2 = textBlobs[j].y - textBlobs[i].y;
      const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (dist2 < CLUSTER_RADIUS) {
        sx += textBlobs[j].x;
        sy += textBlobs[j].y;
        n++;
        used.add(j);
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
    let sx = clusters[i].x, sy = clusters[i].y, nn = 1;
    for (let j = i + 1; j < clusters.length; j++) {
      if (mergeUsed.has(j)) continue;
      const dx = clusters[j].x - clusters[i].x;
      const dy = clusters[j].y - clusters[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < FINAL_MERGE_RADIUS) {
        sx += clusters[j].x;
        sy += clusters[j].y;
        nn++;
        mergeUsed.add(j);
      }
    }
    merged.push({ x: Math.round(sx / nn), y: Math.round(sy / nn) });
  }

  /* ─── Phase 7: Grid regularity filter ─── */
  // Seats appear in rows with many neighbours at similar Y.
  // Column headers, row labels, and title text are isolated/sparse.
  let gridFiltered = merged.filter((pos) => {
    let rowNeighbors = 0;
    for (const other of merged) {
      if (other === pos) continue;
      if (Math.abs(other.y - pos.y) <= ROW_TOLERANCE) {
        rowNeighbors++;
      }
    }
    return rowNeighbors >= MIN_ROW_NEIGHBORS;
  });

  /* ─── Phase 8: Exclude header/label rows at grid edges ─── */
  // Column headers (A, B, C...) appear at the top/bottom margins of the
  // detection bounding box. Row labels appear at left/right margins.
  // Remove detections in the outermost band of the grid bounding box.
  if (gridFiltered.length > 10) {
    const allX = gridFiltered.map((p) => p.x);
    const allY = gridFiltered.map((p) => p.y);
    const gMinY = Math.min(...allY);
    const gMaxY = Math.max(...allY);
    const gMinX = Math.min(...allX);
    const gMaxX = Math.max(...allX);
    const ySpan = gMaxY - gMinY;
    const xSpan = gMaxX - gMinX;

    // Group positions into rows by Y
    const rows = [];
    const rowAssigned = new Set();
    const sortedByY = [...gridFiltered].sort((a, b) => a.y - b.y);
    for (const pos of sortedByY) {
      if (rowAssigned.has(pos)) continue;
      const row = [pos];
      rowAssigned.add(pos);
      for (const other of sortedByY) {
        if (rowAssigned.has(other)) continue;
        if (Math.abs(other.y - pos.y) <= ROW_TOLERANCE) {
          row.push(other);
          rowAssigned.add(other);
        }
      }
      rows.push(row);
    }

    // Find the median row size (number of positions per row)
    const rowSizes = rows.map((r) => r.length).sort((a, b) => a - b);
    const medianRowSize = rowSizes[Math.floor(rowSizes.length / 2)];

    // Exclude rows at the very top/bottom that look like headers:
    // - within top/bottom 8% of Y span
    // - have roughly the same count as other rows (column headers)
    const topCutoff = gMinY + ySpan * 0.08;
    const bottomCutoff = gMaxY - ySpan * 0.06;
    const headerRows = new Set();
    for (let ri = 0; ri < rows.length; ri++) {
      const avgY = rows[ri].reduce((s, p) => s + p.y, 0) / rows[ri].length;
      if (avgY < topCutoff || avgY > bottomCutoff) {
        headerRows.add(ri);
      }
    }

    // Also exclude positions at far left/right edges that are likely row labels
    // (positions that are more than 3% outside the main column range)
    const leftCutoff = gMinX + xSpan * 0.03;
    const rightCutoff = gMaxX - xSpan * 0.03;

    gridFiltered = gridFiltered.filter((pos) => {
      // Check if in a header row
      for (const ri of headerRows) {
        if (rows[ri].includes(pos)) return false;
      }
      // Check if at extreme left/right (likely row labels)
      // Only exclude if it's the leftmost or rightmost in its row
      return true;
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

    // Draw the binary mask as white-on-black
    const dbgData = dbgCtx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = dilated[i] ? 255 : 0;
      dbgData.data[i * 4] = v;
      dbgData.data[i * 4 + 1] = v;
      dbgData.data[i * 4 + 2] = v;
      dbgData.data[i * 4 + 3] = 255;
    }
    dbgCtx.putImageData(dbgData, 0, 0);

    // Draw detected seat positions as red circles
    dbgCtx.fillStyle = 'red';
    dbgCtx.strokeStyle = 'yellow';
    dbgCtx.lineWidth = 3;
    for (const s of seats) {
      dbgCtx.beginPath();
      dbgCtx.arc(s.x, s.y, 18, 0, Math.PI * 2);
      dbgCtx.fill();
      dbgCtx.stroke();
    }

    // Also draw an overlay version on the original
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
