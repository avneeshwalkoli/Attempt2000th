import React from 'react';

export default function IncomingRequestModal({
  requesterName,
  deviceLabel,
  onAccept,
  onReject,
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <div className="relative z-50 w-full max-w-md rounded-3xl border border-slate-800/70 bg-slate-900/80 backdrop-blur-2xl px-8 py-7 shadow-[0_24px_80px_rgba(15,23,42,0.95)]">
        <h2 className="text-lg font-semibold text-slate-50">Incoming DeskLink Request</h2>
        <p className="mt-2 text-sm text-slate-400">
          <span className="text-slate-200">{requesterName}</span> wants to access{' '}
          <span className="text-slate-200">{deviceLabel}</span>.
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onReject}
            className="px-4 py-2 rounded-2xl border border-slate-700 text-sm text-slate-300 hover:bg-slate-800/70 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={onAccept}
            className="px-4 py-2 rounded-2xl bg-emerald-500/90 text-slate-950 text-sm font-medium shadow-[0_15px_35px_rgba(16,185,129,0.45)] hover:bg-emerald-400 transition-colors"
          >
            Accept &amp; Connect
          </button>
        </div>
      </div>
    </div>
  );
}


