import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "Freshkite HR <noreply@freshkite.net>";

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
  }
}

function formatDateDisplay(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-MU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type } = payload;

    if (type === "new_request") {
      const { adminEmails, employeeName, employeeDept, leaveType, startDate, endDate, workingDays, reason } = payload;

      const subject = `New Leave Request — ${employeeName} (${leaveType}, ${workingDays} day${workingDays !== 1 ? "s" : ""})`;
      const html = `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px; border-radius: 12px;">
          <div style="background: linear-gradient(135deg, #1D9E75, #0f7a5a); padding: 24px; border-radius: 8px; margin-bottom: 24px;">
            <h1 style="color: white; margin: 0; font-size: 20px;">New Leave Request</h1>
            <p style="color: #a7f3d0; margin: 4px 0 0; font-size: 14px;">Freshkite HR · Leave Management</p>
          </div>

          <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 16px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 140px;">Employee</td><td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${employeeName}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Department</td><td style="padding: 8px 0; font-size: 14px;">${employeeDept}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Leave Type</td><td style="padding: 8px 0;"><span style="background: #d1fae5; color: #065f46; padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 500;">${leaveType}</span></td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Start Date</td><td style="padding: 8px 0; font-size: 14px;">${formatDateDisplay(startDate)}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">End Date</td><td style="padding: 8px 0; font-size: 14px;">${formatDateDisplay(endDate)}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Working Days</td><td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${workingDays} day${workingDays !== 1 ? "s" : ""}</td></tr>
              ${reason ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Reason</td><td style="padding: 8px 0; font-size: 14px;">${reason}</td></tr>` : ""}
            </table>
          </div>

          <p style="font-size: 13px; color: #9ca3af; text-align: center;">Please log in to Freshkite HR to approve or reject this request.</p>
        </div>
      `;

      await sendEmail(adminEmails, subject, html);
    } else if (type === "status_update") {
      const { employeeEmail, employeeName, leaveType, startDate, endDate, workingDays, status, adminComment } = payload;

      const isApproved = status === "Approved";
      const subject = isApproved
        ? "Your Leave Request Has Been Approved"
        : "Your Leave Request Was Not Approved";

      const html = `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px; border-radius: 12px;">
          <div style="background: ${isApproved ? "linear-gradient(135deg, #1D9E75, #0f7a5a)" : "linear-gradient(135deg, #ef4444, #dc2626)"}; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
            <h1 style="color: white; margin: 0; font-size: 20px;">${isApproved ? "Leave Approved" : "Leave Not Approved"}</h1>
            <p style="color: ${isApproved ? "#a7f3d0" : "#fecaca"}; margin: 4px 0 0; font-size: 14px;">Freshkite HR · Leave Management</p>
          </div>

          <p style="font-size: 15px; color: #374151; margin-bottom: 20px;">
            Hi <strong>${employeeName}</strong>,<br><br>
            ${isApproved
              ? `Your <strong>${leaveType}</strong> leave request has been <strong>approved</strong>. Enjoy your time off!`
              : `Unfortunately, your <strong>${leaveType}</strong> leave request has not been approved at this time.`}
          </p>

          <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb; margin-bottom: 16px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 140px;">Leave Type</td><td style="padding: 8px 0;"><span style="background: #d1fae5; color: #065f46; padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 500;">${leaveType}</span></td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Start Date</td><td style="padding: 8px 0; font-size: 14px;">${formatDateDisplay(startDate)}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">End Date</td><td style="padding: 8px 0; font-size: 14px;">${formatDateDisplay(endDate)}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Working Days</td><td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${workingDays} day${workingDays !== 1 ? "s" : ""}</td></tr>
              ${adminComment ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Note from Admin</td><td style="padding: 8px 0; font-size: 14px; font-style: italic; color: #374151;">"${adminComment}"</td></tr>` : ""}
            </table>
          </div>

          <p style="font-size: 13px; color: #9ca3af; text-align: center;">Log in to Freshkite HR to view your leave history.</p>
        </div>
      `;

      await sendEmail(employeeEmail, subject, html);
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
