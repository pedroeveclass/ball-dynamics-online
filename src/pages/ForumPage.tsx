import { useEffect, useState, ReactNode } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';

function ForumLayout({ children }: { children: ReactNode }) {
  const { managerProfile, playerProfile, loading } = useAuth();
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
          <span className="font-display text-lg font-bold">Fórum FID</span>
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
  sort_order: number;
}

interface Topic {
  id: string;
  category_id: string;
  author_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  is_locked: boolean;
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
  const { profile } = useAuth();
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
        authorMap[p.id] = p.username || playerNameMap.get(p.id) || managerNameMap.get(p.id) || 'Anônimo';
      }
    }

    // Enrich with category info
    const catMap = Object.fromEntries(catList.map(c => [c.id, c]));
    for (const t of topicList) {
      t.author_username = authorMap[t.author_id] || 'Anônimo';
      t.category_slug = catMap[t.category_id]?.slug;
      t.category_name = catMap[t.category_id]?.name;
    }

    setTopics(topicList);

    // Pre-select category for new topic form
    if (activeCategory && !newCategoryId) {
      setNewCategoryId(activeCategory.id);
    }

    setLoading(false);
  }

  async function handleCreateTopic() {
    if (!profile) { navigate('/login'); return; }
    if (!newCategoryId || newTitle.length < 5 || newBody.length < 10) {
      toast.error('Preencha todos os campos (título min 5 chars, corpo min 10 chars).');
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
      toast.error(error.message || 'Erro ao criar tópico');
      return;
    }
    toast.success('Tópico criado!');
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
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
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
                  ? categories.find(c => c.slug === categorySlug)?.name || 'Fórum'
                  : 'Fórum FID'}
              </h1>
              {!categorySlug && (
                <p className="text-sm text-muted-foreground mt-1">Discussões da comunidade Football Identity</p>
              )}
            </div>
          </div>
          {profile && (
            <Button onClick={() => setShowNewTopic(true)} className="font-display">
              <Plus className="h-4 w-4 mr-1" /> Novo Tópico
            </Button>
          )}
          {!profile && (
            <Link to="/login">
              <Button variant="outline" className="font-display text-sm">Faça login para participar</Button>
            </Link>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Category grid (only on main forum page) */}
            {!categorySlug && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {categories.map(cat => (
                  <Link key={cat.slug} to={`/forum/${cat.slug}`}>
                    <Card className="hover:border-tactical/50 transition-colors cursor-pointer h-full">
                      <CardContent className="p-3 flex flex-col items-center text-center gap-1.5">
                        <div className="text-tactical">{CATEGORY_ICONS[cat.slug] || <MessageSquare className="h-5 w-5" />}</div>
                        <span className="font-display text-sm font-semibold">{cat.name}</span>
                        {cat.description && <span className="text-[10px] text-muted-foreground leading-tight">{cat.description}</span>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}

            {/* Topic list */}
            <div>
              <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">
                {categorySlug ? 'Tópicos' : 'Tópicos Recentes'}
              </h2>
              {topics.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum tópico ainda. Seja o primeiro a criar!</p>
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
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Carregar mais</Button>
                </div>
              )}
              {page > 0 && (
                <div className="flex justify-center mt-2">
                  <Button variant="ghost" size="sm" onClick={() => setPage(0)}>Voltar ao início</Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* New topic dialog */}
        <Dialog open={showNewTopic} onOpenChange={setShowNewTopic}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">Novo Tópico</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Categoria</label>
                <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Título</label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Título do tópico (min 5 caracteres)" maxLength={150} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Conteúdo</label>
                <Textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="Escreva seu tópico (min 10 caracteres)" rows={5} />
              </div>
              <Button className="w-full font-display" disabled={submitting} onClick={handleCreateTopic}>
                {submitting ? 'Criando...' : 'Criar Tópico'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ForumLayout>
  );
}
