import React, { useEffect, useState, useCallback } from 'react';
import { supabase, AppNotification } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { X, Bell, CheckCheck, FileText, Calendar, Megaphone, User } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
}

function timeAgo(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-MU', { day: 'numeric', month: 'short' });
}

const TYPE_ICON: Record<string, React.FC<{ className?: string }>> = {
  leave_submitted: FileText,
  leave_approved: Calendar,
  leave_rejected: Calendar,
  leave_admin_added: User,
  document_uploaded: FileText,
  announcement: Megaphone,
};

const TYPE_COLOR: Record<string, string> = {
  leave_submitted: 'bg-blue-100 text-blue-600',
  leave_approved: 'bg-[#CCFBF1] text-[#0D9488]',
  leave_rejected: 'bg-red-100 text-red-600',
  leave_admin_added: 'bg-[#FEF3C7] text-[#92400E]',
  document_uploaded: 'bg-gray-100 text-gray-600',
  announcement: 'bg-[#FEF3C7] text-[#92400E]',
};

export const NotificationPanel: React.FC<Props> = ({ open, onClose, onUnreadChange }) => {
  const { profile } = useAuthStore();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      setNotifications(data as AppNotification[]);
      onUnreadChange(data.filter((n) => !n.is_read).length);
    }
    setLoading(false);
  }, [profile, onUnreadChange]);

  useEffect(() => {
    if (!profile) return;
    fetchNotifications();

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${profile.id}` },
        () => { fetchNotifications(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchNotifications]);

  const markAllRead = async () => {
    if (!profile) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', profile.id)
      .eq('is_read', false);
    fetchNotifications();
  };

  const markOneRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    onUnreadChange(notifications.filter((n) => !n.is_read && n.id !== id).length);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/20 z-40 transition-opacity',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed left-0 top-0 h-full w-80 bg-white border-r border-gray-100 shadow-xl z-50 flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#0D9488]" />
            <h2 className="font-semibold text-sm text-gray-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                title="Mark all as read"
                className="flex items-center gap-1 text-xs text-[#0D9488] hover:text-[#7b35d9] font-medium px-2 py-1 rounded-lg hover:bg-[#0D9488]/5 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                All read
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 bg-gray-100 rounded" />
                    <div className="h-3 w-full bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 text-gray-200" />
              </div>
              <p className="text-sm font-medium text-gray-500">No notifications yet</p>
              <p className="text-xs text-gray-400 mt-1">Activity will show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n) => {
                const IconComp = TYPE_ICON[n.type] ?? Bell;
                const colorClass = TYPE_COLOR[n.type] ?? 'bg-gray-100 text-gray-500';
                return (
                  <div
                    key={n.id}
                    onClick={() => { if (!n.is_read) markOneRead(n.id); }}
                    className={cn(
                      'flex gap-3 px-5 py-3.5 cursor-pointer transition-colors hover:bg-gray-50',
                      !n.is_read ? 'bg-emerald-50' : ''
                    )}
                  >
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', colorClass)}>
                      <IconComp className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-sm leading-tight', n.is_read ? 'text-gray-700' : 'font-semibold text-gray-900')}>
                          {n.title}
                        </p>
                        {!n.is_read && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
