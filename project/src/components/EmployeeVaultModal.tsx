import React, { useEffect, useState, useCallback } from 'react';
import { supabase, Profile, EmployeePersonalData, EmployeeEmergencyContact, ShirtSize } from '../lib/supabase';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { User, Phone, Save, Pencil, MapPin, CreditCard, Shirt, Cake, ShieldAlert, Shield, Clock, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, CalendarDays, Plus, Trash2, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function isBirthdayThisMonth(dob: string): boolean {
  const birth = new Date(dob);
  return birth.getMonth() === new Date().getMonth();
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MU', { day: '2-digit', month: 'short', year: 'numeric' });
}

const SHIRT_SIZES: ShirtSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

// ─── Section card ─────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; icon: React.ElementType; iconColor?: string; children: React.ReactNode }> = ({
  title, icon: Icon, iconColor = '#0D9488', children,
}) => (
  <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-50">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${iconColor}15` }}>
        <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
      </div>
      <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// ─── Emergency contact types ───────────────────────────────────────────────────

type ContactDraft = {
  id: string;
  contact_name: string;
  relationship: string;
  phone_primary: string;
  phone_alt: string;
  is_primary: boolean;
};

interface ContactFormState {
  editId: string | null;
  contact_name: string;
  relationship: string;
  phone_primary: string;
  phone_alt: string;
  is_primary: boolean;
}

const RELATIONSHIP_OPTIONS = ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Colleague', 'Other'];

// ─── Single contact card (view + edit mode) ───────────────────────────────────

interface ContactCardProps {
  contact: ContactDraft;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
}

const ContactCard: React.FC<ContactCardProps> = ({ contact, editing, onEdit, onDelete, onSetPrimary }) => (
  <div className={cn('bg-white border rounded-xl p-4 space-y-3', contact.is_primary ? 'border-[#0D9488] ring-1 ring-[#0D9488]/20' : 'border-[#E5E7EB]')}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-full bg-[#CCFBF1] flex items-center justify-center flex-shrink-0">
          <span className="text-[#0D9488] font-bold text-xs">{contact.contact_name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0A0F1E] truncate">{contact.contact_name || '—'}</p>
          {contact.relationship && (
            <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 mt-0.5">
              {contact.relationship}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {contact.is_primary && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#CCFBF1] text-[#0D9488]">
            <Star className="w-2.5 h-2.5" /> Primary
          </span>
        )}
        {editing && (
          <>
            {!contact.is_primary && (
              <button
                type="button"
                onClick={onSetPrimary}
                title="Set as primary"
                className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-[#0D9488] hover:bg-[#F0FDFA] transition-colors"
              >
                <Star className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-[#0D9488] hover:bg-[#F0FDFA] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:text-[#EF4444] hover:bg-[#FEE2E2] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      {contact.phone_primary ? (
        <a href={`tel:${contact.phone_primary}`} className="flex items-center gap-1.5 text-xs text-[#0D9488] font-medium hover:underline">
          <Phone className="w-3.5 h-3.5" /> {contact.phone_primary}
        </a>
      ) : (
        <p className="text-xs text-gray-400 italic">No primary phone</p>
      )}
      {contact.phone_alt ? (
        <a href={`tel:${contact.phone_alt}`} className="flex items-center gap-1.5 text-xs text-gray-500 hover:underline">
          <Phone className="w-3.5 h-3.5" /> {contact.phone_alt}
        </a>
      ) : (
        <p className="text-xs text-gray-400 italic">No alt phone</p>
      )}
    </div>
  </div>
);

// ─── Inline add / edit form ───────────────────────────────────────────────────

interface ContactFormPanelProps {
  form: ContactFormState;
  onChange: (f: ContactFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isOnly: boolean;
}

const ContactFormPanel: React.FC<ContactFormPanelProps> = ({ form, onChange, onSubmit, onCancel, isOnly }) => {
  const set = (patch: Partial<ContactFormState>) => onChange({ ...form, ...patch });
  return (
    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-700">{form.editId ? 'Edit Contact' : 'New Emergency Contact'}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Full Name *</p>
          <input
            type="text"
            value={form.contact_name}
            onChange={(e) => set({ contact_name: e.target.value })}
            placeholder="Contact full name"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#CCFBF1] bg-white placeholder:text-gray-400"
          />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Relationship</p>
          <select
            value={form.relationship}
            onChange={(e) => set({ relationship: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white"
          >
            <option value="">Select…</option>
            {RELATIONSHIP_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Primary Phone</p>
          <input
            type="tel"
            value={form.phone_primary}
            onChange={(e) => set({ phone_primary: e.target.value })}
            placeholder="+230 5XXX XXXX"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white placeholder:text-gray-400"
          />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Alternative Phone</p>
          <input
            type="tel"
            value={form.phone_alt}
            onChange={(e) => set({ phone_alt: e.target.value })}
            placeholder="+230 5XXX XXXX (optional)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white placeholder:text-gray-400"
          />
        </div>
      </div>
      {!isOnly && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.is_primary}
            onChange={(e) => set({ is_primary: e.target.checked })}
            className="w-4 h-4 accent-[#0D9488]"
          />
          <span className="text-xs font-medium text-gray-600">Set as primary contact</span>
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSubmit} disabled={!form.contact_name.trim()}
          className="bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs h-8">
          {form.editId ? 'Update' : 'Add Contact'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="text-xs h-8">Cancel</Button>
      </div>
    </div>
  );
};

// ─── Main Vault Modal ─────────────────────────────────────────────────────────

interface EmployeeVaultModalProps {
  employee: Profile | null;
  onClose: () => void;
}

type Tab = 'basic' | 'personal' | 'emergency';

const PROBATION_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  in_probation: { bg: 'bg-gray-100', text: 'text-[#6B7280]', label: 'In Probation' },
  passed:       { bg: 'bg-[#CCFBF1]', text: 'text-[#0D9488]', label: 'Passed' },
  extended:     { bg: 'bg-red-100', text: 'text-red-700', label: 'Extended' },
};

interface BasicDraft {
  full_name: string;
  department: string;
  role: 'admin' | 'employee';
  is_active: boolean;
  date_of_hire: string;
  total_annual_entitlement: number;
  sick_entitlement: number;
  annual_entitlement: number;
  has_probation: boolean;
  probation_status: 'in_probation' | 'passed' | 'extended';
  probation_duration_months: number;
  probation_end_date: string;
}

export const EmployeeVaultModal: React.FC<EmployeeVaultModalProps> = ({ employee, onClose }) => {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('basic');
  const [personalData, setPersonalData] = useState<Partial<EmployeePersonalData>>({});
  const [contacts, setContacts] = useState<EmployeeEmergencyContact[]>([]);
  const [originalContactIds, setOriginalContactIds] = useState<string[]>([]);
  const [draftContacts, setDraftContacts] = useState<ContactDraft[]>([]);
  const [contactForm, setContactForm] = useState<ContactFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const initBasic = (emp: Profile): BasicDraft => ({
    full_name: emp.full_name,
    department: emp.department,
    role: emp.role,
    is_active: emp.is_active,
    date_of_hire: emp.date_of_hire ?? '',
    total_annual_entitlement: emp.total_annual_entitlement ?? 22,
    sick_entitlement: emp.sick_entitlement ?? 21,
    annual_entitlement: emp.annual_entitlement ?? 22,
    has_probation: emp.has_probation ?? true,
    probation_status: emp.probation_status ?? 'passed',
    probation_duration_months: emp.probation_duration_months ?? 3,
    probation_end_date: emp.probation_end_date ?? '',
  });

  const [basicDraft, setBasicDraft] = useState<BasicDraft>(employee ? initBasic(employee) : {} as BasicDraft);
  const [draft, setDraft] = useState<{ personal: Partial<EmployeePersonalData> }>({ personal: {} });

  const fetchData = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    const [pd, ec] = await Promise.all([
      supabase.from('employee_personal_data').select('*').eq('employee_id', employee.id).maybeSingle(),
      supabase.from('employee_emergency_contacts').select('*').eq('employee_id', employee.id).order('is_primary', { ascending: false }),
    ]);
    setPersonalData(pd.data ?? {});
    const ecList = (ec.data ?? []) as EmployeeEmergencyContact[];
    setContacts(ecList);
    setOriginalContactIds(ecList.map((c) => c.id));
    setLoading(false);
  }, [employee]);

  useEffect(() => {
    if (employee) {
      fetchData();
      setTab('basic');
      setEditing(false);
      setBasicDraft(initBasic(employee));
    }
  }, [employee, fetchData]);

  // Auto-calc probation end date
  useEffect(() => {
    if (!basicDraft.has_probation || !basicDraft.date_of_hire) return;
    const hire = new Date(basicDraft.date_of_hire);
    hire.setMonth(hire.getMonth() + Number(basicDraft.probation_duration_months));
    setBasicDraft((d) => ({ ...d, probation_end_date: hire.toISOString().split('T')[0] }));
  }, [basicDraft.date_of_hire, basicDraft.probation_duration_months, basicDraft.has_probation]);

  // ── Contact draft helpers ────────────────────────────────────────────────────

  const openAddContactForm = () => {
    setContactForm({
      editId: null,
      contact_name: '',
      relationship: '',
      phone_primary: '',
      phone_alt: '',
      is_primary: draftContacts.length === 0,
    });
  };

  const openEditContactForm = (c: ContactDraft) => {
    setContactForm({ editId: c.id, contact_name: c.contact_name, relationship: c.relationship, phone_primary: c.phone_primary, phone_alt: c.phone_alt, is_primary: c.is_primary });
  };

  const submitContactForm = () => {
    if (!contactForm || !contactForm.contact_name.trim()) return;
    const makePrimary = contactForm.is_primary || draftContacts.length === 0;

    let updated: ContactDraft[];
    if (contactForm.editId) {
      updated = draftContacts.map((c) => c.id === contactForm.editId ? { ...c, ...contactForm, id: c.id } : c);
    } else {
      updated = [...draftContacts, { id: `new-${Date.now()}`, contact_name: contactForm.contact_name, relationship: contactForm.relationship, phone_primary: contactForm.phone_primary, phone_alt: contactForm.phone_alt, is_primary: makePrimary }];
    }

    if (makePrimary) {
      const targetId = contactForm.editId ?? updated[updated.length - 1].id;
      updated = updated.map((c) => ({ ...c, is_primary: c.id === targetId }));
    }

    setDraftContacts(updated);
    setContactForm(null);
  };

  const deleteContact = (id: string) => {
    const wasPrimary = draftContacts.find((c) => c.id === id)?.is_primary;
    const updated = draftContacts.filter((c) => c.id !== id);
    if (wasPrimary && updated.length > 0) updated[0] = { ...updated[0], is_primary: true };
    setDraftContacts(updated);
  };

  const setPrimaryContact = (id: string) => {
    setDraftContacts((prev) => prev.map((c) => ({ ...c, is_primary: c.id === id })));
  };

  // ── startEdit / cancelEdit / saveAll ─────────────────────────────────────────

  const startEdit = () => {
    setDraft({ personal: { ...personalData } });
    setDraftContacts(contacts.map((c) => ({ ...c })));
    setContactForm(null);
    if (employee) setBasicDraft(initBasic(employee));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft({ personal: {} });
    setDraftContacts([]);
    setContactForm(null);
    if (employee) setBasicDraft(initBasic(employee));
  };

  const saveAll = async () => {
    if (!employee) return;
    setSaving(true);

    // Save basic info
    const { error: basicErr } = await supabase.from('profiles').update({
      full_name: basicDraft.full_name,
      department: basicDraft.department,
      role: basicDraft.role,
      is_active: basicDraft.is_active,
      date_of_hire: basicDraft.date_of_hire || null,
      total_annual_entitlement: basicDraft.total_annual_entitlement,
      sick_entitlement: basicDraft.sick_entitlement,
      annual_entitlement: basicDraft.annual_entitlement,
      has_probation: basicDraft.has_probation,
      probation_status: basicDraft.probation_status,
      probation_duration_months: basicDraft.probation_duration_months,
      probation_end_date: basicDraft.probation_end_date || null,
    }).eq('id', employee.id);
    if (basicErr) { toast({ title: 'Error saving basic info', description: basicErr.message, variant: 'destructive' }); setSaving(false); return; }

    // Upsert personal data
    const personalPayload = { ...draft.personal, employee_id: employee.id, updated_at: new Date().toISOString() };
    if (personalData.id) {
      await supabase.from('employee_personal_data').update(personalPayload).eq('id', personalData.id);
    } else {
      await supabase.from('employee_personal_data').insert(personalPayload);
    }

    // Sync emergency contacts
    const now = new Date().toISOString();
    const draftIds = draftContacts.filter((c) => !c.id.startsWith('new-')).map((c) => c.id);
    const toDelete = originalContactIds.filter((id) => !draftIds.includes(id));
    if (toDelete.length) {
      await supabase.from('employee_emergency_contacts').delete().in('id', toDelete);
    }
    for (const c of draftContacts) {
      const payload = { contact_name: c.contact_name, relationship: c.relationship, phone_primary: c.phone_primary, phone_alt: c.phone_alt, is_primary: c.is_primary, updated_at: now };
      if (c.id.startsWith('new-')) {
        await supabase.from('employee_emergency_contacts').insert({ ...payload, employee_id: employee.id });
      } else {
        await supabase.from('employee_emergency_contacts').update(payload).eq('id', c.id);
      }
    }

    // Denormalise primary contact to profiles for CSV export
    const primary = draftContacts.find((c) => c.is_primary) ?? draftContacts[0] ?? null;
    await supabase.from('profiles').update({
      emergency_contact_name: primary?.contact_name ?? null,
      emergency_contact_relationship: primary?.relationship ?? null,
      emergency_contact_phone: primary?.phone_primary ?? null,
    }).eq('id', employee.id);

    toast({ title: 'Profile saved' });
    setSaving(false);
    setEditing(false);
    fetchData();
  };

  const updatePersonal = (field: keyof EmployeePersonalData, value: string) => {
    setDraft((d) => ({ ...d, personal: { ...d.personal, [field]: value || null } }));
  };

  const pd = editing ? draft.personal : personalData;
  const activeContacts = editing ? draftContacts : contacts;

  // Fallback to profile-level columns when employee_personal_data row not yet created
  const dob = pd.date_of_birth ?? employee?.date_of_birth ?? null;
  const displayAddress = pd.address || employee?.residential_address || null;
  const displayNationalId = pd.national_id || employee?.national_id || null;
  const birthdayThisMonth = dob ? isBirthdayThisMonth(dob) : false;

  // Profile-level emergency contact (used as fallback when no table rows exist)
  const profileContact = employee && employee.emergency_contact_name ? {
    name: employee.emergency_contact_name,
    relationship: employee.emergency_contact_relationship ?? '',
    phone: employee.emergency_contact_phone ?? '',
  } : null;

  if (!employee) return null;

  return (
    <Dialog open={!!employee} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[680px] h-[600px] max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* ─── Header ───────────────────────────────────────────────────────── */}
        <DialogHeader className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#CCFBF1] flex items-center justify-center font-bold text-[#0D9488] text-base flex-shrink-0">
                {employee.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-gray-900 leading-tight flex items-center gap-2">
                  {employee.full_name}
                  {birthdayThisMonth && !editing && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 text-pink-600">
                      <Cake className="w-3 h-3" /> Birthday this month!
                    </span>
                  )}
                </DialogTitle>
                <p className="text-xs text-gray-400 mt-0.5">{employee.email} · {employee.department}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!editing ? (
                <Button
                  size="sm" variant="outline"
                  onClick={startEdit}
                  className="gap-1.5 text-xs"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Profile
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving} className="text-xs">Cancel</Button>
                  <Button
                    size="sm"
                    onClick={saveAll}
                    disabled={saving}
                    className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5 text-xs"
                  >
                    {saving
                      ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
                      : <><Save className="w-3.5 h-3.5" />Save All</>}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 border-b border-gray-100 -mb-4 pb-0">
            {([
              { key: 'basic', label: 'Basic Info' },
              { key: 'personal', label: 'Personal Data' },
              { key: 'emergency', label: 'Emergency Contact' },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'text-xs font-semibold px-4 py-2.5 border-b-2 transition-colors',
                  tab === key
                    ? 'border-[#0D9488] text-[#0D9488]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* ─── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/40">
          {loading && tab !== 'basic' ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
            </div>
          ) : tab === 'basic' ? (
            <div className="space-y-4">
              <SectionCard title="Identity & Role" icon={User}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Full Name</p>
                    {editing ? (
                      <input type="text" value={basicDraft.full_name} onChange={(e) => setBasicDraft((d) => ({ ...d, full_name: e.target.value }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#CCFBF1] bg-white" />
                    ) : <p className="text-sm font-medium text-gray-800">{employee.full_name}</p>}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Department</p>
                    {editing ? (
                      <input type="text" value={basicDraft.department} onChange={(e) => setBasicDraft((d) => ({ ...d, department: e.target.value }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#CCFBF1] bg-white" />
                    ) : <p className="text-sm font-medium text-gray-800">{employee.department}</p>}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Role</p>
                    {editing ? (
                      <Select value={basicDraft.role} onValueChange={(v) => setBasicDraft((d) => ({ ...d, role: v as 'admin' | 'employee' }))}>
                        <SelectTrigger className="border-gray-200 text-sm h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="employee">Employee</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : <p className="text-sm font-medium text-gray-800 capitalize">{employee.role}</p>}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</p>
                    {editing ? (
                      <Select value={basicDraft.is_active ? 'active' : 'inactive'} onValueChange={(v) => setBasicDraft((d) => ({ ...d, is_active: v === 'active' }))}>
                        <SelectTrigger className="border-gray-200 text-sm h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn('inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full', employee.is_active ? 'bg-[#CCFBF1] text-[#0D9488]' : 'bg-gray-100 text-gray-500')}>
                        {employee.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Date of Hire</p>
                    {editing ? (
                      <input type="date" value={basicDraft.date_of_hire} onChange={(e) => setBasicDraft((d) => ({ ...d, date_of_hire: e.target.value }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white" />
                    ) : <p className="text-sm font-medium text-gray-800">{formatDate(employee.date_of_hire)}</p>}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Leave Entitlements" icon={CalendarDays} iconColor="#3B82F6">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Total Annual (days)', key: 'total_annual_entitlement' as const },
                    { label: 'Sick Leave (days)', key: 'sick_entitlement' as const },
                    { label: 'Annual Override (days)', key: 'annual_entitlement' as const },
                  ].map(({ label, key }) => (
                    <div key={key} className="space-y-1">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                      {editing ? (
                        <input type="number" min={0} max={365} value={basicDraft[key]}
                          onChange={(e) => setBasicDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white" />
                      ) : <p className="text-sm font-bold text-gray-800">{(employee as Profile)[key]}</p>}
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Probation" icon={Shield} iconColor="#6B7280">
                <div className="space-y-3">
                  {editing ? (
                    <>
                      <button type="button"
                        onClick={() => setBasicDraft((d) => ({ ...d, has_probation: !d.has_probation, probation_status: d.has_probation ? 'passed' : 'in_probation' }))}
                        className={cn('w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                          basicDraft.has_probation ? 'bg-[#CCFBF1] border-[#99F6E4] text-[#0D9488]' : 'bg-gray-50 border-gray-200 text-gray-500')}>
                        <Shield className="w-4 h-4" />
                        {basicDraft.has_probation ? 'Probation Period Active' : 'No Probation'}
                        <span className="ml-auto text-xs opacity-60">Click to toggle</span>
                      </button>
                      {basicDraft.has_probation && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Duration</p>
                            <Select value={String(basicDraft.probation_duration_months)} onValueChange={(v) => setBasicDraft((d) => ({ ...d, probation_duration_months: Number(v) }))}>
                              <SelectTrigger className="border-gray-200 text-sm h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[3,6,12,18,24].map((m) => <SelectItem key={m} value={String(m)}>{m} months</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><CalendarDays className="w-3 h-3" /> End Date</p>
                            <input type="date" value={basicDraft.probation_end_date}
                              onChange={(e) => setBasicDraft((d) => ({ ...d, probation_end_date: e.target.value }))}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white" />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</p>
                            <div className="grid grid-cols-3 gap-2">
                              {(['in_probation', 'passed', 'extended'] as const).map((s) => {
                                const st = PROBATION_STATUS_STYLES[s];
                                const Icon = s === 'passed' ? CheckCircle2 : s === 'extended' ? AlertTriangle : Clock;
                                return (
                                  <button key={s} type="button" onClick={() => setBasicDraft((d) => ({ ...d, probation_status: s }))}
                                    className={cn('flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-semibold transition-all',
                                      basicDraft.probation_status === s ? `${st.bg} ${st.text} border-current` : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300')}>
                                    <Icon className="w-4 h-4" />{st.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full',
                        PROBATION_STATUS_STYLES[employee.probation_status ?? 'passed'].bg,
                        PROBATION_STATUS_STYLES[employee.probation_status ?? 'passed'].text)}>
                        {employee.probation_status === 'passed' ? <CheckCircle2 className="w-3 h-3" /> : employee.probation_status === 'extended' ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {PROBATION_STATUS_STYLES[employee.probation_status ?? 'passed'].label}
                      </span>
                      {employee.probation_end_date && (
                        <p className="text-xs text-gray-500">until {formatDate(employee.probation_end_date)}</p>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>
          ) : tab === 'personal' ? (
            <div className="space-y-4">
              {/* Basic Information */}
              <SectionCard title="Basic Information" icon={User}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Date of Birth</p>
                    {editing ? (
                      <input
                        type="date"
                        value={draft.personal.date_of_birth ?? ''}
                        onChange={(e) => updatePersonal('date_of_birth', e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className={cn('text-sm font-medium', dob ? 'text-gray-800' : 'text-gray-400 italic')}>
                          {dob ? formatDate(dob) : 'Not set'}
                        </p>
                        {dob && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            Age {calcAge(dob)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Shirt Size</p>
                    {editing ? (
                      <Select
                        value={draft.personal.shirt_size ?? ''}
                        onValueChange={(v) => updatePersonal('shirt_size', v)}
                      >
                        <SelectTrigger className="border-gray-200 text-sm h-9">
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          {SHIRT_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Shirt className="w-4 h-4 text-gray-400" />
                        <p className={cn('text-sm font-medium', pd.shirt_size ? 'text-gray-800' : 'text-gray-400 italic')}>
                          {pd.shirt_size ?? 'Not set'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="col-span-2 space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Residential Address</p>
                    {editing ? (
                      <textarea
                        value={draft.personal.address ?? ''}
                        onChange={(e) => updatePersonal('address', e.target.value)}
                        placeholder="Full residential address"
                        rows={2}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] resize-none bg-white placeholder:text-gray-400"
                      />
                    ) : (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <p className={cn('text-sm font-medium', displayAddress ? 'text-gray-800' : 'text-gray-400 italic')}>
                          {displayAddress || 'Not set'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="col-span-2 space-y-1">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">National ID / Passport Number</p>
                    {editing ? (
                      <input
                        type="text"
                        value={draft.personal.national_id ?? ''}
                        onChange={(e) => updatePersonal('national_id', e.target.value)}
                        placeholder="NID or Passport number"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white placeholder:text-gray-400"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-gray-400" />
                        <p className={cn('text-sm font-mono font-medium', displayNationalId ? 'text-gray-800' : 'text-gray-400 italic')}>
                          {displayNationalId || 'Not set'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>

            </div>
          ) : (
            <div className="space-y-3">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#FFF5F5] border border-[#FEE2E2] rounded-[10px]">
                <ShieldAlert className="w-4 h-4 text-[#EF4444] flex-shrink-0" />
                <h3 className="font-semibold text-[#374151] text-sm">Emergency Contacts</h3>
                {activeContacts.length > 0 && (
                  <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {activeContacts.length} / 5
                  </span>
                )}
              </div>

              {/* Profile-level emergency contact (fallback when no table rows exist) */}
              {activeContacts.length === 0 && !contactForm && !editing && profileContact && (
                <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#CCFBF1] flex items-center justify-center flex-shrink-0">
                      <span className="text-[#0D9488] font-bold text-xs">{profileContact.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0A0F1E]">{profileContact.name}</p>
                      {profileContact.relationship && (
                        <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 mt-0.5">
                          {profileContact.relationship}
                        </span>
                      )}
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#CCFBF1] text-[#0D9488]">
                      <Star className="w-2.5 h-2.5" /> Primary
                    </span>
                  </div>
                  {profileContact.phone && (
                    <a href={`tel:${profileContact.phone}`} className="flex items-center gap-1.5 text-xs text-[#0D9488] font-medium hover:underline">
                      <Phone className="w-3.5 h-3.5" /> {profileContact.phone}
                    </a>
                  )}
                </div>
              )}

              {/* Empty state */}
              {activeContacts.length === 0 && !contactForm && (editing || !profileContact) && (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">No emergency contacts on file</p>
                  {editing && (
                    <button onClick={openAddContactForm} className="mt-1 text-xs text-[#0D9488] font-semibold hover:underline">
                      + Add Emergency Contact
                    </button>
                  )}
                </div>
              )}

              {/* Contact cards */}
              {activeContacts.map((c) => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  editing={editing}
                  onEdit={() => openEditContactForm(c)}
                  onDelete={() => deleteContact(c.id)}
                  onSetPrimary={() => setPrimaryContact(c.id)}
                />
              ))}

              {/* Inline add/edit form */}
              {editing && contactForm && (
                <ContactFormPanel
                  form={contactForm}
                  onChange={setContactForm}
                  onSubmit={submitContactForm}
                  onCancel={() => setContactForm(null)}
                  isOnly={draftContacts.length === 0}
                />
              )}

              {/* Add button */}
              {editing && !contactForm && activeContacts.length > 0 && activeContacts.length < 5 && (
                <button
                  type="button"
                  onClick={openAddContactForm}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-gray-300 rounded-xl text-xs font-semibold text-gray-500 hover:border-[#0D9488] hover:text-[#0D9488] hover:bg-[#F0FDFA] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Emergency Contact
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
