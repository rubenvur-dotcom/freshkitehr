import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, Profile, OffboardingChecklist, OffboardingItem, OffboardingAuditLog, SeparationReason } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';
import { ArrowLeft, CircleCheck as CheckCircle2, Circle, ClipboardList, User, Settings, Monitor, Package, GitBranch, MessageSquare, TriangleAlert as AlertTriangle, CheckCheck, Clock, ChevronDown, ChevronUp, FileText, Loader, StickyNote, History } from 'lucide-react';

// ─── Checklist definition ─────────────────────────────────────────────────────

interface ItemDef {
  key: string;
  label: string;
  optional?: boolean;
}
interface SectionDef {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  items: ItemDef[];
}

const SECTIONS: SectionDef[] = [
  {
    key: 'admin',
    label: 'Admin',
    icon: Settings,
    color: '#0D9488',
    items: [
      { key: 'admin_resignation_received', label: 'Resignation letter received', optional: true },
      { key: 'admin_resignation_accepted', label: 'Resignation accepted and acknowledged' },
      { key: 'admin_notice_reviewed', label: 'Notice period reviewed and confirmed' },
      { key: 'admin_final_date_confirmed', label: 'Final employment date confirmed' },
      { key: 'admin_payroll_notified', label: 'Payroll notified of last working day' },
      { key: 'admin_folder_moved', label: "Employee folder updated and moved to Leavers' Folder on Shared Drive" },
      { key: 'admin_annual_leave_calc', label: 'Annual leave balance calculated' },
      { key: 'admin_sick_leave_reviewed', label: 'Sick leave balance reviewed' },
      { key: 'admin_final_payslip', label: "Final payslip sent to employee's personal email address" },
    ],
  },
  {
    key: 'it',
    label: 'IT Offboarding',
    icon: Monitor,
    color: '#378ADD',
    items: [
      { key: 'it_email_disabled', label: 'Email account disabled' },
      { key: 'it_vpn_removed', label: 'VPN access removed and authenticator removed from device' },
      { key: 'it_system_access', label: 'System access removed' },
      { key: 'it_hr_system', label: 'HR system account deactivated' },
      { key: 'it_files_transferred', label: 'Business files transferred', optional: true },
      { key: 'it_email_handover', label: 'Email handover completed', optional: true },
    ],
  },
  {
    key: 'assets',
    label: 'Asset Recovery',
    icon: Package,
    color: '#F5A623',
    items: [
      { key: 'asset_laptop', label: 'Laptop returned' },
      { key: 'asset_charger', label: 'Laptop charger returned' },
      { key: 'asset_mouse', label: 'Mouse and mousepad returned' },
      { key: 'asset_monitor', label: 'Monitor returned' },
      { key: 'asset_bag', label: 'Laptop bag returned' },
      { key: 'asset_adapters', label: 'Converters / adapters returned' },
      { key: 'asset_access_card', label: 'Access card / door fob returned' },
      { key: 'asset_verified', label: 'All assets verified and logged' },
    ],
  },
  {
    key: 'handover',
    label: 'Departmental Handover',
    icon: GitBranch,
    color: '#7F77DD',
    items: [
      { key: 'handover_doc', label: 'Handover document completed' },
      { key: 'handover_contacts', label: 'Key contacts transferred' },
      { key: 'handover_clients', label: 'Client relationships transitioned' },
      { key: 'handover_tasks', label: 'Open tasks reassigned' },
    ],
  },
  {
    key: 'exit',
    label: 'Exit Interview',
    icon: MessageSquare,
    color: '#E24B4A',
    items: [
      { key: 'exit_interview', label: 'Exit interview conducted', optional: true },
      { key: 'exit_feedback', label: 'Feedback documented' },
      { key: 'exit_actions', label: 'Improvement actions recorded' },
    ],
  },
];

