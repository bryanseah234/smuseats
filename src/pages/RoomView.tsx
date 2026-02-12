import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { RoomCanvas, type RoomConfig, type ViewportState } from '../components/viewer/RoomCanvas';
import { type SeatModel } from '../components/viewer/Seat';

const toNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const RoomView = () => {
  const { roomId = 'default' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [room, setRoom] = useState<RoomConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSeatId = searchParams.get('seat') ?? undefined;

  const viewportState = useMemo<ViewportState>(
    () => ({
      zoom: toNumber(searchParams.get('zoom'), 1),
      panX: toNumber(searchParams.get('panX'), 0),
      panY: toNumber(searchParams.get('panY'), 0),
    }),
    [searchParams],
  );

  useEffect(() => {
    let active = true;

    async function loadRoom() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/rooms/${roomId}.json`);
        if (!response.ok) {
          throw new Error(`Could not load room ${roomId}`);
        }

        const payload = (await response.json()) as RoomConfig;
        if (!active) {
          return;
        }

        setRoom(payload);
      } catch (fetchError) {
        if (!active) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load room.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRoom();

    return () => {
      active = false;
    };
  }, [roomId]);

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

  if (loading) {
    return <div>Loading room...</div>;
  }

  if (error || !room) {
    return <div role="alert">{error ?? 'Room is unavailable.'}</div>;
  }

  return (
    <section className="room-view-page">
      <header>
        <h1>{room.name ?? `Room ${room.id}`}</h1>
      </header>

      <RoomCanvas
        room={room}
        selectedSeatId={selectedSeatId}
        onSeatSelect={handleSeatSelect}
        viewportState={viewportState}
        onViewportStateChange={handleViewportChange}
      />
    </section>
  );
};

export default RoomView;
