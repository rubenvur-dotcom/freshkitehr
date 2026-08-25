import React, { useEffect, useState, useCallback } from 'react';
import { supabase, PermissionRequest } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { Clock, Plus, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, Circle as XCircle } from 'lucide-react';

const MAX_MONTHLY_PERMISSIONS = 2;
const HALF_DAY_THRESHOLD_MINUTES = 120;

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Pending:  { bg: 'bg-gray-100',   text: 'text-[#6B7280]',  label: 'Pending'  },
  Approved: { bg: 'bg-[#D1FAE5]',  text: 'text-[#065F46]',  label: 'Approved' },
  Declined: { bg: 'bg-[#FEE2E2]',  text: 'text-[#991B1B]',  label: 'Declined' },
};

export const PermissionsPage: React.FC = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ date: '', start_time: '', end_time: '', reason: '' });
  const [conversionWarning, setConversionWarning] = useState(false);
  const [validationError, setValidationError] = useState('');

  const fetchPermissions = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('permission_requests')
      .select('*')
      .eq('employee_id', profile.id)
      .order('date', { ascending: false });
    if (data) setPermissions(data as PermissionRequest[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const duration = (() => {
    if (!form.start_time || !form.end_time) return 0;
    const start = parseTimeToMinutes(form.start_time);
    const end = parseTimeToMinutes(form.end_time);
    return end > start ? end - start : 0;
  })();

  useEffect(() => {
    setConversionWarning(duration > HALF_DAY_THRESHOLD_MINUTES);
    setValidationError('');
  }, [duration, form.date]);

  const thisMonthApproved = (() => {
    if (!form.date) return 0;
    const monthKey = getMonthKey(form.date);
    return permissions.filter(
      (p) => getMonthKey(p.date) === monthKey && p.status !== 'Declined'
    ).length;
  })();

  const handleSubmit = async () => {
    if (!profile) return;
    setValidationError('');

    if (!form.date || !form.start_time || !form.end_time) {
      setValidationError('Please fill in all required fields.');
      return;
    }

    if (duration <= 0) {
      setValidationError('End time must be after start time.');
      return;
    }

    if (thisMonthApproved >= MAX_MONTHLY_PERMISSIONS) {
      setValidationError(`Monthly permission limit exceeded (Max ${MAX_MONTHLY_PERMISSIONS}). Please apply for leave instead.`);
      return;
    }

    if (conversionWarning) {
      // Duration > 2 hours → convert to 0.5 day leave request notice
      // We still submit but flag it
    }

    setSubmitting(true);
    const { error } = await supabase.from('permission_requests').insert({
      employee_id: profile.id,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      duration_minutes: duration,
      reason: form.reason.trim() || null,
      status: 'Pending',
      converted_to_half_day: conversionWarning,
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Notify admins
      const { data: admins } = await supabase
        .from('profiles').select('id').eq('role', 'admin').eq('is_active', true);
      if (admins?.length) {
        await supabase.from('notifications').insert(
          admins.map((a) => ({
            recipient_id: a.id,
            type: 'permission_submitted',
            title: 'Permission Request Submitted',
            body: `${profile.full_name} submitted a permission request for ${new Date(form.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })} (${formatTime(form.start_time)} – ${formatTime(form.end_time)}).`,
            is_read: false,
          }))
        );
      }

      toast({
        title: conversionWarning ? 'Converted to Half-Day Leave' : 'Permission Request Submitted',
        description: conversionWarning
          ? 'Duration exceeds 2 hours — request has been submitted as a 0.5 day leave.'
          : 'Your request is pending admin approval.',
      });
      setForm({ date: '', start_time: '', end_time: '', reason: '' });
      setOpen(false);
      fetchPermissions();
    }
    setSubmitting(false);
  };

  const thisMonthCount = permissions.filter(
    (p) => getMonthKey(p.date) === getMonthKey(new Date().toISOString().split('T')[0]) && p.status !== 'Declined'
  ).length;

  const pendingCount = permissions.filter((p) => p.status === 'Pending').length;

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permission Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '—' : `${permissions.length} total · ${pendingCount} pending`}
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          New Permission
        </Button>
      </div>

      {/* Monthly usage indicator */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm',
        thisMonthCount >= MAX_MONTHLY_PERMISSIONS
          ? 'bg-red-50 border-red-200 text-red-700'
          : thisMonthCount === MAX_MONTHLY_PERMISSIONS - 1
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-gray-50 border-gray-100 text-gray-600'
      )}>
        <Clock className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>{thisMonthCount}/{MAX_MONTHLY_PERMISSIONS}</strong> permissions used this month.
          {thisMonthCount >= MAX_MONTHLY_PERMISSIONS && (
            <span className="ml-1.5 font-semibold">Monthly limit reached — submit a leave request instead.</span>
          )}
        </span>
      </div>

      {/* Permissions list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-4 w-32 bg-gray-100 rounded" />
                <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
              </div>
            ))}
          </div>
        ) : permissions.length === 0 ? (
          <div className="py-16 text-center">
            <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">No permission requests yet.</p>
            <p className="text-xs text-gray-400 mt-1">Request temporary time off during working hours.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Date', 'Time', 'Duration', 'Reason', 'Status', 'Admin Note'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {permissions.map((p) => {
                  const style = STATUS_STYLES[p.status] ?? STATUS_STYLES.Pending;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-800 font-medium whitespace-nowrap">
                        {new Date(p.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-sm whitespace-nowrap">
                        {formatTime(p.start_time)} – {formatTime(p.end_time)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-sm">
                        <span className="font-semibold">{formatDuration(p.duration_minutes)}</span>
                        {p.converted_to_half_day && (
                          <span className="ml-1.5 text-[10px] font-semibold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full">→ Half Day</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs max-w-[200px] truncate">
                        {p.reason || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full', style.bg, style.text)}>
                          {p.status === 'Approved' && <CheckCircle2 className="w-3 h-3" />}
                          {p.status === 'Declined' && <XCircle className="w-3 h-3" />}
                          {p.status === 'Pending' && <Clock className="w-3 h-3" />}
                          {style.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 max-w-[180px] truncate">
                        {p.admin_comment ? <span className="italic">"{p.admin_comment}"</span> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Permission Dialog */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setForm({ date: '', start_time: '', end_time: '', reason: '' }); setValidationError(''); setOpen(false); } }}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#0D9488]" />
              Request Permission
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Date <span className="text-red-600">*</span></Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="border-gray-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time <span className="text-red-600">*</span></Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  className="border-gray-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Time <span className="text-red-600">*</span></Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                  className="border-gray-200"
                />
              </div>
            </div>

            {/* Duration pill */}
            {duration > 0 && (
              <div className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border',
                conversionWarning
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-[#0D9488]/5 border-[#CCFBF1] text-[#0D9488]'
              )}>
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>Duration: <strong>{formatDuration(duration)}</strong></span>
              </div>
            )}

            {/* 2-hour conversion warning */}
            {conversionWarning && (
              <div className="flex items-start gap-2.5 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold mb-0.5">Exceeds 2-Hour Limit</p>
                  <p>Durations exceeding 2 hours are classified as a Half-Day Leave. Submitting this will automatically convert your request to <strong>0.5 Day Leave</strong>.</p>
                </div>
              </div>
            )}

            {/* Monthly limit warning */}
            {form.date && thisMonthApproved >= MAX_MONTHLY_PERMISSIONS && (
              <div className="flex items-start gap-2.5 px-3 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold mb-0.5">Monthly Limit Exceeded (Max {MAX_MONTHLY_PERMISSIONS})</p>
                  <p>You have already used {thisMonthApproved} permission{thisMonthApproved !== 1 ? 's' : ''} this month. Please apply for local leave instead.</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Reason <span className="font-normal text-gray-400">(optional)</span></Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value.slice(0, 300) }))}
                placeholder="Brief explanation..."
                className="resize-none h-16 text-sm border-gray-200"
              />
              <p className="text-xs text-gray-400 text-right">{form.reason.length}/300</p>
            </div>

            {validationError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">{validationError}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setForm({ date: '', start_time: '', end_time: '', reason: '' }); setValidationError(''); setOpen(false); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !form.date || !form.start_time || !form.end_time}
              className={cn(
                'text-white font-medium',
                conversionWarning ? 'bg-[#0D9488] hover:bg-[#0F766E]' : 'bg-[#0D9488] hover:bg-[#0F766E]'
              )}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </span>
              ) : conversionWarning ? 'Submit as Half-Day Leave' : 'Submit Permission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
