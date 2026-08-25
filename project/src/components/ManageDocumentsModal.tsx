import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase, Profile, EmployeeDocument, DocumentFolder } from '../lib/supabase';

import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from './ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import { FileText, File, Image as ImageIcon, Upload, Download, Trash2, FolderOpen, Folder, ArrowLeft, FolderPlus, Pencil, Loader as Loader2, FolderMinus } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface ManageDocumentsModalProps {
  employee: Profile | null;
  onClose: () => void;
}

const FOLDERS: { key: DocumentFolder; label: string }[] = [
  { key: 'tax', label: 'Tax Documents' },
  { key: 'contract', label: 'Work Contract' },
  { key: 'communication', label: 'Official Communication' },
  { key: 'personal', label: 'Personal Data' },
  { key: 'payslip', label: 'Pay Slips' },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED = '.pdf,.doc,.docx,.png,.jpg,.jpeg';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-MU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />;
  if (ext === 'doc' || ext === 'docx') return <File className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  return <ImageIcon className="w-4 h-4 text-teal-500 flex-shrink-0" />;
}

// Extract subfolder from storage path: employeeId/payslip/SubFolder/uuid.ext → 'SubFolder'
// 3-segment paths (no subfolder) return null (uncategorized)
function getSubfolder(fileUrl: string): string | null {
  const parts = fileUrl.split('/');
  return parts.length >= 4 ? decodeURIComponent(parts[2]) : null;
}

// Move a file in Supabase Storage using download → upload → delete
// (avoids storage.move() which fails under anon-key RLS)
async function browserStorageMove(
  fromPath: string,
  toPath: string,
  docId: string,
): Promise<void> {
  // 1. Get a short-lived signed URL to download the source file
  const { data: urlData, error: urlErr } = await supabase.storage
    .from('employee-documents')
    .createSignedUrl(fromPath, 120);
  if (urlErr || !urlData?.signedUrl) throw new Error(urlErr?.message ?? 'Could not sign source URL');

  // 2. Fetch as blob
  const resp = await fetch(urlData.signedUrl);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const blob = await resp.blob();

  // 3. Upload to destination
  const { error: uploadErr } = await supabase.storage
    .from('employee-documents')
    .upload(toPath, blob, { upsert: true });
  if (uploadErr) throw new Error(uploadErr.message);

  // 4. Update DB record — include the source path check so we never update a row
  //    whose file_url no longer matches what we started with
  const { error: dbErr } = await supabase
    .from('employee_documents')
    .update({ file_url: toPath })
    .eq('id', docId)
    .eq('file_url', fromPath);
  if (dbErr) throw new Error(dbErr.message);

  // 5. Delete original
  await supabase.storage.from('employee-documents').remove([fromPath]);
}

function lsKey(employeeId: string) {
  return `payslip_folders_${employeeId}`;
}

