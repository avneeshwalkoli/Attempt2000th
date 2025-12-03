/**
 * VideoRoom - Main meeting room component with Zoom-like layout
 * Handles grid layout and screen share layout with sidebar
 */

import React, { useEffect, useState } from 'react';
import { useRoomClient } from './useRoomClient.js';
import ParticipantTile from './ParticipantTile.jsx';
import ScreenShareTile from './ScreenShareTile.jsx';
import ControlsBar from './ControlsBar.jsx';
import { getGridCols, isScreenShareActive, getScreenShareParticipant, getRegularParticipants } from './layoutUtils.js';

export default function VideoRoom({
  roomId,
  userName,
  isHost = false,
  initialAudioEnabled = true,
  initialVideoEnabled = true,
  localStream: externalStream,
  onLeave,
}) {
  const userId = React.useMemo(() => crypto.randomUUID(), []);
  
  const {
    localStream,
    localScreenStream,
    participants,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenShareUserId,
    screenShareStream,
    activeSpeakerId,
    meetingEnded,
    meetingEndedBy,
    initializeLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    endMeeting,
    leaveRoom,
  } = useRoomClient(roomId, userId, userName, isHost, onLeave);

  const [allParticipants, setAllParticipants] = useState([]);

  // Initialize local stream
  useEffect(() => {
    if (externalStream) {
      // Use provided stream - set it directly
      if (localStream === null) {
        // The external stream is already set, just initialize the hook
        initializeLocalStream({
          audio: initialAudioEnabled,
          video: initialVideoEnabled,
        });
      }
    } else {
      // Initialize new stream
      initializeLocalStream({
        audio: initialAudioEnabled,
        video: initialVideoEnabled,
      });
    }
  }, []);

  // Update all participants list
  useEffect(() => {
    const localParticipant = participants.find((p) => p.id === userId);
    const remoteParticipants = participants.filter((p) => p.id !== userId);

    const updated = [];
    
    // Add local participant first
    if (localParticipant) {
      updated.push({
        ...localParticipant,
        isScreenSharing: isScreenSharing && screenShareUserId === userId,
      });
    }

    // Add remote participants
    remoteParticipants.forEach((p) => {
      updated.push({
        ...p,
        isScreenSharing: isScreenSharing && screenShareUserId === p.id,
      });
    });

    setAllParticipants(updated);
  }, [participants, isScreenSharing, screenShareUserId, userId]);

  // Handle leave or end meeting
  const handleLeave = () => {
    if (isHost) {
      // Host ends the meeting for everyone
      endMeeting();
      // onLeave will be called by handleMeetingEnded in useRoomClient
    } else {
      // Regular participant just leaves
      leaveRoom();
      if (onLeave) {
        onLeave();
      }
    }
  };

  // Get screen share participant
  const screenShareParticipant = getScreenShareParticipant(allParticipants);
  const regularParticipants = getRegularParticipants(allParticipants);
  const hasScreenShare = isScreenShareActive(allParticipants);

  // Determine which screen share stream to use
  const activeScreenShareStream = screenShareUserId === userId 
    ? localScreenStream 
    : screenShareStream;

  // Note: onLeave is now handled in useRoomClient's handleMeetingEnded
  // This ensures all participants see the message before redirecting

  // Show meeting ended message briefly before redirecting
  if (meetingEnded) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#0F172A] text-white">
        <div className="text-center space-y-6 px-6 max-w-md">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20 animate-pulse">
            <svg
              className="h-10 w-10 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <div className="space-y-3">
            <div className="text-3xl font-bold text-slate-200">
              Meeting Ended
            </div>
            <div className="text-lg text-slate-300">
              {isHost 
                ? "You have ended the meeting for all participants."
                : meetingEndedBy 
                  ? `${meetingEndedBy} has ended the meeting.`
                  : "The host has ended the meeting."}
            </div>
            <div className="text-sm text-slate-500 pt-4 animate-pulse">
              Redirecting to dashboard...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0F172A] text-white overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {hasScreenShare && activeScreenShareStream ? (
          // Screen Share Layout: Large screen on left, participants on right
          <>
            {/* Screen Share - 85% width */}
            <div className="flex-[0.85] p-4">
              <ScreenShareTile
                screenStream={activeScreenShareStream}
                presenterName={screenShareParticipant?.name || 'Presenter'}
                isLocal={screenShareUserId === userId}
              />
            </div>

            {/* Participants Sidebar - 15% width, min 300px */}
            <div className="flex-[0.15] min-w-[300px] border-l border-slate-800 bg-slate-900/50 overflow-y-auto p-4">
              <div className="space-y-3">
                {allParticipants.map((participant) => (
                  <div key={participant.id} className="mb-3">
                    <ParticipantTile
                      participant={participant}
                      isLocal={participant.id === userId}
                      isActiveSpeaker={activeSpeakerId === participant.id}
                      compact={true}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          // Grid Layout: All participants in grid
          <div className="flex-1 overflow-auto p-4 w-full">
            <div className={`grid ${getGridCols(allParticipants.length)} gap-4 h-full`}>
              {allParticipants.map((participant) => (
                <ParticipantTile
                  key={participant.id}
                  participant={participant}
                  isLocal={participant.id === userId}
                  isActiveSpeaker={activeSpeakerId === participant.id}
                  compact={false}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <ControlsBar
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing && screenShareUserId === userId}
        onToggleAudio={() => toggleAudio(!isAudioEnabled)}
        onToggleVideo={() => toggleVideo(!isVideoEnabled)}
        onScreenShare={isScreenSharing && screenShareUserId === userId ? stopScreenShare : startScreenShare}
        onLeave={handleLeave}
        participantCount={allParticipants.length}
        roomId={roomId}
        isHost={isHost}
        onEndMeeting={isHost ? endMeeting : undefined}
      />
    </div>
  );
}

