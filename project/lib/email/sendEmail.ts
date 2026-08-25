import { transporter, FROM_EMAIL } from './transporter.js';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (process.env.SEND_EMAILS !== 'true') {
    console.log(`[email] SEND_EMAILS disabled — skipping: ${opts.subject}`);
    return;
  }

  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];

  for (const recipient of toList) {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: recipient,
      subject: opts.subject,
      html: opts.html,
    });
    console.log(`[email] Sent "${opts.subject}" → ${recipient}`);
  }
}
