/**
 * RoomsPage.tsx — Filterable room browser.
 *
 * Renders a cascading filter bar (Building → Floor → Type) and a
 * grid of room cards. All filter state is kept in the URL query
 * string so links are shareable. Room metadata (building, floor,
 * type, seat count) is derived from registry.json via roomMeta.ts.
 */
import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import registry from '../data/registry.json';
import {
  BUILDING_CONFIG,
  BUILDING_ORDER,
  extractMeta,
  sortFloors,
  type RoomMeta,
} from '../utils/roomMeta';

interface RoomWithMeta {
  id: string;
  meta: RoomMeta;
}

const RoomsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedBuilding = searchParams.get('building');
  const selectedFloor = searchParams.get('floor');
  const selectedType = searchParams.get('type');

  /* Pre-compute metadata for every room */
  const roomsWithMeta = useMemo(
    (): RoomWithMeta[] =>
      registry.rooms.map((room) => ({
        id: room.id,
        meta: extractMeta(room.image, room.seats.length),
      })),
    [],
  );

  /* Building list in fixed display order with counts */
  const buildings = useMemo(() => {
    const counts = new Map<string, number>();
    roomsWithMeta.forEach((r) => counts.set(r.meta.building, (counts.get(r.meta.building) ?? 0) + 1));
    return BUILDING_ORDER.filter((b) => counts.has(b)).map((b) => ({
      key: b,
      config: BUILDING_CONFIG[b] ?? { label: b, color: '#6b7280', icon: '🏢' },
      count: counts.get(b) ?? 0,
    }));
  }, [roomsWithMeta]);

  /* Available floors — collected from all rooms, or narrowed to selected building */
  const availableFloors = useMemo(() => {
    const floors = new Set<string>();
    roomsWithMeta
      .filter((r) => {
        if (selectedBuilding && r.meta.building !== selectedBuilding) return false;
        return true;
      })
      .forEach((r) => {
        if (r.meta.floor !== '–') floors.add(r.meta.floor);
      });
    return sortFloors([...floors]);
  }, [roomsWithMeta, selectedBuilding]);

  /* Available types — only shown when >1 type exists in current selection */
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    roomsWithMeta
      .filter((r) => {
        if (selectedBuilding && r.meta.building !== selectedBuilding) return false;
        if (selectedFloor && r.meta.floor !== selectedFloor) return false;
        return true;
      })
      .forEach((r) => types.add(r.meta.type));
    return [...types].sort();
  }, [roomsWithMeta, selectedBuilding, selectedFloor]);

  /* Filtered rooms */
  const filtered = useMemo(
    () =>
      roomsWithMeta.filter((r) => {
        if (selectedBuilding && r.meta.building !== selectedBuilding) return false;
        if (selectedFloor && r.meta.floor !== selectedFloor) return false;
        if (selectedType && r.meta.type !== selectedType) return false;
        return true;
      }),
    [roomsWithMeta, selectedBuilding, selectedFloor, selectedType],
  );

  /* Cascading filter setter */
  const setFilter = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (value) params.set(key, value);
          else params.delete(key);
          if (key === 'building') {
            params.delete('type');
          }
          if (key === 'floor') params.delete('type');
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return (
    <>
      <header className="rooms-banner-wrapper">
        <div className="rooms-banner-inner">
          <div className="room-banner__left">
            <Link to="/" className="banner-nav">
              <span className="banner-nav__icon">←</span>
              <span>Home</span>
            </Link>
          </div>
          <div className="room-banner__center">
            <h1>Browse Rooms</h1>
          </div>
          <div className="room-banner__right">
            <span className="rooms-stats">
              {filtered.length} / {roomsWithMeta.length} rooms
            </span>
            <button
              type="button"
              className="btn btn--secondary banner-btn-undo"
              title="Clear all filters"
              disabled={!(selectedBuilding || selectedFloor || selectedType)}
              onClick={clearFilters}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3l-3 2.7" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      <div className="rooms-page" style={{ minHeight: 'calc(100vh - 72px)', paddingTop: '24px' }}>

        <div className="filter-bar">
          {/* Building filter */}
          <div className="filter-group">
            <span className="filter-group__label">Building</span>
            <div className="filter-pills">
              <button
                type="button"
                className={`pill ${!selectedBuilding ? 'pill--active' : ''}`}
                onClick={() => setFilter('building', null)}
              >
                All
              </button>
              {buildings.map(({ key, config, count }) => (
                <button
                  key={key}
                  type="button"
                  className={`pill ${selectedBuilding === key ? 'pill--active' : ''}`}
                  onClick={() => setFilter('building', selectedBuilding === key ? null : key)}
                >
                  {config.label}
                  <span className="pill__count">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Floor filter — always shown when floors exist */}
          {availableFloors.length > 0 && (
            <div className="filter-group">
              <span className="filter-group__label">Floor</span>
              <div className="filter-pills">
                <button
                  type="button"
                  className={`pill ${!selectedFloor ? 'pill--active' : ''}`}
                  onClick={() => setFilter('floor', null)}
                >
                  All floors
                </button>
                {availableFloors.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`pill ${selectedFloor === f ? 'pill--active' : ''}`}
                    onClick={() => setFilter('floor', selectedFloor === f ? null : f)}
                  >
                    {f.startsWith('B') ? `Basement ${f.slice(1)}` : `Level ${f}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Type filter — always shown when types exist */}
          {availableTypes.length > 0 && (
            <div className="filter-group">
              <span className="filter-group__label">Type</span>
              <div className="filter-pills">
                <button
                  type="button"
                  className={`pill ${!selectedType ? 'pill--active' : ''}`}
                  onClick={() => setFilter('type', null)}
                >
                  All types
                </button>
                {availableTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`pill ${selectedType === t ? 'pill--active' : ''}`}
                    onClick={() => setFilter('type', selectedType === t ? null : t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {filtered.length > 0 ? (
          <div className="room-cards-grid">
            {filtered.map((room) => (
              <Link key={room.id} to={`/room/${room.id}`} className="room-card">
                <div className="room-card__accent" style={{ background: room.meta.buildingColor }} />
                <div className="room-card__body">
                  <h3 className="room-card__title">{room.meta.displayName}</h3>
                  <div className="room-card__badges">
                    {room.meta.floor !== '–' && (
                      <span className="badge">
                        {room.meta.floor.startsWith('B') ? room.meta.floor : `L${room.meta.floor}`}
                      </span>
                    )}
                    <span className="badge">{room.meta.type}</span>
                    <span className="badge badge--muted">{room.meta.seatCount} seats</span>
                  </div>
                </div>
                <span className="room-card__arrow">→</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No rooms match your filters.</p>
            <button type="button" className="btn btn--primary" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default RoomsPage;
