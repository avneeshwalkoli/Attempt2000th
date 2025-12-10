/**
 * VideoRoom - Main meeting room component with Zoom-like layout
 * Handles grid layout and screen share layout with sidebar
 */

import React, { useEffect } from 'react';
import { useRoomClient } from './useRoomClient.js';
import { useMeetingParticipants } from './useMeetingParticipants.js';
import { useScreenShare } from './useScreenShare.js';
import MeetingGrid from './MeetingGrid.jsx';
import ControlBar from './ControlBar.jsx';
import ScreenShareView from './ScreenShareView.jsx';

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
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    endMeeting,
    leaveRoom,
    initializeLocalStream,
  } = useRoomClient(roomId, userId, userName, isHost, onLeave);

  // Initialize local media based on initial audio/video flags
  useEffect(() => {
    const constraints = {
      audio: initialAudioEnabled,
      video: initialVideoEnabled ? { width: 1280, height: 720 } : false,
    };

    initializeLocalStream(constraints).catch((error) => {
      console.error('Failed to initialize local media stream:', error);
    });
    // We intentionally run this once on mount to mirror the original behavior
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { allParticipants } = useMeetingParticipants({
    participants,
    localUserId: userId,
    isScreenSharing,
    screenShareUserId,
  });

  const {
    hasScreenShare,
    activeScreenShareStream,
    screenShareParticipant,
  } = useScreenShare({
    isScreenSharing,
    screenShareUserId,
    screenShareStream,
    localScreenStream,
    participants,
    localUserId: userId,
  });

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
                ? 'You have ended the meeting for all participants.'
                : meetingEndedBy
                  ? `${meetingEndedBy} has ended the meeting.`
                  : 'The host has ended the meeting.'}
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
          <ScreenShareView
            screenStream={activeScreenShareStream}
            presenter={screenShareParticipant}
            participants={allParticipants}
            localUserId={userId}
            activeSpeakerId={activeSpeakerId}
          />
        ) : (
          // Grid Layout: All participants in grid
          <MeetingGrid
            participants={allParticipants}
            localUserId={userId}
            activeSpeakerId={activeSpeakerId}
          />
        )}
      </div>

      {/* Controls Bar */}
      <ControlBar
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing && screenShareUserId === userId}
        onToggleAudio={() => toggleAudio(!isAudioEnabled)}
        onToggleVideo={() => toggleVideo(!isVideoEnabled)}
        onScreenShare={
          isScreenSharing && screenShareUserId === userId
            ? stopScreenShare
            : startScreenShare
        }
        onLeave={handleLeave}
        participantCount={allParticipants.length}
        roomId={roomId}
        isHost={isHost}
        onEndMeeting={isHost ? endMeeting : undefined}
      />
    </div>
  );
}

