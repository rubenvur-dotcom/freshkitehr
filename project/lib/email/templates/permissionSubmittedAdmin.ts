import { baseTemplate, ctaButton, detailTable, infoBlock } from './base.js';

const APP_URL = process.env.APP_URL ?? 'https://hr.freshkite.io';

export interface PermissionSubmittedAdminParams {
  employee_name: string;
  employee_email: string;
  permission_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  reason?: string;
}

export function permissionSubmittedAdmin(p: PermissionSubmittedAdminParams): { subject: string; html: string } {
  const duration = `${p.duration_hours} hour${p.duration_hours !== 1 ? 's' : ''}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">New Permission Request</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;line-height:1.6;">
      <strong style="color:#111827;">${p.employee_name}</strong> has submitted a permission request
      and is awaiting your approval.
    </p>

    ${detailTable([
      { label: 'Employee',      value: `${p.employee_name} &lt;${p.employee_email}&gt;` },
      { label: 'Date',          value: p.permission_date },
      { label: 'From',          value: p.start_time },
      { label: 'To',            value: p.end_time },
      { label: 'Duration',      value: duration },
    ])}

    ${p.reason ? infoBlock(p.reason) : ''}

    <p style="margin:20px 0 8px;font-size:14px;color:#6B7280;">
      Review and respond to this request from the admin permissions panel.
    </p>
    <p style="margin:0;">${ctaButton('Review Permission Request', `${APP_URL}/admin/requests`)}</p>`;

  return {
    subject: `New Permission Request — ${p.employee_name} (${p.permission_date}, ${duration})`,
    html: baseTemplate('New Permission Request', body),
  };
}
