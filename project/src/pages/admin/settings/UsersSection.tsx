import React, { useEffect, useState, useCallback } from 'react';
import { supabase, type Profile } from '../../../lib/supabase';
import {
  listAuthUsers, inviteUser, deleteAuthUser,
  updateAuthUserEmail, banUser, unbanUser, forceSignOut, type AuthUser,
} from '../../../lib/adminApi';
import { logAudit } from '../../../lib/auditLog';
import { useAuthStore } from '../../../store/authStore';
import { useToast } from '../../../hooks/use-toast';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import {
  UserPlus, Trash2, Shield, ShieldOff, KeyRound,
  UserX, UserCheck, RefreshCw, Search, Edit2, LogOut,
} from 'lucide-react';

interface MergedUser extends AuthUser { profile?: Profile; }

export const UsersSection: React.FC = () => {
  const { profile: me } = useAuthStore();
  const { toast } = useToast();
  const [users, setUsers]         = useState<MergedUser[]>([]);
  const [_profiles, _setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 20;

  // Dialog state
  const [inviteEmail, setInviteEmail]   = useState('');
  const [showInvite, setShowInvite]     = useState(false);
  const [inviting, setInviting]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MergedUser | null>(null);
  const [roleTarget, setRoleTarget]     = useState<MergedUser | null>(null);
  const [editTarget, setEditTarget]     = useState<MergedUser | null>(null);
  const [editEmail, setEditEmail]       = useState('');
  const [banTarget, setBanTarget]       = useState<MergedUser | null>(null);
  const [signOutTarget, setSignOutTarget] = useState<MergedUser | null>(null);
  const [working, setWorking]           = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profRes, authUsers] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        listAuthUsers().catch(() => [] as AuthUser[]),
      ]);
      const profs: Profile[] = profRes.data ?? [];
      _setProfiles(profs);

      if (authUsers.length > 0) {
        const merged = authUsers.map(au => ({
          ...au,
          profile: profs.find(p => p.id === au.id),
        }));
        setUsers(merged);
      } else {
        // Fallback: use profiles only
        const fallback: MergedUser[] = profs.map(p => ({
          id:                 p.id,
          email:              p.email,
          created_at:         p.created_at,
          last_sign_in_at:    null,
          banned_until:       null,
          email_confirmed_at: null,
          profile:            p,
        }));
        setUsers(fallback);
      }
    } catch (e: unknown) {
      toast({ title: 'Error loading users', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.profile?.full_name ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleInvite = async () => {
    if (!inviteEmail || !me) return;
    setInviting(true);
    try {
      await inviteUser(inviteEmail);
      await logAudit(me.id, me.full_name, 'user_invited', 'auth_user', undefined, { email: inviteEmail });
      toast({ title: 'Invitation sent', description: `Invite sent to ${inviteEmail}` });
      setShowInvite(false);
      setInviteEmail('');
      load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !me) return;
    setWorking(true);
    try {
      await deleteAuthUser(deleteTarget.id);
      await supabase.from('profiles').delete().eq('id', deleteTarget.id);
      await logAudit(me.id, me.full_name, 'user_deleted', 'auth_user', deleteTarget.id, { email: deleteTarget.email });
      toast({ title: 'User deleted', description: deleteTarget.email });
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleRoleToggle = async () => {
    if (!roleTarget?.profile || !me) return;
    setWorking(true);
    const newRole = roleTarget.profile.role === 'admin' ? 'employee' : 'admin';
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', roleTarget.id);
      if (error) throw error;
      await logAudit(me.id, me.full_name, 'role_changed', 'profile', roleTarget.id, { from: roleTarget.profile.role, to: newRole });
      toast({ title: 'Role updated', description: `${roleTarget.profile.full_name} is now ${newRole}` });
      setRoleTarget(null);
      load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handlePasswordReset = async (u: MergedUser) => {
    if (!me) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
      await logAudit(me.id, me.full_name, 'password_reset_sent', 'auth_user', u.id, { email: u.email });
      toast({ title: 'Password reset sent', description: u.email });
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleBanToggle = async () => {
    if (!banTarget || !me) return;
    setWorking(true);
    const isBanned = !!banTarget.banned_until;
    try {
      if (isBanned) await unbanUser(banTarget.id);
      else await banUser(banTarget.id);
      await logAudit(me.id, me.full_name, isBanned ? 'user_enabled' : 'user_disabled', 'auth_user', banTarget.id);
      toast({ title: isBanned ? 'User enabled' : 'User disabled', description: banTarget.email });
      setBanTarget(null);
      load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleForceSignOut = async () => {
    if (!signOutTarget || !me) return;
    setWorking(true);
    try {
      await forceSignOut(signOutTarget.id);
      await logAudit(me.id, me.full_name, 'user_force_signed_out', 'auth_user', signOutTarget.id);
      toast({ title: 'User signed out', description: signOutTarget.email });
      setSignOutTarget(null);
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!editTarget || !editEmail || !me) return;
    setWorking(true);
    try {
      await updateAuthUserEmail(editTarget.id, editEmail);
      await logAudit(me.id, me.full_name, 'user_email_updated', 'auth_user', editTarget.id, { old: editTarget.email, new: editEmail });
      toast({ title: 'Email updated' });
      setEditTarget(null);
      load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search users…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-9" />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load} className="h-9 px-3"><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={() => setShowInvite(true)} className="h-9 bg-[#0D9488] hover:bg-[#0F766E] text-white gap-1.5">
            <UserPlus className="w-4 h-4" /> Invite User
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Last Sign-In</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">Loading…</td></tr>
            ) : paginated.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">No users found</td></tr>
            ) : paginated.map(u => {
              const isBanned = !!u.banned_until;
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{u.profile?.full_name ?? '—'}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.profile?.role === 'admin' ? 'bg-[#CCFBF1] text-[#0D9488]' : 'bg-gray-100 text-gray-600'}`}>
                      {u.profile?.role ?? 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isBanned ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {isBanned ? 'Disabled' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-[#0D9488]" title="Edit email" onClick={() => { setEditTarget(u); setEditEmail(u.email); }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-[#0D9488]" title="Password reset" onClick={() => handlePasswordReset(u)}>
                        <KeyRound className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${u.profile?.role === 'admin' ? 'text-[#EF4444] hover:bg-red-50' : 'text-[#0D9488] hover:bg-[#CCFBF1]'}`} title={u.profile?.role === 'admin' ? 'Revoke admin' : 'Make admin'} onClick={() => setRoleTarget(u)}>
                        {u.profile?.role === 'admin' ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-amber-600" title={isBanned ? 'Enable user' : 'Disable user'} onClick={() => setBanTarget(u)}>
                        {isBanned ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-orange-600" title="Force sign out" onClick={() => setSignOutTarget(u)}>
                        <LogOut className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:bg-red-50" title="Delete user" onClick={() => setDeleteTarget(u)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{filtered.length} users</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-8">Prev</Button>
            <span className="flex items-center px-2">{page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="h-8">Next</Button>
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}

      {/* Invite */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-[420px] max-h-[60vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Invite New User</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <Input placeholder="Email address" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInvite()} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">
                {inviting ? 'Sending…' : 'Send Invite'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit email */}
      <Dialog open={!!editTarget} onOpenChange={o => !o && setEditTarget(null)}>
        <DialogContent className="max-w-[420px] max-h-[60vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Update Email</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-500">Current: <strong>{editTarget?.email}</strong></p>
            <Input placeholder="New email address" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button onClick={handleUpdateEmail} disabled={working} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#EF4444]">Delete User</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete <strong>{deleteTarget?.profile?.full_name ?? deleteTarget?.email}</strong>? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={working} className="bg-[#EF4444] hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Role toggle */}
      <AlertDialog open={!!roleTarget} onOpenChange={o => !o && setRoleTarget(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{roleTarget?.profile?.role === 'admin' ? 'Revoke Admin Access' : 'Grant Admin Access'}</AlertDialogTitle>
            <AlertDialogDescription>
              {roleTarget?.profile?.role === 'admin'
                ? `Remove admin privileges from ${roleTarget?.profile?.full_name}?`
                : `Grant admin privileges to ${roleTarget?.profile?.full_name}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleToggle} disabled={working} className={roleTarget?.profile?.role === 'admin' ? 'bg-[#EF4444] hover:bg-red-700 text-white' : 'bg-[#0D9488] hover:bg-[#0F766E] text-white'}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ban toggle */}
      <AlertDialog open={!!banTarget} onOpenChange={o => !o && setBanTarget(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{banTarget?.banned_until ? 'Enable User' : 'Disable User'}</AlertDialogTitle>
            <AlertDialogDescription>{banTarget?.banned_until ? `Re-enable ${banTarget?.email}?` : `Disable login for ${banTarget?.email}?`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBanToggle} disabled={working} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force sign out */}
      <AlertDialog open={!!signOutTarget} onOpenChange={o => !o && setSignOutTarget(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Force Sign Out</AlertDialogTitle>
            <AlertDialogDescription>Invalidate all sessions for <strong>{signOutTarget?.email}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceSignOut} disabled={working} className="bg-[#0D9488] hover:bg-[#0F766E] text-white">Sign Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
