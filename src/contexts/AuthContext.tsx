import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { AuthUser, SubscriptionState } from '@/types/auth';
import { useNavigate } from 'react-router-dom';
import { getDeviceId } from '@/lib/deviceFingerprint';
import { toast } from 'sonner';
import { identifyUser, resetPostHog } from '@/lib/posthog';

interface AuthContextType {
  user: AuthUser | null;
  subscription: SubscriptionState;
  loading: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  refreshSubscription: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const defaultSub: SubscriptionState = {
  subscribed: false,
  productId: null,
  subscriptionEnd: null,
  tier: 'free',
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  subscription: defaultSub,
  loading: true,
  login: () => {},
  logout: () => {},
  refreshSubscription: async () => {},
  refreshUser: async () => {},
});

function mapSupabaseUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email!,
    username:
      user.user_metadata?.username ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email!.split('@')[0],
    // Google OAuth uses `picture`; standard accounts use `avatar_url`
    avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState>(defaultSub);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const checkSubscription = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setSubscription(defaultSub);
      return;
    }
    const { data, error } = await supabase.functions.invoke('check-subscription', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      // Gracefully handle 500/auth errors — don't crash the app
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { msg = await error.context.text(); } catch { /* ignore */ }
      }
      console.warn('Subscription check failed (non-fatal):', msg);
      return;
    }
    if (!data) return;
    const subEnd = data.subscription_end ?? null;
    const isActive = data.subscribed ?? false;

    // ── Trial expired: edge function downgraded DB, client dispatches event ──
    if (data.trialExpired) {
      window.dispatchEvent(new CustomEvent('mockj:subscription-expired'));
      toast('⏰ Your free trial has ended — add a card to keep Pro access.', {
        duration: 10_000,
        action: {
          label: 'Add Card',
          onClick: async () => {
            const { data: portalData } = await supabase.functions.invoke('customer-portal', {});
            if (portalData?.url) window.open(portalData.url, '_blank');
          },
        },
      });
    }

    // Dispatch expiry warning if subscription ends within 3 days
    if (isActive && subEnd) {
      const msLeft = new Date(subEnd).getTime() - Date.now();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= 3) {
        window.dispatchEvent(
          new CustomEvent('mockj:subscription-expiring-soon', { detail: { daysLeft } })
        );
      }
    }

    setSubscription({
      subscribed: isActive,
      productId: data.product_id ?? null,
      subscriptionEnd: subEnd,
      tier: data.tier ?? 'free',
    });
  };

  const login = (authUser: AuthUser) => {
    setUser(authUser);
    checkSubscription();
    // Identify the user in PostHog so all future events are tied to their profile
    identifyUser(authUser.id, {
      email: authUser.email,
      username: authUser.username,
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSubscription(defaultSub);
    // Reset PostHog identity on logout
    resetPostHog();
  };

  const refreshSubscription = async () => {
    await checkSubscription();
  };

  const refreshUser = async () => {
    const { data: { user: supaUser } } = await supabase.auth.getUser();
    if (supaUser) setUser(mapSupabaseUser(supaUser));
  };

  /** Apply a pending referral code stored in localStorage for new signups */
  const applyPendingReferral = async (accessToken: string) => {
    const code = localStorage.getItem('mockj_pending_ref');
    if (!code) return;
    try {
      const { data, error } = await supabase.functions.invoke('token-ops', {
        body: { action: 'referral-apply', code },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-device-id': getDeviceId(),
        },
      });
      if (error) {
        console.warn('Referral apply failed:', error.message);
        return;
      }
      if (data?.applied) {
        const bonus = data.referredBonus ?? 250;
        toast.success(`🎁 Referral bonus applied! +${bonus} tokens added to your wallet.`);
      }
      // Always clear — even if already applied or invalid, don\'t retry
      localStorage.removeItem('mockj_pending_ref');
    } catch (err) {
      console.warn('Referral apply error:', err);
      localStorage.removeItem('mockj_pending_ref');
    }
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session?.user) {
        login(mapSupabaseUser(session.user));
      }
      if (mounted) setLoading(false);
    });

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        if (event === 'PASSWORD_RECOVERY') {
          // User clicked the reset link — redirect to auth page reset form
          navigate('/auth?reset=true');
          setLoading(false);
        } else if (event === 'SIGNED_IN' && session?.user) {
          login(mapSupabaseUser(session.user));
          setLoading(false);
          // Auto-apply referral code for brand-new users (created within last 120s)
          const createdAt = new Date(session.user.created_at).getTime();
          const isNewUser = Date.now() - createdAt < 120_000;
          if (isNewUser) {
            applyPendingReferral(session.access_token);
          }
        } else if (event === 'SIGNED_OUT') {
          logout();
          setLoading(false);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(mapSupabaseUser(session.user));
        }
      }
    );

    // Periodic subscription refresh (every 60s) — only while a session is active
    const interval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) checkSubscription();
    }, 60_000);

    // Re-check subscription when tab regains focus (catches post-Stripe-checkout return)
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) checkSubscription();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Re-check subscription when window regains focus
    const handleFocus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) checkSubscription();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;
      authSub.unsubscribe();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, subscription, loading, login, logout, refreshSubscription, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
