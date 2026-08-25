import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { KiteLogo } from '../components/KiteLogo';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const [showPw, setShowPw] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleUpdate = async () => {
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) {
      setError(authError.message);
    } else {
      setSuccess(true);
      setTimeout(() => { window.location.href = '/login'; }, 2000);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-[#0D9488] to-[#0F766E] px-8 py-10 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white/20 rounded-xl p-2">
                <img
                  src="/freshkite-logo.png"
                  alt="Freshkite HR"
                  className="h-8 w-auto object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (next) next.style.display = 'block';
                  }}
                />
                <span style={{ display: 'none' }}><KiteLogo size={32} /></span>
              </div>
              <div>
                <h1 className="text-xl font-bold">Set New Password</h1>
                <p className="text-teal-200 text-xs">Freshkite HR</p>
              </div>
            </div>
            <p className="text-teal-100 text-sm">Choose a strong password for your account.</p>
          </div>

          {/* Body */}
          <div className="px-8 py-8">
            {success ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-12 h-12 rounded-full bg-[#CCFBF1] flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-[#0D9488]" />
                </div>
                <p className="text-sm font-medium text-gray-800">
                  Password updated successfully. Redirecting to login…
                </p>
              </div>
            ) : !sessionReady ? (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin flex-shrink-0" />
                  <p className="text-sm text-gray-600">Waiting for authentication…</p>
                </div>
                <p className="text-xs text-gray-400">
                  If this persists, please request a new password reset email.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-11 bg-white border-gray-300 text-gray-900 focus:border-[#0D9488]"
                      placeholder="Min. 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type={showPw ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="pl-10 h-11 bg-white border-gray-300 text-gray-900"
                      placeholder="Repeat password"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="w-full btn-solid h-11"
                >
                  {loading ? 'Updating…' : 'Update Password'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
