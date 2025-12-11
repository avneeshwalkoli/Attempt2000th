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
import MeetingChatPanel from './MeetingChatPanel.jsx';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👏', '🔥', '🙌', '😍', '😊', '🎧'];

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
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = React.useState(false);
  const [isReactionsOpen, setIsReactionsOpen] = React.useState(false);
  const [isHostPanelOpen, setIsHostPanelOpen] = React.useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = React.useState('');

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
    chatMessages,
    hostMicLocked,
    hostCameraLocked,
    hostChatDisabled,
    reactions,
    hostNotice,
    sendChatMessage,
    muteAllParticipants,
    setMicLock,
    setCameraLock,
    setChatDisabled,
    removeParticipant,
    sendReaction,
    testAddMessage, // For debugging (may be undefined)
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
  
  // Expose test function globally for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.testAddChatMessage = testAddMessage;
      console.log('[VideoRoom] testAddChatMessage function available globally');
    }
  }, [testAddMessage]);

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

  const nonHostParticipants = React.useMemo(
    () => allParticipants.filter((p) => p.id !== userId),
    [allParticipants, userId]
  );

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
    <div className="flex h-screen w-screen flex-col bg-[#0F172A] text-white overflow-hidden relative">
      {hostNotice && (
        <div className="pointer-events-none absolute top-4 right-4 z-40">
          <div className="rounded-md bg-slate-900/90 border border-slate-700 px-3 py-2 text-xs text-slate-100 shadow-lg">
            {hostNotice}
          </div>
        </div>
      )}

      {reactions && reactions.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center z-30 overflow-visible">
          {reactions.map((reaction) => (
            <div key={reaction.id} className="mx-1 text-3xl emoji-float drop-shadow-lg">
              {reaction.emoji}
            </div>
          ))}
        </div>
      )}
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {isParticipantsOpen && (
          <div className="w-64 max-w-xs border-r border-slate-800 bg-slate-900/80 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90">
              <div className="text-sm font-semibold">Participants</div>
              <button
                type="button"
                onClick={() => setIsParticipantsOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-xs bg-slate-950/60">
              {allParticipants && allParticipants.length > 0 ? (
                allParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md px-2 py-1 bg-slate-800/80 text-slate-100"
                  >
                    <span className="text-[12px] font-medium">
                      {p.name || p.userName || (p.id === userId ? 'You' : 'Participant')}
                    </span>
                    {p.isHost && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-700/80 text-emerald-50 border border-emerald-500/70">
                        Host
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 text-[11px] mt-4">
                  No participants
                </div>
              )}
            </div>
          </div>
        )}

        <div className={isChatOpen ? 'flex-1 overflow-hidden' : 'flex-1 overflow-hidden'}>
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

        {isChatOpen && (
          <div className="w-80 max-w-xs border-l border-slate-800 bg-slate-900/80">
            <MeetingChatPanel
              messages={chatMessages}
              currentUserId={userId}
              onSendMessage={sendChatMessage}
              onClose={() => setIsChatOpen(false)}
              isChatDisabled={!isHost && hostChatDisabled}
            />
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <ControlBar
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing && screenShareUserId === userId}
        onToggleAudio={() => {
          if (!isHost && hostMicLocked) return;
          toggleAudio(!isAudioEnabled);
        }}
        onToggleVideo={() => {
          if (!isHost && hostCameraLocked) return;
          toggleVideo(!isVideoEnabled);
        }}
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
        onToggleParticipants={() => setIsParticipantsOpen((prev) => !prev)}
        onToggleChat={() => setIsChatOpen((prev) => !prev)}
        onToggleReactions={() => setIsReactionsOpen((prev) => !prev)}
        onToggleHostTools={() => setIsHostPanelOpen((prev) => !prev)}
        canUseMic={isHost || !hostMicLocked}
        canUseCamera={isHost || !hostCameraLocked}
        isChatDisabled={hostChatDisabled}
      />

      {isReactionsOpen && (
        <div className="pointer-events-auto absolute bottom-28 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-2 rounded-full bg-slate-900/90 border border-slate-700 px-3 py-2 shadow-lg">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  sendReaction(emoji);
                  setIsReactionsOpen(false);
                }}
                className="text-xl hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {isHost && isHostPanelOpen && (
        <div className="pointer-events-auto absolute bottom-28 right-6 z-40">
          <div className="w-64 rounded-lg bg-slate-900/95 border border-slate-700 shadow-xl p-3 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-100">Host Controls</span>
              <button
                type="button"
                onClick={() => setIsHostPanelOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-[10px] px-1"
              >
                Close
              </button>
            </div>

            <button
              type="button"
              onClick={muteAllParticipants}
              className="w-full rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium px-3 py-1.5"
            >
              Mute all participants
            </button>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-200">Participants can unmute</span>
                <button
                  type="button"
                  onClick={() => setMicLock(!hostMicLocked)}
                  className={`px-2 py-0.5 rounded-full text-[10px] border ${
                    hostMicLocked
                      ? 'bg-slate-800 border-slate-600 text-slate-200'
                      : 'bg-emerald-700/70 border-emerald-500 text-emerald-50'
                  }`}
                >
                  {hostMicLocked ? 'Disabled' : 'Allowed'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-200">Participants camera</span>
                <button
                  type="button"
                  onClick={() => setCameraLock(!hostCameraLocked)}
                  className={`px-2 py-0.5 rounded-full text-[10px] border ${
                    hostCameraLocked
                      ? 'bg-slate-800 border-slate-600 text-slate-200'
                      : 'bg-emerald-700/70 border-emerald-500 text-emerald-50'
                  }`}
                >
                  {hostCameraLocked ? 'Disabled' : 'Allowed'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-200">Chat for participants</span>
                <button
                  type="button"
                  onClick={() => setChatDisabled(!hostChatDisabled)}
                  className={`px-2 py-0.5 rounded-full text-[10px] border ${
                    hostChatDisabled
                      ? 'bg-slate-800 border-slate-600 text-slate-200'
                      : 'bg-emerald-700/70 border-emerald-500 text-emerald-50'
                  }`}
                >
                  {hostChatDisabled ? 'Disabled' : 'Allowed'}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-slate-200">Remove participant</span>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={selectedParticipantId}
                  onChange={(e) => setSelectedParticipantId(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-600 text-[11px] rounded px-2 py-1 outline-none focus:border-blue-500"
                >
                  <option value="">Select...</option>
                  {nonHostParticipants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || 'Participant'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedParticipantId}
                  onClick={() => {
                    if (!selectedParticipantId) return;
                    removeParticipant(selectedParticipantId);
                    setSelectedParticipantId('');
                  }}
                  className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-[11px] text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

