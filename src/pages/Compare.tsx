/**
 * /compare – Visual comparison of image-enhancement methods.
 *
 * Renders a single floor-plan PNG through five different treatments so the
 * user can pick the one that looks best before we commit to a pipeline-wide
 * change.
 *
 * Methods shown:
 *   1. Original (no processing)
 *   2. CSS filter – contrast + brightness + saturate sliders (real-time)
 *   3. Gamma correction (canvas)
 *   4. Levels / linear contrast (canvas)
 *   5. Threshold – pure black/white (canvas)
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import registry from '../data/registry.json';

/* ------------------------------------------------------------------ */
/*  Pick a deterministic-but-varied sample image                       */
/* ------------------------------------------------------------------ */

const SAMPLE_IMAGE = (() => {
  const rooms = registry.rooms.filter((r) => r.image);
  const good = rooms.filter((r) => r.seats.length > 20);
  const pool = good.length > 0 ? good : rooms;
  const day = Math.floor(Date.now() / 86_400_000);
  return pool[day % pool.length];
})();

/* ------------------------------------------------------------------ */
/*  Canvas-based processors                                            */
/* ------------------------------------------------------------------ */

/** Apply gamma correction (gamma < 1 darkens midtones). */
function applyGamma(
  src: HTMLImageElement,
  canvas: HTMLCanvasElement,
  gamma: number,
) {
  const ctx = canvas.getContext('2d')!;
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  ctx.drawImage(src, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(255 * Math.pow(i / 255, gamma));
  }
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
  ctx.putImageData(imgData, 0, 0);
}

/** Linear contrast: out = clamp(slope * in + offset, 0, 255). */
function applyLevels(
  src: HTMLImageElement,
  canvas: HTMLCanvasElement,
  slope: number,
  offset: number,
) {
  const ctx = canvas.getContext('2d')!;
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  ctx.drawImage(src, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, Math.max(0, slope * d[i] + offset));
    d[i + 1] = Math.min(255, Math.max(0, slope * d[i + 1] + offset));
    d[i + 2] = Math.min(255, Math.max(0, slope * d[i + 2] + offset));
  }
  ctx.putImageData(imgData, 0, 0);
}

/** Threshold: pixels darker than t -> black, otherwise -> white. */
function applyThreshold(
  src: HTMLImageElement,
  canvas: HTMLCanvasElement,
  threshold: number,
) {
  const ctx = canvas.getContext('2d')!;
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  ctx.drawImage(src, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = gray < threshold ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
}

/* ------------------------------------------------------------------ */
/*  Reusable slider component                                          */
/* ------------------------------------------------------------------ */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}
const Slider = ({ label, value, min, max, step, onChange }: SliderProps) => (
  <label className="compare-slider">
    <span className="compare-slider__label">
      {label}: <strong>{value}</strong>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </label>
);

/* ------------------------------------------------------------------ */
/*  Canvas card (for methods 3-5)                                      */
/* ------------------------------------------------------------------ */

interface CanvasCardProps {
  title: string;
  description: string;
  srcImg: HTMLImageElement | null;
  processor: (src: HTMLImageElement, canvas: HTMLCanvasElement) => void;
  controls: React.ReactNode;
}

