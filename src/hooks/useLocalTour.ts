import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'bdo_tutorials_seen';

type SeenMap = Record<string, string>;

function readSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

function writeSeen(seen: SeenMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    /* private mode / quota */
  }
}

export function useLocalTour(key: string) {
  const [shouldRun, setShouldRun] = useState(false);

  useEffect(() => {
    const seen = readSeen();
    setShouldRun(!seen[key]);
  }, [key]);

  const markSeen = useCallback(() => {
    const seen = readSeen();
    seen[key] = new Date().toISOString();
    writeSeen(seen);
    setShouldRun(false);
  }, [key]);

  const reset = useCallback(() => {
    const seen = readSeen();
    delete seen[key];
    writeSeen(seen);
    setShouldRun(true);
  }, [key]);

  return { shouldRun, markSeen, reset };
}

export function resetAllTutorials() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
