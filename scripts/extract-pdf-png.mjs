import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROOT = process.cwd();
const OUTPUT_WIDTH = 2000;
const SOURCE_DIRS = ['Admin', 'LKCSB', 'SCIS1', 'SOA', 'SOE_SCIS2', 'SOSS_CIS', 'YPHSL'];
const outputDir = path.join(ROOT, 'public', 'maps');
const registryPath = path.join(ROOT, 'src', 'data', 'registry.json');

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const generateCurvedSeats = (seatCount) => {
  const rows = seatCount > 40 ? 6 : seatCount > 28 ? 5 : 4;
  const seatsPerRow = Math.round(seatCount / rows);
  const seats = [];
  let seatId = 1;

  for (let row = 0; row < rows; row += 1) {
    const rowCount = Math.max(4, seatsPerRow + (row % 2 === 0 ? 1 : 0));
    const startAngle = -60;
    const endAngle = 60;
    const angleStep = rowCount === 1 ? 0 : (endAngle - startAngle) / (rowCount - 1);
    const radius = 18 + row * 6;
    const baseY = 28 + row * 8;

    for (let i = 0; i < rowCount; i += 1) {
      const angle = (startAngle + angleStep * i) * (Math.PI / 180);
      const x = 50 + Math.cos(angle) * radius;
      const y = baseY + (1 - Math.cos(angle)) * 2;
      seats.push({ id: `${seatId}`, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
      seatId += 1;
    }
  }

  return seats;
};

const readRegistry = async () => {
  try {
    const raw = await fs.readFile(registryPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { rooms: [] };
  }
};

const writeRegistry = async (rooms) => {
  const payload = { rooms };
  await fs.writeFile(registryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
};

const main = async () => {
  const registry = await readRegistry();
  const existingById = new Map(
    Array.isArray(registry.rooms) ? registry.rooms.map((room) => [room.id, room]) : [],
  );

  const pdfEntries = [];

  for (const dir of SOURCE_DIRS) {
    const dirPath = path.join(ROOT, dir);
    let files = [];
    try {
      files = await fs.readdir(dirPath);
    } catch {
      continue;
    }

    files
      .filter((file) => file.toLowerCase().endsWith('.pdf'))
      .sort((a, b) => a.localeCompare(b))
      .forEach((file) => {
        const baseName = file.replace(/\.pdf$/i, '');
        pdfEntries.push({ building: dir, baseName, pdfPath: path.join(dirPath, file) });
      });
  }

  const duplicates = pdfEntries.reduce((acc, entry) => {
    acc.set(entry.baseName, (acc.get(entry.baseName) ?? 0) + 1);
    return acc;
  }, new Map());

  const duplicateNames = Array.from(duplicates.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  if (duplicateNames.length > 0) {
    console.warn(
      `Duplicate PDF base names detected: ${duplicateNames.join(', ')}. IDs will include building names.`,
    );
  }

  await fs.mkdir(outputDir, { recursive: true });

  const rooms = [];

  for (const entry of pdfEntries) {
    const data = await fs.readFile(entry.pdfPath);
    const pdf = await getDocument({ data: new Uint8Array(data), disableWorker: true }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = OUTPUT_WIDTH / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    const width = Math.round(scaledViewport.width);
    const height = Math.round(scaledViewport.height);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    const outputPath = path.join(outputDir, `${entry.baseName}.png`);
    await fs.writeFile(outputPath, canvas.toBuffer('image/png'));

    const id = slugify(`${entry.building}-${entry.baseName}`);
    const existing = existingById.get(id);
    const existingSeats = Array.isArray(existing?.seats) ? existing.seats : [];

    rooms.push({
      id,
      name: `${entry.building} ${entry.baseName}`,
      description: `${entry.building} floorplan`,
      image: `/maps/${entry.baseName}.png`,
      width,
      height,
      seats: existingSeats.length > 0 ? existingSeats : generateCurvedSeats(32),
    });
  }

  await writeRegistry(rooms);
  console.log(`Generated ${rooms.length} PNGs and updated registry.json.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