const ALL_ITEMS: ItemDef[] = SECTIONS.flatMap((s) => s.items);
const MANDATORY_KEYS = new Set(ALL_ITEMS.filter((i) => !i.optional).map((i) => i.key));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('en-MU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(d: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function sectionProgress(items: OffboardingItem[], sectionKey: string) {
  const sectionItems = items.filter((i) => i.section === sectionKey);
  const total = sectionItems.length;
  const done = sectionItems.filter((i) => i.is_checked).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function masterProgress(items: OffboardingItem[]) {
  const total = items.length;
  const done = items.filter((i) => i.is_checked).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function allMandatoryDone(items: OffboardingItem[]): boolean {
  return Array.from(MANDATORY_KEYS).every((key) => {
    const item = items.find((i) => i.item_key === key);
    return item?.is_checked === true;
  });
}

// ─── Initiate Offboarding Dialog ─────────────────────────────────────────────

interface InitiateDialogProps {
  employee: Profile;
  onInitiated: (checklist: OffboardingChecklist) => void;
  onClose: () => void;
  adminId: string;
}

const InitiateDialog: React.FC<InitiateDialogProps> = ({ employee, onInitiated, onClose, adminId }) => {
  const { toast } = useToast();
  const [reason, setReason] = useState<SeparationReason>('Resigned');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [finalDate, setFinalDate] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [position, setPosition] = useState(employee.department);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);

    // Insert checklist
    const { data: cl, error: clErr } = await supabase
      .from('offboarding_checklists')
      .insert({
        employee_id: employee.id,
        initiated_by: adminId,
        separation_reason: reason,
        last_working_day: lastWorkingDay || null,
        final_employment_date: finalDate || null,
        personal_email: personalEmail,
        position,
        status: 'in_progress',
      })
      .select()
      .single();

    if (clErr || !cl) {
      toast({ title: 'Failed to initiate', description: clErr?.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // Insert all checklist items
    const itemInserts = SECTIONS.flatMap((sec) =>
      sec.items.map((item) => ({
        checklist_id: cl.id,
        section: sec.key,
        item_key: item.key,
        label: item.label,
        is_optional: item.optional ?? false,
        is_checked: false,
      }))
    );
    await supabase.from('offboarding_items').insert(itemInserts);

    // Audit log
    await supabase.from('offboarding_audit_log').insert({
      checklist_id: cl.id,
      actor_id: adminId,
      action: 'initiated',
      detail: `Offboarding initiated. Reason: ${reason}`,
    });

    // Update profile
    await supabase.from('profiles').update({
      offboarding_status: 'in_progress',
      separation_reason: reason,
      is_active: false,
    }).eq('id', employee.id);

    toast({ title: 'Offboarding initiated', description: `Checklist created for ${employee.full_name}` });
    onInitiated(cl as OffboardingChecklist);
    setSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <ClipboardList className="w-5 h-5 text-[#0D9488]" />
            Initiate Offboarding — {employee.full_name}
          </DialogTitle>
          <p className="text-xs text-gray-400 mt-0.5">{employee.department}</p>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason for Separation</label>
            <Select value={reason} onValueChange={(v) => setReason(v as SeparationReason)}>
              <SelectTrigger className="h-9 text-sm border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Resigned">Resigned</SelectItem>
                <SelectItem value="Contract Ended">Contract Ended</SelectItem>
                <SelectItem value="Terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Last Working Day</label>
              <input
                type="date"
                value={lastWorkingDay}
                onChange={(e) => setLastWorkingDay(e.target.value)}
                className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Final Employment Date</label>
              <input
                type="date"
                value={finalDate}
                onChange={(e) => setFinalDate(e.target.value)}
                className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Position / Title</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Senior Developer"
              className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Personal Email Address</label>
            <input
              type="email"
              value={personalEmail}
              onChange={(e) => setPersonalEmail(e.target.value)}
              placeholder="employee@personal.com"
              className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
            />
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Initiating offboarding will deactivate this employee's account and create a checklist to track the offboarding process.
            </p>
          </div>
        </div>

        <div className="px-6 pb-5 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} className="border-gray-200 text-gray-600">Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2"
          >
            {submitting
              ? <><Loader className="w-4 h-4 animate-spin" /> Initiating...</>
              : <><ClipboardList className="w-4 h-4" /> Initiate Offboarding</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Notes Modal ──────────────────────────────────────────────────────────────

interface NotesModalProps {
  item: OffboardingItem;
  onSave: (notes: string) => void;
  onClose: () => void;
}

const NotesModal: React.FC<NotesModalProps> = ({ item, onSave, onClose }) => {
  const [notes, setNotes] = useState(item.notes ?? '');
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[420px] max-h-[80vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100">
          <DialogTitle className="flex items-center gap-2 text-sm text-gray-900">
            <StickyNote className="w-4 h-4 text-[#0D9488]" />
            Notes — {item.label}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Add optional notes for this item..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
          />
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} className="border-gray-200 text-gray-600">Cancel</Button>
          <Button onClick={() => onSave(notes)} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">Save Notes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const OffboardingPage: React.FC = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const { profile: adminProfile } = useAuthStore();
  const { toast } = useToast();

  const [employee, setEmployee] = useState<Profile | null>(null);
  const [checklist, setChecklist] = useState<OffboardingChecklist | null>(null);
  const [items, setItems] = useState<OffboardingItem[]>([]);
  const [auditLog, setAuditLog] = useState<OffboardingAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [showInitiate, setShowInitiate] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [notesItem, setNotesItem] = useState<OffboardingItem | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [togglingItem, setTogglingItem] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  // Edit info state
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [infoForm, setInfoForm] = useState({
    separation_reason: 'Resigned' as SeparationReason,
    last_working_day: '',
    final_employment_date: '',
    personal_email: '',
    position: '',
  });

  const fetchData = useCallback(async () => {
    if (!employeeId) return;

    const [{ data: emp }, { data: cl }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', employeeId).maybeSingle(),
      supabase.from('offboarding_checklists').select('*').eq('employee_id', employeeId).maybeSingle(),
    ]);

    setEmployee(emp as Profile | null);
    setChecklist(cl as OffboardingChecklist | null);

    if (cl) {
      const [{ data: its }, { data: logs }] = await Promise.all([
        supabase
          .from('offboarding_items')
          .select('*, checker:checked_by(full_name)')
          .eq('checklist_id', cl.id)
          .order('created_at'),
        supabase
          .from('offboarding_audit_log')
          .select('*, actor:actor_id(full_name)')
          .eq('checklist_id', cl.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (its) setItems(its as OffboardingItem[]);
      if (logs) setAuditLog(logs as OffboardingAuditLog[]);

      setInfoForm({
        separation_reason: cl.separation_reason,
        last_working_day: cl.last_working_day ?? '',
        final_employment_date: cl.final_employment_date ?? '',
        personal_email: cl.personal_email ?? '',
        position: cl.position ?? '',
      });
    }

    setLoading(false);
  }, [employeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleItem = async (item: OffboardingItem) => {
    if (!checklist || !adminProfile) return;
    setTogglingItem(item.id);
    const newChecked = !item.is_checked;

    const update: Partial<OffboardingItem> = newChecked
      ? { is_checked: true, checked_by: adminProfile.id, checked_at: new Date().toISOString() }
      : { is_checked: false, checked_by: null, checked_at: null };

    const { error } = await supabase
      .from('offboarding_items')
      .update(update)
      .eq('id', item.id);

    if (!error) {
      await supabase.from('offboarding_audit_log').insert({
        checklist_id: checklist.id,
        actor_id: adminProfile.id,
        action: newChecked ? 'item_checked' : 'item_unchecked',
        detail: item.label,
      });
      fetchData();
    } else {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    }
    setTogglingItem(null);
  };

  const saveNotes = async (notes: string) => {
    if (!notesItem) return;
    await supabase.from('offboarding_items').update({ notes }).eq('id', notesItem.id);
    setNotesItem(null);
    fetchData();
  };

  const saveInfo = async () => {
    if (!checklist || !adminProfile) return;
    await supabase.from('offboarding_checklists').update({
      separation_reason: infoForm.separation_reason,
      last_working_day: infoForm.last_working_day || null,
      final_employment_date: infoForm.final_employment_date || null,
      personal_email: infoForm.personal_email,
      position: infoForm.position,
      updated_at: new Date().toISOString(),
    }).eq('id', checklist.id);

    await supabase.from('offboarding_audit_log').insert({
      checklist_id: checklist.id,
      actor_id: adminProfile.id,
      action: 'info_updated',
      detail: 'Employee information updated',
    });

    toast({ title: 'Information updated' });
    setEditInfoOpen(false);
    fetchData();
  };

  const completeOffboarding = async () => {
    if (!checklist || !adminProfile) return;
    setCompleting(true);

    await supabase.from('offboarding_checklists').update({
      status: 'complete',
      completed_by: adminProfile.id,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', checklist.id);

    await supabase.from('profiles').update({
      offboarding_status: 'complete',
    }).eq('id', checklist.employee_id);

    await supabase.from('offboarding_audit_log').insert({
      checklist_id: checklist.id,
      actor_id: adminProfile.id,
      action: 'completed',
      detail: 'Offboarding marked as complete',
    });

    toast({ title: 'Offboarding completed', description: `${employee?.full_name} has been fully offboarded.` });
    setShowComplete(false);
    setCompleting(false);
    fetchData();
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-[#0D9488] rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6 text-center text-gray-500">Employee not found.</div>
    );
  }

  // ── No checklist yet ───────────────────────────────────────────────────────

  if (!checklist) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/admin/employees')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Employees
        </button>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-[#CCFBF1] rounded-2xl flex items-center justify-center">
            <ClipboardList className="w-7 h-7 text-[#0D9488]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{employee.full_name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{employee.department}</p>
          </div>
          <p className="text-sm text-gray-500 max-w-sm">
            No offboarding checklist has been initiated for this employee yet.
          </p>
          <Button
            onClick={() => setShowInitiate(true)}
            className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 mt-2"
          >
            <ClipboardList className="w-4 h-4" />
            Initiate Offboarding
          </Button>
        </div>

        {showInitiate && (
          <InitiateDialog
            employee={employee}
            adminId={adminProfile!.id}
            onInitiated={() => { setShowInitiate(false); fetchData(); }}
            onClose={() => setShowInitiate(false)}
          />
        )}
      </div>
    );
  }

  // ── Checklist view ─────────────────────────────────────────────────────────

  const master = masterProgress(items);
  const canComplete = allMandatoryDone(items) && checklist.status === 'in_progress';
  const isComplete = checklist.status === 'complete';

  const REASON_COLORS: Record<string, string> = {
    Resigned: 'bg-blue-100 text-blue-700',
    'Contract Ended': 'bg-gray-100 text-gray-700',
    Terminated: 'bg-[#FEE2E2] text-[#991B1B]',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/admin/employees')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Employees
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#CCFBF1] flex items-center justify-center flex-shrink-0">
              <span className="text-xl font-bold text-[#0D9488]">{employee.full_name.charAt(0)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">{employee.full_name}</h1>
                <span className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-full',
                  REASON_COLORS[checklist.separation_reason] ?? 'bg-gray-100 text-gray-700'
                )}>
                  {checklist.separation_reason}
                </span>
                {isComplete ? (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#CCFBF1] text-[#0D9488] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Offboarding Complete
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Offboarding In Progress
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{checklist.position || employee.department}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAudit(true)}
              className="gap-1.5 border-gray-200 text-gray-600 text-xs"
            >
              <History className="w-3.5 h-3.5" /> Audit Log
            </Button>
            {!isComplete && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditInfoOpen(true)}
                className="gap-1.5 border-gray-200 text-gray-600 text-xs"
              >
                <FileText className="w-3.5 h-3.5" /> Edit Info
              </Button>
            )}
            {!isComplete && (
              <Button
                size="sm"
                onClick={() => setShowComplete(true)}
                disabled={!canComplete}
                className={cn(
                  'gap-1.5 text-xs font-semibold',
                  canComplete
                    ? 'bg-[#0D9488] hover:bg-[#0F766E] text-white'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                )}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark Complete
              </Button>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          {[
            { label: 'Last Working Day', value: formatDate(checklist.last_working_day ?? '') },
            { label: 'Final Employment Date', value: formatDate(checklist.final_employment_date ?? '') },
            { label: 'Personal Email', value: checklist.personal_email || '—' },
            { label: 'Employee Email', value: employee.email },
          ].map((f) => (
            <div key={f.label}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{f.label}</p>
              <p className="text-sm text-gray-800 mt-0.5 truncate">{f.value}</p>
            </div>
          ))}
        </div>

        {/* Master progress bar */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600">Overall Progress</p>
            <p className="text-xs font-bold text-gray-900 tabular-nums">{master.done}/{master.total} items</p>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${master.pct}%`,
                backgroundColor: isComplete ? '#0D9488' : master.pct >= 75 ? '#0D9488' : master.pct >= 40 ? '#F5A623' : '#E24B4A',
              }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{master.pct}% complete</p>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map((sec) => {
        const prog = sectionProgress(items, sec.key);
        const sectionItems = items.filter((i) => i.section === sec.key);
        const collapsed = collapsedSections.has(sec.key);
        const SectionIcon = sec.icon;

        return (
          <div key={sec.key} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Section header */}
            <button
              onClick={() => toggleSection(sec.key)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${sec.color}18` }}
                >
                  <SectionIcon className="w-4 h-4" style={{ color: sec.color }} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">{sec.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {prog.done}/{prog.total} completed
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Section mini progress */}
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${prog.pct}%`, backgroundColor: sec.color }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 tabular-nums w-8 text-right">{prog.pct}%</span>
                </div>
                {prog.done === prog.total && prog.total > 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-[#0D9488]" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-200" />
                )}
                {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {/* Items list */}
            {!collapsed && (
              <div className="border-t border-gray-100 divide-y divide-gray-100">
                {sectionItems.map((item) => {
                  const isToggling = togglingItem === item.id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-start gap-3 px-5 py-3.5 transition-colors',
                        item.is_checked ? 'bg-emerald-50' : 'hover:bg-gray-50/50',
                        isComplete && 'cursor-default'
                      )}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => !isComplete && toggleItem(item)}
                        disabled={isComplete || isToggling}
                        className={cn(
                          'mt-0.5 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all border-2',
                          item.is_checked
                            ? 'bg-[#0D9488] border-[#0D9488]'
                            : 'border-gray-300 hover:border-[#0D9488]',
                          (isComplete || isToggling) && 'cursor-default opacity-70'
                        )}
                      >
                        {isToggling
                          ? <Loader className="w-3 h-3 text-white animate-spin" />
                          : item.is_checked && <CheckCheck className="w-3 h-3 text-white" />
                        }
                      </button>

                      {/* Label + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            'text-sm',
                            item.is_checked ? 'line-through text-gray-400' : 'text-gray-900'
                          )}>
                            {item.label}
                          </span>
                          {item.is_optional && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                              if applicable
                            </span>
                          )}
                        </div>
                        {item.is_checked && item.checked_at && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Checked by {(item.checker as unknown as { full_name: string })?.full_name ?? 'Admin'} · {formatTs(item.checked_at)}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-gray-500 mt-1 italic">"{item.notes}"</p>
                        )}
                      </div>

                      {/* Notes button */}
                      {!isComplete && (
                        <button
                          onClick={() => setNotesItem(item)}
                          className="flex-shrink-0 w-7 h-7 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 flex items-center justify-center transition-colors mt-0.5"
                          title="Add notes"
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Modals ── */}

      {/* Notes modal */}
      {notesItem && (
        <NotesModal
          item={notesItem}
          onSave={saveNotes}
          onClose={() => setNotesItem(null)}
        />
      )}

      {/* Edit info modal */}
      {editInfoOpen && (
        <Dialog open onOpenChange={(o) => { if (!o) setEditInfoOpen(false); }}>
          <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto p-0 gap-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
              <DialogTitle className="flex items-center gap-2 text-gray-900">
                <User className="w-5 h-5 text-[#0D9488]" />
                Edit Employee Information
              </DialogTitle>
            </DialogHeader>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason for Separation</label>
                <Select
                  value={infoForm.separation_reason}
                  onValueChange={(v) => setInfoForm((f) => ({ ...f, separation_reason: v as SeparationReason }))}
                >
                  <SelectTrigger className="h-9 text-sm border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Resigned">Resigned</SelectItem>
                    <SelectItem value="Contract Ended">Contract Ended</SelectItem>
                    <SelectItem value="Terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'last_working_day', label: 'Last Working Day' },
                  { key: 'final_employment_date', label: 'Final Employment Date' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{f.label}</label>
                    <input
                      type="date"
                      value={infoForm[f.key as keyof typeof infoForm]}
                      onChange={(e) => setInfoForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Position / Title</label>
                <input
                  type="text"
                  value={infoForm.position}
                  onChange={(e) => setInfoForm((f) => ({ ...f, position: e.target.value }))}
                  className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Personal Email Address</label>
                <input
                  type="email"
                  value={infoForm.personal_email}
                  onChange={(e) => setInfoForm((f) => ({ ...f, personal_email: e.target.value }))}
                  className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
                />
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditInfoOpen(false)} className="border-gray-200 text-gray-600">Cancel</Button>
              <Button onClick={saveInfo} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Audit log modal */}
      {showAudit && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowAudit(false); }}>
          <DialogContent className="max-w-[560px] max-h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <DialogTitle className="flex items-center gap-2 text-gray-900">
                <History className="w-5 h-5 text-[#0D9488]" />
                Audit Log — {employee.full_name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 space-y-3">
              {auditLog.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No audit entries yet.</p>
              ) : auditLog.map((log) => {
                const ACTION_COLORS: Record<string, string> = {
                  initiated: 'bg-[#CCFBF1] text-[#0D9488]',
                  item_checked: 'bg-blue-100 text-blue-700',
                  item_unchecked: 'bg-gray-100 text-gray-600',
                  completed: 'bg-[#CCFBF1] text-[#0D9488]',
                  info_updated: 'bg-[#FEF3C7] text-[#92400E]',
                };
                return (
                  <div key={log.id} className="flex gap-3 text-xs">
                    <div className="flex flex-col items-center">
                      <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold', ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-500')}>
                        {log.action === 'initiated' || log.action === 'completed' ? '★' : log.action === 'item_checked' ? '✓' : log.action === 'item_unchecked' ? '○' : '✎'}
                      </div>
                      <div className="w-px flex-1 bg-gray-100 mt-1" />
                    </div>
                    <div className="pb-3 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide', ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-500')}>
                          {log.action.replace('_', ' ')}
                        </span>
                        <span className="text-gray-500">by</span>
                        <span className="font-semibold text-gray-700">{(log.actor as unknown as { full_name: string })?.full_name ?? 'Admin'}</span>
                      </div>
                      {log.detail && <p className="text-gray-600 mt-0.5 truncate">{log.detail}</p>}
                      <p className="text-gray-400 mt-0.5">{formatTs(log.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Mark complete confirmation */}
      <AlertDialog open={showComplete} onOpenChange={setShowComplete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Offboarding as Complete?</AlertDialogTitle>
            <AlertDialogDescription>
              All mandatory checklist items have been completed. Marking this as complete will finalise the offboarding of <strong>{employee.full_name}</strong>. This action is logged and cannot be reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={completeOffboarding}
              disabled={completing}
              className="bg-[#0D9488] hover:bg-[#0F766E] text-white"
            >
              {completing ? 'Completing...' : 'Confirm & Complete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
