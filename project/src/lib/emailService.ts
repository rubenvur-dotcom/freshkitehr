import { supabase, LeaveRequest, Profile } from './supabase';

type RequestWithProfile = LeaveRequest & { profiles?: Profile };

// In development the email server runs on :3457; in production it's co-hosted.
const EMAIL_SERVER_URL =
  import.meta.env.VITE_EMAIL_SERVER_URL ??
  (import.meta.env.DEV ? 'http://localhost:3457' : '/api/email');

async function callEmailServer(payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${EMAIL_SERVER_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn('[email] Server error:', err);
    }
    return res.ok;
  } catch (err) {
    console.warn('[email] Could not reach email server:', err);
    return false;
  }
}

export async function triggerNewRequestEmail(req: RequestWithProfile): Promise<boolean> {
  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .eq('role', 'admin')
    .eq('is_active', true);

  return callEmailServer({
    type:           'new_request',
    employee_name:  req.profiles?.full_name ?? 'Employee',
    employee_email: req.profiles?.email ?? '',
    leave_type:     req.leave_type,
    start_date:     req.start_date,
    end_date:       req.end_date,
    working_days:   req.working_days,
    reason:         req.reason ?? '',
    admin_emails:   admins?.map((a) => a.email) ?? [],
  });
}

export async function triggerLeaveStatusEmail(
  req: RequestWithProfile,
  status: 'Approved' | 'Rejected',
  adminComment: string | null
): Promise<boolean> {
  const employeeEmail = req.profiles?.email;
  if (!employeeEmail) return true;

  return callEmailServer({
    type:           status === 'Approved' ? 'approved' : 'rejected',
    employee_name:  req.profiles?.full_name ?? 'Employee',
    employee_email: employeeEmail,
    leave_type:     req.leave_type,
    start_date:     req.start_date,
    end_date:       req.end_date,
    working_days:   req.working_days,
    admin_comment:  adminComment ?? '',
  });
}

export async function triggerAdminSubmittedEmail(params: {
  employee_name: string;
  employee_email: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  working_days: number;
  status: string;
  admin_note: string;
}): Promise<boolean> {
  return callEmailServer({ type: 'admin_submitted', ...params });
}

export async function triggerAnnouncementEmail(params: {
  recipients: string[];
  announcement_title: string;
  announcement_body: string;
  priority: string;
  author_name: string;
  posted_at: string;
  is_update?: boolean;
}): Promise<boolean> {
  if (!params.recipients.length) return true;
  return callEmailServer({ type: 'announcement', ...params });
}

export async function triggerPermissionEmail(
  type: 'permission_submitted' | 'permission_approved' | 'permission_rejected',
  params: {
    employee_name: string;
    employee_email: string;
    permission_date: string;
    start_time: string;
    end_time: string;
    duration_hours: number;
    reason?: string;
    admin_comment?: string;
    admin_emails?: string[];
  }
): Promise<boolean> {
  return callEmailServer({ type, ...params });
}
