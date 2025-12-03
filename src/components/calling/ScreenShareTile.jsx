/**
 * ScreenShareTile - Large screen share display
 * Shows shared screen with presenter name overlay
 */

import React, { useEffect, useRef } from 'react';

export default function ScreenShareTile({ screenStream, presenterName, isLocal = false }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  // Update video element
  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Update audio element for screen share audio
  useEffect(() => {
    if (audioRef.current && screenStream && !isLocal) {
      audioRef.current.srcObject = screenStream;
    }
  }, [screenStream, isLocal]);

  if (!screenStream) {
    return null;
  }

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="h-full w-full object-contain"
      />
      
      {/* Hidden audio element for remote screen share audio */}
      {!isLocal && (
        <audio ref={audioRef} autoPlay playsInline />
      )}

      {/* Presenter name overlay */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500"></div>
          <span className="text-sm font-medium text-white">
            {presenterName}'s screen
          </span>
        </div>
      </div>
    </div>
  );
}
