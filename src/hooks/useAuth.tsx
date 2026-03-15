import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Tables<'profiles'> | null;
  playerProfile: Tables<'player_profiles'> | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshPlayerProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  playerProfile: null,
  loading: true,
  signOut: async () => {},
  refreshPlayerProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [playerProfile, setPlayerProfile] = useState<Tables<'player_profiles'> | null>(null);
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

  const refreshPlayerProfile = async () => {
    if (user) await fetchPlayerProfile(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Use setTimeout to avoid Supabase auth deadlock
        setTimeout(async () => {
          await fetchProfile(session.user.id);
          await fetchPlayerProfile(session.user.id);
          setLoading(false);
        }, 0);
      } else {
        setProfile(null);
        setPlayerProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(() =>
          fetchPlayerProfile(session.user.id).then(() => setLoading(false))
        );
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
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, playerProfile, loading, signOut, refreshPlayerProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
