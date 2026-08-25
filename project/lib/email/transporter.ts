import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const FROM_EMAIL = 'Freshkite HR <hr@freshkite.net>';

export async function verifyTransporter(): Promise<void> {
  await transporter.verify();
  console.log('[email] SMTP connection verified ✓');
}
