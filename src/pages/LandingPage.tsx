import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Swords, Users, Trophy, TrendingUp, Shield, DollarSign, ShoppingBag, MessageSquare,
  ArrowRight, UserPlus, Dumbbell, Gamepad2, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay },
});

const features = [
  { icon: Swords, title: 'Partidas Turn-Based', desc: 'Cada turno tem 3 fases: posicionamento, ação e resolução. Cada decisão importa.' },
  { icon: Users, title: '22 Jogadores Humanos', desc: 'Cada posição no campo controlada por um jogador real. Futebol de verdade.' },
  { icon: Shield, title: 'Gestão Completa de Clube', desc: 'Escalação, formação tática, contratações, finanças e estádio.' },
  { icon: TrendingUp, title: '30+ Atributos Treináveis', desc: 'Velocidade, passe, chute, visão de jogo, força, resistência e muito mais.' },
  { icon: Trophy, title: 'Liga Competitiva', desc: '20 clubes, 19 rodadas, classificação real, artilharia e premiações.' },
  { icon: DollarSign, title: 'Economia Realista', desc: 'Salários semanais, transferências, bilheteria por jogo, instalações.' },
  { icon: ShoppingBag, title: 'Loja de Itens', desc: 'Chuteiras, luvas, energéticos, treinador particular — tudo influencia em campo.' },
  { icon: MessageSquare, title: 'Comunidade Ativa', desc: 'Fórum integrado com discussões, táticas, sugestões e reports.' },
];

const stats = [
  { value: '22', label: 'jogadores por partida' },
  { value: '30+', label: 'atributos treináveis' },
  { value: '20', label: 'clubes na liga' },
  { value: '3', label: 'fases por turno' },
];

