import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, Profile, LeaveRequest } from '../../lib/supabase';
import { logAudit } from '../../lib/auditLog';
import { useAuthStore } from '../../store/authStore';
import { exportEmployeesCsv } from '../../lib/employeeCsv';
import { LeaveTypeBadge } from '../../components/LeaveTypeBadge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useToast } from '../../hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, Search, Users, Mail, FolderOpen, Shield, ShieldOff, KeyRound, CircleCheck as CheckCircle2, Clock, TriangleAlert as AlertTriangle, CalendarDays, Pencil, Download, Trash2, ClipboardList } from 'lucide-react';
import { ManageDocumentsModal } from '../../components/ManageDocumentsModal';
import { EmployeeVaultModal } from '../../components/EmployeeVaultModal';

const PROBATION_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  in_probation: { bg: 'bg-gray-100', text: 'text-[#6B7280]', label: 'In Probation' },
  passed:       { bg: 'bg-[#CCFBF1]', text: 'text-[#0D9488]', label: 'Passed' },
  extended:     { bg: 'bg-red-100', text: 'text-red-700', label: 'Extended' },
};

const addEmployeeSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  department: z.string().min(1),
  role: z.enum(['admin', 'employee']),
  annual_entitlement: z.coerce.number().int().min(0).max(365),
  sick_entitlement: z.coerce.number().int().min(0).max(365),
  total_annual_entitlement: z.coerce.number().int().min(0).max(365).default(22),
  date_of_hire: z.string().optional(),
  date_of_birth: z.string().optional(),
  has_probation: z.boolean().default(true),
  probation_duration_months: z.coerce.number().int().min(1).max(24).default(3),
  password: z.string().min(8),
});
type AddForm = z.infer<typeof addEmployeeSchema>;

const probationSchema = z.object({
  date_of_hire: z.string().min(1, 'Hire date is required'),
  has_probation: z.boolean(),
  probation_duration_months: z.coerce.number().int().min(1).max(24),
  probation_end_date: z.string().optional(),
  probation_status: z.enum(['in_probation', 'passed', 'extended']),
  total_annual_entitlement: z.coerce.number().int().min(0).max(365),
  sick_entitlement: z.coerce.number().int().min(0).max(365),
  annual_entitlement: z.coerce.number().int().min(0).max(365),
});
type ProbationForm = z.infer<typeof probationSchema>;

