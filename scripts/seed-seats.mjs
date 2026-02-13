import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const registryPath = path.join(ROOT, 'src', 'data', 'registry.json');

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const pickProfile = (room) => {
  const name = `${room.name ?? ''}`.toLowerCase();
  const id = `${room.id ?? ''}`.toLowerCase();

  if (name.includes('auditorium') || name.includes('auditoriun') || name.includes('hall')) {
    return 'auditorium';
  }

  if (id.startsWith('admin-')) {
    return 'auditorium';
  }

  return 'seminar';
};

const createSeats = (room) => {
  const seed = hashString(room.id ?? room.name ?? 'room');
  const rng = mulberry32(seed);
  const profile = pickProfile(room);

  const params =
    profile === 'auditorium'
      ? {
          rows: Math.round(7 + rng() * 2),
          seatsPerRow: Math.round(12 + rng() * 6),
          radiusStart: 20 + rng() * 3,
          radiusStep: 5 + rng() * 2,
          baseY: 16 + rng() * 4,
          rowGap: 6 + rng() * 2,
          curveDepth: 10 + rng() * 4,
        }
      : {
          rows: Math.round(4 + rng() * 2),
          seatsPerRow: Math.round(7 + rng() * 3),
          radiusStart: 16 + rng() * 3,
          radiusStep: 6 + rng() * 2,
          baseY: 24 + rng() * 4,
          rowGap: 8 + rng() * 2,
          curveDepth: 6 + rng() * 3,
        };

  const centerX = 50 + (rng() - 0.5) * 4;
  const seats = [];
  let seatId = 1;

  for (let row = 0; row < params.rows; row += 1) {
    const rowCount = Math.max(4, params.seatsPerRow + (row % 2 === 0 ? 1 : 0));
    const startAngle = -60 - rng() * 5;
    const endAngle = 60 + rng() * 5;
    const angleStep = rowCount === 1 ? 0 : (endAngle - startAngle) / (rowCount - 1);
    const radius = params.radiusStart + row * params.radiusStep;
    const baseY = params.baseY + row * params.rowGap;

    for (let i = 0; i < rowCount; i += 1) {
      const angle = (startAngle + angleStep * i) * (Math.PI / 180);
      const x = clamp(centerX + Math.cos(angle) * radius, 5, 95);
      const y = clamp(baseY + (1 - Math.cos(angle)) * params.curveDepth, 6, 96);
      seats.push({ id: `${seatId}`, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
      seatId += 1;
    }
  }

  return seats;
};

const main = async () => {
  const raw = await fs.readFile(registryPath, 'utf-8');
  const registry = JSON.parse(raw);

  const rooms = Array.isArray(registry.rooms) ? registry.rooms : [];

  const nextRooms = rooms.map((room) => ({
    ...room,
    seats: createSeats(room),
  }));

  await fs.writeFile(registryPath, `${JSON.stringify({ rooms: nextRooms }, null, 2)}\n`, 'utf-8');
  console.log(`Seeded seats for ${nextRooms.length} rooms.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});