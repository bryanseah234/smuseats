#!/usr/bin/env node
/**
 * refine-seats.mjs — capacity-aware seat refinement
 *
 * Learns from manually-edited rooms and applies intelligent
 * detection + pruning to the remaining rooms.
 *
 * Rules:
 *   1. NEVER touch rooms where seats.length === capacity (manually edited)
 *   2. For rooms with too many seats: remove clusters + prune outliers
 *   3. For rooms with too few: re-detect with relaxed params, then prune
 *   4. Use spacing patterns from manually-edited rooms as reference
 *
 * Usage:
 *   node scripts/refine-seats.mjs              # process all unedited rooms
 *   node scripts/refine-seats.mjs <roomId>     # process one room
 *   DEBUG=1 node scripts/refine-seats.mjs      # write debug overlay PNGs
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'src', 'data', 'registry.json');
const DEBUG = process.env.DEBUG === '1';

/* ═══════════════════════════════════════
   Step 1: Learn from manually edited rooms
   ═══════════════════════════════════════ */

function learnFromEdited(registry) {
  const editedRooms = registry.rooms.filter(
    (r) => r.capacity && r.seats.length === r.capacity,
  );

  // Collect min near-neighbour distances
  const allMinDists = [];
  const densities = []; // seats per unit area

  for (const room of editedRooms) {
    if (room.seats.length < 3) continue;
    const seats = room.seats;
    const xs = seats.map((s) => s.x);
    const ys = seats.map((s) => s.y);
    const bboxW = Math.max(...xs) - Math.min(...xs);
    const bboxH = Math.max(...ys) - Math.min(...ys);
    const area = bboxW * bboxH;
    if (area > 0) densities.push(seats.length / area);

    for (const s of seats) {
      let best = Infinity;
      for (const t of seats) {
        if (s === t) continue;
        const d = Math.hypot(s.x - t.x, s.y - t.y);
        if (d < best) best = d;
      }
      allMinDists.push(best);
    }
  }

  allMinDists.sort((a, b) => a - b);

  // The 5th percentile of min-distances is our "too close" threshold
  const p5 = allMinDists[Math.floor(allMinDists.length * 0.05)] || 40;
  // Median density for estimating spacing
  densities.sort((a, b) => a - b);
  const medDensity = densities[Math.floor(densities.length / 2)] || 0;

  console.log(`  Learned from ${editedRooms.length} manually edited rooms:`);
  console.log(
    `  Min-distance 5th percentile: ${Math.round(p5)}px (too-close threshold)`,
  );
  console.log(`  Median density: ${(medDensity * 1e6).toFixed(2)} seats/Mpx`);

  return { minDistThreshold: p5, medDensity };
}

/* ═══════════════════════════════════════
   Step 2: Image-based seat detection
   ═══════════════════════════════════════ */

