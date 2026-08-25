import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../hooks/use-toast';
import { Users, UserCircle, CalendarDays, Building2, BookOpen, ScrollText, Bell, Settings } from 'lucide-react';
import { UsersSection }           from './settings/UsersSection';
import { EmployeeRecordsSection } from './settings/EmployeeRecordsSection';
import { LeaveSettingsSection }   from './settings/LeaveSettingsSection';
import { DepartmentsSection }     from './settings/DepartmentsSection';
import { ContentSection }         from './settings/ContentSection';
import { AuditLogsSection }       from './settings/AuditLogsSection';
import { NotificationSection }    from './settings/NotificationSection';
import { PlatformSection }        from './settings/PlatformSection';

const NAV_ITEMS = [
  { id: 'users',       label: 'Users & Access',        icon: Users },
  { id: 'employees',   label: 'Employee Records',       icon: UserCircle },
  { id: 'leave',       label: 'Leave Settings',         icon: CalendarDays },
  { id: 'departments', label: 'Departments',            icon: Building2 },
  { id: 'content',     label: 'Content Management',     icon: BookOpen },
  { id: 'audit',       label: 'Audit Logs',             icon: ScrollText },
  { id: 'notifications', label: 'Notification Settings', icon: Bell },
  { id: 'platform',   label: 'Platform Settings',       icon: Settings },
] as const;

type SectionId = (typeof NAV_ITEMS)[number]['id'];

const SECTION_DESCRIPTIONS: Record<SectionId, string> = {
  users:         'Manage authentication users — invite, delete, promote, and reset passwords.',
  employees:     'View, add, edit, and import employee profile records.',
  leave:         'Configure leave type defaults, per-employee overrides, and permission limits.',
  departments:   'Add, rename, and remove departments.',
  content:       'Manage announcements and handbook sections.',
  audit:         'Searchable log of all admin actions across the platform.',
  notifications: 'Control which email notifications are sent and configure SMTP.',
  platform:      'Company settings, environment info, and Supabase connection status.',
};

function renderSection(id: SectionId) {
  switch (id) {
    case 'users':         return <UsersSection />;
    case 'employees':     return <EmployeeRecordsSection />;
    case 'leave':         return <LeaveSettingsSection />;
    case 'departments':   return <DepartmentsSection />;
    case 'content':       return <ContentSection />;
    case 'audit':         return <AuditLogsSection />;
    case 'notifications': return <NotificationSection />;
    case 'platform':      return <PlatformSection />;
  }
}

const SystemSettingsPage: React.FC = () => {
  const { profile } = useAuthStore();
  const { toast }   = useToast();
  const [active, setActive] = useState<SectionId>('users');

  if (!profile) return null;

  if (profile.role !== 'admin') {
    toast({ title: 'Access Denied', description: 'You must be an admin to view System Settings.', variant: 'destructive' });
    return <Navigate to="/dashboard" replace />;
  }

  const current = NAV_ITEMS.find(n => n.id === active)!;

  return (
    <div className="flex h-full min-h-screen bg-[#F5F5F7]">
      {/* Left sub-nav */}
      <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#CCFBF1] flex items-center justify-center">
              <Settings className="w-4 h-4 text-[#0D9488]" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-none">System Settings</p>
              <p className="text-xs text-gray-400 mt-0.5">Admin only</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                active === id
                  ? 'bg-[#CCFBF1] text-[#0D9488] font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#CCFBF1] flex items-center justify-center flex-shrink-0">
              <current.icon className="w-5 h-5 text-[#0D9488]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-none">{current.label}</h1>
              <p className="text-sm text-gray-500 mt-1">{SECTION_DESCRIPTIONS[active]}</p>
            </div>
          </div>

          {/* Section content */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            {renderSection(active)}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SystemSettingsPage;
