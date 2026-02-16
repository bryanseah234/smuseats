/**
 * RoomCanvas.tsx — Zoomable, pannable floor-plan canvas.
 *
 * Renders the room's background image and overlays interactive Seat
 * dots. Supports pinch-to-zoom, scroll-to-zoom, drag-to-pan, and
 * programmatic zoom buttons. Exposes viewport state (offset + scale)
 * so the parent can synchronise UI controls.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { Seat, type SeatModel } from './Seat';

export interface RoomConfig {
  id: string;
  name?: string;
  imageUrl?: string;
  width: number;
  height: number;
  seats: SeatModel[];
}

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

interface RoomCanvasProps {
  room: RoomConfig;
  selectedSeatId?: string;
  seatRadius?: number;
  onSeatSelect?: (seat: SeatModel) => void;
  viewportState?: ViewportState;
  onViewportStateChange?: (state: ViewportState) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const WHEEL_ZOOM_SPEED = 0.001;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function RoomCanvas({
  room,
  selectedSeatId,
  seatRadius,
  onSeatSelect,
  viewportState,
  onViewportStateChange,
}: RoomCanvasProps) {
  const [localViewport, setLocalViewport] = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOriginRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  /** Track active pointers for pinch-to-zoom */
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number; midX: number; midY: number } | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);

  const viewport = viewportState ?? localViewport;

  const setViewport = useCallback(
    (next: ViewportState) => {
      if (!viewportState) {
        setLocalViewport(next);
      }
      onViewportStateChange?.(next);
    },
    [onViewportStateChange, viewportState],
  );

  useEffect(() => {
    if (!viewportState) {
      setLocalViewport({ zoom: 1, panX: 0, panY: 0 });
    }
  }, [room.id, viewportState]);

  /* ---------- Drag-to-pan ---------- */

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // Track pointer for pinch detection
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2) {
      // Two fingers down → start pinch, cancel any single-pointer drag
      setIsDragging(false);
      dragOriginRef.current = null;

      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      pinchRef.current = { dist, zoom: viewport.zoom, midX, midY };
      return;
    }

    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('.seat')) return;

    setIsDragging(true);
    dragOriginRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: viewport.panX,
      panY: viewport.panY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [viewport.panX, viewport.panY, viewport.zoom]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // Update tracked pointer position
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    // Pinch-to-zoom (two pointers)
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const scale = dist / pinchRef.current.dist;
      const newZoom = clamp(pinchRef.current.zoom * scale, MIN_ZOOM, MAX_ZOOM);

      // Zoom toward the midpoint between the two fingers
      const rect = frameRef.current?.getBoundingClientRect();
      if (rect) {
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const cx = midX - rect.left;
        const cy = midY - rect.top;
        const zoomRatio = newZoom / viewport.zoom;
        setViewport({
          zoom: newZoom,
          panX: cx - zoomRatio * (cx - viewport.panX),
          panY: cy - zoomRatio * (cy - viewport.panY),
        });
      }
      return;
    }

    // Single-pointer drag-to-pan
    if (!isDragging || !dragOriginRef.current) return;

    const deltaX = event.clientX - dragOriginRef.current.x;
    const deltaY = event.clientY - dragOriginRef.current.y;

    setViewport({
      ...viewport,
      panX: dragOriginRef.current.panX + deltaX,
      panY: dragOriginRef.current.panY + deltaY,
    });
  }, [isDragging, setViewport, viewport]);

  const endDrag = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event) {
      pointersRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
    // Reset pinch when fewer than 2 pointers remain
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    setIsDragging(false);
    dragOriginRef.current = null;
  }, []);

  /* ---------- Scroll-wheel zoom (scoped to canvas only) ---------- */

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    // Must be a native listener with { passive: false } to preventDefault
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      // Read current viewport from the ref-stable getter
      const cur = viewportState ?? localViewport;
      const delta = -e.deltaY * WHEEL_ZOOM_SPEED;
      const newZoom = clamp(cur.zoom + delta * cur.zoom, MIN_ZOOM, MAX_ZOOM);
      const zoomRatio = newZoom / cur.zoom;

      const next: ViewportState = {
        zoom: newZoom,
        panX: cx - zoomRatio * (cx - cur.panX),
        panY: cy - zoomRatio * (cy - cur.panY),
      };

      if (viewportState) {
        onViewportStateChange?.(next);
      } else {
        setLocalViewport(next);
        onViewportStateChange?.(next);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewportState, localViewport, onViewportStateChange]);

  const transform = useMemo(
    () => `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
    [viewport.panX, viewport.panY, viewport.zoom],
  );

  /** Block native image drag */
  const blockDrag = useCallback((e: React.DragEvent) => e.preventDefault(), []);

  return (
    <div className="room-canvas-viewer">
      <div
        ref={frameRef}
        className="room-canvas-frame"
        style={{
          position: 'relative',
          flex: '1 1 0%',
          minHeight: 0,
          overflow: 'hidden',
          touchAction: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragStart={blockDrag}
      >
        <div
          className="room-canvas-content"
          style={{
            position: 'absolute',
            inset: 0,
            transform,
            transformOrigin: 'top left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {room.imageUrl ? (
              <img
                className="floor-plan-bg"
                src={room.imageUrl}
                alt={room.name ?? room.id}
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
            ) : (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'repeating-linear-gradient(0deg, #f8fafc, #f8fafc 24px, #e2e8f0 24px, #e2e8f0 25px), repeating-linear-gradient(90deg, #f8fafc, #f8fafc 24px, #e2e8f0 24px, #e2e8f0 25px)',
                }}
              />
            )}

            <svg
              className="room-canvas-seat-layer"
              viewBox={`0 0 ${room.width} ${room.height}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              aria-hidden={false}
            >
              {room.seats.map((seat) => (
                <Seat
                  key={seat.id}
                  seat={seat}
                  selected={seat.id === selectedSeatId}
                  seatRadius={seatRadius}
                  onSelect={onSeatSelect}
                />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
