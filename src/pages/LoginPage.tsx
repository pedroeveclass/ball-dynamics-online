import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { user, profile, playerProfile, managerProfile, club, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;

  // Smart redirect based on role
  if (user && profile) {
    if (profile.role_selected === 'manager') {
      if (managerProfile && club) return <Navigate to="/manager" replace />;
      return <Navigate to="/onboarding/manager" replace />;
    } else {
      if (playerProfile) return <Navigate to="/player" replace />;
      return <Navigate to="/onboarding/player" replace />;
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    toast.success('Login realizado!');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">FOOTBALL IDENTITY</h1>
          <p className="mt-2 text-sm text-primary-foreground/60">Entre na sua conta</p>
        </div>
        <form onSubmit={handleLogin} className="rounded-lg bg-card p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          <Button type="submit" disabled={submitting} className="w-full bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
            {submitting ? 'Entrando...' : 'ENTRAR'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Não tem conta?{' '}
            <Link to="/register" className="text-tactical hover:underline">Criar conta</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
