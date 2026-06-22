/**
 * NotificationBell.tsx
 * In-app notification bell — fetches from the `notifications` DB table,
 * shows unread badge, opens a popover, marks all as read on open.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Crown, AlertTriangle, Info, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface DBNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  days_until_expiry: number | null;
  read: boolean;
  sent_at: string;
}

function getNotifIcon(type: string) {
  if (type === 'subscription_expiring') return Crown;
  if (type === 'trial_expiring') return CreditCard;
  if (type === 'warning') return AlertTriangle;
  return Info;
}

function getNotifColor(type: string) {
  if (type === 'subscription_expiring') return 'hsl(38 95% 60%)';
  if (type === 'trial_expiring') return 'hsl(142 70% 55%)';
  if (type === 'warning') return 'hsl(4 90% 58%)';
  return 'hsl(191 97% 55%)';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface NotificationBellProps {
  /** Extra className for the trigger button */
  className?: string;
}

export default function NotificationBell({ className }: NotificationBellProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<DBNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Fetch notifications from DB
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, days_until_expiry, read, sent_at')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(20);
    if (data) setNotifications(data as DBNotification[]);
    setLoading(false);
  }, [user?.id]);

  // Poll every 60s for new notifications
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [user?.id, fetchNotifications]);

  // Refresh when trial-expiring event fires
  useEffect(() => {
    const handler = () => fetchNotifications();
    window.addEventListener('mockj:trial-expiring', handler);
    return () => window.removeEventListener('mockj:trial-expiring', handler);
  }, [fetchNotifications]);

  // Mark all unread as read when popover opens
  const markAllRead = useCallback(async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', unreadIds);
  }, [user?.id, notifications]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    markAllRead();
  }, [markAllRead]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative">
      {/* Bell trigger */}
      <button
        ref={buttonRef}
        onClick={open ? () => setOpen(false) : handleOpen}
        aria-label="Notifications"
        className={cn(
          'relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0',
          open
            ? 'bg-[hsl(265_80%_65%_/_0.2)] border border-[hsl(265_80%_65%_/_0.6)]'
            : 'border border-border bg-[hsl(224_15%_10%)] hover:border-[hsl(265_80%_65%_/_0.4)] hover:bg-[hsl(265_80%_65%_/_0.08)]',
          className
        )}
        style={{ color: open ? 'hsl(265 80% 75%)' : 'rgba(180,190,220,0.6)' }}
      >
        <Bell className="w-4 h-4" />
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white"
            style={{ background: 'hsl(4 90% 58%)', boxShadow: '0 0 8px hsl(4 90% 58% / 0.6)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-11 w-80 rounded-2xl overflow-hidden z-50 shadow-2xl"
          style={{
            background: 'hsl(224 20% 8%)',
            border: '1px solid hsl(265 80% 65% / 0.3)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px hsl(265 80% 65% / 0.1)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid hsl(224 15% 14%)' }}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" style={{ color: 'hsl(265 80% 70%)' }} />
              <span
                className="text-sm font-black text-white"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Notifications
              </span>
              {unreadCount === 0 && notifications.length > 0 && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'hsl(142 70% 55% / 0.1)', color: 'hsl(142 70% 55%)', border: '1px solid hsl(142 70% 55% / 0.25)' }}
                >
                  All read
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 && (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 rounded-full border-2 border-[hsl(265_80%_65%_/_0.4)] border-t-[hsl(265_80%_65%)] animate-spin" />
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: 'hsl(265 80% 65% / 0.08)', border: '1px solid hsl(265 80% 65% / 0.2)' }}
                >
                  <Bell className="w-5 h-5" style={{ color: 'hsl(265 80% 65% / 0.4)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/60">No notifications</p>
                  <p className="text-xs text-white/30 mt-0.5">We'll let you know when something needs attention</p>
                </div>
              </div>
            )}

            {notifications.map((notif, i) => {
              const Icon = getNotifIcon(notif.type);
              const color = getNotifColor(notif.type);
              const isLast = i === notifications.length - 1;
              return (
                <div
                  key={notif.id}
                  className="flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-[hsl(224_15%_11%)]"
                  style={{
                    borderBottom: isLast ? 'none' : '1px solid hsl(224 15% 12%)',
                    background: notif.read ? 'transparent' : 'hsl(265 80% 65% / 0.03)',
                  }}
                  onClick={async () => {
                    if (notif.type === 'subscription_expiring') {
                      setOpen(false);
                      navigate('/account');
                    } else if (notif.type === 'trial_expiring') {
                      setOpen(false);
                      // Open Stripe customer portal to add card
                      const { supabase: sb } = await import('@/lib/supabase');
                      const { data } = await sb.functions.invoke('customer-portal', {});
                      if (data?.url) window.open(data.url, '_blank');
                    }
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${color.replace(')', ' / 0.1)')}`, border: `1px solid ${color.replace(')', ' / 0.25)')}` }}
                  >
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn('text-xs font-semibold leading-snug', notif.read ? 'text-white/60' : 'text-white')}
                      >
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0 mt-0.5"
                          style={{ background: color, boxShadow: `0 0 6px ${color.replace(')', ' / 0.6)')}` }}
                        />
                      )}
                    </div>
                    <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{notif.body}</p>
                    {notif.type === 'trial_expiring' && (
                      <span
                        className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: 'hsl(142 70% 55% / 0.12)', border: '1px solid hsl(142 70% 55% / 0.35)', color: 'hsl(142 70% 65%)' }}
                      >
                        <CreditCard className="w-2.5 h-2.5" />
                        Tap to add card →
                      </span>
                    )}
                    <p className="text-[10px] mt-1.5" style={{ color: color.replace(')', ' / 0.5)') }}>
                      {timeAgo(notif.sent_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div
              className="px-4 py-3"
              style={{ borderTop: '1px solid hsl(224 15% 12%)' }}
            >
              <button
                onClick={() => { setOpen(false); navigate('/account'); }}
                className="w-full text-center text-xs font-semibold transition-colors"
                style={{ color: 'hsl(265 80% 65% / 0.6)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'hsl(265 80% 75%)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'hsl(265 80% 65% / 0.6)'; }}
              >
                Manage account →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
