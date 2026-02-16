/**
 * EditSeats.tsx — Seat-position editor (contributor tool).
 *
 * Lets contributors visually add, move, delete, renumber, and
 * export seat coordinates for any room. Changes are exported as
 * JSON that can be pasted into registry.json. Supports undo,
 * keyboard shortcuts, and drag-to-move.
 *
 * Route: /edit
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import registry from '../data/registry.json';
import { BUILDING_CONFIG } from '../utils/roomMeta';
import {
  SeatEditorCanvas,
  type EditableSeat,
} from '../components/creator/SeatEditorCanvas';

/* ---- types ---- */

interface EditorRoom {
  id: string;
  name: string;
  image: string;
  width: number;
  height: number;
  seats: EditableSeat[];
}

/* ---- page ---- */

const EditSeats = () => {
  /* deep-copy registry into mutable state */
  const [rooms, setRooms] = useState<EditorRoom[]>(() =>
    registry.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      image: r.image,
      width: r.width,
      height: r.height,
      seats: r.seats.map((s) => ({ ...s })),
    })),
  );

  const [currentRoomIdx, setCurrentRoomIdx] = useState(0);
  const [selectedSeatId, setSelectedSeatId] = useState<string | undefined>();
  const [addMode, setAddMode] = useState(false);
  const [undoStack, setUndoStack] = useState<EditableSeat[][]>([]);
  const [modifiedRooms, setModifiedRooms] = useState<Set<number>>(new Set());

  const room = rooms[currentRoomIdx];

  /* ---- helpers ---- */

  const markModified = useCallback(() => {
    setModifiedRooms((prev) => new Set(prev).add(currentRoomIdx));
  }, [currentRoomIdx]);

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [
      ...prev.slice(-50),
      room.seats.map((s) => ({ ...s })),
    ]);
  }, [room.seats]);

  const updateSeats = useCallback(
    (newSeats: EditableSeat[]) => {
      setRooms((prev) =>
        prev.map((r, i) =>
          i === currentRoomIdx ? { ...r, seats: newSeats } : r,
        ),
      );
    },
    [currentRoomIdx],
  );

  /* ---- seat operations ---- */

  const handleAddSeat = useCallback(
    (x: number, y: number) => {
      pushUndo();
      markModified();
      const maxId = room.seats.reduce(
        (max, s) => Math.max(max, parseInt(s.id) || 0),
        0,
      );
      const newSeat: EditableSeat = { id: String(maxId + 1), x, y };
      updateSeats([...room.seats, newSeat]);
      setSelectedSeatId(newSeat.id);
    },
    [room.seats, pushUndo, markModified, updateSeats],
  );

  const handleMoveSeat = useCallback(
    (id: string, x: number, y: number) => {
      pushUndo();
      markModified();
      setRooms((prev) =>
        prev.map((r, i) =>
          i === currentRoomIdx
            ? {
                ...r,
                seats: r.seats.map((s) =>
                  s.id === id ? { ...s, x, y } : s,
                ),
              }
            : r,
        ),
      );
    },
    [currentRoomIdx, pushUndo, markModified],
  );

  const handleDeleteSeat = useCallback(() => {
    if (!selectedSeatId) return;
    pushUndo();
    markModified();
    updateSeats(room.seats.filter((s) => s.id !== selectedSeatId));
    setSelectedSeatId(undefined);
  }, [selectedSeatId, room.seats, pushUndo, markModified, updateSeats]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    updateSeats(prev);
    setSelectedSeatId(undefined);
  }, [undoStack, updateSeats]);

  const handleRenumber = useCallback(() => {
    pushUndo();
    markModified();
    const sorted = [...room.seats].sort((a, b) => a.y - b.y || a.x - b.x);
    updateSeats(sorted.map((s, i) => ({ ...s, id: String(i + 1) })));
    setSelectedSeatId(undefined);
  }, [room.seats, pushUndo, markModified, updateSeats]);

  const handleClearRoom = useCallback(() => {
    if (!confirm(`Remove all ${room.seats.length} seats from this room?`))
      return;
    pushUndo();
    markModified();
    updateSeats([]);
    setSelectedSeatId(undefined);
  }, [room.seats.length, pushUndo, markModified, updateSeats]);

  /* ---- export ---- */

  const handleExport = useCallback(() => {
    const exportData = {
      rooms: registry.rooms.map((origRoom, i) => ({
        ...origRoom,
        seats: rooms[i].seats,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registry.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [rooms]);

  /* ---- keyboard shortcuts ---- */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedSeatId) {
          e.preventDefault();
          handleDeleteSeat();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }

      if (
        selectedSeatId &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy =
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

        const seat = room.seats.find((s) => s.id === selectedSeatId);
        if (seat) {
          pushUndo();
          markModified();
          setRooms((prev) =>
            prev.map((r, i) =>
              i === currentRoomIdx
                ? {
                    ...r,
                    seats: r.seats.map((s) =>
                      s.id === selectedSeatId
                        ? { ...s, x: s.x + dx, y: s.y + dy }
                        : s,
                    ),
                  }
                : r,
            ),
          );
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    selectedSeatId,
    handleDeleteSeat,
    handleUndo,
    room.seats,
    currentRoomIdx,
    pushUndo,
    markModified,
  ]);

  /* reset on room change */
  useEffect(() => {
    setSelectedSeatId(undefined);
    setUndoStack([]);
    setAddMode(false);
  }, [currentRoomIdx]);

  /* ---- room navigation ---- */

  const goToRoom = useCallback(
    (dir: -1 | 1) => {
      setCurrentRoomIdx((i) =>
        Math.max(0, Math.min(rooms.length - 1, i + dir)),
      );
    },
    [rooms.length],
  );

  /* group rooms by building for <select> optgroups */
  const groupedRooms = useMemo(() => {
    const groups = new Map<
      string,
      Array<{ idx: number; room: EditorRoom }>
    >();
    rooms.forEach((r, idx) => {
      const building = r.image
        .replace(/^\/maps(?:-masked)?\//, '')
        .split(' ')[0];
      if (!groups.has(building)) groups.set(building, []);
      groups.get(building)!.push({ idx, room: r });
    });
    return groups;
  }, [rooms]);

  /* ---- render ---- */

  return (
    <div className="edit-page">
      {/* ---- top toolbar ---- */}
      <div className="edit-toolbar">
        <Link to="/" className="btn btn--secondary edit-toolbar__back">
          ← Home
        </Link>

        <div className="edit-toolbar__nav">
          <button
            className="btn btn--secondary"
            onClick={() => goToRoom(-1)}
            disabled={currentRoomIdx === 0}
          >
            ‹ Prev
          </button>

          <select
            className="edit-toolbar__select"
            value={currentRoomIdx}
            onChange={(e) => setCurrentRoomIdx(Number(e.target.value))}
          >
            {Array.from(groupedRooms.entries()).map(([building, items]) => (
              <optgroup
                key={building}
                label={BUILDING_CONFIG[building]?.label ?? building}
              >
                {items.map(({ idx, room: r }) => (
                  <option key={r.id} value={idx}>
                    {modifiedRooms.has(idx) ? '• ' : ''}
                    {r.name} ({r.seats.length})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <button
            className="btn btn--secondary"
            onClick={() => goToRoom(1)}
            disabled={currentRoomIdx === rooms.length - 1}
          >
            Next ›
          </button>
        </div>

        <span className="edit-toolbar__count">{room.seats.length} seats</span>

        <div className="edit-toolbar__actions">
          <button
            className={`btn ${addMode ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => {
              setAddMode(!addMode);
              setSelectedSeatId(undefined);
            }}
          >
            {addMode ? '+ Adding…' : '+ Add Seat'}
          </button>

          <button
            className="btn btn--danger"
            onClick={handleDeleteSeat}
            disabled={!selectedSeatId}
          >
            Delete
          </button>

          <button
            className="btn btn--secondary"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
          >
            Undo
          </button>

          <button className="btn btn--secondary" onClick={handleRenumber}>
            Renumber
          </button>

          <button className="btn btn--secondary" onClick={handleClearRoom}>
            Clear All
          </button>

          <button className="btn btn--primary" onClick={handleExport}>
            Export JSON
          </button>
        </div>
      </div>

      {/* ---- canvas ---- */}
      <SeatEditorCanvas
        imageUrl={room.image}
        width={room.width}
        height={room.height}
        seats={room.seats}
        selectedSeatId={selectedSeatId}
        addMode={addMode}
        onAddSeat={handleAddSeat}
        onMoveSeat={handleMoveSeat}
        onSelectSeat={setSelectedSeatId}
      />

      {/* ---- status bar ---- */}
      <div className="edit-status-bar">
        <span>
          {selectedSeatId
            ? `Selected: Seat #${selectedSeatId} — Drag to move · Delete to remove · Arrow keys to nudge (Shift = 10px)`
            : addMode
              ? 'Click on the map to place a new seat'
              : 'Click a seat to select it · Toggle "Add Seat" to place new ones'}
        </span>
        <span>
          Room {currentRoomIdx + 1}/{rooms.length}
          {modifiedRooms.size > 0 && ` · ${modifiedRooms.size} modified`}
        </span>
      </div>
    </div>
  );
};

export default EditSeats;
