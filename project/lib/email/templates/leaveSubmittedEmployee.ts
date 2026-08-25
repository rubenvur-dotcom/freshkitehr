import { baseTemplate, detailTable, infoBlock, statusBadge, formatDate } from './base.js';

export interface LeaveSubmittedEmployeeParams {
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  working_days: number;
  reason?: string;
}

export function leaveSubmittedEmployee(p: LeaveSubmittedEmployeeParams): { subject: string; html: string } {
  const duration = `${p.working_days} day${p.working_days !== 1 ? 's' : ''}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Your leave request has been submitted</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;line-height:1.6;">
      Hi <strong style="color:#111827;">${p.employee_name}</strong>, your <strong>${p.leave_type}</strong> leave request
      for <strong>${formatDate(p.start_date)}</strong> to <strong>${formatDate(p.end_date)}</strong> (${duration}) has been
      received and is currently pending approval.
    </p>

    ${detailTable([
      { label: 'Leave Type',    value: p.leave_type },
      { label: 'Start Date',    value: formatDate(p.start_date) },
      { label: 'End Date',      value: formatDate(p.end_date) },
      { label: 'Duration',      value: duration },
      { label: 'Status',        value: statusBadge('Pending') },
    ])}

    ${p.reason ? infoBlock(p.reason) : ''}

    <p style="margin:20px 0 0;font-size:14px;color:#6B7280;line-height:1.6;">
      You will receive another email once your request has been reviewed.<br/><br/>
      Warm regards,<br/><strong style="color:#111827;">Freshkite HR Team</strong>
    </p>`;

  return {
    subject: `Leave Request Submitted — ${p.leave_type} (${formatDate(p.start_date)} – ${formatDate(p.end_date)})`,
    html: baseTemplate('Leave Request Submitted', body),
  };
}
