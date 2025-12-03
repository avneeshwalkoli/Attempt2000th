import React from 'react';
import { Settings } from 'lucide-react';

export default function SettingsIcon() {
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/60 text-slate-400 shadow-sm backdrop-blur transition-colors hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <Settings className="h-4 w-4" />
    </button>
  );
}
