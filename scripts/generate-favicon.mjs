import fs from 'node:fs/promises';
import path from 'node:path';
import pngToIco from 'png-to-ico';
import { createCanvas } from '@napi-rs/canvas';

const ROOT = process.cwd();
const outputDir = path.join(ROOT, 'public');

const drawSeat = (ctx, size) => {
  const scale = size / 256;
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);

  // Shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.beginPath();
  ctx.ellipse(128 * scale, 214 * scale, 70 * scale, 16 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Backrest
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(72 * scale, 40 * scale, 88 * scale, 140 * scale, 24 * scale);
  ctx.fill();

  // Cushion
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.roundRect(64 * scale, 126 * scale, 128 * scale, 52 * scale, 18 * scale);
  ctx.fill();

  // Seat base
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(56 * scale, 170 * scale, 144 * scale, 22 * scale, 10 * scale);
  ctx.fill();

  // Armrest
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(164 * scale, 120 * scale, 36 * scale, 16 * scale, 8 * scale);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(88 * scale, 190 * scale, 18 * scale, 30 * scale, 8 * scale);
  ctx.roundRect(150 * scale, 190 * scale, 18 * scale, 30 * scale, 8 * scale);
  ctx.fill();

  // Accent
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 6 * scale;
  ctx.beginPath();
  ctx.moveTo(92 * scale, 88 * scale);
  ctx.lineTo(140 * scale, 88 * scale);
  ctx.stroke();
};

const createPng = (size) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawSeat(ctx, size);
  return canvas.toBuffer('image/png');
};

const main = async () => {
  await fs.mkdir(outputDir, { recursive: true });

  const png256 = createPng(256);
  const png64 = createPng(64);

  await fs.writeFile(path.join(outputDir, 'favicon.png'), png256);
  const ico = await pngToIco([png256, png64]);
  await fs.writeFile(path.join(outputDir, 'favicon.ico'), ico);

  console.log('Generated public/favicon.png and public/favicon.ico');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
