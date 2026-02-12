import { useCallback, useMemo, useState } from 'react';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

const QUERY_PARAM_KEY = 's';

export type SeatValue = 1 | string;
export type SeatDataMap = Record<string, SeatValue>;

export interface SessionState {
  r: string;
  d: SeatDataMap;
}

const DEFAULT_SESSION_STATE: SessionState = {
  r: '',
  d: {},
};

const isSeatValue = (value: unknown): value is SeatValue =>
  value === 1 || typeof value === 'string';

const isSeatDataMap = (value: unknown): value is SeatDataMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isSeatValue);
};

const isSessionState = (value: unknown): value is SessionState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<SessionState>;
  return typeof candidate.r === 'string' && isSeatDataMap(candidate.d);
};

const decodeSessionState = (encoded: string | null): SessionState => {
  if (!encoded) {
    return DEFAULT_SESSION_STATE;
  }

  try {
    const decompressed = decompressFromEncodedURIComponent(encoded);
    if (!decompressed) {
      return DEFAULT_SESSION_STATE;
    }

    const parsed = JSON.parse(decompressed) as unknown;
    if (!isSessionState(parsed)) {
      return DEFAULT_SESSION_STATE;
    }

    return parsed;
  } catch {
    return DEFAULT_SESSION_STATE;
  }
};

const encodeSessionState = (state: SessionState): string =>
  compressToEncodedURIComponent(JSON.stringify(state));

const readSessionFromUrl = (): SessionState => {
  if (typeof window === 'undefined') {
    return DEFAULT_SESSION_STATE;
  }

  const params = new URLSearchParams(window.location.search);
  return decodeSessionState(params.get(QUERY_PARAM_KEY));
};

const writeSessionToUrl = (state: SessionState): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  params.set(QUERY_PARAM_KEY, encodeSessionState(state));
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', nextUrl);
};

export interface UseUrlStateResult {
  state: SessionState;
  setRoomId: (roomId: string) => void;
  setSeatData: (seatData: SeatDataMap) => void;
  setSeatValue: (seatId: string, value: SeatValue | undefined) => void;
  clearState: () => void;
}

export const useUrlState = (): UseUrlStateResult => {
  const [state, setState] = useState<SessionState>(() => readSessionFromUrl());

  const updateState = useCallback((updater: (prev: SessionState) => SessionState) => {
    setState((prev) => {
      const next = updater(prev);
      writeSessionToUrl(next);
      return next;
    });
  }, []);

  const setRoomId = useCallback(
    (roomId: string) => {
      updateState((prev) => ({ ...prev, r: roomId }));
    },
    [updateState],
  );

  const setSeatData = useCallback(
    (seatData: SeatDataMap) => {
      updateState((prev) => ({ ...prev, d: { ...seatData } }));
    },
    [updateState],
  );

  const setSeatValue = useCallback(
    (seatId: string, value: SeatValue | undefined) => {
      updateState((prev) => {
        const nextData = { ...prev.d };

        if (value === undefined) {
          delete nextData[seatId];
        } else {
          nextData[seatId] = value;
        }

        return { ...prev, d: nextData };
      });
    },
    [updateState],
  );

  const clearState = useCallback(() => {
    // Reset local session state and remove URL-backed state parameter.
    setState(DEFAULT_SESSION_STATE);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete(QUERY_PARAM_KEY);
      window.history.replaceState(null, '', url.toString());
    }
  }, [setState]);
  return useMemo(
    () => ({
      state,
      setRoomId,
      setSeatData,
      setSeatValue,
      clearState,
    }),
    [clearState, setRoomId, setSeatData, setSeatValue, state],
  );
};