async function detectSeatsFromImage(imagePath, _roomId, params = {}) {
  const {
    brightnessThreshold = 50,
    redRatioThreshold = 0.45,
    dilationRadius = 2,
    minComponentDim = 5,
    maxComponentDim = 55,
    minDarkPixels = 15,
    maxDarkPixels = 1500,
    clusterRadius = 45,
    borderMargin = 40,
    bottomExclude = 0.92,
    topExclude = 0.04,
    mergeRadius = 40,
  } = params;

  const buf = fs.readFileSync(imagePath);
  const img = await loadImage(buf);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  /* Phase 1: Binary mask */
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      const brightness = (r + g + b) / 3;
      const total = r + g + b;
      if (total > 0 && r / total > redRatioThreshold && r > 100) continue;
      mask[y * w + x] = brightness <= brightnessThreshold ? 1 : 0;
    }
  }

  /* Phase 2: Dilation */
  const dilated = new Uint8Array(w * h);
  const R = dilationRadius;
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

  /* Phase 3: Connected components */
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const components = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dilated[y * w + x] || labels[y * w + x]) continue;
      const label = nextLabel++;
      const stack = [[x, y]];
      let minX = x,
        maxX = x,
        minY = y,
        maxY = y,
        count = 0;
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

  /* Phase 4: Filter digit-sized components */
  const textBlobs = [];
  for (const c of components) {
    const bw = c.maxX - c.minX;
    const bh = c.maxY - c.minY;
    if (bw < minComponentDim || bh < minComponentDim) continue;
    if (bw > maxComponentDim || bh > maxComponentDim) continue;
    if (c.count < minDarkPixels || c.count > maxDarkPixels) continue;
    const ar = bw / (bh || 1);
    if (ar < 0.15 || ar > 6.0) continue;
    const cx = Math.round(c.minX + bw / 2);
    const cy = Math.round(c.minY + bh / 2);
    if (cx < borderMargin || cx > w - borderMargin) continue;
    if (cy < borderMargin || cy > h - borderMargin) continue;
    if (cy > h * bottomExclude) continue;
    if (cy < h * topExclude) continue;
    textBlobs.push({ x: cx, y: cy, w: bw, h: bh, px: c.count });
  }

  /* Phase 5: Cluster nearby text blobs */
  textBlobs.sort((a, b) => a.y - b.y || a.x - b.x);
  const used5 = new Set();
  const clusters = [];
  for (let i = 0; i < textBlobs.length; i++) {
    if (used5.has(i)) continue;
    let sx = textBlobs[i].x,
      sy = textBlobs[i].y,
      n = 1;
    used5.add(i);
    for (let j = i + 1; j < textBlobs.length; j++) {
      if (used5.has(j)) continue;
      const dx = textBlobs[j].x - textBlobs[i].x;
      const dy = textBlobs[j].y - textBlobs[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < clusterRadius) {
        sx += textBlobs[j].x;
        sy += textBlobs[j].y;
        n++;
        used5.add(j);
      }
    }
    clusters.push({ x: Math.round(sx / n), y: Math.round(sy / n), n });
  }

  /* Phase 6: De-duplicate */
  clusters.sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];
  const mergeUsed = new Set();
  for (let i = 0; i < clusters.length; i++) {
    if (mergeUsed.has(i)) continue;
    let sx = clusters[i].x,
      sy = clusters[i].y,
      nn = 1,
      tn = clusters[i].n;
    for (let j = i + 1; j < clusters.length; j++) {
      if (mergeUsed.has(j)) continue;
      const dx = clusters[j].x - clusters[i].x;
      const dy = clusters[j].y - clusters[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < mergeRadius) {
        sx += clusters[j].x;
        sy += clusters[j].y;
        tn += clusters[j].n;
        nn++;
        mergeUsed.add(j);
      }
    }
    merged.push({ x: Math.round(sx / nn), y: Math.round(sy / nn), n: tn });
  }

  return merged;
}

/* ═══════════════════════════════════════
   Step 3: Intelligent pruning
   ═══════════════════════════════════════ */

/**
 * Score each seat by how well it fits with its neighbors.
 * Higher score = better fit = more likely a real seat.
 */
function scoreSeat(seat, allSeats, medianDist) {
  let score = 0;
  const dists = [];

  for (const other of allSeats) {
    if (other === seat) continue;
    const d = Math.hypot(seat.x - other.x, seat.y - other.y);
    dists.push(d);
  }
  dists.sort((a, b) => a - b);

  if (dists.length === 0) return -1000;

  // Nearest neighbor distance
  const nn1 = dists[0];

  // Reward: having neighbors at reasonable distances (close to median)
  const k = Math.min(5, dists.length);
  for (let i = 0; i < k; i++) {
    const ratio = dists[i] / medianDist;
    if (ratio >= 0.5 && ratio <= 2.5) score += 10;
    else if (ratio < 0.3) score -= 20; // way too close = bunched
    else score -= 5;
  }

  // Penalty: being too close to another seat (likely false positive cluster)
  if (nn1 < medianDist * 0.3) score -= 40;

  // Bonus: row alignment (how many seats share similar Y)
  const ROW_TOL = 35;
  const rowCount = allSeats.filter(
    (s) => s !== seat && Math.abs(s.y - seat.y) <= ROW_TOL,
  ).length;
  score += rowCount * 3;

  // Bonus: column alignment
  const COL_TOL = 30;
  const colCount = allSeats.filter(
    (s) =>
      s !== seat &&
      Math.abs(s.x - seat.x) <= COL_TOL &&
      Math.abs(s.y - seat.y) > ROW_TOL,
  ).length;
  score += colCount * 2;

  // Use blob count as tiebreaker — multi-digit = more likely a seat number
  score += Math.min(seat.n || 1, 3) * 2;

  return score;
}

