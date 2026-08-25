import React, { useEffect, useState, useCallback } from 'react';
import { supabase, LeavePolicy, PolicyNote } from '../../lib/supabase';
import { Shield } from 'lucide-react';

export const EmployeePoliciesPage: React.FC = () => {
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [notes, setNotes] = useState<PolicyNote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [{ data: pols }, { data: nts }] = await Promise.all([
      supabase.from('leave_policies').select('*').order('leave_type'),
      supabase.from('policy_notes').select('*').order('display_order'),
    ]);
    if (pols) setPolicies(pols as LeavePolicy[]);
    if (nts) setNotes(nts as PolicyNote[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leave Policies</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Your entitlements and company rules at a glance.
        </p>
      </div>

      {/* Policy cards */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Leave Entitlements</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {policies.map((policy) => (
              <div
                key={policy.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: `${policy.color ?? '#6B7280'}18`,
                      color: policy.color ?? '#6B7280',
                    }}
                  >
                    {policy.leave_type}
                  </span>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-gray-900 tabular-nums">{policy.days_allowed}</span>
                    <span className="text-xs text-gray-400 ml-1">days/yr</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{policy.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Policy notes */}
      {!loading && notes.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Company Policy Notes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notes.map((note, idx) => (
              <div
                key={note.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex gap-3"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: '#0D948818' }}
                >
                  <Shield className="w-3.5 h-3.5 text-[#0D9488]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Note {idx + 1}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{note.note_text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && notes.length === 0 && policies.length > 0 && (
        <p className="text-xs text-gray-400 italic">No additional policy notes have been added by HR.</p>
      )}
    </div>
  );
};
