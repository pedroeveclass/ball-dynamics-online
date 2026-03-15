import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">PITCHTACTICS</h1>
          <p className="mt-2 text-sm text-primary-foreground/60">Entre na sua conta</p>
        </div>
        <div className="rounded-lg bg-card p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="seu@email.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" placeholder="••••••••" />
          </div>
          <Link to="/player">
            <Button className="w-full bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display">ENTRAR</Button>
          </Link>
          <p className="text-center text-xs text-muted-foreground">
            Não tem conta?{' '}
            <Link to="/register" className="text-tactical hover:underline">Criar conta</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
