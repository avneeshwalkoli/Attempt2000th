import React from 'react';
import SidebarShell from '../../chatspace/components/SidebarShell.jsx';

export default function Meet() {
  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-50">
      <SidebarShell />
      <main className="flex-1 flex items-center justify-center">
        <div className="max-w-md text-center px-4">
          <h1 className="text-2xl font-semibold mb-2">VisionDesk MeetSpace</h1>
          <p className="text-slate-400 text-sm mb-4">
            This is a placeholder for a future Zoom-style meeting experience.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-700 text-xs text-slate-300">
            <span className="text-lg">📹</span>
            <span>WebRTC-powered meetings coming soon</span>
          </div>
        </div>
      </main>
    </div>
  );
}
