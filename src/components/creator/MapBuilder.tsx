import { type MouseEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import ImageUploader, { FloorplanAsset } from './ImageUploader';

type Seat = {
  id: number;
  x: number;
  y: number;
};

type GhostSeat = {
  x: number;
  y: number;
};

const markerRadius = 10;

const MapBuilder = () => {
  const [startId, setStartId] = useState(1);
  const [mapId, setMapId] = useState('room-map');
  const [mapName, setMapName] = useState('Room Layout');
  const [asset, setAsset] = useState<FloorplanAsset | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [ghostSeat, setGhostSeat] = useState<GhostSeat | null>(null);
  const [nextId, setNextId] = useState(1);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNextId((current) => {
      if (seats.length > 0) {
        return current;
      }

      return startId;
    });
  }, [startId, seats.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setSeats((existing) => {
          if (existing.length === 0) {
            return existing;
          }

          const copy = existing.slice(0, -1);
          const highestRemainingId = copy.length > 0 ? copy[copy.length - 1].id + 1 : startId;
          setNextId(Math.max(startId, highestRemainingId));
          return copy;
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startId]);

  const config = useMemo(
    () => ({
      id: mapId,
      name: mapName,
      image: asset?.name ?? '',
      width: asset?.width ?? 0,
      height: asset?.height ?? 0,
      seats: seats.map((seat) => ({
        id: seat.id,
        x: Number(seat.x.toFixed(2)),
        y: Number(seat.y.toFixed(2)),
      })),
    }),
    [asset, mapId, mapName, seats],
  );

  const getScaledPoint = (clientX: number, clientY: number): GhostSeat | null => {
    if (!canvasRef.current || !asset) {
      return null;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;

    if (relativeX < 0 || relativeY < 0 || relativeX > rect.width || relativeY > rect.height) {
      return null;
    }

    return {
      x: (relativeX / rect.width) * asset.width,
      y: (relativeY / rect.height) * asset.height,
    };
  };

  const placeSeat = (point: GhostSeat) => {
    setSeats((existing) => [...existing, { id: nextId, x: point.x, y: point.y }]);
    setNextId((current) => Math.max(startId, current + 1));
  };

  const downloadConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${mapId || 'room-map'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    setSeats([]);
    setGhostSeat(null);
    setNextId(startId);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <ImageUploader
        onUpload={(uploadedAsset) => {
          setAsset(uploadedAsset);
          setSeats([]);
          setGhostSeat(null);
          setNextId(startId);
        }}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          Map ID{' '}
          <input value={mapId} onChange={(event) => setMapId(event.target.value)} style={{ marginLeft: 6 }} />
        </label>
        <label>
          Name{' '}
          <input value={mapName} onChange={(event) => setMapName(event.target.value)} style={{ marginLeft: 6 }} />
        </label>
        <label>
          Start ID{' '}
          <input
            type="number"
            value={startId}
            min={1}
            onChange={(event) => setStartId(Number(event.target.value) || 1)}
            style={{ marginLeft: 6, width: 80 }}
          />
        </label>
        <button type="button" onClick={() => setSeats((existing) => existing.slice(0, -1))}>
          Undo (Ctrl+Z)
        </button>
        <button type="button" onClick={resetAll}>
          Reset
        </button>
        <button type="button" onClick={downloadConfig} disabled={!asset}>
          Download Config
        </button>
      </div>

      <RoomCanvas
        asset={asset}
        seats={seats}
        ghostSeat={ghostSeat}
        canvasRef={canvasRef}
        onMove={(event) => setGhostSeat(getScaledPoint(event.clientX, event.clientY))}
        onLeave={() => setGhostSeat(null)}
        onClick={(event) => {
          const point = getScaledPoint(event.clientX, event.clientY);
          if (point) {
            placeSeat(point);
          }
        }}
      />

      <section>
        <h3 style={{ marginBottom: 8 }}>Live JSON Preview</h3>
        <pre
          style={{
            margin: 0,
            maxHeight: 360,
            overflow: 'auto',
            background: '#111827',
            color: '#f9fafb',
            padding: 12,
            borderRadius: 8,
          }}
        >
          {JSON.stringify(config, null, 2)}
        </pre>
      </section>
    </div>
  );
};

type RoomCanvasProps = {
  asset: FloorplanAsset | null;
  seats: Seat[];
  ghostSeat: GhostSeat | null;
  canvasRef: RefObject<HTMLDivElement>;
  onMove: (event: MouseEvent<HTMLDivElement>) => void;
  onLeave: () => void;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
};

const RoomCanvas = ({ asset, seats, ghostSeat, canvasRef, onMove, onLeave, onClick }: RoomCanvasProps) => {
  return (
    <section>
      <h3 style={{ marginBottom: 8 }}>Floorplan</h3>
      <div
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
        style={{
          position: 'relative',
          border: '1px solid #d1d5db',
          borderRadius: 10,
          overflow: 'hidden',
          width: 'min(100%, 980px)',
          aspectRatio: asset ? `${asset.width} / ${asset.height}` : '16 / 9',
          background: '#f3f4f6',
        }}
      >
        {asset ? (
          asset.mimeType === 'image/png' ? (
            <img src={asset.dataUrl} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <object data={asset.dataUrl} type="application/pdf" style={{ width: '100%', height: '100%' }}>
              <div style={{ padding: 16 }}>PDF preview unavailable in this browser.</div>
            </object>
          )
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#6b7280' }}>
            Upload a floorplan to begin placing seats.
          </div>
        )}

        {asset
          ? seats.map((seat) => (
              <div
                key={seat.id}
                title={`Seat ${seat.id}`}
                style={{
                  position: 'absolute',
                  left: `${(seat.x / asset.width) * 100}%`,
                  top: `${(seat.y / asset.height) * 100}%`,
                  width: markerRadius * 2,
                  height: markerRadius * 2,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '9999px',
                  background: '#2563eb',
                  border: '2px solid #ffffff',
                  color: '#fff',
                  fontSize: 10,
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  pointerEvents: 'none',
                }}
              >
                {seat.id}
              </div>
            ))
          : null}

        {asset && ghostSeat ? (
          <>
            <div
              style={{
                position: 'absolute',
                left: `${(ghostSeat.x / asset.width) * 100}%`,
                top: `${(ghostSeat.y / asset.height) * 100}%`,
                width: markerRadius * 2,
                height: markerRadius * 2,
                transform: 'translate(-50%, -50%)',
                borderRadius: '9999px',
                background: 'rgba(250, 204, 21, 0.65)',
                border: '2px dashed #ca8a04',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: `calc(${(ghostSeat.x / asset.width) * 100}% + 14px)`,
                top: `calc(${(ghostSeat.y / asset.height) * 100}% - 16px)`,
                padding: '2px 6px',
                borderRadius: 6,
                fontSize: 12,
                background: 'rgba(17, 24, 39, 0.8)',
                color: '#fff',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              ({Math.round(ghostSeat.x)}, {Math.round(ghostSeat.y)})
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
};

export default MapBuilder;
