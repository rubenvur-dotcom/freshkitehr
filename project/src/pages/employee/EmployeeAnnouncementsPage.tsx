import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { AnnouncementsFeed, AnnouncementWithProfile } from '../../components/AnnouncementsFeed';

interface OutletCtx {
  clearRedBadge: () => void;
  clearBlueBadge: (id: string) => void;
  unseenCommentIds: Set<string>;
}

function isExpired(a: AnnouncementWithProfile): boolean {
  return !!a.expires_at && new Date(a.expires_at) < new Date();
}

export const EmployeeAnnouncementsPage: React.FC = () => {
  const { clearRedBadge, clearBlueBadge, unseenCommentIds } = useOutletContext<OutletCtx>();
  const [announcements, setAnnouncements] = useState<AnnouncementWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('announcements')
      .select('*, profiles!author_id(full_name)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      setFetchError(error.message);
    } else {
      setAnnouncements(((data ?? []) as AnnouncementWithProfile[]).filter((a) => !isExpired(a)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnnouncements();
    clearRedBadge();

    // Real-time: refresh feed whenever any announcement is created, updated, or deleted
    const channel = supabase
      .channel('employee-announcements-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        fetchAnnouncements();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAnnouncements, clearRedBadge]);

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {loading ? '—' : `${announcements.length} active announcement${announcements.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {fetchError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          Failed to load announcements: {fetchError}
        </div>
      ) : (
        <AnnouncementsFeed
          isAdmin={false}
          announcements={announcements}
          loading={loading}
          unseenCommentIds={unseenCommentIds}
          onClearBlueBadge={clearBlueBadge}
        />
      )}
    </div>
  );
};