function loadPersistedFolders(employeeId: string): string[] {
  try {
    const raw = localStorage.getItem(lsKey(employeeId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistFolders(employeeId: string, folders: string[]) {
  try {
    localStorage.setItem(lsKey(employeeId), JSON.stringify(folders));
  } catch { /* ignore */ }
}

export const ManageDocumentsModal: React.FC<ManageDocumentsModalProps> = ({ employee, onClose }) => {
  const { toast } = useToast();
  const { profile: adminProfile } = useAuthStore();
  const [activeFolder, setActiveFolder] = useState<DocumentFolder>('tax');
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EmployeeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Payslip sub-folder state
  const [payslipSubfolder, setPayslipSubfolder] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [localFolders, setLocalFolders] = useState<string[]>([]);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Bulk delete state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Delete folder state
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null); // '__uncategorized__' or folder name
  const [deletingFolder, setDeletingFolder] = useState(false);

  // Move state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [movingTo, setMovingTo] = useState('');
  const [moving, setMoving] = useState(false);

  const fetchDocuments = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('folder', activeFolder)
      .order('uploaded_at', { ascending: false });
    if (!error && data) {
      // Guard: only show files whose storage path belongs to this employee
      const safe = (data as EmployeeDocument[]).filter(d =>
        d.file_url.startsWith(`${employee.id}/`)
      );
      setDocuments(safe);
    }
    setLoading(false);
  }, [employee, activeFolder]);

  useEffect(() => {
    fetchDocuments();
    if (activeFolder !== 'payslip') {
      setPayslipSubfolder(null);
      setShowNewFolder(false);
    }
  }, [fetchDocuments, activeFolder]);

  // Load persisted folders + seed from documents
  useEffect(() => {
    if (activeFolder !== 'payslip' || !employee) return;
    const fromDocs = documents.map(d => getSubfolder(d.file_url)).filter(Boolean) as string[];
    const persisted = loadPersistedFolders(employee.id);
    const merged = [...new Set([...persisted, ...fromDocs])].sort();
    setLocalFolders(merged);
    persistFolders(employee.id, merged);
  }, [documents, activeFolder, employee]);

  // Save localFolders to localStorage whenever they change
  useEffect(() => {
    if (!employee || activeFolder !== 'payslip') return;
    persistFolders(employee.id, localFolders);
  }, [localFolders, employee, activeFolder]);

  // Clear selection when subfolder changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [payslipSubfolder]);

  const addLocalFolder = (name: string) => {
    setLocalFolders(prev => {
      const next = [...new Set([...prev, name])].sort();
      if (employee) persistFolders(employee.id, next);
      return next;
    });
  };

  // ── Move selected files via server (service role bypasses RLS) ────────────
  const handleMoveSelected = async () => {
    if (!employee || !movingTo.trim() || selectedIds.size === 0) return;
    setMoving(true);
    const target = movingTo.trim();

    const docsToMove = documents.filter(d => selectedIds.has(d.id));
    let failCount = 0;

    for (const doc of docsToMove) {
      const filename = doc.file_url.split('/').pop()!;
      const toPath = `${employee.id}/payslip/${encodeURIComponent(target)}/${filename}`;
      try {
        await browserStorageMove(doc.file_url, toPath, doc.id);
      } catch {
        failCount++;
      }
    }

    if (failCount === 0) {
      toast({ title: `${docsToMove.length} file${docsToMove.length > 1 ? 's' : ''} moved to "${target}"` });
    } else {
      toast({ title: 'Move completed with errors', description: `${failCount} file(s) could not be moved.`, variant: 'destructive' });
    }

    addLocalFolder(target);
    setSelectedIds(new Set());
    setShowMoveDialog(false);
    setMovingTo('');
    setMoving(false);
    fetchDocuments();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !employee || !adminProfile) return;

    const oversized = files.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length) {
      toast({ title: 'File too large', description: `${oversized.map(f => f.name).join(', ')} exceed the 10 MB limit.`, variant: 'destructive' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    const folderLabel = FOLDERS.find((f) => f.key === activeFolder)?.label ?? activeFolder;
    let successCount = 0;
    const failed: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : '');

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const subPath = activeFolder === 'payslip' && payslipSubfolder && payslipSubfolder !== '__uncategorized__'
        ? `${activeFolder}/${encodeURIComponent(payslipSubfolder)}`
        : activeFolder;
      const storagePath = `${employee.id}/${subPath}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('employee-documents')
        .upload(storagePath, file, { upsert: false });

      if (uploadError) { failed.push(file.name); continue; }

      const { error: dbError } = await supabase.from('employee_documents').insert({
        employee_id: employee.id,
        folder: activeFolder,
        file_name: file.name,
        file_url: storagePath,
        file_size: file.size,
        uploaded_by: adminProfile.id,
      });

      if (dbError) {
        await supabase.storage.from('employee-documents').remove([storagePath]);
        failed.push(file.name);
      } else {
        successCount++;
      }
    }

    if (successCount > 0) {
      await supabase.from('notifications').insert({
        recipient_id: employee.id,
        type: 'document_uploaded',
        title: 'New document uploaded',
        body: successCount === 1
          ? `HR has added "${files.find(f => !failed.includes(f.name))?.name}" to your ${folderLabel} folder.`
          : `HR has added ${successCount} documents to your ${folderLabel} folder.`,
        is_read: false,
      });
      toast({ title: successCount === 1 ? 'Document uploaded' : `${successCount} documents uploaded` });
      fetchDocuments();
    }

    if (failed.length) {
      toast({ title: 'Some uploads failed', description: failed.join(', '), variant: 'destructive' });
    }

    setUploading(false);
    setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    const { data, error } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(doc.file_url, 60);

    if (error || !data?.signedUrl) {
      toast({ title: 'Download failed', description: 'Could not generate download link.', variant: 'destructive' });
      return;
    }

    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = doc.file_name;
    a.target = '_blank';
    a.click();
  };

  const handleDelete = async () => {
    if (!deleteTarget || !employee) return;
    // Safety: refuse to delete a file that doesn't belong to this employee's storage path
    if (!deleteTarget.file_url.startsWith(`${employee.id}/`)) {
      toast({ title: 'Delete refused', description: 'File does not belong to this employee.', variant: 'destructive' });
      setDeleting(false);
      setDeleteTarget(null);
      return;
    }
    setDeleting(true);

    await supabase.storage.from('employee-documents').remove([deleteTarget.file_url]);

    const { error } = await supabase
      .from('employee_documents')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('employee_id', employee.id); // belt-and-suspenders: never delete across employees

    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Document deleted' });
      fetchDocuments();
    }

    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleRename = async () => {
    if (!renamingFolder || !renameValue.trim() || !employee) return;
    const newName = renameValue.trim();
    if (newName === renamingFolder || newName === 'Uncategorized') {
      setRenamingFolder(null);
      return;
    }
    setRenaming(true);

    const filesToMove = renamingFolder === '__uncategorized__'
      ? documents.filter(d => getSubfolder(d.file_url) === null)
      : documents.filter(d => getSubfolder(d.file_url) === renamingFolder);

    let failCount = 0;
    for (const doc of filesToMove) {
      const filename = doc.file_url.split('/').pop()!;
      const toPath = `${employee.id}/payslip/${encodeURIComponent(newName)}/${filename}`;
      try {
        await browserStorageMove(doc.file_url, toPath, doc.id);
      } catch {
        failCount++;
      }
    }

    if (failCount === 0) {
      // Remove old folder name, add new one
      setLocalFolders(prev => {
        const filtered = renamingFolder === '__uncategorized__'
          ? prev
          : prev.filter(f => f !== renamingFolder);
        const next = [...new Set([...filtered, newName])].sort();
        if (employee) persistFolders(employee.id, next);
        return next;
      });
      toast({ title: 'Folder renamed', description: `→ "${newName}"` });
    } else {
      toast({
        title: failCount === filesToMove.length ? 'Rename failed' : 'Renamed with some errors',
        description: `${failCount} of ${filesToMove.length} file(s) could not be moved.`,
        variant: 'destructive',
      });
    }

    setRenaming(false);
    setRenamingFolder(null);
    setRenameValue('');
    fetchDocuments();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !employee) return;
    setBulkDeleting(true);
    // Only delete files that actually belong to this employee's storage path
    const docsToDelete = documents.filter(d =>
      selectedIds.has(d.id) && d.file_url.startsWith(`${employee.id}/`)
    );
    if (docsToDelete.length === 0) { setBulkDeleting(false); setBulkDeleteOpen(false); return; }
    await supabase.storage.from('employee-documents').remove(docsToDelete.map(d => d.file_url));
    await supabase.from('employee_documents').delete()
      .in('id', docsToDelete.map(d => d.id))
      .eq('employee_id', employee.id); // belt-and-suspenders
    toast({ title: `${docsToDelete.length} file${docsToDelete.length > 1 ? 's' : ''} deleted` });
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    setBulkDeleting(false);
    fetchDocuments();
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete || !employee) return;
    setDeletingFolder(true);

    const filesToDelete = folderToDelete === '__uncategorized__'
      ? documents.filter(d => getSubfolder(d.file_url) === null)
      : documents.filter(d => getSubfolder(d.file_url) === folderToDelete);

    // Delete storage files
    if (filesToDelete.length > 0) {
      await supabase.storage.from('employee-documents').remove(filesToDelete.map(d => d.file_url));
      // Delete DB rows
      await supabase.from('employee_documents').delete().in('id', filesToDelete.map(d => d.id));
    }

    // Remove from localFolders if it's a named folder
    if (folderToDelete !== '__uncategorized__') {
      setLocalFolders(prev => {
        const next = prev.filter(f => f !== folderToDelete);
        if (employee) persistFolders(employee.id, next);
        return next;
      });
    }

    toast({ title: 'Folder deleted', description: `"${folderToDelete === '__uncategorized__' ? 'Uncategorized' : folderToDelete}" and its ${filesToDelete.length} file(s) were deleted.` });
    setDeletingFolder(false);
    setFolderToDelete(null);
    fetchDocuments();
  };

  if (!employee) return null;

  const activeLabel = FOLDERS.find((f) => f.key === activeFolder)?.label ?? '';

  return (
    <>
      <Dialog open={!!employee} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-[680px] h-[600px] max-h-[88vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <FolderOpen className="w-5 h-5 text-[#0D9488]" />
              Manage Documents — {employee.full_name}
            </DialogTitle>
            <p className="text-xs text-gray-400 mt-0.5">{employee.department}</p>
          </DialogHeader>

          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Folder tabs */}
            <div className="px-6 pt-4 pb-0 flex-shrink-0">
              <div className="flex gap-1 bg-gray-50 rounded-xl p-1 border border-gray-100">
                {FOLDERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setActiveFolder(f.key)}
                    className={[
                      'flex-1 text-xs font-medium px-2 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap',
                      activeFolder === f.key
                        ? 'bg-white text-[#0D9488] shadow-sm border border-gray-100'
                        : 'text-gray-500 hover:text-gray-700',
                    ].join(' ')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* File list / payslip folder view */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-[#0D9488] animate-spin" />
                </div>
              ) : activeFolder === 'payslip' && payslipSubfolder === null ? (
                // ── Payslip folder grid ──────────────────────────────────────
                <div className="space-y-4">
                  {showNewFolder && (
                    <div className="flex gap-2 items-center p-3 bg-teal-50 border border-teal-100 rounded-xl">
                      <Input
                        autoFocus
                        placeholder="Folder name, e.g. January 2026"
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newFolderName.trim()) {
                            const name = newFolderName.trim();
                            addLocalFolder(name);
                            setPayslipSubfolder(name);
                            setShowNewFolder(false);
                            setNewFolderName('');
                          }
                          if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                        }}
                        className="h-8 text-sm flex-1"
                      />
                      <Button
                        size="sm"
                        className="h-8 bg-[#0D9488] hover:bg-[#0F766E] text-white"
                        disabled={!newFolderName.trim()}
                        onClick={() => {
                          const name = newFolderName.trim();
                          addLocalFolder(name);
                          setPayslipSubfolder(name);
                          setShowNewFolder(false);
                          setNewFolderName('');
                        }}
                      >
                        Create
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>
                        Cancel
                      </Button>
                    </div>
                  )}

                  {(() => {
                    const uncategorized = documents.filter(d => getSubfolder(d.file_url) === null);
                    const allFolders = [...new Set([...localFolders])].sort();
                    if (allFolders.length === 0 && uncategorized.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-3 border border-gray-100">
                            <FolderOpen className="w-6 h-6 text-gray-300" />
                          </div>
                          <p className="text-sm font-medium text-gray-500">No pay slip folders yet</p>
                          <p className="text-xs text-gray-400 mt-1">Create a folder to get started.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        {allFolders.map(name => {
                          const count = documents.filter(d => getSubfolder(d.file_url) === name).length;
                          const isRenaming = renamingFolder === name;
                          return (
                            <div key={name} className="relative group">
                              {isRenaming ? (
                                <div className="flex items-center gap-2 p-3 bg-teal-50 border border-teal-200 rounded-xl">
                                  <Folder className="w-6 h-6 text-[#0D9488] flex-shrink-0" />
                                  <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenamingFolder(null); }}
                                    className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                                  />
                                  <button onClick={handleRename} disabled={renaming} className="text-xs text-white bg-[#0D9488] px-2 py-1 rounded hover:bg-[#0F766E] disabled:opacity-50">
                                    {renaming ? '…' : 'OK'}
                                  </button>
                                  <button onClick={() => setRenamingFolder(null)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setPayslipSubfolder(name)}
                                  className="w-full flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-xl hover:border-[#0D9488] hover:bg-teal-50/30 transition-all text-left"
                                >
                                  <Folder className="w-8 h-8 text-[#0D9488] flex-shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                                    <p className="text-xs text-gray-400">{count} file{count !== 1 ? 's' : ''}</p>
                                  </div>
                                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                                    <button
                                      onClick={e => { e.stopPropagation(); setRenamingFolder(name); setRenameValue(name); }}
                                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={e => { e.stopPropagation(); setFolderToDelete(name); }}
                                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                    >
                                      <FolderMinus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {uncategorized.length > 0 && (
                          <div className="relative group">
                            {renamingFolder === '__uncategorized__' ? (
                              <div className="flex items-center gap-2 p-3 bg-teal-50 border border-teal-200 rounded-xl">
                                <Folder className="w-6 h-6 text-gray-400 flex-shrink-0" />
                                <input
                                  autoFocus
                                  value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenamingFolder(null); }}
                                  className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                                />
                                <button onClick={handleRename} disabled={renaming} className="text-xs text-white bg-[#0D9488] px-2 py-1 rounded hover:bg-[#0F766E] disabled:opacity-50">
                                  {renaming ? '…' : 'OK'}
                                </button>
                                <button onClick={() => setRenamingFolder(null)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setPayslipSubfolder('__uncategorized__')}
                                className="w-full flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-xl hover:border-[#0D9488] hover:bg-teal-50/30 transition-all text-left"
                              >
                                <Folder className="w-8 h-8 text-gray-400 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-900">Uncategorized</p>
                                  <p className="text-xs text-gray-400">{uncategorized.length} file{uncategorized.length !== 1 ? 's' : ''}</p>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                                  <button
                                    onClick={e => { e.stopPropagation(); setRenamingFolder('__uncategorized__'); setRenameValue(''); }}
                                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setFolderToDelete('__uncategorized__'); }}
                                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                  >
                                    <FolderMinus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                // ── File list (normal or inside payslip subfolder) ────────────
                (() => {
                  const displayDocs = activeFolder === 'payslip'
                    ? payslipSubfolder === '__uncategorized__'
                      ? documents.filter(d => getSubfolder(d.file_url) === null)
                      : documents.filter(d => getSubfolder(d.file_url) === payslipSubfolder)
                    : documents;

                  const allChecked = displayDocs.length > 0 && displayDocs.every(d => selectedIds.has(d.id));
                  const someChecked = selectedIds.size > 0;

                  if (displayDocs.length === 0) return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-3 border border-gray-100">
                        <FolderOpen className="w-6 h-6 text-gray-300" />
                      </div>
                      <p className="text-sm font-medium text-gray-500">No files here yet</p>
                      <p className="text-xs text-gray-400 mt-1">Upload a document below to get started.</p>
                    </div>
                  );

                  return (
                    <div className="space-y-2">
                      {/* Select-all row for payslip subfolders */}
                      {activeFolder === 'payslip' && localFolders.length > 0 && displayDocs.length > 1 && (
                        <div className="flex items-center gap-3 px-1 pb-1">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={e => {
                              if (e.target.checked) setSelectedIds(new Set(displayDocs.map(d => d.id)));
                              else setSelectedIds(new Set());
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-[#0D9488] accent-[#0D9488]"
                          />
                          <span className="text-xs text-gray-500">{allChecked ? 'Deselect all' : 'Select all'}</span>
                          {someChecked && (
                            <span className="text-xs text-[#0D9488] font-medium ml-auto">{selectedIds.size} selected</span>
                          )}
                        </div>
                      )}

                      {displayDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className={[
                            'flex items-center gap-3 px-4 py-3 bg-white border rounded-xl hover:border-gray-200 hover:bg-gray-50/50 transition-colors group',
                            selectedIds.has(doc.id) ? 'border-[#0D9488] bg-teal-50/20' : 'border-gray-100',
                          ].join(' ')}
                        >
                          {activeFolder === 'payslip' && localFolders.length > 0 && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(doc.id)}
                              onChange={e => {
                                const next = new Set(selectedIds);
                                if (e.target.checked) next.add(doc.id);
                                else next.delete(doc.id);
                                setSelectedIds(next);
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-[#0D9488] accent-[#0D9488] flex-shrink-0"
                            />
                          )}
                          {fileIcon(doc.file_name)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatDate(doc.uploaded_at)} · {formatSize(doc.file_size)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" onClick={() => handleDownload(doc)} className="h-7 px-2.5 bg-[#CCFBF1] hover:bg-[#CCFBF1] text-[#0D9488] border-0 text-xs gap-1 font-medium" variant="ghost">
                              <Download className="w-3.5 h-3.5" /> Download
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(doc)} className="h-7 px-2 text-red-600 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Upload footer */}
            <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex-shrink-0">
              <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={handleUpload} />

              {activeFolder === 'payslip' && payslipSubfolder === null ? (
                <Button
                  onClick={() => { setShowNewFolder(true); setNewFolderName(''); }}
                  className="w-full bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 font-medium h-10"
                >
                  <FolderPlus className="w-4 h-4" /> New Folder
                </Button>
              ) : (
                <div className="space-y-2">
                  {activeFolder === 'payslip' && payslipSubfolder && (
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => { setPayslipSubfolder(null); setSelectedIds(new Set()); }}
                        className="flex items-center gap-1.5 text-xs text-[#0D9488] hover:text-[#0F766E] font-medium"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to folders
                      </button>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-600 font-medium truncate">
                        {payslipSubfolder === '__uncategorized__' ? 'Uncategorized' : payslipSubfolder}
                      </span>
                    </div>
                  )}

                  {/* Bulk action bar */}
                  {activeFolder === 'payslip' && selectedIds.size > 0 && (
                    <div className="flex gap-2">
                      {localFolders.length > 0 && (
                        <Button
                          onClick={() => {
                            const otherFolders = localFolders.filter(f => f !== payslipSubfolder);
                            setMovingTo(otherFolders[0] ?? localFolders[0]);
                            setShowMoveDialog(true);
                          }}
                          variant="outline"
                          className="flex-1 h-9 text-sm border-[#0D9488] text-[#0D9488] hover:bg-teal-50 gap-2"
                        >
                          Move {selectedIds.size} file{selectedIds.size > 1 ? 's' : ''} to…
                        </Button>
                      )}
                      <Button
                        onClick={() => setBulkDeleteOpen(true)}
                        variant="outline"
                        className="flex-1 h-9 text-sm border-red-300 text-red-600 hover:bg-red-50 gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete {selectedIds.size} file{selectedIds.size > 1 ? 's' : ''}
                      </Button>
                    </div>
                  )}

                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || (activeFolder === 'payslip' && payslipSubfolder === '__uncategorized__')}
                    className="w-full bg-[#0D9488] hover:bg-[#0F766E] text-white gap-2 font-medium h-10"
                  >
                    {uploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />{uploadProgress || 'Uploading…'}</>
                    ) : (
                      <><Upload className="w-4 h-4" />Upload{activeFolder === 'payslip' && payslipSubfolder && payslipSubfolder !== '__uncategorized__' ? ` to ${payslipSubfolder}` : ` to ${activeLabel}`}</>
                    )}
                  </Button>
                  <p className="text-xs text-gray-400 text-center">
                    PDF, Word, PNG, JPG — max 10 MB per file · select multiple files at once
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk move dialog */}
      <AlertDialog open={showMoveDialog} onOpenChange={o => !o && setShowMoveDialog(false)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Move {selectedIds.size} File{selectedIds.size > 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              Move selected file{selectedIds.size > 1 ? 's' : ''} to:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <select
              value={movingTo}
              onChange={e => setMovingTo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
            >
              {localFolders
                .filter(f => f !== payslipSubfolder)
                .map(f => <option key={f} value={f}>{f}</option>)
              }
              {localFolders.filter(f => f !== payslipSubfolder).length === 0 && (
                <option value="" disabled>No other folders</option>
              )}
            </select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMoveSelected}
              disabled={moving || !movingTo}
              className="bg-[#0D9488] hover:bg-[#0F766E] text-white"
            >
              {moving ? 'Moving…' : 'Move'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={o => !o && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} File{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size} file{selectedIds.size > 1 ? 's' : ''} will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-red-600 hover:bg-red-700 text-white">
              {bulkDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete folder confirmation */}
      <AlertDialog open={!!folderToDelete} onOpenChange={o => !o && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
            <AlertDialogDescription>
              {folderToDelete === '__uncategorized__' ? (
                <>All files in <strong>Uncategorized</strong> will be permanently deleted. This cannot be undone.</>
              ) : (
                <>Folder <strong>{folderToDelete}</strong> and all its files will be permanently deleted. This cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingFolder}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
              disabled={deletingFolder}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingFolder ? 'Deleting…' : 'Delete Folder'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.file_name}</strong> will be permanently deleted. This cannot be undone.
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
    </>
  );
};
