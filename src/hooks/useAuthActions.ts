import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AuthUser } from '@/types/auth';
import { User } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

function mapUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email!,
    username:
      user.user_metadata?.username ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email!.split('@')[0],
    // Google OAuth returns avatar as `picture`; email/password users use `avatar_url`
    avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
  };
}

export function useAuthActions() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const sendOtp = async (email: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) {
        // Supabase returns this when "Disable Sign-up" is enabled in Auth settings
        const msg = error.message.toLowerCase();
        if (msg.includes('signup') && msg.includes('not allowed')) {
          throw new Error(
            'Sign-ups are currently paused. Please sign in if you already have an account, or contact support.'
          );
        }
        throw error;
      }
      setOtpSent(true);
      toast.success(`4-digit code sent to ${email}`, {
        duration: 8000,
        description: 'Check your inbox (and spam folder). The code expires in 10 minutes.',
        action: {
          label: '📬 Check Email',
          onClick: () => {
            // Open a webmail provider if detectable, otherwise do nothing
            const domain = email.split('@')[1]?.toLowerCase() ?? '';
            const url =
              domain === 'gmail.com' || domain === 'googlemail.com'
                ? 'https://mail.google.com'
                : ['outlook.com','hotmail.com','live.com','msn.com'].includes(domain)
                ? 'https://outlook.live.com'
                : domain === 'yahoo.com' || domain === 'ymail.com'
                ? 'https://mail.yahoo.com'
                : domain.includes('icloud') || domain === 'me.com' || domain === 'mac.com'
                ? 'https://www.icloud.com/mail'
                : domain.includes('proton') || domain === 'pm.me'
                ? 'https://mail.proton.me'
                : null;
            if (url) window.open(url, '_blank', 'noopener');
          },
        },
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send OTP');
      setLoading(false);
    }
    setLoading(false);
  };

  const verifyOtpAndSetPassword = async (
    email: string,
    token: string,
    password: string,
    username?: string
  ) => {
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (verifyError) throw verifyError;

      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        password,
        data: { username: username || email.split('@')[0] },
      });
      if (updateError) throw updateError;
      if (!updateData.user) throw new Error('No user returned after verification');

      login(mapUser(updateData.user));
      toast.success('Account created! Welcome to MockJ 🔥');
      navigate('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
      setLoading(false);
    }
  };

  const signInWithPassword = async (email: string, password: string, rememberMe = true) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned');

      // If "Remember Me" is off, clear session on tab close via sessionStorage flag
      if (!rememberMe) {
        sessionStorage.setItem('mockj_session_only', '1');
      } else {
        sessionStorage.removeItem('mockj_session_only');
      }

      login(mapUser(data.user));
      toast.success('Welcome back 🔥');
      navigate('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return { sendOtp, verifyOtpAndSetPassword, signInWithPassword, loading, otpSent, setOtpSent };
}