// Simplified SVG pitch with players, arrows and ball
function PitchMockup() {
  const players = [
    // Home (yellow) — left side
    { x: 60, y: 160, num: 1, color: '#eab308' },
    { x: 150, y: 80, num: 3, color: '#eab308' },
    { x: 150, y: 160, num: 4, color: '#eab308' },
    { x: 150, y: 240, num: 2, color: '#eab308' },
    { x: 260, y: 100, num: 7, color: '#eab308' },
    { x: 260, y: 200, num: 8, color: '#eab308' },
    { x: 360, y: 90, num: 11, color: '#eab308' },
    { x: 340, y: 160, num: 10, color: '#eab308', hasBall: true },
    { x: 360, y: 230, num: 9, color: '#eab308' },
    // Away (blue) — right side
    { x: 540, y: 160, num: 1, color: '#3b82f6' },
    { x: 450, y: 80, num: 3, color: '#3b82f6' },
    { x: 450, y: 160, num: 5, color: '#3b82f6' },
    { x: 450, y: 240, num: 2, color: '#3b82f6' },
    { x: 380, y: 120, num: 6, color: '#3b82f6' },
    { x: 380, y: 200, num: 8, color: '#3b82f6' },
  ];

  return (
    <svg viewBox="0 0 600 320" className="w-full rounded-lg" style={{ background: '#1a472a' }}>
      {/* Field lines */}
      <rect x="20" y="10" width="560" height="300" rx="4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <line x1="300" y1="10" x2="300" y2="310" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <circle cx="300" cy="160" r="45" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <circle cx="300" cy="160" r="2" fill="rgba(255,255,255,0.3)" />
      {/* Goal areas */}
      <rect x="20" y="100" width="40" height="120" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <rect x="540" y="100" width="40" height="120" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      {/* Penalty areas */}
      <rect x="20" y="60" width="80" height="200" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <rect x="500" y="60" width="80" height="200" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

      {/* Action arrows */}
      <defs>
        <marker id="arr-green" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="#22c55e" />
        </marker>
        <marker id="arr-cyan" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="#06b6d4" />
        </marker>
        <marker id="arr-orange" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="#f97316" />
        </marker>
      </defs>
      {/* Move arrows (green dashed) */}
      <line x1="260" y1="100" x2="300" y2="80" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arr-green)" opacity="0.7" />
      <line x1="260" y1="200" x2="290" y2="210" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arr-green)" opacity="0.7" />
      {/* Pass arrow (cyan) */}
      <line x1="340" y1="160" x2="360" y2="90" stroke="#06b6d4" strokeWidth="2" markerEnd="url(#arr-cyan)" opacity="0.8" />
      {/* Shot arrow (orange) */}
      <line x1="360" y1="230" x2="540" y2="150" stroke="#f97316" strokeWidth="2" markerEnd="url(#arr-orange)" opacity="0.6" />

      {/* Purple intercept circle */}
      <circle cx="380" cy="120" r="22" fill="rgba(139,92,246,0.15)" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />

      {/* Ball */}
      <circle cx="345" cy="155" r="4" fill="white" stroke="#ccc" strokeWidth="0.5" />

      {/* Players */}
      {players.map((p, i) => (
        <g key={i}>
          {p.hasBall && <circle cx={p.x} cy={p.y} r="16" fill="none" stroke="#eab308" strokeWidth="1.5" opacity="0.5" />}
          <circle cx={p.x} cy={p.y} r="11" fill={p.color} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
          <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="white" fontFamily="sans-serif">{p.num}</text>
        </g>
      ))}

      {/* Labels */}
      <text x="340" y="145" fontSize="7" fill="rgba(255,255,255,0.5)" fontFamily="sans-serif">PASSE</text>
      <text x="410" y="230" fontSize="7" fill="rgba(255,255,255,0.4)" fontFamily="sans-serif">CHUTE</text>
      <text x="375" y="108" fontSize="6" fill="rgba(139,92,246,0.7)" fontFamily="sans-serif">INTERCEPTAR</text>
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-primary text-primary-foreground">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-8 py-4 max-w-6xl mx-auto">
        <span className="font-display text-xl md:text-2xl font-bold tracking-tight">FOOTBALL IDENTITY</span>
        <div className="flex gap-2">
          <Link to="/login"><Button variant="ghost" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 text-sm">Entrar</Button></Link>
          <Link to="/register"><Button className="bg-pitch text-pitch-foreground hover:bg-pitch/90 text-sm">Criar Conta</Button></Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 md:px-8 pt-12 pb-16 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <motion.div {...fadeUp()}>
            <h1 className="font-display text-4xl md:text-6xl font-extrabold leading-tight">
              FUTEBOL<br />
              <span className="text-tactical">TATICO.</span>{' '}
              <span className="text-pitch">ONLINE.</span>{' '}
              <span className="text-warning">PERSISTENTE.</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-primary-foreground/60 max-w-lg leading-relaxed">
              O unico jogo onde <strong className="text-primary-foreground">22 jogadores humanos</strong> controlam cada posicao em campo.
              Cada turno voce decide: mover, passar, chutar, driblar ou interceptar.
              Crie seu atleta ou assuma como tecnico — sua carreira comeca agora.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/register">
                <Button size="lg" className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display text-base px-7">
                  COMECAR AGORA <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/league">
                <Button size="lg" variant="outline" className="border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground hover:bg-primary-foreground/10 font-display text-base px-7">
                  VER LIGA
                </Button>
              </Link>
            </div>
          </motion.div>
          <motion.div {...fadeUp(0.2)}>
            <PitchMockup />
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-8 py-16 bg-primary-foreground/[0.03]">
        <div className="max-w-6xl mx-auto">
          <motion.h2 {...fadeUp()} className="font-display text-2xl md:text-3xl font-bold text-center mb-10">Como Funciona</motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: UserPlus, step: '01', title: 'Crie seu Personagem', desc: 'Escolha ser Jogador ou Tecnico. Defina posicao, nome e comece sua jornada.' },
              { icon: Dumbbell, step: '02', title: 'Treine e Evolua', desc: 'Gaste energia treinando 30+ atributos. Quanto mais treina, mais forte fica.' },
              { icon: Gamepad2, step: '03', title: 'Jogue Partidas Reais', desc: 'Entre em campo com outros humanos. Cada turno: mova, passe, chute, intercepte.' },
            ].map((s, i) => (
              <motion.div key={s.step} {...fadeUp(0.1 * i)} className="relative rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-6">
                <span className="font-display text-3xl font-black text-tactical/20 absolute top-4 right-5">{s.step}</span>
                <s.icon className="h-8 w-8 text-tactical mb-3" />
                <h3 className="font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-primary-foreground/50">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Game screenshot with annotations */}
      <section className="px-6 md:px-8 py-16 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <motion.div {...fadeUp()} className="order-2 lg:order-1">
            <PitchMockup />
          </motion.div>
          <motion.div {...fadeUp(0.15)} className="order-1 lg:order-2 space-y-5">
            <h2 className="font-display text-2xl md:text-3xl font-bold">Cada Detalhe Importa</h2>
            <div className="space-y-4">
              {[
                { color: 'text-green-400', label: 'Setas verdes', desc: 'indicam a movimentacao dos jogadores no campo.' },
                { color: 'text-cyan-400', label: 'Setas azuis', desc: 'mostram passes para companheiros de equipe.' },
                { color: 'text-orange-400', label: 'Setas laranjas', desc: 'representam chutes ao gol com direcao e forca.' },
                { color: 'text-purple-400', label: 'Circulo roxo', desc: 'aparece quando voce pode interceptar a bola. Clique para agir!' },
              ].map(a => (
                <div key={a.label} className="flex items-start gap-3">
                  <ChevronRight className={`h-5 w-5 mt-0.5 shrink-0 ${a.color}`} />
                  <p className="text-sm text-primary-foreground/60"><strong className={a.color}>{a.label}</strong> {a.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Two paths: Player vs Manager */}
      <section className="px-6 md:px-8 py-16 bg-primary-foreground/[0.03]">
        <div className="max-w-6xl mx-auto">
          <motion.h2 {...fadeUp()} className="font-display text-2xl md:text-3xl font-bold text-center mb-10">Dois Caminhos, Uma Paixao</motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div {...fadeUp(0.05)} className="rounded-lg border border-pitch/30 bg-pitch/5 p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-pitch/20 flex items-center justify-center"><Gamepad2 className="h-5 w-5 text-pitch" /></div>
                <h3 className="font-display text-xl font-bold text-pitch">Jogador</h3>
              </div>
              <ul className="space-y-2 text-sm text-primary-foreground/60">
                <li>Controle seu atleta em cada turno da partida</li>
                <li>Treine atributos diariamente (velocidade, passe, chute...)</li>
                <li>Negocie contratos e salarios com clubes</li>
                <li>Compre itens na loja: chuteiras, energeticos, treinador</li>
                <li>Construa reputacao e suba de overall</li>
              </ul>
            </motion.div>
            <motion.div {...fadeUp(0.1)} className="rounded-lg border border-tactical/30 bg-tactical/5 p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-tactical/20 flex items-center justify-center"><Shield className="h-5 w-5 text-tactical" /></div>
                <h3 className="font-display text-xl font-bold text-tactical">Tecnico</h3>
              </div>
              <ul className="space-y-2 text-sm text-primary-foreground/60">
                <li>Monte a escalacao e defina a formacao tatica</li>
                <li>Contrate jogadores humanos no mercado</li>
                <li>Gerencie financas: salarios, bilheteria, instalacoes</li>
                <li>Evolua o estadio e centro de treino</li>
                <li>Envie convites de amistoso e dispute a liga</li>
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="px-6 md:px-8 py-16 max-w-6xl mx-auto">
        <motion.h2 {...fadeUp()} className="font-display text-2xl md:text-3xl font-bold text-center mb-10">Tudo Que Voce Precisa</motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <motion.div key={f.title} {...fadeUp(0.05 * i)} className="rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-5">
              <f.icon className="h-6 w-6 text-tactical mb-2" />
              <h3 className="font-display text-sm font-bold">{f.title}</h3>
              <p className="mt-1 text-xs text-primary-foreground/50">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 md:px-8 py-12 bg-primary-foreground/[0.03]">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s, i) => (
            <motion.div key={s.label} {...fadeUp(0.08 * i)} className="text-center">
              <p className="font-display text-4xl md:text-5xl font-black text-tactical">{s.value}</p>
              <p className="text-xs text-primary-foreground/50 mt-1 uppercase tracking-wide">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 md:px-8 py-20 max-w-3xl mx-auto text-center">
        <motion.div {...fadeUp()}>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold">Pronto para criar sua<br /><span className="text-pitch">identidade no futebol?</span></h2>
          <p className="mt-4 text-primary-foreground/50">Crie sua conta gratis e entre em campo agora mesmo.</p>
          <Link to="/register">
            <Button size="lg" className="mt-6 bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display text-lg px-10">
              CRIAR CONTA GRATIS <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-primary-foreground/10 px-6 md:px-8 py-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-primary-foreground/30">2025 Football Identity. Todos os direitos reservados.</p>
          <div className="flex gap-4 text-xs text-primary-foreground/40">
            <Link to="/league" className="hover:text-primary-foreground/70 transition-colors">Liga</Link>
            <Link to="/forum" className="hover:text-primary-foreground/70 transition-colors">Forum</Link>
            <Link to="/login" className="hover:text-primary-foreground/70 transition-colors">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
