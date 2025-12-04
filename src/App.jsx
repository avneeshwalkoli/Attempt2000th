import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Messages from './modules/chatspace/pages/Messages.jsx';
import Meet from './modules/meetspace/pages/Meet.jsx';
import DeskLinkPage from './modules/desklink/pages/DeskLinkPage.jsx';
// --- AUTH IMPORTS ---
import Welcome from './modules/auth/pages/Welcome.jsx'; // 💡 Make sure this path is correct!
import Login from './modules/auth/pages/Login.jsx';
import Signup from './modules/auth/pages/Signup.jsx';
// --------------------
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

  // If not authenticated, ALWAYS redirect to the login page, 
  // but save the path they tried to visit (for post-login redirect).
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        
        {/* 1. WELCOME PAGE: This is the entry point for the entire application. */}
        <Route path="/" element={<Welcome />} /> 

        {/* 2. AUTHENTICATION PAGES: /login and /signup */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* 3. PROTECTED ROUTES: Only accessible if authenticated (via AuthGuard) */}
        <Route element={<AuthGuard />}>
          <Route path="/workspace/messages" element={<Messages />} />
          <Route path="/workspace/meet" element={<Meet />} />
          <Route path="/workspace/desklink" element={<DeskLinkPage />} />
          {/* Optional: Redirect from base /workspace to a default page */}
          <Route path="/workspace" element={<Navigate to="/workspace/messages" replace />} />
        </Route>

        {/* 4. CATCH-ALL: For any path not defined above, redirect to the Welcome screen. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}