function refineSeatList(candidates, capacity, minDistThreshold) {
  if (candidates.length <= 1) return candidates;

  // Merge any seats within MERGE_DIST — these are duplicate detections
  // from the same seat number (different digits/strokes detected separately).
  // 50px prevents the visual clustering the user sees.
  const MERGE_DIST = 50;

  // Step A: Merge close seats iteratively
  let seats = [...candidates].map((s) => ({
    x: s.x,
    y: s.y,
    n: s.n || 1,
  }));

  let merged = true;
  while (merged) {
    merged = false;
    let bestI = -1,
      bestJ = -1,
      bestD = Infinity;
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        const d = Math.hypot(seats[i].x - seats[j].x, seats[i].y - seats[j].y);
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestD < MERGE_DIST && bestI >= 0) {
      const a = seats[bestI],
        b = seats[bestJ];
      const totalN = a.n + b.n;
      const mx = Math.round((a.x * a.n + b.x * b.n) / totalN);
      const my = Math.round((a.y * a.n + b.y * b.n) / totalN);
      seats[bestI] = { x: mx, y: my, n: totalN };
      seats.splice(bestJ, 1);
      merged = true;
    }
  }

  // Step B: Compute median nearest-neighbor distance
  function medianNN(list) {
    const dists = [];
    for (const s of list) {
      let best = Infinity;
      for (const t of list) {
        if (s === t) continue;
        const d = Math.hypot(s.x - t.x, s.y - t.y);
        if (d < best) best = d;
      }
      if (best < Infinity) dists.push(best);
    }
    dists.sort((a, b) => a - b);
    return dists[Math.floor(dists.length / 2)] || 80;
  }

  // Step C: If still over capacity, prune lowest-scored seats
  if (seats.length > capacity) {
    const medDist = medianNN(seats);
    for (const s of seats) {
      s._score = scoreSeat(s, seats, medDist);
    }

    while (seats.length > capacity) {
      seats.sort((a, b) => a._score - b._score);
      seats.shift();
      const newMed = medianNN(seats);
      for (const s of seats) {
        s._score = scoreSeat(s, seats, newMed);
      }
    }
  }

  return seats;
}

/* ═══════════════════════════════════════
   Step 4: Process rooms
   ═══════════════════════════════════════ */

async function processRoom(room, learned) {
  const imgPath = path.join(ROOT, 'public', room.image);
  if (!fs.existsSync(imgPath)) return null;

  const capacity = room.capacity || room.seats.length;

  // Always combine existing seats with fresh detection(s).
  // This ensures we have enough candidates even after merge removes duplicates.
  const configs = [
    // Default
    {},
    // More sensitive threshold
    { brightnessThreshold: 65 },
    // Larger components allowed
    { maxComponentDim: 70, maxDarkPixels: 2000 },
    // Larger cluster radius
    { clusterRadius: 55, mergeRadius: 50 },
    // Combined relaxed
    { brightnessThreshold: 60, maxComponentDim: 65, clusterRadius: 50 },
  ];

  let allCandidates = [
    ...room.seats.map((s) => ({ x: s.x, y: s.y, n: 2 })),
  ];

  for (const config of configs) {
    try {
      const detected = await detectSeatsFromImage(imgPath, room.id, config);
      allCandidates.push(...detected);
    } catch {
      /* ignore config failures */
    }
  }

  // De-duplicate all candidates (pre-merge at 30px)
  const candidates = [];
  const usedC = new Set();
  allCandidates.sort((a, b) => b.n - a.n); // prefer higher blob count
  for (let i = 0; i < allCandidates.length; i++) {
    if (usedC.has(i)) continue;
    const c = allCandidates[i];
    let sx = c.x,
      sy = c.y,
      sn = c.n,
      cnt = 1;
    for (let j = i + 1; j < allCandidates.length; j++) {
      if (usedC.has(j)) continue;
      if (Math.hypot(allCandidates[j].x - c.x, allCandidates[j].y - c.y) < 30) {
        sx += allCandidates[j].x;
        sy += allCandidates[j].y;
        sn += allCandidates[j].n;
        cnt++;
        usedC.add(j);
      }
    }
    candidates.push({
      x: Math.round(sx / cnt),
      y: Math.round(sy / cnt),
      n: sn,
    });
  }

  // Apply capacity-aware pruning
  const refined = refineSeatList(
    candidates,
    capacity,
    learned.minDistThreshold,
  );

  // Sort in reading order and assign IDs
  refined.sort((a, b) => a.y - b.y || a.x - b.x);
  const ROW_TOL = 35;
  const sortedRows = [];
  const assigned = new Set();
  for (const pos of refined) {
    if (assigned.has(pos)) continue;
    const row = [pos];
    assigned.add(pos);
    for (const other of refined) {
      if (assigned.has(other)) continue;
      if (Math.abs(other.y - pos.y) <= ROW_TOL) {
        row.push(other);
        assigned.add(other);
      }
    }
    row.sort((a, b) => a.x - b.x);
    sortedRows.push(row);
  }
  const ordered = sortedRows.flat();
  const seats = ordered.map((s, i) => ({
    id: `${i + 1}`,
    x: s.x,
    y: s.y,
  }));

  // Debug overlay
  if (DEBUG) {
    const buf = fs.readFileSync(imgPath);
    const img = await loadImage(buf);
    const dbgCanvas = createCanvas(img.width, img.height);
    const dbgCtx = dbgCanvas.getContext('2d');
    dbgCtx.drawImage(img, 0, 0);

    // Draw all candidates as gray circles
    dbgCtx.fillStyle = 'rgba(128,128,128,0.3)';
    for (const c of candidates) {
      dbgCtx.beginPath();
      dbgCtx.arc(c.x, c.y, 14, 0, Math.PI * 2);
      dbgCtx.fill();
    }

    // Draw final seats as green circles with labels
    dbgCtx.fillStyle = 'rgba(0, 200, 0, 0.55)';
    dbgCtx.strokeStyle = 'rgba(0, 100, 0, 0.9)';
    dbgCtx.lineWidth = 3;
    for (const s of seats) {
      dbgCtx.beginPath();
      dbgCtx.arc(s.x, s.y, 18, 0, Math.PI * 2);
      dbgCtx.fill();
      dbgCtx.stroke();
    }

    dbgCtx.fillStyle = '#fff';
    dbgCtx.font = 'bold 14px sans-serif';
    dbgCtx.textAlign = 'center';
    dbgCtx.textBaseline = 'middle';
    for (const s of seats) {
      dbgCtx.fillText(s.id, s.x, s.y);
    }

    const debugDir = path.join(ROOT, 'public', 'maps', 'debug');
    fs.mkdirSync(debugDir, { recursive: true });
    const safeName = room.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(
      path.join(debugDir, `${safeName}_refined.png`),
      dbgCanvas.toBuffer('image/png'),
    );
  }

  return seats;
}

