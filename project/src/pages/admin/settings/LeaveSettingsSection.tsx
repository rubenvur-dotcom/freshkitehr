import React, { useEffect, useState, useCallback } from 'react';
import { supabase, type Profile, type LeavePolicy } from '../../../lib/supabase';
import { logAudit } from '../../../lib/auditLog';
import { useAuthStore } from '../../../store/authStore';
import { useToast } from '../../../hooks/use-toast';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../../components/ui/alert-dialog';
import { Save, RotateCcw, User, Settings } from 'lucide-react';

const LEAVE_TYPES = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid', 'Compassionate', 'Study'];

export const LeaveSettingsSection: React.FC = () => {
  const { profile: me } = useAuthStore();
  const { toast } = useToast();
  const [policies, setPolicies]     = useState<LeavePolicy[]>([]);
  const [employees, setEmployees]   = useState<Profile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editPolicy, setEditPolicy] = useState<LeavePolicy | null>(null);
  const [policyDays, setPolicyDays] = useState('');
  const [showScopeDialog, setShowScopeDialog] = useState(false);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [maxPerms, setMaxPerms]     = useState('2');
  const [savingPerms, setSavingPerms] = useState(false);
  const [overrideEmp, setOverrideEmp] = useState<Profile | null>(null);
  const [overrideAnnual, setOverrideAnnual] = useState('');
  const [overrideSick, setOverrideSick]     = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [tab, setTab] = useState<'global' | 'individual' | 'permissions'>('global');
  const [empSearch, setEmpSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [polRes, empRes, settRes] = await Promise.all([
      supabase.from('leave_policies').select('*').order('leave_type'),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('platform_settings').select('*').eq('key', 'max_permissions_per_month').single(),
    ]);
    setPolicies(polRes.data ?? []);
    setEmployees(empRes.data ?? []);
    if (settRes.data) setMaxPerms(settRes.data.value ?? '2');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePolicyEditSave = () => {
    const days = parseInt(policyDays);
    if (isNaN(days) || days < 0) return;
    // Move to scope choice dialog
    setShowScopeDialog(true);
  };

  const applyPolicy = async (scope: 'new' | 'all') => {
    if (!editPolicy || !me) return;
    const newDays = parseInt(policyDays);
    const oldDays = editPolicy.days_allowed;
    setScopeLoading(true);

    // Always update the policy default
    const { error } = await supabase.from('leave_policies').update({ days_allowed: newDays }).eq('id', editPolicy.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setScopeLoading(false);
      return;
    }

    let updatedCount = 0;

    if (scope === 'all') {
      // Determine which profile column maps to this leave type
      const col = editPolicy.leave_type === 'Annual' ? 'annual_entitlement'
                : editPolicy.leave_type === 'Sick'   ? 'sick_entitlement'
                : null;

      if (col) {
        const { data: toUpdate } = await supabase
          .from('profiles')
          .select('id')
          .eq('is_active', true);

        if (toUpdate && toUpdate.length > 0) {
          const ids = toUpdate.map(r => r.id);
          for (const id of ids) {
            await supabase.from('profiles').update({ [col]: newDays }).eq('id', id);
          }
          updatedCount = ids.length;
        }
      }
    }

    await logAudit(me.id, me.full_name, 'leave_policy_updated', 'leave_policy', editPolicy.id, {
      type: editPolicy.leave_type, oldDays, newDays, scope, updatedEmployees: updatedCount,
    });

    if (scope === 'all') {
      toast({ title: 'Policy updated', description: `${editPolicy.leave_type}: ${newDays} days. ${updatedCount} employee record${updatedCount !== 1 ? 's' : ''} updated.` });
    } else {
      toast({ title: 'Policy updated', description: `${editPolicy.leave_type}: ${newDays} days. Applies to new employees only.` });
    }

    setScopeLoading(false);
    setShowScopeDialog(false);
    setEditPolicy(null);
    load();
  };

  const handleSavePerms = async () => {
    if (!me) return;
    setSavingPerms(true);
    const { error } = await supabase.from('platform_settings').upsert({ key: 'max_permissions_per_month', value: maxPerms }, { onConflict: 'key' });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      await logAudit(me.id, me.full_name, 'permission_limit_updated', 'platform_settings', undefined, { max: maxPerms });
      toast({ title: 'Permission limit saved' });
    }
    setSavingPerms(false);
  };

  const handleSaveOverride = async () => {
    if (!overrideEmp || !me) return;
    const annual = parseInt(overrideAnnual);
    const sick   = parseInt(overrideSick);
    const updates: Partial<Profile> = {};
    if (!isNaN(annual)) updates.annual_entitlement = annual;
    if (!isNaN(sick))   updates.sick_entitlement   = sick;
    const { error } = await supabase.from('profiles').update(updates).eq('id', overrideEmp.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await logAudit(me.id, me.full_name, 'leave_entitlement_overridden', 'profile', overrideEmp.id, { annual, sick, name: overrideEmp.full_name });
    toast({ title: 'Entitlement updated', description: overrideEmp.full_name });
    setOverrideEmp(null);
    load();
  };

  const handleResetBalances = async () => {
    if (!me) return;
    // Reset annual + sick to policy defaults for all active employees
    const annualPol = policies.find(p => p.leave_type === 'Annual');
    const sickPol   = policies.find(p => p.leave_type === 'Sick');
    const { error } = await supabase.from('profiles').update({
      annual_entitlement: annualPol?.days_allowed ?? 22,
      sick_entitlement:   sickPol?.days_allowed   ?? 10,
    }).eq('is_active', true);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await logAudit(me.id, me.full_name, 'leave_balances_reset', 'profile');
    toast({ title: 'Leave balances reset for all active employees' });
    setShowResetConfirm(false);
    load();
  };

  const filteredEmps = employees.filter(e => e.full_name.toLowerCase().includes(empSearch.toLowerCase()));

  if (loading) return <div className="text-center py-10 text-gray-400">Loading…</div>;

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {(['global', 'individual', 'permissions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white text-[#0D9488] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'global' ? 'Global Defaults' : t === 'individual' ? 'Per Employee' : 'Permissions'}
          </button>
        ))}
      </div>

      {/* Global defaults */}
      {tab === 'global' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Set the default entitlement days for each leave type, applied platform-wide.</p>
            <Button size="sm" variant="outline" onClick={() => setShowResetConfirm(true)} className="h-9 gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50">
              <RotateCcw className="w-4 h-4" /> Reset All Balances
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LEAVE_TYPES.map(lt => {
              const pol = policies.find(p => p.leave_type === lt);
              return (
                <div key={lt} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-white">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{lt} Leave</p>
                    <p className="text-xs text-gray-500">{pol?.days_allowed ?? '—'} days default</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => { setEditPolicy(pol ?? null); setPolicyDays(String(pol?.days_allowed ?? 0)); }}>
                    <Settings className="w-3.5 h-3.5" /> Edit
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per employee */}
      {tab === 'individual' && (
        <div className="space-y-3">
          <Input placeholder="Search employees…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} className="max-w-xs h-9" />
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Annual (days)</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sick (days)</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEmps.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{e.full_name}</div>
                      <div className="text-xs text-gray-500">{e.department ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{e.annual_entitlement}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{e.sick_entitlement}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" className="h-7 text-[#0D9488] text-xs hover:bg-[#CCFBF1]" onClick={() => { setOverrideEmp(e); setOverrideAnnual(String(e.annual_entitlement)); setOverrideSick(String(e.sick_entitlement)); }}>
                        <User className="w-3 h-3 mr-1" /> Override
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Permissions limit */}
      {tab === 'permissions' && (
        <div className="max-w-md space-y-4">
          <p className="text-sm text-gray-500">Set the maximum number of permission requests an employee can submit per month.</p>
          <div className="p-4 border border-gray-200 rounded-xl bg-white space-y-3">
            <label className="text-sm font-medium text-gray-700">Max permissions per month</label>
            <div className="flex gap-2">
              <Input type="number" min="0" max="20" value={maxPerms} onChange={e => setMaxPerms(e.target.value)} className="w-24 h-9" />
              <Button size="sm" onClick={handleSavePerms} disabled={savingPerms} className="h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5">
                <Save className="w-4 h-4" /> Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit policy — single multi-step dialog */}
      <Dialog open={!!editPolicy} onOpenChange={o => { if (!o && !scopeLoading) { setEditPolicy(null); setShowScopeDialog(false); } }}>
        <DialogContent className="max-w-[460px]">
          {!showScopeDialog ? (
            <>
              <DialogHeader><DialogTitle>Edit {editPolicy?.leave_type} Leave</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Default days allowed</label>
                  <Input type="number" min="0" value={policyDays} onChange={e => setPolicyDays(e.target.value)} />
                </div>
                <p className="text-xs text-gray-400">Current default: {editPolicy?.days_allowed} days</p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setEditPolicy(null)}>Cancel</Button>
                  <Button onClick={handlePolicyEditSave} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">Next →</Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>Who should this change apply to?</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <p className="text-sm text-gray-500">
                  Changing <strong>{editPolicy?.leave_type} Leave</strong> from <strong>{editPolicy?.days_allowed}</strong> to <strong>{policyDays}</strong> days.
                </p>
                <div className="grid grid-cols-1 gap-3 pt-1">
                  <button
                    disabled={scopeLoading}
                    onClick={() => applyPolicy('new')}
                    className="flex flex-col items-start gap-1 p-4 rounded-xl border-2 border-gray-200 hover:border-[#0D9488] hover:bg-[#0D9488]/5 transition-all text-left disabled:opacity-50"
                  >
                    <span className="font-semibold text-gray-900 text-sm">New employees only</span>
                    <span className="text-xs text-gray-500">Updates the global default. Existing employee entitlements are not changed.</span>
                  </button>
                  <button
                    disabled={scopeLoading}
                    onClick={() => applyPolicy('all')}
                    className="flex flex-col items-start gap-1 p-4 rounded-xl border-2 border-gray-200 hover:border-[#0D9488] hover:bg-[#0D9488]/5 transition-all text-left disabled:opacity-50"
                  >
                    <span className="font-semibold text-gray-900 text-sm">Apply to all employees now</span>
                    <span className="text-xs text-gray-500">Updates the global default AND sets all active employees to the new value.</span>
                  </button>
                </div>
                {scopeLoading && <p className="text-xs text-center text-gray-400">Updating…</p>}
                <div className="flex justify-end pt-1">
                  <Button variant="outline" disabled={scopeLoading} onClick={() => setShowScopeDialog(false)}>← Back</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Override entitlement dialog */}
      <Dialog open={!!overrideEmp} onOpenChange={o => !o && setOverrideEmp(null)}>
        <DialogContent className="max-w-[420px] max-h-[60vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Override Entitlement — {overrideEmp?.full_name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Annual days</label>
              <Input type="number" min="0" value={overrideAnnual} onChange={e => setOverrideAnnual(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Sick days</label>
              <Input type="number" min="0" value={overrideSick} onChange={e => setOverrideSick(e.target.value)} />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setOverrideEmp(null)}>Cancel</Button>
              <Button onClick={handleSaveOverride} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">Save Override</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset balances confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-700">Reset All Leave Balances</AlertDialogTitle>
            <AlertDialogDescription>This will reset all active employees' Annual and Sick entitlements to the global policy defaults. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetBalances} className="bg-amber-600 hover:bg-amber-700 text-white">Reset Balances</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
