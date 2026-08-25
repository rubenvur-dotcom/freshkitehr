import { baseTemplate, ctaButton, detailTable, infoBlock, formatDate } from './base.js';

const APP_URL = process.env.APP_URL ?? 'https://hr.freshkite.io';

export interface LeaveSubmittedAdminParams {
  employee_name: string;
  employee_email: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  working_days: number;
  reason?: string;
}

export function leaveSubmittedAdmin(p: LeaveSubmittedAdminParams): { subject: string; html: string } {
  const duration = `${p.working_days} day${p.working_days !== 1 ? 's' : ''}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">New Leave Request Submitted</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;line-height:1.6;">
      <strong style="color:#111827;">${p.employee_name}</strong> has submitted a new <strong>${p.leave_type}</strong>
      leave request and is awaiting your review.
    </p>

    ${detailTable([
      { label: 'Employee',      value: `${p.employee_name} &lt;${p.employee_email}&gt;` },
      { label: 'Leave Type',    value: p.leave_type },
      { label: 'Start Date',    value: formatDate(p.start_date) },
      { label: 'End Date',      value: formatDate(p.end_date) },
      { label: 'Duration',      value: duration },
    ])}

    ${p.reason ? infoBlock(p.reason) : ''}

    <p style="margin:20px 0 8px;font-size:14px;color:#6B7280;">
      Please review and approve or reject the request from the admin dashboard.
    </p>
    <p style="margin:0;">${ctaButton('Review Request', `${APP_URL}/admin/requests`)}</p>`;

  return {
    subject: `New Leave Request — ${p.employee_name} (${p.leave_type}, ${duration})`,
    html: baseTemplate('New Leave Request', body),
  };
}
