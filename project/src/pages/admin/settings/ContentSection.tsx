import React, { useEffect, useState, useCallback } from 'react';
import { supabase, type Announcement, type HandbookSection } from '../../../lib/supabase';
import { logAudit } from '../../../lib/auditLog';
import { useAuthStore } from '../../../store/authStore';
import { useToast } from '../../../hooks/use-toast';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Plus, Trash2, Edit2, Pin, Calendar, RefreshCw } from 'lucide-react';

const PRIORITY_COLORS: Record<string, string> = {
  normal:    'bg-gray-100 text-gray-700',
  important: 'bg-blue-100 text-blue-700',
  urgent:    'bg-red-100 text-red-700',
};

export const ContentSection: React.FC = () => {
  const { profile: me } = useAuthStore();
  const { toast } = useToast();
  const [tab, setTab]                     = useState<'announcements' | 'handbook'>('announcements');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [handbook, setHandbook]           = useState<HandbookSection[]>([]);
  const [loading, setLoading]             = useState(true);

  // Announcement form
  const [showAnnForm, setShowAnnForm]   = useState(false);
  const [editAnn, setEditAnn]           = useState<Announcement | null>(null);
  const [deleteAnn, setDeleteAnn]       = useState<Announcement | null>(null);
  const [annForm, setAnnForm]           = useState({ title: '', body: '', priority: 'normal', target_audience: 'all', is_pinned: false, expires_at: '' });
  const [savingAnn, setSavingAnn]       = useState(false);

  // Handbook form
  const [showHbForm, setShowHbForm]   = useState(false);
  const [editHb, setEditHb]           = useState<HandbookSection | null>(null);
  const [deleteHb, setDeleteHb]       = useState<HandbookSection | null>(null);
  const [hbForm, setHbForm]           = useState({ title: '', body: '' });
  const [savingHb, setSavingHb]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [annRes, hbRes] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('handbook_sections').select('*').order('display_order'),
    ]);
    setAnnouncements(annRes.data ?? []);
    setHandbook(hbRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Announcements ─────────────────────────────────────────────────────

  const openAddAnn = () => {
    setEditAnn(null);
    setAnnForm({ title: '', body: '', priority: 'normal', target_audience: 'all', is_pinned: false, expires_at: '' });
    setShowAnnForm(true);
  };

  const openEditAnn = (a: Announcement) => {
    setEditAnn(a);
    setAnnForm({ title: a.title, body: a.body, priority: a.priority, target_audience: a.target_audience, is_pinned: a.is_pinned, expires_at: a.expires_at?.slice(0, 10) ?? '' });
    setShowAnnForm(true);
  };

  const handleSaveAnn = async () => {
    if (!me || !annForm.title || !annForm.body) return;
    setSavingAnn(true);
    try {
      const payload = {
        title: annForm.title, body: annForm.body,
        priority: annForm.priority as Announcement['priority'],
        target_audience: annForm.target_audience as Announcement['target_audience'],
        is_pinned: annForm.is_pinned,
        expires_at: annForm.expires_at || null,
        requires_acknowledgement: false,
        ...(editAnn ? {} : { author_id: me.id }),
      };
      if (editAnn) {
        const { error } = await supabase.from('announcements').update(payload).eq('id', editAnn.id);
        if (error) throw error;
        await logAudit(me.id, me.full_name, 'announcement_updated', 'announcement', editAnn.id, { title: annForm.title });
        toast({ title: 'Announcement updated' });
      } else {
        const { error } = await supabase.from('announcements').insert(payload);
        if (error) throw error;
        await logAudit(me.id, me.full_name, 'announcement_created', 'announcement', undefined, { title: annForm.title });
        toast({ title: 'Announcement created' });
      }
      setShowAnnForm(false);
      load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSavingAnn(false);
    }
  };

  const handleDeleteAnn = async () => {
    if (!deleteAnn || !me) return;
    const { error } = await supabase.from('announcements').delete().eq('id', deleteAnn.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await logAudit(me.id, me.full_name, 'announcement_deleted', 'announcement', deleteAnn.id, { title: deleteAnn.title });
    toast({ title: 'Announcement deleted' });
    setDeleteAnn(null);
    load();
  };

  const togglePin = async (a: Announcement) => {
    if (!me) return;
    await supabase.from('announcements').update({ is_pinned: !a.is_pinned }).eq('id', a.id);
    await logAudit(me.id, me.full_name, a.is_pinned ? 'announcement_unpinned' : 'announcement_pinned', 'announcement', a.id);
    load();
  };

  // ── Handbook ──────────────────────────────────────────────────────────

  const openAddHb = () => { setEditHb(null); setHbForm({ title: '', body: '' }); setShowHbForm(true); };
  const openEditHb = (s: HandbookSection) => { setEditHb(s); setHbForm({ title: s.title, body: s.body }); setShowHbForm(true); };

  const handleSaveHb = async () => {
    if (!me || !hbForm.title || !hbForm.body) return;
    setSavingHb(true);
    try {
      if (editHb) {
        const { error } = await supabase.from('handbook_sections').update({ title: hbForm.title, body: hbForm.body, last_updated_by: me.id }).eq('id', editHb.id);
        if (error) throw error;
        await logAudit(me.id, me.full_name, 'handbook_updated', 'handbook_section', editHb.id, { title: hbForm.title });
        toast({ title: 'Section updated' });
      } else {
        const maxOrder = handbook.reduce((m, s) => Math.max(m, s.display_order), 0);
        const { error } = await supabase.from('handbook_sections').insert({ title: hbForm.title, body: hbForm.body, display_order: maxOrder + 1, last_updated_by: me.id });
        if (error) throw error;
        await logAudit(me.id, me.full_name, 'handbook_section_created', 'handbook_section', undefined, { title: hbForm.title });
        toast({ title: 'Section added' });
      }
      setShowHbForm(false);
      load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSavingHb(false);
    }
  };

  const handleDeleteHb = async () => {
    if (!deleteHb || !me) return;
    const { error } = await supabase.from('handbook_sections').delete().eq('id', deleteHb.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await logAudit(me.id, me.full_name, 'handbook_section_deleted', 'handbook_section', deleteHb.id, { title: deleteHb.title });
    toast({ title: 'Section deleted' });
    setDeleteHb(null);
    load();
  };

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {(['announcements', 'handbook'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-white text-[#0D9488] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{t}</button>
        ))}
      </div>

      {/* Announcements */}
      {tab === 'announcements' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{announcements.length} announcements</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={load} className="h-9 px-3"><RefreshCw className="w-4 h-4" /></Button>
              <Button size="sm" onClick={openAddAnn} className="h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5"><Plus className="w-4 h-4" /> New Announcement</Button>
            </div>
          </div>
          {loading ? <div className="text-center py-8 text-gray-400">Loading…</div> : (
            <div className="space-y-2">
              {announcements.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-4 border border-gray-200 rounded-xl bg-white hover:border-[#C4B5FD] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.is_pinned && <Pin className="w-3.5 h-3.5 text-[#0D9488] flex-shrink-0" />}
                      <p className="font-medium text-gray-900 text-sm truncate">{a.title}</p>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[a.priority]}`}>{a.priority}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.body}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{new Date(a.created_at).toLocaleDateString()}</span>
                      {a.expires_at && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Expires {new Date(a.expires_at).toLocaleDateString()}</span>}
                      <span>{a.target_audience}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${a.is_pinned ? 'text-[#0D9488]' : 'text-gray-400'} hover:bg-[#CCFBF1]`} title={a.is_pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(a)}><Pin className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-[#0D9488]" onClick={() => openEditAnn(a)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-50" onClick={() => setDeleteAnn(a)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Handbook */}
      {tab === 'handbook' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{handbook.length} sections</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={load} className="h-9 px-3"><RefreshCw className="w-4 h-4" /></Button>
              <Button size="sm" onClick={openAddHb} className="h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5"><Plus className="w-4 h-4" /> New Section</Button>
            </div>
          </div>
          {loading ? <div className="text-center py-8 text-gray-400">Loading…</div> : (
            <div className="space-y-2">
              {handbook.map(s => (
                <div key={s.id} className="flex items-start gap-3 p-4 border border-gray-200 rounded-xl bg-white hover:border-[#C4B5FD] transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-[#CCFBF1] flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-[#0D9488]">{s.display_order}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{s.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{s.body.slice(0, 120)}…</p>
                    <p className="text-xs text-gray-400 mt-0.5">Updated {new Date(s.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-[#0D9488]" onClick={() => openEditHb(s)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-50" onClick={() => setDeleteHb(s)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Announcement form dialog */}
      <Dialog open={showAnnForm} onOpenChange={o => !o && setShowAnnForm(false)}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editAnn ? 'Edit Announcement' : 'New Announcement'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Title" value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} />
            <Textarea placeholder="Body…" rows={5} value={annForm.body} onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))} className="resize-none" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Priority</label>
                <Select value={annForm.priority} onValueChange={v => setAnnForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="important">Important</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Audience</label>
                <Select value={annForm.target_audience} onValueChange={v => setAnnForm(f => ({ ...f, target_audience: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="admin">Admins</SelectItem>
                    <SelectItem value="employee">Employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Expires (optional)</label>
                <Input type="date" value={annForm.expires_at} onChange={e => setAnnForm(f => ({ ...f, expires_at: e.target.value }))} className="h-9" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={annForm.is_pinned} onChange={e => setAnnForm(f => ({ ...f, is_pinned: e.target.checked }))} className="rounded" />
                  Pin announcement
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowAnnForm(false)}>Cancel</Button>
              <Button onClick={handleSaveAnn} disabled={savingAnn || !annForm.title || !annForm.body} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">
                {savingAnn ? 'Saving…' : editAnn ? 'Update' : 'Publish'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Handbook form dialog */}
      <Dialog open={showHbForm} onOpenChange={o => !o && setShowHbForm(false)}>
        <DialogContent className="max-w-[680px] h-[600px] max-h-[88vh] flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>{editHb ? 'Edit Section' : 'New Handbook Section'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Section title" value={hbForm.title} onChange={e => setHbForm(f => ({ ...f, title: e.target.value }))} />
            <Textarea placeholder="Content…" rows={12} value={hbForm.body} onChange={e => setHbForm(f => ({ ...f, body: e.target.value }))} className="resize-none font-mono text-sm" />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowHbForm(false)}>Cancel</Button>
              <Button onClick={handleSaveHb} disabled={savingHb || !hbForm.title || !hbForm.body} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">
                {savingHb ? 'Saving…' : editHb ? 'Update' : 'Add Section'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete announcement */}
      <AlertDialog open={!!deleteAnn} onOpenChange={o => !o && setDeleteAnn(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#EF4444]">Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>Delete <strong>"{deleteAnn?.title}"</strong>? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAnn} className="bg-[#EF4444] hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete handbook section */}
      <AlertDialog open={!!deleteHb} onOpenChange={o => !o && setDeleteHb(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#EF4444]">Delete Section</AlertDialogTitle>
            <AlertDialogDescription>Delete <strong>"{deleteHb?.title}"</strong>? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHb} className="bg-[#EF4444] hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
