import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { RoomCanvas, type RoomConfig } from '../components/viewer/RoomCanvas';
import { type SeatModel } from '../components/viewer/Seat';
import registry from '../data/registry.json';
import { useUrlState, type SeatValue } from '../hooks/useUrlState';

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

const RoomView = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { state, setRoomId, setSeatValue, setSeatData } = useUrlState();
  const [selectedSeatId, setSelectedSeatId] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  const room = useMemo(() => {
    const registryRoom = registry.rooms.find((entry) => entry.id === roomId);
    return registryRoom ? toRoomConfig(registryRoom, state.d) : null;
  }, [roomId, state.d]);

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
    if (typeof window === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, []);

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
    <section className="room-view-page" style={{ display: 'grid', gap: 12, padding: 24 }}>
      <header>
        <h1 style={{ marginBottom: 4 }}>{room.name ?? `Room ${room.id}`}</h1>
        <p style={{ margin: 0, color: '#4b5563' }}>
          Click a seat to mark it taken, then add a name if needed. Scroll to zoom and drag to pan.
        </p>
      </header>

      <RoomCanvas
        room={room}
        selectedSeatId={selectedSeatId}
        onSeatSelect={handleSeatSelect}
      />

      <section
        style={{
          display: 'grid',
          gap: 12,
          padding: 16,
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          background: '#f9fafb',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>Selected seat: {selectedSeatId ?? 'none'}</span>
          <button type="button" onClick={handleCopyLink}>
            {copied ? 'Copied!' : 'Share / Save'}
          </button>
        </div>

        {selectedSeatId ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label>
              Student name (optional)
              <input
                value={selectedSeatName}
                placeholder="Enter name"
                onChange={(event) => {
                  const value = event.target.value.trim();
                  if (!selectedSeatId) {
                    return;
                  }
                  setSeatValue(selectedSeatId, value.length > 0 ? value : 1);
                }}
                style={{ display: 'block', marginTop: 6, width: '100%', maxWidth: 320 }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  if (!selectedSeatId) {
                    return;
                  }
                  const currentValue = state.d[selectedSeatId];
                  setSeatValue(selectedSeatId, currentValue ? undefined : 1);
                }}
              >
                {selectedSeatValue ? 'Clear seat' : 'Mark taken'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedSeatId) {
                    setSeatValue(selectedSeatId, undefined);
                  }
                }}
              >
                Remove assignment
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Seats with names or taken status are encoded in the URL.</span>
        <Link to="/">Back home</Link>
      </footer>
    </section>
  );
};

export default RoomView;
