import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { formatDate } from '@/lib/formatDate';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users2, Plus, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PICKUP_SLOTS, type PickupFormat, totalSlotsPerSide } from '@/lib/pickupSlots';

type PickupRow = {
  id: string;
  created_by_profile_id: string;
  format: PickupFormat;
  formation: string;
  kickoff_at: string;
  status: 'open' | 'materialized' | 'live' | 'finished' | 'cancelled';
  match_id: string | null;
  created_at: string;
};

type ParticipantRow = {
  pickup_game_id: string;
  player_profile_id: string;
  team_side: 'home' | 'away';
  slot_id: string;
};

const STATUS_CLASSNAMES: Record<PickupRow['status'], string> = {
  open:         'bg-primary/10 text-primary border-primary/30',
  materialized: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
  live:         'bg-pitch/20 text-pitch border-pitch/30',
  finished:     'bg-muted text-muted-foreground border-border',
  cancelled:    'bg-destructive/10 text-destructive border-destructive/30',
};

function defaultKickoffLocal(): string {
  const d = new Date(Date.now() + 15 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PickupListPage() {
  const { user, playerProfile } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('pickup_list');
  const { current: lang } = useAppLanguage();
  const [pickups, setPickups] = useState<PickupRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createFormat, setCreateFormat] = useState<PickupFormat>('5v5');
  const [createKickoff, setCreateKickoff] = useState(defaultKickoffLocal());
  const [createSide, setCreateSide] = useState<'home' | 'away'>('home');
  const [createSlot, setCreateSlot] = useState<string>('GK');
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(async () => {
    // Recent + open. 48h lookback is enough to show recently finished/cancelled.
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: pg } = await supabase
      .from('pickup_games')
      .select('id, created_by_profile_id, format, formation, kickoff_at, status, match_id, created_at')
      .gte('created_at', cutoff)
      .order('kickoff_at', { ascending: true });
    const rows = (pg || []) as PickupRow[];
    setPickups(rows);

    const ids = rows.map(r => r.id);
    if (ids.length === 0) {
      setParticipants([]);
      setLoading(false);
      return;
    }
    const { data: parts } = await supabase
      .from('pickup_game_participants')
      .select('pickup_game_id, player_profile_id, team_side, slot_id')
      .in('pickup_game_id', ids);
    setParticipants((parts || []) as ParticipantRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Realtime: any change in either table refreshes the list. Cheap since
  // the dataset is tiny (max 3 open + a trickle of recent ones).
  useEffect(() => {
    const channel = supabase.channel('pickup-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_games' }, () => { void loadAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_game_participants' }, () => { void loadAll(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAll]);

  // Redirect to match when a pickup the user joined goes live.
  useEffect(() => {
    if (!playerProfile) return;
    const mine = pickups.find(p => {
      if (!p.match_id) return false;
      if (p.status !== 'materialized' && p.status !== 'live') return false;
      return participants.some(pt => pt.pickup_game_id === p.id && pt.player_profile_id === playerProfile.id);
    });
    if (mine?.match_id) navigate(`/match/${mine.match_id}`);
  }, [pickups, participants, playerProfile, navigate]);

  const countsById = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of participants) map.set(p.pickup_game_id, (map.get(p.pickup_game_id) || 0) + 1);
    return map;
  }, [participants]);

  const openList = useMemo(
    () => pickups.filter(p => p.status === 'open').sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at)),
    [pickups],
  );
  const myList = useMemo(() => {
    if (!playerProfile) return [] as PickupRow[];
    const myIds = new Set(
      participants.filter(pt => pt.player_profile_id === playerProfile.id).map(pt => pt.pickup_game_id),
    );
    return pickups.filter(p => myIds.has(p.id) || p.created_by_profile_id === playerProfile.id);
  }, [pickups, participants, playerProfile]);
  const recentList = useMemo(
    () => pickups.filter(p => p.status === 'finished' || p.status === 'cancelled' || p.status === 'live'),
    [pickups],
  );

  const availableSlotsForCreate = useMemo(
    () => PICKUP_SLOTS[createFormat],
    [createFormat],
  );

  useEffect(() => {
    // Reset slot when format changes to keep the select valid.
    setCreateSlot(PICKUP_SLOTS[createFormat][0].slot_id);
  }, [createFormat]);

  const handleCreate = async () => {
    if (!user) return;
    const kickoffIso = new Date(createKickoff).toISOString();
    setCreating(true);
    const { data, error } = await supabase.rpc('create_pickup_game', {
      p_format: createFormat,
      p_kickoff_at: kickoffIso,
      p_team_side: createSide,
      p_slot_id: createSlot,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message || t('toast.create_error'));
      return;
    }
    setCreateOpen(false);
    toast.success(t('toast.created_ok'));
    if (data) navigate(`/varzea/${data as string}`);
  };

  const renderCard = (p: PickupRow) => {
    const count = countsById.get(p.id) || 0;
    const total = totalSlotsPerSide(p.format) * 2;
    const when = new Date(p.kickoff_at);
    const now = new Date();
    const minutesUntil = Math.round((when.getTime() - now.getTime()) / 60000);
    const whenLabel = p.status === 'open' && minutesUntil >= 0 && minutesUntil <= 120
      ? t('when.in_minutes', { n: minutesUntil })
      : formatDate(when, lang, 'datetime_short');

    return (
      <Link key={p.id} to={`/varzea/${p.id}`} className="block">
        <Card className="hover:bg-accent/30 transition-colors cursor-pointer">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Users2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="font-display font-medium">
                  {p.format === '5v5' ? t('format.5v5') : t('format.11v11')}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" />
                  {whenLabel}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="font-mono text-xs">
                {count}/{total}
              </Badge>
              <Badge className={STATUS_CLASSNAMES[p.status]} variant="outline">{t(`status.${p.status}`)}</Badge>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Users2 className="h-6 w-6 text-primary" /> {t('title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('subtitle')}
            </p>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> {t('create_button')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('create_dialog.title')}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('create_dialog.format_label')}</Label>
                  <Select value={createFormat} onValueChange={v => setCreateFormat(v as PickupFormat)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5v5">{t('create_dialog.format_5v5')}</SelectItem>
                      <SelectItem value="11v11">{t('create_dialog.format_11v11')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('create_dialog.kickoff_label')}</Label>
                  <Input
                    type="datetime-local"
                    value={createKickoff}
                    onChange={e => setCreateKickoff(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('create_dialog.kickoff_hint')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t('create_dialog.side_label')}</Label>
                    <Select value={createSide} onValueChange={v => setCreateSide(v as 'home' | 'away')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="home">{t('create_dialog.side_home')}</SelectItem>
                        <SelectItem value="away">{t('create_dialog.side_away')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('create_dialog.slot_label')}</Label>
                    <Select value={createSlot} onValueChange={setCreateSlot}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableSlotsForCreate.map(s => (
                          <SelectItem key={s.slot_id} value={s.slot_id}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                  {t('create_dialog.cancel')}
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? t('create_dialog.submitting') : t('create_dialog.submit')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="open">
          <TabsList>
            <TabsTrigger value="open">{t('tabs.open', { n: openList.length })}</TabsTrigger>
            <TabsTrigger value="mine">{t('tabs.mine', { n: myList.length })}</TabsTrigger>
            <TabsTrigger value="recent">{t('tabs.recent', { n: recentList.length })}</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-2 mt-4">
            {loading && <p className="text-sm text-muted-foreground">{t('loading')}</p>}
            {!loading && openList.length === 0 && (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                {t('empty.open')}
              </CardContent></Card>
            )}
            {openList.map(renderCard)}
          </TabsContent>

          <TabsContent value="mine" className="space-y-2 mt-4">
            {!loading && myList.length === 0 && (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                {t('empty.mine')}
              </CardContent></Card>
            )}
            {myList.map(renderCard)}
          </TabsContent>

          <TabsContent value="recent" className="space-y-2 mt-4">
            {!loading && recentList.length === 0 && (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                {t('empty.recent')}
              </CardContent></Card>
            )}
            {recentList.map(renderCard)}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
