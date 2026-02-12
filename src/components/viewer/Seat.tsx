import { memo, useCallback, type KeyboardEvent } from 'react';

export type SeatStatus = 'available' | 'reserved' | 'blocked';

export interface SeatModel {
  id: string;
  label?: string;
  x: number;
  y: number;
  status?: SeatStatus;
}

interface SeatProps {
  seat: SeatModel;
  selected?: boolean;
  onSelect?: (seat: SeatModel) => void;
}

const STATUS_CLASS: Record<SeatStatus, string> = {
  available: 'seat--available',
  reserved: 'seat--reserved',
  blocked: 'seat--blocked',
};

function SeatComponent({ seat, selected = false, onSelect }: SeatProps) {
  const handleClick = useCallback(() => {
    onSelect?.(seat);
  }, [onSelect, seat]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect?.(seat);
      }
    },
    [onSelect, seat],
  );

  const statusClass = STATUS_CLASS[seat.status ?? 'available'];

  return (
    <button
      type="button"
      className={`seat ${statusClass} ${selected ? 'seat--selected' : ''}`.trim()}
      style={{
        position: 'absolute',
        left: `${seat.x}%`,
        top: `${seat.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: selected ? 3 : 2,
      }}
      aria-pressed={selected}
      aria-label={seat.label ?? `Seat ${seat.id}`}
      title={seat.label ?? seat.id}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-seat-id={seat.id}
    >
      <span className="seat__dot" aria-hidden="true" />
      {seat.label ? <span className="seat__label">{seat.label}</span> : null}
    </button>
  );
}

export const Seat = memo(SeatComponent);
