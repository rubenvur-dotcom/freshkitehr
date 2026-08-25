import React, { useEffect, useState, useCallback } from 'react';
import { supabase, type Profile } from '../../../lib/supabase';
import { logAudit } from '../../../lib/auditLog';
import { updateAuthUserEmail } from '../../../lib/adminApi';
import { exportEmployeesCsv } from '../../../lib/employeeCsv';
import { useAuthStore } from '../../../store/authStore';
import { useToast } from '../../../hooks/use-toast';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { UserPlus, Trash2, RefreshCw, Search, Download, Edit2 } from 'lucide-react';

const DEPARTMENTS = ['Engineering', 'Finance', 'HR', 'Marketing', 'Operations', 'Sales', 'Support', 'Management'];
const EMP_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern'] as const;
const RELATIONSHIPS = ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Colleague', 'Other'] as const;
const PAGE_SIZE   = 20;

const blankForm = () => ({
  full_name: '', email: '', department: '', job_title: '',
  date_of_hire: '', employment_type: 'Full-time', is_active: true, role: 'employee' as 'admin' | 'employee',
  date_of_birth: '',
  emergency_contact_name: '', emergency_contact_relationship: '', emergency_contact_phone: '',
});

export const EmployeeRecordsSection: React.FC = () => {
  const { profile: me } = useAuthStore();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [showAdd, setShowAdd]     = useState(false);
  const [editEmp, setEditEmp]     = useState<Profile | null>(null);
  const [deleteEmp, setDeleteEmp] = useState<Profile | null>(null);
  const [form, setForm]           = useState(blankForm());
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('full_name');
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else setEmployees(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered   = employees.filter(e => e.full_name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase()) || e.department?.toLowerCase().includes(search.toLowerCase()));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const openAdd = () => { setForm(blankForm()); setShowAdd(true); };
  const openEdit = (e: Profile) => {
    setEditEmp(e);
    setForm({
      full_name: e.full_name, email: e.email, department: e.department ?? '',
      job_title: ((e as unknown) as Record<string, unknown>).job_title as string ?? '',
      date_of_hire: e.date_of_hire ?? '', employment_type: ((e as unknown) as Record<string, unknown>).employment_type as string ?? 'Full-time',
      is_active: e.is_active, role: e.role,
      date_of_birth: e.date_of_birth ?? '',
      emergency_contact_name: e.emergency_contact_name ?? '',
      emergency_contact_relationship: e.emergency_contact_relationship ?? '',
      emergency_contact_phone: e.emergency_contact_phone ?? '',
    });
  };

  const handleSave = async () => {
    if (!me || !form.full_name || !form.email) return;
    setSaving(true);
    try {
      const commonFields = {
        full_name: form.full_name, email: form.email, department: form.department,
        date_of_hire: form.date_of_hire || null, is_active: form.is_active, role: form.role,
        date_of_birth: form.date_of_birth || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_relationship: form.emergency_contact_relationship || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
      };
      if (editEmp) {
        const emailChanged = form.email !== editEmp.email;
        if (emailChanged) {
          // Update auth email first; server endpoint also syncs profiles.email atomically
          await updateAuthUserEmail(editEmp.id, form.email);
        }
        const { error } = await supabase.from('profiles').update(commonFields).eq('id', editEmp.id);
        if (error) {
          // Roll back auth email change if profile update failed
          if (emailChanged) {
            await updateAuthUserEmail(editEmp.id, editEmp.email).catch(() => {});
          }
          throw error;
        }
        await logAudit(me.id, me.full_name, 'employee_updated', 'profile', editEmp.id, { name: form.full_name, emailChanged });
        toast({ title: 'Employee updated' });
        setEditEmp(null);
      } else {
        // Duplicate email check
        const { data: existing } = await supabase.from('profiles').select('id').eq('email', form.email).maybeSingle();
        if (existing) {
          toast({ title: 'Duplicate email', description: 'An employee with this email already exists.', variant: 'destructive' });
          setSaving(false);
          return;
        }
        const { error } = await supabase.from('profiles').insert({
          ...commonFields,
          annual_entitlement: 22, sick_entitlement: 10,
          has_probation: false, probation_duration_months: null, probation_end_date: null,
          probation_status: 'passed', total_annual_entitlement: 22,
        });
        if (error) throw error;
        await logAudit(me.id, me.full_name, 'employee_created', 'profile', undefined, { name: form.full_name });
        toast({ title: 'Employee added' });
        setShowAdd(false);
      }
      load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEmp || !me) return;
    const empId = deleteEmp.id;

    // Guard: never delete the last admin
    if (deleteEmp.role === 'admin') {
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true);
      const otherAdmins = (admins ?? []).filter(a => a.id !== empId);
      if (otherAdmins.length === 0) {
        toast({
          title: 'Cannot delete the only administrator account.',
          description: 'Please promote another employee to admin first.',
          variant: 'destructive',
        });
        setDeleteEmp(null);
        return;
      }
    }
    // Cascade delete in dependency order
    const { data: checklists } = await supabase.from('offboarding_checklists').select('id').eq('employee_id', empId);
    if (checklists?.length) {
      const ids = checklists.map(c => c.id);
      await supabase.from('offboarding_audit_log').delete().in('checklist_id', ids);
      await supabase.from('offboarding_items').delete().in('checklist_id', ids);
    }
    await supabase.from('offboarding_checklists').delete().eq('employee_id', empId);
    await supabase.from('permission_requests').delete().eq('employee_id', empId);
    await supabase.from('leave_requests').delete().eq('employee_id', empId);
    await supabase.from('employee_documents').delete().eq('employee_id', empId);
    await supabase.from('employee_emergency_contacts').delete().eq('employee_id', empId);
    await supabase.from('notifications').delete().eq('recipient_id', empId);
    await supabase.from('audit_logs').delete().eq('actor_id', empId);
    const { error } = await supabase.from('profiles').delete().eq('id', empId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await logAudit(me.id, me.full_name, 'employee_deleted', 'profile', empId, { name: deleteEmp.full_name });
    toast({ title: `${deleteEmp.full_name} has been permanently deleted` });
    setDeleteEmp(null);
    load();
  };

  const exportCSV = () => exportEmployeesCsv(employees);

  const FormDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editEmp ? 'Edit Employee' : 'Add Employee'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Full Name *</label>
            <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Email *</label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            {editEmp && (
              <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 leading-snug">
                Note: The employee will need to use their new email address to log in. Their Supabase Auth email is not automatically updated and may need to be changed separately.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Department</label>
            <Select value={form.department} onValueChange={v => setForm(f => ({ ...f, department: v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set([...DEPARTMENTS, ...employees.map(e => e.department).filter(Boolean) as string[]])).sort().map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Role</label>
            <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as 'admin' | 'employee' }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Employment Type</label>
            <Select value={form.employment_type} onValueChange={v => setForm(f => ({ ...f, employment_type: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{EMP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Date of Hire</label>
            <Input type="date" value={form.date_of_hire} onChange={e => setForm(f => ({ ...f, date_of_hire: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
            <Select value={form.is_active ? 'active' : 'inactive'} onValueChange={v => setForm(f => ({ ...f, is_active: v === 'active' }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Personal & Emergency */}
          <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Personal Details</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Date of Birth</label>
            <Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} className="h-9" />
          </div>

          <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Emergency Contact</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Contact Name</label>
            <Input value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} placeholder="Full name" className="h-9" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Relationship</label>
            <Select value={form.emergency_contact_relationship} onValueChange={v => setForm(f => ({ ...f, emergency_contact_relationship: v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{RELATIONSHIPS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Contact Phone</label>
            <Input type="tel" value={form.emergency_contact_phone} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} placeholder="+230 5000 0000" className="h-9" />
          </div>

          <div className="col-span-2 flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.full_name || !form.email} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">
              {saving ? 'Saving…' : editEmp ? 'Update' : 'Add Employee'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search employees…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-9" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={load} className="h-9 px-3"><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" onClick={exportCSV} className="h-9 gap-1.5"><Download className="w-4 h-4" /> Export</Button>
          <Button size="sm" onClick={openAdd} className="h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5"><UserPlus className="w-4 h-4" /> Add Employee</Button>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Department</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Hired</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading…</td></tr>
            ) : paginated.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{e.full_name}</div>
                  <div className="text-xs text-gray-500">{e.email}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{e.department ?? '—'}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.role === 'admin' ? 'bg-[#CCFBF1] text-[#0D9488]' : 'bg-gray-100 text-gray-600'}`}>{e.role}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">{e.date_of_hire ?? '—'}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{e.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-[#0D9488]" onClick={() => openEdit(e)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-50" onClick={() => setDeleteEmp(e)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{filtered.length} employees</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-8">Prev</Button>
            <span className="flex items-center px-2">{page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="h-8">Next</Button>
          </div>
        </div>
      )}

      <FormDialog open={showAdd} onClose={() => setShowAdd(false)} />
      <FormDialog open={!!editEmp} onClose={() => setEditEmp(null)} />

      <AlertDialog open={!!deleteEmp} onOpenChange={o => !o && setDeleteEmp(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#EF4444]">Delete Employee Record</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete <strong>{deleteEmp?.full_name}</strong>? This removes their profile and all associated data.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-[#EF4444] hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
