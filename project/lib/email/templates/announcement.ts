import { baseTemplate, ctaButton, formatDate } from './base.js';

const APP_URL = process.env.APP_URL ?? 'https://hr.freshkite.io';

export interface AnnouncementParams {
  announcement_title: string;
  announcement_body: string;
  priority: 'normal' | 'important' | 'urgent';
  author_name: string;
  posted_at: string;
  is_update?: boolean;
}

function priorityBadge(priority: string): string {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    normal:    { bg: '#D1FAE5', color: '#065F46', label: 'Normal' },
    important: { bg: '#FEF3C7', color: '#92400E', label: 'Important' },
    urgent:    { bg: '#FEE2E2', color: '#991B1B', label: '⚠ URGENT' },
  };
  const s = map[priority] ?? map.normal;
  return `<span style="background:${s.bg};color:${s.color};padding:3px 12px;border-radius:999px;font-size:12px;font-weight:700;">${s.label}</span>`;
}

export function announcement(p: AnnouncementParams): { subject: string; html: string } {
  const priorityPrefix = p.is_update ? '(Updated) '
    : p.priority === 'urgent' ? 'URGENT: '
    : p.priority === 'important' ? 'Important: '
    : '';

  const accentColor = p.priority === 'urgent' ? '#EF4444'
    : p.priority === 'important' ? '#F59E0B'
    : '#7C3AED';

  const bodyHtml = p.announcement_body
    .split('\n')
    .map((line) => `<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">${line}</p>`)
    .join('');

  const body = `
    <div style="margin-bottom:16px;">${priorityBadge(p.priority)}</div>

    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;border-left:4px solid ${accentColor};padding-left:12px;">
      ${p.is_update ? `Updated: ${p.announcement_title}` : p.announcement_title}
    </h2>

    <div style="margin-bottom:24px;">${bodyHtml}</div>

    <p style="margin:0 0 20px;font-size:13px;color:#9CA3AF;border-top:1px solid #F3F4F6;padding-top:16px;">
      Posted by <strong style="color:#374151;">${p.author_name}</strong>
      · ${p.posted_at ? formatDate(p.posted_at) : 'Today'}
    </p>

    <p style="margin:0;">${ctaButton('View All Announcements', `${APP_URL}/employee/announcements`)}</p>`;

  return {
    subject: `[Freshkite HR] ${priorityPrefix}${p.announcement_title}`,
    html: baseTemplate(p.announcement_title, body),
  };
}
