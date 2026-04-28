import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trans, useTranslation } from 'react-i18next';
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

// Simplified SVG pitch with players, arrows and ball
function PitchMockup() {
  const { t } = useTranslation('landing');
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
      <text x="340" y="145" fontSize="7" fill="rgba(255,255,255,0.5)" fontFamily="sans-serif">{t('pitch_labels.pass')}</text>
      <text x="410" y="230" fontSize="7" fill="rgba(255,255,255,0.4)" fontFamily="sans-serif">{t('pitch_labels.shot')}</text>
      <text x="375" y="108" fontSize="6" fill="rgba(139,92,246,0.7)" fontFamily="sans-serif">{t('pitch_labels.intercept')}</text>
    </svg>
  );
}

export default function LandingPage() {
  const { t } = useTranslation('landing');

  const features = [
    { icon: Swords, key: 'turn_based' },
    { icon: Users, key: 'humans' },
    { icon: Shield, key: 'club' },
    { icon: TrendingUp, key: 'attributes' },
    { icon: Trophy, key: 'league' },
    { icon: DollarSign, key: 'economy' },
    { icon: ShoppingBag, key: 'store' },
    { icon: MessageSquare, key: 'community' },
  ] as const;

  const stats = [
    { value: '22', labelKey: 'players_per_match' },
    { value: '30+', labelKey: 'trainable_attributes' },
    { value: '20', labelKey: 'league_clubs' },
    { value: '3', labelKey: 'phases_per_turn' },
  ] as const;

  const steps = [
    { icon: UserPlus, step: '01', key: 'create' },
    { icon: Dumbbell, step: '02', key: 'train' },
    { icon: Gamepad2, step: '03', key: 'play' },
  ] as const;

  const arrows = [
    { color: 'text-green-400', key: 'green' },
    { color: 'text-cyan-400', key: 'blue' },
    { color: 'text-orange-400', key: 'orange' },
    { color: 'text-purple-400', key: 'purple' },
  ] as const;

  const playerItems = [0, 1, 2, 3, 4] as const;
  const managerItems = [0, 1, 2, 3, 4] as const;

  return (
    <div className="min-h-screen bg-primary text-primary-foreground">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-8 py-4 max-w-6xl mx-auto">
        <span className="font-display text-xl md:text-2xl font-bold tracking-tight">{t('nav.brand')}</span>
        <div className="flex gap-2">
          <Link to="/login"><Button variant="ghost" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 text-sm">{t('nav.login')}</Button></Link>
          <Link to="/register"><Button className="bg-pitch text-pitch-foreground hover:bg-pitch/90 text-sm">{t('nav.register')}</Button></Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 md:px-8 pt-12 pb-16 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <motion.div {...fadeUp()}>
            <h1 className="font-display text-4xl md:text-6xl font-extrabold leading-tight">
              {t('hero.title_line1')}<br />
              <span className="text-tactical">{t('hero.title_tactical')}</span>{' '}
              <span className="text-pitch">{t('hero.title_online')}</span>{' '}
              <span className="text-warning">{t('hero.title_persistent')}</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-primary-foreground/60 max-w-lg leading-relaxed">
              <Trans
                i18nKey="hero.subtitle_html"
                ns="landing"
                components={[<strong className="text-primary-foreground" />]}
              />
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/register">
                <Button size="lg" className="bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display text-base px-7">
                  {t('hero.cta_primary')} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/league">
                <Button size="lg" variant="outline" className="border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground hover:bg-primary-foreground/10 font-display text-base px-7">
                  {t('hero.cta_league')}
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
          <motion.h2 {...fadeUp()} className="font-display text-2xl md:text-3xl font-bold text-center mb-10">{t('how_it_works.title')}</motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <motion.div key={s.step} {...fadeUp(0.1 * i)} className="relative rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-6">
                <span className="font-display text-3xl font-black text-tactical/20 absolute top-4 right-5">{s.step}</span>
                <s.icon className="h-8 w-8 text-tactical mb-3" />
                <h3 className="font-display text-lg font-bold">{t(`how_it_works.steps.${s.key}.title`)}</h3>
                <p className="mt-2 text-sm text-primary-foreground/50">{t(`how_it_works.steps.${s.key}.desc`)}</p>
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
            <h2 className="font-display text-2xl md:text-3xl font-bold">{t('details.title')}</h2>
            <div className="space-y-4">
              {arrows.map(a => (
                <div key={a.key} className="flex items-start gap-3">
                  <ChevronRight className={`h-5 w-5 mt-0.5 shrink-0 ${a.color}`} />
                  <p className="text-sm text-primary-foreground/60">
                    <strong className={a.color}>{t(`details.arrows.${a.key}.label`)}</strong> {t(`details.arrows.${a.key}.desc`)}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Two paths: Player vs Manager */}
      <section className="px-6 md:px-8 py-16 bg-primary-foreground/[0.03]">
        <div className="max-w-6xl mx-auto">
          <motion.h2 {...fadeUp()} className="font-display text-2xl md:text-3xl font-bold text-center mb-10">{t('paths.title')}</motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div {...fadeUp(0.05)} className="rounded-lg border border-pitch/30 bg-pitch/5 p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-pitch/20 flex items-center justify-center"><Gamepad2 className="h-5 w-5 text-pitch" /></div>
                <h3 className="font-display text-xl font-bold text-pitch">{t('paths.player.title')}</h3>
              </div>
              <ul className="space-y-2 text-sm text-primary-foreground/60">
                {playerItems.map(i => (
                  <li key={i}>{t(`paths.player.items.${i}`)}</li>
                ))}
              </ul>
            </motion.div>
            <motion.div {...fadeUp(0.1)} className="rounded-lg border border-tactical/30 bg-tactical/5 p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-tactical/20 flex items-center justify-center"><Shield className="h-5 w-5 text-tactical" /></div>
                <h3 className="font-display text-xl font-bold text-tactical">{t('paths.manager.title')}</h3>
              </div>
              <ul className="space-y-2 text-sm text-primary-foreground/60">
                {managerItems.map(i => (
                  <li key={i}>{t(`paths.manager.items.${i}`)}</li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="px-6 md:px-8 py-16 max-w-6xl mx-auto">
        <motion.h2 {...fadeUp()} className="font-display text-2xl md:text-3xl font-bold text-center mb-10">{t('features.title')}</motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <motion.div key={f.key} {...fadeUp(0.05 * i)} className="rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-5">
              <f.icon className="h-6 w-6 text-tactical mb-2" />
              <h3 className="font-display text-sm font-bold">{t(`features.${f.key}.title`)}</h3>
              <p className="mt-1 text-xs text-primary-foreground/50">{t(`features.${f.key}.desc`)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 md:px-8 py-12 bg-primary-foreground/[0.03]">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s, i) => (
            <motion.div key={s.labelKey} {...fadeUp(0.08 * i)} className="text-center">
              <p className="font-display text-4xl md:text-5xl font-black text-tactical">{s.value}</p>
              <p className="text-xs text-primary-foreground/50 mt-1 uppercase tracking-wide">{t(`stats.${s.labelKey}`)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 md:px-8 py-20 max-w-3xl mx-auto text-center">
        <motion.div {...fadeUp()}>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold">{t('final_cta.title_line1')}<br /><span className="text-pitch">{t('final_cta.title_line2')}</span></h2>
          <p className="mt-4 text-primary-foreground/50">{t('final_cta.subtitle')}</p>
          <Link to="/register">
            <Button size="lg" className="mt-6 bg-pitch text-pitch-foreground hover:bg-pitch/90 font-display text-lg px-10">
              {t('final_cta.button')} <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-primary-foreground/10 px-6 md:px-8 py-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-primary-foreground/30">{t('footer.copyright')}</p>
          <div className="flex gap-4 text-xs text-primary-foreground/40">
            <Link to="/league" className="hover:text-primary-foreground/70 transition-colors">{t('footer.league')}</Link>
            <Link to="/forum" className="hover:text-primary-foreground/70 transition-colors">{t('footer.forum')}</Link>
            <Link to="/login" className="hover:text-primary-foreground/70 transition-colors">{t('footer.login')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
