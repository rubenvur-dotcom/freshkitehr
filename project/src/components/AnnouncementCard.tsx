import React from 'react';
import { Announcement, AnnouncementPriority } from '../lib/supabase';
import { Pin } from 'lucide-react';

interface AnnouncementCardProps {
  announcement: Announcement & { profiles?: { full_name: string } };
  truncate?: boolean;
}

const BORDER_COLORS: Record<AnnouncementPriority, string> = {
  normal: '#00C49A',
  important: '#F5A623',
  urgent: '#E24B4A',
};

const PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
};

const PRIORITY_BADGE: Record<AnnouncementPriority, string> = {
  normal: 'bg-emerald-500/10 text-emerald-600',
  important: 'bg-[#FEF3C7] text-[#92400E] font-bold',
  urgent: 'bg-red-600 text-white font-bold px-2 py-0.5 rounded',
};

function formatDisplayDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-MU', { day: '2-digit', month: 'long', year: 'numeric' });
}

export const AnnouncementCard: React.FC<AnnouncementCardProps> = ({ announcement: a, truncate = false }) => {
  const borderColor = BORDER_COLORS[a.priority];

  const cardBg = a.priority === 'urgent' ? 'bg-red-50/40' : 'bg-white';
  const leftBorderClass = a.priority === 'urgent'
    ? 'border-l-4 border-l-red-600'
    : a.priority === 'important'
      ? 'border-l-4 border-l-amber-500'
      : '';

  return (
    <div
      className={[
        `${cardBg} rounded-xl border border-[#E5E7EB] overflow-hidden`,
        leftBorderClass,
        a.is_pinned ? 'border-t-2' : '',
      ].join(' ')}
      style={a.is_pinned ? { borderTopColor: '#0D9488' } : {}}
    >
      <div className="flex">
        {/* Left priority stripe — only shown for normal (no explicit left border class) */}
        {a.priority === 'normal' && (
          <div className="w-1 flex-shrink-0" style={{ backgroundColor: borderColor }} />
        )}

        <div className="flex-1 px-5 py-4">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[a.priority]}`}>
              {PRIORITY_LABELS[a.priority]}
            </span>
            {a.is_pinned && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[#0D9488]">
                <Pin className="w-3 h-3 fill-[#0D9488]" />
                Pinned
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="font-bold text-[15px] text-gray-900 leading-snug">{a.title}</h3>

          {/* Body */}
          <p className={['text-sm text-gray-600 mt-1.5 leading-relaxed', truncate ? 'line-clamp-3' : ''].join(' ')}>
            {a.body}
          </p>

          {/* Footer */}
          <p className="text-xs text-gray-400 mt-3">
            {formatDisplayDate(a.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
};
