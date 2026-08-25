import React, { useEffect, useState, useCallback } from 'react';
import { supabase, LeaveRequest, PermissionRequest, Profile } from '../../lib/supabase';
import { logAudit } from '../../lib/auditLog';
import { formatDate, calculateWorkingDays, getLeaveTypeCalendarColor } from '../../lib/utils';
import { LeaveTypeBadge } from '../../components/LeaveTypeBadge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { useAuthStore } from '../../store/authStore';
import { triggerLeaveStatusEmail, triggerAdminSubmittedEmail } from '../../lib/emailService';
import {
  Search, Download, Check, X, ClipboardList, UserPlus, Trash2, Clock,
  LayoutList, CalendarDays, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';

type RequestWithProfile = LeaveRequest & { profiles: Profile };
type PermissionWithProfile = PermissionRequest & { profiles: Profile };
type ViewMode = 'table' | 'calendar';

const STATUS_OPTIONS = ['All', 'Pending', 'Approved', 'Rejected'] as const;
const TYPE_OPTIONS = ['All', 'Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid', 'Compassionate', 'Study', 'Permission'] as const;
const LEAVE_TYPES = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid', 'Compassionate', 'Study'] as const;
type LeaveType = typeof LEAVE_TYPES[number];

const PERMISSION_CALENDAR_COLOR = '#7c3aed';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function insertNotification(recipientId: string, type: string, title: string, body: string, relatedType?: string, relatedId?: string) {
  return supabase.from('notifications').insert({
    recipient_id: recipientId,
    type, title, body,
    related_type: relatedType ?? null,
    related_id: relatedId ?? null,
  });
}

// ─── Calendar sub-view ─────────────────────────────────────────────────────────

const CalendarView: React.FC<{
  requests: RequestWithProfile[];
  permissions: PermissionWithProfile[];
  loading: boolean;
}> = ({ requests, permissions, loading }) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const todayStr = today.toISOString().split('T')[0];

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (string | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }),
  ];

  const approvedRequests = requests.filter((r) => r.status === 'Approved');
  const approvedPermissions = permissions.filter((p) => p.status === 'Approved');

  const getRequestsOnDay = (dateStr: string) =>
    approvedRequests.filter((r) => r.start_date <= dateStr && r.end_date >= dateStr);
  const getPermissionsOnDay = (dateStr: string) =>
    approvedPermissions.filter((p) => p.date === dateStr);

  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const monthEvents = approvedRequests.filter(
    (r) => r.start_date <= monthEnd && r.end_date >= monthStart
  );
  const monthPermissions = approvedPermissions.filter(
    (p) => p.date >= monthStart && p.date <= monthEnd
  );

  const goToPrev = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const goToNext = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
    setSelectedDay(null);
  };
  const goToToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(todayStr); };

  const selectedRequests = selectedDay ? getRequestsOnDay(selectedDay) : [];
  const selectedPermissions = selectedDay ? getPermissionsOnDay(selectedDay) : [];

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 px-1">
        {['Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid', 'Compassionate', 'Study'].map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getLeaveTypeCalendarColor(type) }} />
            <span className="text-xs text-gray-600">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PERMISSION_CALENDAR_COLOR }} />
          <span className="text-xs text-gray-600">Permission</span>
        </div>
        <Button variant="outline" size="sm" onClick={goToToday} className="ml-auto border-gray-200 text-xs h-7 px-3">Today</Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Calendar grid */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <Button variant="ghost" size="sm" onClick={goToPrev} className="w-9 h-9 p-0 rounded-lg">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="font-semibold text-gray-900 text-base">{MONTHS[month]} {year}</h2>
            <Button variant="ghost" size="sm" onClick={goToNext} className="w-9 h-9 p-0 rounded-lg">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
            {DAYS_SHORT.map((d) => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((dateStr, idx) => {
              if (!dateStr) return <div key={`empty-${idx}`} className="min-h-[88px] border-b border-r border-gray-50 bg-gray-50/30" />;
              const dayNum = parseInt(dateStr.split('-')[2], 10);
              const dayRequests = getRequestsOnDay(dateStr);
              const dayPerms = getPermissionsOnDay(dateStr);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDay;
              const isWeekend = new Date(dateStr).getDay() === 0 || new Date(dateStr).getDay() === 6;
              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                  className={[
                    'min-h-[88px] border-b border-r border-gray-50 p-1.5 cursor-pointer transition-colors',
                    isSelected ? 'bg-[#0D9488]/5 ring-1 ring-inset ring-[#CCFBF1]' : '',
                    !isSelected && isWeekend ? 'bg-gray-50/60 hover:bg-gray-50' : '',
                    !isSelected && !isWeekend ? 'hover:bg-gray-50/80' : '',
                  ].join(' ')}
                >
                  <div className={[
                    'w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium mb-1 mx-auto',
                    isToday ? 'bg-[#0D9488] text-white font-bold' : '',
                    !isToday && isWeekend ? 'text-gray-300' : '',
                    !isToday && !isWeekend ? 'text-gray-700' : '',
                  ].join(' ')}>
                    {dayNum}
                  </div>
                  <div className="space-y-0.5">
                    {dayRequests.slice(0, 2).map((req) => (
                      <div
                        key={req.id}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white truncate leading-tight"
                        style={{ backgroundColor: getLeaveTypeCalendarColor(req.leave_type) }}
                      >
                        {req.profiles?.full_name?.split(' ')[0]}
                      </div>
                    ))}
                    {dayPerms.slice(0, dayRequests.length >= 2 ? 0 : 2 - dayRequests.length).map((perm) => (
                      <div
                        key={perm.id}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white truncate leading-tight"
                        style={{ backgroundColor: PERMISSION_CALENDAR_COLOR }}
                      >
                        {perm.profiles?.full_name?.split(' ')[0]}
                      </div>
                    ))}
                    {(dayRequests.length + dayPerms.length) > 2 && (
                      <div className="px-1 text-[10px] text-gray-400 font-medium">+{dayRequests.length + dayPerms.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 min-h-[200px]">
            {selectedDay ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">
                      {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-MU', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedRequests.length + selectedPermissions.length === 0
                        ? 'No approved leave or permissions'
                        : `${selectedRequests.length + selectedPermissions.length} ${selectedRequests.length + selectedPermissions.length === 1 ? 'entry' : 'entries'}`}
                    </p>
                  </div>
                  <button onClick={() => setSelectedDay(null)} className="text-gray-300 hover:text-gray-500 w-6 h-6 flex items-center justify-center text-xl leading-none">×</button>
                </div>
                {selectedRequests.length === 0 && selectedPermissions.length === 0 ? (
                  <div className="py-6 text-center">
                    <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">No approved leave on this day.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedRequests.map((req) => (
                      <div key={req.id} className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: getLeaveTypeCalendarColor(req.leave_type) }} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-gray-900 truncate">{req.profiles?.full_name}</p>
                          <p className="text-xs text-gray-500">{req.profiles?.department}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <LeaveTypeBadge value={req.leave_type} />
                            <span className="text-xs text-gray-400">{req.working_days}d</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {selectedPermissions.map((perm) => (
                      <div key={perm.id} className="flex items-start gap-2.5 p-3 bg-teal-50 rounded-lg border border-teal-100">
                        <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: PERMISSION_CALENDAR_COLOR }} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-gray-900 truncate">{perm.profiles?.full_name}</p>
                          <p className="text-xs text-gray-500">{perm.profiles?.department}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-semibold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">Permission</span>
                            <span className="text-xs text-gray-400">{formatTime(perm.start_time)} – {formatTime(perm.end_time)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <CalendarDays className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-500 text-center">Click any day to see who is on leave.</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Approved — {MONTHS[month]}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{monthEvents.length + monthPermissions.length} event{monthEvents.length + monthPermissions.length !== 1 ? 's' : ''}</p>
            </div>
            {loading ? (
              <div className="p-5 space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => <div key={i} className="flex gap-3"><div className="w-2 h-2 rounded-full bg-gray-100 mt-1.5" /><div className="space-y-1.5 flex-1"><div className="h-3 w-28 bg-gray-100 rounded" /><div className="h-3 w-40 bg-gray-100 rounded" /></div></div>)}
              </div>
            ) : (monthEvents.length + monthPermissions.length) === 0 ? (
              <div className="py-8 text-center"><p className="text-xs text-gray-400">No approved leave this month.</p></div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {monthEvents.map((req) => (
                  <div key={req.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getLeaveTypeCalendarColor(req.leave_type) }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-xs text-gray-900 truncate">{req.profiles?.full_name}</p>
                        <LeaveTypeBadge value={req.leave_type} className="flex-shrink-0 text-[10px] px-1.5 py-0" />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(req.start_date)} – {formatDate(req.end_date)} · {req.working_days}d</p>
                    </div>
                  </div>
                ))}
                {monthPermissions.map((perm) => (
                  <div key={perm.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: PERMISSION_CALENDAR_COLOR }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-xs text-gray-900 truncate">{perm.profiles?.full_name}</p>
                        <span className="flex-shrink-0 text-[10px] font-semibold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">Permission</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(perm.date)} · {formatTime(perm.start_time)} – {formatTime(perm.end_time)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main page ─────────────────────────────────────────────────────────────────

export const AllRequestsPage: React.FC = () => {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuthStore();
  const [requests, setRequests] = useState<RequestWithProfile[]>([]);
  const [permissions, setPermissions] = useState<PermissionWithProfile[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('table');

  // Table filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');

  // Approve/Reject dialog (leave requests)
  const [actionDialog, setActionDialog] = useState<{ req: RequestWithProfile; action: 'Approved' | 'Rejected' } | null>(null);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Permission approve/decline dialog
  const [permDialog, setPermDialog] = useState<{ perm: PermissionWithProfile; action: 'Approved' | 'Declined' } | null>(null);
  const [permComment, setPermComment] = useState('');
  const [permActionLoading, setPermActionLoading] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<RequestWithProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Admin submit on behalf
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    employee_id: '',
    leave_type: 'Annual' as LeaveType,
    start_date: '',
    end_date: '',
    status: 'Approved' as 'Pending' | 'Approved' | 'Rejected',
    admin_note: '',
    reason: '',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*, profiles(*)')
      .order('created_at', { ascending: false });
    if (!error && data) setRequests(data as RequestWithProfile[]);
    setLoading(false);
  }, []);

  const fetchPermissions = useCallback(async () => {
    const { data } = await supabase
      .from('permission_requests')
      .select('*, profiles(*)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setPermissions(data as PermissionWithProfile[]);
  }, []);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .eq('role', 'employee')
      .order('full_name');
    if (data) setEmployees(data);
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchPermissions();
    fetchEmployees();
  }, [fetchRequests, fetchPermissions, fetchEmployees]);

  // Merged, filtered rows for table
  const filteredLeave = requests.filter((r) => {
    const name = r.profiles?.full_name?.toLowerCase() ?? '';
    const dept = r.profiles?.department?.toLowerCase() ?? '';
    const q = search.toLowerCase();
    const statusMatch = statusFilter === 'All' || r.status === statusFilter;
    const typeMatch = typeFilter === 'All' || typeFilter === r.leave_type;
    return (!search || name.includes(q) || dept.includes(q)) && statusMatch && typeMatch;
  });

  const filteredPerms = permissions.filter((p) => {
    const name = p.profiles?.full_name?.toLowerCase() ?? '';
    const dept = p.profiles?.department?.toLowerCase() ?? '';
    const q = search.toLowerCase();
    const statusMatch = statusFilter === 'All'
      || (statusFilter === 'Approved' && p.status === 'Approved')
      || (statusFilter === 'Rejected' && p.status === 'Declined')
      || (statusFilter === 'Pending' && p.status === 'Pending');
    const typeMatch = typeFilter === 'All' || typeFilter === 'Permission';
    return (!search || name.includes(q) || dept.includes(q)) && statusMatch && typeMatch;
  });

  // ── Approve / Reject leave ─────────────────────────────────────────────────

  const handleAction = async () => {
    if (!actionDialog) return;
    setActionLoading(true);
    const { req, action } = actionDialog;

    // H3: overlap check before approval
    if (action === 'Approved') {
      const { data: overlapping } = await supabase
        .from('leave_requests')
        .select('id')
        .eq('employee_id', req.employee_id)
        .eq('status', 'Approved')
        .neq('id', req.id)
        .lte('start_date', req.end_date)
        .gte('end_date', req.start_date);
      if (overlapping && overlapping.length > 0) {
        toast({
          title: 'Overlap detected',
          description: 'This employee already has an approved leave that overlaps these dates.',
          variant: 'destructive',
        });
        setActionLoading(false);
        return;
      }
    }

    const { error } = await supabase
      .from('leave_requests')
      .update({ status: action, admin_comment: comment || null, updated_at: new Date().toISOString() })
      .eq('id', req.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (adminProfile) {
        await logAudit(adminProfile.id, adminProfile.full_name,
          action === 'Approved' ? 'leave_approved' : 'leave_rejected',
          'leave_request', req.id,
          { employee: req.profiles.full_name, start: req.start_date, end: req.end_date });
      }
      toast({
        title: action === 'Approved' ? 'Request Approved' : 'Request Rejected',
        description: `${req.profiles.full_name}'s request has been ${action.toLowerCase()}.`,
      });
      await triggerLeaveStatusEmail({ ...req, admin_comment: comment || null }, action, comment || null);
      const notifTitle = action === 'Approved' ? 'Leave Approved' : 'Leave Request Update';
      const notifBody = action === 'Approved'
        ? `Your ${req.leave_type} request (${formatDate(req.start_date)} – ${formatDate(req.end_date)}) has been approved.`
        : `Your ${req.leave_type} request (${formatDate(req.start_date)} – ${formatDate(req.end_date)}) was not approved.${comment ? ` ${comment}` : ''}`;
      await insertNotification(req.employee_id, action === 'Approved' ? 'leave_approved' : 'leave_rejected', notifTitle, notifBody, 'leave_request', req.id);
      fetchRequests();
      setActionDialog(null);
      setComment('');
    }
    setActionLoading(false);
  };

  // ── Approve / Decline permission ───────────────────────────────────────────

  const handlePermAction = async () => {
    if (!permDialog) return;
    setPermActionLoading(true);
    const { perm, action } = permDialog;
    const { error } = await supabase
      .from('permission_requests')
      .update({ status: action, admin_comment: permComment || null, updated_at: new Date().toISOString() })
      .eq('id', perm.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (adminProfile) {
        await logAudit(adminProfile.id, adminProfile.full_name,
          action === 'Approved' ? 'permission_approved' : 'permission_declined',
          'permission_request', perm.id,
          { employee: perm.profiles?.full_name, date: perm.date });
      }
      toast({ title: action === 'Approved' ? 'Permission Approved' : 'Permission Declined' });
      await insertNotification(
        perm.employee_id,
        action === 'Approved' ? 'permission_approved' : 'permission_declined',
        action === 'Approved' ? 'Permission Approved' : 'Permission Declined',
        action === 'Approved'
          ? `Your permission for ${new Date(perm.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })} (${formatTime(perm.start_time)} – ${formatTime(perm.end_time)}) has been approved.`
          : `Your permission for ${new Date(perm.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })} was declined.${permComment ? ` Reason: ${permComment}` : ''}`,
      );
      fetchPermissions();
      setPermDialog(null);
      setPermComment('');
    }
    setPermActionLoading(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('leave_requests').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Leave request deleted successfully.' });
      fetchRequests();
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  // ── Admin submit on behalf ────────────────────────────────────────────────────

  const workingDays = addForm.start_date && addForm.end_date && addForm.end_date >= addForm.start_date
    ? calculateWorkingDays(addForm.start_date, addForm.end_date) : 0;
  const selectedEmployee = employees.find((e) => e.id === addForm.employee_id);

  const balanceWarning = (() => {
    if (!selectedEmployee || !['Annual', 'Sick'].includes(addForm.leave_type) || workingDays === 0) return null;
    const approvedForEmp = requests.filter(
      (r) => r.employee_id === selectedEmployee.id && r.status === 'Approved' && r.leave_type === addForm.leave_type
    );
    const used = approvedForEmp.reduce((s, r) => s + Number(r.working_days), 0);
    const entitlement = addForm.leave_type === 'Annual' ? selectedEmployee.annual_entitlement : selectedEmployee.sick_entitlement;
    const remaining = entitlement - used;
    if (workingDays > remaining) {
      return `This request exceeds ${selectedEmployee.full_name}'s remaining ${addForm.leave_type} balance by ${workingDays - remaining} day(s). You can still proceed.`;
    }
    return null;
  })();

  const filteredEmployees = employees.filter((e) =>
    !empSearch || e.full_name.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.department.toLowerCase().includes(empSearch.toLowerCase())
  );

  const handleAddSubmit = async () => {
    if (!addForm.employee_id || !addForm.start_date || !addForm.end_date || workingDays === 0) return;
    if (!adminProfile) return;
    setAddLoading(true);
    const { data: newReq, error } = await supabase
      .from('leave_requests')
      .insert({
        employee_id: addForm.employee_id,
        leave_type: addForm.leave_type,
        start_date: addForm.start_date,
        end_date: addForm.end_date,
        working_days: workingDays,
        status: addForm.status,
        admin_comment: addForm.admin_note || null,
        reason: addForm.reason || null,
        submitted_by_admin: true,
      })
      .select('*, profiles(*)')
      .single();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setAddLoading(false);
      return;
    }
    toast({ title: 'Leave request added successfully.' });
    const emp = selectedEmployee!;
    await triggerAdminSubmittedEmail({
      employee_name: emp.full_name, employee_email: emp.email,
      leave_type: addForm.leave_type, start_date: addForm.start_date, end_date: addForm.end_date,
      working_days: workingDays, status: addForm.status, admin_note: addForm.admin_note,
    });
    await insertNotification(
      addForm.employee_id, 'leave_admin_added', 'Leave Added by HR',
      `HR has recorded a ${addForm.leave_type} leave on your behalf (${formatDate(addForm.start_date)} – ${formatDate(addForm.end_date)}).`,
      'leave_request', newReq?.id
    );
    setAddOpen(false);
    setAddForm({ employee_id: '', leave_type: 'Annual', start_date: '', end_date: '', status: 'Approved', admin_note: '', reason: '' });
    setEmpSearch('');
    fetchRequests();
    setAddLoading(false);
  };

  const resetAdd = () => {
    setAddOpen(false);
    setAddForm({ employee_id: '', leave_type: 'Annual', start_date: '', end_date: '', status: 'Approved', admin_note: '', reason: '' });
    setEmpSearch('');
  };

  const exportCSV = () => {
    const headers = ['Employee', 'Department', 'Type', 'From', 'To / Time', 'Days / Duration', 'Status', 'Reason', 'Admin Comment'];
    const leaveRows = filteredLeave.map((r) => [
      r.profiles?.full_name ?? '', r.profiles?.department ?? '', r.leave_type,
      r.start_date, r.end_date, String(r.working_days) + 'd', r.status,
      r.reason ?? '', r.admin_comment ?? '',
    ]);
    const permRows = filteredPerms.map((p) => [
      p.profiles?.full_name ?? '', p.profiles?.department ?? '', 'Permission',
      p.date, `${formatTime(p.start_time)} – ${formatTime(p.end_time)}`,
      `${Math.floor(p.duration_minutes / 60)}h${p.duration_minutes % 60 > 0 ? `${p.duration_minutes % 60}m` : ''}`,
      p.status, p.reason ?? '', p.admin_comment ?? '',
    ]);
    const csv = [headers, ...leaveRows, ...permRows].map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freshkite-requests-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingCount = requests.filter((r) => r.status === 'Pending').length
    + permissions.filter((p) => p.status === 'Pending').length;
  const totalFiltered = filteredLeave.length + filteredPerms.length;

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '—' : `${totalFiltered} result${totalFiltered !== 1 ? 's' : ''}`}
            {pendingCount > 0 && !loading && (
              <span className="ml-2 inline-flex items-center gap-1 bg-[#FEF3C7] text-[#92400E] text-xs font-medium px-2 py-0.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setView('table')}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                view === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              <LayoutList className="w-3.5 h-3.5" />
              Table View
            </button>
            <button
              onClick={() => setView('calendar')}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                view === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Calendar View
            </button>
          </div>

          <Button onClick={exportCSV} variant="outline" className="gap-2 text-sm border-gray-200 hover:bg-gray-50">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button onClick={() => setAddOpen(true)} className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 text-sm font-medium">
            <UserPlus className="w-4 h-4" />
            Add Request for Employee
          </Button>
        </div>
      </div>

      {/* ── Calendar view ──────────────────────────────────────────────────────── */}
      {view === 'calendar' && <CalendarView requests={requests} permissions={permissions} loading={loading} />}

      {/* ── Table view ─────────────────────────────────────────────────────────── */}
      {view === 'table' && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-52">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by name or department..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 border-gray-200 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-9 text-sm border-gray-200"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40 h-9 text-sm border-gray-200"><SelectValue placeholder="Leave type" /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t === 'All' ? 'All Types' : t}</SelectItem>)}
                </SelectContent>
              </Select>
              {(search || statusFilter !== 'All' || typeFilter !== 'All') && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('All'); setTypeFilter('All'); }} className="h-9 text-xs text-gray-500">
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="divide-y divide-gray-100">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
                    <div className="space-y-2 flex-1"><div className="h-4 w-32 bg-gray-100 rounded" /><div className="h-3 w-20 bg-gray-100 rounded" /></div>
                    {[1, 2, 3, 4].map((j) => <div key={j} className="h-4 w-16 bg-gray-100 rounded self-center" />)}
                  </div>
                ))}
              </div>
            ) : totalFiltered === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <ClipboardList className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">No requests match your filters.</p>
                {(search || statusFilter !== 'All' || typeFilter !== 'All') && (
                  <button onClick={() => { setSearch(''); setStatusFilter('All'); setTypeFilter('All'); }} className="text-xs text-[#0D9488] hover:text-[#7b35d9] mt-2 font-medium">Clear all filters</button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Employee</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Dept.</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Flags</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Date / From</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">To / Duration</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Days</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLeave.map((req) => (
                      <tr key={`leave-${req.id}`} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div>
                            <p className="font-medium text-gray-900 whitespace-nowrap">{req.profiles?.full_name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-xs text-gray-400">{formatDate(req.created_at)}</p>
                              {req.submitted_by_admin && (
                                <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Added by HR</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-sm whitespace-nowrap">{req.profiles?.department}</td>
                        <td className="px-4 py-3.5"><LeaveTypeBadge value={req.leave_type} /></td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {req.is_short_notice && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] whitespace-nowrap" title={req.short_notice_reason ?? 'Short notice request'}>
                                <Clock className="w-2.5 h-2.5" />
                                Short notice
                              </span>
                            )}
                            {req.profiles?.probation_status === 'in_probation' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 whitespace-nowrap">
                                Probation
                              </span>
                            )}
                            {!req.is_short_notice && req.profiles?.probation_status !== 'in_probation' && (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-sm whitespace-nowrap">{formatDate(req.start_date)}</td>
                        <td className="px-4 py-3.5 text-gray-600 text-sm whitespace-nowrap">{formatDate(req.end_date)}</td>
                        <td className="px-4 py-3.5"><span className="font-semibold text-gray-800 text-sm tabular-nums">{req.working_days}d</span></td>
                        <td className="px-4 py-3.5"><LeaveTypeBadge value={req.status} variant="status" /></td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {req.status === 'Pending' && (
                              <>
                                <Button size="sm" onClick={() => { setActionDialog({ req, action: 'Approved' }); setComment(''); }} className="h-7 w-7 p-0 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg" title="Approve">
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setActionDialog({ req, action: 'Rejected' }); setComment(''); }} className="h-7 w-7 p-0 text-red-500 border-red-200 hover:bg-red-50 rounded-lg" title="Reject">
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            {req.status !== 'Pending' && (
                              <span className="text-xs text-gray-400 italic mr-1">
                                {req.admin_comment ? `"${req.admin_comment.slice(0, 24)}${req.admin_comment.length > 24 ? '…' : ''}"` : '—'}
                              </span>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setDeleteTarget(req)} className="h-7 w-7 p-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-600 rounded-lg flex-shrink-0" title="Delete request">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredPerms.map((perm) => (
                      <tr key={`perm-${perm.id}`} className="hover:bg-teal-50/30 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div>
                            <p className="font-medium text-gray-900 whitespace-nowrap">{perm.profiles?.full_name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(perm.created_at)}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-sm whitespace-nowrap">{perm.profiles?.department}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200">
                            <Clock className="w-2.5 h-2.5" />
                            Permission
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {perm.converted_to_half_day ? (
                            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">Half Day</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-sm whitespace-nowrap">
                          {new Date(perm.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-sm whitespace-nowrap">
                          {formatTime(perm.start_time)} – {formatTime(perm.end_time)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-gray-800 text-sm tabular-nums">
                            {Math.floor(perm.duration_minutes / 60)}h{perm.duration_minutes % 60 > 0 ? `${perm.duration_minutes % 60}m` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={[
                            'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full',
                            perm.status === 'Approved' ? 'bg-[#D1FAE5] text-[#065F46]' : perm.status === 'Declined' ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#FEF3C7] text-[#92400E]',
                          ].join(' ')}>
                            {perm.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {perm.status === 'Pending' && (
                              <>
                                <Button size="sm" onClick={() => { setPermDialog({ perm, action: 'Approved' }); setPermComment(''); }} className="h-7 w-7 p-0 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg" title="Approve">
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setPermDialog({ perm, action: 'Declined' }); setPermComment(''); }} className="h-7 w-7 p-0 text-red-500 border-red-200 hover:bg-red-50 rounded-lg" title="Decline">
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            {perm.status !== 'Pending' && (
                              <span className="text-xs text-gray-400 italic">
                                {perm.admin_comment ? `"${perm.admin_comment.slice(0, 24)}${perm.admin_comment.length > 24 ? '…' : ''}"` : '—'}
                              </span>
                            )}
                          </div>
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

      {/* ── Approve / Reject leave dialog ─────────────────────────────────────────── */}
      <Dialog open={!!actionDialog} onOpenChange={(o) => { if (!o) { setActionDialog(null); setComment(''); } }}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={actionDialog?.action === 'Approved' ? 'text-[#0D9488]' : 'text-red-600'}>
              {actionDialog?.action === 'Approved' ? 'Approve Leave Request' : 'Reject Leave Request'}
            </DialogTitle>
          </DialogHeader>
          {actionDialog && (
            <div className="space-y-4 py-1">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm border border-gray-100">
                <div className="flex justify-between"><span className="text-gray-500">Employee</span><span className="font-semibold text-gray-900">{actionDialog.req.profiles?.full_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Leave Type</span><LeaveTypeBadge value={actionDialog.req.leave_type} /></div>
                <div className="flex justify-between"><span className="text-gray-500">Dates</span><span className="text-gray-700">{formatDate(actionDialog.req.start_date)} – {formatDate(actionDialog.req.end_date)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Working Days</span><span className="font-semibold text-gray-900">{actionDialog.req.working_days}</span></div>
                {actionDialog.req.reason && <div className="pt-1 border-t border-gray-200"><span className="text-gray-500 text-xs">Reason: </span><span className="text-gray-700 text-xs italic">"{actionDialog.req.reason}"</span></div>}
                {actionDialog.req.is_short_notice && (
                  <div className="pt-1 border-t border-amber-200 bg-amber-50 rounded-lg px-3 py-2 mt-1">
                    <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3 h-3 text-amber-600" /><span className="text-xs font-semibold text-amber-700">Short-notice request</span></div>
                    {actionDialog.req.short_notice_reason ? <p className="text-xs text-amber-600 italic">"{actionDialog.req.short_notice_reason}"</p> : <p className="text-xs text-amber-500">No reason provided for short notice.</p>}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Comment{actionDialog.action === 'Rejected' ? ' (recommended)' : ' (optional)'}</label>
                <Textarea
                  placeholder={actionDialog.action === 'Rejected' ? 'Provide a reason...' : 'Add a note (optional)...'}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="resize-none h-24 text-sm border-gray-200"
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setActionDialog(null); setComment(''); }}>Cancel</Button>
            <Button onClick={handleAction} disabled={actionLoading} className={actionDialog?.action === 'Approved' ? 'bg-[#0D9488] hover:bg-[#0F766E] text-white' : 'bg-red-600 hover:bg-red-700 text-white'}>
              {actionLoading ? 'Processing...' : actionDialog?.action === 'Approved' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approve / Decline permission dialog ─────────────────────────────────── */}
      <Dialog open={!!permDialog} onOpenChange={(o) => { if (!o) { setPermDialog(null); setPermComment(''); } }}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={permDialog?.action === 'Approved' ? 'text-[#0D9488]' : 'text-red-600'}>
              {permDialog?.action === 'Approved' ? 'Approve Permission' : 'Decline Permission'}
            </DialogTitle>
          </DialogHeader>
          {permDialog && (
            <div className="space-y-4 py-1">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm border border-gray-100">
                <div className="flex justify-between"><span className="text-gray-500">Employee</span><span className="font-semibold text-gray-900">{permDialog.perm.profiles?.full_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="text-gray-700">{new Date(permDialog.perm.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Time</span><span className="text-gray-700">{formatTime(permDialog.perm.start_time)} – {formatTime(permDialog.perm.end_time)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-semibold text-gray-900">{Math.floor(permDialog.perm.duration_minutes / 60)}h{permDialog.perm.duration_minutes % 60 > 0 ? ` ${permDialog.perm.duration_minutes % 60}m` : ''}</span></div>
                {permDialog.perm.reason && <div className="pt-1 border-t border-gray-200"><span className="text-gray-500 text-xs">Reason: </span><span className="text-gray-700 text-xs italic">"{permDialog.perm.reason}"</span></div>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Comment {permDialog.action === 'Declined' ? '(recommended)' : '(optional)'}
                </label>
                <Textarea
                  placeholder={permDialog.action === 'Declined' ? 'Provide a reason...' : 'Add a note (optional)...'}
                  value={permComment}
                  onChange={(e) => setPermComment(e.target.value)}
                  className="resize-none h-20 text-sm border-gray-200"
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPermDialog(null); setPermComment(''); }}>Cancel</Button>
            <Button onClick={handlePermAction} disabled={permActionLoading}
              className={permDialog?.action === 'Approved' ? 'bg-[#0D9488] hover:bg-[#0F766E] text-white' : 'bg-red-600 hover:bg-red-700 text-white'}>
              {permActionLoading ? 'Processing...' : permDialog?.action === 'Approved' ? 'Confirm Approval' : 'Confirm Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ──────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leave Request</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently delete this leave request for{' '}
              <strong>{deleteTarget?.profiles?.full_name}</strong>{' '}
              ({deleteTarget?.leave_type}, {deleteTarget ? formatDate(deleteTarget.start_date) : ''} – {deleteTarget ? formatDate(deleteTarget.end_date) : ''}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? 'Deleting...' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Admin Submit on Behalf modal ─────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) resetAdd(); }}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#0D9488]" />
              Submit Leave Request — On Behalf of Employee
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Employee <span className="text-red-600">*</span></Label>
              <Input placeholder="Search employees..." value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} className="border-gray-200 text-sm mb-1" />
              <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
                {filteredEmployees.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No employees found</p>
                ) : filteredEmployees.map((emp) => (
                  <button key={emp.id} type="button" onClick={() => { setAddForm((f) => ({ ...f, employee_id: emp.id })); setEmpSearch(emp.full_name); }}
                    className={['w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors', addForm.employee_id === emp.id ? 'bg-[#CCFBF1] text-[#0D9488] font-medium' : 'text-gray-900'].join(' ')}>
                    {emp.full_name} <span className="text-xs text-gray-400">· {emp.department}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Leave Type <span className="text-red-600">*</span></Label>
              <div className="flex flex-wrap gap-1.5">
                {LEAVE_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => setAddForm((f) => ({ ...f, leave_type: t }))}
                    className={['px-3 py-1.5 rounded-full text-xs font-medium border transition-all', addForm.leave_type === t ? 'bg-[#0D9488] text-white border-[#0D9488]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'].join(' ')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Start Date <span className="text-red-600">*</span></Label>
                <Input type="date" value={addForm.start_date} onChange={(e) => setAddForm((f) => ({ ...f, start_date: e.target.value }))} className="border-gray-200 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">End Date <span className="text-red-600">*</span></Label>
                <Input type="date" value={addForm.end_date} min={addForm.start_date} onChange={(e) => setAddForm((f) => ({ ...f, end_date: e.target.value }))} className="border-gray-200 text-sm" />
              </div>
            </div>
            {addForm.start_date && addForm.end_date && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-gray-600">Working days</span>
                <span className={['text-sm font-bold tabular-nums', workingDays === 0 ? 'text-red-500' : 'text-[#0D9488]'].join(' ')}>
                  {workingDays === 0 ? 'Invalid range' : `${workingDays} day${workingDays !== 1 ? 's' : ''}`}
                </span>
              </div>
            )}
            {balanceWarning && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">{balanceWarning}</div>}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Status</Label>
              <Select value={addForm.status} onValueChange={(v) => setAddForm((f) => ({ ...f, status: v as typeof addForm.status }))}>
                <SelectTrigger className="border-gray-200 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Admin Note <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea placeholder="e.g. Employee was on-site without phone access." value={addForm.admin_note} onChange={(e) => setAddForm((f) => ({ ...f, admin_note: e.target.value.slice(0, 300) }))} className="resize-none h-16 text-sm border-gray-200" />
              <p className="text-xs text-gray-400 text-right">{addForm.admin_note.length}/300</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Reason <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea placeholder="Leave reason..." value={addForm.reason} onChange={(e) => setAddForm((f) => ({ ...f, reason: e.target.value }))} className="resize-none h-14 text-sm border-gray-200" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAdd}>Cancel</Button>
            <Button onClick={handleAddSubmit} disabled={addLoading || !addForm.employee_id || !addForm.start_date || !addForm.end_date || workingDays === 0} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">
              {addLoading ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</span> : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

