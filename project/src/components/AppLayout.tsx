import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { cn } from '../lib/utils';
import { Toaster } from './ui/toaster';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { profile } = useAuthStore();

  // Red badge: count of announcements newer than last_read_at
  const [newAnnouncementCount, setNewAnnouncementCount] = useState(0);
  // Blue badge: set of announcement IDs with unseen comment activity
  const [unseenCommentIds, setUnseenCommentIds] = useState<Set<string>>(new Set());

  const refreshBadges = useCallback(async () => {
    if (!profile) return;

    // --- Red badge: announcements since last visit ---
    const { data: marker } = await supabase
      .from('announcement_read_markers')
      .select('last_read_at')
      .eq('user_id', profile.id)
      .maybeSingle();

    const since = marker?.last_read_at ?? '1970-01-01T00:00:00Z';

    const { count } = await supabase
      .from('announcements')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', since)
      .or(
        profile.role === 'admin'
          ? 'target_audience.eq.all,target_audience.eq.admin'
          : 'target_audience.eq.all,target_audience.eq.employee'
      );

    setNewAnnouncementCount(count ?? 0);

    // --- Blue badge: announcements with new comment activity ---
    // For admin: any post they authored that has comments newer than their seen marker
    // For employee: any post they've commented on where others commented after their seen marker

    // Step 1: get all seen markers for this user
    const { data: seenRows } = await supabase
      .from('announcement_comment_seen')
      .select('announcement_id, last_seen_at')
      .eq('user_id', profile.id);

    const seenMap = new Map<string, string>(
      (seenRows ?? []).map((r) => [r.announcement_id, r.last_seen_at])
    );

    // Step 2: get candidate announcement IDs (authored or participated in)
    let candidateIds: string[] = [];

    if (profile.role === 'admin') {
      const { data: authored } = await supabase
        .from('announcements')
        .select('id')
        .eq('author_id', profile.id);
      candidateIds = (authored ?? []).map((r) => r.id);
    } else {
      const { data: participated } = await supabase
        .from('announcement_comments')
        .select('announcement_id')
        .eq('author_id', profile.id);
      const unique = [...new Set((participated ?? []).map((r) => r.announcement_id))];
      candidateIds = unique;
    }

    if (candidateIds.length === 0) {
      setUnseenCommentIds(new Set());
      return;
    }

    // Step 3: for each candidate, check if there are comments newer than seen marker (and not by self)
    const newUnseen = new Set<string>();
    for (const annId of candidateIds) {
      const lastSeen = seenMap.get(annId) ?? '1970-01-01T00:00:00Z';
      const { count: newComments } = await supabase
        .from('announcement_comments')
        .select('id', { count: 'exact', head: true })
        .eq('announcement_id', annId)
        .neq('author_id', profile.id)
        .gt('created_at', lastSeen);
      if ((newComments ?? 0) > 0) newUnseen.add(annId);
    }

    setUnseenCommentIds(newUnseen);
  }, [profile]);

  useEffect(() => {
    refreshBadges();

    // Real-time: re-check badges when new announcements or comments arrive
    const announcementSub = supabase
      .channel('applayout-announcements')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => {
        refreshBadges();
      })
      .subscribe();

    const commentSub = supabase
      .channel('applayout-comments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcement_comments' }, () => {
        refreshBadges();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(announcementSub);
      supabase.removeChannel(commentSub);
    };
  }, [refreshBadges]);

  const clearRedBadge = useCallback(async () => {
    if (!profile) return;
    await supabase
      .from('announcement_read_markers')
      .upsert({ user_id: profile.id, last_read_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setNewAnnouncementCount(0);
  }, [profile]);

  const clearBlueBadge = useCallback((announcementId: string) => {
    setUnseenCommentIds((prev) => {
      const next = new Set(prev);
      next.delete(announcementId);
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen bg-[#F8F9FC] overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        newAnnouncementCount={newAnnouncementCount}
        unseenCommentCount={unseenCommentIds.size}
      />
      <main
        className={cn(
          'flex-1 overflow-y-auto transition-all duration-300',
          collapsed ? 'ml-16' : 'ml-60'
        )}
      >
        <div className="min-h-full">
          <Outlet context={{ clearRedBadge, clearBlueBadge, unseenCommentIds, refreshBadges }} />
        </div>
      </main>
      <Toaster />
    </div>
  );
};
