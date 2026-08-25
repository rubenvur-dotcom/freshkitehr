import { baseTemplate, detailTable, infoBlock, statusBadge, formatDate } from './base.js';

export interface LeaveApprovedParams {
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  working_days: number;
  admin_comment?: string;
}

export function leaveApproved(p: LeaveApprovedParams): { subject: string; html: string } {
  const duration = `${p.working_days} day${p.working_days !== 1 ? 's' : ''}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#065F46;">Your leave has been approved ✓</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;line-height:1.6;">
      Hi <strong style="color:#111827;">${p.employee_name}</strong>, great news — your
      <strong>${p.leave_type}</strong> leave request has been <strong style="color:#065F46;">approved</strong>.
      Enjoy your time off!
    </p>

    ${detailTable([
      { label: 'Leave Type',    value: p.leave_type },
      { label: 'Start Date',    value: formatDate(p.start_date) },
      { label: 'End Date',      value: formatDate(p.end_date) },
      { label: 'Duration',      value: duration },
      { label: 'Status',        value: statusBadge('Approved') },
    ])}

    ${p.admin_comment ? `<p style="margin:0 0 4px;font-size:13px;color:#6B7280;font-weight:600;">NOTE FROM HR</p>${infoBlock(p.admin_comment)}` : ''}

    <p style="margin:20px 0 0;font-size:14px;color:#6B7280;line-height:1.6;">
      Warm regards,<br/><strong style="color:#111827;">Freshkite HR Team</strong>
    </p>`;

  return {
    subject: `Leave Approved — ${p.leave_type} (${formatDate(p.start_date)} – ${formatDate(p.end_date)})`,
    html: baseTemplate('Leave Approved', body),
  };
}
