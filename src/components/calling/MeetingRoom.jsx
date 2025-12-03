/**
 * MeetingRoom - Full meeting interface with Zoom-style UI
 * Includes bottom toolbar, grid layout, and all meeting controls
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Users,
  MessageSquare,
  Smile,
  Share2,
  Settings,
  Info,
  MoreVertical,
} from 'lucide-react';
import { useMeeting } from './useMeeting.js';

export default function MeetingRoom({
  roomId,
  userName,
  isHost = false,
  initialAudioEnabled = true,
  initialVideoEnabled = true,
  localStream: externalStream,
  onLeave,
}) {
  const userId = useMemo(() => crypto.randomUUID(), []);
  
  const {
    localStream,
    remoteStreams,
    participants,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenShareStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    joinRoom,
    leaveRoom,
  } = useMeeting(roomId, userId, isHost, externalStream, initialAudioEnabled, initialVideoEnabled);

  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef(new Map());

  // Initialize and join room
  useEffect(() => {
    if (externalStream) {
      // Use provided stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = externalStream;
      }
      // Still join room for signaling
      joinRoom(userName);
    } else {
      // Join room and initialize stream
      joinRoom(userName);
    }
  }, [externalStream, joinRoom, userName]);

  // Update local video
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Update remote videos
  useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      const videoRef = remoteVideoRefs.current.get(userId);
      if (videoRef) {
        videoRef.srcObject = stream;
      }
    });
  }, [remoteStreams]);

  // Simulate active speaker detection
  useEffect(() => {
    const interval = setInterval(() => {
      if (participants.length > 0) {
        const randomParticipant = participants[Math.floor(Math.random() * participants.length)];
        if (randomParticipant) {
          setActiveSpeakerId(randomParticipant.id);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [participants]);

  // Calculate grid layout
  const getGridCols = (count) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 9) return 'grid-cols-3';
    if (count <= 16) return 'grid-cols-4';
    return 'grid-cols-5';
  };

  const handleLeave = useCallback(() => {
    leaveRoom();
    if (onLeave) {
      onLeave();
    }
  }, [leaveRoom, onLeave]);

  const allParticipants = [
    {
      id: 'local',
      name: userName || 'You',
      stream: localStream || externalStream,
      isLocal: true,
      isScreenShare: isScreenSharing,
    },
    ...participants.map((p) => ({
      id: p.id,
      name: p.name,
      stream: remoteStreams.get(p.id),
      isLocal: false,
      isScreenShare: false,
    })),
  ].filter((p) => p.stream);

  const totalParticipants = allParticipants.length;

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0F172A] text-white overflow-hidden">
      {/* Video Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className={`grid ${getGridCols(totalParticipants)} gap-4 h-full`}>
          {allParticipants.map((participant) => {
            const isActive = activeSpeakerId === participant.id;
            const videoRef = participant.isLocal ? localVideoRef : remoteVideoRefs.current.get(participant.id);

            if (!videoRef && !participant.isLocal) {
              const ref = React.createRef();
              remoteVideoRefs.current.set(participant.id, ref);
            }

            return (
              <div
                key={participant.id}
                className={`relative aspect-video rounded-lg overflow-hidden bg-slate-900 ${
                  isActive ? 'ring-4 ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'ring-2 ring-slate-800'
                } ${participant.isScreenShare ? 'ring-4 ring-amber-500' : ''}`}
              >
                {participant.stream && (participant.isScreenShare || isVideoEnabled || !participant.isLocal) ? (
                  <video
                    ref={participant.isLocal ? localVideoRef : remoteVideoRefs.current.get(participant.id)}
                    autoPlay
                    playsInline
                    muted={participant.isLocal}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-700">
                        <span className="text-2xl font-semibold text-slate-300">
                          {participant.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-slate-300">{participant.name}</span>
                    </div>
                  </div>
                )}

                {/* Username overlay - lower left corner */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white">{participant.name}</span>
                    <div className="flex items-center gap-1">
                      {!isAudioEnabled && participant.isLocal && (
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-red-600">
                          <MicOff className="h-3 w-3 text-white" />
                        </div>
                      )}
                      {!isVideoEnabled && participant.isLocal && (
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-red-600">
                          <VideoOff className="h-3 w-3 text-white" />
                        </div>
                      )}
                      {participant.isScreenShare && (
                        <div className="flex items-center gap-1 rounded bg-amber-600 px-1.5 py-0.5">
                          <span className="text-[10px] font-medium text-white">Screen</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Active speaker indicator */}
                {isActive && (
                  <div className="absolute top-2 right-2">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Toolbar - Zoom Style */}
      <div className="border-t border-slate-800 bg-[#1E293B] px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Left side - Meeting info */}
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-400">
              Meeting ID: <span className="font-mono text-white">{roomId}</span>
            </div>
          </div>

          {/* Center - Main controls */}
          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              onClick={() => toggleAudio(!isAudioEnabled)}
              className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
                isAudioEnabled
                  ? 'bg-slate-700 text-white hover:bg-slate-600'
                  : 'bg-red-600 text-white hover:bg-red-500'
              }`}
              title={isAudioEnabled ? 'Mute' : 'Unmute'}
            >
              {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>

            {/* Video Toggle */}
            <button
              onClick={() => toggleVideo(!isVideoEnabled)}
              className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
                isVideoEnabled
                  ? 'bg-slate-700 text-white hover:bg-slate-600'
                  : 'bg-red-600 text-white hover:bg-red-500'
              }`}
              title={isVideoEnabled ? 'Turn off video' : 'Turn on video'}
            >
              {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>

            {/* Participants */}
            <button
              onClick={() => setShowParticipants(!showParticipants)}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
              title="Participants"
            >
              <Users className="h-5 w-5" />
            </button>

            {/* Chat */}
            <button
              onClick={() => setShowChat(!showChat)}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
              title="Chat"
            >
              <MessageSquare className="h-5 w-5" />
            </button>

            {/* Reactions */}
            <button
              onClick={() => setShowReactions(!showReactions)}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
              title="Reactions"
            >
              <Smile className="h-5 w-5" />
            </button>

            {/* Share Screen */}
            <button
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
                isScreenSharing
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              <Monitor className="h-5 w-5" />
            </button>

            {/* Host Tools (only for host) */}
            {isHost && (
              <button
                className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
                title="Host Tools"
              >
                <Settings className="h-5 w-5" />
              </button>
            )}

            {/* Meeting Info */}
            <button
              className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
              title="Meeting Info"
            >
              <Info className="h-5 w-5" />
            </button>

            {/* More */}
            <button
              onClick={() => setShowMore(!showMore)}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-all"
              title="More"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {/* End Meeting - Red button */}
            <button
              onClick={handleLeave}
              className="ml-4 flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-medium px-6 py-2 rounded-full transition-colors"
              title="End Meeting"
            >
              <PhoneOff className="h-5 w-5" />
              <span>End Meeting</span>
            </button>
          </div>

          {/* Right side - Empty for now */}
          <div className="w-32"></div>
        </div>
      </div>
    </div>
  );
}