const CanvasCard = ({
  title,
  description,
  srcImg,
  processor,
  controls,
}: CanvasCardProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!srcImg || !canvasRef.current) return;
    processor(srcImg, canvasRef.current);
  }, [srcImg, processor]);

  return (
    <div className="compare-card">
      <div className="compare-card__header">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="compare-card__controls">{controls}</div>
      <div className="compare-card__preview">
        <canvas ref={canvasRef} style={{ width: '100%', height: 'auto' }} />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

const Compare = () => {
  const [srcImg, setSrcImg] = useState<HTMLImageElement | null>(null);

  /* CSS filter sliders */
  const [cssContrast, setCssContrast] = useState(1.0);
  const [cssBrightness, setCssBrightness] = useState(1.0);
  const [cssSaturate, setCssSaturate] = useState(1.0);

  /* Gamma slider */
  const [gamma, setGamma] = useState(0.45);

  /* Levels sliders */
  const [levelsSlope, setLevelsSlope] = useState(1.5);
  const [levelsOffset, setLevelsOffset] = useState(-30);

  /* Threshold slider */
  const [threshold, setThreshold] = useState(180);

  // Load the sample image once
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setSrcImg(img);
    img.src = SAMPLE_IMAGE.image;
  }, []);

  const roomLabel = useMemo(
    () => SAMPLE_IMAGE.name ?? SAMPLE_IMAGE.id,
    [],
  );

  /* Stable processor callbacks (depend on slider values) */
  const gammaProcessor = useCallback(
    (src: HTMLImageElement, c: HTMLCanvasElement) => applyGamma(src, c, gamma),
    [gamma],
  );
  const levelsProcessor = useCallback(
    (src: HTMLImageElement, c: HTMLCanvasElement) =>
      applyLevels(src, c, levelsSlope, levelsOffset),
    [levelsSlope, levelsOffset],
  );
  const thresholdProcessor = useCallback(
    (src: HTMLImageElement, c: HTMLCanvasElement) =>
      applyThreshold(src, c, threshold),
    [threshold],
  );

  return (
    <div className="compare-page">
      {/* Header */}
      <header className="compare-header">
        <Link to="/" className="btn btn--secondary compare-header__back">
          ← Home
        </Link>
        <div>
          <h1>Image Enhancement Comparison</h1>
          <p className="compare-header__sub">
            Sample: <strong>{roomLabel}</strong> — adjust sliders to preview
            each method
          </p>
        </div>
      </header>

      <div className="compare-grid">
        {/* ---- 1. Original ---- */}
        <div className="compare-card">
          <div className="compare-card__header">
            <h3>Original</h3>
            <p>No processing — baseline reference</p>
          </div>
          <div className="compare-card__controls" />
          <div className="compare-card__preview">
            <img
              src={SAMPLE_IMAGE.image}
              alt="Original"
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
        </div>

        {/* ---- 2. CSS Filter ---- */}
        <div className="compare-card">
          <div className="compare-card__header">
            <h3>CSS Filter</h3>
            <p>
              Pure CSS — instant, zero file changes. Applied via{' '}
              <code>filter:</code> property.
            </p>
          </div>
          <div className="compare-card__controls">
            <Slider
              label="Contrast"
              value={cssContrast}
              min={0.5}
              max={3.0}
              step={0.05}
              onChange={setCssContrast}
            />
            <Slider
              label="Brightness"
              value={cssBrightness}
              min={0.3}
              max={1.5}
              step={0.05}
              onChange={setCssBrightness}
            />
            <Slider
              label="Saturate"
              value={cssSaturate}
              min={0}
              max={2}
              step={0.05}
              onChange={setCssSaturate}
            />
          </div>
          <div className="compare-card__preview">
            <img
              src={SAMPLE_IMAGE.image}
              alt="CSS filter"
              style={{
                width: '100%',
                height: 'auto',
                filter: `contrast(${cssContrast}) brightness(${cssBrightness}) saturate(${cssSaturate})`,
              }}
            />
          </div>
        </div>

        {/* ---- 3. Gamma Correction ---- */}
        <CanvasCard
          title="Gamma Correction"
          description="Darkens midtones while preserving whites. Lower gamma = darker lines. (Would be baked into PNGs via script.)"
          srcImg={srcImg}
          processor={gammaProcessor}
          controls={
            <Slider
              label="Gamma"
              value={gamma}
              min={0.1}
              max={1.0}
              step={0.05}
              onChange={setGamma}
            />
          }
        />

        {/* ---- 4. Levels / Linear Contrast ---- */}
        <CanvasCard
          title="Levels (Linear Contrast)"
          description="slope * pixel + offset. Increases separation between light and dark. (Would be baked into PNGs via script.)"
          srcImg={srcImg}
          processor={levelsProcessor}
          controls={
            <>
              <Slider
                label="Slope"
                value={levelsSlope}
                min={0.5}
                max={3.0}
                step={0.1}
                onChange={setLevelsSlope}
              />
              <Slider
                label="Offset"
                value={levelsOffset}
                min={-128}
                max={64}
                step={1}
                onChange={setLevelsOffset}
              />
            </>
          }
        />

        {/* ---- 5. Threshold ---- */}
        <CanvasCard
          title="Threshold (Black / White)"
          description="Pixels below threshold → black, above → white. Aggressive but very crisp. (Would be baked into PNGs via script.)"
          srcImg={srcImg}
          processor={thresholdProcessor}
          controls={
            <Slider
              label="Threshold"
              value={threshold}
              min={50}
              max={240}
              step={1}
              onChange={setThreshold}
            />
          }
        />
      </div>
    </div>
  );
};

export default Compare;
