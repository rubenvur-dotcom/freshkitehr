import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase, AnnouncementPriority } from '../../lib/supabase';
import { logAudit } from '../../lib/auditLog';
import { AnnouncementsFeed, AnnouncementWithProfile } from '../../components/AnnouncementsFeed';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { Megaphone, Pin, Plus, Mail, ChartBar as BarChart2, Paperclip, SquareCheck as CheckSquare, X, GripVertical, FileText, FileSpreadsheet } from 'lucide-react';
import { triggerAnnouncementEmail } from '../../lib/emailService';

interface OutletCtx {
  clearRedBadge: () => void;
  clearBlueBadge: (id: string) => void;
  unseenCommentIds: Set<string>;
  refreshBadges: () => void;
}

// ─── Poll draft ────────────────────────────────────────────────────────────────

interface PollDraft {
  question: string;
  options: string[];
  is_anonymous: boolean;
}

// ─── Staged file ───────────────────────────────────────────────────────────────

interface StagedFile {
  id: string;
  file: File;
  label: string;
}

const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.xlsx,.xls';
const FILE_MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
};

function fileLabel(file: File): string {
  return FILE_MIME_LABELS[file.type] ?? file.type.split('/')[1]?.toUpperCase() ?? 'FILE';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Audience options ──────────────────────────────────────────────────────────

const DEPARTMENTS = ['Management Department', 'Tech Department', 'General Department'];

// ─── Form schema ───────────────────────────────────────────────────────────────

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Max 100 characters'),
  body: z.string().min(1, 'Body is required').max(1000, 'Max 1000 characters'),
  priority: z.enum(['normal', 'important', 'urgent']),
  audience_value: z.string(),
  is_pinned: z.boolean(),
  requires_acknowledgement: z.boolean(),
  expires_at: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Component ─────────────────────────────────────────────────────────────────

export const AdminAnnouncementsPage: React.FC = () => {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const { clearRedBadge, clearBlueBadge, unseenCommentIds, refreshBadges } = useOutletContext<OutletCtx>();

  const [announcements, setAnnouncements] = useState<AnnouncementWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementWithProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementWithProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  // Poll state
  const [pollEnabled, setPollEnabled] = useState(false);
  const [poll, setPoll] = useState<PollDraft>({ question: '', options: ['', ''], is_anonymous: false });

  // Attachment state
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priority: 'normal',
      audience_value: 'all',
      is_pinned: false,
      requires_acknowledgement: false,
      expires_at: '',
    },
  });

  const bodyValue = watch('body') ?? '';

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('announcements')
      .select('*, profiles!author_id(full_name)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load announcements', description: error.message, variant: 'destructive' });
    } else {
      setAnnouncements((data ?? []) as AnnouncementWithProfile[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchAnnouncements();
    clearRedBadge();
    const channel = supabase
      .channel('admin-announcements-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        fetchAnnouncements();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAnnouncements, clearRedBadge]);

  // ─── Modal helpers ───────────────────────────────────────────────────────────

  const resetExtras = () => {
    setPollEnabled(false);
    setPoll({ question: '', options: ['', ''], is_anonymous: false });
    setStagedFiles([]);
  };

  const openCreate = () => {
    setEditing(null);
    setSendEmail(true);
    resetExtras();
    reset({ priority: 'normal', audience_value: 'all', is_pinned: false, requires_acknowledgement: false, expires_at: '' });
    setModalOpen(true);
  };

  const openEdit = (a: AnnouncementWithProfile) => {
    setEditing(a);
    setSendEmail(false);
    resetExtras();
    const audienceValue = a.target_department
      ? `dept_${a.target_department}`
      : a.target_audience;
    reset({
      title: a.title,
      body: a.body,
      priority: a.priority,
      audience_value: audienceValue,
      is_pinned: a.is_pinned,
      requires_acknowledgement: a.requires_acknowledgement,
      expires_at: a.expires_at ? a.expires_at.split('T')[0] : '',
    });
    setModalOpen(true);
  };

  // ─── Poll helpers ─────────────────────────────────────────────────────────────

  const addPollOption = () => {
    if (poll.options.length >= 5) return;
    setPoll((p) => ({ ...p, options: [...p.options, ''] }));
  };

  const removePollOption = (idx: number) => {
    if (poll.options.length <= 2) return;
    setPoll((p) => ({ ...p, options: p.options.filter((_, i) => i !== idx) }));
  };

  const setPollOption = (idx: number, val: string) => {
    setPoll((p) => {
      const opts = [...p.options];
      opts[idx] = val.slice(0, 150);
      return { ...p, options: opts };
    });
  };

  // ─── File helpers ─────────────────────────────────────────────────────────────

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const additions: StagedFile[] = [];
    for (const file of Array.from(fileList)) {
      if (stagedFiles.length + additions.length >= 10) break;
      additions.push({ id: `${Date.now()}-${Math.random()}`, file, label: fileLabel(file) });
    }
    setStagedFiles((prev) => [...prev, ...additions]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeStagedFile = (id: string) => setStagedFiles((prev) => prev.filter((f) => f.id !== id));

  // ─── Submit ───────────────────────────────────────────────────────────────────

  const onSubmit = async (data: FormValues) => {
    if (!profile) return;
    setSaving(true);

    let target_audience: 'all' | 'admin' | 'employee' = 'all';
    let target_department: string | null = null;

    if (data.audience_value === 'admin') {
      target_audience = 'admin';
    } else if (data.audience_value === 'employee') {
      target_audience = 'employee';
    } else if (data.audience_value.startsWith('dept_')) {
      target_audience = 'employee';
      target_department = data.audience_value.slice(5);
    }

    const payload = {
      title: data.title,
      body: data.body,
      priority: data.priority,
      target_audience,
      target_department,
      is_pinned: data.is_pinned,
      requires_acknowledgement: data.requires_acknowledgement,
      expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null,
      author_id: profile.id,
    };

    let announcementId: string | null = editing?.id ?? null;

    if (editing) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', editing.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('announcements')
        .insert(payload)
        .select('id')
        .single();
      if (error || !inserted) {
        toast({ title: 'Error', description: error?.message ?? 'Unknown error', variant: 'destructive' });
        setSaving(false);
        return;
      }
      announcementId = inserted.id;
    }

    if (!announcementId) { setSaving(false); return; }

    // Insert poll
    if (!editing && pollEnabled && poll.question.trim()) {
      const validOpts = poll.options.filter((o) => o.trim());
      if (validOpts.length >= 2) {
        const { data: pollRow } = await supabase
          .from('announcement_polls')
          .insert({ announcement_id: announcementId, question: poll.question.trim(), is_anonymous: poll.is_anonymous })
          .select('id')
          .single();
        if (pollRow) {
          await supabase.from('announcement_poll_options').insert(
            validOpts.map((text, i) => ({ poll_id: pollRow.id, option_text: text, display_order: i }))
          );
        }
      }
    }

    // Upload files
    for (const sf of stagedFiles) {
      const path = `${announcementId}/${Date.now()}_${sf.file.name}`;
      const { error: upErr } = await supabase.storage
        .from('announcement-attachments')
        .upload(path, sf.file);
      if (!upErr) {
        await supabase.from('announcement_attachments').insert({
          announcement_id: announcementId,
          file_name: sf.file.name,
          file_type: sf.file.type,
          file_size: sf.file.size,
          storage_path: path,
        });
      }
    }

    await logAudit(profile.id, profile.full_name,
      editing ? 'announcement_updated' : 'announcement_created',
      'announcement', announcementId ?? undefined);
    toast({ title: editing ? 'Announcement updated' : 'Announcement published' });
    setModalOpen(false);
    fetchAnnouncements();
    refreshBadges();

    // In-app notifications
    if (!editing) {
      let notifsQuery = supabase.from('profiles').select('id').eq('is_active', true);
      if (target_audience === 'admin') notifsQuery = notifsQuery.eq('role', 'admin');
      else if (target_audience === 'employee') {
        notifsQuery = notifsQuery.eq('role', 'employee');
        if (target_department) notifsQuery = notifsQuery.eq('department', target_department);
      }
      const { data: recipientProfiles } = await notifsQuery;
      if (recipientProfiles?.length) {
        await supabase.from('notifications').insert(
          recipientProfiles.map((r) => ({
            recipient_id: r.id,
            type: 'announcement',
            title: data.title,
            body: data.body.slice(0, 120) + (data.body.length > 120 ? '…' : ''),
            is_read: false,
          }))
        );
      }
    }

    // Email notification
    if (sendEmail) {
      let recipientQuery = supabase.from('profiles').select('email').eq('is_active', true);
      if (target_audience === 'admin') recipientQuery = recipientQuery.eq('role', 'admin');
      else if (target_audience === 'employee') {
        recipientQuery = recipientQuery.eq('role', 'employee');
        if (target_department) recipientQuery = recipientQuery.eq('department', target_department);
      }
      const { data: recipients } = await recipientQuery;
      if (recipients?.length) {
        const emailOk = await triggerAnnouncementEmail({
          recipients: recipients.map((r) => r.email),
          announcement_title: data.title,
          announcement_body: data.body,
          priority: data.priority,
          author_name: profile?.full_name ?? 'HR Team',
          posted_at: new Date().toISOString(),
          is_update: !!editing,
        });
        if (!emailOk) {
          toast({
            title: 'Email delivery issue',
            description: 'The announcement was saved but email notifications may not have been sent.',
          });
        }
      }
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('announcements').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (profile) await logAudit(profile.id, profile.full_name, 'announcement_deleted', 'announcement', deleteTarget.id);
      toast({ title: 'Announcement deleted' });
      fetchAnnouncements();
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '—' : `${announcements.length} announcement${announcements.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          New Announcement
        </Button>
      </div>

      <AnnouncementsFeed
        isAdmin
        announcements={announcements}
        loading={loading}
        unseenCommentIds={unseenCommentIds}
        onClearBlueBadge={clearBlueBadge}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
      />

      {/* ─── Create / Edit modal ─────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) setModalOpen(false); }}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[#0D9488]" />
              {editing ? 'Edit Announcement' : 'New Announcement'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-1">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">
                Title <span className="text-gray-400 font-normal text-xs">(max 100)</span>
              </Label>
              <Input {...register('title')} placeholder="Announcement title" className="border-gray-200" autoFocus />
              {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-gray-700">Body</Label>
                <span className={`text-xs ${bodyValue.length > 900 ? 'text-amber-500' : 'text-gray-400'}`}>
                  {bodyValue.length}/1000
                </span>
              </div>
              <Textarea
                {...register('body')}
                placeholder="Write the announcement content..."
                className="border-gray-200 resize-none h-28"
              />
              {errors.body && <p className="text-xs text-red-500">{errors.body.message}</p>}
            </div>

            {/* ─── Poll ──────────────────────────────────────────────────────── */}
            {!editing && (
              <FeatureBlock
                icon={<BarChart2 className="w-4 h-4" />}
                label="Attach Poll"
                enabled={pollEnabled}
                onToggle={() => setPollEnabled((v) => !v)}
              >
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-600">Poll Question</Label>
                    <Input
                      value={poll.question}
                      onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value.slice(0, 300) }))}
                      placeholder="What would you like to ask?"
                      className="border-gray-200 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-600">Options</Label>
                    {poll.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                        <Input
                          value={opt}
                          onChange={(e) => setPollOption(i, e.target.value)}
                          placeholder={`Option ${i + 1}`}
                          className="border-gray-200 text-sm flex-1"
                        />
                        {poll.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removePollOption(i)}
                            className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {poll.options.length < 5 && (
                      <button
                        type="button"
                        onClick={addPollOption}
                        className="text-xs font-medium text-[#0D9488] hover:text-[#7b35d9] flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" />Add Option
                      </button>
                    )}
                  </div>
                  <MiniToggle
                    label="Anonymous Voting"
                    description="Hide individual voter identities"
                    enabled={poll.is_anonymous}
                    onToggle={() => setPoll((p) => ({ ...p, is_anonymous: !p.is_anonymous }))}
                  />
                </div>
              </FeatureBlock>
            )}

            {/* ─── File attachments ───────────────────────────────────────────── */}
            <FeatureBlock
              icon={<Paperclip className="w-4 h-4" />}
              label="Attach Files"
              enabled={stagedFiles.length > 0}
              alwaysOpen
            >
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FILE_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-lg py-4 text-center hover:border-[#0D9488]/40 hover:bg-[#0D9488]/5 transition-colors group"
                >
                  <Paperclip className="w-4 h-4 mx-auto mb-1.5 text-gray-300 group-hover:text-[#0D9488]" />
                  <p className="text-xs font-medium text-gray-400 group-hover:text-[#0D9488]">Click to attach files</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">PDF, PNG, JPG, Excel · max 20 MB each</p>
                </button>
                {stagedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {stagedFiles.map((sf) => (
                      <FilePreviewCard
                        key={sf.id}
                        sf={sf}
                        onRemove={() => removeStagedFile(sf.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </FeatureBlock>

            {/* ─── Priority + Audience ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Priority</Label>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      {(['normal', 'important', 'urgent'] as AnnouncementPriority[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => field.onChange(p)}
                          className={[
                            'flex-1 text-xs font-medium py-2 transition-colors capitalize',
                            field.value === p
                              ? p === 'normal' ? 'bg-gray-700 text-white'
                                : p === 'important' ? 'bg-[#FEF3C7] text-[#92400E]'
                                : 'bg-red-500 text-white'
                              : 'text-gray-500 hover:bg-gray-50',
                          ].join(' ')}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Visible to</Label>
                <Controller
                  name="audience_value"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="border-gray-200"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Everyone</SelectItem>
                        <SelectItem value="admin">Admins only</SelectItem>
                        <SelectItem value="employee">All Employees</SelectItem>
                        <div className="px-2 pt-2 pb-1">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">By Department</p>
                        </div>
                        {DEPARTMENTS.map((dept) => (
                          <SelectItem key={dept} value={`dept_${dept}`}>{dept}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* ─── Expiry + Pin ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">
                  Expiry date <span className="text-gray-400 font-normal text-xs">(optional)</span>
                </Label>
                <Input {...register('expires_at')} type="date" className="border-gray-200" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Options</Label>
                <Controller
                  name="is_pinned"
                  control={control}
                  render={({ field }) => (
                    <button
                      type="button"
                      onClick={() => field.onChange(!field.value)}
                      className={[
                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                        field.value
                          ? 'bg-[#CCFBF1] border-[#0D9488]/30 text-[#0D9488]'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      <Pin className={['w-4 h-4', field.value ? 'fill-[#0D9488]' : ''].join(' ')} />
                      {field.value ? 'Pinned' : 'Pin this'}
                    </button>
                  )}
                />
              </div>
            </div>

            {/* ─── Require acknowledgement ─────────────────────────────────────── */}
            <Controller
              name="requires_acknowledgement"
              control={control}
              render={({ field }) => (
                <div
                  onClick={() => field.onChange(!field.value)}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors select-none',
                    field.value
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100',
                  ].join(' ')}
                >
                  <CheckSquare className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {field.value ? 'Acknowledgement required' : 'Require Employee Acknowledgement'}
                    </p>
                    <p className="text-xs opacity-70 mt-0.5">
                      {field.value
                        ? 'Employees must click "Mark as Read & Understood"'
                        : 'Add a mandatory read confirmation for all recipients'}
                    </p>
                  </div>
                  <div className={['w-9 h-5 rounded-full flex-shrink-0 relative transition-colors', field.value ? 'bg-blue-500' : 'bg-gray-200'].join(' ')}>
                    <div className={['absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform', field.value ? 'translate-x-4' : 'translate-x-0.5'].join(' ')} />
                  </div>
                </div>
              )}
            />

            {/* ─── Email toggle ────────────────────────────────────────────────── */}
            <div
              onClick={() => setSendEmail((v) => !v)}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors select-none',
                sendEmail
                  ? 'bg-[#0D9488]/5 border-[#0D9488]/30 text-[#0D9488]'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100',
              ].join(' ')}
            >
              <Mail className="w-4 h-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">
                  {sendEmail ? 'Email notification will be sent' : 'No email notification'}
                </p>
                <p className="text-xs opacity-70 mt-0.5">
                  {sendEmail ? 'Recipients based on audience setting' : 'Click to enable'}
                </p>
              </div>
              <div className={['w-9 h-5 rounded-full flex-shrink-0 relative transition-colors', sendEmail ? 'bg-[#0D9488]' : 'bg-gray-200'].join(' ')}>
                <div className={['absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform', sendEmail ? 'translate-x-4' : 'translate-x-0.5'].join(' ')} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">
                {saving
                  ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</span>
                  : editing ? 'Save Changes' : 'Publish'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ─────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteTarget?.title}"</strong> will be permanently deleted, along with all reactions, comments, poll responses, and attachments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─── FilePreviewCard ──────────────────────────────────────────────────────────

const FilePreviewCard: React.FC<{ sf: StagedFile; onRemove: () => void }> = ({ sf, onRemove }) => {
  const isImage = sf.file.type.startsWith('image/');
  const isPDF = sf.file.type === 'application/pdf';
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(sf.file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sf.file, isImage]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-white w-[116px] flex-shrink-0 shadow-sm">
      {/* Preview area */}
      {isImage && objectUrl ? (
        <div className="h-[72px] overflow-hidden bg-gray-100">
          <img src={objectUrl} alt={sf.file.name} className="w-full h-full object-cover" />
        </div>
      ) : isPDF ? (
        <div className="h-[72px] bg-red-50 flex flex-col items-center justify-center gap-1.5">
          <div className="w-9 h-9 bg-white rounded-lg shadow-sm flex items-center justify-center border border-red-100">
            <FileText className="w-5 h-5 text-red-500" />
          </div>
          <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full tracking-wide">PDF</span>
        </div>
      ) : (
        <div className="h-[72px] bg-emerald-50 flex flex-col items-center justify-center gap-1.5">
          <div className="w-9 h-9 bg-white rounded-lg shadow-sm flex items-center justify-center border border-emerald-100">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
          </div>
          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full tracking-wide">{sf.label}</span>
        </div>
      )}
      {/* Meta */}
      <div className="px-2 py-1.5">
        <p className="text-[10px] font-semibold text-gray-700 truncate leading-tight">{sf.file.name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{formatBytes(sf.file.size)}</p>
      </div>
      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 w-5 h-5 bg-gray-900/60 hover:bg-gray-900/90 rounded-full flex items-center justify-center transition-colors"
      >
        <X className="w-2.5 h-2.5 text-white" />
      </button>
    </div>
  );
};

// ─── FeatureBlock ──────────────────────────────────────────────────────────────

interface FeatureBlockProps {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onToggle?: () => void;
  alwaysOpen?: boolean;
  children: React.ReactNode;
}

const FeatureBlock: React.FC<FeatureBlockProps> = ({ icon, label, enabled, onToggle, alwaysOpen, children }) => {
  const isOpen = alwaysOpen || enabled;
  return (
    <div className={[
      'rounded-xl border transition-colors',
      isOpen ? 'border-gray-200 bg-gray-50/50' : 'border-gray-100 bg-transparent',
    ].join(' ')}>
      <div
        className={['flex items-center gap-2.5 px-3.5 py-2.5', !alwaysOpen ? 'cursor-pointer select-none' : ''].join(' ')}
        onClick={!alwaysOpen ? onToggle : undefined}
      >
        <span className={['transition-colors', (!alwaysOpen && enabled) ? 'text-[#0D9488]' : 'text-gray-400'].join(' ')}>{icon}</span>
        <span className={['text-sm font-medium flex-1 transition-colors', (!alwaysOpen && enabled) ? 'text-[#0D9488]' : 'text-gray-500'].join(' ')}>{label}</span>
        {!alwaysOpen && (
          <div className={['w-9 h-5 rounded-full relative transition-colors flex-shrink-0', enabled ? 'bg-[#0D9488]' : 'bg-gray-200'].join(' ')}>
            <div className={['absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform', enabled ? 'translate-x-4' : 'translate-x-0.5'].join(' ')} />
          </div>
        )}
      </div>
      {isOpen && (
        <div className="px-3.5 pb-3.5">
          <div className="border-t border-gray-100 pt-3">{children}</div>
        </div>
      )}
    </div>
  );
};

// ─── MiniToggle ───────────────────────────────────────────────────────────────

interface MiniToggleProps {
  label: string;
  description?: string;
  enabled: boolean;
  onToggle: () => void;
}

const MiniToggle: React.FC<MiniToggleProps> = ({ label, description, enabled, onToggle }) => (
  <div onClick={onToggle} className="flex items-center gap-3 cursor-pointer select-none">
    <div className="flex-1 min-w-0">
      <p className={['text-xs font-medium transition-colors', enabled ? 'text-gray-700' : 'text-gray-500'].join(' ')}>{label}</p>
      {description && <p className="text-[10px] text-gray-400 mt-0.5">{description}</p>}
    </div>
    <div className={['w-8 h-4 rounded-full relative transition-colors flex-shrink-0', enabled ? 'bg-[#0D9488]' : 'bg-gray-200'].join(' ')}>
      <div className={['absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform', enabled ? 'translate-x-4' : 'translate-x-0.5'].join(' ')} />
    </div>
  </div>
);
