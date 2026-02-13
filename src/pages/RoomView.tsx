import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { RoomCanvas, type RoomConfig } from '../components/viewer/RoomCanvas';
import { type SeatModel } from '../components/viewer/Seat';
import registry from '../data/registry.json';
import { useUrlState, type SeatValue } from '../hooks/useUrlState';
import { detectSeatsFromImage } from '../utils/detectSeats';

type RegistryRoom = (typeof registry.rooms)[number];

const toRoomConfig = (room: RegistryRoom, seatData: Record<string, SeatValue>): RoomConfig => ({
  id: room.id,
  name: room.name,
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

interface EditSeat {
  id: string;
  x: number;
  y: number;
}

const RoomView = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { state, setRoomId, setSeatValue, setSeatData } = useUrlState();
  const [selectedSeatId, setSelectedSeatId] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  /* ---- Edit mode state ---- */
  const [editMode, setEditMode] = useState(false);
  const [editSeats, setEditSeats] = useState<EditSeat[]>([]);
  const [detecting, setDetecting] = useState(false);

  const registryRoom = useMemo(
    () => registry.rooms.find((entry) => entry.id === roomId) ?? null,
    [roomId],
  );

  /* Build the room config — use editSeats in edit mode, registry + URL state otherwise */
  const room = useMemo((): RoomConfig | null => {
    if (!registryRoom) return null;

    if (editMode) {
      return {
        id: registryRoom.id,
        name: registryRoom.name,
        imageUrl: registryRoom.image,
        width: registryRoom.width,
        height: registryRoom.height,
        seats: editSeats.map((s) => ({ id: s.id, x: s.x, y: s.y, status: 'available' as const })),
      };
    }

    return toRoomConfig(registryRoom, state.d);
  }, [registryRoom, state.d, editMode, editSeats]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

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
    setEditMode(false);
  }, [roomId]);

  /* ---- Normal-mode seat select ---- */
  const handleSeatSelect = useCallback(
    (seat: SeatModel) => {
      setSelectedSeatId(seat.id);

      if (editMode) return; // In edit mode, just select — don't toggle status

      const currentValue = state.d[seat.id];
      if (currentValue === undefined) {
        setSeatValue(seat.id, 1);
      } else if (currentValue === 1) {
        setSeatValue(seat.id, undefined);
      }
    },
    [editMode, setSeatValue, state.d],
  );

  /* ---- Edit-mode handlers ---- */
  const handleToggleEdit = useCallback(() => {
    setEditMode((prev) => {
      if (!prev && registryRoom) {
        // Entering edit mode — seed with the room's current seats
        setEditSeats(registryRoom.seats.map((s) => ({ id: s.id, x: s.x, y: s.y })));
      }
      return !prev;
    });
    setSelectedSeatId(undefined);
  }, [registryRoom]);

  const handleAddSeat = useCallback((x: number, y: number) => {
    setEditSeats((prev) => {
      const maxId = prev.reduce((max, s) => Math.max(max, parseInt(s.id, 10) || 0), 0);
      return [...prev, { id: `${maxId + 1}`, x, y }];
    });
  }, []);

  const handleDeleteSeat = useCallback(
    (seatId: string) => {
      setEditSeats((prev) => prev.filter((s) => s.id !== seatId));
      if (selectedSeatId === seatId) setSelectedSeatId(undefined);
    },
    [selectedSeatId],
  );

  const handleExport = useCallback(async () => {
    const json = JSON.stringify(editSeats, null, 2);
    await navigator.clipboard.writeText(json);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [editSeats]);

  const handleAutoDetect = useCallback(async () => {
    if (!registryRoom) return;
    setDetecting(true);
    try {
      const seats = await detectSeatsFromImage(registryRoom.image);
      setEditSeats(seats);
    } catch (err) {
      console.error('Auto-detect failed:', err);
    } finally {
      setDetecting(false);
    }
  }, [registryRoom]);

  /* ---- Normal-mode handlers ---- */
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

  /* Derive the reserved-seats list from URL state */
  const reservedEntries = useMemo(() => {
    return Object.entries(state.d).map(([seatId, value]) => ({
      seatId,
      name: typeof value === 'string' ? value : null,
    }));
  }, [state.d]);

  const selectedSeatValue = selectedSeatId ? state.d[selectedSeatId] : undefined;
  const selectedSeatName = typeof selectedSeatValue === 'string' ? selectedSeatValue : '';

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
          editMode={editMode}
          onSeatAdd={handleAddSeat}
        />
      </div>

      {/* -------- RIGHT: Panel -------- */}
      <div className="room-view-right">
        {editMode ? (
          /* ===== EDIT MODE PANEL ===== */
          <>
            <div className="room-view-right-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1>Edit Seats</h1>
                  <p>Click on the map to place seats. {editSeats.length} placed.</p>
                </div>
                <button type="button" className="btn" onClick={handleToggleEdit} style={{ flexShrink: 0 }}>
                  ✕ Done
                </button>
              </div>
            </div>

            <div className="room-view-right-actions">
              <button type="button" className="btn btn--primary" onClick={handleAutoDetect} disabled={detecting}>
                {detecting ? '⏳ Detecting…' : '🔍 Auto-detect'}
              </button>
              <button type="button" className="btn btn--primary" onClick={handleExport}>
                {copied ? '✓ Copied!' : '📋 Export JSON'}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  setEditSeats([]);
                  setSelectedSeatId(undefined);
                }}
              >
                Clear all
              </button>
            </div>

            {selectedSeatId && (
              <div className="selection-panel">
                <div className="selection-panel__label">Seat #{selectedSeatId}</div>
                <div className="selection-panel__actions">
                  <button type="button" className="btn btn--danger" onClick={() => handleDeleteSeat(selectedSeatId)}>
                    Delete seat
                  </button>
                </div>
              </div>
            )}

            <div className="reserved-list">
              <div className="reserved-list__header">Placed seats ({editSeats.length})</div>

              {editSeats.length === 0 ? (
                <div className="reserved-list__empty">Click on the floor plan to place seats.</div>
              ) : (
                editSeats.map((seat) => (
                  <div
                    key={seat.id}
                    className={`reserved-list__item ${selectedSeatId === seat.id ? 'reserved-list__item--active' : ''}`}
                    onClick={() => setSelectedSeatId(seat.id)}
                  >
                    <span className="reserved-list__dot" style={{ background: '#10b981' }} />
                    <span className="reserved-list__seat-id">#{seat.id}</span>
                    <span className="reserved-list__seat-name">
                      ({Math.round(seat.x)}, {Math.round(seat.y)})
                    </span>
                    <button
                      type="button"
                      className="reserved-list__remove"
                      title="Delete seat"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSeat(seat.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="room-view-footer">
              <span>Export JSON → paste into registry.json</span>
              <Link to="/">← Home</Link>
            </div>
          </>
        ) : (
          /* ===== NORMAL MODE PANEL ===== */
          <>
            <div className="room-view-right-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1>{room.name ?? `Room ${room.id}`}</h1>
                  <p>Click seats to mark them. Scroll to zoom, drag to pan.</p>
                </div>
                <button type="button" className="btn" onClick={handleToggleEdit} style={{ flexShrink: 0 }}>
                  ✏️ Edit
                </button>
              </div>
            </div>

            <div className="room-view-right-actions">
              <button type="button" className="btn btn--primary" onClick={handleCopyLink}>
                {copied ? '✓ Copied!' : '🔗 Copy URL'}
              </button>
              {reservedEntries.length > 0 && (
                <button type="button" className="btn btn--danger" onClick={handleClearAll}>
                  Clear all
                </button>
              )}
            </div>

            {selectedSeatId && (
              <div className="selection-panel">
                <div className="selection-panel__label">Seat {selectedSeatId}</div>
                <input
                  className="selection-panel__input"
                  value={selectedSeatName}
                  placeholder="Add student name…"
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    if (!selectedSeatId) return;
                    setSeatValue(selectedSeatId, value.length > 0 ? value : 1);
                  }}
                />
                <div className="selection-panel__actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (!selectedSeatId) return;
                      const currentValue = state.d[selectedSeatId];
                      setSeatValue(selectedSeatId, currentValue ? undefined : 1);
                    }}
                  >
                    {selectedSeatValue ? 'Clear seat' : 'Mark taken'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (selectedSeatId) {
                        setSeatValue(selectedSeatId, undefined);
                        setSelectedSeatId(undefined);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

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
                    <span className="reserved-list__seat-name">{name ?? 'Taken'}</span>
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
              <Link to="/">← Home</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RoomView;
