import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useEffect } from 'react';
import { useStore } from './store/useStore';
import Layout from './components/Layout';
import WeekCalendar from './pages/WeekCalendar';
import MonthCalendar from './pages/MonthCalendar';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { Calendar } from 'lucide-react';

function AppRoutes() {
  const { user, loading } = useAuth();
  const loadAll = useStore(s => s.loadAll);
  const reset = useStore(s => s.reset);
  const storeLoaded = useStore(s => s.loaded);

  useEffect(() => {
    if (user) {
      loadAll();
    } else {
      reset();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Laden...</div>
      </div>
    );
  }

  if (!user) return <Login />;

  if (!storeLoaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <Calendar className="h-10 w-10 text-blue-500 animate-pulse" />
        <div className="text-white text-lg font-medium">Data laden...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<WeekCalendar />} />
        <Route path="maand" element={<MonthCalendar />} />
        <Route path="rapportage" element={<Reports />} />
        <Route path="instellingen" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
