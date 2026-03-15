import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function RegisterPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'player' | ''>('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/player" replace />;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) { toast.error('Escolha um papel'); return; }
    if (username.trim().length < 2) { toast.error('Nome de usuário deve ter no mínimo 2 caracteres'); return; }
    setSubmitting(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim(), role_selected: role },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    toast.success('Conta criada com sucesso!');
    navigate('/onboarding/player', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">PITCHTACTICS</h1>
          <p className="mt-2 text-sm text-primary-foreground/60">Crie sua conta</p>
        </div>
        <form onSubmit={handleRegister} className="rounded-lg bg-card p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Nome de usuário</Label>
            <Input id="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="SeuNome" required minLength={2} maxLength={30} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          <div className="space-y-2">
            <Label>Escolha seu papel</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('player')}
                className={`w-full h-20 flex flex-col items-center justify-center gap-1 rounded-md border transition-colors ${
                  role === 'player' ? 'border-pitch bg-pitch/10 text-pitch' : 'border-border text-muted-foreground hover:border-pitch/40'
                }`}
              >
                <span className="font-display text-lg font-bold">⚽ Jogador</span>
                <span className="text-[10px]">Crie seu atleta</span>
              </button>
              <button
                type="button"
                disabled
                className="w-full h-20 flex flex-col items-center justify-center gap-1 rounded-md border border-border text-muted-foreground/40 cursor-not-allowed"
              >
                <span className="font-display text-lg font-bold">📋 Manager</span>
                <span className="text-[10px]">Em breve</span>
              </button>
            </div>
          </div>
          <Button type="submit" disabled={submitting || !role} className="w-full bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">
            {submitting ? 'Criando...' : 'CRIAR CONTA'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Já tem conta?{' '}
            <Link to="/login" className="text-tactical hover:underline">Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
