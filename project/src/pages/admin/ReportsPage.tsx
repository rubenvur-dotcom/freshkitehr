import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase, Profile, LeaveRequest, PermissionRequest } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { ChartBar as BarChart3, Download, ChevronUp, ChevronDown, ChevronsUpDown, TrendingUp, Users, Calendar, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Upload, FileSpreadsheet, X, CircleAlert as AlertCircle, Clock } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAVE_TYPES = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid', 'Compassionate', 'Study'] as const;
type LeaveType = typeof LEAVE_TYPES[number];

const LEAVE_COLORS: Record<LeaveType, string> = {
  Annual:       '#0D9488',
  Sick:         '#EF4444',
  Maternity:    '#EC4899',
  Paternity:    '#3B82F6',
  Emergency:    '#F59E0B',
  Unpaid:       '#6B7280',
  Compassionate:'#0F766E',
  Study:        '#06B6D4',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NUMS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

const WORKING_DAYS_PER_YEAR = 261;

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR].map(String);

const IMPORT_SAMPLE_HEADERS = ['employee_email', 'leave_type', 'start_date', 'end_date', 'working_days', 'reason', 'status'];
const IMPORT_SAMPLE_ROW = ['john.doe@freshkite.net', 'Annual', '2024-01-08', '2024-01-12', '5', 'Family trip', 'Approved'];

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestWithProfile = LeaveRequest & { profiles: Profile };
type SortKey = 'full_name' | 'total_days' | 'last_leave_date' | 'department' | 'annualRemaining';
type SortDir = 'asc' | 'desc';
type PeriodMode = 'yearly' | 'monthly';

interface ImportRow {
  employee_email: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  working_days: string;
  reason: string;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inYear(req: LeaveRequest, year: string): boolean {
  return req.start_date.startsWith(year) || req.end_date.startsWith(year);
}

function inMonth(req: LeaveRequest, year: string, month: string): boolean {
  const prefix = `${year}-${month}`;
  return req.start_date.startsWith(prefix) || req.end_date.startsWith(prefix);
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toFullReportCSV(
  leaveRows: RequestWithProfile[],
  permRows: (PermissionRequest & { profiles: Profile })[],
): string {
  const esc = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const fmtTime = (t: string) => {
    const [hh, mm] = t.split(':').map(Number);
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
  };
  const fmtDur = (mins: number) => {
    const h = Math.floor(mins / 60); const m = mins % 60;
    return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  const leaveHeader = ['Employee Name', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status', 'Admin Comment'].join(',');
  const leaveLines = leaveRows.map((r) => [
    esc(r.profiles?.full_name),
    esc(r.leave_type),
    r.start_date,
    r.end_date,
    r.working_days,
    r.status,
    esc(r.admin_comment),
  ].join(','));

  const permHeader = ['Employee Name', 'Date', 'Start Time', 'End Time', 'Duration', 'Status', 'Admin Comment'].join(',');
  const permLines = permRows.map((p) => [
    esc(p.profiles?.full_name),
    p.date,
    fmtTime(p.start_time),
    fmtTime(p.end_time),
    fmtDur(p.duration_minutes),
    p.status,
    esc(p.admin_comment),
  ].join(','));

  return [
    'SECTION 1 — Leave Summary',
    leaveHeader,
    ...leaveLines,
    '',
    'SECTION 2 — Permissions Summary',
    permHeader,
    ...permLines,
  ].join('\n');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionDivider() {
  return <hr className="border-[#E5E7EB] my-8" />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-gray-800 mb-4">{children}</h2>
  );
}

interface KPICardProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  sub?: string;
}

function KPICard({ icon: Icon, label, value, sub }: KPICardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide leading-tight mb-2">
            {label}
          </p>
          <p className="text-3xl font-bold text-[#0D9488] tabular-nums leading-none">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1.5 truncate">{sub}</p>}
        </div>
        <div className="bg-[#CCFBF1] rounded-xl p-2.5 flex-shrink-0 ml-3">
          <Icon className="w-5 h-5 text-[#0D9488]" />
        </div>
      </div>
    </div>
  );
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}

function SortHeader({ label, sortKey, current, dir, onSort }: SortHeaderProps) {
  const active = current === sortKey;
  return (
    <th
      className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-gray-800 transition-colors"
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
      </span>
    </th>
  );
}

// ─── Custom tooltips ──────────────────────────────────────────────────────────

function CustomBarTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.fill }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold text-gray-900">{p.value}d</span>
        </div>
      ))}
    </div>
  );
}

function CustomPieTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { pct: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700">{p.name}</p>
      <p className="text-gray-600">{p.value} days · {p.payload.pct}%</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const ReportsPage: React.FC = () => {
  const [requests, setRequests] = useState<RequestWithProfile[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [allActiveRequests, setAllActiveRequests] = useState<RequestWithProfile[]>([]);
  const [permissions, setPermissions] = useState<(PermissionRequest & { profiles: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  // Period filter
  const [periodMode, setPeriodMode] = useState<PeriodMode>('yearly');
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [month, setMonth] = useState(String(MONTH_NUMS[new Date().getMonth()]));
  const [dept, setDept] = useState('all');
  const [empSearch, setEmpSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('full_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Import state
  const [breakdownTab, setBreakdownTab] = useState<'leave' | 'permissions'>('leave');
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [reqRes, empRes, allReqRes, permRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*, profiles(*)')
        .eq('status', 'Approved')
        .order('start_date', { ascending: false }),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('leave_requests')
        .select('*, profiles(*)')
        .in('status', ['Approved', 'Pending']),
      supabase
        .from('permission_requests')
        .select('*, profiles(*)')
        .order('date', { ascending: false }),
    ]);
    if (reqRes.data) setRequests(reqRes.data as RequestWithProfile[]);
    if (empRes.data) setEmployees(empRes.data);
    if (allReqRes.data) setAllActiveRequests(allReqRes.data as RequestWithProfile[]);
    if (permRes.data) setPermissions(permRes.data as (PermissionRequest & { profiles: Profile })[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const departments = useMemo(() =>
    [...new Set(employees.map((e) => e.department))].filter(Boolean).sort(),
    [employees]
  );

  // All approved requests for selected period + dept
  const filtered = useMemo(() => requests.filter((r) => {
    const periodOk = periodMode === 'yearly'
      ? inYear(r, year)
      : inMonth(r, year, month);
    const deptOk = dept === 'all' || r.profiles?.department === dept;
    return periodOk && deptOk;
  }), [requests, year, month, dept, periodMode]);

  const filteredEmployees = useMemo(() =>
    dept === 'all' ? employees : employees.filter((e) => e.department === dept),
    [employees, dept]
  );

  // ── KPI calculations ──────────────────────────────────────────────────────────

  const totalDays = useMemo(() =>
    filtered.reduce((s, r) => s + Number(r.working_days), 0),
    [filtered]
  );

  const mostCommonType = useMemo(() => {
    const byType: Record<string, number> = {};
    filtered.forEach((r) => { byType[r.leave_type] = (byType[r.leave_type] ?? 0) + Number(r.working_days); });
    const entries = Object.entries(byType);
    if (!entries.length) return '—';
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }, [filtered]);

  const avgPerEmployee = useMemo(() =>
    filteredEmployees.length ? Math.round((totalDays / filteredEmployees.length) * 10) / 10 : 0,
    [totalDays, filteredEmployees]
  );

  const zeroLeaveEmployees = useMemo(() => {
    const taken = new Set(filtered.map((r) => r.employee_id));
    return filteredEmployees.filter((e) => !taken.has(e.id)).length;
  }, [filtered, filteredEmployees]);

  // ── Permissions filtered by selected period ───────────────────────────────────

  const filteredPermissions = useMemo(() => {
    return permissions.filter((p) => {
      const periodOk = periodMode === 'yearly'
        ? p.date.startsWith(year)
        : p.date.startsWith(`${year}-${month}`);
      const deptOk = dept === 'all' || p.profiles?.department === dept;
      return periodOk && deptOk;
    });
  }, [permissions, year, month, dept, periodMode]);

  // ── Monthly trend (stacked bar) ───────────────────────────────────────────────

  const monthlyData = useMemo(() => {
    return MONTHS.map((monthLabel, i) => {
      const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`;
      const row: Record<string, string | number> = { month: monthLabel };
      LEAVE_TYPES.forEach((type) => {
        row[type] = requests
          .filter((r) => {
            const deptOk = dept === 'all' || r.profiles?.department === dept;
            return deptOk && r.leave_type === type && (
              r.start_date.startsWith(monthStr) || r.end_date.startsWith(monthStr)
            );
          })
          .reduce((s, r) => s + Number(r.working_days), 0);
      });
      return row;
    });
  }, [requests, year, dept]);

  // ── Leave type distribution ───────────────────────────────────────────────────

  const typeDistribution = useMemo(() => {
    const byType: Record<string, { requests: number; days: number }> = {};
    LEAVE_TYPES.forEach((t) => { byType[t] = { requests: 0, days: 0 }; });
    filtered.forEach((r) => {
      byType[r.leave_type].requests += 1;
      byType[r.leave_type].days += Number(r.working_days);
    });
    return LEAVE_TYPES
      .map((type) => ({
        type,
        ...byType[type],
        avg: byType[type].requests ? Math.round((byType[type].days / byType[type].requests) * 10) / 10 : 0,
        pct: totalDays ? Math.round((byType[type].days / totalDays) * 100) : 0,
      }))
      .filter((d) => d.days > 0)
      .sort((a, b) => b.days - a.days);
  }, [filtered, totalDays]);

  const pieData = useMemo(() =>
    typeDistribution.map((d) => ({ name: d.type, value: d.days, pct: d.pct })),
    [typeDistribution]
  );

  // ── Permissions monthly chart data ───────────────────────────────────────

  const permMonthlyData = useMemo(() => {
    return MONTHS.map((monthLabel, i) => {
      const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`;
      const monthPerms = permissions.filter((p) => {
        const deptOk = dept === 'all' || p.profiles?.department === dept;
        return deptOk && p.date.startsWith(monthStr);
      });
      return {
        month: monthLabel,
        Approved: monthPerms.filter((p) => p.status === 'Approved').length,
        Pending: monthPerms.filter((p) => p.status === 'Pending').length,
        Declined: monthPerms.filter((p) => p.status === 'Declined').length,
      };
    });
  }, [permissions, year, dept]);

  const hasPermMonthlyData = permMonthlyData.some((m) => m.Approved + m.Pending + m.Declined > 0);

  // ── Department absence rate ───────────────────────────────────────────────────

  const deptAbsenceData = useMemo(() => {
    return departments.map((d) => {
      const empCount = employees.filter((e) => e.department === d).length;
      const days = requests
        .filter((r) => inYear(r, year) && r.profiles?.department === d)
        .reduce((s, r) => s + Number(r.working_days), 0);
      const rate = empCount > 0
        ? Math.round((days / (empCount * WORKING_DAYS_PER_YEAR)) * 1000) / 10
        : 0;
      return { department: d, rate };
    }).sort((a, b) => b.rate - a.rate);
  }, [departments, employees, requests, year]);

  // ── Employee summary table ────────────────────────────────────────────────────

  const employeeSummary = useMemo(() => {
    return filteredEmployees.map((emp) => {
      const empReqs = filtered.filter((r) => r.employee_id === emp.id);
      const annualTaken = empReqs.filter((r) => r.leave_type === 'Annual').reduce((s, r) => s + Number(r.working_days), 0);
      const sickTaken = empReqs.filter((r) => r.leave_type === 'Sick').reduce((s, r) => s + Number(r.working_days), 0);
      const emergencyTaken = empReqs.filter((r) => r.leave_type === 'Emergency').reduce((s, r) => s + Number(r.working_days), 0);
      const otherDays = empReqs
        .filter((r) => !['Annual', 'Sick', 'Emergency'].includes(r.leave_type))
        .reduce((s, r) => s + Number(r.working_days), 0);
      const totalTaken = annualTaken + sickTaken + emergencyTaken + otherDays;
      const lastReq = [...empReqs].sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
      const totalAnnualEntitlement = (emp as Profile & { total_annual_entitlement?: number }).total_annual_entitlement ?? emp.annual_entitlement;
      return {
        id: emp.id,
        full_name: emp.full_name,
        department: emp.department,
        total_annual_entitlement: totalAnnualEntitlement,
        annualTaken,
        annualRemaining: totalAnnualEntitlement - annualTaken,
        sickTaken,
        emergencyTaken,
        otherDays,
        total_days: totalTaken,
        last_leave_date: lastReq?.end_date ?? '',
      };
    });
  }, [filteredEmployees, filtered]);

  const sortedEmployees = useMemo(() => {
    const search = empSearch.toLowerCase();
    const rows = employeeSummary.filter((e) =>
      !search || e.full_name.toLowerCase().includes(search)
    );
    return [...rows].sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'full_name') return mult * a.full_name.localeCompare(b.full_name);
      if (sortKey === 'total_days') return mult * (a.total_days - b.total_days);
      if (sortKey === 'last_leave_date') return mult * a.last_leave_date.localeCompare(b.last_leave_date);
      if (sortKey === 'department') return mult * a.department.localeCompare(b.department);
      if (sortKey === 'annualRemaining') return mult * (a.annualRemaining - b.annualRemaining);
      return 0;
    });
  }, [employeeSummary, empSearch, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ── 90+ days without leave ────────────────────────────────────────────────────

  const attentionEmployees = useMemo(() => {
    const today = new Date();
    return employees.map((emp) => {
      const lastApproved = requests
        .filter((r) => r.employee_id === emp.id)
        .sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
      const daysSince = lastApproved
        ? Math.floor((today.getTime() - new Date(lastApproved.end_date).getTime()) / 86400000)
        : null;
      return { emp, daysSince, lastDate: lastApproved?.end_date ?? null };
    }).filter(({ daysSince }) => daysSince === null || daysSince >= 90)
      .sort((a, b) => {
        if (a.daysSince === null) return -1;
        if (b.daysSince === null) return 1;
        return b.daysSince - a.daysSince;
      });
  }, [employees, requests]);

  // ── Staffing risk assessment ──────────────────────────────────────────────────

  const staffingRisks = useMemo(() => {
    type RiskEntry = { dept: string; weekStart: string; employees: string[]; hasPending: boolean };
    const map = new Map<string, { emps: Set<string>; hasPending: boolean }>();

    allActiveRequests.forEach((req) => {
      const dept = req.profiles?.department;
      if (!dept) return;
      // Walk from start_date to end_date in 7-day increments, recording the Monday of each week
      const start = new Date(req.start_date + 'T00:00:00');
      const end = new Date(req.end_date + 'T00:00:00');
      const seen = new Set<string>();
      const cur = new Date(start);
      while (cur <= end) {
        const dow = cur.getDay();
        const monday = new Date(cur);
        monday.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1));
        const key = `${dept}::${monday.toISOString().split('T')[0]}`;
        if (!seen.has(key)) {
          seen.add(key);
          if (!map.has(key)) map.set(key, { emps: new Set(), hasPending: false });
          map.get(key)!.emps.add(req.profiles!.full_name);
          if (req.status === 'Pending') map.get(key)!.hasPending = true;
        }
        cur.setDate(cur.getDate() + 1);
      }
    });

    const risks: RiskEntry[] = [];
    map.forEach(({ emps, hasPending }, key) => {
      if (emps.size >= 3) {
        const [dept, weekStart] = key.split('::');
        risks.push({ dept, weekStart, employees: [...emps], hasPending });
      }
    });
    return risks.sort((a, b) => {
      if (b.employees.length !== a.employees.length) return b.employees.length - a.employees.length;
      return a.weekStart.localeCompare(b.weekStart);
    });
  }, [allActiveRequests]);

  // ── Period label for display ──────────────────────────────────────────────────

  const periodLabel = periodMode === 'yearly'
    ? year
    : `${MONTHS[parseInt(month, 10) - 1]} ${year}`;

  // ── Summary CSV export ────────────────────────────────────────────────────────

  const handleExportSummary = () => {
    const modeTag = periodMode === 'yearly' ? year : `${year}_${MONTHS[parseInt(month, 10) - 1]}`;
    const deptLabel = dept === 'all' ? 'All_Departments' : dept.replace(/\s+/g, '_');
    const csv = toFullReportCSV(filtered, filteredPermissions);
    downloadCSV(csv, `FreshkiteHR_Report_${modeTag}_${deptLabel}.csv`);
  };

  // ── Import historical leave ───────────────────────────────────────────────────

  const downloadImportTemplate = () => {
    const csv = [IMPORT_SAMPLE_HEADERS.join(','), IMPORT_SAMPLE_ROW.join(',')].join('\n');
    downloadCSV(csv, 'Historical_Leave_Import_Template.csv');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        setImportErrors(['File appears empty or has no data rows.']);
        setImportRows([]);
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
      const required = ['employee_email', 'leave_type', 'start_date', 'end_date', 'working_days'];
      const missing = required.filter((h) => !headers.includes(h));
      if (missing.length) {
        setImportErrors([`Missing required columns: ${missing.join(', ')}`]);
        setImportRows([]);
        return;
      }
      const rows: ImportRow[] = [];
      const errors: string[] = [];
      lines.slice(1).forEach((line, idx) => {
        const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const row = Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ''])) as unknown as ImportRow;
        if (!row.employee_email) errors.push(`Row ${idx + 2}: missing employee_email`);
        if (!row.leave_type) errors.push(`Row ${idx + 2}: missing leave_type`);
        if (!row.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.start_date)) errors.push(`Row ${idx + 2}: invalid start_date (use YYYY-MM-DD)`);
        if (!row.end_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.end_date)) errors.push(`Row ${idx + 2}: invalid end_date (use YYYY-MM-DD)`);
        if (!row.working_days || isNaN(Number(row.working_days))) errors.push(`Row ${idx + 2}: invalid working_days`);
        rows.push(row);
      });
      setImportErrors(errors);
      setImportRows(rows);
    };
    reader.readAsText(file);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const handleImportSubmit = async () => {
    if (importErrors.length > 0 || importRows.length === 0) return;
    setImporting(true);

    // Build email→id map
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('email', importRows.map((r) => r.employee_email));

    const emailToId: Record<string, string> = {};
    (profiles ?? []).forEach((p) => { emailToId[p.email] = p.id; });

    const notFound = importRows
      .map((r) => r.employee_email)
      .filter((e) => !emailToId[e]);

    if (notFound.length > 0) {
      setImportErrors([`Employees not found: ${[...new Set(notFound)].join(', ')}`]);
      setImporting(false);
      return;
    }

    const inserts = importRows.map((r) => ({
      employee_id: emailToId[r.employee_email],
      leave_type: r.leave_type,
      start_date: r.start_date,
      end_date: r.end_date,
      working_days: Number(r.working_days),
      reason: r.reason || 'Historical import',
      status: r.status || 'Approved',
    }));

    const { error } = await supabase.from('leave_requests').insert(inserts);
    if (error) {
      setImportErrors([`Import failed: ${error.message}`]);
    } else {
      setImportOpen(false);
      setImportRows([]);
      setImportErrors([]);
      fetchData();
    }
    setImporting(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const hasMonthlyData = monthlyData.some((m) =>
    LEAVE_TYPES.some((t) => (m[t] as number) > 0)
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-0">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#0D9488]" />
            Reports &amp; Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Leave data overview for your organisation</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            onClick={() => setImportOpen(true)}
            variant="outline"
            className="gap-2 font-medium border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            <Upload className="w-4 h-4" />
            Import Historical
          </Button>
          <Button
            onClick={handleExportSummary}
            className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 font-medium"
          >
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-white rounded-xl border border-[#E5E7EB] shadow-sm">
        {/* Period mode toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['yearly', 'monthly'] as PeriodMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setPeriodMode(m)}
              className={[
                'px-3 py-1.5 text-xs font-medium transition-colors',
                periodMode === m
                  ? 'bg-[#0D9488] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {m === 'yearly' ? 'Yearly' : 'Monthly'}
            </button>
          ))}
        </div>

        {/* Month picker (only when monthly) */}
        {periodMode === 'monthly' && (
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-28 h-8 text-sm border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={MONTH_NUMS[i]}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Year picker */}
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-24 h-8 text-sm border-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Department</span>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-44 h-8 text-sm border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <span className="ml-auto text-xs text-gray-400 italic hidden sm:block">
          Showing: {periodLabel}
        </span>
      </div>

      {/* ── Section 1: KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={Calendar}
          label="Total Leave Days Taken"
          value={loading ? '—' : totalDays}
          sub="Approved requests"
        />
        <KPICard
          icon={TrendingUp}
          label="Most Common Leave Type"
          value={loading ? '—' : mostCommonType}
          sub="By total days taken"
        />
        <KPICard
          icon={Users}
          label="Average Days Per Employee"
          value={loading ? '—' : avgPerEmployee}
          sub={`Across ${filteredEmployees.length} active employee${filteredEmployees.length !== 1 ? 's' : ''}`}
        />
        <KPICard
          icon={AlertTriangle}
          label="Zero Leave Taken"
          value={loading ? '—' : zeroLeaveEmployees}
          sub="Employees with no leave this period"
        />
      </div>

      {/* ── Permissions summary row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {[
          { label: 'Permissions Submitted', value: filteredPermissions.length, color: 'text-[#0D9488]' },
          { label: 'Permissions Approved', value: filteredPermissions.filter((p) => p.status === 'Approved').length, color: 'text-emerald-600' },
          { label: 'Permissions Pending', value: filteredPermissions.filter((p) => p.status === 'Pending').length, color: 'text-[#6B7280]' },
          { label: 'Permissions Declined', value: filteredPermissions.filter((p) => p.status === 'Declined').length, color: 'text-red-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-sm">
            <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide leading-tight mb-2">{label}</p>
            <p className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

      <SectionDivider />

      {/* ── Section 2: Monthly Trend ─────────────────────────────────────────── */}
      <SectionTitle>Leave Days by Month — {year}</SectionTitle>
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-[#0D9488] rounded-full animate-spin" />
          </div>
        ) : !hasMonthlyData ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2 text-center">
            <Calendar className="w-8 h-8 text-gray-200" />
            <p className="text-sm text-gray-400">No approved leave recorded for {year}.</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomBarTooltip />} />
                {LEAVE_TYPES.map((type) => (
                  <Bar key={type} dataKey={type} stackId="a" fill={LEAVE_COLORS[type]} maxBarSize={40} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 justify-center">
              {LEAVE_TYPES.map((type) => (
                <div key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: LEAVE_COLORS[type] }} />
                  {type}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Permissions by Month chart ───────────────────────────────────────── */}
      <div className="mt-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Permissions by Month — {year}</h2>
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
          {loading ? (
            <div className="h-52 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-[#0D9488] rounded-full animate-spin" />
            </div>
          ) : !hasPermMonthlyData ? (
            <div className="h-52 flex flex-col items-center justify-center gap-2 text-center">
              <Clock className="w-8 h-8 text-gray-200" />
              <p className="text-sm text-gray-400">No permission requests recorded for {year}.</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={permMonthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}
                    formatter={(v: number, name: string) => [v, name]}
                  />
                  <Bar dataKey="Approved" stackId="b" fill="#0D9488" maxBarSize={40} />
                  <Bar dataKey="Pending" stackId="b" fill="#F59E0B" maxBarSize={40} />
                  <Bar dataKey="Declined" stackId="b" fill="#EF4444" maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 justify-center">
                {[['Approved', '#0D9488'], ['Pending', '#F59E0B'], ['Declined', '#EF4444']].map(([label, color]) => (
                  <div key={label} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                    {label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <SectionDivider />

      {/* ── Section 3: Distribution ──────────────────────────────────────────── */}
      <SectionTitle>Leave Distribution by Type — {periodLabel}</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
          {loading || pieData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2">
              {loading
                ? <div className="w-6 h-6 border-2 border-gray-200 border-t-[#0D9488] rounded-full animate-spin" />
                : <p className="text-sm text-gray-400">No data for this period.</p>
              }
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, pct }) => `${name} ${pct}%`}
                  labelLine={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={LEAVE_COLORS[entry.name as LeaveType]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden flex flex-col">
          {/* Tab header */}
          <div className="flex border-b border-gray-100">
            {(['leave', 'permissions'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setBreakdownTab(tab)}
                className={[
                  'flex-1 px-4 py-2.5 text-xs font-medium transition-colors',
                  breakdownTab === tab
                    ? 'text-[#0D9488] border-b-2 border-[#0D9488] bg-[#F5F3FF]'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {tab === 'leave' ? 'Leave Breakdown' : 'Permissions Breakdown'}
              </button>
            ))}
          </div>

          {/* Leave breakdown tab */}
          {breakdownTab === 'leave' && (
            loading ? (
              <div className="p-5 space-y-3 animate-pulse">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-8 bg-gray-100 rounded" />)}
              </div>
            ) : typeDistribution.length === 0 ? (
              <div className="p-5 text-center text-sm text-gray-400">No data for this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Requests</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Days</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Avg/Req</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {typeDistribution.map((d) => (
                      <tr key={d.type} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: LEAVE_COLORS[d.type as LeaveType] }} />
                            <span className="font-medium text-gray-900 text-xs">{d.type}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-xs">{d.requests}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums text-xs">{d.days}</td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums text-xs">{d.avg}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-semibold text-[#0D9488]">{d.pct}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Permissions breakdown tab */}
          {breakdownTab === 'permissions' && (
            loading ? (
              <div className="p-5 space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-gray-100 rounded" />)}
              </div>
            ) : filteredPermissions.length === 0 ? (
              <div className="p-5 text-center text-sm text-gray-400">No permissions for this period.</div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-72">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50/90">
                      {['Date', 'Employee', 'Duration', 'Status', 'Comment'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPermissions.map((p) => {
                      const statusColors: Record<string, string> = {
                        Pending: 'bg-gray-100 text-[#6B7280]',
                        Approved: 'bg-[#D1FAE5] text-[#065F46]',
                        Declined: 'bg-[#FEE2E2] text-[#991B1B]',
                      };
                      const h = Math.floor(p.duration_minutes / 60);
                      const m = p.duration_minutes % 60;
                      const dur = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
                      return (
                        <tr key={p.id} className="hover:bg-[#F9FAFB] transition-colors">
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            {new Date(p.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 text-xs whitespace-nowrap">{p.profiles?.full_name}</td>
                          <td className="px-4 py-3 text-gray-700 text-xs font-semibold">{dur}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate">
                            {p.admin_comment ?? <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Staffing Risk Assessment ─────────────────────────────────────────── */}
      <div className="mt-6 bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              Staffing Risk Assessment
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Weeks with 3+ staff from same department on leave (approved or pending)</p>
          </div>
          {staffingRisks.length > 0 && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 flex-shrink-0">
              {staffingRisks.length} risk{staffingRisks.length !== 1 ? 's' : ''} flagged
            </span>
          )}
        </div>
        {loading ? (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
          </div>
        ) : staffingRisks.length === 0 ? (
          <div className="px-5 py-6 flex items-center gap-3">
            <div className="w-9 h-9 bg-[#CCFBF1] rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-[#0D9488]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">No staffing risks detected</p>
              <p className="text-xs text-gray-400 mt-0.5">No department has 3+ staff on leave in the same week.</p>
            </div>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto">
            {staffingRisks.map((risk, i) => {
              const weekDate = new Date(risk.weekStart + 'T12:00:00');
              const weekLabel = weekDate.toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' });
              return (
                <div key={i} className="border border-orange-100 bg-orange-50/40 rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">{risk.dept}</span>
                      {risk.hasPending && (
                        <span className="ml-1.5 text-[10px] font-semibold text-[#065F46] bg-[#F0FDF4] border border-[#A7F3D0] px-1.5 py-0.5 rounded-full">Has Pending</span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums">
                      {risk.employees.length} staff
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Week of {weekLabel}</p>
                  <div className="flex flex-wrap gap-1">
                    {risk.employees.map((name) => (
                      <span key={name} className="text-[10px] bg-white border border-orange-100 text-gray-700 px-1.5 py-0.5 rounded font-medium">
                        {name.split(' ')[0]}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SectionDivider />

      {/* ── Section 4: Department Absence Rate ───────────────────────────────── */}
      <SectionTitle>Absence Rate by Department — {year}</SectionTitle>
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
        {loading || deptAbsenceData.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            {loading
              ? <div className="w-6 h-6 border-2 border-gray-200 border-t-[#0D9488] rounded-full animate-spin" />
              : <p className="text-sm text-gray-400">No department data available.</p>
            }
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, deptAbsenceData.length * 44)}>
            <BarChart
              data={deptAbsenceData}
              layout="vertical"
              margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
              <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="department"
                width={120}
                tick={{ fontSize: 11, fill: '#374151' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number) => [`${v}%`, 'Absence Rate']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E8E8F0', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}
              />
              <Bar dataKey="rate" fill="#0D9488" radius={4} maxBarSize={24} background={{ fill: '#CCFBF1', radius: 4 }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <SectionDivider />

      {/* ── Section 5: Employee Leave Summary Table ───────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <SectionTitle>Employee Leave Summary — {periodLabel}</SectionTitle>
        <div className="relative w-56 flex-shrink-0 -mt-4">
          <Input
            placeholder="Search employees..."
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            className="h-8 text-sm border-gray-200 pl-3"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="px-4 py-3 flex gap-4 animate-pulse">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="h-4 bg-gray-100 rounded flex-1" />
                ))}
              </div>
            ))}
          </div>
        ) : sortedEmployees.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No employees found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <SortHeader label="Employee" sortKey="full_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Department" sortKey="department" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Entitlement</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Annual Taken</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Sick Taken</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">Emergency</th>
                  <SortHeader label="Remaining" sortKey="annualRemaining" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Total Days" sortKey="total_days" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Last Leave" sortKey="last_leave_date" current={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedEmployees.map((emp) => {
                  const zeroLeave = emp.total_days === 0;
                  return (
                    <tr
                      key={emp.id}
                      className={['hover:bg-[#F9FAFB] transition-colors', zeroLeave ? 'bg-[#F0FDF4]/40' : ''].join(' ')}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {zeroLeave && <span className="w-1 h-6 bg-[#10B981] rounded flex-shrink-0" />}
                          <span className="font-medium text-gray-900 text-xs whitespace-nowrap">{emp.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{emp.department}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs font-semibold text-gray-700">{emp.total_annual_entitlement}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-700">{emp.annualTaken}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-700">{emp.sickTaken}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-700">{emp.emergencyTaken}</td>
                      <td className={[
                        'px-4 py-3 text-right tabular-nums text-xs font-semibold',
                        emp.annualRemaining < 5 ? 'text-[#EF4444]' : 'text-[#0D9488]',
                      ].join(' ')}>{emp.annualRemaining}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs font-semibold text-gray-900">{emp.total_days}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap">
                        {emp.last_leave_date ? formatDate(emp.last_leave_date) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SectionDivider />

      {/* ── Section 6: Attention Required ────────────────────────────────────── */}
      <SectionTitle>Attention Required</SectionTitle>
      {loading ? (
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5 animate-pulse space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
        </div>
      ) : attentionEmployees.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-[#CCFBF1] rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-[#0D9488]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">All clear</p>
            <p className="text-xs text-gray-400 mt-0.5">All employees have taken leave in the last 90 days.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#A7F3D0] bg-[#F0FDF4] flex items-center justify-between rounded-t-xl">
            <p className="text-xs font-semibold text-[#065F46]">
              {attentionEmployees.length} employee{attentionEmployees.length !== 1 ? 's' : ''} with no leave in 90+ days
            </p>
          </div>
          <div className="p-4 max-h-72 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attentionEmployees.map(({ emp, daysSince }) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#A7F3D0] bg-[#F0FDF4]/50 hover:bg-[#F0FDF4] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#D1FAE5] flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-[#065F46]">
                      {emp.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{emp.full_name}</p>
                  </div>
                  <span className="text-[11px] font-bold px-[10px] py-0.5 rounded-full flex-shrink-0 tabular-nums whitespace-nowrap bg-[#F0FDF4] text-[#065F46] border border-[#A7F3D0]">
                    {daysSince === null ? 'Never' : `${daysSince}d`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="h-2" />

      {/* ── Section 7: Employee Permissions Audit Ledger ──────────────────────── */}
      <SectionDivider />
      <SectionTitle>Employee Permissions Audit Ledger — {periodLabel}</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Permissions Submitted', value: filteredPermissions.length, color: 'text-[#0D9488]' },
          { label: 'Approved', value: filteredPermissions.filter((p) => p.status === 'Approved').length, color: 'text-[#10B981]' },
          { label: 'Converted to Half-Day', value: filteredPermissions.filter((p) => p.converted_to_half_day).length, color: 'text-[#6B7280]' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-sm">
            <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-2">{label}</p>
            <p className={`text-3xl font-bold tabular-nums ${color}`}>{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
                {[1, 2, 3, 4, 5].map((j) => <div key={j} className="h-4 bg-gray-100 rounded flex-1" />)}
              </div>
            ))}
          </div>
        ) : filteredPermissions.length === 0 ? (
          <div className="py-10 text-center">
            <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No permission requests for {periodLabel}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50/90">
                  {['Employee', 'Department', 'Date', 'Time', 'Duration', 'Status', 'Converted'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPermissions.map((p) => {
                  const statusColors: Record<string, string> = {
                    Pending: 'bg-gray-100 text-[#6B7280]',
                    Approved: 'bg-[#D1FAE5] text-[#065F46]',
                    Declined: 'bg-[#FEE2E2] text-[#991B1B]',
                  };
                  const h = Math.floor(p.duration_minutes / 60);
                  const m = p.duration_minutes % 60;
                  const dur = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
                  const [sh, sm] = p.start_time.split(':').map(Number);
                  const [eh, em] = p.end_time.split(':').map(Number);
                  const fmtTime = (hh: number, mm: number) => `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 text-xs whitespace-nowrap">{p.profiles?.full_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.profiles?.department}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {new Date(p.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {fmtTime(sh, sm)} – {fmtTime(eh, em)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs font-semibold">{dur}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.converted_to_half_day
                          ? <span className="text-xs font-semibold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">Half Day</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="h-8" />

      {/* ── Import Historical Leave Modal ─────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportRows([]); setImportErrors([]); } }}>
        <DialogContent className="max-w-[680px] h-[600px] max-h-[88vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <FileSpreadsheet className="w-5 h-5 text-[#0D9488]" />
              Import Historical Leave
            </DialogTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload a CSV file to bulk-import historical leave records into the system.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
            {/* Template download banner */}
            <div className="flex items-center justify-between bg-[#0D9488]/5 border border-[#CCFBF1] rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#0D9488]">Download the CSV template</p>
                <p className="text-xs text-gray-500 mt-0.5">Fill in the template and upload it below. Required columns: employee_email, leave_type, start_date, end_date, working_days.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={downloadImportTemplate}
                className="flex-shrink-0 ml-4 gap-1.5 border-[#0D9488]/30 text-[#0D9488] hover:bg-[#0D9488]/5"
              >
                <Download className="w-3.5 h-3.5" />
                Template
              </Button>
            </div>

            {/* File upload zone */}
            <div>
              <label
                htmlFor="import-csv"
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-200 rounded-xl py-10 px-6 cursor-pointer hover:border-[#0D9488]/40 hover:bg-gray-50 transition-colors text-center"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                  <Upload className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Click to upload CSV</p>
                  <p className="text-xs text-gray-400 mt-0.5">or drag and drop</p>
                </div>
                <input
                  id="import-csv"
                  ref={importFileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </label>
            </div>

            {/* Validation errors */}
            {importErrors.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-red-700">{importErrors.length} validation error{importErrors.length !== 1 ? 's' : ''}</p>
                </div>
                {importErrors.slice(0, 8).map((e, i) => (
                  <p key={i} className="text-xs text-red-600 pl-6">{e}</p>
                ))}
                {importErrors.length > 8 && (
                  <p className="text-xs text-red-600 pl-6">...and {importErrors.length - 8} more</p>
                )}
              </div>
            )}

            {/* Preview table */}
            {importRows.length > 0 && importErrors.length === 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Preview — {importRows.length} row{importRows.length !== 1 ? 's' : ''} ready to import
                </p>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Email</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Start</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">End</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Days</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-3 py-2 text-gray-700 truncate max-w-[140px]">{r.employee_email}</td>
                            <td className="px-3 py-2 text-gray-700">{r.leave_type}</td>
                            <td className="px-3 py-2 text-gray-500">{r.start_date}</td>
                            <td className="px-3 py-2 text-gray-500">{r.end_date}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.working_days}</td>
                            <td className="px-3 py-2 text-gray-500">{r.status || 'Approved'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importRows.length > 10 && (
                      <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
                        ...and {importRows.length - 10} more rows
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Employees not found in the system will cause the import to fail. All records will be inserted as-is.
                </p>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
            <Button
              variant="ghost"
              onClick={() => { setImportOpen(false); setImportRows([]); setImportErrors([]); }}
              className="text-gray-600"
            >
              <X className="w-4 h-4 mr-1.5" />
              Cancel
            </Button>
            <Button
              onClick={handleImportSubmit}
              disabled={importing || importRows.length === 0 || importErrors.length > 0}
              className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 font-medium"
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import {importRows.length > 0 ? `${importRows.length} Records` : 'Records'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
