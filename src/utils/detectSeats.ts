/**
 * Client-side seat detection using an offscreen canvas.
 * Mirrors the algorithm in scripts/detect-seats.mjs but runs in the browser.
 */

/* ─── Tuneable parameters ─── */
const BRIGHTNESS_THRESHOLD = 120;
const DILATION_RADIUS = 3;
const MIN_SIZE = 20;
const MAX_SIZE = 120;
const MIN_ASPECT = 0.4;
const MAX_ASPECT = 2.5;
const MIN_DARK_PIXELS = 600;
const BORDER_MARGIN = 30;

export interface DetectedSeat {
  id: string;
  x: number;
  y: number;
}

/**
 * Detect seat positions from an image URL.
 * Works entirely client-side via OffscreenCanvas / HTMLCanvasElement.
 */
export async function detectSeatsFromImage(imageUrl: string): Promise<DetectedSeat[]> {
  /* Load the image */
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = imageUrl;
  });

  const w = img.naturalWidth;
  const h = img.naturalHeight;

  /* Draw to offscreen canvas and extract pixel data */
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  /* 1. Binary mask of dark pixels */
  const isDark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      isDark[y * w + x] = brightness < BRIGHTNESS_THRESHOLD ? 1 : 0;
    }
  }

  /* 2. Dilate to merge nearby parts */
  const dilated = new Uint8Array(w * h);
  const R = DILATION_RADIUS;
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      if (isDark[y * w + x]) {
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            dilated[(y + dy) * w + (x + dx)] = 1;
          }
        }
      }
    }
  }

  /* 3. Connected-component labelling (BFS) */
  const labels = new Int32Array(w * h);
  let nextLabel = 1;

  interface Component {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    count: number;
  }

  const components: Component[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dilated[y * w + x] || labels[y * w + x]) continue;

      const label = nextLabel++;
      const stack: [number, number][] = [[x, y]];
      let minX = x,
        maxX = x,
        minY = y,
        maxY = y,
        count = 0;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
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

      void label;
      components.push({ minX, minY, maxX, maxY, count });
    }
  }

  /* 4. Filter for seat-like components */
  const seats: { x: number; y: number }[] = [];
  for (const c of components) {
    const bw = c.maxX - c.minX;
    const bh = c.maxY - c.minY;
    const ar = bw / (bh || 1);
    const cx = Math.round(c.minX + bw / 2);
    const cy = Math.round(c.minY + bh / 2);

    if (bw < MIN_SIZE || bw > MAX_SIZE || bh < MIN_SIZE || bh > MAX_SIZE) continue;
    if (ar < MIN_ASPECT || ar > MAX_ASPECT) continue;
    if (c.count < MIN_DARK_PIXELS) continue;
    if (cx < BORDER_MARGIN || cx > w - BORDER_MARGIN) continue;
    if (cy < BORDER_MARGIN || cy > h - BORDER_MARGIN) continue;
    if (cy > h * 0.92) continue;

    seats.push({ x: cx, y: cy });
  }

  /* 5. De-duplicate: merge centres within 30px */
  seats.sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: { x: number; y: number }[] = [];
  const used = new Set<number>();
  for (let i = 0; i < seats.length; i++) {
    if (used.has(i)) continue;
    let sx = seats[i].x,
      sy = seats[i].y,
      n = 1;
    for (let j = i + 1; j < seats.length; j++) {
      if (used.has(j)) continue;
      const dx = seats[j].x - seats[i].x;
      const dy = seats[j].y - seats[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < 30) {
        sx += seats[j].x;
        sy += seats[j].y;
        n++;
        used.add(j);
      }
    }
    merged.push({ x: Math.round(sx / n), y: Math.round(sy / n) });
  }

  /* 6. Sort reading-order and assign IDs */
  merged.sort((a, b) => a.y - b.y || a.x - b.x);
  return merged.map((s, i) => ({ id: `${i + 1}`, x: s.x, y: s.y }));
}
