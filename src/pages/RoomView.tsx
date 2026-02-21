/**
 * RoomView.tsx — Interactive seat map for a single room.
 *
 * Loads the room's floor-plan image and seat coordinates from
 * registry.json, renders them on an interactive canvas (RoomCanvas),
 * and exposes seat selection + shareable URL state via useUrlState.
 * Users can click seats, then copy/share the URL so friends can
 * see the same selection.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import registry from '../data/registry.json';
import { useUrlState, type SeatValue } from '../hooks/useUrlState';
import { extractMeta } from '../utils/roomMeta';
import {
  RoomCanvas,
  type RoomConfig,
  type ViewportState,
} from '../components/viewer/RoomCanvas';
import { type SeatModel } from '../components/viewer/Seat';

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

  /* ---- Sidebar state ---- */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  /* Seminar rooms get 30% larger seat dots for easier tapping */
  const seatRadius = useMemo(() => {
    if (!registryRoom) return 18 * 1.3;
    const meta = extractMeta(registryRoom.image, registryRoom.seats.length);
    return meta.type === 'Seminar Room' ? 23 * 1.3 : 18 * 1.3;
  }, [registryRoom]);

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
    setIsSidebarOpen(false); // Close sidebar on room change
  }, [roomId]);

  const handleSeatSelect = useCallback(
    (seat: SeatModel) => {
      setSelectedSeatId(seat.id);
      const currentValue = state.d[seat.id];
      if (currentValue === undefined) {
        setSeatValue(seat.id, 1);
        setIsSidebarOpen(true); // Auto-open sidebar when selecting a seat
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

  const zoomReset = useCallback(() => {
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }, []);

  /* Derive the selected-seats list from URL state */
  const selectedEntries = useMemo(() => {
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
    <div className="fullscreen-room-view">
      {/* Background Watermark Layer */}
      <div className="watermark-bg" />

      {/* Main Floorplan Canvas Map */}
      <div className="fullscreen-canvas-container">
        <RoomCanvas
          room={room}
          selectedSeatId={selectedSeatId}
          seatRadius={seatRadius}
          onSeatSelect={handleSeatSelect}
          viewportState={viewport}
          onViewportStateChange={setViewport}
        />
      </div>

      {/* Top Overlay Banner */}
      <div className="room-banner">
        <div className="room-banner__left">
          <Link to="/rooms" className="back-link banner-nav">
            <span className="banner-nav__icon">←</span>
            <span>Back</span>
          </Link>
        </div>
        <div className="room-banner__center">
          <h1>{room.name ?? `Room ${room.id}`}</h1>
        </div>
        <div className="room-banner__right">
          <button type="button" className="btn btn--secondary banner-btn-reset" onClick={zoomReset}>
            Reset View
          </button>
          <button type="button" className="btn btn--primary banner-btn-copy" onClick={handleCopyLink}>
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
            )}
            <span>{copied ? 'Copied!' : 'Copy to Share'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Sidebar Overlay */}
      <div className={`collapsible-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        {/* Toggle Tab */}
        <button
          className="sidebar-toggle"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          title={isSidebarOpen ? "Hide selected seats" : "Show selected seats"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'transform 0.3s' }}
            transform={isSidebarOpen ? "rotate(180)" : ""}
          >
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          {!isSidebarOpen && selectedEntries.length > 0 && (
            <span className="sidebar-toggle__badge" style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '10px'
            }}>{selectedEntries.length}</span>
          )}
        </button>

        {/* Sidebar Content */}
        <div className="sidebar-content">
          <div className="reserved-list">
            <div className="reserved-list__header">
              <span>Selected ({selectedEntries.length})</span>
              <button
                type="button"
                className="clear-all-btn"
                onClick={handleClearAll}
                disabled={selectedEntries.length === 0}
              >
                Clear All
              </button>
            </div>

            {selectedEntries.length === 0 ? (
              <div className="reserved-list__empty">
                No seats marked yet. Click a seat on the map to get started.
              </div>
            ) : (
              selectedEntries.map(({ seatId, name }) => (
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
                    onBlur={() => window.scrollTo(0, 0)}
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

            <div className="room-view-footer sidebar-footer">
              <span>State is saved in the URL</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomView;
