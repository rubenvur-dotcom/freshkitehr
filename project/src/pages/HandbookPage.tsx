import React, { useEffect, useState, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { supabase, HandbookSection } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import {
  BookOpen, Search, Plus, Pencil, Trash2, Save, FileText, X,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';

// ─── Simple markdown-like renderer ───────────────────────────────────────────

function renderBody(text: string): React.ReactNode {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length) {
      nodes.push(
        <ul key={key} className="my-2 space-y-1 list-none">
          {listItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-gray-700 text-sm leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] flex-shrink-0 mt-2" />
              <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(inlineFormat(item), { ALLOWED_TAGS: ['strong', 'em'], ALLOWED_ATTR: [] }) }} />
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith('- ')) {
      listItems.push(line.slice(2));
    } else {
      flushList(`list-${i}`);
      if (line === '') {
        nodes.push(<div key={i} className="h-2" />);
      } else {
        nodes.push(
          <p key={i} className="text-sm text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(inlineFormat(line), { ALLOWED_TAGS: ['strong', 'em'], ALLOWED_ATTR: [] }) }} />
        );
      }
    }
  });
  flushList('list-end');
  return nodes;
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// ─── Section editor ───────────────────────────────────────────────────────────

interface SectionEditorProps {
  section: HandbookSection | null;
  onSave: (title: string, body: string, order: number) => Promise<void>;
  onCancel: () => void;
  maxOrder: number;
}

const SectionEditor: React.FC<SectionEditorProps> = ({ section, onSave, onCancel, maxOrder }) => {
  const [title, setTitle] = useState(section?.title ?? '');
  const [body, setBody] = useState(section?.body ?? '');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave(title.trim(), body, section?.display_order ?? maxOrder + 1);
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 text-sm">
          {section ? 'Edit Section' : 'New Section'}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview((v) => !v)}
            className={cn(
              'text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors',
              preview
                ? 'bg-[#CCFBF1] border-[#0D9488]/30 text-[#0D9488]'
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            )}
          >
            {preview ? 'Edit' : 'Preview'}
          </button>
          <button onClick={onCancel} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Section title…"
        className="w-full text-base font-semibold border border-gray-200 rounded-lg px-3 py-2 mb-3 outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#CCFBF1] bg-white text-gray-900 placeholder:text-gray-400"
      />

      {preview ? (
        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50/50 space-y-1">
          {renderBody(body)}
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write content here… Use **bold**, - bullet lists."
            className="flex-1 w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 leading-relaxed outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#CCFBF1] resize-none font-mono bg-white placeholder:text-gray-400 min-h-[280px]"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            Supports: **bold**, *italic*, - bullet lists, blank lines for spacing
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5"
        >
          {saving
            ? <span className="flex items-center gap-1.5"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</span>
            : <><Save className="w-3.5 h-3.5" />Save Section</>}
        </Button>
      </div>
    </div>
  );
};

// ─── Main Handbook Page ───────────────────────────────────────────────────────

