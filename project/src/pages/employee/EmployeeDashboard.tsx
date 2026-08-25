import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, LeaveRequest, Announcement, AnnouncementPriority } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { formatDate, computeLeaveBalances } from '../../lib/utils';
import { LeaveTypeBadge } from '../../components/LeaveTypeBadge';
import { AnnouncementCard } from '../../components/AnnouncementCard';
import { Button } from '../../components/ui/button';
import { SubmitLeaveModal } from '../../components/SubmitLeaveModal';
import {
  CalendarDays, Plus, Megaphone, Clock, Shield,
  BookOpen, FolderOpen,
} from 'lucide-react';

type AnnouncementWithProfile = Announcement & { profiles?: { full_name: string } };
const PRIORITY_WEIGHT: Record<AnnouncementPriority, number> = { urgent: 0, important: 1, normal: 2 };

interface BirthdayEntry {
  id: string;
  full_name: string;
  date_of_birth: string;
  daysUntil: number;
}

interface OnLeaveEntry {
  id: string;
  full_name: string;
  leave_type: string;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(name: string): string {
  const parts = name.trim().split(' ');
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

function daysUntilBirthday(dobIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dob = new Date(dobIso + 'T00:00:00');
  let next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export const EmployeeDashboard: React.FC = () => {
  const { profile } = useAuthStore();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);

  const [announcements, setAnnouncements] = useState<AnnouncementWithProfile[]>([]);
  const [pastAnnouncements, setPastAnnouncements] = useState<AnnouncementWithProfile[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);

  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [onLeave, setOnLeave] = useState<OnLeaveEntry[]>([]);
  const [permissions, setPermissions] = useState<{ date: string; status: string }[]>([]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchRequests = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('employee_id', profile.id)
      .order('created_at', { ascending: false });
    if (data) setRequests(data as LeaveRequest[]);
    setLoading(false);
  }, [profile]);

  const fetchAnnouncements = useCallback(async () => {
    if (!profile) return;
    setAnnouncementsLoading(true);
    const now = new Date().toISOString();

    // Active announcements
    const { data: active } = await supabase
      .from('announcements')
      .select('*, profiles(full_name)')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    const sorted = ((active ?? []) as AnnouncementWithProfile[]).sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (a.priority !== b.priority) return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setAnnouncements(sorted);

    // Past announcements (fallback when no active ones)
    if (sorted.length === 0) {
      const { data: past } = await supabase
        .from('announcements')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(2);
      setPastAnnouncements((past ?? []) as AnnouncementWithProfile[]);
    }

    setAnnouncementsLoading(false);
  }, [profile]);

  const fetchBirthdays = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, date_of_birth')
      .eq('is_active', true)
      .not('date_of_birth', 'is', null);

    if (!data) return;
    const upcoming: BirthdayEntry[] = data
      .map((p) => ({ ...p, daysUntil: daysUntilBirthday(p.date_of_birth) }))
      .filter((p) => p.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 5);
    setBirthdays(upcoming);
  }, []);

  const fetchOnLeaveToday = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('leave_requests')
      .select('employee_id, leave_type, profiles(full_name)')
      .eq('status', 'Approved')
      .lte('start_date', today)
      .gte('end_date', today);
    if (!data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOnLeave(data.map((r: any) => ({
      id: r.employee_id as string,
      full_name: (Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name) ?? 'Unknown',
      leave_type: r.leave_type as string,
    })));
  }, []);

  const fetchPermissions = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('permission_requests')
      .select('date, status')
      .eq('employee_id', profile.id);
    if (data) setPermissions(data);
  }, [profile]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);
  useEffect(() => { fetchBirthdays(); }, [fetchBirthdays]);
  useEffect(() => { fetchOnLeaveToday(); }, [fetchOnLeaveToday]);
  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const annualUsed = requests
    .filter((r) => r.leave_type === 'Annual' && r.status === 'Approved')
    .reduce((s, r) => s + Number(r.working_days), 0);
  const sickUsed = requests
    .filter((r) => r.leave_type === 'Sick' && r.status === 'Approved')
    .reduce((s, r) => s + Number(r.working_days), 0);

  const approved = requests.filter((r) => r.status === 'Approved');
  const pending  = requests.filter((r) => r.status === 'Pending');
  const balances = profile ? computeLeaveBalances(profile, approved, pending) : null;

  const annualTotal     = balances?.annualAllowance ?? profile?.annual_entitlement ?? 22;
  const sickTotal       = balances?.sickAllowance   ?? profile?.sick_entitlement   ?? 21;
  const annualRemaining = balances?.annualRemaining ?? (annualTotal - annualUsed);
  const sickRemaining   = balances?.sickRemaining   ?? (sickTotal  - sickUsed);
  const annualPct = Math.min(((balances?.annualUsed ?? annualUsed) / (annualTotal || 1)) * 100, 100);
  const sickPct   = Math.min(((balances?.sickUsed ?? sickUsed)   / (sickTotal  || 1)) * 100, 100);

  const recentRequests = requests.slice(0, 2);

  const today = new Date().toISOString().split('T')[0];
  const nextLeave = approved
    .filter((r) => r.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;

  const nextLeaveDaysUntil = nextLeave
    ? Math.round((new Date(nextLeave.start_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : null;

  const thisMonthKey = today.slice(0, 7);
  const thisMonthPermCount = permissions.filter(
    (p) => p.date.slice(0, 7) === thisMonthKey && p.status !== 'Declined'
  ).length;

  const todayLabel = new Date().toLocaleDateString('en-MU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">

      {/* ── 1. Welcome header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {profile?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => navigate('/employee/requests?tab=permissions')}
            className="gap-2 border-[#0D9488] text-[#0D9488] hover:bg-teal-50"
          >
            <Clock className="w-4 h-4" />
            Request Permission
          </Button>
          <Button onClick={() => setSubmitOpen(true)} className="btn-solid gap-2">
            <Plus className="w-4 h-4" />
            Request Leave
          </Button>
        </div>
      </div>

      {/* Probation banner */}
      {balances?.isProbation && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
          <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#92400E]">You are currently in your probation period</p>
            <p className="text-xs text-[#F59E0B] mt-0.5">
              Leave accrues at <strong>1 day per completed month</strong> for both annual and sick leave.{' '}
              You have completed <strong>{balances.probationMonthsCompleted} month{balances.probationMonthsCompleted !== 1 ? 's' : ''}</strong>
              {profile?.probation_end_date && (
                <> · Probation ends {new Date(profile.probation_end_date).toLocaleDateString('en-MU', { day: 'numeric', month: 'long', year: 'numeric' })}</>
              )}.
            </p>
          </div>
        </div>
      )}

      {/* Pending banner */}
      {!loading && pending.length > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700">
            You have <strong>{pending.length}</strong> pending request{pending.length !== 1 ? 's' : ''} awaiting approval.
            {balances && (
              <span className="ml-1 text-blue-500">
                ({balances.annualPending + balances.sickPending} day{(balances.annualPending + balances.sickPending) !== 1 ? 's' : ''} reserved)
              </span>
            )}
          </p>
        </div>
      )}

      {/* ── 2. Leave balance cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Annual */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <CalendarDays className="w-4 h-4 text-[#0D9488]" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Annual Leave</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {balances?.isProbation ? `Accrued (${balances.probationMonthsCompleted} months)` : 'Pro-rata balance'}
                </p>
              </div>
            </div>
            <div className="text-right">
              {loading ? <div className="h-9 w-12 bg-gray-100 rounded animate-pulse" /> : (
                <>
                  <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none">{annualRemaining}</p>
                  <p className="text-xs text-gray-400 mt-0.5">of {annualTotal} days</p>
                </>
              )}
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#0D9488] rounded-full transition-all duration-700" style={{ width: `${annualPct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>{annualUsed} day{annualUsed !== 1 ? 's' : ''} used</span>
            <span>{annualRemaining} remaining</span>
          </div>
        </div>

        {/* Sick */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${sickRemaining <= 3 ? 'bg-[#FEF3C7]' : 'bg-gray-50'}`}>
                <CalendarDays className={`w-4 h-4 ${sickRemaining <= 3 ? 'text-[#F59E0B]' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sick Leave</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {balances?.isProbation ? `Accrued (${balances.probationMonthsCompleted} months)` : 'Remaining balance'}
                </p>
              </div>
            </div>
            <div className="text-right">
              {loading ? <div className="h-9 w-12 bg-gray-100 rounded animate-pulse" /> : (
                <>
                  <p className={`text-3xl font-bold tabular-nums leading-none ${sickRemaining <= 3 ? 'text-[#F59E0B]' : 'text-gray-900'}`}>{sickRemaining}</p>
                  <p className="text-xs text-gray-400 mt-0.5">of {sickTotal} days</p>
                </>
              )}
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${sickRemaining <= 3 ? 'bg-[#F59E0B]' : 'bg-[#0D9488]'}`} style={{ width: `${sickPct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>{sickUsed} day{sickUsed !== 1 ? 's' : ''} used</span>
            <span className={sickRemaining <= 3 ? 'text-[#F59E0B] font-medium' : ''}>
              {sickRemaining} remaining{sickRemaining <= 3 ? ' — low balance' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. Quick Actions row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Request Leave', icon: Plus, action: () => setSubmitOpen(true) },
          { label: 'Request Permission', icon: Clock, action: () => navigate('/employee/requests?tab=permissions') },
          { label: 'View Handbook', icon: BookOpen, action: () => navigate('/employee/handbook') },
          { label: 'My Documents', icon: FolderOpen, action: () => navigate('/employee/documents') },
        ].map(({ label, icon: Icon, action }) => (
          <button
            key={label}
            onClick={action}
            className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-[10px] px-4 py-2.5 text-[13px] font-medium text-[#374151] hover:bg-[#F0FDFA] hover:text-[#0D9488] hover:border-[#0D9488] transition-all duration-150 text-left"
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* ── 4. Two-column: Recent Activity + Out of Office ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm">Recent Activity</h2>
            <span
              className="text-[13px] px-3 py-1 rounded-lg border font-medium"
              style={{ background: '#F0FDFA', borderColor: '#CCFBF1', color: '#0F766E' }}
            >
              ⏱ {thisMonthPermCount}/2 permissions this month
            </span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-5 w-16 bg-gray-100 rounded-full" />
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                  <div className="h-5 w-20 bg-gray-100 rounded-full ml-auto" />
                </div>
              ))}
            </div>
          ) : recentRequests.length === 0 ? (
            <p className="text-sm text-[#9CA3AF]">No requests submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {recentRequests.map((req) => (
                <div key={req.id} className="flex items-center gap-3 py-1">
                  <LeaveTypeBadge value={req.leave_type} />
                  <span className="text-sm text-gray-600 flex-1 min-w-0 truncate">
                    {formatDate(req.start_date)}{req.start_date !== req.end_date ? ` – ${formatDate(req.end_date)}` : ''}
                  </span>
                  <LeaveTypeBadge value={req.status} variant="status" />
                </div>
              ))}
            </div>
          )}

          <a href="/employee/requests" className="inline-block mt-3 text-xs font-medium text-[#0D9488] hover:text-[#0F766E] transition-colors">
            View all requests →
          </a>
        </div>

        {/* Out of Office Today */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Out of Office Today</h2>
          {onLeave.length === 0 ? (
            <p className="text-sm font-medium" style={{ color: '#065F46' }}>Everyone is in today 🟢</p>
          ) : (
            <div className="space-y-2">
              {onLeave.slice(0, 4).map((emp) => (
                <div key={emp.id} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{ background: '#CCFBF1', color: '#0F766E' }}
                  >
                    {initials(emp.full_name).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{emp.full_name}</span>
                  <LeaveTypeBadge value={emp.leave_type} />
                </div>
              ))}
              {onLeave.length > 4 && (
                <p className="text-xs text-gray-400 mt-1">+{onLeave.length - 4} more</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Two-column: Birthdays + Next Leave ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Upcoming Birthdays */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">🎂 Upcoming Birthdays</h2>
          {birthdays.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming birthdays in the next 30 days.</p>
          ) : (
            <div className="space-y-3">
              {birthdays.map((b) => {
                const dobDate = new Date(b.date_of_birth + 'T00:00:00');
                const dayStr = dobDate.toLocaleDateString('en-MU', { day: 'numeric', month: 'short' });
                return (
                  <div key={b.id} className="flex items-center gap-3">
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-full font-semibold"
                      style={{ width: 36, height: 36, background: '#CCFBF1', color: '#0F766E', fontSize: 13 }}
                    >
                      {initials(b.full_name).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{b.full_name}</p>
                      <p className="text-xs text-gray-400">{dayStr}</p>
                    </div>
                    {b.daysUntil === 0 ? (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: '#0D9488', color: '#FFFFFF' }}>Today!</span>
                    ) : (
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#F0FDFA', color: '#0F766E' }}>
                        in {b.daysUntil} day{b.daysUntil !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* My Next Approved Leave — only shown if exists */}
        {nextLeave ? (
          <div
            className="rounded-xl border p-5 flex flex-col gap-3"
            style={{ background: 'linear-gradient(135deg,#F0FDFA 0%,#CCFBF1 100%)', borderColor: '#A7F3D0' }}
          >
            <h2 className="font-semibold text-gray-900 text-sm">Your Next Leave</h2>
            <div className="flex items-center gap-2">
              <LeaveTypeBadge value={nextLeave.leave_type} />
            </div>
            <div className="text-sm text-gray-700 space-y-0.5">
              <p className="font-medium">
                {formatDate(nextLeave.start_date)}
                {nextLeave.start_date !== nextLeave.end_date ? ` – ${formatDate(nextLeave.end_date)}` : ''}
              </p>
              <p className="text-xs text-gray-500">{nextLeave.working_days} day{Number(nextLeave.working_days) !== 1 ? 's' : ''}</p>
            </div>
            <p className="text-sm font-semibold text-[#0D9488]">
              {nextLeaveDaysUntil === 0 ? 'Starts today' : nextLeaveDaysUntil === 1 ? 'Starts tomorrow' : `Starts in ${nextLeaveDaysUntil} days`}
            </p>
          </div>
        ) : (
          // Keep the grid balanced — empty placeholder keeps the birthday card from stretching full width on desktop
          <div className="hidden sm:block" />
        )}
      </div>

      {/* Personal Details (DOB) */}
      {profile?.date_of_birth && (() => {
        const dob = new Date(profile.date_of_birth);
        const todayD = new Date();
        let age = todayD.getFullYear() - dob.getFullYear();
        const m = todayD.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && todayD.getDate() < dob.getDate())) age--;
        const dd = String(dob.getDate()).padStart(2, '0');
        const mm = String(dob.getMonth() + 1).padStart(2, '0');
        const yyyy = dob.getFullYear();
        return (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">Personal Details</h3>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Date of Birth</p>
                <p className="font-medium text-gray-800">{dd}/{mm}/{yyyy}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Age</p>
                <p className="font-medium text-gray-800">{age} years old</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 6. Announcements ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Megaphone className="w-4 h-4 text-[#0D9488]" />
          <h2 className="font-semibold text-gray-900">Announcements</h2>
        </div>

        {announcementsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-[#E5E7EB] p-5 animate-pulse space-y-2">
                <div className="h-4 w-20 bg-gray-100 rounded-full" />
                <div className="h-5 w-48 bg-gray-100 rounded" />
                <div className="h-3 w-full bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.slice(0, 5).map((a) => <AnnouncementCard key={a.id} announcement={a} />)}
          </div>
        ) : pastAnnouncements.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-1">No active announcements — showing recent past ones.</p>
            {pastAnnouncements.map((a) => (
              <div key={a.id} className="opacity-60">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 ml-1">Past announcement</p>
                <AnnouncementCard announcement={a} />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] py-10 text-center">
            <Megaphone className="w-6 h-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No announcements at this time.</p>
          </div>
        )}
      </div>

      <SubmitLeaveModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSuccess={() => { setSubmitOpen(false); fetchRequests(); }}
      />
    </div>
  );
};
