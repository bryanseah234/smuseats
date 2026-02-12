import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';

import { Seat, type SeatModel } from './Seat';

export interface RoomConfig {
  id: string;
  name?: string;
  imageUrl: string;
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

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function RoomCanvas({
  room,
  selectedSeatId,
  onSeatSelect,
  viewportState,
  onViewportStateChange,
}: RoomCanvasProps) {
  const [localViewport, setLocalViewport] = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
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

  useEffect(() => {
    if (!viewportState) {
      setLocalViewport({ zoom: 1, panX: 0, panY: 0 });
    }
  }, [room.id, viewportState]);

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

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const zoom = clamp(viewport.zoom + direction * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
      setViewport({ ...viewport, zoom });
    },
    [setViewport, viewport],
  );

  const transform = useMemo(
    () => `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
    [viewport.panX, viewport.panY, viewport.zoom],
  );

  return (
    <div className="room-canvas-viewer">
      <div className="room-canvas-controls" role="group" aria-label="Zoom controls">
        <button
          type="button"
          onClick={() => setViewport({ ...viewport, zoom: clamp(viewport.zoom - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM) })}
        >
          -
        </button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setViewport({ ...viewport, zoom: clamp(viewport.zoom + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM) })}
        >
          +
        </button>
        <button type="button" onClick={() => setViewport({ zoom: 1, panX: 0, panY: 0 })}>
          Reset
        </button>
      </div>

      <div
        className="room-canvas-frame"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${room.width} / ${room.height}`,
          overflow: 'hidden',
          touchAction: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={handleWheel}
      >
        <div
          className="room-canvas-content"
          style={{
            position: 'absolute',
            inset: 0,
            transform,
            transformOrigin: 'top left',
          }}
        >
          <img
            src={room.imageUrl}
            alt={room.name ?? room.id}
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
          />

          <div className="room-canvas-seat-layer" style={{ position: 'absolute', inset: 0 }}>
            {room.seats.map((seat) => (
              <Seat
                key={seat.id}
                seat={seat}
                selected={seat.id === selectedSeatId}
                onSelect={onSeatSelect}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
