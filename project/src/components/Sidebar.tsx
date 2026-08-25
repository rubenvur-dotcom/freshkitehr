import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { KiteLogo } from './KiteLogo';
import {
  LayoutDashboard, Users, FileText, LogOut,
  ChevronLeft, ChevronRight, ClipboardList, FolderOpen,
  Megaphone, ChartBar as BarChart3, MessageSquare, BookOpen, Settings,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  newAnnouncementCount?: number;
  unseenCommentCount?: number;
}

const adminNav = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/requests', icon: ClipboardList, label: 'All Requests' },
  { to: '/admin/employees', icon: Users, label: 'Employees' },
  { to: '/admin/announcements', icon: Megaphone, label: 'Announcements', isAnnouncements: true },
  { to: '/admin/handbook', icon: BookOpen, label: 'Handbook' },
  { to: '/admin/reports', icon: BarChart3, label: 'Reports' },
  { to: '/admin/settings', icon: Settings, label: 'System Settings' },
];

const employeeNav = [
  { to: '/employee/dashboard', icon: LayoutDashboard, label: 'My Dashboard' },
  { to: '/employee/documents', icon: FolderOpen, label: 'My Documents' },
  { to: '/employee/requests', icon: FileText, label: 'My Requests' },
  { to: '/employee/announcements', icon: Megaphone, label: 'Announcements', isAnnouncements: true },
  { to: '/employee/handbook', icon: BookOpen, label: 'Handbook' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggle,
  newAnnouncementCount = 0,
  unseenCommentCount = 0,
}) => {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const nav = profile?.role === 'admin' ? adminNav : employeeNav;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full flex flex-col transition-all duration-300 z-30',
        'bg-[#0A0F1E] border-r border-[#1E2A3B]',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-[#1E2A3B] h-16',
        collapsed ? 'justify-center px-0' : 'gap-3 px-4'
      )}>
        <a href="https://freshkite.io" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
          <img
            src="/freshkite-logo.png"
            alt="Freshkite HR"
            className="h-8 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const next = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (next) next.style.display = 'block';
            }}
          />
          <span style={{ display: 'none' }}><KiteLogo size={32} /></span>
        </a>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-bold text-white text-sm leading-tight">Freshkite HR</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {nav.map(({ to, icon: Icon, label, isAnnouncements }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg transition-all duration-150 font-medium text-sm group relative',
                collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5',
                isActive
                  ? 'bg-[#0D9488]/20 text-[#2DD4BF]'
                  : 'text-[#94A3B8] hover:bg-[#0D9488]/10 hover:text-[#2DD4BF]'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-[#0D9488]" />
                )}
                <Icon className={cn(
                  'w-5 h-5 flex-shrink-0',
                  isActive ? 'text-[#0D9488]' : 'text-[#475569] group-hover:text-[#0D9488]'
                )} />
                {!collapsed && <span className="flex-1">{label}</span>}

                {isAnnouncements && (
                  collapsed ? (
                    <span className="absolute top-1.5 right-1.5 flex gap-0.5">
                      {newAnnouncementCount > 0 && (
                        <span className="w-4 h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full leading-none">
                          {newAnnouncementCount > 9 ? '9+' : newAnnouncementCount}
                        </span>
                      )}
                      {unseenCommentCount > 0 && (
                        <span className="w-4 h-4 flex items-center justify-center bg-[#CCFBF1] text-[#0D9488] rounded-full">
                          <MessageSquare className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 ml-auto">
                      {newAnnouncementCount > 0 && (
                        <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none">
                          {newAnnouncementCount > 99 ? '99+' : newAnnouncementCount}
                        </span>
                      )}
                      {unseenCommentCount > 0 && (
                        <span className="flex items-center gap-0.5 px-1.5 h-[18px] text-[10px] font-semibold bg-[#CCFBF1] text-[#0D9488] rounded-full leading-none">
                          <MessageSquare className="w-2.5 h-2.5" />
                          {unseenCommentCount}
                        </span>
                      )}
                    </span>
                  )
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User info + sign out */}
      <div className="border-t border-[#1E2A3B] p-3 space-y-1">
        {!collapsed && profile && (
          <div className="px-2 py-2 mb-1 bg-[#1E2A3B] rounded-lg">
            <p className="text-xs font-semibold text-white truncate">{profile.full_name}</p>
            <p className="text-[11px] text-[#64748B] truncate">{profile.email}</p>
            <span className={cn(
              'inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
              profile.role === 'admin'
                ? 'bg-[#CCFBF1] text-[#0D9488]'
                : 'bg-[#1A2332] text-[#64748B]'
            )}>
              {profile.role === 'admin' ? 'Admin' : 'Employee'}
            </span>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center gap-3 rounded-lg transition-all text-sm text-[#64748B] hover:bg-red-900/30 hover:text-red-400 w-full',
            collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-[#1E2A3B] border border-[#2D3B50] rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow text-[#64748B] hover:text-[#94A3B8]"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  );
};
