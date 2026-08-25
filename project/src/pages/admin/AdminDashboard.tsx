import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, LeaveRequest, Profile, EmployeePersonalData, PermissionRequest } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { logAudit } from '../../lib/auditLog';
import { useAuthStore } from '../../store/authStore';
import { LeaveTypeBadge } from '../../components/LeaveTypeBadge';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { triggerLeaveStatusEmail } from '../../lib/emailService';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Clock, CircleCheck as CheckCircle, Users, CalendarClock, Check, X, Megaphone, TriangleAlert, Cake, Phone, Search, CircleAlert as AlertCircle, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';

type RequestWithProfile = LeaveRequest & { profiles: Profile };

const LEAVE_COLORS: Record<string, string> = {
  Annual: '#0D9488', Sick: '#f59e0b', Maternity: '#ec4899',
  Paternity: '#3b82f6', Emergency: '#ef4444', Unpaid: '#6b7280',
};

// ─── Policy flag helpers ───────────────────────────────────────────────────────

function isShortNoticeViolation(req: RequestWithProfile): boolean {
  if (!req.is_short_notice) return false;
  return req.leave_type !== 'Sick' && req.leave_type !== 'Emergency';
}

function isProbationAccrualExceeded(req: RequestWithProfile, allRequests: RequestWithProfile[]): boolean {
  if (req.profiles?.probation_status !== 'in_probation') return false;
  const hireDate = req.profiles?.date_of_hire;
  if (!hireDate) return false;
  // Accrual = 1 day per completed month since hire
  const hire = new Date(hireDate);
  const now = new Date();
  const monthsWorked = Math.max(0,
    (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth())
  );
  const accrued = monthsWorked;
  const used = allRequests
    .filter((r) => r.employee_id === req.employee_id && r.status !== 'Rejected')
    .reduce((s, r) => s + Number(r.working_days), 0);
  return (Number(used) + Number(req.working_days)) > accrued;
}

// ─── Birthday helper ───────────────────────────────────────────────────────────

interface UpcomingBirthday {
  name: string;
  dob: string;
  daysUntil: number;
  isToday: boolean;
}

