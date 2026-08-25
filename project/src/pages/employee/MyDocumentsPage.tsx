import React, { useEffect, useState, useCallback } from 'react';
import { supabase, EmployeeDocument, DocumentFolder } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../hooks/use-toast';
import { FileText, File, Image as ImageIcon, Download, FolderOpen, Loader as Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';

interface FolderDef {
  key: DocumentFolder;
  label: string;
  category: string;
}

const FOLDERS: FolderDef[] = [
  { key: 'tax', label: 'Tax Documents', category: 'Official Documentation' },
  { key: 'contract', label: 'Work Contract', category: 'Official Documentation' },
  { key: 'communication', label: 'Official Communication', category: 'Official Documentation' },
  { key: 'personal', label: 'Personal Data', category: 'Official Documentation' },
  { key: 'payslip', label: 'Pay Slips', category: 'Pay Advisors' },
];

const CATEGORIES = ['Official Documentation', 'Pay Advisors'] as const;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-MU', { day: '2-digit', month: 'long', year: 'numeric' });
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <FileText className="w-5 h-5 text-red-600 flex-shrink-0" />;
  if (ext === 'doc' || ext === 'docx') return <File className="w-5 h-5 text-blue-400 flex-shrink-0" />;
  return <ImageIcon className="w-5 h-5 text-teal-400 flex-shrink-0" />;
}

function EmptyState({ folderLabel }: { folderLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 text-center px-8">
      {/* SVG empty folder illustration */}
      <svg width="72" height="60" viewBox="0 0 72 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-5">
        <rect x="2" y="18" width="68" height="38" rx="5" fill="#f3f4f6" stroke="#E8E8F0" strokeWidth="2"/>
        <path d="M2 23C2 20.2386 4.23858 18 7 18H28L34 12H65C67.7614 12 70 14.2386 70 17V23H2Z" fill="#E8E8F0"/>
        <rect x="16" y="30" width="40" height="3" rx="1.5" fill="#E8E8F0"/>
        <rect x="20" y="37" width="32" height="3" rx="1.5" fill="#E8E8F0"/>
        <circle cx="36" cy="47" r="5" fill="#d1fae5" stroke="#0D9488" strokeWidth="1.5"/>
        <path d="M34 47L35.5 48.5L38.5 45.5" stroke="#0D9488" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <p className="text-[15px] font-semibold text-gray-700 mb-1">No documents in {folderLabel}</p>
      <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
        Contact HR to upload your documents. They will appear here once available.
      </p>
    </div>
  );
}

export const MyDocumentsPage: React.FC = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [activeFolder, setActiveFolder] = useState<DocumentFolder>('tax');
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [counts, setCounts] = useState<Partial<Record<DocumentFolder, number>>>({});
  const [loading, setLoading] = useState(false);

  // Fetch counts for all folders at once
  const fetchCounts = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('employee_documents')
      .select('folder, file_url')
      .eq('employee_id', profile.id);
    if (data) {
      const c: Partial<Record<DocumentFolder, number>> = {};
      data
        .filter(row => row.file_url?.startsWith(`${profile.id}/`))
        .forEach((row) => {
          const f = row.folder as DocumentFolder;
          c[f] = (c[f] ?? 0) + 1;
        });
      setCounts(c);
    }
  }, [profile]);

  const fetchDocuments = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', profile.id)
      .eq('folder', activeFolder)
      .order('uploaded_at', { ascending: false });
    if (!error && data) {
      // Guard: only show files whose storage path belongs to this employee
      const safe = (data as EmployeeDocument[]).filter(d =>
        d.file_url.startsWith(`${profile.id}/`)
      );
      setDocuments(safe);
    }
    setLoading(false);
  }, [profile, activeFolder]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

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

  const activeFolderDef = FOLDERS.find((f) => f.key === activeFolder)!;

  return (
    <div className="flex h-full bg-[#F8F9FC]" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* Left panel — folder tree */}
      <aside className="w-56 flex-shrink-0 bg-white border-r border-[#E5E7EB] flex flex-col py-5 overflow-y-auto">
        <div className="px-4 mb-4">
          <h2 className="text-sm font-bold text-gray-900">Documents</h2>
        </div>

        {CATEGORIES.map((cat) => (
          <div key={cat} className="mb-3">
            {/* Category header — non-clickable label */}
            <div className="px-4 mb-1.5">
              <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-[0.08em]">
                {cat}
              </span>
            </div>
            {/* Sub-folders */}
            {FOLDERS.filter((f) => f.category === cat).map((folder) => {
              const isActive = activeFolder === folder.key;
              const count = counts[folder.key] ?? 0;
              return (
                <button
                  key={folder.key}
                  onClick={() => setActiveFolder(folder.key)}
                  className={[
                    'w-full flex items-center justify-between gap-2 pl-6 pr-3 py-2 text-sm font-medium transition-all duration-150 relative',
                    isActive
                      ? 'text-[#0D9488] bg-emerald-50 border-l-2 border-[#0D9488]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-2 border-transparent',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className={['w-4 h-4 flex-shrink-0', isActive ? 'text-[#0D9488]' : 'text-gray-400'].join(' ')} />
                    <span className="truncate text-[13px]">{folder.label}</span>
                  </div>
                  {count > 0 && (
                    <span className={[
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0',
                      isActive ? 'bg-[#0D9488] text-white' : 'bg-gray-100 text-gray-500',
                    ].join(' ')}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      {/* Right panel — file list */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#E5E7EB] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-[#0D9488]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">{activeFolderDef.label}</h1>
              <p className="text-xs text-gray-400">
                {loading ? '—' : `${documents.length} document${documents.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        </div>

        {/* File list body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-[#0D9488] animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <EmptyState folderLabel={activeFolderDef.label} />
          ) : (
            <div className="space-y-2 max-w-2xl">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 px-5 py-3.5 bg-white border border-[#E5E7EB] rounded-xl hover:bg-emerald-50 hover:border-[#CCFBF1] transition-colors group"
                >
                  <FileIcon name={doc.file_name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{doc.file_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(doc.uploaded_at)} · {formatSize(doc.file_size)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleDownload(doc)}
                    className="h-8 px-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs gap-1.5 font-medium flex-shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
