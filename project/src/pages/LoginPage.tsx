import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { KiteLogo } from '../components/KiteLogo';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type LoginForm = z.infer<typeof loginSchema>;
type ForgotForm = z.infer<typeof forgotSchema>;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { fetchProfile } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotSent, setForgotSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const forgotForm = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema) });

  const handleLogin = async (data: LoginForm) => {
    setLoading(true);
    setError('');

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Incorrect email or password. Please try again.'
          : authError.message
      );
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setError('Authentication failed. Please try again.');
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active, offboarding_status')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      setError('No profile found for this account. Please contact your administrator.');
      setLoading(false);
      return;
    }

    if (!profile.is_active) {
      await supabase.auth.signOut();
      if (profile.offboarding_status === 'in_progress') {
        setError('Your account is currently undergoing the offboarding process. Please contact HR if you have any questions.');
      } else if (profile.offboarding_status === 'complete') {
        setError('Your account has been deactivated. Please contact HR if you believe this is an error.');
      } else {
        setError('Your account has been deactivated. Please contact your administrator.');
      }
      setLoading(false);
      return;
    }

    await fetchProfile(authData.user.id);

    if (profile.role === 'admin') {
      navigate('/admin/dashboard', { replace: true });
    } else {
      navigate('/employee/dashboard', { replace: true });
    }

    setLoading(false);
  };

  const handleForgot = async (data: ForgotForm) => {
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (authError) {
      setError(authError.message);
    } else {
      setForgotSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#0F1629] rounded-2xl shadow-2xl border border-[#1E2A3B] overflow-hidden">
          {/* Branded header */}
          <div className="bg-gradient-to-br from-[#0D9488] to-[#0F766E] px-8 py-10 text-white">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-white/20 rounded-xl p-2.5 flex items-center justify-center">
                <img
                  src="/freshkite-logo.png"
                  alt="Freshkite HR"
                  className="h-12 w-auto object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (next) next.style.display = 'block';
                  }}
                />
                <span style={{ display: 'none' }}><KiteLogo size={48} /></span>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Freshkite HR</h1>
                <p className="text-teal-200 text-sm">People Platform</p>
              </div>
            </div>
            <p className="text-teal-100 text-sm leading-relaxed">
              {mode === 'login'
                ? 'Sign in to manage your leave requests and team schedules.'
                : 'Enter your email address to receive a password reset link.'}
            </p>
          </div>

          <div className="px-8 py-8 bg-[#0F1629]">
            {mode === 'login' ? (
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-[#CBD5E1]">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@freshkite.net"
                      className="pl-10 h-11 bg-[#1A2332] border-[#2D3B50] text-white placeholder:text-[#64748B] focus:border-[#0D9488] focus:ring-[#0D9488]/20"
                      {...loginForm.register('email')}
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="text-xs text-red-500">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium text-[#CBD5E1]">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-11 bg-[#1A2332] border-[#2D3B50] text-white placeholder:text-[#64748B] focus:border-[#0D9488] focus:ring-[#0D9488]/20"
                      {...loginForm.register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-red-500">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-solid h-11"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign In
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); }}
                  className="w-full text-sm text-[#0D9488] hover:text-[#0F766E] font-medium transition-colors text-center"
                >
                  Forgot your password?
                </button>
              </form>
            ) : forgotSent ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-16 h-16 bg-[#CCFBF1] rounded-full flex items-center justify-center mx-auto">
                  <Mail className="w-7 h-7 text-[#0D9488]" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Check your inbox</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    We've sent a password reset link to your email address.
                  </p>
                </div>
                <button
                  onClick={() => { setMode('login'); setForgotSent(false); setError(''); }}
                  className="text-sm text-[#0D9488] hover:text-[#0F766E] font-medium transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={forgotForm.handleSubmit(handleForgot)} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email" className="text-sm font-medium text-[#CBD5E1]">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@freshkite.net"
                      className="pl-10 h-11 bg-[#1A2332] border-[#2D3B50] text-white placeholder:text-[#64748B] focus:border-[#0D9488]"
                      {...forgotForm.register('email')}
                    />
                  </div>
                  {forgotForm.formState.errors.email && (
                    <p className="text-xs text-red-500">{forgotForm.formState.errors.email.message}</p>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-solid h-11"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>

                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); }}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors text-center"
                >
                  Back to sign in
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-[#475569] mt-6">
          Freshkite HR © {new Date().getFullYear()} · Mauritius
        </p>
      </div>
    </div>
  );
};
