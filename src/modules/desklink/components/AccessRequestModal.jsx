import React from 'react';
import { Loader2, X } from 'lucide-react';

export default function AccessRequestModal({
  deviceId,
  onClose,
  title = 'Request Sent',
  description = 'Waiting for the remote user to accept your connection request…',
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-50 w-full max-w-sm rounded-2xl border border-slate-800/70
                   bg-slate-900/80 backdrop-blur-2xl px-6 py-5
                   shadow-[0_24px_80px_rgba(15,23,42,0.95)]
                   animate-[fadeInUp_0.35s_ease-out]"
      >
        <button
          onClick={onClose}
          className="absolute right-3.5 top-3.5 w-7 h-7 rounded-full flex items-center justify-center
                     text-slate-500 hover:text-slate-200 hover:bg-slate-800/70 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-3 pt-2">
          <div className="w-11 h-11 rounded-2xl bg-slate-800/80 flex items-center justify-center mb-1">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-50">
              {title}
            </h2>
            <p className="mt-1 text-[12px] text-slate-400">
              {description}
            </p>
          </div>

          {deviceId && (
            <div className="mt-1 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900/70">
              <span className="text-[11px] font-mono text-slate-300">
                ID:&nbsp;
                <span className="text-indigo-400">{deviceId}</span>
              </span>
            </div>
          )}

          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed max-w-xs">
            This window will update automatically when the remote user responds.
            You can safely navigate within VisionDesk while you wait.
          </p>
        </div>
      </div>
    </div>
  );
}


