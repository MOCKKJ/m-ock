/**
 * useTokenWallet.ts
 * Hook to fetch and manage the user's MOCKJ token balance,
 * daily streak, badges, and transaction history.
 *
 * SINGLETON FIX: Module-level cache ensures only ONE interval and ONE set of
 * listeners fires regardless of how many components call useTokenWallet().
 * Previous bug: 6-9 simultaneous POSTs per session mount (each component
 * spawned its own 60s interval).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getDeviceId } from '@/lib/deviceFingerprint';
import { FunctionsHttpError } from '@supabase/supabase-js';

export interface TokenTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

export interface StreakInfo {
  current: number;
  longest: number;
  totalClaims: number;
  lastClaim: string | null;
  canClaimToday: boolean;
  todayReward: number;
}

export interface ReferralRow {
  id: string;
  status: string;
  referred_id: string;
  referrer_reward: number;
  created_at: string;
}

export interface WalletState {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  streak: StreakInfo;
  badges: string[];
  transactions: TokenTransaction[];
  referrals: { count: number; rows: ReferralRow[] };
  loading: boolean;
  error: string | null;
}

const DEFAULT_STREAK: StreakInfo = {
  current: 0, longest: 0, totalClaims: 0,
  lastClaim: null, canClaimToday: false, todayReward: 50,
};

const DEFAULT_STATE: WalletState = {
  balance: 0, lifetimeEarned: 0, lifetimeSpent: 0,
  streak: DEFAULT_STREAK, badges: [], transactions: [],
  referrals: { count: 0, rows: [] }, loading: true, error: null,
};

// ── Module-level singleton state ───────────────────────────────────────────
// All hook instances share ONE cache, ONE interval, and ONE set of listeners.
// This eliminates the 6-9 concurrent POSTs that fired on every session mount.
let _cachedState: WalletState = { ...DEFAULT_STATE };
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _isPolling = false;
const _subscribers = new Set<(s: WalletState) => void>();
let _lastUserId: string | null = null;

function notifySubscribers(state: WalletState) {
  _cachedState = state;
  _subscribers.forEach(fn => fn(state));
}

async function callTokenOps(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('token-ops', {
    body,
    headers: {
      ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
      'x-device-id': getDeviceId(),
    },
  });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try { const t = await error.context?.text(); msg = t || msg; } catch { /* noop */ }
    }
    throw new Error(msg);
  }
  return data;
}

async function fetchBalanceSingleton(userId: string | null, force = false) {
  // Never call token-ops without a real user — it will always 401
  if (!userId) {
    notifySubscribers({ ...DEFAULT_STATE, loading: false });
    return;
  }
  // Verify session is still valid before invoking
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    notifySubscribers({ ...DEFAULT_STATE, loading: false });
    return;
  }
  // Debounce: skip if already in-flight (bypass with force=true for token-spent events)
  if (_isPolling && !force) return;
  _isPolling = true;
  try {
    const data = await callTokenOps({ action: 'balance' });
    if (data && typeof data.balance === 'number') {
      notifySubscribers({
        balance:        data.balance,
        lifetimeEarned: data.lifetimeEarned ?? 0,
        lifetimeSpent:  data.lifetimeSpent ?? 0,
        streak:         data.streak ?? DEFAULT_STREAK,
        badges:         data.badges ?? [],
        transactions:   data.transactions ?? [],
        referrals:      data.referrals ?? { count: 0, rows: [] },
        loading: false,
        error: null,
      });
    } else {
      notifySubscribers({ ..._cachedState, loading: false });
    }
  } catch (err) {
    console.warn('[useTokenWallet] fetchBalance failed (keeping existing balance):', (err as Error).message);
    notifySubscribers({ ..._cachedState, loading: false, error: (err as Error).message });
  } finally {
    _isPolling = false;
  }
}

function startSingletonPolling(userId: string | null) {
  // If user changed, restart polling
  if (_lastUserId !== userId) {
    stopSingletonPolling();
    _lastUserId = userId;
  }
  // Don't start polling for unauthenticated users — prevents constant 401s
  if (!userId) {
    notifySubscribers({ ...DEFAULT_STATE, loading: false });
    return;
  }
  if (_intervalId !== null) return; // already running

  fetchBalanceSingleton(userId);
  _intervalId = setInterval(() => fetchBalanceSingleton(userId), 60_000);

  // Tab focus refetch (single handler for all instances)
  const onVisibility = () => {
    if (document.visibilityState === 'visible') fetchBalanceSingleton(userId);
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Token spend event — force-refetch even if a poll is in progress
  const onSpent = () => fetchBalanceSingleton(userId, true);
  window.addEventListener('mockj:tokens-spent', onSpent);

  // Checkout success — force-refetch balance after returning from Stripe
  const onCheckoutSuccess = () => fetchBalanceSingleton(userId, true);
  window.addEventListener('mockj:checkout-success', onCheckoutSuccess);

  // Store cleanup refs on the interval closure via a cleanup map
  _cleanupHandlers.push(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('mockj:tokens-spent', onSpent);
    window.removeEventListener('mockj:checkout-success', onCheckoutSuccess);
  });
}

const _cleanupHandlers: (() => void)[] = [];

function stopSingletonPolling() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  _cleanupHandlers.forEach(fn => fn());
  _cleanupHandlers.length = 0;
  _isPolling = false;
}

// ─────────────────────────────────────────────────────────────────────────────

export function useTokenWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletState>(_cachedState);
  const mountedRef = useRef(true);

  // Subscribe to singleton state
  useEffect(() => {
    mountedRef.current = true;
    const subscriber = (s: WalletState) => {
      if (mountedRef.current) setWallet(s);
    };
    _subscribers.add(subscriber);

    // Start/restart singleton polling for this user
    startSingletonPolling(user?.id ?? null);

    return () => {
      mountedRef.current = false;
      _subscribers.delete(subscriber);
      // Only stop polling when the LAST subscriber unmounts
      if (_subscribers.size === 0) {
        stopSingletonPolling();
        _lastUserId = null;
      }
    };
  }, [user?.id]);

  // Claim signup bonus
  const claimSignupBonus = useCallback(async () => {
    const data = await callTokenOps({ action: 'signup-bonus' });
    if (!data.alreadyClaimed) await fetchBalanceSingleton(user?.id ?? null);
    return data as { alreadyClaimed: boolean; bonus: number };
  }, [user?.id]);

  // Claim daily login reward
  const claimDailyLogin = useCallback(async () => {
    const data = await callTokenOps({ action: 'daily-login' });
    if (!data.alreadyClaimed) await fetchBalanceSingleton(user?.id ?? null);
    return data as { alreadyClaimed: boolean; streak: number; reward: number; notes: string[] };
  }, [user?.id]);

  // Apply referral code
  const applyReferralCode = useCallback(async (code: string) => {
    const data = await callTokenOps({ action: 'referral-apply', code });
    if (data.applied) await fetchBalanceSingleton(user?.id ?? null);
    return data as { applied?: boolean; alreadyApplied?: boolean; error?: string };
  }, [user?.id]);

  // Refresh
  const refresh = useCallback(() => fetchBalanceSingleton(user?.id ?? null), [user?.id]);

  return {
    wallet,
    claimSignupBonus,
    claimDailyLogin,
    applyReferralCode,
    refresh,
  };
}
