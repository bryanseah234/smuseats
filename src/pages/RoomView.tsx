import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  RoomCanvas,
  type RoomConfig,
  type ViewportState,
} from '../components/viewer/RoomCanvas';
import { type SeatModel } from '../components/viewer/Seat';
import registry from '../data/registry.json';
import { useUrlState, type SeatValue } from '../hooks/useUrlState';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

type RegistryRoom = (typeof registry.rooms)[number];

/** Derive a clean display name from the image path, e.g. "/maps-masked/LKCSB Seminar Room 1-1.png" → "LKCSB Seminar Room 1-1" */
const displayName = (room: RegistryRoom): string => {
  if (room.image) {
    const file = room.image.replace(/^\/maps(?:-masked)?\//, '').replace(/\.png$/i, '');
    if (file) return file;
  }
  return room.name ?? room.id;
};

const toRoomConfig = (room: RegistryRoom, seatData: Record<string, SeatValue>): RoomConfig => ({
  id: room.id,
  name: displayName(room),
  imageUrl: room.image,
  width: room.width,
  height: room.height,
  seats: room.seats.map((seat) => ({
    id: seat.id,
    x: seat.x,
    y: seat.y,
    status: seatData[seat.id] ? 'reserved' : 'available',
  })),
});

const RoomView = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { state, setRoomId, setSeatValue, setSeatData } = useUrlState();
  const [selectedSeatId, setSelectedSeatId] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  /* ---- Zoom state (controlled from right panel) ---- */
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 });

  const registryRoom = useMemo(
    () => registry.rooms.find((entry) => entry.id === roomId) ?? null,
    [roomId],
  );

  const room = useMemo((): RoomConfig | null => {
    if (!registryRoom) return null;
    return toRoomConfig(registryRoom, state.d);
  }, [registryRoom, state.d]);

  useEffect(() => {
    if (!roomId) return;

    if (state.r && state.r !== roomId) {
      navigate(`/room/${state.r}`, { replace: true });
      return;
    }

    if (state.r !== roomId) {
      setRoomId(roomId);
      setSeatData({});
    }
  }, [navigate, roomId, setRoomId, setSeatData, state.r]);

  useEffect(() => {
    setSelectedSeatId(undefined);
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }, [roomId]);

  const handleSeatSelect = useCallback(
    (seat: SeatModel) => {
      setSelectedSeatId(seat.id);
      const currentValue = state.d[seat.id];
      if (currentValue === undefined) {
        setSeatValue(seat.id, 1);
      } else if (currentValue === 1) {
        setSeatValue(seat.id, undefined);
      }
    },
    [setSeatValue, state.d],
  );

  const handleCopyLink = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, []);

  const handleClearAll = useCallback(() => {
    setSeatData({});
    setSelectedSeatId(undefined);
  }, [setSeatData]);

  /* ---- Zoom helpers ---- */
  const zoomIn = useCallback(() => {
    setViewport((v) => ({ ...v, zoom: clamp(v.zoom + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport((v) => ({ ...v, zoom: clamp(v.zoom - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM) }));
  }, []);

  const zoomReset = useCallback(() => {
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }, []);

  /* Derive the reserved-seats list from URL state */
  const reservedEntries = useMemo(() => {
    return Object.entries(state.d).map(([seatId, value]) => ({
      seatId,
      name: typeof value === 'string' ? value : null,
    }));
  }, [state.d]);

  if (!room) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Room not found</h1>
        <p>We could not find room: {roomId}</p>
        <Link to="/">Back home</Link>
      </main>
    );
  }

  return (
    <div className="room-view-page">
      {/* -------- LEFT: Floor-plan canvas -------- */}
      <div className="room-view-left">
        <RoomCanvas
          room={room}
          selectedSeatId={selectedSeatId}
          onSeatSelect={handleSeatSelect}
          viewportState={viewport}
          onViewportStateChange={setViewport}
        />
      </div>

      {/* -------- RIGHT: Panel -------- */}
      <div className="room-view-right">
        <div className="room-view-right-header">
          <Link to="/rooms" className="back-link">← Back to rooms</Link>
          <h1>{room.name ?? `Room ${room.id}`}</h1>
          <p>Click seats to mark them. Click +/− to zoom.</p>
        </div>

        <div className="room-view-right-toolbar">
          <div className="zoom-controls">
            <button type="button" onClick={zoomIn} title="Zoom in">+</button>
            <button type="button" onClick={zoomOut} title="Zoom out">−</button>
            <span>{Math.round(viewport.zoom * 100)}%</span>
          </div>
          <button type="button" className="btn btn--secondary" onClick={zoomReset}>
            Reset View
          </button>
          <button type="button" className="btn btn--primary" onClick={handleCopyLink}>
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={handleClearAll}
            disabled={reservedEntries.length === 0}
          >
            Clear All
          </button>
        </div>

        <div className="reserved-list">
          <div className="reserved-list__header">Reserved ({reservedEntries.length})</div>

          {reservedEntries.length === 0 ? (
            <div className="reserved-list__empty">
              No seats marked yet. Click a seat on the map to get started.
            </div>
          ) : (
            reservedEntries.map(({ seatId, name }) => (
              <div
                key={seatId}
                className={`reserved-list__item ${selectedSeatId === seatId ? 'reserved-list__item--active' : ''}`}
                onClick={() => setSelectedSeatId(seatId)}
              >
                <span className="reserved-list__dot" />
                <span className="reserved-list__seat-id">#{seatId}</span>
                <input
                  className="reserved-list__name-input"
                  value={name ?? ''}
                  placeholder="Add name…"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSeatValue(seatId, v.length > 0 ? v : 1);
                  }}
                />
                <button
                  type="button"
                  className="reserved-list__remove"
                  title="Remove seat"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSeatValue(seatId, undefined);
                    if (selectedSeatId === seatId) setSelectedSeatId(undefined);
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="room-view-footer">
          <span>State is saved in the URL</span>
        </div>
      </div>
    </div>
  );
};

export default RoomView;
