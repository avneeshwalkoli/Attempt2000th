import React, { useEffect, useState } from 'react';
import { KeyRound, ArrowRight } from 'lucide-react';

export default function ConnectDeviceCard({ initialDeviceId = '', onRequestAccess }) {
  const [value, setValue] = useState(initialDeviceId || '');

  useEffect(() => {
    setValue(initialDeviceId || '');
  }, [initialDeviceId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onRequestAccess?.(value.trim());
  };

  return (
    <div
      className="w-full max-w-xl rounded-3xl border border-slate-800/70 bg-slate-900/60
                 backdrop-blur-2xl shadow-[0_24px_80px_rgba(15,23,42,0.9)]
                 px-8 py-7 md:px-10 md:py-9
                 animate-[fadeInUp_0.5s_ease-out]"
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-blue-500
                     flex items-center justify-center shadow-[0_12px_40px_rgba(56,189,248,0.65)]"
        >
          <KeyRound className="w-5 h-5 text-slate-950" />
        </div>
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-slate-50">
            Connect to a Device
          </h1>
          <p className="text-[12px] md:text-xs text-slate-400 mt-0.5">
            Enter the DeskLink ID of the device you want to access.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="desklink-id"
            className="text-[11px] uppercase tracking-[0.16em] text-slate-500"
          >
            DeskLink ID
          </label>
          <div className="relative group">
            <input
              id="desklink-id"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter Device ID…"
              className="w-full rounded-2xl bg-slate-900/70 border border-slate-800
                         px-4 py-3.5 pl-4 pr-16 text-sm text-slate-50 placeholder:text-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/80 focus:border-transparent
                         shadow-inner shadow-black/40 transition-all"
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[11px] font-mono text-slate-500">
              DL-•••
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-medium
                     bg-gradient-to-r from-indigo-500 via-sky-500 to-blue-500
                     text-slate-950 shadow-[0_18px_45px_rgba(59,130,246,0.75)]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     hover:shadow-[0_22px_60px_rgba(56,189,248,0.9)]
                     hover:translate-y-[-1px] active:translate-y-[0px] transition-all duration-150"
        >
          <span>Request Access</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-[11px] text-slate-500 leading-relaxed max-w-md">
          The device must have the{' '}
          <span className="text-slate-300">DeskLink Agent</span> installed,
          running, and connected to the internet. A remote user will need to
          accept your request before you can control their desktop.
        </p>
      </form>
    </div>
  );
}


