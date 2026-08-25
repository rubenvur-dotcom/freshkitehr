import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, LeaveRequest, PermissionRequest } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatDate, cn, computeLeaveBalances } from '../../lib/utils';
import { LeaveTypeBadge } from '../../components/LeaveTypeBadge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { SubmitLeaveModal } from '../../components/SubmitLeaveModal';
import { Plus, FileText, Clock, CircleAlert as AlertCircle, CircleCheck as CheckCircle2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

type StatusFilter = 'All' | 'Pending' | 'Approved' | 'Rejected';
type Tab = 'leave' | 'permissions';

const STATUS_OPTIONS: StatusFilter[] = ['All', 'Pending', 'Approved', 'Rejected'];

const MAX_MONTHLY_PERMISSIONS = 2;
const HALF_DAY_THRESHOLD_MINUTES = 120;

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

const PERM_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Pending:  { bg: 'bg-gray-100',    text: 'text-[#6B7280]'  },
  Approved: { bg: 'bg-[#D1FAE5]',   text: 'text-[#065F46]'  },
  Declined: { bg: 'bg-[#FEE2E2]',   text: 'text-[#991B1B]'  },
};

export const MyRequestsPage: React.FC = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab: Tab = searchParams.get('tab') === 'permissions' ? 'permissions' : 'leave';
  const setTab = (t: Tab) => setSearchParams(t === 'leave' ? {} : { tab: t }, { replace: true });

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [submitOpen, setSubmitOpen] = useState(false);

  // Permission request dialog state
  const [permOpen, setPermOpen] = useState(false);
  const [permForm, setPermForm] = useState({ date: '', start_time: '', end_time: '', reason: '' });
  const [permSubmitting, setPermSubmitting] = useState(false);
  const [permValidationError, setPermValidationError] = useState('');

  // Leave balance derived values
  const approved = requests.filter((r) => r.status === 'Approved');
  const pending  = requests.filter((r) => r.status === 'Pending');
  const balances = profile ? computeLeaveBalances(profile, approved, pending) : null;
  const annualTotal     = balances?.annualAllowance ?? profile?.annual_entitlement ?? 22;
  const sickTotal       = balances?.sickAllowance   ?? profile?.sick_entitlement   ?? 21;
  const annualUsed      = balances?.annualUsed      ?? 0;
  const sickUsed        = balances?.sickUsed        ?? 0;
  const annualRemaining = balances?.annualRemaining ?? (annualTotal - annualUsed);
  const sickRemaining   = balances?.sickRemaining   ?? (sickTotal  - sickUsed);
  const fetchRequests = useCallback(async () => {
    if (!profile) return;
    const [leaveRes, permRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('permission_requests')
        .select('*')
        .eq('employee_id', profile.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    if (leaveRes.data) setRequests(leaveRes.data as LeaveRequest[]);
    if (permRes.data) setPermissions(permRes.data as PermissionRequest[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Permission form derived values
  const permDuration = (() => {
    if (!permForm.start_time || !permForm.end_time) return 0;
    const start = parseTimeToMinutes(permForm.start_time);
    const end = parseTimeToMinutes(permForm.end_time);
    return end > start ? end - start : 0;
  })();

  const conversionWarning = permDuration > HALF_DAY_THRESHOLD_MINUTES;

  const thisMonthApproved = (() => {
    if (!permForm.date) return 0;
    const monthKey = getMonthKey(permForm.date);
    return permissions.filter(
      (p) => getMonthKey(p.date) === monthKey && p.status !== 'Declined'
    ).length;
  })();

  const handlePermSubmit = async () => {
    if (!profile) return;
    setPermValidationError('');

    if (!permForm.date || !permForm.start_time || !permForm.end_time) {
      setPermValidationError('Please fill in all required fields.');
      return;
    }
    if (permDuration <= 0) {
      setPermValidationError('End time must be after start time.');
      return;
    }
    if (thisMonthApproved >= MAX_MONTHLY_PERMISSIONS) {
      setPermValidationError(`Monthly permission limit (${MAX_MONTHLY_PERMISSIONS}) reached. Please submit a leave request instead.`);
      return;
    }

    setPermSubmitting(true);
    const { error } = await supabase.from('permission_requests').insert({
      employee_id: profile.id,
      date: permForm.date,
      start_time: permForm.start_time,
      end_time: permForm.end_time,
      duration_minutes: permDuration,
      reason: permForm.reason.trim() || null,
      status: 'Pending',
      converted_to_half_day: conversionWarning,
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      const { data: admins } = await supabase
        .from('profiles').select('id').eq('role', 'admin').eq('is_active', true);
      if (admins?.length) {
        await supabase.from('notifications').insert(
          admins.map((a) => ({
            recipient_id: a.id,
            type: 'permission_submitted',
            title: 'Permission Request Submitted',
            body: `${profile.full_name} submitted a permission request for ${new Date(permForm.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })} (${formatTime(permForm.start_time)} – ${formatTime(permForm.end_time)}).`,
            is_read: false,
          }))
        );
      }
      toast({
        title: conversionWarning ? 'Submitted as Half-Day Leave' : 'Permission Request Submitted',
        description: conversionWarning
          ? 'Duration exceeds 2 hours — submitted as a 0.5 day leave.'
          : 'Your request is pending admin approval.',
      });
      setPermForm({ date: '', start_time: '', end_time: '', reason: '' });
      setPermOpen(false);
      fetchRequests();
    }
    setPermSubmitting(false);
  };

  const resetPermForm = () => {
    setPermForm({ date: '', start_time: '', end_time: '', reason: '' });
    setPermValidationError('');
    setPermOpen(false);
  };

  // Filtered leave requests
  const filteredLeave = statusFilter === 'All'
    ? requests
    : requests.filter((r) => r.status === statusFilter);

  const leaveCounts: Record<StatusFilter, number> = {
    All: requests.length,
    Pending: requests.filter((r) => r.status === 'Pending').length,
    Approved: requests.filter((r) => r.status === 'Approved').length,
    Rejected: requests.filter((r) => r.status === 'Rejected').length,
  };

  const thisMonthPermCount = permissions.filter(
    (p) => getMonthKey(p.date) === getMonthKey(new Date().toISOString().split('T')[0]) && p.status !== 'Declined'
  ).length;

  const subtitle = 'Manage and track your leave and permission requests';

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {activeTab === 'leave' ? (
          <Button onClick={() => setSubmitOpen(true)} className="btn-solid gap-2">
            <Plus className="w-4 h-4" />
            Request Leave
          </Button>
        ) : (
          <Button
            onClick={() => setPermOpen(true)}
            className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 font-medium"
          >
            <Plus className="w-4 h-4" />
            New Permission
          </Button>
        )}
      </div>

      {/* Compact summary bar */}
      {!loading && (
        <div className="flex flex-wrap gap-6 bg-[#F0FDFA] border border-[#CCFBF1] rounded-lg px-4 py-2.5 text-[13px] text-[#0F766E]">
          <span>Annual: <strong>{annualRemaining} day{annualRemaining !== 1 ? 's' : ''} remaining</strong></span>
          <span className="hidden sm:inline text-[#CCFBF1]">|</span>
          <span>Sick: <strong>{sickRemaining} day{sickRemaining !== 1 ? 's' : ''} remaining</strong></span>
          <span className="hidden sm:inline text-[#CCFBF1]">|</span>
          <span>Permissions: <strong>{thisMonthPermCount}/2 used this month</strong></span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[#E5E7EB]">
        <div className="flex gap-8">
          {([
            { id: 'leave' as Tab, label: 'Leave Requests' },
            { id: 'permissions' as Tab, label: 'Permissions' },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={[
                'py-2.5 text-sm transition-colors -mb-px',
                activeTab === tab.id
                  ? 'text-[#0D9488] border-b-2 border-[#0D9488] font-semibold'
                  : 'text-[#6B7280] border-b-2 border-transparent hover:text-[#0A0F1E]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── LEAVE TAB ── */}
      {activeTab === 'leave' && (
        <>
          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={[
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  {s}
                  {!loading && (
                    <span className={['ml-1.5 tabular-nums', statusFilter === s ? 'text-gray-500' : 'text-gray-400'].join(' ')}>
                      {leaveCounts[s]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="sm:hidden flex-1">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="h-9 border-gray-200 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Leave table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="divide-y divide-gray-100">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
                    <div className="h-5 w-16 bg-gray-100 rounded-full" />
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                    <div className="h-4 w-8 bg-gray-100 rounded ml-auto" />
                    <div className="h-5 w-20 bg-gray-100 rounded-full" />
                  </div>
                ))}
              </div>
            ) : filteredLeave.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-6 h-6 text-gray-300" />
                </div>
                {requests.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-gray-600">No leave requests yet</p>
                    <p className="text-xs text-gray-400 mt-1 mb-4">Your submitted requests will appear here.</p>
                    <Button onClick={() => setSubmitOpen(true)} size="sm" className="btn-solid">
                      Submit First Request
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-600">No {statusFilter.toLowerCase()} requests</p>
                    <button onClick={() => setStatusFilter('All')} className="text-xs text-[#0D9488] hover:text-[#7b35d9] mt-2 font-medium">
                      Show all requests
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">From</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">To</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Days</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Submitted</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Comment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLeave.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <LeaveTypeBadge value={req.leave_type} />
                            {req.submitted_by_admin && (
                              <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full whitespace-nowrap">Added by HR</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-xs whitespace-nowrap">{formatDate(req.start_date)}</td>
                        <td className="px-4 py-3.5 text-gray-600 text-xs whitespace-nowrap">{formatDate(req.end_date)}</td>
                        <td className="px-4 py-3.5 font-semibold text-gray-800 tabular-nums text-sm">{Number(req.working_days)}d</td>
                        <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">{formatDate(req.created_at)}</td>
                        <td className="px-4 py-3.5"><LeaveTypeBadge value={req.status} variant="status" /></td>
                        <td className="px-4 py-3.5 text-xs text-gray-400 max-w-[200px]">
                          {req.admin_comment ? <span className="italic">"{req.admin_comment}"</span> : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── PERMISSIONS TAB ── */}
      {activeTab === 'permissions' && (
        <>
          {/* Monthly usage indicator */}
          {!loading && (
            <div className={cn(
              'flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm',
              thisMonthPermCount >= MAX_MONTHLY_PERMISSIONS
                ? 'bg-red-50 border-red-200 text-red-700'
                : thisMonthPermCount === MAX_MONTHLY_PERMISSIONS - 1
                  ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]'
                  : 'bg-[#CCFBF1] border-[#CCFBF1] text-[#0D9488]'
            )}>
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-xs">
                <strong>{thisMonthPermCount}/{MAX_MONTHLY_PERMISSIONS}</strong> permissions used this month.
                {thisMonthPermCount >= MAX_MONTHLY_PERMISSIONS && (
                  <span className="ml-1.5 font-semibold">Monthly limit reached — submit a leave request instead.</span>
                )}
              </span>
            </div>
          )}

          {/* Permissions list */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="divide-y divide-gray-100">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                    <div className="h-4 w-32 bg-gray-100 rounded" />
                    <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
                  </div>
                ))}
              </div>
            ) : permissions.length === 0 ? (
              <div className="py-16 text-center">
                <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No permission requests yet.</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">Request temporary time off during working hours.</p>
                <Button
                  onClick={() => setPermOpen(true)}
                  size="sm"
                  className="bg-[#0D9488] hover:bg-[#0F766E] text-white"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  New Permission
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      {['Date', 'Time', 'Duration', 'Reason', 'Status', 'Admin Note'].map((h) => (
                        <th key={h} className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {permissions.map((p) => {
                      const style = PERM_STATUS_STYLES[p.status] ?? PERM_STATUS_STYLES.Pending;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3.5 text-gray-800 font-medium whitespace-nowrap">
                            {new Date(p.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-5 py-3.5 text-gray-600 text-sm whitespace-nowrap">
                            {formatTime(p.start_time)} – {formatTime(p.end_time)}
                          </td>
                          <td className="px-5 py-3.5 text-gray-600 text-sm">
                            <span className="font-semibold">{formatDuration(p.duration_minutes)}</span>
                            {p.converted_to_half_day && (
                              <span className="ml-1.5 text-[10px] font-semibold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full">→ Half Day</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-gray-500 text-xs max-w-[200px] truncate">
                            {p.reason || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full', style.bg, style.text)}>
                              {p.status === 'Approved' && <CheckCircle2 className="w-3 h-3" />}
                              {p.status === 'Pending' && <Clock className="w-3 h-3" />}
                              {p.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-400 max-w-[180px] truncate">
                            {p.admin_comment ? <span className="italic">"{p.admin_comment}"</span> : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Leave request modal */}
      <SubmitLeaveModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSuccess={() => { setSubmitOpen(false); fetchRequests(); }}
      />

      {/* Permission request dialog */}
      <Dialog open={permOpen} onOpenChange={(o) => { if (!o) resetPermForm(); }}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#0D9488]" />
              Request Permission
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Date <span className="text-red-600">*</span></Label>
              <Input
                type="date"
                value={permForm.date}
                onChange={(e) => { setPermForm((f) => ({ ...f, date: e.target.value })); setPermValidationError(''); }}
                className="border-gray-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time <span className="text-red-600">*</span></Label>
                <Input
                  type="time"
                  value={permForm.start_time}
                  onChange={(e) => { setPermForm((f) => ({ ...f, start_time: e.target.value })); setPermValidationError(''); }}
                  className="border-gray-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Time <span className="text-red-600">*</span></Label>
                <Input
                  type="time"
                  value={permForm.end_time}
                  onChange={(e) => { setPermForm((f) => ({ ...f, end_time: e.target.value })); setPermValidationError(''); }}
                  className="border-gray-200"
                />
              </div>
            </div>

            {permDuration > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border bg-[#CCFBF1] border-[#0D9488]/20 text-[#0D9488]">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>Duration: <strong>{formatDuration(permDuration)}</strong></span>
              </div>
            )}

            {conversionWarning && (
              <div className="flex items-start gap-2.5 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold mb-0.5">Exceeds 2-Hour Limit</p>
                  <p>Durations over 2 hours are classified as a Half-Day Leave. This will be submitted as <strong>0.5 Day Leave</strong>.</p>
                </div>
              </div>
            )}

            {permForm.date && thisMonthApproved >= MAX_MONTHLY_PERMISSIONS && (
              <div className="flex items-start gap-2.5 px-3 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold mb-0.5">Monthly Limit Reached (Max {MAX_MONTHLY_PERMISSIONS})</p>
                  <p>You've used {thisMonthApproved} permission{thisMonthApproved !== 1 ? 's' : ''} this month. Please submit a leave request instead.</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Reason <span className="font-normal text-gray-400">(optional)</span></Label>
              <Textarea
                value={permForm.reason}
                onChange={(e) => setPermForm((f) => ({ ...f, reason: e.target.value.slice(0, 300) }))}
                placeholder="Brief explanation..."
                className="resize-none h-16 text-sm border-gray-200"
              />
              <p className="text-xs text-gray-400 text-right">{permForm.reason.length}/300</p>
            </div>

            {permValidationError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">{permValidationError}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetPermForm}>Cancel</Button>
            <Button
              onClick={handlePermSubmit}
              disabled={permSubmitting || !permForm.date || !permForm.start_time || !permForm.end_time}
              className="bg-[#0D9488] hover:bg-[#0F766E] text-white font-medium"
            >
              {permSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </span>
              ) : conversionWarning ? 'Submit as Half-Day Leave' : 'Submit Permission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
