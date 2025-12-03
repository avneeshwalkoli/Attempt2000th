import React from 'react';
import { Video } from 'lucide-react';

export default function NewMeetingButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-10 py-8 shadow-[0_0_30px_rgba(248,153,60,0.45)] transition-transform transition-shadow hover:scale-[1.03] hover:shadow-[0_0_40px_rgba(248,153,60,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950/20 backdrop-blur">
        <Video className="h-8 w-8 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.45)]" />
      </div>
      <span className="text-sm font-medium text-slate-50">New meeting</span>
    </button>
  );
}
