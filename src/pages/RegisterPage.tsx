import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-primary-foreground">PITCHTACTICS</h1>
          <p className="mt-2 text-sm text-primary-foreground/60">Crie sua conta</p>
        </div>
        <div className="rounded-lg bg-card p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Nome de usuário</Label>
            <Input id="username" placeholder="SeuNome" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="seu@email.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label>Escolha seu papel</Label>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/player">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-1 border-border hover:border-pitch hover:bg-pitch/5">
                  <span className="font-display text-lg font-bold">⚽ Jogador</span>
                  <span className="text-[10px] text-muted-foreground">Crie seu atleta</span>
                </Button>
              </Link>
              <Link to="/manager">
                <Button variant="outline" className="w-full h-20 flex flex-col gap-1 border-border hover:border-tactical hover:bg-tactical/5">
                  <span className="font-display text-lg font-bold">📋 Manager</span>
                  <span className="text-[10px] text-muted-foreground">Gerencie um clube</span>
                </Button>
              </Link>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Já tem conta?{' '}
            <Link to="/login" className="text-tactical hover:underline">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
