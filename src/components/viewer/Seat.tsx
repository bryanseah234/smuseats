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
    (event: KeyboardEvent<SVGGElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect?.(seat);
      }
    },
    [onSelect, seat],
  );

  const statusClass = STATUS_CLASS[seat.status ?? 'available'];

  return (
    <g
      className={`seat ${statusClass} ${selected ? 'seat--selected' : ''}`.trim()}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={seat.label ?? `Seat ${seat.id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-seat-id={seat.id}
    >
      <title>{seat.label ?? seat.id}</title>
      <circle className="seat__dot" cx={seat.x} cy={seat.y} r={1.2} />
    </g>
  );
}

export const Seat = memo(SeatComponent);
