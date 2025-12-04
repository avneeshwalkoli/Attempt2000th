import React, { useState } from 'react';
import { Monitor, Mouse, Clipboard, FileText } from 'lucide-react';

export default function IncomingRequestModal({
  requesterName,
  deviceLabel,
  onAccept,
  onReject,
}) {
  const [permissions, setPermissions] = useState({
    viewOnly: false,
    allowControl: true,
    allowFileTransfer: true,
    allowClipboard: true,
  });

  const handleAccept = () => {
    onAccept(permissions);
  };

  const togglePermission = (key) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <div className="relative z-50 w-full max-w-md rounded-3xl border border-slate-800/70 bg-slate-900/80 backdrop-blur-2xl px-8 py-7 shadow-[0_24px_80px_rgba(15,23,42,0.95)]">
        <h2 className="text-lg font-semibold text-slate-50">Incoming DeskLink Request</h2>
        <p className="mt-2 text-sm text-slate-400">
          <span className="text-slate-200">{requesterName}</span> wants to access{' '}
          <span className="text-slate-200">{deviceLabel}</span>.
        </p>

        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Permissions</p>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={permissions.viewOnly}
              onChange={() => togglePermission('viewOnly')}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Monitor size={16} />
              <span>View Only (disable control)</span>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={permissions.allowControl}
              onChange={() => togglePermission('allowControl')}
              disabled={permissions.viewOnly}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 disabled:opacity-50"
            />
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Mouse size={16} />
              <span>Allow Mouse & Keyboard Control</span>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={permissions.allowClipboard}
              onChange={() => togglePermission('allowClipboard')}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Clipboard size={16} />
              <span>Allow Clipboard Sync</span>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={permissions.allowFileTransfer}
              onChange={() => togglePermission('allowFileTransfer')}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <FileText size={16} />
              <span>Allow File Transfer</span>
            </div>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onReject}
            className="px-4 py-2 rounded-2xl border border-slate-700 text-sm text-slate-300 hover:bg-slate-800/70 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 rounded-2xl bg-emerald-500/90 text-slate-950 text-sm font-medium shadow-[0_15px_35px_rgba(16,185,129,0.45)] hover:bg-emerald-400 transition-colors"
          >
            Accept &amp; Connect
          </button>
        </div>
      </div>
    </div>
  );
}


