import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Profile } from './supabase';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateWorkingDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-MU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function getLeaveTypeColor(type: string): string {
  const colors: Record<string, string> = {
    Annual: 'bg-teal-100 text-teal-800 border-teal-200',
    Sick: 'bg-amber-100 text-amber-800 border-amber-200',
    Maternity: 'bg-pink-100 text-pink-800 border-pink-200',
    Paternity: 'bg-blue-100 text-blue-800 border-blue-200',
    Emergency: 'bg-red-100 text-red-800 border-red-200',
    Unpaid: 'bg-gray-100 text-gray-800 border-gray-200',
    Compassionate: 'bg-rose-100 text-rose-800 border-rose-200',
    Study: 'bg-sky-100 text-sky-800 border-sky-200',
  };
  return colors[type] || 'bg-gray-100 text-gray-700 border-gray-200';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    Pending: 'bg-amber-100 text-amber-800 border-amber-200',
    Approved: 'bg-green-100 text-green-800 border-green-200',
    Rejected: 'bg-red-100 text-red-800 border-red-200',
  };
  return colors[status] || 'bg-gray-100 text-gray-700 border-gray-200';
}

export function getLeaveTypeCalendarColor(type: string): string {
  const colors: Record<string, string> = {
    Annual: '#0d9488',
    Sick: '#f59e0b',
    Maternity: '#ec4899',
    Paternity: '#3b82f6',
    Emergency: '#ef4444',
    Unpaid: '#6b7280',
    Compassionate: '#be123c',
    Study: '#0284c7',
  };
  return colors[type] || '#6b7280';
}

// ── Leave Accrual Calculations ─────────────────────────────────────────────

export interface LeaveBalances {
  annualAllowance: number;   // Total allowed this year
  sickAllowance: number;     // Total sick allowed this year
  annualUsed: number;        // Days taken (approved)
  sickUsed: number;
  annualPending: number;     // Days in pending requests
  sickPending: number;
  annualRemaining: number;
  sickRemaining: number;
  isProbation: boolean;
  probationMonthsCompleted: number;
}

/**
 * Calculates how many full months have been completed from a start date to today.
 */
function completedMonthsSince(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  // If day-of-month hasn't been reached yet, subtract one
  if (to.getDate() < from.getDate()) months--;
  return Math.max(0, months);
}

/**
 * Returns the effective annual and sick leave allowances for the current calendar year,
 * accounting for probation accrual vs. post-probation pro-rata.
 */
export function computeLeaveBalances(
  profile: Profile,
  approvedRequests: { leave_type: string; working_days: number }[],
  pendingRequests: { leave_type: string; working_days: number }[],
): LeaveBalances {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today.getFullYear(), 11, 31);

  const isProbation = profile.probation_status === 'in_probation';

  let annualAllowance: number;
  let sickAllowance: number;

  if (isProbation) {
    // Accrue 1 day per completed month of employment (capped to current year)
    const hireDate = profile.date_of_hire ? new Date(profile.date_of_hire) : yearStart;
    const effectiveFrom = hireDate > yearStart ? hireDate : yearStart;
    const monthsCompleted = completedMonthsSince(effectiveFrom, today);
    annualAllowance = monthsCompleted;
    sickAllowance = monthsCompleted;
  } else {
    // Post-probation: pro-rata for remaining months in the year
    // Find when probation ended (or hire date if no probation)
    const passedDate = profile.probation_end_date
      ? new Date(profile.probation_end_date)
      : profile.date_of_hire
        ? new Date(profile.date_of_hire)
        : yearStart;

    const effectiveFrom = passedDate > yearStart ? passedDate : yearStart;

    // Remaining months including the current month
    const remainingMonths =
      (yearEnd.getFullYear() - effectiveFrom.getFullYear()) * 12 +
      (yearEnd.getMonth() - effectiveFrom.getMonth()) + 1;

    const proRata = Math.round((remainingMonths / 12) * profile.total_annual_entitlement);

    // Add any unused probationary balance if probation ended mid-year
    let probationaryAnnual = 0;
    let probationarySick = 0;
    if (profile.probation_end_date && new Date(profile.probation_end_date) > yearStart) {
      const hireDate = profile.date_of_hire ? new Date(profile.date_of_hire) : yearStart;
      const effectiveHire = hireDate > yearStart ? hireDate : yearStart;
      probationaryAnnual = completedMonthsSince(effectiveHire, passedDate);
      probationarySick = probationaryAnnual;
    }

    annualAllowance = proRata + probationaryAnnual;
    sickAllowance = profile.sick_entitlement + probationarySick;
  }

  const annualUsed = approvedRequests
    .filter((r) => r.leave_type === 'Annual')
    .reduce((s, r) => s + Number(r.working_days), 0);
  const sickUsed = approvedRequests
    .filter((r) => r.leave_type === 'Sick')
    .reduce((s, r) => s + Number(r.working_days), 0);
  const annualPending = pendingRequests
    .filter((r) => r.leave_type === 'Annual')
    .reduce((s, r) => s + Number(r.working_days), 0);
  const sickPending = pendingRequests
    .filter((r) => r.leave_type === 'Sick')
    .reduce((s, r) => s + Number(r.working_days), 0);

  const hireDate = profile.date_of_hire ? new Date(profile.date_of_hire) : null;
  const probationMonthsCompleted = hireDate ? completedMonthsSince(hireDate, today) : 0;

  return {
    annualAllowance,
    sickAllowance,
    annualUsed,
    sickUsed,
    annualPending,
    sickPending,
    annualRemaining: Math.max(0, annualAllowance - annualUsed),
    sickRemaining: Math.max(0, sickAllowance - sickUsed),
    isProbation,
    probationMonthsCompleted,
  };
}

/**
 * Returns the number of working days between today and startDate (exclusive of startDate).
 * Used to check notice period compliance.
 */
export function workingDaysNotice(startDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  return calculateWorkingDays(today.toISOString().split('T')[0], start.toISOString().split('T')[0]) - 1;
}

