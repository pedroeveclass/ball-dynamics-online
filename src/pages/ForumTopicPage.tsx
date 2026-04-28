import { useEffect, useState, ReactNode } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ManagerLayout } from '@/components/ManagerLayout';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { timeAgo } from '@/lib/formatting';
import {
  MessageSquare, ArrowLeft, ThumbsUp, ThumbsDown, Share2, Send,
  Pin, PinOff, Lock, Loader2, MessageCircle, Pencil, Trash2, MoreVertical,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

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
          <Link to="/forum" className="text-muted-foreground hover:text-foreground transition-colors">
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
}

interface Comment {
  id: string;
  topic_id: string;
  author_id: string;
  body: string;
  like_count: number;
  dislike_count: number;
  created_at: string;
  updated_at: string;
}

export default function ForumTopicPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('forum_topic');
  const { current: lang } = useAppLanguage();
  const { profile, isAdmin } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [authorMap, setAuthorMap] = useState<Record<string, string>>({});
  const [categoryName, setCategoryName] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Reactions: { [targetId]: 'like' | 'dislike' | null }
  const [userReactions, setUserReactions] = useState<Record<string, string | null>>({});
  const [reacting, setReacting] = useState(false);
  // Edit dialog
  const [editingTopic, setEditingTopic] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  const isAuthor = profile && topic && profile.id === topic.author_id;
  const canEdit = isAuthor || isAdmin;
  const canDelete = isAdmin;
  const canPin = isAdmin;

  useEffect(() => {
    if (topicId) fetchAll();
  }, [topicId]);

  async function fetchAll() {
    setLoading(true);
    // Fetch topic
    const { data: topicData } = await (supabase as any)
      .from('forum_topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (!topicData) { setLoading(false); return; }
    setTopic(topicData as Topic);

    // Fetch category name (localized)
    const { data: cat } = await (supabase as any)
      .from('forum_categories')
      .select('name, name_pt, name_en, slug')
      .eq('id', topicData.category_id)
      .single();
    const isEn = lang === 'en';
    setCategoryName((isEn ? cat?.name_en : cat?.name_pt) || cat?.name || '');
    setCategorySlug(cat?.slug || '');

    // Fetch comments
    const { data: commentsData } = await (supabase as any)
      .from('forum_comments')
      .select('*')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true });
    const commentList = (commentsData || []) as Comment[];
    setComments(commentList);

    // Enrich authors (try profiles.username, then player/manager full_name)
    const allAuthorIds = [...new Set([topicData.author_id, ...commentList.map(c => c.author_id)])];
    const [profilesRes, playersRes, managersRes] = await Promise.all([
      supabase.from('profiles').select('id, username, role_selected').in('id', allAuthorIds),
      (supabase as any).from('player_profiles').select('user_id, full_name').in('user_id', allAuthorIds),
      (supabase as any).from('manager_profiles').select('user_id, full_name').in('user_id', allAuthorIds),
    ]);
    const playerNameMap = new Map((playersRes.data || []).map((p: any) => [p.user_id, p.full_name]));
    const managerNameMap = new Map((managersRes.data || []).map((m: any) => [m.user_id, m.full_name]));
    const aMap: Record<string, string> = {};
    for (const p of (profilesRes.data || [])) aMap[p.id] = p.username || playerNameMap.get(p.id) || managerNameMap.get(p.id) || t('anonymous');
    setAuthorMap(aMap);

    // Fetch user reactions
    if (profile) {
      const targetIds = [topicId!, ...commentList.map(c => c.id)];
      const { data: reactions } = await (supabase as any)
        .from('forum_reactions')
        .select('target_id, reaction')
        .eq('user_id', profile.id)
        .in('target_id', targetIds);
      const rMap: Record<string, string | null> = {};
      for (const r of (reactions || [])) rMap[r.target_id] = r.reaction;
      setUserReactions(rMap);
    }

    setLoading(false);
  }

  async function handleComment() {
    if (!profile) { navigate('/login'); return; }
    if (commentText.trim().length < 1) { toast.error(t('toast.comment_empty')); return; }
    setSubmitting(true);
    const { error } = await (supabase as any)
      .from('forum_comments')
      .insert({
        topic_id: topicId,
        author_id: profile.id,
        body: commentText.trim(),
      });
    setSubmitting(false);
    if (error) { toast.error(error.message || t('toast.comment_error')); return; }
    setCommentText('');
    toast.success(t('toast.comment_added'));
    fetchAll();
  }

  async function handleReaction(targetType: 'topic' | 'comment', targetId: string, reaction: 'like' | 'dislike') {
    if (!profile) { navigate('/login'); return; }
    setReacting(true);
    const { data, error } = await (supabase as any).rpc('toggle_forum_reaction', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reaction: reaction,
    });
    setReacting(false);
    if (error) { toast.error(error.message); return; }
    const result = data as any;
    if (result?.error) { toast.error(result.error); return; }
    // Update local state
    setUserReactions(prev => ({ ...prev, [targetId]: result.reaction || null }));
    // Refresh counts
    fetchAll();
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
    toast.success(t('toast.share_copied'));
  }

  function openEditTopic() {
    if (!topic) return;
    setEditTitle(topic.title);
    setEditBody(topic.body);
    setEditingTopic(true);
  }

  async function handleSaveEdit() {
    if (!topic || editTitle.length < 5 || editBody.length < 10) {
      toast.error(t('toast.validation_edit'));
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from('forum_topics')
      .update({ title: editTitle.trim(), body: editBody.trim() })
      .eq('id', topic.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t('toast.topic_updated'));
    setEditingTopic(false);
    fetchAll();
  }

  async function handleTogglePin() {
    if (!topic) return;
    const { error } = await (supabase as any)
      .from('forum_topics')
      .update({ is_pinned: !topic.is_pinned })
      .eq('id', topic.id);
    if (error) { toast.error(error.message); return; }
    toast.success(topic.is_pinned ? t('toast.unpinned') : t('toast.pinned'));
    fetchAll();
  }

  async function handleToggleLock() {
    if (!topic) return;
    const { error } = await (supabase as any)
      .from('forum_topics')
      .update({ is_locked: !topic.is_locked })
      .eq('id', topic.id);
    if (error) { toast.error(error.message); return; }
    toast.success(topic.is_locked ? t('toast.unlocked') : t('toast.locked'));
    fetchAll();
  }

  async function handleDeleteTopic() {
    if (!topic || !confirm(t('confirm.delete_topic'))) return;
    const { error } = await (supabase as any)
      .from('forum_topics')
      .delete()
      .eq('id', topic.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t('toast.topic_deleted'));
    navigate(`/forum/${categorySlug}`);
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm(t('confirm.delete_comment'))) return;
    const { error } = await (supabase as any)
      .from('forum_comments')
      .delete()
      .eq('id', commentId);
    if (error) { toast.error(error.message); return; }
    toast.success(t('toast.comment_deleted'));
    fetchAll();
  }

  function ReactionButtons({ targetType, targetId, likeCount, dislikeCount }: {
    targetType: 'topic' | 'comment';
    targetId: string;
    likeCount: number;
    dislikeCount: number;
  }) {
    const current = userReactions[targetId];
    return (
      <div className="flex items-center gap-2">
        <button
          className={`flex items-center gap-1 text-xs transition-colors ${current === 'like' ? 'text-pitch font-bold' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => handleReaction(targetType, targetId, 'like')}
          disabled={reacting}
        >
          <ThumbsUp className="h-3.5 w-3.5" />{likeCount}
        </button>
        <button
          className={`flex items-center gap-1 text-xs transition-colors ${current === 'dislike' ? 'text-red-400 font-bold' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => handleReaction(targetType, targetId, 'dislike')}
          disabled={reacting}
        >
          <ThumbsDown className="h-3.5 w-3.5" />{dislikeCount}
        </button>
      </div>
    );
  }

  if (loading) {
    return <ForumLayout><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></ForumLayout>;
  }

  if (!topic) {
    return <ForumLayout><p className="text-muted-foreground text-center py-12">{t('not_found')}</p></ForumLayout>;
  }

  return (
    <ForumLayout>
      <div className="space-y-6">
        {/* Back link */}
        <div className="flex items-center gap-2 text-sm">
          <Link to="/forum" className="text-muted-foreground hover:text-foreground transition-colors">{t('header.forum_link')}</Link>
          <span className="text-muted-foreground">/</span>
          <Link to={`/forum/${categorySlug}`} className="text-muted-foreground hover:text-foreground transition-colors">{categoryName}</Link>
        </div>

        {/* Topic */}
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {topic.is_pinned && <Pin className="h-4 w-4 text-amber-400 shrink-0" />}
                  {topic.is_locked && <Lock className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <h1 className="font-display text-xl font-bold">{topic.title}</h1>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{categoryName}</Badge>
                  <span>{t('by')} <strong>{authorMap[topic.author_id] || t('anonymous')}</strong></span>
                  <span>&middot;</span>
                  <span>{timeAgo(topic.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleShare} title={t('share_title')}>
                  <Share2 className="h-4 w-4" />
                </Button>
                {(canEdit || canDelete || canPin) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && (
                        <DropdownMenuItem onClick={openEditTopic}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />{t('menu.edit')}
                        </DropdownMenuItem>
                      )}
                      {canPin && (
                        <DropdownMenuItem onClick={handleTogglePin}>
                          {topic.is_pinned
                            ? <><PinOff className="h-3.5 w-3.5 mr-2" />{t('menu.unpin')}</>
                            : <><Pin className="h-3.5 w-3.5 mr-2" />{t('menu.pin')}</>}
                        </DropdownMenuItem>
                      )}
                      {canPin && (
                        <DropdownMenuItem onClick={handleToggleLock}>
                          <Lock className="h-3.5 w-3.5 mr-2" />
                          {topic.is_locked ? t('menu.unlock') : t('menu.lock')}
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem onClick={handleDeleteTopic} className="text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-2" />{t('menu.delete_topic')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            <div className="text-sm leading-relaxed whitespace-pre-wrap">{topic.body}</div>

            <div className="flex items-center gap-4 pt-2 border-t">
              <ReactionButtons targetType="topic" targetId={topic.id} likeCount={topic.like_count} dislikeCount={topic.dislike_count} />
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageCircle className="h-3.5 w-3.5" />{t('comments.comment_count', { count: topic.comment_count })}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Comments */}
        <div>
          <h2 className="font-display text-sm font-semibold text-muted-foreground mb-3">
            {t('comments.section', { count: comments.length })}
          </h2>

          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t('comments.empty')}</p>
          ) : (
            <div className="space-y-2">
              {comments.map(comment => (
                <Card key={comment.id}>
                  <CardContent className="p-3 sm:p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <strong className="text-foreground">{authorMap[comment.author_id] || t('anonymous')}</strong>
                        <span>&middot;</span>
                        <span>{timeAgo(comment.created_at)}</span>
                        {comment.created_at !== comment.updated_at && <span className="italic">{t('comments.edited')}</span>}
                      </div>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteComment(comment.id)} title={t('menu.delete_comment')}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">{comment.body}</div>
                    <ReactionButtons targetType="comment" targetId={comment.id} likeCount={comment.like_count} dislikeCount={comment.dislike_count} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Comment form */}
        {topic.is_locked ? (
          <div className="text-center text-sm text-muted-foreground py-4 border rounded-md bg-muted/30">
            <Lock className="h-4 w-4 inline mr-1" /> {t('locked_notice')}
          </div>
        ) : profile ? (
          <Card>
            <CardContent className="p-3 sm:p-4 space-y-3">
              <Textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder={t('comments.placeholder')}
                rows={3}
              />
              <div className="flex justify-end">
                <Button size="sm" disabled={submitting || commentText.trim().length < 1} onClick={handleComment} className="font-display">
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {submitting ? t('comments.submitting') : t('comments.submit')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-4">
            <Link to="/login">
              <Button variant="outline" className="font-display text-sm">{t('comments.login_prompt')}</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Edit topic dialog */}
      <Dialog open={editingTopic} onOpenChange={setEditingTopic}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{t('edit_dialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('edit_dialog.title_label')}</label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={150} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('edit_dialog.body_label')}</label>
              <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={8} />
            </div>
            <Button className="w-full font-display" disabled={saving} onClick={handleSaveEdit}>
              {saving ? t('edit_dialog.submitting') : t('edit_dialog.submit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ForumLayout>
  );
}
