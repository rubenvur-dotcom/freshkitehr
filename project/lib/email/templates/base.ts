const APP_URL = process.env.APP_URL ?? 'https://hr.freshkite.io';

export function baseTemplate(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F8F9FC;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FC;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Card -->
        <tr><td style="background:#FFFFFF;border-radius:8px;border:1px solid #E5E7EB;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

          <!-- Top accent bar -->
          <div style="height:4px;background:#7C3AED;"></div>

          <!-- Logo area -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #E5E7EB;">
              <img
                src="${APP_URL}/freshkite-logo.png"
                alt="Freshkite HR"
                height="40"
                style="display:block;margin:0 auto 8px;max-height:40px;object-fit:contain;"
                onerror="this.style.display='none'"
              />
              <p style="margin:0;font-size:18px;font-weight:700;color:#7C3AED;letter-spacing:-0.3px;">Freshkite HR</p>
            </td></tr>
          </table>

          <!-- Body -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:28px 32px;">
              ${bodyContent}
            </td></tr>
          </table>

          <!-- Footer -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:16px 32px 28px;text-align:center;border-top:1px solid #F3F4F6;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
                This is an automated message from Freshkite HR. Please do not reply to this email.<br/>
                <a href="https://www.freshkite.io" style="color:#7C3AED;text-decoration:none;">www.freshkite.io</a>
              </p>
            </td></tr>
          </table>

        </td></tr>
        <!-- /Card -->

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function ctaButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#7C3AED;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;margin-top:8px;">${label}</a>`;
}

export function detailTable(rows: { label: string; value: string }[]): string {
  const rowsHtml = rows.map(({ label, value }) => `
    <tr>
      <td style="padding:8px 0;color:#6B7280;font-size:14px;width:150px;vertical-align:top;white-space:nowrap;">${label}</td>
      <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:500;">${value}</td>
    </tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;margin:16px 0;">
    <tr><td style="padding:16px;">${rowsHtml ? `<table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>` : ''}</td></tr>
  </table>`;
}

export function infoBlock(text: string): string {
  return `<div style="background:#F3F4F6;border-left:3px solid #7C3AED;border-radius:4px;padding:12px 16px;margin:16px 0;font-size:14px;color:#374151;font-style:italic;">"${text}"</div>`;
}

export function statusBadge(status: string): string {
  const map: Record<string, { bg: string; color: string }> = {
    Pending:  { bg: '#FEF3C7', color: '#92400E' },
    Approved: { bg: '#D1FAE5', color: '#065F46' },
    Rejected: { bg: '#FEE2E2', color: '#991B1B' },
  };
  const style = map[status] ?? { bg: '#EDE9FE', color: '#5B21B6' };
  return `<span style="background:${style.bg};color:${style.color};padding:3px 12px;border-radius:999px;font-size:12px;font-weight:700;">${status}</span>`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-MU', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}
