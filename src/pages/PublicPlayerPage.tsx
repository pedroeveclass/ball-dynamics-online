import { useEffect, useState, ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ManagerLayout } from '@/components/ManagerLayout';
import { AppLayout } from '@/components/AppLayout';
import { PositionBadge } from '@/components/PositionBadge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  User, Star, Footprints, Ruler, Dumbbell, Brain, Crosshair,
  ShieldAlert, Goal, Loader2, ArrowLeft, UserPlus, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { CareerStatsBlock } from '@/components/player/CareerStatsBlock';

interface AttrRow { label: string; key: string }

const PHYSICAL: AttrRow[] = [
  { label: 'Velocidade', key: 'velocidade' },
  { label: 'Aceleração', key: 'aceleracao' },
  { label: 'Agilidade', key: 'agilidade' },
  { label: 'Força', key: 'forca' },
  { label: 'Stamina', key: 'stamina' },
  { label: 'Resistência', key: 'resistencia' },
];
const TECHNICAL: AttrRow[] = [
  { label: 'Controle de Bola', key: 'controle_bola' },
  { label: 'Drible', key: 'drible' },
  { label: 'Passe Baixo', key: 'passe_baixo' },
  { label: 'Passe Alto', key: 'passe_alto' },
  { label: 'Um Toque', key: 'um_toque' },
  { label: 'Curva', key: 'curva' },
];
const MENTAL: AttrRow[] = [
  { label: 'Visão de Jogo', key: 'visao_jogo' },
  { label: 'Tomada de Decisão', key: 'tomada_decisao' },
  { label: 'Antecipação', key: 'antecipacao' },
  { label: 'Trabalho em Equipe', key: 'trabalho_equipe' },
  { label: 'Coragem', key: 'coragem' },
];
const SHOOTING: AttrRow[] = [
  { label: 'Acurácia Chute', key: 'acuracia_chute' },
  { label: 'Força Chute', key: 'forca_chute' },
  { label: 'Cabeceio', key: 'cabeceio' },
];
const DEFENDING: AttrRow[] = [
  { label: 'Desarme', key: 'desarme' },
  { label: 'Marcação', key: 'marcacao' },
];
const GK_ATTRS: AttrRow[] = [
  { label: 'Reflexo', key: 'reflexo' },
  { label: 'Posic. Gol', key: 'posicionamento_gol' },
  { label: 'Pegada', key: 'pegada' },
  { label: 'Saída de Gol', key: 'saida_gol' },
  { label: 'Comando de Área', key: 'comando_area' },
];

function AttrGroup({ title, icon, rows, attrs }: { title: string; icon: ReactNode; rows: AttrRow[]; attrs: any }) {
  const avg = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + Number(attrs?.[r.key] ?? 0), 0) / rows.length)
    : 0;
  const color = avg >= 70 ? 'text-pitch' : avg >= 50 ? 'text-yellow-500' : 'text-destructive';
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-28 shrink-0">
        {icon}
        <span className="text-sm text-muted-foreground">{title}</span>
      </div>
      <Progress value={avg} className="flex-1 h-2.5" />
      <span className={`w-8 text-right font-display font-bold text-sm ${color}`}>{avg}</span>
    </div>
  );
}

