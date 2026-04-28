import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getNotificationLink } from '@/lib/notificationLinks';
import { renderNotificationTitle, renderNotificationBody } from '@/lib/notificationRender';
import { useTranslation } from 'react-i18next';

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

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('notifications');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    // Subscribe to new notifications
    const channel = supabase.channel(`notif-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        setNotifications(prev => [payload.new as Notification, ...prev.slice(0, 9)]);
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function fetchNotifications() {
    if (!user) return;
    const [{ data: notifs }, { count }] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
    ]);
    setNotifications((notifs || []) as Notification[]);
    setUnreadCount(count || 0);
  }

  async function markAsRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function markAllAsRead(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user || unreadCount === 0) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('time_now');
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-md hover:bg-muted transition-colors"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed left-1/2 -translate-x-1/2 top-14 w-[min(calc(100vw-1rem),380px)] sm:absolute sm:translate-x-0 sm:left-auto sm:right-0 sm:top-full sm:mt-1 sm:w-80 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
            <span className="font-display font-bold text-sm">{t('title')}</span>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t('mark_read_short')}
                </button>
              )}
              <Link
                to="/notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-tactical hover:underline"
              >
                {t('see_all')}
              </Link>
            </div>
          </div>

          <div className="max-h-[70vh] sm:max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-center text-muted-foreground text-xs py-6">{t('empty_short')}</p>
            ) : (
              notifications.map(n => {
                const title = renderNotificationTitle(n);
                const body = renderNotificationBody(n);
                return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markAsRead(n.id);
                    setOpen(false);
                    navigate(getNotificationLink(n));
                  }}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors ${!n.read ? 'bg-tactical/5' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-tactical shrink-0" />}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className={`text-[13px] font-semibold break-words line-clamp-2 ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>{title}</p>
                      {body && (
                        <p className="text-[11px] text-muted-foreground break-words line-clamp-2 mt-0.5">{body}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