/* ═══════════════════════════════════════
   Main
   ═══════════════════════════════════════ */

async function main() {
  const targetRoomId = process.argv[2] || null;
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

  const CLUSTER_THRESHOLD = 50;

  // Helper: check if a room has any seat pair closer than threshold
  function hasCluster(room) {
    for (let i = 0; i < room.seats.length; i++) {
      for (let j = i + 1; j < room.seats.length; j++) {
        if (
          Math.hypot(
            room.seats[i].x - room.seats[j].x,
            room.seats[i].y - room.seats[j].y,
          ) < CLUSTER_THRESHOLD
        )
          return true;
      }
    }
    return false;
  }

  // Only consider a room "truly edited" if it matches capacity AND has no clusters
  const editedIds = new Set(
    registry.rooms
      .filter(
        (r) =>
          r.capacity &&
          r.seats.length === r.capacity &&
          !hasCluster(r),
      )
      .map((r) => r.id),
  );

  console.log(
    `\n🔍 Learning from ${editedIds.size} cluster-free edited rooms...\n`,
  );
  const learned = learnFromEdited(registry);

  let processed = 0;
  let skipped = 0;
  let improved = 0;
  let totalSeats = 0;

  for (const room of registry.rooms) {
    if (targetRoomId && room.id !== targetRoomId) continue;

    // Skip truly-edited rooms (match capacity + no clusters)
    if (editedIds.has(room.id) && !targetRoomId) {
      skipped++;
      totalSeats += room.seats.length;
      continue;
    }

    const oldCount = room.seats.length;
    const capacity = room.capacity || oldCount;

    try {
      const newSeats = await processRoom(room, learned);
      if (!newSeats) {
        console.log(`⚠  ${room.id}: image not found, skipped`);
        skipped++;
        totalSeats += room.seats.length;
        continue;
      }

      const newDiff = Math.abs(newSeats.length - capacity);
      const oldDiff = Math.abs(oldCount - capacity);

      room.seats = newSeats;
      processed++;
      totalSeats += newSeats.length;

      const marker = newDiff < oldDiff ? '✓' : newDiff === oldDiff ? '·' : '△';
      if (newDiff < oldDiff) improved++;

      console.log(
        `${marker}  ${room.id}: ${oldCount} → ${newSeats.length} seats (cap: ${capacity}, was off by ${oldDiff}, now ${newDiff})`,
      );
    } catch (err) {
      console.error(`✗  ${room.id}: ${err.message}`);
      totalSeats += room.seats.length;
    }
  }

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Processed: ${processed} rooms`);
  console.log(`  Skipped (edited): ${skipped} rooms`);
  console.log(`  Improved: ${improved} rooms`);
  console.log(`  Total seats: ${totalSeats}`);
  console.log(`═══════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
