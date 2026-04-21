#!/usr/bin/env node
/**
 * validate-registry.mjs
 * Validates minimal shape constraints for src/data/registry.json.
 * Exits with non-zero status on validation failure.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'src', 'data', 'registry.json');

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
};

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const main = () => {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  const parsed = JSON.parse(raw);

  if (!parsed || !Array.isArray(parsed.rooms)) {
    fail('registry.rooms must be an array');
    return;
  }

  const seenRoomIds = new Set();
  let issues = 0;

  parsed.rooms.forEach((room, roomIndex) => {
    const roomPath = `rooms[${roomIndex}]`;

    if (typeof room.id !== 'string' || room.id.length === 0) {
      fail(`${roomPath}.id must be a non-empty string`);
      issues++;
    } else if (seenRoomIds.has(room.id)) {
      fail(`${roomPath}.id must be unique (duplicate: ${room.id})`);
      issues++;
    } else {
      seenRoomIds.add(room.id);
    }

    if (typeof room.image !== 'string' || room.image.length === 0) {
      fail(`${roomPath}.image must be a non-empty string`);
      issues++;
    }

    if (!isFiniteNumber(room.width) || room.width <= 0) {
      fail(`${roomPath}.width must be a positive number`);
      issues++;
    }

    if (!isFiniteNumber(room.height) || room.height <= 0) {
      fail(`${roomPath}.height must be a positive number`);
      issues++;
    }

    if (!Array.isArray(room.seats)) {
      fail(`${roomPath}.seats must be an array`);
      issues++;
      return;
    }

    const seenSeatIds = new Set();
    room.seats.forEach((seat, seatIndex) => {
      const seatPath = `${roomPath}.seats[${seatIndex}]`;

      if (typeof seat.id !== 'string' || seat.id.length === 0) {
        fail(`${seatPath}.id must be a non-empty string`);
        issues++;
      } else if (seenSeatIds.has(seat.id)) {
        fail(`${seatPath}.id must be unique within room (duplicate: ${seat.id})`);
        issues++;
      } else {
        seenSeatIds.add(seat.id);
      }

      if (!isFiniteNumber(seat.x) || seat.x < 0 || seat.x > room.width) {
        fail(`${seatPath}.x must be within [0, room.width]`);
        issues++;
      }

      if (!isFiniteNumber(seat.y) || seat.y < 0 || seat.y > room.height) {
        fail(`${seatPath}.y must be within [0, room.height]`);
        issues++;
      }
    });
  });

  if (issues === 0) {
    console.log(`✓ Registry validation passed (${parsed.rooms.length} rooms checked).`);
  }
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