function getUpcomingBirthdays(personalData: (EmployeePersonalData & { profiles?: Profile })[]): UpcomingBirthday[] {
  const today = new Date();
  const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const results: UpcomingBirthday[] = [];

  for (const pd of personalData) {
    if (!pd.date_of_birth || !pd.profiles?.full_name) continue;
    const dob = new Date(pd.date_of_birth);
    // Next birthday this year or next
    let next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    const diffMs = next.getTime() - today.getTime();
    const daysUntil = Math.ceil(diffMs / 86400000);
    if (daysUntil <= 30) {
      const birthMonthDay = `${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`;
      results.push({
        name: pd.profiles.full_name,
        dob: pd.date_of_birth,
        daysUntil,
        isToday: birthMonthDay === todayMonthDay,
      });
    }
  }
  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

// ─── Emergency contact search modal ────────────────────────────────────────────

interface EmergencyContact {
  employee_id: string;
  contact_name: string;
  relationship: string;
  phone_primary: string;
  phone_alt: string;
  profiles?: { full_name: string; department: string };
}

const EmergencySearchModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('employee_emergency_contacts')
      .select('*, profiles(full_name, department)')
      .then(({ data }) => {
        setContacts((data ?? []) as EmergencyContact[]);
        setLoading(false);
      });
  }, [open]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return !q || (c.profiles?.full_name ?? '').toLowerCase().includes(q) || c.contact_name.toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setSearch(''); } }}>
      <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <Phone className="w-4 h-4" />
            Emergency Contacts
          </DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            autoFocus
            placeholder="Search by employee or contact name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-gray-200 text-sm"
          />
        </div>
        {loading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <AlertCircle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">{search ? 'No contacts match your search.' : 'No emergency contacts on file.'}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filtered.map((c) => (
              <div key={c.employee_id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{c.profiles?.full_name}</p>
                    <p className="text-xs text-gray-400">{c.profiles?.department}</p>
                  </div>
                  <span className="text-[10px] bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full flex-shrink-0">Emergency</span>
                </div>
                <div className="text-xs text-gray-600 mb-2">
                  <span className="font-medium text-gray-800">{c.contact_name}</span>
                  {c.relationship && <span className="text-gray-400"> · {c.relationship}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.phone_primary && (
                    <a href={`tel:${c.phone_primary}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors">
                      <Phone className="w-3 h-3" />
                      {c.phone_primary}
                    </a>
                  )}
                  {c.phone_alt && (
                    <a href={`tel:${c.phone_alt}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-xs font-semibold transition-colors">
                      <Phone className="w-3 h-3" />
                      {c.phone_alt}
                    </a>
                  )}
                  {!c.phone_primary && !c.phone_alt && (
                    <span className="text-xs text-gray-400 italic">No phone numbers on file</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export const AdminDashboard: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile: me } = useAuthStore();
  const [requests, setRequests] = useState<RequestWithProfile[]>([]);
  const [personalData, setPersonalData] = useState<(EmployeePersonalData & { profiles?: Profile })[]>([]);
  const [activeAnnouncementCount, setActiveAnnouncementCount] = useState(0);
  const [pendingPermissions, setPendingPermissions] = useState<(PermissionRequest & { profiles: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [permActionLoading, setPermActionLoading] = useState<string | null>(null);
  const [permComments, setPermComments] = useState<Record<string, string>>({});
  const [rejectingPermId, setRejectingPermId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const now = new Date().toISOString();
    const [reqRes, annRes, pdRes, permRes] = await Promise.all([
      supabase.from('leave_requests').select('*, profiles(*)').order('created_at', { ascending: false }),
      supabase.from('announcements').select('id', { count: 'exact', head: true }).or(`expires_at.is.null,expires_at.gt.${now}`),
      supabase.from('employee_personal_data').select('*, profiles(full_name, department)'),
      supabase.from('permission_requests').select('*, profiles(*)').eq('status', 'Pending').order('created_at', { ascending: false }),
    ]);
    if (reqRes.data) setRequests(reqRes.data as RequestWithProfile[]);
    setActiveAnnouncementCount(annRes.count ?? 0);
    if (pdRes.data) setPersonalData(pdRes.data as (EmployeePersonalData & { profiles?: Profile })[]);
    if (permRes.data) setPendingPermissions(permRes.data as (PermissionRequest & { profiles: Profile })[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Bi-monthly probation notification engine ────────────────────────────────
  // Runs once on mount. For each employee in probation, checks whether any
  // 2-month milestone falls within the next 7 calendar days and, if so,
  // sends one set of notifications (admin + employee) if not already sent.
  useEffect(() => {
    const runProbationChecks = async () => {
      const { data: employees } = await supabase
        .from('profiles')
        .select('id, full_name, date_of_hire, probation_status, probation_duration_months')
        .eq('probation_status', 'in_probation')
        .eq('is_active', true);

      if (!employees?.length) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysOut = new Date(today.getTime() + 7 * 86400000);

      const { data: alreadySent, error: logError } = await supabase
        .from('probation_notification_log')
        .select('employee_id, milestone_date');

      // If the table doesn't exist in the live DB, skip silently
      if (logError) return;

      const sentSet = new Set(
        (alreadySent ?? []).map((r: { employee_id: string; milestone_date: string }) => `${r.employee_id}::${r.milestone_date}`)
      );

      for (const emp of employees) {
        if (!emp.date_of_hire || !emp.probation_duration_months) continue;
        const hire = new Date(emp.date_of_hire);
        const totalMonths = emp.probation_duration_months as number;

        // Generate all 2-month milestone dates within the probation period
        for (let m = 2; m <= totalMonths; m += 2) {
          const milestone = new Date(hire);
          milestone.setMonth(milestone.getMonth() + m);
          const milestoneStr = milestone.toISOString().split('T')[0];

          if (milestone >= today && milestone <= sevenDaysOut) {
            const key = `${emp.id}::${milestoneStr}`;
            if (sentSet.has(key)) continue;

            // Log it first (idempotent)
            const { error: insertError } = await supabase.from('probation_notification_log').insert({
              employee_id: emp.id,
              milestone_date: milestoneStr,
            });
            if (insertError) continue;

            // Admin notification
            const { data: admins } = await supabase
              .from('profiles').select('id').eq('role', 'admin').eq('is_active', true);
            if (admins?.length) {
              await supabase.from('notifications').insert(
                admins.map((a: { id: string }) => ({
                  recipient_id: a.id,
                  type: 'probation_review',
                  title: 'Action Required: Probation Review',
                  body: `2-Month Probation Review milestone approaching for ${emp.full_name} (milestone date: ${new Date(milestoneStr + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}).`,
                  is_read: false,
                }))
              );
            }

            // Employee notification
            await supabase.from('notifications').insert({
              recipient_id: emp.id,
              type: 'probation_checkin',
              title: 'Upcoming Probation Check-In',
              body: 'Your upcoming bi-monthly probation catch-up is scheduled soon. Please prepare for your review.',
              is_read: false,
            });
          }
        }
      }
    };

    runProbationChecks();
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];
  const thirtyDaysOut = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0];

  const pending = requests.filter((r) => r.status === 'Pending');
  const approvedThisMonth = requests.filter((r) => r.status === 'Approved' && r.updated_at.split('T')[0] >= startOfMonth);
  const onLeaveToday = requests.filter((r) => r.status === 'Approved' && r.start_date <= todayStr && r.end_date >= todayStr);
  const upcoming = requests.filter((r) => r.status === 'Approved' && r.start_date > todayStr && r.start_date <= thirtyDaysOut);

  const leaveByType = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid'].map((type) => {
    const days = requests
      .filter((r) => r.leave_type === type && r.status === 'Approved' && r.start_date <= endOfMonth && r.end_date >= startOfMonth)
      .reduce((sum, r) => sum + r.working_days, 0);
    return { name: type, days, color: LEAVE_COLORS[type] };
  }).filter((d) => d.days > 0);

  const upcomingBirthdays = getUpcomingBirthdays(personalData);

  const handleApprove = async (req: RequestWithProfile) => {
    setActionLoading(req.id);
    const comment = comments[req.id] || null;
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: 'Approved', admin_comment: comment, updated_at: new Date().toISOString() })
      .eq('id', req.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (me) await logAudit(me.id, me.full_name, 'leave_approved', 'leave_request', req.id, { employee: req.profiles.full_name });
      toast({ title: 'Request Approved', description: `${req.profiles.full_name}'s request has been approved.` });
      await triggerLeaveStatusEmail(req, 'Approved', comment);
      fetchData();
      setRejectingId(null);
    }
    setActionLoading(null);
  };

  const handleReject = async (req: RequestWithProfile) => {
    setActionLoading(req.id);
    const comment = comments[req.id] || null;
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: 'Rejected', admin_comment: comment, updated_at: new Date().toISOString() })
      .eq('id', req.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (me) await logAudit(me.id, me.full_name, 'leave_rejected', 'leave_request', req.id, { employee: req.profiles.full_name });
      toast({ title: 'Request Rejected', description: `${req.profiles.full_name}'s request has been rejected.` });
      await triggerLeaveStatusEmail(req, 'Rejected', comment);
      fetchData();
      setRejectingId(null);
    }
    setActionLoading(null);
  };

  const handleApprovePermission = async (perm: PermissionRequest & { profiles: Profile }) => {
    setPermActionLoading(perm.id);
    const comment = permComments[perm.id] || null;
    const { error } = await supabase
      .from('permission_requests')
      .update({ status: 'Approved', admin_comment: comment, updated_at: new Date().toISOString() })
      .eq('id', perm.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (me) await logAudit(me.id, me.full_name, 'permission_approved', 'permission_request', perm.id, { employee: perm.profiles.full_name });
      toast({ title: 'Permission Approved', description: `${perm.profiles.full_name}'s request has been approved.` });
      await supabase.from('notifications').insert({
        recipient_id: perm.employee_id,
        type: 'permission_approved',
        title: 'Permission Request Approved',
        body: `Your permission request for ${new Date(perm.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })} has been approved.`,
        is_read: false,
      });
      fetchData();
      setRejectingPermId(null);
    }
    setPermActionLoading(null);
  };

  const handleDeclinePermission = async (perm: PermissionRequest & { profiles: Profile }) => {
    setPermActionLoading(perm.id);
    const comment = permComments[perm.id] || null;
    const { error } = await supabase
      .from('permission_requests')
      .update({ status: 'Declined', admin_comment: comment, updated_at: new Date().toISOString() })
      .eq('id', perm.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (me) await logAudit(me.id, me.full_name, 'permission_declined', 'permission_request', perm.id, { employee: perm.profiles.full_name });
      toast({ title: 'Permission Declined', description: `${perm.profiles.full_name}'s request has been declined.` });
      await supabase.from('notifications').insert({
        recipient_id: perm.employee_id,
        type: 'permission_declined',
        title: 'Permission Request Declined',
        body: `Your permission request for ${new Date(perm.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })} has been declined.${comment ? ` Reason: ${comment}` : ''}`,
        is_read: false,
      });
      fetchData();
      setRejectingPermId(null);
    }
    setPermActionLoading(null);
  };

  const stats = [
    { label: 'Pending Leave', value: pending.length, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Pending Permissions', value: pendingPermissions.length, icon: ShieldCheck, color: 'text-teal-500', bg: 'bg-teal-50', border: 'border-teal-100' },
    { label: 'Approved This Month', value: approvedThisMonth.length, icon: CheckCircle, color: 'text-[#0D9488]', bg: 'bg-teal-50', border: 'border-teal-100' },
    { label: 'On Leave Today', value: onLeaveToday.length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'Upcoming (30 days)', value: upcoming.length, icon: CalendarClock, color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200' },
    { label: 'Active Announcements', value: activeAnnouncementCount, icon: Megaphone, color: 'text-[#0D9488]', bg: 'bg-teal-50', border: 'border-teal-100' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {now.toLocaleDateString('en-MU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={`bg-white rounded-xl border ${border} p-5 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2 tabular-nums">
                  {loading ? <span className="inline-block w-6 h-7 bg-gray-100 rounded animate-pulse" /> : value}
                </p>
              </div>
              <div className={`${bg} rounded-xl flex-shrink-0 w-10 h-10 flex items-center justify-center overflow-hidden`}>
                <Icon size={18} className={color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Pending leave approvals ─────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Leave approvals panel */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Pending Approvals</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {loading ? '—' : `${pending.length} request${pending.length !== 1 ? 's' : ''} awaiting review`}
              </p>
            </div>
            {pending.length > 0 && (
              <span className="bg-[#FEF3C7] text-[#92400E] text-xs font-semibold px-2.5 py-1 rounded-full">
                {pending.length} pending
              </span>
            )}
          </div>

          {loading ? (
            <div className="divide-y divide-gray-100">
              {[1, 2].map((i) => (
                <div key={i} className="px-5 py-4 space-y-2 animate-pulse">
                  <div className="flex gap-2"><div className="h-4 w-32 bg-gray-100 rounded" /><div className="h-4 w-20 bg-gray-100 rounded" /></div>
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : pending.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-[#0D9488]" />
              </div>
              <p className="text-sm font-medium text-gray-700">All caught up!</p>
              <p className="text-xs text-gray-400 mt-1">No pending requests to review.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pending.map((req) => {
                const isRejecting = rejectingId === req.id;
                const isActing = actionLoading === req.id;
                const shortNotice = isShortNoticeViolation(req);
                const probationExceeded = isProbationAccrualExceeded(req, requests);

                return (
                  <div key={req.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900">{req.profiles?.full_name}</span>
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{req.profiles?.department}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <LeaveTypeBadge value={req.leave_type} />
                          <span className="text-xs text-gray-500">{formatDate(req.start_date)} – {formatDate(req.end_date)}</span>
                          <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{req.working_days}d</span>
                        </div>
                        {req.reason && (
                          <p className="text-xs text-gray-400 mt-1.5 italic truncate max-w-xs">"{req.reason}"</p>
                        )}

                        {/* ── Policy violation flags ── */}
                        {(shortNotice || probationExceeded) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {shortNotice && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700">
                                <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0" />
                                Less than 2 days notice
                              </div>
                            )}
                            {probationExceeded && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-xs font-semibold text-orange-700">
                                <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0" />
                                Exceeds Probation Accrual
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(req)}
                          disabled={isActing}
                          className="h-8 px-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-medium gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectingId(isRejecting ? null : req.id)}
                          disabled={isActing}
                          className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50 text-xs font-medium gap-1"
                        >
                          <X className="w-3 h-3" />
                          Reject
                        </Button>
                      </div>
                    </div>

                    {isRejecting && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                        <Textarea
                          placeholder="Add a reason for rejection (optional)..."
                          value={comments[req.id] || ''}
                          onChange={(e) => setComments((prev) => ({ ...prev, [req.id]: e.target.value }))}
                          className="text-sm resize-none h-20 border-gray-200 focus:border-red-300"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleReject(req)} disabled={isActing} className="h-8 px-4 bg-red-600 hover:bg-red-700 text-white text-xs">
                            {isActing ? 'Rejecting...' : 'Confirm Rejection'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRejectingId(null)} disabled={isActing} className="h-8 px-3 text-xs text-gray-500">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>

          {/* ── Pending permissions panel ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-teal-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-teal-100 flex items-center justify-between bg-teal-50/40">
              <div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-500" />
                  Pending Permissions
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {loading ? '—' : `${pendingPermissions.length} request${pendingPermissions.length !== 1 ? 's' : ''} awaiting review`}
                </p>
              </div>
              {pendingPermissions.length > 0 && (
                <span className="bg-teal-100 text-teal-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                  {pendingPermissions.length} pending
                </span>
              )}
            </div>

            {loading ? (
              <div className="divide-y divide-gray-100">
                {[1, 2].map((i) => (
                  <div key={i} className="px-5 py-4 space-y-2 animate-pulse">
                    <div className="flex gap-2"><div className="h-4 w-32 bg-gray-100 rounded" /><div className="h-4 w-20 bg-gray-100 rounded" /></div>
                    <div className="h-3 w-48 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            ) : pendingPermissions.length === 0 ? (
              <div className="py-10 text-center">
                <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="w-5 h-5 text-teal-400" />
                </div>
                <p className="text-sm font-medium text-gray-700">No pending permissions</p>
                <p className="text-xs text-gray-400 mt-1">All permission requests have been reviewed.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pendingPermissions.map((perm) => {
                  const isActing = permActionLoading === perm.id;
                  const isDeclining = rejectingPermId === perm.id;
                  const [sh, sm] = perm.start_time.split(':').map(Number);
                  const [eh, em] = perm.end_time.split(':').map(Number);
                  const fmtTime = (hh: number, mm: number) => `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
                  const h = Math.floor(perm.duration_minutes / 60);
                  const m = perm.duration_minutes % 60;
                  const dur = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
                  return (
                    <div key={perm.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-gray-900">{perm.profiles?.full_name}</span>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{perm.profiles?.department}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                              <Clock className="w-2.5 h-2.5" />
                              Permission
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(perm.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="text-xs text-gray-500">{fmtTime(sh, sm)} – {fmtTime(eh, em)}</span>
                            <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{dur}</span>
                            {perm.converted_to_half_day && (
                              <span className="text-[10px] font-semibold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full">→ Half Day</span>
                            )}
                          </div>
                          {perm.reason && (
                            <p className="text-xs text-gray-400 mt-1.5 italic truncate max-w-xs">"{perm.reason}"</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Button
                            size="sm"
                            onClick={() => handleApprovePermission(perm)}
                            disabled={isActing}
                            className="h-8 px-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium gap-1"
                          >
                            <Check className="w-3 h-3" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRejectingPermId(isDeclining ? null : perm.id)}
                            disabled={isActing}
                            className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50 text-xs font-medium gap-1"
                          >
                            <X className="w-3 h-3" />
                            Decline
                          </Button>
                        </div>
                      </div>

                      {isDeclining && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                          <Textarea
                            placeholder="Add a reason for declining (optional)..."
                            value={permComments[perm.id] || ''}
                            onChange={(e) => setPermComments((prev) => ({ ...prev, [perm.id]: e.target.value }))}
                            className="text-sm resize-none h-20 border-gray-200 focus:border-red-300"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleDeclinePermission(perm)} disabled={isActing} className="h-8 px-4 bg-red-600 hover:bg-red-700 text-white text-xs">
                              {isActing ? 'Declining...' : 'Confirm Decline'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRejectingPermId(null)} disabled={isActing} className="h-8 px-3 text-xs text-gray-500">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ───────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/admin/announcements')}
                className="flex flex-col items-center gap-2 px-3 py-3.5 rounded-xl border border-gray-100 hover:border-[#0D9488]/30 hover:bg-[#0D9488]/5 transition-all group text-center"
              >
                <div className="w-9 h-9 rounded-xl bg-[#CCFBF1] flex items-center justify-center group-hover:bg-[#CCFBF1] transition-colors">
                  <Megaphone className="w-4 h-4 text-[#0D9488]" />
                </div>
                <span className="text-xs font-semibold text-gray-700 leading-snug">Post Announcement</span>
              </button>
              <button
                onClick={() => setEmergencyModalOpen(true)}
                className="flex flex-col items-center gap-2 px-3 py-3.5 rounded-xl border border-gray-100 hover:border-red-200 hover:bg-red-50 transition-all group text-center"
              >
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                  <Phone className="w-4 h-4 text-red-600" />
                </div>
                <span className="text-xs font-semibold text-gray-700 leading-snug">Emergency Contacts</span>
              </button>
            </div>
          </div>

          {/* Leave by type chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="mb-4">
              <h2 className="font-semibold text-gray-900">Leave Days by Type</h2>
              <p className="text-xs text-gray-400 mt-0.5">Approved — {now.toLocaleDateString('en-MU', { month: 'long', year: 'numeric' })}</p>
            </div>
            {loading ? (
              <div className="h-[160px] flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-[#0D9488] rounded-full animate-spin" />
              </div>
            ) : leaveByType.length === 0 ? (
              <div className="h-[160px] flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                  <CalendarClock className="w-4 h-4 text-gray-300" />
                </div>
                <p className="text-xs text-gray-400">No approved leave this month.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={leaveByType} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }} formatter={(val) => [`${val} day${val !== 1 ? 's' : ''}`, 'Approved']} />
                  <Bar dataKey="days" radius={[4, 4, 0, 0]} maxBarSize={32}>
                    {leaveByType.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Upcoming Birthdays */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <Cake className="w-4 h-4 text-pink-400" />
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">Upcoming Birthdays</h2>
                <p className="text-xs text-gray-400 mt-0.5">Next 30 days</p>
              </div>
            </div>
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : upcomingBirthdays.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-gray-400">No birthdays in the next 30 days.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {upcomingBirthdays.map((b, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3">
                    <div className={[
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold',
                      b.isToday ? 'bg-pink-500 text-white' : 'bg-pink-50 text-pink-500',
                    ].join(' ')}>
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(b.dob + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span className={[
                      'text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0',
                      b.isToday ? 'bg-pink-100 text-pink-700' : b.daysUntil <= 7 ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500',
                    ].join(' ')}>
                      {b.isToday ? 'Today!' : `${b.daysUntil}d`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Modals */}
      <EmergencySearchModal open={emergencyModalOpen} onClose={() => setEmergencyModalOpen(false)} />
    </div>
  );
};
