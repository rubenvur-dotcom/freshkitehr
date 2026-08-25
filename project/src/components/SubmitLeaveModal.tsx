import React, { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { calculateWorkingDays, computeLeaveBalances, workingDaysNotice, cn } from '../lib/utils';
import { triggerNewRequestEmail } from '../lib/emailService';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { CalendarDays, CircleAlert as AlertCircle, CalendarCheck, Clock, ShieldAlert, GraduationCap } from 'lucide-react';

const LEAVE_TYPES = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid', 'Compassionate', 'Study'] as const;
const HALF_DAY_TYPES = ['Annual', 'Sick', 'Emergency'] as const;
const MAX_REASON_CHARS = 300;
const NOTICE_EXEMPT = new Set(['Sick', 'Emergency', 'Compassionate']);

const schema = z.object({
  leave_type: z.enum(LEAVE_TYPES, { required_error: 'Please select a leave type' }),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  is_half_day: z.boolean().default(false),
  reason: z.string().max(MAX_REASON_CHARS).optional(),
  short_notice_reason: z.string().max(500).optional(),
  bypass_notice: z.boolean().default(false),
}).refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, {
  message: 'End date must be on or after start date',
  path: ['end_date'],
});

type Form = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TYPE_CHIP: Record<string, { active: string; dot: string }> = {
  Annual:        { active: 'border-[#0D9488] bg-[#CCFBF1] text-[#0D9488]',    dot: 'bg-[#0D9488]' },
  Sick:          { active: 'border-[#10B981] bg-[#D1FAE5] text-[#065F46]',           dot: 'bg-[#10B981]' },
  Maternity:     { active: 'border-pink-400 bg-pink-50 text-pink-700',             dot: 'bg-pink-400' },
  Paternity:     { active: 'border-blue-400 bg-blue-50 text-blue-700',             dot: 'bg-blue-400' },
  Emergency:     { active: 'border-red-400 bg-red-50 text-red-700',                dot: 'bg-red-400' },
  Unpaid:        { active: 'border-gray-400 bg-gray-100 text-gray-700',            dot: 'bg-gray-400' },
  Compassionate: { active: 'border-rose-500 bg-rose-50 text-rose-700',             dot: 'bg-rose-500' },
  Study:         { active: 'border-sky-500 bg-sky-50 text-sky-700',                dot: 'bg-sky-500' },
};

