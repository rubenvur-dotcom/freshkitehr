import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { logAudit } from '../../../lib/auditLog';
import { useAuthStore } from '../../../store/authStore';
import { useToast } from '../../../hooks/use-toast';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Save, Mail, CheckCircle, AlertCircle } from 'lucide-react';

interface Setting { key: string; value: string | null; }

const TOGGLES = [
  { key: 'notify_leave_approved',    label: 'Leave Approved',      desc: 'Notify employee when a leave request is approved' },
  { key: 'notify_leave_rejected',    label: 'Leave Rejected',      desc: 'Notify employee when a leave request is rejected' },
  { key: 'notify_leave_submitted',   label: 'Leave Submitted',     desc: 'Notify admins when a new leave request is submitted' },
  { key: 'notify_announcement',      label: 'New Announcement',    desc: 'Notify all staff when an announcement is published' },
  { key: 'notify_password_reset',    label: 'Password Reset',      desc: 'Send password reset emails to users' },
  { key: 'notify_invite',            label: 'New User Invite',     desc: 'Send invite emails to newly added users' },
];

export const NotificationSection: React.FC = () => {
  const { profile: me } = useAuthStore();
  const { toast } = useToast();
  const [settings, setSettings]       = useState<Record<string, string>>({});
  const [loading, setLoading]         = useState(true);
  const [testEmail, setTestEmail]     = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [saving, setSaving]           = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('platform_settings').select('key,value');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((s: Setting) => { map[s.key] = s.value ?? 'true'; });
      setSettings(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getToggle = (key: string) => settings[key] !== 'false';

  const handleToggle = async (key: string) => {
    if (!me) return;
    const next = !getToggle(key);
    setSaving(key);
    const { error } = await supabase.from('platform_settings')
      .upsert({ key, value: String(next), updated_by: me.id }, { onConflict: 'key' });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else {
      setSettings(s => ({ ...s, [key]: String(next) }));
      await logAudit(me.id, me.full_name, 'notification_setting_changed', 'platform_settings', undefined, { key, value: next });
      toast({ title: next ? 'Notification enabled' : 'Notification disabled' });
    }
    setSaving(null);
  };

  const handleSendTest = async () => {
    if (!testEmail || !me) return;
    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke('send-test-email', { body: { to: testEmail } });
      if (error) throw error;
      await logAudit(me.id, me.full_name, 'test_email_sent', 'notification', undefined, { to: testEmail });
      toast({ title: 'Test email sent', description: `Sent to ${testEmail}` });
    } catch (e: unknown) {
      toast({ title: 'Error sending test email', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSendingTest(false);
    }
  };

  const smtpHost = settings['smtp_host'];
  const smtpUser = settings['smtp_user'];
  const smtpPort = settings['smtp_port'];
  const fromEmail = settings['smtp_from'] ?? 'Freshkite HR <hr@freshkite.net>';

  if (loading) return <div className="text-center py-10 text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* SMTP Status */}
      <div className="p-4 rounded-xl border border-gray-200 bg-white">
        <h3 className="font-medium text-gray-900 text-sm mb-3 flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#0D9488]" /> SMTP Configuration
        </h3>
        {smtpHost ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" />
              <span>SMTP configured via server environment variables</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[['Host', smtpHost], ['Port', smtpPort ?? '—'], ['User', smtpUser ?? '—']].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="font-mono text-sm text-gray-900 mt-0.5 truncate">{val}</p>
                </div>
              ))}
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mt-2">
              <p className="text-xs text-gray-500">From Address</p>
              <p className="font-mono text-sm text-gray-900 mt-0.5">{fromEmail}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertCircle className="w-4 h-4" />
            <span>SMTP not configured. Set <code className="bg-amber-50 px-1 rounded">SMTP_HOST</code>, <code className="bg-amber-50 px-1 rounded">SMTP_USER</code>, and <code className="bg-amber-50 px-1 rounded">SMTP_PASS</code> in your server environment.</span>
          </div>
        )}
      </div>

      {/* Test email */}
      <div className="p-4 rounded-xl border border-gray-200 bg-white">
        <h3 className="font-medium text-gray-900 text-sm mb-3">Send Test Email</h3>
        <div className="flex gap-2">
          <Input type="email" placeholder="recipient@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} className="flex-1 h-9" />
          <Button size="sm" onClick={handleSendTest} disabled={sendingTest || !testEmail} className="h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5">
            <Mail className="w-4 h-4" /> {sendingTest ? 'Sending…' : 'Send Test'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Sends a test email through the configured SMTP server to verify delivery.</p>
      </div>

      {/* Notification toggles */}
      <div className="p-4 rounded-xl border border-gray-200 bg-white">
        <h3 className="font-medium text-gray-900 text-sm mb-4">Email Notification Types</h3>
        <div className="space-y-3">
          {TOGGLES.map(t => {
            const enabled = getToggle(t.key);
            return (
              <div key={t.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-500">{t.desc}</p>
                </div>
                <button
                  onClick={() => handleToggle(t.key)}
                  disabled={saving === t.key}
                  className={`relative w-11 h-6 rounded-full transition-colors flex items-center ${enabled ? 'bg-[#0D9488]' : 'bg-gray-300'} ${saving === t.key ? 'opacity-50' : ''}`}
                  aria-checked={enabled}
                  role="switch"
                >
                  <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Master toggle */}
      <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-amber-900 text-sm">Email Notifications Master Switch</p>
            <p className="text-xs text-amber-700 mt-0.5">Disable all email notifications globally (overrides individual toggles).</p>
          </div>
          <button
            onClick={() => handleToggle('email_notifications_enabled')}
            disabled={saving === 'email_notifications_enabled'}
            className={`relative w-11 h-6 rounded-full transition-colors flex items-center ${getToggle('email_notifications_enabled') ? 'bg-[#0D9488]' : 'bg-gray-300'}`}
            role="switch"
            aria-checked={getToggle('email_notifications_enabled')}
          >
            <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${getToggle('email_notifications_enabled') ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={load} variant="outline" className="h-9 gap-1.5"><Save className="w-4 h-4" /> Refresh Settings</Button>
      </div>
    </div>
  );
};
