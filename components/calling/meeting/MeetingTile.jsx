import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, User } from 'lucide-react';

/**
 * MeetingTile - Individual video tile for a participant
 * Supports local user, remote participants, and screen share
 */
export default function MeetingTile({
  stream,
  isLocal = false,
  isActiveSpeaker = false,
  isScreenShare = false,
  participantName = 'Participant',
  isAudioEnabled = true,
  isVideoEnabled = true,
  onAudioToggle,
  onVideoToggle,
}) {
  const videoRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const displayName = isLocal ? 'You' : participantName;

  return (
    <div
      className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-slate-900 transition-all duration-300 ${
        isActiveSpeaker
          ? 'ring-4 ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]'
          : 'ring-2 ring-slate-800'
      } ${isScreenShare ? 'ring-4 ring-amber-500' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Video element */}
      {isVideoEnabled && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-700">
              <User className="h-10 w-10 text-slate-400" />
            </div>
            <span className="text-sm font-medium text-slate-300">{displayName}</span>
          </div>
        </div>
      )}

      {/* Overlay controls (shown on hover) */}
      {isHovered && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity">
          <div className="flex items-center gap-2">
            {isLocal && onAudioToggle && (
              <button
                onClick={onAudioToggle}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                  isAudioEnabled
                    ? 'bg-slate-700/80 text-white hover:bg-slate-600'
                    : 'bg-red-600/80 text-white hover:bg-red-500'
                }`}
                title={isAudioEnabled ? 'Mute' : 'Unmute'}
              >
                {isAudioEnabled ? (
                  <Mic className="h-5 w-5" />
                ) : (
                  <MicOff className="h-5 w-5" />
                )}
              </button>
            )}
            {isLocal && onVideoToggle && (
              <button
                onClick={onVideoToggle}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                  isVideoEnabled
                    ? 'bg-slate-700/80 text-white hover:bg-slate-600'
                    : 'bg-red-600/80 text-white hover:bg-red-500'
                }`}
                title={isVideoEnabled ? 'Turn off video' : 'Turn on video'}
              >
                {isVideoEnabled ? (
                  <Video className="h-5 w-5" />
                ) : (
                  <VideoOff className="h-5 w-5" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white">{displayName}</span>
          <div className="flex items-center gap-1">
            {!isAudioEnabled && (
              <div className="flex h-5 w-5 items-center justify-center rounded bg-red-600">
                <MicOff className="h-3 w-3 text-white" />
              </div>
            )}
            {!isVideoEnabled && (
              <div className="flex h-5 w-5 items-center justify-center rounded bg-red-600">
                <VideoOff className="h-3 w-3 text-white" />
              </div>
            )}
            {isScreenShare && (
              <div className="flex items-center gap-1 rounded bg-amber-600 px-1.5 py-0.5">
                <span className="text-[10px] font-medium text-white">Screen</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active speaker indicator */}
      {isActiveSpeaker && !isHovered && (
        <div className="absolute top-2 right-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
        </div>
      )}
    </div>
  );
}

