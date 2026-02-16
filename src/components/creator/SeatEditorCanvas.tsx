/**
 * SeatEditorCanvas.tsx — Interactive canvas for the seat editor.
 *
 * Similar to RoomCanvas but adds seat *creation* (click to place),
 * *drag-to-move*, and *delete* modes. The parent (EditSeats.tsx)
 * manages the seat array; this component only handles rendering
 * and pointer interactions, then calls back with new positions.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/* ---- public types ---- */

export interface EditableSeat {
  id: string;
  x: number;
  y: number;
}

/* ---- props ---- */

interface SeatEditorCanvasProps {
  imageUrl: string;
  width: number;
  height: number;
  seats: EditableSeat[];
  selectedSeatId: string | undefined;
  addMode: boolean;
  onAddSeat: (x: number, y: number) => void;
  onMoveSeat: (id: string, x: number, y: number) => void;
  onSelectSeat: (id: string | undefined) => void;
}

/* ---- component ---- */

export function SeatEditorCanvas({
  imageUrl,
  width,
  height,
  seats,
  selectedSeatId,
  addMode,
  onAddSeat,
  onMoveSeat,
  onSelectSeat,
}: SeatEditorCanvasProps) {
  const [viewport, setViewport] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [dragSeat, setDragSeat] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const pointerRef = useRef<{
    startX: number;
    startY: number;
    type: 'pan' | 'seat';
    seatId?: string;
    panStartX: number;
    panStartY: number;
  } | null>(null);
  const movedRef = useRef(false);

  /* reset viewport when room changes */
  useEffect(() => {
    setViewport({ zoom: 1, panX: 0, panY: 0 });
    setDragSeat(null);
    setImageLoaded(false);
  }, [imageUrl]);

  /* Preload floor-plan image */
  useEffect(() => {
    if (!imageUrl) { setImageLoaded(true); return; }
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageLoaded(true);
    img.src = imageUrl;
  }, [imageUrl]);

  /* native wheel handler — React synthetic wheel events are passive */
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setViewport((v) => ({
        ...v,
        zoom: Math.min(Math.max(v.zoom * factor, 0.15), 8),
      }));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  /* convert browser client coords → SVG viewBox coords */
  const clientToSvg = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = new DOMPoint(clientX, clientY);
      const svgPt = pt.matrixTransform(ctm.inverse());
      return { x: Math.round(svgPt.x), y: Math.round(svgPt.y) };
    },
    [],
  );

  /* ========  pointer handling  ======== */

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      movedRef.current = false;

      const seatEl = (e.target as Element).closest(
        '[data-seat-id]',
      ) as HTMLElement | null;

      if (seatEl) {
        onSelectSeat(seatEl.dataset.seatId!);
        pointerRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          type: 'seat',
          seatId: seatEl.dataset.seatId!,
          panStartX: viewport.panX,
          panStartY: viewport.panY,
        };
      } else {
        pointerRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          type: 'pan',
          panStartX: viewport.panX,
          panStartY: viewport.panY,
        };
      }

      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [viewport.panX, viewport.panY, onSelectSeat],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const info = pointerRef.current;
      if (!info) return;

      const dist = Math.hypot(
        e.clientX - info.startX,
        e.clientY - info.startY,
      );
      if (dist > 3) movedRef.current = true;
      if (!movedRef.current) return;

      setIsDragging(true);

      if (info.type === 'pan') {
        setViewport((v) => ({
          ...v,
          panX: info.panStartX + (e.clientX - info.startX),
          panY: info.panStartY + (e.clientY - info.startY),
        }));
      } else if (info.seatId) {
        const svgPt = clientToSvg(e.clientX, e.clientY);
        if (svgPt) {
          setDragSeat({
            id: info.seatId,
            x: Math.max(0, Math.min(width, svgPt.x)),
            y: Math.max(0, Math.min(height, svgPt.y)),
          });
        }
      }
    },
    [clientToSvg, width, height],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const info = pointerRef.current;

      /* click (no drag) */
      if (!movedRef.current && info) {
        if (info.type === 'pan') {
          if (addMode) {
            const svgPt = clientToSvg(e.clientX, e.clientY);
            if (
              svgPt &&
              svgPt.x >= 0 &&
              svgPt.x <= width &&
              svgPt.y >= 0 &&
              svgPt.y <= height
            ) {
              onAddSeat(svgPt.x, svgPt.y);
            }
          } else {
            onSelectSeat(undefined);
          }
        }
        /* seat click → selection already done in pointerDown */
      }

      /* commit seat drag */
      if (dragSeat && movedRef.current) {
        onMoveSeat(dragSeat.id, dragSeat.x, dragSeat.y);
      }

      setDragSeat(null);
      setIsDragging(false);
      pointerRef.current = null;
      movedRef.current = false;
    },
    [
      addMode,
      clientToSvg,
      width,
      height,
      onAddSeat,
      onSelectSeat,
      onMoveSeat,
      dragSeat,
    ],
  );

  /* ========  derived rendering data  ======== */

  const displaySeats = useMemo(() => {
    if (!dragSeat) return seats;
    return seats.map((s) =>
      s.id === dragSeat.id ? { ...s, x: dragSeat.x, y: dragSeat.y } : s,
    );
  }, [seats, dragSeat]);

  const transform = useMemo(
    () =>
      `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
    [viewport.panX, viewport.panY, viewport.zoom],
  );

  const frameClass = [
    'editor-canvas-frame',
    addMode && 'add-mode',
    isDragging && 'dragging',
  ]
    .filter(Boolean)
    .join(' ');

  if (!imageLoaded) {
    return (
      <div className="editor-canvas-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="canvas-loading-spinner" />
      </div>
    );
  }

  return (
    <div className="editor-canvas-wrapper">
      <div
        ref={frameRef}
        className={frameClass}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="editor-canvas-content"
          style={{
            position: 'absolute',
            inset: 0,
            transform,
            transformOrigin: 'top left',
          }}
        >
          <div
            style={{ position: 'relative', width: '100%', height: '100%' }}
          >
            <img
              src={imageUrl}
              alt="Floor plan"
              draggable={false}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />

            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
              }}
            >
              {displaySeats.map((seat) => (
                <g
                  key={seat.id}
                  className={`editor-seat${seat.id === selectedSeatId ? ' editor-seat--selected' : ''}`}
                  data-seat-id={seat.id}
                >
                  <circle cx={seat.x} cy={seat.y} r={18} />
                  <text
                    x={seat.x}
                    y={seat.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={12}
                    fill="#fff"
                    fontWeight={700}
                    pointerEvents="none"
                    style={{ userSelect: 'none' }}
                  >
                    {seat.id}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
