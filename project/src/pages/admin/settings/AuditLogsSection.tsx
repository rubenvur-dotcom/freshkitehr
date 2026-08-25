import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../hooks/use-toast';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Download, RefreshCw, Search } from 'lucide-react';

interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 25;

const ACTION_BADGE: Record<string, string> = {
  created:   'bg-green-100 text-green-700',
  deleted:   'bg-red-100 text-red-700',
  updated:   'bg-blue-100 text-blue-700',
  invited:   'bg-teal-100 text-teal-700',
  reset:     'bg-amber-100 text-amber-700',
};

function badgeClass(action: string): string {
  const key = Object.keys(ACTION_BADGE).find(k => action.includes(k));
  return key ? ACTION_BADGE[key] : 'bg-gray-100 text-gray-700';
}

export const AuditLogsSection: React.FC = () => {
  const { toast } = useToast();
  const [logs, setLogs]       = useState<AuditLog[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterResource, setFilterResource] = useState('all');
  const [filterDate, setFilterDate]         = useState('');

  const resourceTypes = ['all', 'user', 'profile', 'announcement', 'handbook_section', 'leave_policy', 'department', 'platform_settings'];

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('audit_logs').select('*', { count: 'exact' });

    if (search) {
      q = q.or(`actor_name.ilike.%${search}%,action.ilike.%${search}%,resource_type.ilike.%${search}%`);
    }
    if (filterResource !== 'all') {
      q = q.eq('resource_type', filterResource);
    }
    if (filterDate) {
      const from = new Date(filterDate);
      const to   = new Date(filterDate);
      to.setDate(to.getDate() + 1);
      q = q.gte('created_at', from.toISOString()).lt('created_at', to.toISOString());
    }

    const { data, count, error } = await q.order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    setLogs(data ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [search, filterResource, filterDate, page, toast]);

  useEffect(() => { setPage(0); }, [search, filterResource, filterDate]);
  useEffect(() => { load(); }, [load]);

  const exportCSV = async () => {
    let q = supabase.from('audit_logs').select('*');
    if (filterResource !== 'all') q = q.eq('resource_type', filterResource);
    const { data } = await q.order('created_at', { ascending: false });
    if (!data?.length) return;
    const header = ['Timestamp', 'Actor', 'Action', 'Resource Type', 'Resource ID', 'Details'];
    const rows   = data.map(r => [
      new Date(r.created_at).toISOString(),
      r.actor_name ?? '',
      r.action,
      r.resource_type,
      r.resource_id ?? '',
      r.details ? JSON.stringify(r.details) : '',
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `FreshkiteHR_AuditLog_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input placeholder="Search actor, action…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Select value={filterResource} onValueChange={setFilterResource}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Resource type" /></SelectTrigger>
          <SelectContent>
            {resourceTypes.map(r => <SelectItem key={r} value={r}>{r === 'all' ? 'All resources' : r.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="h-9 w-40 text-sm" />
        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant="ghost" onClick={load} className="h-9 px-3"><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" onClick={exportCSV} className="h-9 gap-1.5"><Download className="w-4 h-4" /> Export CSV</Button>
        </div>
      </div>

      <p className="text-xs text-gray-500">{total} log entries{search || filterResource !== 'all' || filterDate ? ' (filtered)' : ''}</p>

      {/* Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-40">Timestamp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">Actor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">Resource</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No logs found</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 font-medium text-gray-900 text-xs">{log.actor_name ?? <span className="text-gray-400">System</span>}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeClass(log.action)}`}>{log.action.replace(/_/g, ' ')}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{log.resource_type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                  {log.details ? JSON.stringify(log.details).slice(0, 80) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Page {page + 1} of {totalPages}</p>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-8 px-3" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <Button size="sm" variant="outline" className="h-8 px-3" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};
