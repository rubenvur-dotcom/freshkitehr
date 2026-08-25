import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AppLayout } from './components/AppLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AllRequestsPage } from './pages/admin/AllRequestsPage';
import { EmployeesPage } from './pages/admin/EmployeesPage';
import { OffboardingPage } from './pages/admin/OffboardingPage';
import { EmployeeDashboard } from './pages/employee/EmployeeDashboard';
import { MyRequestsPage } from './pages/employee/MyRequestsPage';
import { MyDocumentsPage } from './pages/employee/MyDocumentsPage';
import { EmployeeAnnouncementsPage } from './pages/employee/EmployeeAnnouncementsPage';
import { AdminAnnouncementsPage } from './pages/admin/AdminAnnouncementsPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { HandbookPage } from './pages/HandbookPage';
import { AdminPermissionsPage } from './pages/admin/AdminPermissionsPage';
import SystemSettingsPage from './pages/admin/SystemSettingsPage';

// Full-screen loading spinner shown while session is being restored
function SessionLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  );
}

// Guards authenticated routes. When role='admin' is required and user is an
// employee, they are bounced to their own dashboard (and vice versa).
function ProtectedRoute({
  children,
  requireRole,
}: {
  children: React.ReactNode;
  requireRole?: 'admin' | 'employee';
}) {
  const { session, profile, loading } = useAuthStore();

  if (loading) return <SessionLoader />;

  // Not authenticated
  if (!session) return <Navigate to="/login" replace />;

  // Profile loaded — enforce role restrictions
  if (profile) {
    if (requireRole === 'admin' && profile.role !== 'admin') {
      return <Navigate to="/employee/dashboard" replace />;
    }
    if (requireRole === 'employee' && profile.role !== 'employee') {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

// Root redirect: send authenticated users to their role-appropriate dashboard.
// Unauthenticated users go to /login.
function RootRedirect() {
  const { session, profile, loading } = useAuthStore();

  if (loading) return <SessionLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <SessionLoader />;

  return profile.role === 'admin'
    ? <Navigate to="/admin/dashboard" replace />
    : <Navigate to="/employee/dashboard" replace />;
}

function App() {
  const { setSession, fetchProfile, startActiveCheck } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        useAuthStore.setState({ loading: false });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          useAuthStore.setState({ loading: false });
        }
      })();
    });

    const stopActiveCheck = startActiveCheck();

    return () => {
      subscription.unsubscribe();
      stopActiveCheck();
    };
  }, [setSession, fetchProfile, startActiveCheck]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Root redirect based on role */}
        <Route path="/" element={<RootRedirect />} />

        {/* Admin routes — blocked for employees */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireRole="admin">
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="requests" element={<AllRequestsPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="offboarding/:employeeId" element={<OffboardingPage />} />
          <Route path="announcements" element={<AdminAnnouncementsPage />} />
          <Route path="handbook" element={<HandbookPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="permissions" element={<AdminPermissionsPage />} />
          <Route path="settings" element={<SystemSettingsPage />} />
        </Route>

        {/* Employee routes — blocked for admins */}
        <Route
          path="/employee"
          element={
            <ProtectedRoute requireRole="employee">
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/employee/dashboard" replace />} />
          <Route path="dashboard" element={<EmployeeDashboard />} />
          <Route path="documents" element={<MyDocumentsPage />} />
          <Route path="requests" element={<MyRequestsPage />} />
          <Route path="announcements" element={<EmployeeAnnouncementsPage />} />
          <Route path="handbook" element={<HandbookPage />} />
          <Route path="permissions" element={<Navigate to="/employee/requests?tab=permissions" replace />} />
        </Route>

        {/* Catch-all — redirect to root which then redirects by role */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
