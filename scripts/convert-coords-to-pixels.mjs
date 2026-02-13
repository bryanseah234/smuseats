/**
 * One-time script to convert all seat coordinates in registry.json
 * from percentage space (0–100) to pixel space (0–width, 0–height).
 *
 * After this, coordinates directly correspond to positions in the
 * source PNG images, and the SVG viewBox should use the room's
 * actual pixel dimensions instead of "0 0 100 100".
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const registryPath = path.join(ROOT, 'src', 'data', 'registry.json');

const main = async () => {
  const raw = await fs.readFile(registryPath, 'utf-8');
  const registry = JSON.parse(raw);

  let totalSeats = 0;

  for (const room of registry.rooms) {
    room.seats = room.seats.map((seat) => {
      totalSeats += 1;
      return {
        id: seat.id,
        x: Math.round((seat.x * room.width) / 100 * 100) / 100,
        y: Math.round((seat.y * room.height) / 100 * 100) / 100,
      };
    });
  }

  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
  console.log(`Converted ${totalSeats} seats across ${registry.rooms.length} rooms from percentage to pixel coordinates.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
