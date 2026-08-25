import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { logAudit } from '../../../lib/auditLog';
import { useAuthStore } from '../../../store/authStore';
import { useToast } from '../../../hooks/use-toast';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';

interface Dept { name: string; count: number; }

export const DepartmentsSection: React.FC = () => {
  const { profile: me } = useAuthStore();
  const { toast } = useToast();
  const [depts, setDepts]         = useState<Dept[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [newDept, setNewDept]     = useState('');
  const [editDept, setEditDept]   = useState<Dept | null>(null);
  const [editName, setEditName]   = useState('');
  const [deleteDept, setDeleteDept] = useState<Dept | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('department');
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach(r => {
        const d = r.department ?? '(No Department)';
        counts[d] = (counts[d] ?? 0) + 1;
      });
      setDepts(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newDept.trim() || !me) return;
    setSaving(true);
    // No separate departments table — departments are implicit from profiles
    // Insert a placeholder to register the department (or just log it)
    await logAudit(me.id, me.full_name, 'department_added', 'department', undefined, { name: newDept.trim() });
    toast({ title: 'Department added', description: `"${newDept.trim()}" is now available` });
    // Add to local state immediately
    setDepts(d => [...d, { name: newDept.trim(), count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
    setNewDept('');
    setShowAdd(false);
    setSaving(false);
  };

  const handleRename = async () => {
    if (!editDept || !editName.trim() || !me) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ department: editName.trim() }).eq('department', editDept.name);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); setSaving(false); return; }
    await logAudit(me.id, me.full_name, 'department_renamed', 'department', undefined, { from: editDept.name, to: editName.trim() });
    toast({ title: 'Department renamed', description: `"${editDept.name}" → "${editName.trim()}"` });
    setEditDept(null);
    load();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteDept || !me) return;
    setSaving(true);
    if (deleteDept.count > 0) {
      if (!reassignTo) { toast({ title: 'Select a department to reassign employees to', variant: 'destructive' }); setSaving(false); return; }
      const { error } = await supabase.from('profiles').update({ department: reassignTo }).eq('department', deleteDept.name);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); setSaving(false); return; }
    }
    await logAudit(me.id, me.full_name, 'department_deleted', 'department', undefined, { name: deleteDept.name, reassigned_to: reassignTo || null });
    toast({ title: 'Department deleted', description: deleteDept.count > 0 ? `${deleteDept.count} employees moved to "${reassignTo}"` : undefined });
    setDeleteDept(null);
    setReassignTo('');
    load();
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{depts.length} departments · {depts.reduce((s, d) => s + d.count, 0)} employees total</p>
        <Button size="sm" onClick={() => setShowAdd(true)} className="h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5">
          <Plus className="w-4 h-4" /> Add Department
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {depts.map(d => (
            <div key={d.name} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-white hover:border-[#C4B5FD] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#CCFBF1] flex items-center justify-center">
                  <Users className="w-4 h-4 text-[#0D9488]" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{d.name}</p>
                  <p className="text-xs text-gray-500">{d.count} employee{d.count !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-[#0D9488]" onClick={() => { setEditDept(d); setEditName(d.name); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:bg-red-50" onClick={() => { setDeleteDept(d); setReassignTo(''); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-[420px] max-h-[60vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Department</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <Input placeholder="Department name" value={newDept} onChange={e => setNewDept(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving || !newDept.trim()} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!editDept} onOpenChange={o => !o && setEditDept(null)}>
        <DialogContent className="max-w-[420px] max-h-[60vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Rename Department</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <Input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename()} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditDept(null)}>Cancel</Button>
              <Button onClick={handleRename} disabled={saving || !editName.trim()} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">Rename</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteDept} onOpenChange={o => !o && setDeleteDept(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#EF4444]">Delete Department</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteDept?.name}</strong>?
              {(deleteDept?.count ?? 0) > 0 && (
                <span> {deleteDept?.count} employee(s) must be reassigned first.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(deleteDept?.count ?? 0) > 0 && (
            <div className="px-6 pb-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Reassign employees to</label>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select department…" /></SelectTrigger>
                <SelectContent>
                  {depts.filter(d => d.name !== deleteDept?.name).map(d => (
                    <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving || ((deleteDept?.count ?? 0) > 0 && !reassignTo)} className="bg-[#EF4444] hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
