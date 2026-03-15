import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Tables<'profiles'> | null;
  playerProfile: Tables<'player_profiles'> | null;
  managerProfile: any | null;
  club: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshPlayerProfile: () => Promise<void>;
  refreshManagerProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  playerProfile: null,
  managerProfile: null,
  club: null,
  loading: true,
  signOut: async () => {},
  refreshPlayerProfile: async () => {},
  refreshManagerProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [playerProfile, setPlayerProfile] = useState<Tables<'player_profiles'> | null>(null);
  const [managerProfile, setManagerProfile] = useState<any | null>(null);
  const [club, setClub] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data);
    return data;
  };

  const fetchPlayerProfile = async (userId: string) => {
    const { data } = await supabase.from('player_profiles').select('*').eq('user_id', userId).single();
    setPlayerProfile(data);
    return data;
  };

  const fetchManagerProfile = async (userId: string) => {
    const { data } = await supabase.from('manager_profiles').select('*').eq('user_id', userId).single();
    setManagerProfile(data);
    if (data) {
      const { data: clubData } = await supabase.from('clubs').select('*').eq('manager_profile_id', data.id).single();
      setClub(clubData);
    } else {
      setClub(null);
    }
    return data;
  };

  const refreshPlayerProfile = async () => {
    if (user) await fetchPlayerProfile(user.id);
  };

  const refreshManagerProfile = async () => {
    if (user) await fetchManagerProfile(user.id);
  };

  const loadUserData = async (userId: string) => {
    const prof = await fetchProfile(userId);
    if (prof?.role_selected === 'manager') {
      await fetchManagerProfile(userId);
    } else {
      await fetchPlayerProfile(userId);
    }
    setLoading(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setTimeout(() => loadUserData(session.user.id), 0);
      } else {
        setProfile(null);
        setPlayerProfile(null);
        setManagerProfile(null);
        setClub(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setPlayerProfile(null);
    setManagerProfile(null);
    setClub(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, playerProfile, managerProfile, club, loading, signOut, refreshPlayerProfile, refreshManagerProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
