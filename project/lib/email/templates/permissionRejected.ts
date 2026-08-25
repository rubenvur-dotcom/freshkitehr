import { baseTemplate, detailTable, infoBlock, statusBadge } from './base.js';

export interface PermissionRejectedParams {
  employee_name: string;
  permission_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  admin_comment?: string;
}

export function permissionRejected(p: PermissionRejectedParams): { subject: string; html: string } {
  const duration = `${p.duration_hours} hour${p.duration_hours !== 1 ? 's' : ''}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#991B1B;">Permission Request Not Approved</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;line-height:1.6;">
      Hi <strong style="color:#111827;">${p.employee_name}</strong>, unfortunately your permission request
      for <strong>${p.permission_date}</strong> (<strong>${p.start_time}–${p.end_time}</strong>) has not been
      approved at this time.
    </p>

    ${detailTable([
      { label: 'Date',          value: p.permission_date },
      { label: 'From',          value: p.start_time },
      { label: 'To',            value: p.end_time },
      { label: 'Duration',      value: duration },
      { label: 'Status',        value: statusBadge('Rejected') },
    ])}

    ${p.admin_comment
      ? `<p style="margin:0 0 4px;font-size:13px;color:#6B7280;font-weight:600;">REASON</p>${infoBlock(p.admin_comment)}`
      : `<div style="background:#FEF3C7;border-left:3px solid #F59E0B;border-radius:4px;padding:12px 16px;margin:16px 0;font-size:14px;color:#92400E;">
          No specific reason was provided. Please contact your HR administrator for more details.
        </div>`
    }

    <p style="margin:20px 0 0;font-size:14px;color:#6B7280;line-height:1.6;">
      Warm regards,<br/><strong style="color:#111827;">Freshkite HR Team</strong>
    </p>`;

  return {
    subject: `Permission Request Update — ${p.permission_date} (${p.start_time}–${p.end_time})`,
    html: baseTemplate('Permission Request Not Approved', body),
  };
}
