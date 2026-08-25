import { baseTemplate, detailTable, infoBlock, statusBadge, formatDate } from './base.js';

export interface LeaveRejectedParams {
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  working_days: number;
  admin_comment?: string;
}

export function leaveRejected(p: LeaveRejectedParams): { subject: string; html: string } {
  const duration = `${p.working_days} day${p.working_days !== 1 ? 's' : ''}`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#991B1B;">Leave Request Not Approved</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;line-height:1.6;">
      Hi <strong style="color:#111827;">${p.employee_name}</strong>, unfortunately your
      <strong>${p.leave_type}</strong> leave request for
      <strong>${formatDate(p.start_date)}</strong> to <strong>${formatDate(p.end_date)}</strong>
      has not been approved at this time.
    </p>

    ${detailTable([
      { label: 'Leave Type',    value: p.leave_type },
      { label: 'Start Date',    value: formatDate(p.start_date) },
      { label: 'End Date',      value: formatDate(p.end_date) },
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
      If you have questions, please speak to your HR team.<br/><br/>
      Warm regards,<br/><strong style="color:#111827;">Freshkite HR Team</strong>
    </p>`;

  return {
    subject: `Leave Request Update — ${p.leave_type} (${formatDate(p.start_date)} – ${formatDate(p.end_date)})`,
    html: baseTemplate('Leave Request Not Approved', body),
  };
}
