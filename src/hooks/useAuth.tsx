import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Tables<'profiles'> | null;
  playerProfile: Tables<'player_profiles'> | null;
  managerProfile: Tables<'manager_profiles'> | null;
  club: Tables<'clubs'> | null;
  assistantClub: Tables<'clubs'> | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshPlayerProfile: () => Promise<void>;
  refreshManagerProfile: () => Promise<void>;
  refreshAssistantClub: () => Promise<void>;
  switchPlayerProfile: (playerProfileId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  playerProfile: null,
  managerProfile: null,
  club: null,
  assistantClub: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
  refreshPlayerProfile: async () => {},
  refreshManagerProfile: async () => {},
  refreshAssistantClub: async () => {},
  switchPlayerProfile: async () => {},
});

// Deep compare to avoid new object references when data hasn't changed
function stableSet<T>(setter: React.Dispatch<React.SetStateAction<T>>, newVal: T) {
  setter(prev => JSON.stringify(prev) === JSON.stringify(newVal) ? prev : newVal);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [playerProfile, setPlayerProfile] = useState<Tables<'player_profiles'> | null>(null);
  const [managerProfile, setManagerProfile] = useState<Tables<'manager_profiles'> | null>(null);
  const [club, setClub] = useState<Tables<'clubs'> | null>(null);
  const [assistantClub, setAssistantClub] = useState<Tables<'clubs'> | null>(null);
  const [loading, setLoading] = useState(true);
  const dataLoadedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  const fetchProfile = async (userId: string) => {
    const { data } = await (supabase.from('profiles').select('id, username, role_selected, created_at, updated_at, avatar_url, active_player_profile_id, is_admin').eq('id', userId).single() as any);
    stableSet(setProfile, data as any);
    return data;
  };

  const fetchPlayerProfile = async (userId: string, activePlayerId?: string | null) => {
    let data: any = null;
    if (activePlayerId) {
      // Load the specific active player
      const res = await supabase.from('player_profiles').select('*').eq('id', activePlayerId).eq('user_id', userId).maybeSingle();
      data = res.data;
    }
    if (!data) {
      // Fallback: load the first player for this user
      const res = await supabase.from('player_profiles').select('*').eq('user_id', userId).order('created_at', { ascending: true }).limit(1).maybeSingle();
      data = res.data;
    }
    stableSet(setPlayerProfile, data);
    return data;
  };

  const fetchManagerProfile = async (userId: string) => {
    const { data } = await supabase.from('manager_profiles').select('*').eq('user_id', userId).maybeSingle();
    stableSet(setManagerProfile, data);
    if (data) {
      const { data: clubData } = await supabase.from('clubs').select('*').eq('manager_profile_id', data.id).maybeSingle();
      stableSet(setClub, clubData ?? null);
    } else {
      stableSet(setClub, null);
    }
    return data;
  };

  const refreshPlayerProfile = async () => {
    if (!user) return;
    const { data: prof } = await supabase.from('profiles').select('active_player_profile_id').eq('id', user.id).maybeSingle();
    await fetchPlayerProfile(user.id, prof?.active_player_profile_id);
  };

  const switchPlayerProfile = async (playerProfileId: string) => {
    if (!user) return;
    await supabase.from('profiles').update({ active_player_profile_id: playerProfileId }).eq('id', user.id);
    await fetchPlayerProfile(user.id, playerProfileId);
  };

  const refreshManagerProfile = async () => {
    if (user) await fetchManagerProfile(user.id);
  };

  const fetchAssistantClub = async (userId: string) => {
    const { data } = await supabase.from('clubs').select('*').eq('assistant_manager_id', userId).maybeSingle();
    stableSet(setAssistantClub, data ?? null);
    return data;
  };

  const refreshAssistantClub = async () => {
    if (user) await fetchAssistantClub(user.id);
  };

  const loadUserData = async (userId: string) => {
    const prof = await fetchProfile(userId);
    if (prof?.role_selected === 'manager') {
      await fetchManagerProfile(userId);
    } else {
      await fetchPlayerProfile(userId, (prof as any)?.active_player_profile_id);
    }
    // Every user can be assistant to a club, regardless of role.
    await fetchAssistantClub(userId);
    dataLoadedRef.current = true;
    currentUserIdRef.current = userId;
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Only do a full reload if:
        // - Data hasn't been loaded yet (first load)
        // - A different user signed in
        const isNewUser = currentUserIdRef.current !== session.user.id;
        if (!dataLoadedRef.current || isNewUser) {
          setLoading(true);
          setTimeout(() => {
            if (mounted) loadUserData(session.user.id);
          }, 0);
        }
        // For TOKEN_REFRESHED, SIGNED_IN (same user), etc. — do nothing.
        // Data is already loaded and object refs are stable.
      } else {
        dataLoadedRef.current = false;
        currentUserIdRef.current = null;
        setProfile(null);
        setPlayerProfile(null);
        setManagerProfile(null);
        setClub(null);
        setAssistantClub(null);
        setLoading(false);
      }
    });

    // No separate getSession() call — onAuthStateChange with INITIAL_SESSION handles it.
    // This avoids a race condition between getSession and the subscription.

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Realtime: keep playerProfile in sync with server-side updates
  // (energy regen cron, train_attribute RPC, store purchases, etc.).
  useEffect(() => {
    const pid = playerProfile?.id;
    if (!pid) return;

    const channel = supabase
      .channel(`player_profile:${pid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'player_profiles', filter: `id=eq.${pid}` },
        (payload: any) => {
          const next = payload.new as Tables<'player_profiles'> | null;
          if (next) stableSet(setPlayerProfile, next);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [playerProfile?.id]);

  // Safety net: if the tab was in the background during a regen tick (or the
  // realtime socket dropped), refetch on focus so the user never stares at
  // stale energy.
  useEffect(() => {
    if (!user?.id) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshPlayerProfile();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    dataLoadedRef.current = false;
    currentUserIdRef.current = null;
    setSession(null);
    setUser(null);
    setProfile(null);
    setPlayerProfile(null);
    setManagerProfile(null);
    setClub(null);
    setAssistantClub(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, playerProfile, managerProfile, club, assistantClub, isAdmin: !!(profile as any)?.is_admin, loading, signOut, refreshPlayerProfile, refreshManagerProfile, refreshAssistantClub, switchPlayerProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