export const HandbookPage: React.FC = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'admin';

  const [sections, setSections] = useState<HandbookSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingSection, setEditingSection] = useState<HandbookSection | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HandbookSection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const editorRef = useRef<HTMLDivElement | null>(null);

  const fetchSections = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('handbook_sections')
      .select('*')
      .order('display_order');
    if (data) {
      setSections(data as HandbookSection[]);
      if (data.length > 0 && !activeId) setActiveId(data[0].id);
    }
    setLoading(false);
  }, [activeId]);

  useEffect(() => { fetchSections(); }, []);

  // Filter by search
  const filtered = search
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.body.toLowerCase().includes(search.toLowerCase())
      )
    : sections;

  const scrollTo = (id: string) => {
    setActiveId(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSave = async (title: string, body: string, order: number) => {
    if (!profile) return;

    if (editingSection) {
      const { error } = await supabase
        .from('handbook_sections')
        .update({ title, body, updated_at: new Date().toISOString(), last_updated_by: profile.id })
        .eq('id', editingSection.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    } else {
      const { error } = await supabase
        .from('handbook_sections')
        .insert({ title, body, display_order: order, last_updated_by: profile.id });
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    }

    toast({ title: 'Saved' });
    setIsEditing(false);
    setEditingSection(null);
    await fetchSections();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('handbook_sections').delete().eq('id', deleteTarget.id);
    toast({ title: 'Section deleted' });
    setDeleteTarget(null);
    setDeleting(false);
    setIsEditing(false);
    fetchSections();
  };

  const openEdit = (s: HandbookSection) => {
    setEditingSection(s);
    setIsEditing(true);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const openNew = () => {
    setEditingSection(null);
    setIsEditing(true);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading handbook…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen">
      {/* ─── Left TOC ─────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-100 bg-white flex flex-col sticky top-0 h-screen overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#CCFBF1] flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-4 h-4 text-[#0D9488]" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm leading-tight">Employee Handbook</p>
              <p className="text-[11px] text-gray-400">{sections.length} sections</p>
            </div>
          </div>

          {/* Search — employees only (or anyone when not editing) */}
          {!isAdmin && (
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search handbook…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#0D9488] bg-gray-50 placeholder:text-gray-400"
              />
            </div>
          )}
        </div>

        {/* TOC list */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {filtered.map((s, i) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={cn(
                'w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all group',
                activeId === s.id
                  ? 'bg-[#CCFBF1] text-[#0D9488] font-semibold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className={cn(
                'w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                activeId === s.id ? 'bg-[#CCFBF1] text-[#0D9488]' : 'bg-gray-100 text-gray-500'
              )}>
                {i + 1}
              </span>
              <span className="line-clamp-2 leading-snug">{s.title}</span>
            </button>
          ))}

          {isAdmin && (
            <button
              onClick={openNew}
              className="w-full flex items-center gap-2 px-2.5 py-2 mt-1 rounded-lg text-xs text-[#0D9488] hover:bg-[#0D9488]/5 transition-colors font-medium border border-dashed border-[#0D9488]/30 hover:border-[#0D9488]"
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              Add section
            </button>
          )}
        </nav>
      </aside>

      {/* ─── Main pane ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-gray-50/40">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">
              {search ? `Search: "${search}" — ${filtered.length} match${filtered.length !== 1 ? 'es' : ''}` : 'Employee Handbook'}
            </span>
          </div>
          {isAdmin && !isEditing && (
            <Button
              onClick={openNew}
              size="sm"
              className="bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Add Section
            </Button>
          )}
        </div>

        {/* Editor panel (admin only) */}
        {isAdmin && isEditing && (
          <div ref={editorRef} className="mx-8 my-6 bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm min-h-[440px] flex flex-col">
            <SectionEditor
              section={editingSection}
              onSave={handleSave}
              onCancel={() => { setIsEditing(false); setEditingSection(null); }}
              maxOrder={sections.length}
            />
          </div>
        )}

        {/* Sections */}
        {filtered.length === 0 && !isEditing ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <BookOpen className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-500">
              {search ? 'No sections match your search.' : 'No handbook sections yet.'}
            </p>
            {isAdmin && !search && (
              <p className="text-xs text-gray-400 mt-1">Click "Add Section" to create the first entry.</p>
            )}
          </div>
        ) : (
          <div className="px-8 py-6 space-y-6 max-w-3xl">
            {filtered.map((s, idx) => (
              <div
                key={s.id}
                ref={(el) => { sectionRefs.current[s.id] = el; }}
                id={`section-${s.id}`}
                className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden scroll-mt-16"
              >
                {/* Section header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-[#CCFBF1] flex items-center justify-center text-xs font-bold text-[#0D9488] flex-shrink-0">
                      {idx + 1}
                    </span>
                    <h2 className="font-semibold text-gray-900 text-base">{s.title}</h2>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-[#0D9488] hover:bg-[#0D9488]/5 transition-colors"
                        title="Edit section"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(s)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete section"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Section body */}
                <div className="px-6 py-5 space-y-1">
                  {renderBody(s.body)}
                </div>

                {/* Last updated */}
                <div className="px-6 py-2.5 border-t border-gray-50 bg-gray-50/50">
                  <p className="text-[11px] text-gray-400">
                    Last updated {new Date(s.updated_at).toLocaleDateString('en-MU', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>"{deleteTarget?.title}"</strong> will be permanently removed from the handbook.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
