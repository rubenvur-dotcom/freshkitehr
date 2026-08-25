import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  supabase, Announcement, AnnouncementPriority,
  AnnouncementReaction, AnnouncementComment, AnnouncementEmoji,
  AnnouncementPoll, AnnouncementPollOption, AnnouncementPollVote,
  AnnouncementAttachment, AnnouncementAcknowledgement,
  AnnouncementCommentReaction, CommentReactionEmoji,
} from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import {
  Pin, ChevronDown, ChevronUp, MessageSquare, Send, Trash2,
  Calendar, Paperclip, CircleCheck as CheckCircle2,
  ChartBar as BarChart2, Download, X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnnouncementWithProfile = Announcement & { profiles?: { full_name: string } };

type MentionProfile = { id: string; full_name: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOJI_SET: { key: AnnouncementEmoji; symbol: string; label: string }[] = [
  { key: 'like', symbol: '👍', label: 'Like' },
  { key: 'love', symbol: '❤️', label: 'Love' },
  { key: 'celebrate', symbol: '🎉', label: 'Celebrate' },
  { key: 'applaud', symbol: '👏', label: 'Applaud' },
  { key: 'happy', symbol: '😄', label: 'Happy' },
  { key: 'sad', symbol: '😢', label: 'Sad' },
];

const COMMENT_EMOJI_SET: { key: CommentReactionEmoji; symbol: string }[] = [
  { key: 'like', symbol: '👍' },
  { key: 'love', symbol: '❤️' },
  { key: 'happy', symbol: '😄' },
];

const PRIORITY_STYLES: Record<AnnouncementPriority, { badge: string; label: string; bar: string }> = {
  normal: { badge: 'bg-gray-100 text-gray-600', label: 'Normal', bar: '#0D9488' },
  important: { badge: 'bg-[#FEF3C7] text-[#92400E]', label: 'Important', bar: '#F5A623' },
  urgent: { badge: 'bg-[#FEE2E2] text-[#991B1B]', label: 'Urgent', bar: '#E24B4A' },
};

const PRIORITY_WEIGHT: Record<AnnouncementPriority, number> = { urgent: 0, important: 1, normal: 2 };

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Everyone',
  admin: 'Admins only',
  employee: 'Employees only',
};

const FILE_TYPE_COLORS: Record<string, string> = {
  'application/pdf': 'text-red-600 bg-red-50',
  'image/png': 'text-blue-600 bg-blue-50',
  'image/jpeg': 'text-blue-600 bg-blue-50',
  'application/vnd.ms-excel': 'text-emerald-600 bg-emerald-50',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'text-emerald-600 bg-emerald-50',
};

const FILE_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDisplayDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-MU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDisplayDate(ts);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function isExpired(a: Announcement): boolean {
  return !!a.expires_at && new Date(a.expires_at) < new Date();
}

// ─── Reaction helpers ──────────────────────────────────────────────────────────

type ReactionMap = Record<AnnouncementEmoji, { count: number; reacted: boolean }>;

function buildReactionMap(reactions: AnnouncementReaction[], userId: string): ReactionMap {
  const map = {} as ReactionMap;
  for (const e of EMOJI_SET) {
    const rows = reactions.filter((r) => r.emoji === e.key);
    map[e.key] = { count: rows.length, reacted: rows.some((r) => r.user_id === userId) };
  }
  return map;
}

type CommentReactionMap = Record<CommentReactionEmoji, { count: number; reacted: boolean }>;

function buildCommentReactionMap(
  allReactions: AnnouncementCommentReaction[],
  commentId: string,
  userId: string,
): CommentReactionMap {
  const map = {} as CommentReactionMap;
  for (const e of COMMENT_EMOJI_SET) {
    const rows = allReactions.filter((r) => r.comment_id === commentId && r.emoji === e.key);
    map[e.key] = { count: rows.length, reacted: rows.some((r) => r.user_id === userId) };
  }
  return map;
}

// ─── Comment tree ──────────────────────────────────────────────────────────────

interface CommentWithReplies extends AnnouncementComment {
  replies: AnnouncementComment[];
}

function buildCommentTree(comments: AnnouncementComment[]): CommentWithReplies[] {
  const map = new Map<string, CommentWithReplies>();
  const roots: CommentWithReplies[] = [];
  for (const c of comments) map.set(c.id, { ...c, replies: [] });
  for (const c of comments) {
    if (c.parent_comment_id && map.has(c.parent_comment_id)) {
      map.get(c.parent_comment_id)!.replies.push(c);
    } else {
      roots.push(map.get(c.id)!);
    }
  }
  return roots;
}

// ─── @mention helpers ─────────────────────────────────────────────────────────

function extractMentionedUserIds(text: string, profiles: MentionProfile[]): string[] {
  return profiles.filter((p) => text.includes(`@${p.full_name}`)).map((p) => p.id);
}

function renderMentionText(text: string, profiles: MentionProfile[]): React.ReactNode[] {
  if (!profiles.length) return [text];
  const escaped = profiles.map((p) => p.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(@(?:${escaped.join('|')}))`, 'g');
  const result: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) result.push(text.slice(last, match.index));
    result.push(
      <span
        key={match.index}
        className="inline-flex items-center bg-[#CCFBF1] text-[#0D9488] text-xs font-semibold rounded-full px-1.5 mx-0.5 leading-5"
      >
        {match[0]}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) result.push(text.slice(last));
  return result;
}

// ─── MentionInput ─────────────────────────────────────────────────────────────

interface MentionInputProps {
  value: string;
  onChange: (v: string) => void;
  profiles: MentionProfile[];
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  className?: string;
}

const MentionInput: React.FC<MentionInputProps> = ({
  value, onChange, profiles, placeholder, onKeyDown, inputRef: externalRef, className,
}) => {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = externalRef ?? localRef;

  const [mentionState, setMentionState] = useState<{ query: string; start: number } | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filteredProfiles = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query.toLowerCase();
    return profiles.filter((p) => p.full_name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionState, profiles]);

  const detectMention = (val: string, cursor: number): { query: string; start: number } | null => {
    const before = val.slice(0, cursor);
    // Match @ followed by up to 40 chars (allowing spaces for full names) — no other @
    const match = before.match(/@([^@\n]{0,40})$/);
    if (!match) return null;
    return { query: match[1], start: before.length - match[0].length };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    onChange(newVal);
    const cursor = e.target.selectionStart ?? newVal.length;
    const detected = detectMention(newVal, cursor);
    if (detected && profiles.some((p) => p.full_name.toLowerCase().includes(detected.query.toLowerCase()))) {
      setMentionState(detected);
      setSelectedIdx(0);
    } else {
      setMentionState(null);
    }
  };

  const insertMention = (profile: MentionProfile) => {
    if (!mentionState) return;
    const cursor = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, mentionState.start);
    const after = value.slice(cursor);
    const inserted = `${before}@${profile.full_name} ${after}`;
    onChange(inserted);
    setMentionState(null);
    setTimeout(() => {
      if (ref.current) {
        const pos = mentionState.start + profile.full_name.length + 2;
        ref.current.focus();
        ref.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionState && filteredProfiles.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filteredProfiles.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); insertMention(filteredProfiles[selectedIdx]); return; }
      if (e.key === 'Escape') { setMentionState(null); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setMentionState(null), 150)}
        placeholder={placeholder}
        className={cn('w-full', className)}
      />
      {mentionState && filteredProfiles.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1.5 w-64 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          <div className="p-1.5 max-h-52 overflow-y-auto">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-2 pt-1 pb-1.5">
              Mention someone
            </p>
            {filteredProfiles.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(p); }}
                className={cn(
                  'w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                  i === selectedIdx ? 'bg-[#CCFBF1] text-[#0D9488]' : 'hover:bg-gray-50 text-gray-700',
                )}
              >
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-gray-500">
                  {p.full_name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium truncate">{p.full_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Poll block ────────────────────────────────────────────────────────────────

const PollBlock: React.FC<{ announcementId: string; currentUserId: string }> = ({ announcementId, currentUserId }) => {
  const [poll, setPoll] = useState<AnnouncementPoll | null>(null);
  const [options, setOptions] = useState<AnnouncementPollOption[]>([]);
  const [votes, setVotes] = useState<AnnouncementPollVote[]>([]);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    supabase
      .from('announcement_polls')
      .select('*')
      .eq('announcement_id', announcementId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const p = data as AnnouncementPoll;
        setPoll(p);
        supabase.from('announcement_poll_options').select('*').eq('poll_id', p.id).order('display_order')
          .then(({ data: opts }) => { if (opts) setOptions(opts as AnnouncementPollOption[]); });
        supabase.from('announcement_poll_votes').select('*').eq('poll_id', p.id)
          .then(({ data: vs }) => {
            if (vs) {
              setVotes(vs as AnnouncementPollVote[]);
              const mine = (vs as AnnouncementPollVote[]).find((v) => v.user_id === currentUserId);
              if (mine) setMyVote(mine.option_id);
            }
          });
      });
  }, [announcementId, currentUserId]);

  if (!poll) return null;

  const totalVotes = votes.length;
  const hasVoted = !!myVote;

  const castVote = async (optionId: string) => {
    if (hasVoted || voting || !currentUserId) return;
    setVoting(true);
    const { error } = await supabase.from('announcement_poll_votes')
      .insert({ poll_id: poll.id, option_id: optionId, user_id: currentUserId });
    if (!error) {
      setMyVote(optionId);
      setVotes((prev) => [...prev, {
        id: `temp-${Date.now()}`, poll_id: poll.id,
        option_id: optionId, user_id: currentUserId, voted_at: new Date().toISOString(),
      }]);
    }
    setVoting(false);
  };

  return (
    <div className="mt-4 pt-3 border-t border-gray-50">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-3.5 h-3.5 text-[#0D9488]" />
        <p className="text-xs font-semibold text-gray-700">{poll.question}</p>
        {poll.is_anonymous && (
          <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Anonymous</span>
        )}
      </div>
      <div className="space-y-2">
        {options.map((opt) => {
          const optVotes = votes.filter((v) => v.option_id === opt.id).length;
          const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
          const isChosen = myVote === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => castVote(opt.id)}
              disabled={hasVoted || voting}
              className={cn(
                'w-full text-left rounded-lg border overflow-hidden transition-all',
                hasVoted
                  ? isChosen ? 'border-[#0D9488] cursor-default' : 'border-gray-100 cursor-default'
                  : 'border-gray-200 hover:border-[#0D9488]/40 hover:bg-[#0D9488]/5 cursor-pointer'
              )}
            >
              <div className="relative px-3 py-2">
                {hasVoted && (
                  <div
                    className={cn('absolute inset-0 transition-all', isChosen ? 'bg-[#CCFBF1]' : 'bg-gray-100/60')}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                )}
                <div className="relative flex items-center justify-between gap-2">
                  <span className={cn('text-xs font-medium', isChosen ? 'text-[#0D9488]' : 'text-gray-700')}>{opt.option_text}</span>
                  {hasVoted && (
                    <span className={cn('text-xs font-bold tabular-nums flex-shrink-0', isChosen ? 'text-[#0D9488]' : 'text-gray-400')}>
                      {pct}%
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {totalVotes > 0 && (
        <p className="text-[10px] text-gray-400 mt-2">
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''} · {hasVoted ? 'Your vote is recorded' : 'Cast your vote'}
        </p>
      )}
    </div>
  );
};

// ─── Attachments block ─────────────────────────────────────────────────────────

const AttachmentsBlock: React.FC<{ announcementId: string }> = ({ announcementId }) => {
  const [attachments, setAttachments] = useState<AnnouncementAttachment[]>([]);

  useEffect(() => {
    supabase.from('announcement_attachments').select('*').eq('announcement_id', announcementId).order('created_at')
      .then(({ data }) => { if (data) setAttachments(data as AnnouncementAttachment[]); });
  }, [announcementId]);

  if (attachments.length === 0) return null;

  const downloadFile = async (att: AnnouncementAttachment) => {
    const { data } = await supabase.storage.from('announcement-attachments').createSignedUrl(att.storage_path, 60);
    if (data?.signedUrl) {
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = att.file_name;
      a.click();
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-gray-50">
      <div className="flex items-center gap-2 mb-2.5">
        <Paperclip className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-semibold text-gray-500">
          {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => {
          const colorClass = FILE_TYPE_COLORS[att.file_type] ?? 'text-gray-600 bg-gray-50';
          const typeLabel = FILE_TYPE_LABELS[att.file_type] ?? 'FILE';
          return (
            <button
              key={att.id}
              onClick={() => downloadFile(att)}
              title={`Download ${att.file_name}`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors group"
            >
              <span className={cn('text-[10px] font-bold px-1 py-0.5 rounded', colorClass)}>{typeLabel}</span>
              <span className="text-xs font-medium text-gray-600 max-w-[120px] truncate">{att.file_name}</span>
              <span className="text-[10px] text-gray-400">{formatBytes(att.file_size)}</span>
              <Download className="w-3 h-3 text-gray-300 group-hover:text-[#0D9488] transition-colors flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Acknowledgement block ─────────────────────────────────────────────────────

const AcknowledgementBlock: React.FC<{
  announcementId: string;
  isAdmin: boolean;
  currentUserId: string;
}> = ({ announcementId, isAdmin, currentUserId }) => {
  const [acks, setAcks] = useState<AnnouncementAcknowledgement[]>([]);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    supabase.from('announcement_acknowledgements').select('*').eq('announcement_id', announcementId)
      .then(({ data }) => { if (data) setAcks(data as AnnouncementAcknowledgement[]); });
  }, [announcementId]);

  const myAck = acks.find((a) => a.user_id === currentUserId);

  const acknowledge = async () => {
    if (myAck || acknowledging || !currentUserId) return;
    setAcknowledging(true);
    const { data: inserted } = await supabase
      .from('announcement_acknowledgements')
      .insert({ announcement_id: announcementId, user_id: currentUserId })
      .select('*').single();
    if (inserted) setAcks((prev) => [...prev, inserted as AnnouncementAcknowledgement]);
    setAcknowledging(false);
  };

  return (
    <div className="mt-4 pt-3 border-t border-gray-50">
      {!isAdmin && !myAck && (
        <button
          onClick={acknowledge}
          disabled={acknowledging}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 text-blue-700 text-sm font-semibold transition-all disabled:opacity-60"
        >
          <CheckCircle2 className="w-4 h-4" />
          {acknowledging ? 'Confirming...' : 'Mark as Read & Understood'}
        </button>
      )}
      {!isAdmin && myAck && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-xs font-medium text-emerald-700">
            Acknowledged on {formatDisplayDate(myAck.acknowledged_at)}
          </p>
        </div>
      )}
      {isAdmin && (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-emerald-600">{acks.length}</span>{' '}
            employee{acks.length !== 1 ? 's' : ''} acknowledged
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Comment reaction bar ──────────────────────────────────────────────────────
// Empty picker buttons are hidden until parent CommentRow (.group) is hovered.
// Buttons with count > 0 are always visible.

interface CommentReactionBarProps {
  commentId: string;
  currentUserId: string;
  allReactions: AnnouncementCommentReaction[];
  onOptimisticAdd: (r: AnnouncementCommentReaction) => void;
  onOptimisticRemove: (commentId: string, userId: string, emoji: CommentReactionEmoji) => void;
}

const CommentReactionBar: React.FC<CommentReactionBarProps> = ({
  commentId, currentUserId, allReactions, onOptimisticAdd, onOptimisticRemove,
}) => {
  const reactionMap = buildCommentReactionMap(allReactions, commentId, currentUserId);

  const toggle = async (emoji: CommentReactionEmoji) => {
    if (!currentUserId) return;
    if (reactionMap[emoji].reacted) {
      onOptimisticRemove(commentId, currentUserId, emoji);
      await supabase.from('announcement_comment_reactions')
        .delete().eq('comment_id', commentId).eq('user_id', currentUserId).eq('emoji', emoji);
    } else {
      onOptimisticAdd({
        id: `temp-${Date.now()}`, comment_id: commentId,
        user_id: currentUserId, emoji, created_at: new Date().toISOString(),
      });
      await supabase.from('announcement_comment_reactions')
        .insert({ comment_id: commentId, user_id: currentUserId, emoji });
    }
  };

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {COMMENT_EMOJI_SET.map(({ key, symbol }) => {
        const { count, reacted } = reactionMap[key];
        // Hidden when empty, revealed on parent group hover; always shown when count > 0 or reacted
        const alwaysVisible = count > 0 || reacted;
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={cn(
              'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-all border',
              !alwaysVisible && 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto',
              reacted
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : count > 0
                  ? 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                  : 'bg-transparent border-transparent text-gray-400 hover:bg-gray-50 hover:border-gray-200',
            )}
          >
            <span className="text-xs leading-none">{symbol}</span>
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
};

// ─── Comment row ──────────────────────────────────────────────────────────────

interface CommentRowProps {
  comment: AnnouncementComment;
  replies?: AnnouncementComment[];
  isAdmin: boolean;
  currentUserId: string;
  allCommentReactions: AnnouncementCommentReaction[];
  mentionProfiles: MentionProfile[];
  onDelete: (id: string) => void;
  onReply: (comment: AnnouncementComment) => void;
  onOptimisticAddReaction: (r: AnnouncementCommentReaction) => void;
  onOptimisticRemoveReaction: (commentId: string, userId: string, emoji: CommentReactionEmoji) => void;
}

const CommentRow: React.FC<CommentRowProps> = ({
  comment, replies = [], isAdmin, currentUserId, allCommentReactions, mentionProfiles,
  onDelete, onReply, onOptimisticAddReaction, onOptimisticRemoveReaction,
}) => {
  const canDelete = isAdmin || comment.author_id === currentUserId;

  return (
    <div className="flex gap-2.5 group">
      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-gray-500 mt-0.5">
        {(comment.profiles?.full_name ?? '?').charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        {/* Header line */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-900">{comment.profiles?.full_name ?? 'Unknown'}</span>
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
            comment.profiles?.role === 'admin'
              ? 'bg-[#CCFBF1] text-[#0D9488]'
              : 'bg-gray-100 text-gray-500'
          )}>
            {comment.profiles?.role === 'admin' ? 'Admin' : 'Employee'}
          </span>
          <span className="text-[10px] text-gray-400">{formatRelative(comment.created_at)}</span>
          {/* Reply button — always visible */}
          <button
            onClick={() => onReply(comment)}
            className="text-[10px] font-medium text-gray-400 hover:text-[#0D9488] transition-colors"
          >
            Reply
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-300 hover:text-red-500"
              title="Delete comment"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Body with @mention highlights */}
        <p className="text-sm text-gray-700 mt-0.5 leading-relaxed break-words">
          {renderMentionText(comment.body, mentionProfiles)}
        </p>

        {/* Per-comment reactions */}
        <CommentReactionBar
          commentId={comment.id}
          currentUserId={currentUserId}
          allReactions={allCommentReactions}
          onOptimisticAdd={onOptimisticAddReaction}
          onOptimisticRemove={onOptimisticRemoveReaction}
        />

        {/* Threaded replies */}
        {replies.length > 0 && (
          <div className="mt-2 space-y-2.5 pl-4 border-l-2 border-gray-100">
            {replies.map((reply) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                allCommentReactions={allCommentReactions}
                mentionProfiles={mentionProfiles}
                onDelete={onDelete}
                onReply={onReply}
                onOptimisticAddReaction={onOptimisticAddReaction}
                onOptimisticRemoveReaction={onOptimisticRemoveReaction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Announcement card ────────────────────────────────────────────────────────

interface AnnouncementCardProps {
  announcement: AnnouncementWithProfile;
  isAdmin: boolean;
  currentUserId: string;
  hasUnseenComments: boolean;
  onCommentExpand: (id: string) => void;
  mentionProfiles: MentionProfile[];
  onEdit?: (a: AnnouncementWithProfile) => void;
  onDelete?: (a: AnnouncementWithProfile) => void;
}

const AnnouncementCard: React.FC<AnnouncementCardProps> = ({
  announcement: a,
  isAdmin,
  currentUserId,
  hasUnseenComments,
  onCommentExpand,
  mentionProfiles,
  onEdit,
  onDelete,
}) => {
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [comments, setComments] = useState<AnnouncementComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [reactions, setReactions] = useState<AnnouncementReaction[]>([]);
  const [commentReactions, setCommentReactions] = useState<AnnouncementCommentReaction[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<AnnouncementComment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const exp = isExpired(a);
  const pStyle = PRIORITY_STYLES[a.priority];

  // Announcement reactions
  useEffect(() => {
    supabase.from('announcement_reactions').select('*').eq('announcement_id', a.id)
      .then(({ data }) => { if (data) setReactions(data as AnnouncementReaction[]); });
  }, [a.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${a.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'announcement_reactions',
        filter: `announcement_id=eq.${a.id}`,
      }, () => {
        supabase.from('announcement_reactions').select('*').eq('announcement_id', a.id)
          .then(({ data }) => { if (data) setReactions(data as AnnouncementReaction[]); });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [a.id]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    const { data: commentRows } = await supabase
      .from('announcement_comments')
      .select('*, profiles!author_id(full_name, role)')
      .eq('announcement_id', a.id)
      .order('created_at', { ascending: true });
    if (commentRows) {
      setComments(commentRows as AnnouncementComment[]);
      const ids = (commentRows as AnnouncementComment[]).map((c) => c.id);
      if (ids.length > 0) {
        const { data: cReactions } = await supabase
          .from('announcement_comment_reactions').select('*').in('comment_id', ids);
        if (cReactions) setCommentReactions(cReactions as AnnouncementCommentReaction[]);
      } else {
        setCommentReactions([]);
      }
    }
    setCommentsLoading(false);
  }, [a.id]);

  // Load comments & mark as seen on mount
  useEffect(() => {
    loadComments();
    if (currentUserId) {
      supabase.from('announcement_comment_seen').upsert(
        { user_id: currentUserId, announcement_id: a.id, last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id,announcement_id' }
      );
      onCommentExpand(a.id);
    }
  }, [loadComments, a.id, currentUserId, onCommentExpand]);

  // Real-time new comments
  useEffect(() => {
    if (!commentsOpen) return;
    const channel = supabase
      .channel(`comments-${a.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'announcement_comments',
        filter: `announcement_id=eq.${a.id}`,
      }, () => { loadComments(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [a.id, commentsOpen, loadComments]);

  const toggleComments = async () => {
    if (!commentsOpen) {
      setCommentsOpen(true);
      await loadComments();
      await supabase.from('announcement_comment_seen').upsert(
        { user_id: currentUserId, announcement_id: a.id, last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id,announcement_id' }
      );
      onCommentExpand(a.id);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setCommentsOpen(false);
      setReplyingTo(null);
    }
  };

  const toggleReaction = async (emoji: AnnouncementEmoji) => {
    const map = buildReactionMap(reactions, currentUserId);
    if (map[emoji].reacted) {
      setReactions((prev) => prev.filter((r) => !(r.user_id === currentUserId && r.emoji === emoji)));
      await supabase.from('announcement_reactions')
        .delete().eq('announcement_id', a.id).eq('user_id', currentUserId).eq('emoji', emoji);
    } else {
      const optimistic: AnnouncementReaction = {
        id: `temp-${Date.now()}`, announcement_id: a.id,
        user_id: currentUserId, emoji, created_at: new Date().toISOString(),
      };
      setReactions((prev) => [...prev, optimistic]);
      await supabase.from('announcement_reactions')
        .insert({ announcement_id: a.id, user_id: currentUserId, emoji });
    }
  };

  const submitComment = async () => {
    const body = commentDraft.trim();
    if (!body || submitting) return;
    setSubmitting(true);

    const parentId = replyingTo?.id ?? null;

    const { data: inserted, error } = await supabase
      .from('announcement_comments')
      .insert({ announcement_id: a.id, author_id: currentUserId, body, parent_comment_id: parentId })
      .select('*, profiles!author_id(full_name, role)')
      .single();

    if (!error && inserted) {
      setComments((prev) => [...prev, inserted as AnnouncementComment]);

      // Build notification recipient set
      const notifyIds = new Set<string>();
      const mentionedIds = extractMentionedUserIds(body, mentionProfiles);

      // @mention notifications (any comment type)
      mentionedIds.forEach((id) => { if (id !== currentUserId) notifyIds.add(id); });

      // Reply notifications — parent author + announcement author
      if (parentId && replyingTo) {
        if (replyingTo.author_id !== currentUserId) notifyIds.add(replyingTo.author_id);
        if (a.author_id !== currentUserId) notifyIds.add(a.author_id);
      }

      if (notifyIds.size > 0) {
        const { data: senderProfile } = await supabase
          .from('profiles').select('full_name').eq('id', currentUserId).maybeSingle();
        const senderName = (senderProfile as { full_name: string } | null)?.full_name ?? 'Someone';
        const mentionedSet = new Set(mentionedIds.filter((id) => id !== currentUserId));

        await supabase.from('notifications').insert(
          [...notifyIds].map((rid) => ({
            recipient_id: rid,
            type: mentionedSet.has(rid) ? 'comment_mention' : 'comment_reply',
            title: mentionedSet.has(rid)
              ? `${senderName} mentioned you in "${a.title}"`
              : `New reply on "${a.title}"`,
            body: `${senderName}: ${body.slice(0, 100)}${body.length > 100 ? '…' : ''}`,
            is_read: false,
            related_type: 'announcement',
            related_id: a.id,
          }))
        );
      }
    }

    setCommentDraft('');
    setReplyingTo(null);
    setSubmitting(false);
  };

  const deleteComment = async (commentId: string) => {
    await supabase.from('announcement_comments').delete().eq('id', commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const handleReply = (comment: AnnouncementComment) => {
    setReplyingTo(comment);
    setCommentDraft('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const optimisticAddCommentReaction = (r: AnnouncementCommentReaction) => {
    setCommentReactions((prev) => [...prev, r]);
  };

  const optimisticRemoveCommentReaction = (commentId: string, userId: string, emoji: CommentReactionEmoji) => {
    setCommentReactions((prev) =>
      prev.filter((r) => !(r.comment_id === commentId && r.user_id === userId && r.emoji === emoji))
    );
  };

  const reactionMap = buildReactionMap(reactions, currentUserId);
  const totalReactions = reactions.length;
  const commentTree = buildCommentTree(comments);
  const audienceLabel = a.target_department
    ? a.target_department
    : AUDIENCE_LABELS[a.target_audience] ?? a.target_audience;

  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-[#E5E7EB] overflow-hidden transition-opacity',
        exp && !isAdmin ? 'hidden' : '',
        exp && isAdmin ? 'opacity-60' : '',
        a.is_pinned ? 'border-t-2' : '',
      )}
      style={a.is_pinned ? { borderTopColor: '#0D9488' } : {}}
    >
      <div className="flex">
        <div className="w-1 flex-shrink-0 rounded-l-xl" style={{ backgroundColor: pStyle.bar }} />

        <div className="flex-1 p-5 min-w-0">
          {/* Header badges + admin controls */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pStyle.badge}`}>
                {pStyle.label}
              </span>
              {a.is_pinned && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[#0D9488]">
                  <Pin className="w-3 h-3 fill-[#0D9488]" />
                  Pinned
                </span>
              )}
              {a.requires_acknowledgement && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Requires acknowledgement
                </span>
              )}
              {exp && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                  Expired
                </span>
              )}
            </div>

            {isAdmin && (onEdit || onDelete) && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {onEdit && (
                  <Button size="sm" variant="ghost" onClick={() => onEdit(a)}
                    className="h-7 px-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50" title="Edit">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </Button>
                )}
                {onDelete && (
                  <Button size="sm" variant="ghost" onClick={() => onDelete(a)}
                    className="h-7 px-2 text-red-600 hover:text-red-600 hover:bg-red-50" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="font-semibold text-[15px] text-gray-900 mt-2">{a.title}</h3>

          {/* Body */}
          <div className="mt-1.5">
            <p className={cn('text-sm text-gray-600 leading-relaxed', !bodyExpanded && 'line-clamp-2')}>{a.body}</p>
            {a.body.length > 120 && (
              <button
                onClick={() => setBodyExpanded((v) => !v)}
                className="mt-1 text-xs font-medium text-[#0D9488] hover:text-[#7b35d9] flex items-center gap-1 transition-colors"
              >
                {bodyExpanded
                  ? <><ChevronUp className="w-3 h-3" />Show less</>
                  : <><ChevronDown className="w-3 h-3" />Read more</>}
              </button>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <p className="text-xs text-gray-400">
              Posted by <span className="font-medium text-gray-500">{a.profiles?.full_name ?? 'HR Team'}</span>
              {' · '}{formatDisplayDate(a.created_at)}
              {isAdmin && <>{' · '}<span className="font-medium text-gray-500">{audienceLabel}</span></>}
            </p>
            {a.expires_at && !exp && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                <Calendar className="w-3 h-3" />
                Expires {formatDisplayDate(a.expires_at)}
              </span>
            )}
          </div>

          <PollBlock announcementId={a.id} currentUserId={currentUserId} />
          <AttachmentsBlock announcementId={a.id} />
          {a.requires_acknowledgement && (
            <AcknowledgementBlock announcementId={a.id} isAdmin={isAdmin} currentUserId={currentUserId} />
          )}

          {/* Announcement reactions */}
          <div className="mt-4 pt-3 border-t border-gray-50">
            <div className="flex items-center gap-1.5 flex-wrap">
              {EMOJI_SET.map(({ key, symbol, label }) => {
                const { count, reacted } = reactionMap[key];
                return (
                  <button
                    key={key}
                    onClick={() => toggleReaction(key)}
                    title={label}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all border',
                      reacted
                        ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm scale-105'
                        : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100 hover:border-gray-200'
                    )}
                  >
                    <span className="text-base leading-none">{symbol}</span>
                    {count > 0 && <span className="tabular-nums">{count}</span>}
                  </button>
                );
              })}
              {totalReactions > 0 && (
                <span className="text-xs text-gray-400 ml-1">
                  {totalReactions} reaction{totalReactions !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Comments */}
          <div className="mt-3 pt-3 border-t border-gray-50">
            <button
              onClick={toggleComments}
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium transition-colors rounded-lg px-2 py-1 mb-3',
                commentsOpen
                  ? 'text-[#0D9488] bg-[#0D9488]/5'
                  : hasUnseenComments
                    ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {commentsOpen ? 'Hide comments' : 'Show comments'}
              {hasUnseenComments && !commentsOpen && <span className="w-2 h-2 rounded-full bg-blue-500 ml-0.5" />}
            </button>

            {commentsOpen && (
              <div className="space-y-4">
                {commentsLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="flex gap-3 animate-pulse">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-24 bg-gray-100 rounded" />
                          <div className="h-3 w-full bg-gray-100 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-gray-400 italic pl-1">No comments yet. Be the first to comment.</p>
                ) : (
                  <div className="space-y-3">
                    {commentTree.map((c) => (
                      <CommentRow
                        key={c.id}
                        comment={c}
                        replies={c.replies}
                        isAdmin={isAdmin}
                        currentUserId={currentUserId}
                        allCommentReactions={commentReactions}
                        mentionProfiles={mentionProfiles}
                        onDelete={deleteComment}
                        onReply={handleReply}
                        onOptimisticAddReaction={optimisticAddCommentReaction}
                        onOptimisticRemoveReaction={optimisticRemoveCommentReaction}
                      />
                    ))}
                  </div>
                )}

                {/* Reply context chip */}
                {replyingTo && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span className="text-xs text-blue-700 flex-1 min-w-0">
                      Replying to <span className="font-semibold">{replyingTo.profiles?.full_name ?? 'Unknown'}</span>
                    </span>
                    <button onClick={() => setReplyingTo(null)} className="text-blue-400 hover:text-blue-600 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Comment input with @mention support */}
                <div className="flex gap-2 items-center">
                  <MentionInput
                    inputRef={inputRef}
                    value={commentDraft}
                    onChange={(v) => setCommentDraft(v.slice(0, 500))}
                    profiles={mentionProfiles}
                    placeholder={replyingTo
                      ? `Reply to ${replyingTo.profiles?.full_name ?? 'comment'}… (@ to mention)`
                      : 'Write a comment… (@ to mention)'}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#CCFBF1] transition-colors placeholder:text-gray-400 bg-gray-50"
                  />
                  <button
                    onClick={submitComment}
                    disabled={!commentDraft.trim() || submitting}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#0D9488] text-white hover:bg-[#0F766E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  >
                    {submitting
                      ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Send className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {commentDraft.length > 400 && (
                  <p className="text-[10px] text-gray-400 text-right">{commentDraft.length}/500</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Feed ──────────────────────────────────────────────────────────────────────

interface AnnouncementsFeedProps {
  isAdmin: boolean;
  announcements: AnnouncementWithProfile[];
  loading: boolean;
  unseenCommentIds: Set<string>;
  onClearBlueBadge: (id: string) => void;
  onEdit?: (a: AnnouncementWithProfile) => void;
  onDelete?: (a: AnnouncementWithProfile) => void;
}

export const AnnouncementsFeed: React.FC<AnnouncementsFeedProps> = ({
  isAdmin, announcements, loading, unseenCommentIds, onClearBlueBadge, onEdit, onDelete,
}) => {
  const { profile } = useAuthStore();
  const [mentionProfiles, setMentionProfiles] = useState<MentionProfile[]>([]);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
      .then(({ data }) => { if (data) setMentionProfiles(data as MentionProfile[]); });
  }, []);

  const sorted = [...(announcements ?? [])].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (a.priority !== b.priority) return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-[#E5E7EB] p-5 animate-pulse space-y-3">
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-gray-100 rounded-full" />
              <div className="h-5 w-40 bg-gray-100 rounded" />
            </div>
            <div className="h-3 w-full bg-gray-100 rounded" />
            <div className="h-3 w-3/4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E7EB] py-16 text-center">
        <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-500">No announcements yet</p>
        <p className="text-xs text-gray-400 mt-1">
          {isAdmin ? 'Create your first announcement to notify the team.' : 'Check back later for updates from HR.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((a) => (
        <AnnouncementCard
          key={a.id}
          announcement={a}
          isAdmin={isAdmin}
          currentUserId={profile?.id ?? ''}
          hasUnseenComments={unseenCommentIds.has(a.id)}
          onCommentExpand={onClearBlueBadge}
          mentionProfiles={mentionProfiles}
          onEdit={isAdmin ? onEdit : undefined}
          onDelete={isAdmin ? onDelete : undefined}
        />
      ))}
    </div>
  );
};
