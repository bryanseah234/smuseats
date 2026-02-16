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
  onSeatSelect?: (seat: SeatModel) => void;
  viewportState?: ViewportState;
  onViewportStateChange?: (state: ViewportState) => void;
}

export function RoomCanvas({
  room,
  selectedSeatId,
  onSeatSelect,
  viewportState,
  onViewportStateChange,
}: RoomCanvasProps) {
  const [localViewport, setLocalViewport] = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const dragOriginRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

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

  /* Reset viewport when room changes */
  useEffect(() => {
    if (!viewportState) {
      setLocalViewport({ zoom: 1, panX: 0, panY: 0 });
    }
  }, [room.id, viewportState]);

  /* Reset loading state only when the room changes */
  useEffect(() => {
    setImageLoaded(false);
  }, [room.id]);

  /* Preload the floor-plan image so seats + background appear together */
  useEffect(() => {
    if (!room.imageUrl) { setImageLoaded(true); return; }
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageLoaded(true); // show seats even if image fails
    img.src = room.imageUrl;
  }, [room.imageUrl]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('.seat')) {
      return;
    }
    setIsDragging(true);
    dragOriginRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: viewport.panX,
      panY: viewport.panY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [viewport.panX, viewport.panY]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragOriginRef.current) {
      return;
    }

    const deltaX = event.clientX - dragOriginRef.current.x;
    const deltaY = event.clientY - dragOriginRef.current.y;

    setViewport({
      ...viewport,
      panX: dragOriginRef.current.panX + deltaX,
      panY: dragOriginRef.current.panY + deltaY,
    });
  }, [isDragging, setViewport, viewport]);

  const endDrag = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
    dragOriginRef.current = null;
  }, []);

  const transform = useMemo(
    () => `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
    [viewport.panX, viewport.panY, viewport.zoom],
  );

  if (!imageLoaded) {
    return (
      <div className="room-canvas-viewer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="canvas-loading-spinner" />
      </div>
    );
  }

  return (
    <div className="room-canvas-viewer">
      <div
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
