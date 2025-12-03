/**
 * ParticipantTile - Individual participant video tile
 * Shows video, audio status, and participant name
 * FIXED: Proper audio playback for remote participants
 */

import React, { useEffect, useRef } from 'react';
import { MicOff, VideoOff, User } from 'lucide-react';

export default function ParticipantTile({
  participant,
  isLocal = false,
  isActiveSpeaker = false,
  compact = false,
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  // Update video element
  useEffect(() => {
    if (videoRef.current && participant.videoStream) {
      const video = videoRef.current;
      // Pause before changing srcObject to avoid AbortError
      video.pause();
      video.srcObject = participant.videoStream;
      // Use a small delay to ensure srcObject is set before playing
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Ignore AbortError - it's expected when srcObject changes
          if (err.name !== 'AbortError') {
            console.error('Error playing video:', err);
          }
        });
      }
    } else if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, [participant.videoStream]);

  // Update audio element - FIXED: Proper audio playback for remote participants
  useEffect(() => {
    if (audioRef.current && participant.audioStream && !isLocal) {
      const audio = audioRef.current;
      // Pause before changing srcObject to avoid AbortError
      audio.pause();
      audio.srcObject = participant.audioStream;
      audio.muted = false; // Ensure audio is not muted
      // Use a small delay to ensure srcObject is set before playing
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Ignore AbortError - it's expected when srcObject changes
          if (err.name !== 'AbortError') {
            console.error('Error playing audio:', err);
          }
        });
      }
    } else if (audioRef.current && isLocal) {
      // Local audio should be muted to prevent feedback
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
  }, [participant.audioStream, isLocal]);

  const displayName = isLocal ? 'You' : participant.name || 'Participant';
  const hasVideo = participant.isVideoEnabled && participant.videoStream && participant.videoStream.getVideoTracks().length > 0;
  const hasAudio = participant.isAudioEnabled;

  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-slate-900 ${
        compact ? 'aspect-video' : 'aspect-video'
      } ${isActiveSpeaker ? 'ring-4 ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'ring-2 ring-slate-800'}`}
    >
      {/* Video element */}
      {hasVideo ? (
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

      {/* Hidden audio element for remote participants - FIXED: Auto-play enabled */}
      {!isLocal && participant.audioStream && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          muted={false}
          style={{ display: 'none' }}
        />
      )}

      {/* Bottom overlay with name and status */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white truncate">{displayName}</span>
          <div className="flex items-center gap-1">
            {!hasAudio && (
              <div className="flex h-5 w-5 items-center justify-center rounded bg-red-600">
                <MicOff className="h-3 w-3 text-white" />
              </div>
            )}
            {!hasVideo && (
              <div className="flex h-5 w-5 items-center justify-center rounded bg-red-600">
                <VideoOff className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active speaker indicator */}
      {isActiveSpeaker && (
        <div className="absolute top-2 right-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
        </div>
      )}
    </div>
  );
}