export const SubmitLeaveModal: React.FC<Props> = ({ open, onClose, onSuccess }) => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [approved, setApproved] = useState<{ leave_type: string; working_days: number }[]>([]);
  const [pendingReqs, setPendingReqs] = useState<{ leave_type: string; working_days: number }[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<Record<string, number>>({});
  const [studyProof, setStudyProof] = useState<File | null>(null);

  const {
    register, handleSubmit, watch, reset, control, setValue,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { leave_type: undefined, start_date: '', end_date: '', is_half_day: false, reason: '', short_notice_reason: '', bypass_notice: false },
  });

  const startDate = watch('start_date');
  const endDate = watch('end_date');
  const leaveType = watch('leave_type');
  const isHalfDay = watch('is_half_day');
  const reason = watch('reason') ?? '';
  const shortNoticeReason = watch('short_notice_reason') ?? '';
  const bypassNotice = watch('bypass_notice');

  const fetchRequests = useCallback(async () => {
    if (!profile || !open) return;
    const [approvedRes, pendingRes, policyRes] = await Promise.all([
      supabase.from('leave_requests').select('leave_type, working_days').eq('employee_id', profile.id).eq('status', 'Approved'),
      supabase.from('leave_requests').select('leave_type, working_days').eq('employee_id', profile.id).eq('status', 'Pending'),
      supabase.from('leave_policies').select('leave_type, days_allowed'),
    ]);
    if (approvedRes.data) setApproved(approvedRes.data);
    if (pendingRes.data) setPendingReqs(pendingRes.data);
    if (policyRes.data) {
      const map: Record<string, number> = {};
      policyRes.data.forEach((p) => { map[p.leave_type] = p.days_allowed; });
      setLeavePolicies(map);
    }
  }, [profile, open]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Reset half-day when switching to a type that doesn't support it
  useEffect(() => {
    if (leaveType && !(HALF_DAY_TYPES as readonly string[]).includes(leaveType)) {
      setValue('is_half_day', false);
    }
  }, [leaveType, setValue]);

  // Auto-enable bypass when Sick/Emergency/Compassionate selected
  useEffect(() => {
    if (leaveType && NOTICE_EXEMPT.has(leaveType)) {
      setValue('bypass_notice', true);
    } else {
      setValue('bypass_notice', false);
    }
  }, [leaveType, setValue]);

  // Clear validation when dates/type change
  useEffect(() => {
    if (validationError) setValidationError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, leaveType]);

  const computeWorkingDays = (start: string, end: string, halfDay: boolean): number => {
    if (!start || !end || end < start) return 0;
    const full = calculateWorkingDays(start, end);
    return halfDay ? 0.5 : full;
  };

  const workingDays = computeWorkingDays(startDate, endDate, isHalfDay);

  const balances = profile ? computeLeaveBalances(profile, approved, pendingReqs) : null;

  const getBalance = (type: string): number | null => {
    if (type === 'Annual') return balances?.annualRemaining ?? null;
    if (type === 'Sick') return balances?.sickRemaining ?? null;
    if (leavePolicies[type] !== undefined) {
      const used = approved.filter((r) => r.leave_type === type).reduce((s, r) => s + Number(r.working_days), 0);
      return leavePolicies[type] - used;
    }
    return null;
  };

  const noticeDays = startDate ? workingDaysNotice(startDate) : null;
  const isShortNotice = noticeDays !== null && noticeDays < 2;
  const noticeExempt = leaveType ? NOTICE_EXEMPT.has(leaveType) : false;
  const canHalfDay = leaveType ? (HALF_DAY_TYPES as readonly string[]).includes(leaveType) : false;

  const validate = (data: Form): string => {
    const days = computeWorkingDays(data.start_date, data.end_date, data.is_half_day);
    if (days === 0) return 'The selected date range contains no working days.';

    const noticeDaysVal = workingDaysNotice(data.start_date);
    if (noticeDaysVal < 0) return 'Start date cannot be in the past.';

    if (noticeDaysVal < 2 && !NOTICE_EXEMPT.has(data.leave_type) && !data.bypass_notice) {
      return 'This request requires at least 2 working days notice. Enable the emergency exception or change the date.';
    }

    if (noticeDaysVal < 2 && !NOTICE_EXEMPT.has(data.leave_type) && !data.short_notice_reason?.trim()) {
      return 'Please provide a reason for the short-notice request.';
    }

    const balance = getBalance(data.leave_type);
    if (balance !== null && days > balance) {
      return `Insufficient balance — ${balance} day${balance !== 1 ? 's' : ''} remaining for ${data.leave_type} leave but ${days} requested.`;
    }

    return '';
  };

  const onSubmit = async (data: Form) => {
    const err = validate(data);
    if (err) { setValidationError(err); return; }
    setValidationError('');
    setSubmitting(true);

    const days = computeWorkingDays(data.start_date, data.end_date, data.is_half_day);
    const noticeDaysVal = workingDaysNotice(data.start_date);
    const shortNotice = noticeDaysVal < 2;

    let studyDocumentUrl: string | null = null;
    if (data.leave_type === 'Study' && studyProof) {
      const ext = studyProof.name.split('.').pop();
      const path = `study-proof/${profile!.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('employee-documents').upload(path, studyProof);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('employee-documents').getPublicUrl(path);
        studyDocumentUrl = urlData?.publicUrl ?? null;
      }
    }

    const { data: reqData, error } = await supabase
      .from('leave_requests')
      .insert({
        employee_id: profile!.id,
        leave_type: data.leave_type,
        start_date: data.start_date,
        end_date: data.end_date,
        working_days: days,
        reason: data.reason?.trim() || null,
        status: 'Pending',
        is_short_notice: shortNotice,
        short_notice_reason: shortNotice ? (data.short_notice_reason?.trim() || null) : null,
        study_document_url: studyDocumentUrl,
      })
      .select('*, profiles(*)')
      .single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Request Submitted', description: 'Your request has been submitted and is pending approval.' });
      if (reqData) {
        await triggerNewRequestEmail({ ...reqData, profiles: profile ?? undefined });
        const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin').eq('is_active', true);
        if (admins?.length) {
          await supabase.from('notifications').insert(
            admins.map((a) => ({
              recipient_id: a.id,
              type: 'leave_submitted',
              title: `New leave request${shortNotice ? ' — Short Notice' : ''}`,
              body: `${profile?.full_name ?? 'Employee'} submitted a ${data.leave_type} leave request (${days} day${days !== 1 ? 's' : ''})${shortNotice ? ' with short notice.' : '.'}`,
              is_read: false,
              related_type: 'leave_request',
              related_id: reqData.id,
            }))
          );
        }
      }
      reset();
      setStudyProof(null);
      onSuccess();
    }
    setSubmitting(false);
  };

  const handleClose = () => { reset(); setValidationError(''); setStudyProof(null); onClose(); };

  const selectedBalance = leaveType ? getBalance(leaveType) : null;
  const isOverBalance = selectedBalance !== null && workingDays > selectedBalance;
  const allBalanceLabel = leaveType === 'Annual'
    ? balances?.isProbation ? `Accrued (${balances.probationMonthsCompleted} mo.)` : 'Pro-rata'
    : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <CalendarDays className="w-5 h-5 text-[#0D9488]" />
            Submit Leave Request
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-1">
          {/* Probation notice */}
          {balances?.isProbation && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                <strong>Probation period:</strong> You have accrued{' '}
                <strong>{balances.annualAllowance} annual</strong> and{' '}
                <strong>{balances.sickAllowance} sick</strong> days so far.
              </span>
            </div>
          )}

          {/* Leave type chips */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Leave Type</Label>
            <Controller
              name="leave_type"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-4 gap-2">
                  {LEAVE_TYPES.map((type) => {
                    const balance = getBalance(type);
                    const isSelected = field.value === type;
                    const chip = TYPE_CHIP[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => field.onChange(type)}
                        className={cn(
                          'relative flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-xl border-2 text-xs font-semibold transition-all duration-150 select-none',
                          isSelected ? chip.active : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        <div className={cn('w-2 h-2 rounded-full', isSelected ? chip.dot : 'bg-gray-300')} />
                        <span className="text-center leading-tight">{type}</span>
                        {balance !== null && (
                          <span className={cn('text-[10px] font-normal', isSelected ? 'opacity-70' : 'text-gray-400')}>
                            {balance}d left
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.leave_type && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{errors.leave_type.message}
              </p>
            )}
          </div>

          {/* Statutory leave info banners */}
          {leaveType === 'Compassionate' && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span><strong>Compassionate Leave:</strong> Up to 5 paid days per calendar year for bereavement or critical domestic emergencies. Does not deduct from your Annual or Sick balance.</span>
            </div>
          )}
          {leaveType === 'Study' && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-700">
              <GraduationCap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span><strong>Study Leave:</strong> Up to 5 paid days per calendar year for official examinations or professional development. Proof/exam timetable required.</span>
            </div>
          )}

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Start Date</Label>
              <Input type="date" {...register('start_date')} className="border-gray-200 h-10 text-sm" />
              {errors.start_date && <p className="text-xs text-red-500">{errors.start_date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">End Date</Label>
              <Input type="date" {...register('end_date')} min={startDate || undefined} className="border-gray-200 h-10 text-sm" />
              {errors.end_date && <p className="text-xs text-red-500">{errors.end_date.message}</p>}
            </div>
          </div>

          {/* Half-day toggle — only for Annual, Sick, Emergency */}
          {canHalfDay && startDate && endDate && startDate === endDate && (
            <Controller
              name="is_half_day"
              control={control}
              render={({ field }) => (
                <button
                  type="button"
                  onClick={() => field.onChange(!field.value)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                    field.value
                      ? 'bg-[#CCFBF1] border-[#0D9488] text-[#0D9488]'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  )}
                >
                  <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0', field.value ? 'bg-[#0D9488] border-[#0D9488]' : 'border-gray-300')}>
                    {field.value && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  Half-Day Leave (0.5 day)
                  <span className="ml-auto text-xs opacity-60">Single day selected</span>
                </button>
              )}
            />
          )}

          {/* Working days indicator */}
          {workingDays > 0 && (
            <div className={cn(
              'flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm',
              isOverBalance ? 'bg-red-50 border-red-200 text-red-700' : 'bg-[#0D9488]/5 border-[#CCFBF1] text-[#0D9488]'
            )}>
              <CalendarCheck className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{workingDays}</strong> working day{workingDays !== 1 ? 's' : ''} selected
                {isHalfDay && <span className="ml-1.5 text-[11px] font-semibold bg-[#CCFBF1] px-1.5 py-0.5 rounded-full">Half Day</span>}
                {selectedBalance !== null && (
                  <span className={cn('ml-1.5', isOverBalance ? 'text-red-600' : 'opacity-70')}>
                    ({selectedBalance} remaining{allBalanceLabel ? ` · ${allBalanceLabel}` : ''})
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Notice period warning */}
          {isShortNotice && startDate && (
            <div className={cn(
              'flex items-start gap-2.5 px-3.5 py-3 rounded-xl border text-xs',
              noticeExempt || bypassNotice
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            )}>
              <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <p>
                  <strong>Short notice:</strong> {noticeDays !== null && noticeDays <= 0 ? 'starts today' : `${noticeDays} working day${noticeDays !== 1 ? 's' : ''} notice`} — standard policy requires 2.
                  {noticeExempt && <span className="ml-1 font-medium">Exempt for {leaveType} leave.</span>}
                </p>
                {!noticeExempt && (
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Controller
                        name="bypass_notice"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={(e) => field.onChange(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-[#F59E0B] accent-[#F59E0B]"
                          />
                        )}
                      />
                      <span className="font-medium">Emergency / Unforeseen Circumstances exception</span>
                    </label>
                    {bypassNotice && (
                      <div className="mt-2">
                        <Textarea
                          {...register('short_notice_reason')}
                          placeholder="Required: explain why this request needs an exception..."
                          rows={2}
                          className="text-xs border-[#E5E7EB] resize-none focus:border-[#0D9488] focus:ring-[#0D9488]/20 mt-1"
                        />
                        <p className="text-[10px] text-[#92400E] mt-1">{shortNoticeReason.length}/500 — visible to the approving admin</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Study leave proof upload */}
          {leaveType === 'Study' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">
                Proof / Exam Timetable <span className="font-normal text-gray-400">(optional)</span>
              </Label>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-sm text-gray-500">
                  <GraduationCap className="w-4 h-4 text-sky-500 flex-shrink-0" />
                  {studyProof ? studyProof.name : 'Attach PDF or image…'}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => setStudyProof(e.target.files?.[0] ?? null)}
                  />
                </label>
                {studyProof && (
                  <button type="button" onClick={() => setStudyProof(null)} className="text-gray-400 hover:text-red-500 text-xs px-2 py-1">
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Standard reason */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-700">
                Reason <span className="font-normal text-gray-400">(optional)</span>
              </Label>
              <span className={cn('text-xs tabular-nums', reason.length > MAX_REASON_CHARS - 20 ? 'text-[#F59E0B]' : 'text-gray-400')}>
                {reason.length}/{MAX_REASON_CHARS}
              </span>
            </div>
            <Textarea
              {...register('reason')}
              placeholder="Brief description..."
              className="resize-none h-[72px] border-gray-200 text-sm focus:border-[#0D9488] focus:ring-[#CCFBF1]"
              maxLength={MAX_REASON_CHARS}
            />
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{validationError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1 border-gray-200">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1 btn-solid">
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </span>
              ) : 'Submit Request'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
