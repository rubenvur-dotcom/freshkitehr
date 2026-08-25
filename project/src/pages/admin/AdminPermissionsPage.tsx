import React, { useEffect, useState, useCallback } from 'react';
import { supabase, PermissionRequest, Profile } from '../../lib/supabase';
import { useToast } from '../../hooks/use-toast';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import { Clock, Search, Check, X, Download, CircleCheck as CheckCircle2, Circle as XCircle } from 'lucide-react';

type PermissionWithProfile = PermissionRequest & { profiles: Profile };

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

const STATUS_OPTIONS = ['All', 'Pending', 'Approved', 'Declined'] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Pending:  { bg: 'bg-gray-100',    text: 'text-[#6B7280]'  },
  Approved: { bg: 'bg-[#D1FAE5]',   text: 'text-[#065F46]'  },
  Declined: { bg: 'bg-[#FEE2E2]',   text: 'text-[#991B1B]'  },
};

export const AdminPermissionsPage: React.FC = () => {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<PermissionWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const [actionDialog, setActionDialog] = useState<{ p: PermissionWithProfile; action: 'Approved' | 'Declined' } | null>(null);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPermissions = useCallback(async () => {
    const { data } = await supabase
      .from('permission_requests')
      .select('*, profiles(*)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setPermissions(data as PermissionWithProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const filtered = permissions.filter((p) => {
    const name = p.profiles?.full_name?.toLowerCase() ?? '';
    const dept = p.profiles?.department?.toLowerCase() ?? '';
    const q = search.toLowerCase();
    return (
      (!search || name.includes(q) || dept.includes(q)) &&
      (statusFilter === 'All' || p.status === statusFilter)
    );
  });

  const handleAction = async () => {
    if (!actionDialog) return;
    setActionLoading(true);
    const { p, action } = actionDialog;

    const { error } = await supabase
      .from('permission_requests')
      .update({ status: action, admin_comment: comment || null, updated_at: new Date().toISOString() })
      .eq('id', p.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: action === 'Approved' ? 'Permission Approved' : 'Permission Declined' });
      await supabase.from('notifications').insert({
        recipient_id: p.employee_id,
        type: action === 'Approved' ? 'permission_approved' : 'permission_declined',
        title: action === 'Approved' ? 'Permission Approved' : 'Permission Declined',
        body: action === 'Approved'
          ? `Your permission request for ${new Date(p.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })} (${formatTime(p.start_time)} – ${formatTime(p.end_time)}) has been approved.`
          : `Your permission request for ${new Date(p.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short' })} was declined.${comment ? ` Reason: ${comment}` : ''}`,
        is_read: false,
      });
      fetchPermissions();
      setActionDialog(null);
      setComment('');
    }
    setActionLoading(false);
  };

  const exportCSV = () => {
    const headers = ['Employee', 'Department', 'Date', 'Start Time', 'End Time', 'Duration', 'Reason', 'Status', 'Admin Comment', 'Converted to Half Day'];
    const rows = filtered.map((p) => [
      p.profiles?.full_name ?? '',
      p.profiles?.department ?? '',
      p.date,
      p.start_time,
      p.end_time,
      formatDuration(p.duration_minutes),
      p.reason ?? '',
      p.status,
      p.admin_comment ?? '',
      p.converted_to_half_day ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freshkite-permissions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingCount = permissions.filter((p) => p.status === 'Pending').length;

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permissions Ledger</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '—' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
            {pendingCount > 0 && !loading && (
              <span className="ml-2 inline-flex items-center gap-1 bg-[#FEF3C7] text-[#92400E] text-xs font-medium px-2 py-0.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
        <Button onClick={exportCSV} variant="outline" className="gap-2 text-sm border-gray-200 hover:bg-gray-50">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 border-gray-200 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-sm border-gray-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || statusFilter !== 'All') && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('All'); }} className="h-9 text-xs text-gray-500">
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
                <div className="h-4 w-32 bg-gray-100 rounded" />
                {[1, 2, 3, 4].map((j) => <div key={j} className="h-4 w-20 bg-gray-100 rounded" />)}
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">No permission requests found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Employee', 'Date', 'Time', 'Duration', 'Reason', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => {
                  const style = STATUS_STYLES[p.status] ?? STATUS_STYLES.Pending;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900">{p.profiles?.full_name}</p>
                        <p className="text-xs text-gray-400">{p.profiles?.department}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 whitespace-nowrap text-sm">
                        {new Date(p.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-sm whitespace-nowrap">
                        {formatTime(p.start_time)} – {formatTime(p.end_time)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-gray-800 text-sm">{formatDuration(p.duration_minutes)}</span>
                        {p.converted_to_half_day && (
                          <span className="ml-1.5 text-[10px] font-semibold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full">Half Day</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500 max-w-[180px] truncate">
                        {p.reason || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full', style.bg, style.text)}>
                          {p.status === 'Approved' && <CheckCircle2 className="w-3 h-3" />}
                          {p.status === 'Declined' && <XCircle className="w-3 h-3" />}
                          {p.status === 'Pending' && <Clock className="w-3 h-3" />}
                          {p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {p.status === 'Pending' ? (
                          <div className="flex items-center gap-1.5">
                            <Button size="sm" onClick={() => { setActionDialog({ p, action: 'Approved' }); setComment(''); }}
                              className="h-7 w-7 p-0 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg" title="Approve">
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setActionDialog({ p, action: 'Declined' }); setComment(''); }}
                              className="h-7 w-7 p-0 text-red-500 border-red-200 hover:bg-red-50 rounded-lg" title="Decline">
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">
                            {p.admin_comment ? `"${p.admin_comment.slice(0, 28)}${p.admin_comment.length > 28 ? '…' : ''}"` : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(o) => { if (!o) { setActionDialog(null); setComment(''); } }}>
        <DialogContent className="max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={actionDialog?.action === 'Approved' ? 'text-[#0D9488]' : 'text-red-600'}>
              {actionDialog?.action === 'Approved' ? 'Approve Permission' : 'Decline Permission'}
            </DialogTitle>
          </DialogHeader>
          {actionDialog && (
            <div className="space-y-4 py-1">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm border border-gray-100">
                <div className="flex justify-between"><span className="text-gray-500">Employee</span><span className="font-semibold text-gray-900">{actionDialog.p.profiles?.full_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="text-gray-700">{new Date(actionDialog.p.date + 'T12:00:00').toLocaleDateString('en-MU', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Time</span><span className="text-gray-700">{formatTime(actionDialog.p.start_time)} – {formatTime(actionDialog.p.end_time)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-semibold text-gray-900">{formatDuration(actionDialog.p.duration_minutes)}</span></div>
                {actionDialog.p.reason && (
                  <div className="pt-1 border-t border-gray-200">
                    <span className="text-gray-500 text-xs">Reason: </span>
                    <span className="text-gray-700 text-xs italic">"{actionDialog.p.reason}"</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Comment {actionDialog.action === 'Declined' ? '(recommended)' : '(optional)'}
                </label>
                <Textarea
                  placeholder={actionDialog.action === 'Declined' ? 'Provide a reason...' : 'Add a note (optional)...'}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="resize-none h-20 text-sm border-gray-200"
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setComment(''); }}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={actionLoading}
              className={actionDialog?.action === 'Approved' ? 'bg-[#0D9488] hover:bg-[#0F766E] text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
            >
              {actionLoading ? 'Processing...' : actionDialog?.action === 'Approved' ? 'Confirm Approval' : 'Confirm Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
