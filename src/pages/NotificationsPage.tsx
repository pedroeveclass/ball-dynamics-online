import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { ManagerLayout } from '@/components/ManagerLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getNotificationLink } from '@/lib/notificationLinks';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { formatDate } from '@/lib/formatDate';
import { renderNotificationTitle, renderNotificationBody } from '@/lib/notificationRender';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  created_at: string;
  link?: string | null;
  i18n_key?: string | null;
  i18n_params?: Record<string, unknown> | null;
}

export default function NotificationsPage() {
  const { user, profile, playerProfile } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('notifications');
  const { current: lang } = useAppLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const Layout = profile?.role_selected === 'manager' ? ManagerLayout : AppLayout;
  const activePlayerId = playerProfile?.id ?? null;

  useEffect(() => {
    if (!user) return;
    (async () => {
      let q: any = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id);
      if (activePlayerId) {
        // Show notifications addressed to the active character + general ones.
        q = q.or(`player_profile_id.is.null,player_profile_id.eq.${activePlayerId}`);
      }
      const { data } = await q
        .order('created_at', { ascending: false })
        .limit(100);
      setNotifications(data || []);
      setLoading(false);
    })();
  }, [user, activePlayerId]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Layout>
      <div className="space-y-5 max-w-2xl px-1 sm:px-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-tactical" /> {t('title')}
          </h1>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAllAsRead} className="text-xs font-display shrink-0">
              <Check className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">{t('mark_all_read')}</span>
              <span className="sm:hidden">{t('mark_all_read_short')}</span>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="stat-card h-16 animate-pulse bg-muted" />)}
          </div>
        ) : notifications.length === 0 ? (
          <div className="stat-card text-center py-12">
            <Bell className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-display font-semibold text-muted-foreground">{t('empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => {
              const title = renderNotificationTitle(n);
              const body = renderNotificationBody(n);
              return (
              <div
                key={n.id}
                className={`stat-card flex items-start gap-3 cursor-pointer transition-colors overflow-hidden ${
                  !n.read ? 'border-tactical/30 bg-tactical/5' : ''
                }`}
                onClick={() => {
                  if (!n.read) markAsRead(n.id);
                  navigate(getNotificationLink(n));
                }}
              >
                <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${!n.read ? 'bg-tactical' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="font-display font-bold text-sm break-words">{title}</p>
                  {body && <p className="text-xs text-muted-foreground mt-0.5 break-words">{body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDate(n.created_at, lang, 'datetime_short')}
                  </p>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
