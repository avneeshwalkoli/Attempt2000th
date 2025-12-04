import React from 'react';
import { Monitor, Square, Maximize2, Minimize2 } from 'lucide-react';

export default function RemoteControls({
  onEnd,
  onToggleFullscreen,
  isFullscreen,
  connectionState,
  iceConnectionState,
}) {
  const getConnectionStatus = () => {
    if (connectionState === 'connected' && iceConnectionState === 'connected') {
      return { text: 'Connected', color: 'text-emerald-400' };
    }
    if (connectionState === 'connecting' || iceConnectionState === 'checking') {
      return { text: 'Connecting...', color: 'text-amber-400' };
    }
    if (connectionState === 'failed' || iceConnectionState === 'failed') {
      return { text: 'Connection Failed', color: 'text-red-400' };
    }
    return { text: 'Disconnected', color: 'text-slate-400' };
  };

  const status = getConnectionStatus();

  return (
    <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-sm rounded-2xl px-6 py-4 border border-slate-800/70">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.color === 'text-emerald-400' ? 'bg-emerald-400' : status.color === 'text-amber-400' ? 'bg-amber-400' : 'bg-red-400'} ${status.color === 'text-emerald-400' ? 'animate-pulse' : ''}`} />
          <span className={`text-sm font-medium ${status.color}`}>{status.text}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onToggleFullscreen}
          className="p-2 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        <button
          onClick={onEnd}
          className="px-4 py-2 rounded-xl bg-red-500/90 hover:bg-red-400 text-slate-950 text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Square size={16} />
          End Session
        </button>
      </div>
    </div>
  );
}