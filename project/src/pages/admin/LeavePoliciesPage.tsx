import React, { useEffect, useState, useCallback } from 'react';
import { supabase, LeavePolicy, PolicyNote } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { Check, Plus, Trash2, Lock, GripVertical, CircleAlert as AlertCircle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';

const DEFAULT_TYPES = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid'];

const COLOR_SWATCHES = [
  '#0D9488', '#3B82F6', '#0F766E', '#EC4899',
  '#F59E0B', '#EF4444', '#10B981', '#6B7280',
];

interface RowEdit {
  days_allowed: number;
  description: string;
  dirty: boolean;
  saving: boolean;
}

interface NoteEdit {
  text: string;
  dirty: boolean;
  saving: boolean;
}

export const LeavePoliciesPage: React.FC = () => {
  const { toast } = useToast();

  // Policies
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({});
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<LeavePolicy | null>(null);

  // Add type modal
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState('');
  const [newDays, setNewDays] = useState(10);
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(COLOR_SWATCHES[0]);
  const [addSaving, setAddSaving] = useState(false);

  // Policy notes
  const [notes, setNotes] = useState<PolicyNote[]>([]);
  const [noteEdits, setNoteEdits] = useState<Record<string, NoteEdit>>({});
  const [notesLoading, setNotesLoading] = useState(true);
  const [addNoteText, setAddNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [noteDeleteId, setNoteDeleteId] = useState<string | null>(null);

  // ── Policies ────────────────────────────────────────────────────────────────

  const fetchPolicies = useCallback(async () => {
    const { data } = await supabase
      .from('leave_policies')
      .select('*')
      .order('leave_type');
    if (data) {
      setPolicies(data as LeavePolicy[]);
      const edits: Record<string, RowEdit> = {};
      (data as LeavePolicy[]).forEach((p) => {
        edits[p.id] = { days_allowed: p.days_allowed, description: p.description, dirty: false, saving: false };
      });
      setRowEdits(edits);
    }
    setPoliciesLoading(false);
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleRowChange = (id: string, field: 'days_allowed' | 'description', value: string | number) => {
    setRowEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value, dirty: true },
    }));
  };

  const handleSaveRow = async (policy: LeavePolicy) => {
    const edit = rowEdits[policy.id];
    if (!edit?.dirty) return;
    setRowEdits((prev) => ({ ...prev, [policy.id]: { ...prev[policy.id], saving: true } }));

    const { error } = await supabase
      .from('leave_policies')
      .update({
        days_allowed: edit.days_allowed,
        description: edit.description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', policy.id);

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      setRowEdits((prev) => ({ ...prev, [policy.id]: { ...prev[policy.id], saving: false } }));
    } else {
      toast({ title: 'Policy updated', description: 'Changes are reflected for all employees immediately.' });
      setRowEdits((prev) => ({ ...prev, [policy.id]: { ...prev[policy.id], dirty: false, saving: false } }));
      fetchPolicies();
    }
  };

  const handleDeletePolicy = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('leave_policies').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Leave type deleted' });
      fetchPolicies();
    }
    setDeleteTarget(null);
  };

  const handleAddType = async () => {
    if (!newType.trim()) return;
    setAddSaving(true);
    const { error } = await supabase.from('leave_policies').insert({
      leave_type: newType.trim(),
      days_allowed: newDays,
      description: newDesc.trim(),
      color: newColor,
      is_default: false,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      toast({ title: 'Failed to add', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Leave type added', description: 'Policy updated for all employees.' });
      setAddOpen(false);
      setNewType('');
      setNewDays(10);
      setNewDesc('');
      setNewColor(COLOR_SWATCHES[0]);
      fetchPolicies();
    }
    setAddSaving(false);
  };

  // ── Policy Notes ─────────────────────────────────────────────────────────────

  const fetchNotes = useCallback(async () => {
    const { data } = await supabase
      .from('policy_notes')
      .select('*')
      .order('display_order');
    if (data) {
      setNotes(data as PolicyNote[]);
      const edits: Record<string, NoteEdit> = {};
      (data as PolicyNote[]).forEach((n) => {
        edits[n.id] = { text: n.note_text, dirty: false, saving: false };
      });
      setNoteEdits(edits);
    }
    setNotesLoading(false);
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handleNoteChange = (id: string, text: string) => {
    setNoteEdits((prev) => ({ ...prev, [id]: { ...prev[id], text, dirty: true } }));
  };

  const handleSaveNote = async (note: PolicyNote) => {
    const edit = noteEdits[note.id];
    if (!edit?.dirty) return;
    setNoteEdits((prev) => ({ ...prev, [note.id]: { ...prev[note.id], saving: true } }));
    const { error } = await supabase
      .from('policy_notes')
      .update({ note_text: edit.text, updated_at: new Date().toISOString() })
      .eq('id', note.id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      setNoteEdits((prev) => ({ ...prev, [note.id]: { ...prev[note.id], saving: false } }));
    } else {
      toast({ title: 'Note saved' });
      setNoteEdits((prev) => ({ ...prev, [note.id]: { ...prev[note.id], dirty: false, saving: false } }));
    }
  };

  const handleDeleteNote = async () => {
    if (!noteDeleteId) return;
    const { error } = await supabase.from('policy_notes').delete().eq('id', noteDeleteId);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Note deleted' });
      fetchNotes();
    }
    setNoteDeleteId(null);
  };

  const handleAddNote = async () => {
    if (!addNoteText.trim()) return;
    setAddingNote(true);
    const maxOrder = notes.length > 0 ? Math.max(...notes.map((n) => n.display_order)) + 1 : 1;
    const { error } = await supabase.from('policy_notes').insert({
      note_text: addNoteText.trim(),
      display_order: maxOrder,
    });
    if (error) {
      toast({ title: 'Failed to add note', description: error.message, variant: 'destructive' });
    } else {
      setAddNoteText('');
      fetchNotes();
    }
    setAddingNote(false);
  };

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Policies</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure day allowances for each leave type and manage company policy notes.
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Leave Type
        </Button>
      </div>

      {/* Policy rows table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[220px_110px_1fr_56px] gap-4 px-5 py-3 bg-gray-50/60 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Leave Type</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Days / Year</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</span>
          <span />
        </div>

        {policiesLoading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="grid grid-cols-[220px_110px_1fr_56px] gap-4 px-5 py-4 animate-pulse">
                <div className="h-5 w-28 bg-gray-100 rounded" />
                <div className="h-9 bg-gray-100 rounded-lg" />
                <div className="h-9 bg-gray-100 rounded-lg" />
                <div className="h-9 w-9 bg-gray-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {policies.map((policy) => {
              const edit = rowEdits[policy.id];
              const isDefault = DEFAULT_TYPES.includes(policy.leave_type);
              return (
                <div
                  key={policy.id}
                  className="grid grid-cols-[220px_110px_1fr_56px] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/40 transition-colors"
                >
                  {/* Leave type label */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: policy.color ?? '#6B7280' }}
                    />
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: `${policy.color ?? '#6B7280'}18`,
                        color: policy.color ?? '#6B7280',
                      }}
                    >
                      {policy.leave_type}
                    </span>
                    {isDefault && (
                      <Lock className="w-3 h-3 text-gray-300 flex-shrink-0" aria-label="Built-in type" />
                    )}
                  </div>

                  {/* Days input */}
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={edit?.days_allowed ?? policy.days_allowed}
                      onChange={(ev) => handleRowChange(policy.id, 'days_allowed', parseInt(ev.target.value) || 0)}
                      className="h-9 text-sm font-semibold border-gray-200 text-center tabular-nums focus:border-[#0D9488] focus:ring-[#CCFBF1] pr-1"
                    />
                  </div>

                  {/* Description input */}
                  <Textarea
                    value={edit?.description ?? policy.description}
                    onChange={(ev) => handleRowChange(policy.id, 'description', ev.target.value)}
                    rows={1}
                    className="text-sm border-gray-200 resize-none min-h-[36px] py-2 focus:border-[#0D9488] focus:ring-[#CCFBF1]"
                  />

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {edit?.dirty && (
                      <button
                        onClick={() => handleSaveRow(policy)}
                        disabled={edit.saving}
                        title="Save row"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#0D9488] text-white hover:bg-[#0F766E] transition-colors disabled:opacity-50"
                      >
                        {edit.saving ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    {!isDefault && !edit?.dirty && (
                      <button
                        onClick={() => setDeleteTarget(policy)}
                        title="Delete leave type"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Policy Notes section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Company Policy Notes</h2>
            <p className="text-xs text-gray-400 mt-0.5">Visible to all employees on their Policies page.</p>
          </div>
        </div>

        {notesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => {
              const edit = noteEdits[note.id];
              return (
                <div
                  key={note.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-3 items-start group"
                >
                  <GripVertical className="w-4 h-4 text-gray-300 mt-2 flex-shrink-0 cursor-grab" />
                  <Textarea
                    value={edit?.text ?? note.note_text}
                    onChange={(ev) => handleNoteChange(note.id, ev.target.value)}
                    rows={2}
                    className="flex-1 text-sm border-gray-200 resize-none focus:border-[#0D9488] focus:ring-[#CCFBF1]"
                  />
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {edit?.dirty && (
                      <button
                        onClick={() => handleSaveNote(note)}
                        disabled={edit.saving}
                        title="Save note"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#0D9488] text-white hover:bg-[#0F766E] transition-colors disabled:opacity-50"
                      >
                        {edit.saving ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setNoteDeleteId(note.id)}
                      title="Delete note"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add note */}
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-4 space-y-2">
              <Textarea
                value={addNoteText}
                onChange={(ev) => setAddNoteText(ev.target.value)}
                placeholder="Add a new policy note..."
                rows={2}
                className="text-sm border-gray-200 resize-none focus:border-[#0D9488] focus:ring-[#CCFBF1]"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={addingNote || !addNoteText.trim()}
                  className="bg-[#0D9488] hover:bg-[#0F766E] text-white h-8 text-xs gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Note
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Leave Type modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Custom Leave Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Leave Type Name</Label>
              <Input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                placeholder="e.g. Compassionate"
                className="border-gray-200 focus:border-[#0D9488] focus:ring-[#CCFBF1]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Days Allowed Per Year</Label>
              <Input
                type="number"
                min={0}
                max={365}
                value={newDays}
                onChange={(e) => setNewDays(parseInt(e.target.value) || 0)}
                className="border-gray-200 focus:border-[#0D9488] focus:ring-[#CCFBF1]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                placeholder="Brief description of when this leave applies"
                className="border-gray-200 resize-none focus:border-[#0D9488] focus:ring-[#CCFBF1]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className="w-8 h-8 rounded-full transition-all"
                    style={{
                      backgroundColor: c,
                      outline: newColor === c ? `3px solid ${c}` : 'none',
                      outlineOffset: '2px',
                      opacity: newColor === c ? 1 : 0.6,
                    }}
                  />
                ))}
              </div>
              {newType && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">Preview:</span>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${newColor}18`, color: newColor }}
                  >
                    {newType}
                  </span>
                </div>
              )}
            </div>
          </div>
          {DEFAULT_TYPES.map((t) => t.toLowerCase()).includes(newType.toLowerCase()) && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              This name matches a built-in leave type.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAddType}
              disabled={addSaving || !newType.trim()}
              className="bg-[#0D9488] hover:bg-[#0F766E] text-white"
            >
              {addSaving ? 'Adding...' : 'Add Leave Type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete policy confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.leave_type}" leave type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this leave type and its policy settings.
              Existing leave requests of this type will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePolicy}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete note confirm */}
      <AlertDialog open={!!noteDeleteId} onOpenChange={(open) => !open && setNoteDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this policy note?</AlertDialogTitle>
            <AlertDialogDescription>
              This note will be removed from the employee-facing policies page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
