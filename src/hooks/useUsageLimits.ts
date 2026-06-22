import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDeviceId } from '@/lib/deviceFingerprint';
import { supabase } from '@/lib/supabase';

export type LimitedAction = 'chat' | 'image' | 'video';

interface DailyUsage {
  date: string;
  chat: number;
  image: number;
  video: number;
}

// Scope storage key to device so different devices don't share localStorage limits
const STORAGE_KEY = `mockj_daily_usage_${getDeviceId().slice(0, 8)}`;

const FREE_LIMITS: Record<LimitedAction, number> = {
  chat: 10,
  image: 3,
  video: 1,
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadUsage(): DailyUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: todayStr(), chat: 0, image: 0, video: 0 };
    const parsed: DailyUsage = JSON.parse(raw);
    // Reset if it's a new day
    if (parsed.date !== todayStr()) {
      return { date: todayStr(), chat: 0, image: 0, video: 0 };
    }
    return parsed;
  } catch {
    return { date: todayStr(), chat: 0, image: 0, video: 0 };
  }
}

function saveUsage(usage: DailyUsage): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

export function useUsageLimits() {
  const { subscription, user } = useAuth();
  const syncedRef = useRef(false);

  // On mount for authenticated users: pull today's real server counts into localStorage
  // This closes the localStorage-clear bypass: UI limits reflect actual DB state
  useEffect(() => {
    if (!user || subscription.subscribed || syncedRef.current) return;
    syncedRef.current = true;
    const today = todayStr();
    supabase
      .from('user_daily_usage')
      .select('chat_count, image_count, video_count')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const synced: DailyUsage = {
          date: today,
          chat:  Math.max(loadUsage().chat,  data.chat_count  ?? 0),
          image: Math.max(loadUsage().image, data.image_count ?? 0),
          video: Math.max(loadUsage().video, data.video_count ?? 0),
        };
        saveUsage(synced);
      })
      .catch(() => { /* silent — server is authoritative, localStorage is best-effort UI */ });
  }, [user, subscription.subscribed]);

  const getRemaining = useCallback(
    (action: LimitedAction): number => {
      if (subscription.subscribed) return Infinity;
      const usage = loadUsage();
      return Math.max(0, FREE_LIMITS[action] - usage[action]);
    },
    [subscription.subscribed]
  );

  /**
   * Returns true if the action is allowed (and increments the counter).
   * Returns false if the free limit is reached (does NOT increment).
   */
  const consumeOrBlock = useCallback(
    (action: LimitedAction): boolean => {
      if (subscription.subscribed) return true;
      const usage = loadUsage();
      if (usage[action] >= FREE_LIMITS[action]) return false;
      saveUsage({ ...usage, [action]: usage[action] + 1 });
      return true;
    },
    [subscription.subscribed]
  );

  const getLimitLabel = (action: LimitedAction): string => {
    const remaining = getRemaining(action);
    if (remaining === Infinity) return '';
    return `${remaining}/${FREE_LIMITS[action]} free ${action === 'chat' ? 'messages' : action === 'image' ? 'images' : 'videos'} left today`;
  };

  const getLimit = (action: LimitedAction) => FREE_LIMITS[action];

  return { consumeOrBlock, getRemaining, getLimitLabel, getLimit };
}
