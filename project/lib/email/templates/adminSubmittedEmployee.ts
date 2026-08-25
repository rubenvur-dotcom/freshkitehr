import { baseTemplate, detailTable, infoBlock, statusBadge, formatDate } from './base.js';

export interface AdminSubmittedEmployeeParams {
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  working_days: number;
  status: string;
  admin_note?: string;
}

export function adminSubmittedEmployee(p: AdminSubmittedEmployeeParams): { subject: string; html: string } {
  const duration = `${p.working_days} day${p.working_days !== 1 ? 's' : ''}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Leave Added on Your Behalf</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;line-height:1.6;">
      Hi <strong style="color:#111827;">${p.employee_name}</strong>, your HR team has recorded a
      <strong>${p.leave_type}</strong> leave entry on your behalf. Details are shown below.
    </p>

    ${detailTable([
      { label: 'Leave Type',    value: p.leave_type },
      { label: 'Start Date',    value: formatDate(p.start_date) },
      { label: 'End Date',      value: formatDate(p.end_date) },
      { label: 'Duration',      value: duration },
      { label: 'Status',        value: statusBadge(p.status) },
    ])}

    ${p.admin_note ? `<p style="margin:0 0 4px;font-size:13px;color:#6B7280;font-weight:600;">HR NOTE</p>${infoBlock(p.admin_note)}` : ''}

    <p style="margin:20px 0 0;font-size:14px;color:#6B7280;line-height:1.6;">
      If you believe this is an error, please contact your HR administrator.<br/><br/>
      Warm regards,<br/><strong style="color:#111827;">Freshkite HR Team</strong>
    </p>`;

  return {
    subject: `Leave Added on Your Behalf — ${p.leave_type} (${formatDate(p.start_date)} – ${formatDate(p.end_date)})`,
    html: baseTemplate('Leave Added by HR', body),
  };
}
