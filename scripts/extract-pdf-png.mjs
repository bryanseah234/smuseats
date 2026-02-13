/**
 * Extract first page of every PDF in floorplan/<building> folders to PNG images.
 * Uses mupdf for reliable rendering (handles embedded images, vectors, fonts).
 * Updates registry.json with room metadata.
 */
import mupdf from 'mupdf';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const FLOORPLAN_DIR = path.join(ROOT, 'floorplan');
const SOURCE_DIRS = ['Admin', 'LKCSB', 'SCIS1', 'SOA', 'SOE_SCIS2', 'SOSS_CIS', 'YPHSL'];
const outputDir = path.join(ROOT, 'public', 'maps');
const registryPath = path.join(ROOT, 'src', 'data', 'registry.json');

/** Target DPI for rendering (300 DPI gives ~3500px wide for A4 landscape) */
const RENDER_DPI = 300;

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const readRegistry = async () => {
  try {
    const raw = await fs.readFile(registryPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { rooms: [] };
  }
};

const main = async () => {
  const registry = await readRegistry();
  const existingById = new Map(
    Array.isArray(registry.rooms) ? registry.rooms.map((room) => [room.id, room]) : [],
  );

  const pdfEntries = [];

  for (const dir of SOURCE_DIRS) {
    const dirPath = path.join(FLOORPLAN_DIR, dir);
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

  await fs.mkdir(outputDir, { recursive: true });

  const rooms = [];
  let successCount = 0;

  for (const entry of pdfEntries) {
    try {
      const data = await fs.readFile(entry.pdfPath);
      const doc = mupdf.Document.openDocument(data, 'application/pdf');
      const page = doc.loadPage(0);

      const scale = RENDER_DPI / 72;
      const mat = mupdf.Matrix.scale(scale, scale);
      const pixmap = page.toPixmap(mat, mupdf.ColorSpace.DeviceRGB, false, true);
      const width = pixmap.getWidth();
      const height = pixmap.getHeight();
      const png = pixmap.asPNG();

      const outputPath = path.join(outputDir, `${entry.baseName}.png`);
      await fs.writeFile(outputPath, png);

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
        seats: existingSeats,
      });

      successCount += 1;
    } catch (err) {
      console.error(`Failed: ${entry.baseName} — ${err.message}`);
    }
  }

  await fs.writeFile(registryPath, `${JSON.stringify({ rooms }, null, 2)}\n`, 'utf-8');
  console.log(`Generated ${successCount} PNGs, updated registry.json.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
