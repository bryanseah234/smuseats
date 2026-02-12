import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { RoomCanvas, type RoomConfig, type ViewportState } from '../components/viewer/RoomCanvas';
import { type SeatModel } from '../components/viewer/Seat';
import registry from '../data/registry.json';

type RegistryRoom = (typeof registry.rooms)[number];

const toNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createSeatGrid = (room: RegistryRoom): SeatModel[] => {
  const columns = Math.max(2, Math.min(8, Math.floor(room.layout.width / 3)));
  const rows = Math.max(2, Math.min(5, Math.floor(room.layout.height / 2.5)));
  const xGap = room.layout.width / (columns + 1);
  const yGap = room.layout.height / (rows + 1);

  return Array.from({ length: columns * rows }, (_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;

    return {
      id: `${room.id}-${index + 1}`,
      label: `Seat ${index + 1}`,
      x: Number(((col + 1) * xGap).toFixed(2)),
      y: Number(((row + 1) * yGap).toFixed(2)),
      status: 'available' as const,
    };
  });
};

const toRoomConfig = (room: RegistryRoom): RoomConfig => ({
  id: room.id,
  name: room.name,
  width: room.layout.width,
  height: room.layout.height,
  seats: createSeatGrid(room),
});

const RoomView = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const room = useMemo(() => {
    const registryRoom = registry.rooms.find((entry) => entry.id === roomId);
    return registryRoom ? toRoomConfig(registryRoom) : null;
  }, [roomId]);

  const selectedSeatId = searchParams.get('seat') ?? undefined;

  const viewportState = useMemo<ViewportState>(
    () => ({
      zoom: toNumber(searchParams.get('zoom'), 1),
      panX: toNumber(searchParams.get('panX'), 0),
      panY: toNumber(searchParams.get('panY'), 0),
    }),
    [searchParams],
  );

  const updateSearchParams = (changes: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(changes).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    setSearchParams(next, { replace: true });
  };

  const handleSeatSelect = (seat: SeatModel) => {
    updateSearchParams({ seat: seat.id });
  };

  const handleViewportChange = (next: ViewportState) => {
    updateSearchParams({
      zoom: next.zoom.toFixed(2),
      panX: Math.round(next.panX).toString(),
      panY: Math.round(next.panY).toString(),
    });
  };

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
        <p style={{ margin: 0, color: '#4b5563' }}>Click a seat to select it. Scroll to zoom and drag to pan.</p>
      </header>

      <RoomCanvas
        room={room}
        selectedSeatId={selectedSeatId}
        onSeatSelect={handleSeatSelect}
        viewportState={viewportState}
        onViewportStateChange={handleViewportChange}
      />

      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Selected seat: {selectedSeatId ?? 'none'}</span>
        <Link to="/">Back home</Link>
      </footer>
    </section>
  );
};

export default RoomView;
