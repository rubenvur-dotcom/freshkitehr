import { baseTemplate, detailTable, infoBlock, statusBadge } from './base.js';

export interface PermissionApprovedParams {
  employee_name: string;
  permission_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  admin_comment?: string;
}

export function permissionApproved(p: PermissionApprovedParams): { subject: string; html: string } {
  const duration = `${p.duration_hours} hour${p.duration_hours !== 1 ? 's' : ''}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#065F46;">Your permission has been approved ✓</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;line-height:1.6;">
      Hi <strong style="color:#111827;">${p.employee_name}</strong>, your permission request for
      <strong>${p.permission_date}</strong> has been <strong style="color:#065F46;">approved</strong>.
    </p>

    ${detailTable([
      { label: 'Date',          value: p.permission_date },
      { label: 'From',          value: p.start_time },
      { label: 'To',            value: p.end_time },
      { label: 'Duration',      value: duration },
      { label: 'Status',        value: statusBadge('Approved') },
    ])}

    ${p.admin_comment ? `<p style="margin:0 0 4px;font-size:13px;color:#6B7280;font-weight:600;">NOTE FROM HR</p>${infoBlock(p.admin_comment)}` : ''}

    <p style="margin:20px 0 0;font-size:14px;color:#6B7280;line-height:1.6;">
      Warm regards,<br/><strong style="color:#111827;">Freshkite HR Team</strong>
    </p>`;

  return {
    subject: `Permission Approved — ${p.permission_date} (${p.start_time}–${p.end_time})`,
    html: baseTemplate('Permission Approved', body),
  };
}
