import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { verifyTransporter } from './transporter.js';
import { sendEmail } from './sendEmail.js';

import { leaveSubmittedEmployee } from './templates/leaveSubmittedEmployee.js';
import { leaveSubmittedAdmin }    from './templates/leaveSubmittedAdmin.js';
import { leaveApproved }          from './templates/leaveApproved.js';
import { leaveRejected }          from './templates/leaveRejected.js';
import { adminSubmittedEmployee } from './templates/adminSubmittedEmployee.js';
import { announcement }           from './templates/announcement.js';
import { permissionSubmittedEmployee } from './templates/permissionSubmittedEmployee.js';
import { permissionSubmittedAdmin }    from './templates/permissionSubmittedAdmin.js';
import { permissionApproved }          from './templates/permissionApproved.js';
import { permissionRejected }          from './templates/permissionRejected.js';

const app = express();
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Email dispatch ─────────────────────────────────────────────────────────────
app.post('/send', async (req, res) => {
  const { type, ...payload } = req.body as Record<string, any>;

  try {
    switch (type) {

      case 'new_request': {
        // Notify employee their request was received
        const employeeMail = leaveSubmittedEmployee({
          employee_name: payload.employee_name,
          leave_type:    payload.leave_type,
          start_date:    payload.start_date,
          end_date:      payload.end_date,
          working_days:  payload.working_days,
          reason:        payload.reason,
        });
        await sendEmail({ to: payload.employee_email, ...employeeMail });

        // Notify all admins
        if (payload.admin_emails?.length) {
          const adminMail = leaveSubmittedAdmin({
            employee_name:  payload.employee_name,
            employee_email: payload.employee_email,
            leave_type:     payload.leave_type,
            start_date:     payload.start_date,
            end_date:       payload.end_date,
            working_days:   payload.working_days,
            reason:         payload.reason,
          });
          await sendEmail({ to: payload.admin_emails, ...adminMail });
        }
        break;
      }

      case 'approved': {
        const mail = leaveApproved({
          employee_name: payload.employee_name,
          leave_type:    payload.leave_type,
          start_date:    payload.start_date,
          end_date:      payload.end_date,
          working_days:  payload.working_days,
          admin_comment: payload.admin_comment,
        });
        await sendEmail({ to: payload.employee_email, ...mail });
        break;
      }

      case 'rejected': {
        const mail = leaveRejected({
          employee_name: payload.employee_name,
          leave_type:    payload.leave_type,
          start_date:    payload.start_date,
          end_date:      payload.end_date,
          working_days:  payload.working_days,
          admin_comment: payload.admin_comment,
        });
        await sendEmail({ to: payload.employee_email, ...mail });
        break;
      }

      case 'admin_submitted': {
        const mail = adminSubmittedEmployee({
          employee_name: payload.employee_name,
          leave_type:    payload.leave_type,
          start_date:    payload.start_date,
          end_date:      payload.end_date,
          working_days:  payload.working_days,
          status:        payload.status ?? 'Approved',
          admin_note:    payload.admin_note,
        });
        await sendEmail({ to: payload.employee_email, ...mail });
        break;
      }

      case 'announcement': {
        if (!payload.recipients?.length) {
          return res.status(400).json({ error: 'recipients required' });
        }
        const mail = announcement({
          announcement_title: payload.announcement_title,
          announcement_body:  payload.announcement_body,
          priority:           payload.priority ?? 'normal',
          author_name:        payload.author_name,
          posted_at:          payload.posted_at,
          is_update:          payload.is_update,
        });
        // Send individually to avoid exposing recipient list
        for (const email of payload.recipients as string[]) {
          await sendEmail({ to: email, ...mail });
        }
        break;
      }

      case 'permission_submitted': {
        const employeeMail = permissionSubmittedEmployee({
          employee_name:  payload.employee_name,
          permission_date: payload.permission_date,
          start_time:     payload.start_time,
          end_time:       payload.end_time,
          duration_hours: payload.duration_hours,
          reason:         payload.reason,
        });
        await sendEmail({ to: payload.employee_email, ...employeeMail });

        if (payload.admin_emails?.length) {
          const adminMail = permissionSubmittedAdmin({
            employee_name:   payload.employee_name,
            employee_email:  payload.employee_email,
            permission_date: payload.permission_date,
            start_time:      payload.start_time,
            end_time:        payload.end_time,
            duration_hours:  payload.duration_hours,
            reason:          payload.reason,
          });
          await sendEmail({ to: payload.admin_emails, ...adminMail });
        }
        break;
      }

      case 'permission_approved': {
        const mail = permissionApproved({
          employee_name:   payload.employee_name,
          permission_date: payload.permission_date,
          start_time:      payload.start_time,
          end_time:        payload.end_time,
          duration_hours:  payload.duration_hours,
          admin_comment:   payload.admin_comment,
        });
        await sendEmail({ to: payload.employee_email, ...mail });
        break;
      }

      case 'permission_rejected': {
        const mail = permissionRejected({
          employee_name:   payload.employee_name,
          permission_date: payload.permission_date,
          start_time:      payload.start_time,
          end_time:        payload.end_time,
          duration_hours:  payload.duration_hours,
          admin_comment:   payload.admin_comment,
        });
        await sendEmail({ to: payload.employee_email, ...mail });
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown email type: ${type}` });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[email] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = Number(process.env.EMAIL_SERVER_PORT ?? 3457);

verifyTransporter()
  .then(() => {
    app.listen(PORT, () => console.log(`[email] Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[email] SMTP verification failed:', err.message);
    process.exit(1);
  });
