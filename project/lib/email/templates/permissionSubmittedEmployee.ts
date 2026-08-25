import { baseTemplate, detailTable, infoBlock, statusBadge } from './base.js';

export interface PermissionSubmittedEmployeeParams {
  employee_name: string;
  permission_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  reason?: string;
}

export function permissionSubmittedEmployee(p: PermissionSubmittedEmployeeParams): { subject: string; html: string } {
  const duration = `${p.duration_hours} hour${p.duration_hours !== 1 ? 's' : ''}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Your permission request has been submitted</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;line-height:1.6;">
      Hi <strong style="color:#111827;">${p.employee_name}</strong>, your permission request for
      <strong>${p.permission_date}</strong> from <strong>${p.start_time}</strong> to
      <strong>${p.end_time}</strong> (${duration}) has been received and is pending approval.
    </p>

    ${detailTable([
      { label: 'Date',          value: p.permission_date },
      { label: 'From',          value: p.start_time },
      { label: 'To',            value: p.end_time },
      { label: 'Duration',      value: duration },
      { label: 'Status',        value: statusBadge('Pending') },
    ])}

    ${p.reason ? infoBlock(p.reason) : ''}

    <p style="margin:20px 0 0;font-size:14px;color:#6B7280;line-height:1.6;">
      You will be notified once your request has been reviewed.<br/><br/>
      Warm regards,<br/><strong style="color:#111827;">Freshkite HR Team</strong>
    </p>`;

  return {
    subject: `Permission Request Submitted — ${p.permission_date} (${p.start_time}–${p.end_time})`,
    html: baseTemplate('Permission Request Submitted', body),
  };
}
