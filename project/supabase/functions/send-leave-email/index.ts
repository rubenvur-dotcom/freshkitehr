import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Freshkite HR <hr@freshkite.net>";
const APP_URL = "https://hr.freshkite.net";

async function sendEmail(to: string | string[], subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set, skipping email");
    return;
  }

  const toArray = Array.isArray(to) ? to : [to];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: toArray, subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    throw new Error(`Resend API error: ${err}`);
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-MU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function baseTemplate(headerBg: string, headerText: string, subText: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Logo header -->
        <tr>
          <td style="padding-bottom:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:16px 24px;background:white;border-radius:12px 12px 0 0;border:1px solid #e5e7eb;border-bottom:none;">
                  <span style="font-size:18px;font-weight:700;color:#1D9E75;letter-spacing:-0.5px;">Freshkite</span>
                  <span style="font-size:18px;font-weight:400;color:#374151;letter-spacing:-0.5px;"> HR</span>
                  <span style="font-size:12px;color:#9ca3af;margin-left:8px;">· Leave Management</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Coloured banner -->
        <tr>
          <td style="padding-bottom:0;">
            <div style="background:${headerBg};padding:28px 24px;border-radius:0;">
              <h1 style="margin:0;color:white;font-size:22px;font-weight:700;">${headerText}</h1>
              <p style="margin:6px 0 0;color:${subText};font-size:14px;">${new Date().toLocaleDateString("en-MU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:white;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
            ${bodyContent}
            <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;padding-top:20px;">
              This email was sent by Freshkite HR · Leave Management System.<br>
              If you have any questions, please contact your HR administrator.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:500;">${value}</td>
  </tr>`;
}

function priorityBadgeHtml(priority: string): string {
  const styles: Record<string, string> = {
    normal: "background:#d1fae5;color:#065f46;",
    important: "background:#fef3c7;color:#92400e;",
    urgent: "background:#fee2e2;color:#991b1b;",
  };
  const labels: Record<string, string> = {
    normal: "Normal",
    important: "Important",
    urgent: "URGENT",
  };
  const style = styles[priority] ?? styles.normal;
  const label = labels[priority] ?? priority;
  return `<span style="${style}padding:3px 12px;border-radius:999px;font-size:12px;font-weight:700;">${label}</span>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, employee_name, employee_email, leave_type, start_date, end_date, working_days, admin_comment, admin_emails } = payload;

    const daysLabel = working_days ? `${working_days} day${working_days !== 1 ? "s" : ""}` : "";
    const dateRange = start_date && end_date ? `${formatDate(start_date)} to ${formatDate(end_date)}` : "";

    if (type === "new_request") {
      if (!admin_emails?.length) {
        return new Response(JSON.stringify({ error: "admin_emails required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subject = `New Leave Request — ${employee_name} (${leave_type}, ${daysLabel})`;

      const body = baseTemplate(
        "linear-gradient(135deg, #1D9E75, #0f7a5a)",
        "New Leave Request",
        "#a7f3d0",
        `<p style="font-size:15px;color:#374151;margin:0 0 20px;">
          A new leave request has been submitted and is awaiting your review.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${detailRow("Employee", employee_name)}
              ${detailRow("Leave Type", `<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:999px;font-size:13px;">${leave_type}</span>`)}
              ${detailRow("Start Date", formatDate(start_date))}
              ${detailRow("End Date", formatDate(end_date))}
              ${detailRow("Working Days", `<strong>${daysLabel}</strong>`)}
              ${payload.reason ? detailRow("Reason", `<em style="color:#6b7280;">"${payload.reason}"</em>`) : ""}
            </table>
          </td></tr>
        </table>
        <p style="text-align:center;margin:0;">
          <a href="${APP_URL}/admin/requests"
             style="display:inline-block;background:#1D9E75;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
            Review Request
          </a>
        </p>`
      );

      await sendEmail(admin_emails, subject, body);

    } else if (type === "approved") {
      const subject = `Leave Request Approved — ${leave_type} (${formatDate(start_date)} to ${formatDate(end_date)})`;

      const body = baseTemplate(
        "linear-gradient(135deg, #1D9E75, #0f7a5a)",
        "Leave Request Approved",
        "#a7f3d0",
        `<p style="font-size:15px;color:#374151;margin:0 0 8px;">Hi <strong>${employee_name}</strong>,</p>
        <p style="font-size:15px;color:#374151;margin:0 0 20px;">
          Your <strong>${leave_type}</strong> leave request has been <strong style="color:#1D9E75;">approved</strong>. Enjoy your time off!
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${detailRow("Leave Type", `<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:999px;font-size:13px;">${leave_type}</span>`)}
              ${detailRow("Start Date", formatDate(start_date))}
              ${detailRow("End Date", formatDate(end_date))}
              ${detailRow("Working Days", `<strong>${daysLabel}</strong>`)}
              ${admin_comment ? detailRow("Note from HR", `<em style="color:#374151;">"${admin_comment}"</em>`) : ""}
            </table>
          </td></tr>
        </table>
        <p style="font-size:14px;color:#6b7280;margin:0;">
          Warm regards,<br><strong style="color:#374151;">Freshkite HR Team</strong>
        </p>`
      );

      await sendEmail(employee_email, subject, body);

    } else if (type === "rejected") {
      const subject = `Leave Request Update — ${leave_type} (${formatDate(start_date)} to ${formatDate(end_date)})`;

      const body = baseTemplate(
        "linear-gradient(135deg, #ef4444, #dc2626)",
        "Leave Request Not Approved",
        "#fecaca",
        `<p style="font-size:15px;color:#374151;margin:0 0 8px;">Hi <strong>${employee_name}</strong>,</p>
        <p style="font-size:15px;color:#374151;margin:0 0 20px;">
          Unfortunately, your <strong>${leave_type}</strong> leave request for <strong>${dateRange}</strong> has not been approved at this time.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${detailRow("Leave Type", `<span style="background:#fee2e2;color:#991b1b;padding:2px 10px;border-radius:999px;font-size:13px;">${leave_type}</span>`)}
              ${detailRow("Start Date", formatDate(start_date))}
              ${detailRow("End Date", formatDate(end_date))}
              ${detailRow("Working Days", `<strong>${daysLabel}</strong>`)}
              ${admin_comment ? detailRow("Reason", `<em style="color:#374151;">"${admin_comment}"</em>`) : ""}
            </table>
          </td></tr>
        </table>
        ${!admin_comment ? `<p style="font-size:14px;color:#6b7280;background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:0 0 20px;">
          No specific reason was provided. Please contact your HR administrator for more details.
        </p>` : ""}
        <p style="font-size:14px;color:#6b7280;margin:0;">
          Warm regards,<br><strong style="color:#374151;">Freshkite HR Team</strong>
        </p>`
      );

      await sendEmail(employee_email, subject, body);

    } else if (type === "admin_submitted") {
      const { admin_note, status } = payload;
      const subject = `Leave Request Added on Your Behalf — ${leave_type} (${formatDate(start_date)} to ${formatDate(end_date)})`;

      const body = baseTemplate(
        "linear-gradient(135deg, #1D9E75, #0f7a5a)",
        "Leave Added by HR",
        "#a7f3d0",
        `<p style="font-size:15px;color:#374151;margin:0 0 8px;">Hi <strong>${employee_name}</strong>,</p>
        <p style="font-size:15px;color:#374151;margin:0 0 20px;">
          Your HR team has recorded a leave request on your behalf. Details are shown below.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${detailRow("Leave Type", `<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:999px;font-size:13px;">${leave_type}</span>`)}
              ${detailRow("Start Date", formatDate(start_date))}
              ${detailRow("End Date", formatDate(end_date))}
              ${detailRow("Working Days", `<strong>${daysLabel}</strong>`)}
              ${detailRow("Status", `<strong>${status ?? "Approved"}</strong>`)}
              ${admin_note ? detailRow("HR Note", `<em style="color:#374151;">"${admin_note}"</em>`) : ""}
            </table>
          </td></tr>
        </table>
        <p style="font-size:14px;color:#6b7280;margin:0;">
          If you have questions, please reach out to your HR team.<br><br>
          Warm regards,<br><strong style="color:#374151;">Freshkite HR Team</strong>
        </p>`
      );

      await sendEmail(employee_email, subject, body);

    } else if (type === "announcement") {
      const { recipients, announcement_title, announcement_body, priority, author_name, posted_at, is_update } = payload;

      if (!recipients?.length) {
        return new Response(JSON.stringify({ error: "recipients required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const priorityPrefix = is_update
        ? `(Updated) `
        : priority === "urgent"
          ? "URGENT: "
          : priority === "important"
            ? "Important: "
            : "";

      const subject = `[Freshkite HR] ${priorityPrefix}${announcement_title}`;

      const headerBg = priority === "urgent"
        ? "linear-gradient(135deg, #E24B4A, #c0392b)"
        : priority === "important"
          ? "linear-gradient(135deg, #F5A623, #e67e22)"
          : "linear-gradient(135deg, #1D9E75, #0f7a5a)";

      const body = baseTemplate(
        headerBg,
        is_update ? `Updated: ${announcement_title}` : announcement_title,
        "#ffffff80",
        `<div style="margin-bottom:16px;">
          ${priorityBadgeHtml(priority)}
        </div>
        <p style="font-size:16px;font-weight:700;color:#111827;margin:0 0 12px;">${announcement_title}</p>
        <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">${announcement_body.replace(/\n/g, "<br>")}</p>
        <p style="font-size:13px;color:#9ca3af;margin:0 0 24px;border-top:1px solid #f3f4f6;padding-top:16px;">
          Posted by <strong style="color:#374151;">${author_name}</strong> on ${posted_at ? formatDate(posted_at) : new Date().toLocaleDateString("en-MU", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 16px;">
          <a href="${APP_URL}/employee/announcements" style="color:#1D9E75;text-decoration:none;font-weight:600;">
            View all announcements &rarr;
          </a>
        </p>
        <p style="font-size:12px;color:#9ca3af;margin:0;">
          You are receiving this because you are a member of the Freshkite team. Log in to Freshkite HR to view all announcements.<br><br>
          Freshkite HR Team
        </p>`
      );

      // Send to each recipient individually to avoid exposing all emails
      for (const email of recipients) {
        await sendEmail(email, subject, body);
      }

    } else {
      return new Response(JSON.stringify({ error: "Unknown email type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
