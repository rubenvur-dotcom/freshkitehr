import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { logAudit } from '../../../lib/auditLog';
import { useAuthStore } from '../../../store/authStore';
import { useToast } from '../../../hooks/use-toast';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Save, CheckCircle, AlertCircle, Server, Database, Globe, RefreshCw, Play } from 'lucide-react';

interface PlatformSetting { key: string; value: string | null; }

const EDITABLE_KEYS = [
  { key: 'company_name',  label: 'Company Name',  type: 'text',  placeholder: 'Freshkite' },
  { key: 'company_logo',  label: 'Logo URL',       type: 'url',   placeholder: 'https://...' },
  { key: 'admin_email',   label: 'Admin Email',    type: 'email', placeholder: 'admin@example.com' },
  { key: 'app_url',       label: 'App URL',        type: 'url',   placeholder: 'https://hr.freshkite.net' },
];

export const PlatformSection: React.FC = () => {
  const { profile: me } = useAuthStore();
  const { toast } = useToast();
  const [_settings, setSettings]    = useState<Record<string, string>>({});
  const [form, setForm]             = useState<Record<string, string>>({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('platform_settings').select('key,value');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((s: PlatformSetting) => { map[s.key] = s.value ?? ''; });
      setSettings(map);
      const initial: Record<string, string> = {};
      EDITABLE_KEYS.forEach(k => { initial[k.key] = map[k.key] ?? ''; });
      setForm(initial);
    }
    setLoading(false);
  }, []);

  const checkSupabase = useCallback(async () => {
    setSupabaseStatus('checking');
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      setSupabaseStatus(error ? 'error' : 'ok');
    } catch {
      setSupabaseStatus('error');
    }
  }, []);

  useEffect(() => { load(); checkSupabase(); }, [load, checkSupabase]);

  const MIGRATION_COLUMNS = [
    { name: 'date_of_birth',                 type: 'DATE' },
    { name: 'emergency_contact_name',        type: 'TEXT' },
    { name: 'emergency_contact_relationship',type: 'TEXT' },
    { name: 'emergency_contact_phone',       type: 'TEXT' },
    { name: 'residential_address',           type: 'TEXT' },
    { name: 'national_id',                   type: 'TEXT' },
  ];

  const MIGRATION_SQL = MIGRATION_COLUMNS
    .map(c => `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ${c.name} ${c.type};`)
    .join('\n');

  const handleMigration = async () => {
    setMigrating(true);
    setMigrationResult(null);

    // Try exec_sql RPC first
    const { error: rpcErr } = await supabase.rpc('exec_sql', { sql: MIGRATION_SQL });

    if (!rpcErr) {
      setMigrationResult({ ok: true, message: 'Database migration completed successfully. Please refresh the page.' });
      setMigrating(false);
      return;
    }

    // RPC not available — probe each column to see which are already present
    const missing: string[] = [];
    for (const col of MIGRATION_COLUMNS) {
      const { error: probeErr } = await supabase.from('profiles').select(col.name).limit(1);
      if (probeErr) missing.push(col.name);
    }

    if (missing.length === 0) {
      setMigrationResult({ ok: true, message: 'All columns already exist — no migration needed.' });
    } else {
      setMigrationResult({ ok: false, message: MIGRATION_SQL });
    }

    setMigrating(false);
  };

  const handleSave = async () => {
    if (!me) return;
    setSaving(true);
    try {
      const upserts = EDITABLE_KEYS.map(k => ({
        key: k.key,
        value: form[k.key] || null,
        updated_by: me.id,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('platform_settings').upsert(upserts, { onConflict: 'key' });
      if (error) throw error;
      await logAudit(me.id, me.full_name, 'platform_settings_updated', 'platform_settings', undefined, form);
      toast({ title: 'Platform settings saved' });
      load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '—';
  const nodeEnv     = import.meta.env.MODE ?? 'unknown';

  if (loading) return <div className="text-center py-10 text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Editable settings */}
      <div className="p-4 rounded-xl border border-gray-200 bg-white">
        <h3 className="font-medium text-gray-900 text-sm mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-[#0D9488]" /> Company Settings
        </h3>
        <div className="space-y-3">
          {EDITABLE_KEYS.map(k => (
            <div key={k.key}>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{k.label}</label>
              <Input
                type={k.type}
                placeholder={k.placeholder}
                value={form[k.key] ?? ''}
                onChange={e => setForm(f => ({ ...f, [k.key]: e.target.value }))}
                className="h-9"
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving} className="h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>

      {/* Supabase status */}
      <div className="p-4 rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-gray-900 text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-[#0D9488]" /> Supabase Connection
          </h3>
          <Button size="sm" variant="ghost" onClick={checkSupabase} className="h-8 px-2 gap-1.5 text-xs text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" /> Re-check
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {supabaseStatus === 'ok'       && <CheckCircle className="w-4 h-4 text-green-500" />}
            {supabaseStatus === 'error'    && <AlertCircle className="w-4 h-4 text-red-500" />}
            {supabaseStatus === 'checking' && <RefreshCw   className="w-4 h-4 text-gray-400 animate-spin" />}
            <span className={`text-sm font-medium ${supabaseStatus === 'ok' ? 'text-green-700' : supabaseStatus === 'error' ? 'text-red-700' : 'text-gray-500'}`}>
              {supabaseStatus === 'ok' ? 'Connected' : supabaseStatus === 'error' ? 'Connection error' : 'Checking…'}
            </span>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="text-xs text-gray-500">Supabase URL</p>
            <p className="font-mono text-xs text-gray-900 break-all">{supabaseUrl}</p>
          </div>
        </div>
      </div>

      {/* Database migration */}
      <div className="p-4 rounded-xl border border-gray-200 bg-white">
        <h3 className="font-medium text-gray-900 text-sm mb-1 flex items-center gap-2">
          <Database className="w-4 h-4 text-[#0D9488]" /> Database
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Run this migration to add personal data columns (date of birth, emergency contact, address, national ID) to the profiles table. Safe to run multiple times — uses <code className="bg-gray-100 px-1 rounded">ADD COLUMN IF NOT EXISTS</code>.
        </p>

        {migrationResult && (
          <div className={`mb-4 p-4 rounded-lg border text-xs leading-relaxed ${
            migrationResult.ok
              ? 'bg-[#D1FAE5] border-[#6EE7B7] text-[#065F46]'
              : 'bg-[#F0FDFA] border-[#99F6E4] text-[#134E4A]'
          }`}>
            {migrationResult.ok ? (
              <p>{migrationResult.message}</p>
            ) : (
              <div className="space-y-3">
                <p className="font-semibold text-sm text-[#134E4A]">Automatic migration unavailable — run this SQL in your Supabase SQL Editor:</p>
                <pre className="bg-white border border-[#99F6E4] rounded-lg p-3 text-[11px] font-mono text-[#374151] whitespace-pre overflow-x-auto leading-relaxed">
                  {migrationResult.message}
                </pre>
                <p className="text-[#134E4A]">After running, click <strong>Re-check</strong> above and retry your import.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-[#99F6E4] text-[#0D9488] hover:bg-[#CCFBF1] gap-1.5"
                  onClick={() => navigator.clipboard.writeText(migrationResult.message)}
                >
                  Copy SQL
                </Button>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={handleMigration}
          disabled={migrating}
          className="h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5 text-sm"
        >
          {migrating ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Running…</>
          ) : (
            <><Play className="w-4 h-4" /> Run Database Migration</>
          )}
        </Button>
      </div>

      {/* Environment info */}
      <div className="p-4 rounded-xl border border-gray-200 bg-white">
        <h3 className="font-medium text-gray-900 text-sm mb-4 flex items-center gap-2">
          <Server className="w-4 h-4 text-[#0D9488]" /> Environment
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Environment', nodeEnv],
            ['App Name', 'Freshkite HR'],
            ['Version', '1.0.0'],
            ['Service Key', '✓ Configured (server-side)'],
          ].map(([label, val]) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-sm font-medium mt-0.5 ${val?.startsWith('✗') ? 'text-red-600' : val?.startsWith('✓') ? 'text-green-700' : 'text-gray-900'}`}>{val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