function Layout({ children }: { children: ReactNode }) {
  const { managerProfile, playerProfile, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (managerProfile) return <ManagerLayout>{children}</ManagerLayout>;
  if (playerProfile) return <AppLayout>{children}</AppLayout>;
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <User className="h-5 w-5 text-tactical" />
          <span className="font-display text-lg font-bold">Perfil do Jogador</span>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

export default function PublicPlayerPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { managerProfile, club } = useAuth();
  const [player, setPlayer] = useState<any>(null);
  const [attrs, setAttrs] = useState<any>(null);
  const [clubInfo, setClubInfo] = useState<{ name: string; primary: string; secondary: string; crestUrl: string | null } | null>(null);
  const [bodyVariant, setBodyVariant] = useState<'full-front' | 'full-back'>('full-front');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from('player_profiles')
        .select('*')
        .eq('id', playerId)
        .maybeSingle();
      setPlayer(p);

      if (p) {
        const { data: a } = await supabase
          .from('player_attributes')
          .select('*')
          .eq('player_profile_id', playerId)
          .maybeSingle();
        setAttrs(a);

        if (p.club_id) {
          const { data: c } = await supabase
            .from('clubs')
            .select('name, primary_color, secondary_color, crest_url')
            .eq('id', p.club_id)
            .maybeSingle();
          if (c) setClubInfo({ name: c.name, primary: c.primary_color, secondary: c.secondary_color, crestUrl: (c as any).crest_url ?? null });
        }
      }
      setLoading(false);
    })();
  }, [playerId]);

  const ovrColor = (ovr: number) =>
    ovr > 70 ? 'text-pitch' : ovr > 50 ? 'text-yellow-500' : 'text-destructive';

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/player/${playerId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado!');
    } catch {
      toast.info(url);
    }
  };

  if (loading) {
    return <Layout><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  }

  if (!player) {
    return <Layout><div className="stat-card text-center py-12"><p className="text-muted-foreground">Jogador não encontrado.</p></div></Layout>;
  }

  const isGK = player.primary_position === 'GK';
  const footLabel = player.dominant_foot === 'right' ? 'Destro' : player.dominant_foot === 'left' ? 'Canhoto' : 'Ambidestro';
  const canMakeOffer = !!managerProfile && !!club && player.club_id !== club.id;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="stat-card p-4">
          <div className="flex items-start gap-4">
            <PlayerAvatar
              appearance={(player as any).appearance}
              variant="face"
              clubPrimaryColor={clubInfo?.primary}
              clubSecondaryColor={clubInfo?.secondary}
              playerName={player.full_name}
              className="h-20 w-20 shrink-0 border-2"
              fallbackSeed={player.id}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-2xl font-bold truncate">{player.full_name}</h1>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleCopyLink}>
                  <Copy className="h-3 w-3 mr-1" /> Copiar link
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <PositionBadge position={player.primary_position} />
                {player.secondary_position && <PositionBadge position={player.secondary_position} />}
                {player.archetype && <Badge variant="outline" className="text-xs">{player.archetype}</Badge>}
              </div>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                <span>{player.age} anos</span>
                <span className="flex items-center gap-1"><Footprints className="h-3.5 w-3.5" />{footLabel}</span>
                <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{player.height} cm</span>
              </div>
            </div>

            <div className="text-center shrink-0">
              <span className={`font-display text-4xl font-extrabold ${ovrColor(player.overall)}`}>{player.overall}</span>
              <p className="text-xs text-muted-foreground">OVR</p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-3 mt-3 border-t border-border flex-wrap">
            {clubInfo ? (
              <Badge variant="secondary" className="gap-1.5 text-sm">
                <div
                  className="w-4 h-4 rounded-sm flex items-center justify-center text-[6px] font-bold"
                  style={{ backgroundColor: clubInfo.primary, color: clubInfo.secondary }}
                >C</div>
                {clubInfo.name}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-sm text-muted-foreground">Agente Livre</Badge>
            )}
            <Badge variant="outline" className="gap-1 text-xs">
              <Star className="h-3 w-3" /> Reputação {player.reputation ?? 0}
            </Badge>
            {canMakeOffer && (
              <Button size="sm" className="ml-auto" onClick={() => navigate('/manager/market')}>
                <UserPlus className="h-4 w-4 mr-1" /> Fazer proposta
              </Button>
            )}
          </div>
        </div>

        {/* Full-body visual */}
        {(player as any).appearance && (
          <div className="stat-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-lg font-bold">Visual do Jogador</h2>
              <div className="flex gap-1">
                {(['full-front', 'full-back'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setBodyVariant(v)}
                    className={`px-3 py-1 rounded text-xs font-display font-semibold transition-colors ${
                      bodyVariant === v ? 'bg-tactical text-tactical-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {v === 'full-front' ? 'Frente' : 'Costas'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-center py-2">
              <div className="h-80 w-40">
                <PlayerAvatar
                  appearance={(player as any).appearance}
                  variant={bodyVariant}
                  height={player.height}
                  clubPrimaryColor={clubInfo?.primary}
                  clubSecondaryColor={clubInfo?.secondary}
                  clubCrestUrl={clubInfo?.crestUrl}
                  playerName={player.full_name}
                  jerseyNumber={(player as any).jersey_number}
                  className="w-full h-full"
                  fallbackSeed={player.id}
                />
              </div>
            </div>
          </div>
        )}

        {/* Career Statistics (position-specific block) */}
        <CareerStatsBlock playerProfileId={player.id} position={player.primary_position} />

        {/* Attributes */}
        {attrs && (
          <div className="stat-card p-4 space-y-3">
            <h2 className="font-display text-lg font-bold">Atributos</h2>
            <div className="space-y-2">
              {isGK && <AttrGroup title="Goleiro" icon={<Goal className="h-4 w-4" />} rows={GK_ATTRS} attrs={attrs} />}
              <AttrGroup title="Físico" icon={<Dumbbell className="h-4 w-4" />} rows={PHYSICAL} attrs={attrs} />
              <AttrGroup title="Técnico" icon={<Crosshair className="h-4 w-4" />} rows={TECHNICAL} attrs={attrs} />
              <AttrGroup title="Mental" icon={<Brain className="h-4 w-4" />} rows={MENTAL} attrs={attrs} />
              <AttrGroup title="Finalização" icon={<Crosshair className="h-4 w-4" />} rows={SHOOTING} attrs={attrs} />
              <AttrGroup title="Defesa" icon={<ShieldAlert className="h-4 w-4" />} rows={DEFENDING} attrs={attrs} />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
