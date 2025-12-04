import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MonitorSmartphone } from 'lucide-react';

export default function DeskLinkSidebarEntry() {
  const navigate = useNavigate();
  const location = useLocation();
  const targetPath = '/workspace/desklink';
  const isActive = location.pathname === targetPath;

  return (
    <button
      onClick={() => navigate(targetPath)}
      className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg transition-colors hover:bg-slate-800 ${
        isActive ? 'bg-slate-800 text-indigo-400' : 'text-slate-400'
      }`}
      title="DeskLink"
    >
      <MonitorSmartphone className="w-5 h-5" />
    </button>
  );
}


