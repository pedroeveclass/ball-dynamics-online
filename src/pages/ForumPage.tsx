import { useEffect, useState, ReactNode } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ManagerLayout } from '@/components/ManagerLayout';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { timeAgo } from '@/lib/formatting';
import {
  MessageSquare, ArrowLeft, Plus, MessageCircle, ThumbsUp, Pin,
  Lock, Loader2, Globe, Lightbulb, Bug, Swords, ArrowRightLeft, Coffee,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { ForumIntroTour } from '@/components/tour/ForumIntroTour';

function ForumLayout({ children }: { children: ReactNode }) {
  const { managerProfile, playerProfile, loading } = useAuth();
  const { t } = useTranslation('forum');
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (managerProfile) return <ManagerLayout>{children}</ManagerLayout>;
  if (playerProfile) return <AppLayout>{children}</AppLayout>;
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <MessageSquare className="h-5 w-5 text-tactical" />
          <span className="font-display text-lg font-bold">{t('title')}</span>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

const CATEGORY_ICONS: Record<string, ReactNode> = {
  geral: <Globe className="h-5 w-5" />,
  taticas: <Swords className="h-5 w-5" />,
  transferencias: <ArrowRightLeft className="h-5 w-5" />,
  sugestoes: <Lightbulb className="h-5 w-5" />,
  bugs: <Bug className="h-5 w-5" />,
  'off-topic': <Coffee className="h-5 w-5" />,
};

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  name_pt?: string | null;
  name_en?: string | null;
  description_pt?: string | null;
  description_en?: string | null;
  sort_order: number;
}

function pickCatName(c: Category | undefined | null, lang: 'pt' | 'en'): string {
  if (!c) return '';
  if (lang === 'en') return c.name_en || c.name_pt || c.name;
  return c.name_pt || c.name;
}

function pickCatDescription(c: Category | undefined | null, lang: 'pt' | 'en'): string {
  if (!c) return '';
  if (lang === 'en') return c.description_en || c.description_pt || c.description || '';
  return c.description_pt || c.description || '';
}

interface Topic {
  id: string;
  category_id: string;
  author_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  is_locked: boolean;
  pin_order: number;
  comment_count: number;
  like_count: number;
  dislike_count: number;
  last_activity_at: string;
  created_at: string;
  author_username?: string;
  category_slug?: string;
  category_name?: string;
}

export default function ForumPage() {
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('forum');
  const { current: lang } = useAppLanguage();
  const { profile, isAdmin } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchData();
  }, [categorySlug, page]);

  async function fetchData() {
    setLoading(true);
    // Fetch categories
    const { data: cats } = await (supabase as any)
      .from('forum_categories')
      .select('*')
      .order('sort_order');
    const catList = (cats || []) as Category[];
    setCategories(catList);

    // Fetch topics
    let query = (supabase as any)
      .from('forum_topics')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('pin_order', { ascending: true })
      .order('last_activity_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const activeCategory = categorySlug
      ? catList.find(c => c.slug === categorySlug)
      : null;

    if (activeCategory) {
      query = query.eq('category_id', activeCategory.id);
    }

    const { data: topicsData } = await query;
    const topicList = (topicsData || []) as Topic[];

    // Enrich with author names (try profiles.username, then player/manager full_name)
    const authorIds = [...new Set(topicList.map(t => t.author_id))];
    let authorMap: Record<string, string> = {};
    if (authorIds.length > 0) {
      const [profilesRes, playersRes, managersRes] = await Promise.all([
        supabase.from('profiles').select('id, username, role_selected').in('id', authorIds),
        (supabase as any).from('player_profiles').select('user_id, full_name').in('user_id', authorIds),
        (supabase as any).from('manager_profiles').select('user_id, full_name').in('user_id', authorIds),
      ]);
      const playerNameMap = new Map((playersRes.data || []).map((p: any) => [p.user_id, p.full_name]));
      const managerNameMap = new Map((managersRes.data || []).map((m: any) => [m.user_id, m.full_name]));
      for (const p of (profilesRes.data || [])) {
        authorMap[p.id] = p.username || playerNameMap.get(p.id) || managerNameMap.get(p.id) || t('anonymous');
      }
    }

    // Enrich with category info
    const catMap = Object.fromEntries(catList.map(c => [c.id, c]));
    for (const tp of topicList) {
      tp.author_username = authorMap[tp.author_id] || t('anonymous');
      tp.category_slug = catMap[tp.category_id]?.slug;
      tp.category_name = pickCatName(catMap[tp.category_id], lang);
    }

    setTopics(topicList);

    // Pre-select category for new topic form
    if (activeCategory && !newCategoryId) {
      setNewCategoryId(activeCategory.id);
    }

    setLoading(false);
  }

  async function handleReorderPin(topicId: string, direction: 'up' | 'down') {
    const pinned = topics.filter(t => t.is_pinned).sort((a, b) => a.pin_order - b.pin_order);
    const idx = pinned.findIndex(t => t.id === topicId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= pinned.length) return;
    const a = pinned[idx];
    const b = pinned[swapIdx];
    await Promise.all([
      (supabase as any).from('forum_topics').update({ pin_order: b.pin_order }).eq('id', a.id),
      (supabase as any).from('forum_topics').update({ pin_order: a.pin_order }).eq('id', b.id),
    ]);
    fetchData();
  }

  async function handleCreateTopic() {
    if (!profile) { navigate('/login'); return; }
    if (!newCategoryId || newTitle.length < 5 || newBody.length < 10) {
      toast.error(t('toast.validation_fields'));
      return;
    }
    setSubmitting(true);
    const { data, error } = await (supabase as any)
      .from('forum_topics')
      .insert({
        category_id: newCategoryId,
        author_id: profile.id,
        title: newTitle.trim(),
        body: newBody.trim(),
      })
      .select('id')
      .single();
    setSubmitting(false);
    if (error) {
      toast.error(error.message || t('toast.create_error'));
      return;
    }
    toast.success(t('toast.created_ok'));
    setShowNewTopic(false);
    setNewTitle('');
    setNewBody('');
    navigate(`/forum/t/${data.id}`);
  }

  // Topic count per category
  const topicCountByCategory: Record<string, number> = {};
  if (!categorySlug) {
    for (const t of topics) {
      topicCountByCategory[t.category_id] = (topicCountByCategory[t.category_id] || 0) + 1;
    }
  }

  return (
    <ForumLayout>
      <div className="space-y-6">
        <ForumIntroTour enabled={!loading} hasCategories={!categorySlug && categories.length > 0} hasNewTopicButton={!!profile} />
        {/* Header */}
        <div data-tour="forum-header" className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {categorySlug && (
              <Link to="/forum" className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            )}
            <div>
              <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-tactical" />
                {categorySlug
                  ? categories.find(c => c.slug === categorySlug)?.name || t('category_fallback')
                  : t('title')}
              </h1>
              {!categorySlug && (
                <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
              )}
            </div>
          </div>
          {profile && (
            <Button data-tour="forum-new-topic" onClick={() => setShowNewTopic(true)} className="font-display">
              <Plus className="h-4 w-4 mr-1" /> {t('buttons.new_topic')}
            </Button>
          )}
          {!profile && (
            <Link to="/login">
              <Button variant="outline" className="font-display text-sm">{t('buttons.login_to_participate')}</Button>
            </Link>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Category grid (only on main forum page) */}
            {!categorySlug && (
              <div data-tour="forum-categories" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {categories.map(cat => {
                  const catName = pickCatName(cat, lang);
                  const catDesc = pickCatDescription(cat, lang);
                  return (
                  <Link key={cat.slug} to={`/forum/${cat.slug}`}>
                    <Card className="hover:border-tactical/50 transition-colors cursor-pointer h-full">
                      <CardContent className="p-3 flex flex-col items-center text-center gap-1.5">
                        <div className="text-tactical">{CATEGORY_ICONS[cat.slug] || <MessageSquare className="h-5 w-5" />}</div>
                        <span className="font-display text-sm font-semibold">{catName}</span>
                        {catDesc && <span className="text-[10px] text-muted-foreground leading-tight">{catDesc}</span>}
                      </CardContent>
                    </Card>
                  </Link>
                  );
                })}
              </div>
            )}

            {/* Topic list */}
            <div>
              <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">
                {categorySlug ? t('topics.section_default') : t('topics.section_recent')}
              </h2>
              {topics.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('topics.empty')}</p>
              ) : (
                <div className="space-y-2">
                  {topics.map(topic => (
                    <Link key={topic.id} to={`/forum/t/${topic.id}`}>
                      <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {topic.is_pinned && <Pin className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                              {topic.is_locked && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                              <span className="font-display font-semibold text-sm truncate">{topic.title}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                              {!categorySlug && topic.category_name && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">{topic.category_name}</Badge>
                              )}
                              <span>{topic.author_username}</span>
                              <span>&middot;</span>
                              <span>{timeAgo(topic.created_at)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                            {isAdmin && topic.is_pinned && (
                              <div className="flex flex-col -my-1" onClick={e => e.preventDefault()}>
                                <button className="p-0.5 hover:text-foreground transition-colors" onClick={e => { e.preventDefault(); e.stopPropagation(); handleReorderPin(topic.id, 'up'); }} title={t('reorder.up')}>
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button className="p-0.5 hover:text-foreground transition-colors" onClick={e => { e.preventDefault(); e.stopPropagation(); handleReorderPin(topic.id, 'down'); }} title={t('reorder.down')}>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{topic.comment_count}</span>
                            <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" />{topic.like_count}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {topics.length === PAGE_SIZE && (
                <div className="flex justify-center mt-4">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>{t('buttons.load_more')}</Button>
                </div>
              )}
              {page > 0 && (
                <div className="flex justify-center mt-2">
                  <Button variant="ghost" size="sm" onClick={() => setPage(0)}>{t('buttons.back_to_top')}</Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* New topic dialog */}
        <Dialog open={showNewTopic} onOpenChange={setShowNewTopic}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">{t('new_topic_dialog.title')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{t('new_topic_dialog.category_label')}</label>
                <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                  <SelectTrigger><SelectValue placeholder={t('new_topic_dialog.category_placeholder')} /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{pickCatName(c, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('new_topic_dialog.title_label')}</label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t('new_topic_dialog.title_placeholder')} maxLength={150} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('new_topic_dialog.body_label')}</label>
                <Textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder={t('new_topic_dialog.body_placeholder')} rows={5} />
              </div>
              <Button className="w-full font-display" disabled={submitting} onClick={handleCreateTopic}>
                {submitting ? t('new_topic_dialog.submitting') : t('new_topic_dialog.submit')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ForumLayout>
  );
}
