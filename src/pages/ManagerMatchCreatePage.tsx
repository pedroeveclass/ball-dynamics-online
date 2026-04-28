import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { formatDate } from '@/lib/formatDate';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Swords, AlertCircle, Send } from 'lucide-react';
import { ClubCrest } from '@/components/ClubCrest';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface ClubOption {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
  reputation: number;
}

export default function ManagerMatchCreatePage() {
  const { t } = useTranslation('manager_match_create');
  const { current: lang } = useAppLanguage();
  const { club, managerProfile } = useAuth();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [awayClubId, setAwayClubId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hasLineup, setHasLineup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!club) return;
    const load = async () => {
      const [clubsRes, lineupRes] = await Promise.all([
        supabase.from('clubs').select('id, name, short_name, primary_color, secondary_color, reputation, crest_url').neq('id', club.id),
        supabase.from('lineups').select('id').eq('club_id', club.id).eq('is_active', true).limit(1),
      ]);
      setClubs(clubsRes.data || []);
      setHasLineup((lineupRes.data || []).length > 0);
      setLoading(false);
    };
    load();
    // Default to tomorrow at 20:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(20, 0, 0, 0);
    setScheduledAt(tomorrow.toISOString().slice(0, 16));
  }, [club]);

  const handleSendChallenge = async () => {
    if (!club || !awayClubId || !scheduledAt || !managerProfile) return;
    setSending(true);

    try {
      // Get manager profile of the challenged club
      const { data: awayClubData } = await supabase
        .from('clubs')
        .select('manager_profile_id')
        .eq('id', awayClubId)
        .single();

      if (!awayClubData?.manager_profile_id) {
        toast.error(t('toast.no_manager'));
        setSending(false);
        return;
      }

      // Get away manager's user_id for notification
      const { data: awayMgrData } = await supabase
        .from('manager_profiles')
        .select('user_id, full_name')
        .eq('id', awayClubData.manager_profile_id)
        .single();

      // Create the challenge
      const { data: challenge, error } = await supabase
        .from('match_challenges')
        .insert({
          challenger_club_id: club.id,
          challenged_club_id: awayClubId,
          challenger_manager_profile_id: managerProfile.id,
          challenged_manager_profile_id: awayClubData.manager_profile_id,
          scheduled_at: new Date(scheduledAt).toISOString(),
          message: message.trim() || null,
          status: 'proposed',
        })
        .select('id')
        .single();

      if (error) throw error;

      // Send notification to the challenged manager
      if (awayMgrData?.user_id) {
        const formattedDate = formatDate(new Date(scheduledAt), lang, 'datetime_short');
        await supabase.from('notifications').insert({
          user_id: awayMgrData.user_id,
          title: t('notification.title'),
          body: t('notification.body', { club: club.name, date: formattedDate }),
          type: 'match',
          link: '/manager/challenges',
          i18n_key: 'friendly_invite',
          i18n_params: { club: club.name, date: formattedDate },
        } as any);
      }

      toast.success(t('toast.sent'));
      navigate('/manager/challenges');
    } catch (err: any) {
      toast.error(err.message || t('toast.send_error'));
      setSending(false);
    }
  };

  if (loading) return <ManagerLayout><p className="text-muted-foreground">{t('loading')}</p></ManagerLayout>;

  return (
    <ManagerLayout>
      <div className="space-y-6 max-w-lg">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Swords className="h-6 w-6 text-tactical" /> {t('title')}
        </h1>

        {!hasLineup && (
          <div className="stat-card border-destructive/30 bg-destructive/5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="font-display font-bold text-sm">{t('lineup_required.title')}</p>
              <p className="text-xs text-muted-foreground">{t('lineup_required.subtitle')}</p>
            </div>
          </div>
        )}

        <div className="stat-card space-y-5">
          {/* Your club */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('your_club_label')}</p>
            <div className="flex items-center gap-2">
              <ClubCrest crestUrl={(club as any)?.crest_url} primaryColor={club?.primary_color || '#333'} secondaryColor={club?.secondary_color || '#fff'} shortName={club?.short_name || '?'} className="w-8 h-8 rounded text-xs" />
              <span className="font-display font-bold">{club?.name}</span>
            </div>
          </div>

          {/* Opponent */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('opponent_label')}</Label>
            <Select value={awayClubId} onValueChange={setAwayClubId}>
              <SelectTrigger>
                <SelectValue placeholder={t('opponent_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {clubs.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-sm inline-block" style={{ backgroundColor: c.primary_color }} />
                      {c.name} <span className="text-muted-foreground text-xs">{t('opponent_reputation', { reputation: c.reputation })}</span>
                    </span>
                  </SelectItem>
                ))}
                {clubs.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">{t('no_clubs_found')}</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Date & time */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('datetime_label')}</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              min={new Date().toISOString().slice(0, 16)}
              onChange={e => setScheduledAt(e.target.value)}
            />
          </div>

          {/* Optional message */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('message_label')}</Label>
            <Textarea
              placeholder={t('message_placeholder')}
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          <Button
            onClick={handleSendChallenge}
            disabled={sending || !awayClubId || !scheduledAt || !hasLineup}
            className="w-full bg-tactical text-tactical-foreground hover:bg-tactical/90 font-display"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? t('sending') : t('send_button')}
          </Button>
        </div>
      </div>
    </ManagerLayout>
  );
}
