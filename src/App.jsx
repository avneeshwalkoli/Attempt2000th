import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Messages from './modules/chatspace/pages/Messages.jsx';
import Meet from './modules/meetspace/pages/Meet.jsx';
import Login from './modules/auth/pages/Login.jsx';
import Signup from './modules/auth/pages/Signup.jsx';
import { AuthProvider } from './modules/auth/context/AuthContext.jsx';
import { useAuth } from './modules/auth/hooks/useAuth.js';

function AuthGuard() {
  const location = useLocation();
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-50">
        <div className="text-sm text-slate-400">Checking session…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route element={<AuthGuard />}>
          <Route path="/workspace/messages" element={<Messages />} />
          <Route path="/workspace/meet" element={<Meet />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
