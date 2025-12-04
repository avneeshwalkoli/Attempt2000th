import React, { useRef, useEffect, useState } from 'react';
import {
  createMouseMoveMessage,
  createMouseClickMessage,
  createMouseWheelMessage,
  MessageThrottler,
} from '../utils/controlProtocol';

export default function RemoteVideoArea({
  stream,
  onControlMessage,
  sessionId,
  token,
  permissions,
  stats,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [remoteCursor, setRemoteCursor] = useState({ x: 0, y: 0, visible: false });
  const throttlerRef = useRef(new MessageThrottler(16));

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      throttlerRef.current.clear();
    };
  }, []);

  const getNormalizedCoords = (e) => {
    const rect = videoRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x, y };
  };

  const handleMouseMove = (e) => {
    if (!permissions?.allowControl) return;

    const { x, y } = getNormalizedCoords(e);
    setRemoteCursor({ x: x * 100, y: y * 100, visible: true });

    const message = createMouseMoveMessage(x, y, sessionId, token);
    throttlerRef.current.throttle(message, onControlMessage);
  };

  const handleMouseClick = (e) => {
    if (!permissions?.allowControl) return;

    const { x, y } = getNormalizedCoords(e);
    const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';
    const message = createMouseClickMessage(x, y, button, sessionId, token);
    onControlMessage(message);
  };

  const handleWheel = (e) => {
    if (!permissions?.allowControl) return;

    e.preventDefault();
    const message = createMouseWheelMessage(e.deltaX, e.deltaY, sessionId, token);
    onControlMessage(message);
  };

  const handleMouseLeave = () => {
    setRemoteCursor((prev) => ({ ...prev, visible: false }));
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-950 rounded-2xl overflow-hidden"
      onMouseMove={handleMouseMove}
      onClick={handleMouseClick}
      onWheel={handleWheel}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Remote Cursor Overlay */}
      {remoteCursor.visible && permissions?.allowControl && (
        <div
          className="absolute w-4 h-4 bg-emerald-500 rounded-full pointer-events-none transition-transform duration-75"
          style={{
            left: `${remoteCursor.x}%`,
            top: `${remoteCursor.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-75" />
        </div>
      )}

      {/* Stats Overlay */}
      {stats && (
        <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-slate-300 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">FPS:</span>
            <span className="font-mono">{stats.fps}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Bitrate:</span>
            <span className="font-mono">{stats.bitrate} kbps</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">RTT:</span>
            <span className="font-mono">{stats.rtt} ms</span>
          </div>
          {stats.packetsLost > 0 && (
            <div className="flex items-center gap-2 text-amber-400">
              <span className="text-slate-500">Lost:</span>
              <span className="font-mono">{stats.packetsLost}</span>
            </div>
          )}
        </div>
      )}

      {/* Control Status Indicator */}
      {permissions?.allowControl && (
        <div className="absolute bottom-4 left-4 bg-emerald-500/90 backdrop-blur-sm rounded-full px-4 py-2 text-xs text-slate-950 font-medium flex items-center gap-2">
          <div className="w-2 h-2 bg-slate-950 rounded-full animate-pulse" />
          You are controlling
        </div>
      )}

      {permissions?.viewOnly && (
        <div className="absolute bottom-4 left-4 bg-amber-500/90 backdrop-blur-sm rounded-full px-4 py-2 text-xs text-slate-950 font-medium">
          View Only Mode
        </div>
      )}
    </div>
  );
}