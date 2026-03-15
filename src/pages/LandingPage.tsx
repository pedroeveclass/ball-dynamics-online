import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Swords, Users, Trophy, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  { icon: Swords, title: 'Partidas Turn-Based', desc: 'Cada jogada importa. 6 segundos para decidir o futuro do lance.' },
  { icon: Users, title: 'Multiplayer 11v11', desc: 'Jogadores reais em campo. Cada posição controlada por um humano.' },
  { icon: Trophy, title: 'Ligas Competitivas', desc: 'Temporadas completas com classificação, artilharia e prêmios.' },
  { icon: TrendingUp, title: 'Progressão Real', desc: 'Evolua atributos, gerencie carreira e construa sua identidade.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-primary">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4">
        <span className="font-display text-2xl font-bold text-primary-foreground tracking-tight">FOOTBALL IDENTITY</span>
        <div className="flex gap-3">
          <Link to="/login">
            <Button variant="ghost" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10">Entrar</Button>
          </Link>
          <Link to="/register">
            <Button className="bg-pitch text-pitch-foreground hover:bg-pitch/90">Criar Conta</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-8 py-20 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-display text-5xl md:text-7xl font-extrabold text-primary-foreground leading-tight">
            FUTEBOL<br />
            <span className="text-tactical">TÁTICO.</span>{' '}
            <span className="text-pitch">ONLINE.</span>{' '}
            <span className="text-warning">PERSISTENTE.</span>
          </h1>
          <p className="mt-6 text-lg text-primary-foreground/70 max-w-2xl leading-relaxed">
            Simulador tático de futebol turn-based. Crie seu atleta, entre em um clube, 
            dispute ligas reais e construa sua carreira — ou assuma a gestão completa como Manager.
          </p>
          <div className="mt-8 flex gap-4">
            <Link to="/register">
              <Button size="lg" className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display text-lg px-8">
                COMEÇAR AGORA
              </Button>
            </Link>
            <Link to="/league">
              <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 font-display text-lg px-8">
                VER LIGAS
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="px-8 pb-20 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * i }}
              className="rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-6"
            >
              <f.icon className="h-8 w-8 text-tactical mb-3" />
              <h3 className="font-display text-xl font-bold text-primary-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-primary-foreground/60">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-primary-foreground/10 px-8 py-6">
        <p className="text-center text-xs text-primary-foreground/40">© 2025 Football Identity. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
