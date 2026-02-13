#!/usr/bin/env node
/**
 * merge-seats.mjs — Hybrid: merge blob + OCR seat detections
 *
 * Per room, tries 3 strategies and picks whichever is closest to capacity:
 *   A) OCR only
 *   B) Blob only
 *   C) Union (merge both, dedup overlaps)
 *
 * Updates registry.json with the best result per room.
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'src', 'data', 'registry.json');
const CAPACITY_PATH = path.join(ROOT, 'scripts', 'capacity-results.json');
const OCR_PATH = path.join(ROOT, 'scripts', 'ocr-seats.json');
const BLOB_PATH = path.join(ROOT, 'scripts', 'blob-seats.json');

const MERGE_RADIUS = 25; // merge positions within this distance

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function mergePositions(setA, setB, radius) {
  // Start with all of setA, then add setB positions not near any in setA
  const merged = [...setA.map((s) => ({ ...s }))];
  for (const b of setB) {
    const tooClose = merged.some((m) => dist(m, b) < radius);
    if (!tooClose) {
      merged.push({ ...b });
    }
  }
  return merged;
}

function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  const capacities = JSON.parse(fs.readFileSync(CAPACITY_PATH, 'utf-8'));
  const ocrData = JSON.parse(fs.readFileSync(OCR_PATH, 'utf-8'));
  const blobData = JSON.parse(fs.readFileSync(BLOB_PATH, 'utf-8'));

  let totalOcr = 0,
    totalBlob = 0,
    totalMerge = 0,
    totalCap = 0;
  let exactA = 0,
    exactB = 0,
    exactC = 0;
  let closeA = 0,
    closeB = 0,
    closeC = 0;
  let pickedOcr = 0,
    pickedBlob = 0,
    pickedMerge = 0;
  let bestExact = 0,
    bestClose = 0,
    bestOff = 0;
  const results = [];

  for (const room of registry.rooms) {
    const name = room.image
      .replace(/^\/maps(-masked)?\//, '')
      .replace(/\.png$/i, '');
    const cap = capacities[name] ?? room.capacity ?? null;
    if (cap == null) continue;

    const ocr = ocrData[name] || [];
    const blob = blobData[name] || [];
    const merged = mergePositions(ocr, blob, MERGE_RADIUS);

    const diffOcr = Math.abs(ocr.length - cap);
    const diffBlob = Math.abs(blob.length - cap);
    const diffMerge = Math.abs(merged.length - cap);

    totalOcr += ocr.length;
    totalBlob += blob.length;
    totalMerge += merged.length;
    totalCap += cap;

    if (diffOcr === 0) exactA++;
    if (diffBlob === 0) exactB++;
    if (diffMerge === 0) exactC++;
    if (diffOcr <= 3) closeA++;
    if (diffBlob <= 3) closeB++;
    if (diffMerge <= 3) closeC++;

    // Pick best strategy per room
    let bestSeats, strategy;
    if (diffOcr <= diffBlob && diffOcr <= diffMerge) {
      bestSeats = ocr;
      strategy = 'OCR';
      pickedOcr++;
    } else if (diffBlob <= diffMerge) {
      bestSeats = blob;
      strategy = 'Blob';
      pickedBlob++;
    } else {
      bestSeats = merged;
      strategy = 'Merge';
      pickedMerge++;
    }

    const bestDiff = Math.abs(bestSeats.length - cap);
    if (bestDiff === 0) bestExact++;
    else if (bestDiff <= 3) bestClose++;
    else bestOff++;

    const diff = bestSeats.length - cap;
    const diffStr =
      diff === 0 ? 'EXACT' : diff > 0 ? `+${diff}` : `${diff}`;

    console.log(
      `${name}: ${strategy} → ${bestSeats.length} (cap=${cap}, ${diffStr}) ` +
        `[ocr:${ocr.length} blob:${blob.length} merge:${merged.length}]`
    );

    room.seats = bestSeats.map((s, i) => ({
      id: String(i + 1),
      x: s.x,
      y: s.y,
    }));
    results.push({ name, detected: bestSeats.length, capacity: cap, diff, strategy });
  }

  // Switch images back to maps-masked
  for (const room of registry.rooms) {
    room.image = room.image.replace('/maps/', '/maps-masked/');
  }

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log('\nUpdated registry.json (images → /maps-masked/)');

  console.log('\n========= Comparison =========');
  console.log(`             Exact  ±3   Total`);
  console.log(
    `OCR only:    ${String(exactA).padStart(4)}  ${String(closeA).padStart(3)}   ${totalOcr}`
  );
  console.log(
    `Blob only:   ${String(exactB).padStart(4)}  ${String(closeB).padStart(3)}   ${totalBlob}`
  );
  console.log(
    `Merged:      ${String(exactC).padStart(4)}  ${String(closeC).padStart(3)}   ${totalMerge}`
  );
  console.log(
    `Best-pick:   ${String(bestExact).padStart(4)}  ${String(bestClose).padStart(3)}   ${results.reduce((s, r) => s + r.detected, 0)}`
  );
  console.log(`Capacity:                   ${totalCap}`);
  console.log(
    `\nPicked: OCR=${pickedOcr}  Blob=${pickedBlob}  Merge=${pickedMerge}`
  );
  console.log(
    `Best-pick: ${bestExact} exact, ${bestClose} within ±3, ${bestOff} off`
  );

  const sorted = results
    .filter((r) => r.diff != null)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  console.log('\nWorst mismatches:');
  sorted.slice(0, 15).forEach((r) => {
    console.log(
      `  ${r.name}: ${r.detected} vs ${r.capacity} (${r.diff > 0 ? '+' : ''}${r.diff}) [${r.strategy}]`
    );
  });
}

main();
