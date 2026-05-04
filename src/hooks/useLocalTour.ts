import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

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

// Authoritative source: profiles.tutorials_seen (per-user, server-backed).
// localStorage is kept in sync as a write-through cache so unauthenticated
// or pre-profile-load reads still gate, and so the dev resetAllTutorials()
// helper still wipes the visible state.
export function useLocalTour(key: string) {
  const { user, profile, markTutorialSeen } = useAuth();
  const [shouldRun, setShouldRun] = useState(false);

  useEffect(() => {
    // Wait for auth/profile to load before deciding. Profile is the truth;
    // localStorage is fallback for users not yet logged in.
    if (user && !profile) {
      setShouldRun(false);
      return;
    }
    const serverSeen = ((profile as any)?.tutorials_seen as SeenMap | null) ?? {};
    const localSeen = readSeen();
    setShouldRun(!serverSeen[key] && !localSeen[key]);
  }, [key, user?.id, profile?.id, (profile as any)?.tutorials_seen]);

  const markSeen = useCallback(() => {
    const seen = readSeen();
    seen[key] = new Date().toISOString();
    writeSeen(seen);
    setShouldRun(false);
    void markTutorialSeen(key);
  }, [key, markTutorialSeen]);

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
  // Best-effort server clear; if no auth session, the RPC just no-ops.
  void (supabase as any).rpc('reset_tutorials_seen');
}