export const EmployeesPage: React.FC = () => {
  const { toast } = useToast();
  const { profile: me } = useAuthStore();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [addOpen, setAddOpen] = useState(false);
  const [probationTarget, setProbationTarget] = useState<Profile | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Profile | null>(null);
  const [documentsTarget, setDocumentsTarget] = useState<Profile | null>(null);
  const [vaultTarget, setVaultTarget] = useState<Profile | null>(null);
  const [roleTarget, setRoleTarget] = useState<Profile | null>(null);
  const [passwordResetTarget, setPasswordResetTarget] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const [savingProbation, setSavingProbation] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const addForm = useForm<AddForm>({
    resolver: zodResolver(addEmployeeSchema),
    defaultValues: {
      role: 'employee', annual_entitlement: 22, sick_entitlement: 21,
      total_annual_entitlement: 22, has_probation: true, probation_duration_months: 3,
    },
  });

  const probForm = useForm<ProbationForm>({
    resolver: zodResolver(probationSchema),
    defaultValues: {
      probation_status: 'in_probation', has_probation: true,
      probation_duration_months: 3, total_annual_entitlement: 22,
      sick_entitlement: 21, annual_entitlement: 22,
    },
  });

  const hasProbationWatch = probForm.watch('has_probation');
  const hireWatch = probForm.watch('date_of_hire');
  const durWatch = probForm.watch('probation_duration_months');

  // Auto-calculate probation_end_date when hire date or duration changes
  useEffect(() => {
    if (!hireWatch || !durWatch) return;
    const hire = new Date(hireWatch);
    hire.setMonth(hire.getMonth() + Number(durWatch));
    probForm.setValue('probation_end_date', hire.toISOString().split('T')[0]);
  }, [hireWatch, durWatch, probForm]);

  const fetchData = useCallback(async () => {
    const [empRes, reqRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('leave_requests').select('*').in('status', ['Approved', 'Pending']),
    ]);
    if (empRes.data) setEmployees(empRes.data as Profile[]);
    if (reqRes.data) setRequests(reqRes.data as LeaveRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isOnLeave = (empId: string) =>
    requests.some((r) => r.employee_id === empId && r.status === 'Approved' && r.start_date <= todayStr && r.end_date >= todayStr);

  const filtered = employees.filter(
    (e) => (!search
      || e.full_name.toLowerCase().includes(search.toLowerCase())
      || e.email.toLowerCase().includes(search.toLowerCase())
      || e.department.toLowerCase().includes(search.toLowerCase()))
      && (deptFilter === 'All' || e.department === deptFilter)
  );

  const handleAdd = async (data: AddForm) => {
    setAdding(true);
    // Duplicate email check
    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('email', data.email).maybeSingle();
    if (existingProfile) {
      toast({ title: 'Duplicate email', description: 'An employee with this email already exists.', variant: 'destructive' });
      setAdding(false);
      return;
    }
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { full_name: data.full_name, department: data.department, role: data.role } },
    });
    if (signUpError) {
      toast({ title: 'Error creating account', description: signUpError.message, variant: 'destructive' });
      setAdding(false);
      return;
    }

    if (signUpData.user) {
      await new Promise((r) => setTimeout(r, 600));
      let probationEndDate: string | undefined;
      if (data.has_probation && data.date_of_hire) {
        const hire = new Date(data.date_of_hire);
        hire.setMonth(hire.getMonth() + data.probation_duration_months);
        probationEndDate = hire.toISOString().split('T')[0];
      }

      await supabase.from('profiles').update({
        full_name: data.full_name,
        department: data.department,
        role: data.role,
        annual_entitlement: data.annual_entitlement,
        sick_entitlement: data.sick_entitlement,
        total_annual_entitlement: data.total_annual_entitlement,
        date_of_hire: data.date_of_hire || null,
        date_of_birth: data.date_of_birth || null,
        has_probation: data.has_probation,
        probation_duration_months: data.probation_duration_months,
        probation_end_date: probationEndDate || null,
        probation_status: data.has_probation ? 'in_probation' : 'passed',
      }).eq('id', signUpData.user.id);
    }

    toast({ title: 'Employee Added', description: `${data.full_name} can now log in with the temporary password.` });
    setAddOpen(false);
    addForm.reset();
    fetchData();
    setAdding(false);
  };

  const handleRoleToggle = async () => {
    if (!roleTarget) return;
    const newRole = roleTarget.role === 'admin' ? 'employee' : 'admin';
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', roleTarget.id);
    if (error) {
      toast({ title: 'Error updating role', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Role updated', description: `${roleTarget.full_name} is now ${newRole === 'admin' ? 'an admin' : 'an employee'}.` });
      fetchData();
    }
    setRoleTarget(null);
  };

  const handlePasswordReset = async () => {
    if (!passwordResetTarget) return;
    const { error } = await supabase.auth.resetPasswordForEmail(passwordResetTarget.email, {
      redirectTo: 'https://hr.freshkite.net/reset-password',
    });
    if (error) {
      toast({ title: 'Error sending reset email', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Password reset email sent', description: `Sent to ${passwordResetTarget.email}` });
    }
    setPasswordResetTarget(null);
  };

  const handleSaveProbation = async (data: ProbationForm) => {
    if (!probationTarget) return;
    setSavingProbation(true);

    const { error } = await supabase.from('profiles').update({
      date_of_hire: data.date_of_hire || null,
      has_probation: data.has_probation,
      probation_duration_months: data.probation_duration_months,
      probation_end_date: data.probation_end_date || null,
      probation_status: data.probation_status,
      total_annual_entitlement: data.total_annual_entitlement,
      sick_entitlement: data.sick_entitlement,
      annual_entitlement: data.annual_entitlement,
    }).eq('id', probationTarget.id);

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Profile updated', description: 'Probation and entitlement changes take effect immediately.' });
      setProbationTarget(null);
      fetchData();
    }
    setSavingProbation(false);
  };

  // ── Hard Delete ─────────────────────────────────────────────────────────────

  const [deleting, setDeleting] = useState(false);

  const handleHardDelete = async () => {
    if (!deactivateTarget) return;
    setDeleting(true);
    const empId = deactivateTarget.id;
    const name  = deactivateTarget.full_name;

    // Guard: never delete the last admin
    if (deactivateTarget.role === 'admin') {
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
        setDeleting(false);
        setDeactivateTarget(null);
        return;
      }
    }

    // Cascade delete in dependency order — farthest children first
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
    await supabase.from('employee_personal_data').delete().eq('employee_id', empId);
    await supabase.from('notifications').delete().eq('recipient_id', empId);
    await supabase.from('audit_logs').delete().eq('actor_id', empId);

    const { error } = await supabase.from('profiles').delete().eq('id', empId);

    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      if (me) await logAudit(me.id, me.full_name, 'employee_deleted', 'profile', empId, { name });
      toast({ title: `${name} has been permanently deleted`, description: 'All associated records have been removed.' });
      fetchData();
    }
    setDeleting(false);
    setDeactivateTarget(null);
  };

  // ── Export CSV ───────────────────────────────────────────────────────────────

  const exportEmployeesCSV = () => exportEmployeesCsv(employees);


  const activeCount = employees.filter((e) => e.is_active).length;

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '—' : `${activeCount} active employee${activeCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={exportEmployeesCSV} variant="outline" className="gap-2 text-sm border-gray-200 hover:bg-gray-50">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button onClick={() => setAddOpen(true)} className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 font-medium">
            <UserPlus className="w-4 h-4" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name, email or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 border-gray-200 text-sm"
            />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-44 h-9 text-sm border-gray-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Departments</SelectItem>
              {Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort().map(dept => (
                <SelectItem key={dept!} value={dept!}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(search || deptFilter !== 'All') && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setDeptFilter('All'); }} className="h-9 text-xs text-gray-500">
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-5 py-4 flex gap-6 animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 w-36 bg-gray-100 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
                {[1, 2, 3, 4, 5].map((j) => <div key={j} className="h-4 w-20 bg-gray-100 rounded self-center" />)}
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">No employees found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Name', 'Department', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((emp) => {
                  const onLeave = isOnLeave(emp.id);
                  const probStyle = PROBATION_STATUS_STYLES[emp.probation_status ?? 'passed'];
                  const ProbIcon = emp.probation_status === 'in_probation'
                    ? Clock
                    : emp.probation_status === 'extended'
                      ? AlertTriangle
                      : CheckCircle2;

                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => setVaultTarget(emp)}
                              className="font-semibold text-gray-900 hover:text-[#0D9488] transition-colors text-left leading-snug"
                            >
                              {emp.full_name}
                            </button>
                            {emp.is_active && emp.probation_status === 'in_probation' && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${probStyle.bg} ${probStyle.text}`}>
                                <ProbIcon className="w-2.5 h-2.5" />
                                Probation{emp.probation_end_date && ` until ${new Date(emp.probation_end_date).toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })}`}
                              </span>
                            )}
                            {emp.is_active && emp.probation_status === 'extended' && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${probStyle.bg} ${probStyle.text}`}>
                                <ProbIcon className="w-2.5 h-2.5" /> Extended Probation
                              </span>
                            )}
                            {!emp.is_active && (
                              <LeaveTypeBadge value="Inactive" variant="status" />
                            )}
                            {emp.is_active && onLeave && (
                              <LeaveTypeBadge value="On Leave" variant="status" />
                            )}
                            {emp.offboarding_status === 'in_progress' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
                                <ClipboardList className="w-2.5 h-2.5" /> Offboarding
                              </span>
                            )}
                            {emp.offboarding_status === 'complete' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Offboarded
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {emp.email}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-sm">{emp.department}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => setVaultTarget(emp)}
                            className="h-7 w-7 p-0 text-[#6B7280] hover:text-[#0D9488] hover:bg-[#F0FDFA] rounded-md transition-all duration-150"
                            title="Edit employee profile"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => setDocumentsTarget(emp)}
                            className="h-7 w-7 p-0 text-[#6B7280] hover:text-[#38BDF8] hover:bg-[#E0F2FE] rounded-md transition-all duration-150"
                            title="Manage documents"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => setRoleTarget(emp)}
                            className={emp.role === 'admin'
                              ? 'h-7 w-7 p-0 text-[#EF4444] hover:bg-[#FEE2E2] rounded-md transition-all duration-150'
                              : 'h-7 w-7 p-0 text-[#6B7280] hover:text-[#0D9488] hover:bg-[#F0FDFA] rounded-md transition-all duration-150'}
                            title={emp.role === 'admin' ? 'Revoke admin access' : 'Make admin'}
                          >
                            {emp.role === 'admin'
                              ? <ShieldOff className="w-4 h-4" />
                              : <Shield className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => setPasswordResetTarget(emp)}
                            className="h-7 w-7 p-0 text-[#6B7280] hover:text-[#F59E0B] hover:bg-[#FEF3C7] rounded-md transition-all duration-150"
                            title="Send password reset email"
                          >
                            <KeyRound className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => navigate(`/admin/offboarding/${emp.id}`)}
                            className={[
                              'h-7 w-7 p-0 rounded-md transition-all duration-150',
                              emp.offboarding_status === 'in_progress'
                                ? 'text-[#0D9488] hover:bg-[#F0FDFA]'
                                : emp.offboarding_status === 'complete'
                                  ? 'text-gray-400 hover:bg-gray-100'
                                  : 'text-[#6B7280] hover:bg-gray-100',
                            ].join(' ')}
                            title="Offboarding checklist"
                          >
                            <ClipboardList className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => setDeactivateTarget(emp)}
                            className="h-7 w-7 p-0 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#FEE2E2] rounded-md transition-all duration-150"
                            title="Permanently delete employee"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Employee Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) addForm.reset(); }}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#0D9488]" />
              Add New Employee
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={addForm.handleSubmit(handleAdd)} className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Full Name</Label>
                <Input {...addForm.register('full_name')} placeholder="Jane Smith" className="border-gray-200" />
                {addForm.formState.errors.full_name && <p className="text-xs text-red-500">{addForm.formState.errors.full_name.message}</p>}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Work Email</Label>
                <Input {...addForm.register('email')} type="email" placeholder="jane@freshkite.net" className="border-gray-200" />
                {addForm.formState.errors.email && <p className="text-xs text-red-500">{addForm.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input {...addForm.register('department')} placeholder="Engineering" className="border-gray-200" />
                {addForm.formState.errors.department && <p className="text-xs text-red-500">{addForm.formState.errors.department.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Controller name="role" control={addForm.control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="border-gray-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>

              {/* Hire date */}
              <div className="space-y-1.5">
                <Label>Date of Hire</Label>
                <Input {...addForm.register('date_of_hire')} type="date" className="border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input {...addForm.register('date_of_birth')} type="date" className="border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label>Total Annual Entitlement (days)</Label>
                <Input {...addForm.register('total_annual_entitlement')} type="number" min={0} max={365} className="border-gray-200" />
              </div>

              {/* Probation */}
              <div className="col-span-2">
                <Controller name="has_probation" control={addForm.control} render={({ field }) => (
                  <button
                    type="button"
                    onClick={() => field.onChange(!field.value)}
                    className={[
                      'w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                      field.value
                        ? 'bg-[#CCFBF1] border-[#99F6E4] text-[#0D9488]'
                        : 'bg-gray-50 border-gray-200 text-gray-500',
                    ].join(' ')}
                  >
                    <Shield className="w-4 h-4" />
                    {field.value ? 'Has Probation Period' : 'No Probation'}
                    <span className="ml-auto text-xs opacity-60">Click to toggle</span>
                  </button>
                )} />
              </div>

              {addForm.watch('has_probation') && (
                <div className="col-span-2 space-y-1.5">
                  <Label>Probation Duration (months)</Label>
                  <Controller name="probation_duration_months" control={addForm.control} render={({ field }) => (
                    <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                      <SelectTrigger className="border-gray-200"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 months</SelectItem>
                        <SelectItem value="6">6 months</SelectItem>
                        <SelectItem value="12">12 months</SelectItem>
                        {![3, 6, 12].includes(field.value) && (
                          <SelectItem value={String(field.value)}>Custom ({field.value} months)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Sick Leave (days/year)</Label>
                <Input {...addForm.register('sick_entitlement')} type="number" min={0} max={365} className="border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label>Annual Leave Override (days)</Label>
                <Input {...addForm.register('annual_entitlement')} type="number" min={0} max={365} className="border-gray-200" />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Temporary Password</Label>
                <Input {...addForm.register('password')} type="password" placeholder="Min. 8 characters" className="border-gray-200" />
                {addForm.formState.errors.password && <p className="text-xs text-red-500">{addForm.formState.errors.password.message}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setAddOpen(false); addForm.reset(); }}>Cancel</Button>
              <Button type="submit" disabled={adding} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">
                {adding ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Adding...</> : 'Add Employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Probation / Employment Settings Dialog */}
      <Dialog open={!!probationTarget} onOpenChange={(o) => !o && setProbationTarget(null)}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#0D9488]" />
              Employment Settings — {probationTarget?.full_name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={probForm.handleSubmit(handleSaveProbation)} className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date of Hire</Label>
                <Input {...probForm.register('date_of_hire')} type="date" className="border-gray-200" />
                {probForm.formState.errors.date_of_hire && <p className="text-xs text-red-500">{probForm.formState.errors.date_of_hire.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Total Annual Entitlement</Label>
                <Input {...probForm.register('total_annual_entitlement')} type="number" min={0} max={365} className="border-gray-200" />
              </div>

              {/* Probation toggle */}
              <div className="col-span-2">
                <Controller name="has_probation" control={probForm.control} render={({ field }) => (
                  <button
                    type="button"
                    onClick={() => {
                      field.onChange(!field.value);
                      if (field.value) probForm.setValue('probation_status', 'passed');
                    }}
                    className={[
                      'w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                      field.value ? 'bg-[#CCFBF1] border-[#99F6E4] text-[#0D9488]' : 'bg-gray-50 border-gray-200 text-gray-500',
                    ].join(' ')}
                  >
                    <Shield className="w-4 h-4" />
                    {field.value ? 'Probation Period Active' : 'No Probation'}
                    <span className="ml-auto text-xs opacity-60">Click to toggle</span>
                  </button>
                )} />
              </div>

              {hasProbationWatch && (
                <>
                  <div className="space-y-1.5">
                    <Label>Duration (months)</Label>
                    <Controller name="probation_duration_months" control={probForm.control} render={({ field }) => (
                      <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                        <SelectTrigger className="border-gray-200"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3">3 months</SelectItem>
                          <SelectItem value="6">6 months</SelectItem>
                          <SelectItem value="12">12 months</SelectItem>
                          <SelectItem value="18">18 months</SelectItem>
                          <SelectItem value="24">24 months</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                      Probation End Date
                    </Label>
                    <Input {...probForm.register('probation_end_date')} type="date" className="border-gray-200" />
                    <p className="text-[10px] text-gray-400">Auto-calculated. Override to extend.</p>
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <Label>Probation Status</Label>
                    <Controller name="probation_status" control={probForm.control} render={({ field }) => (
                      <div className="grid grid-cols-3 gap-2">
                        {(['in_probation', 'passed', 'extended'] as const).map((s) => {
                          const st = PROBATION_STATUS_STYLES[s];
                          const Icon = s === 'passed' ? CheckCircle2 : s === 'extended' ? AlertTriangle : Clock;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => field.onChange(s)}
                              className={[
                                'flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all',
                                field.value === s
                                  ? `${st.bg} ${st.text} border-current`
                                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
                              ].join(' ')}
                            >
                              <Icon className="w-4 h-4" />
                              {st.label}
                            </button>
                          );
                        })}
                      </div>
                    )} />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Sick Leave (days/year)</Label>
                <Input {...probForm.register('sick_entitlement')} type="number" min={0} max={365} className="border-gray-200" />
              </div>
              <div className="space-y-1.5">
                <Label>Annual Leave Override</Label>
                <Input {...probForm.register('annual_entitlement')} type="number" min={0} max={365} className="border-gray-200" />
              </div>
            </div>

            <div className="bg-[#0D9488]/5 border border-[#CCFBF1] rounded-lg px-3 py-2.5 text-xs text-[#0D9488]">
              Changes to probation status and entitlements are applied immediately for all leave balance calculations.
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProbationTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={savingProbation} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">
                {savingProbation ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ManageDocumentsModal employee={documentsTarget} onClose={() => setDocumentsTarget(null)} />

      <EmployeeVaultModal employee={vaultTarget} onClose={() => { setVaultTarget(null); fetchData(); }} />

      {/* Hard Delete Confirmation */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => { if (!o && !deleting) setDeactivateTarget(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Confirm Permanent Deletion
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-700 leading-relaxed">
              Are you sure you want to proceed? This action is permanent and will completely delete all profiles,
              historical logs, and data associated with{' '}
              <strong className="text-gray-900">{deactivateTarget?.full_name}</strong>.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleHardDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white focus:ring-red-500"
            >
              {deleting ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </span>
              ) : 'Confirm & Permanently Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Make / Revoke Admin Confirmation */}
      <AlertDialog open={!!roleTarget} onOpenChange={(o) => { if (!o) setRoleTarget(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ color: roleTarget?.role === 'admin' ? '#EF4444' : '#0D9488' }}>
              {roleTarget?.role === 'admin' ? <ShieldOff className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
              {roleTarget?.role === 'admin' ? 'Revoke Admin Access' : 'Grant Admin Access'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-700 leading-relaxed">
              {roleTarget?.role === 'admin'
                ? <>Are you sure you want to revoke admin access for <strong className="text-gray-900">{roleTarget?.full_name}</strong>? They will lose access to the admin dashboard, all requests, and employee management.</>
                : <>Are you sure you want to make <strong className="text-gray-900">{roleTarget?.full_name}</strong> an admin? They will immediately gain access to the admin dashboard, all requests, employee management, reports, and announcements.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRoleToggle}
              className={roleTarget?.role === 'admin'
                ? 'bg-[#EF4444] hover:bg-red-700 text-white'
                : 'bg-[#0D9488] hover:bg-[#0F766E] text-white'}
            >
              {roleTarget?.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password Reset Confirmation */}
      <AlertDialog open={!!passwordResetTarget} onOpenChange={(o) => { if (!o) setPasswordResetTarget(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
              <KeyRound className="w-5 h-5 text-[#0D9488]" />
              Send Password Reset
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-700 leading-relaxed">
              Send a password reset email to <strong className="text-gray-900">{passwordResetTarget?.email}</strong>?
              They will receive a link to set a new password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePasswordReset}
              className="bg-[#0D9488] hover:bg-[#0F766E] text-white"
            >
              Send Reset Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};
