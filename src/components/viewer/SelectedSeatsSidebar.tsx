import { memo } from 'react';
import { type SeatValue } from '../../hooks/useUrlState';

const SIDEBAR_BADGE_STYLE = {
  position: 'absolute',
  top: '-6px',
  right: '-6px',
  background: '#ef4444',
  color: '#fff',
  fontSize: '10px',
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: '10px',
} as const;

export interface SelectedSeatEntry {
  seatId: string;
  name: string | null;
}

interface SelectedSeatsSidebarProps {
  isOpen: boolean;
  selectedSeatId?: string;
  selectedEntries: SelectedSeatEntry[];
  isUrlWriteLimited: boolean;
  onToggleOpen: () => void;
  onClearAll: () => void;
  onSelectSeat: (seatId: string | undefined) => void;
  onSetSeatValue: (seatId: string, value: SeatValue | undefined) => void;
}

function SelectedSeatsSidebarComponent({
  isOpen,
  selectedSeatId,
  selectedEntries,
  isUrlWriteLimited,
  onToggleOpen,
  onClearAll,
  onSelectSeat,
  onSetSeatValue,
}: SelectedSeatsSidebarProps) {
  return (
    <div className={`collapsible-sidebar ${isOpen ? 'open' : ''}`}>
      <button
        className="sidebar-toggle"
        onClick={onToggleOpen}
        title={isOpen ? 'Hide selected seats' : 'Show selected seats'}
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
          transform={isOpen ? 'rotate(180)' : ''}
        >
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        {!isOpen && selectedEntries.length > 0 && (
          <span className="sidebar-toggle__badge" style={SIDEBAR_BADGE_STYLE}>
            {selectedEntries.length}
          </span>
        )}
      </button>

      <div className="sidebar-content">
        <div className="reserved-list">
          <div className="reserved-list__header">
            <span>Selected ({selectedEntries.length})</span>
            <button
              type="button"
              className="clear-all-btn"
              onClick={onClearAll}
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
                onClick={() => onSelectSeat(seatId)}
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
                    const value = e.target.value;
                    onSetSeatValue(seatId, value.length > 0 ? value : 1);
                  }}
                />
                <button
                  type="button"
                  className="reserved-list__remove"
                  title="Remove seat"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetSeatValue(seatId, undefined);
                    if (selectedSeatId === seatId) onSelectSeat(undefined);
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}

          <div className="room-view-footer sidebar-footer">
            <span>{isUrlWriteLimited ? 'Selection too large to fully save in URL' : 'State is saved in the URL'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SelectedSeatsSidebar = memo(SelectedSeatsSidebarComponent);
