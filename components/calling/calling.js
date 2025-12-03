/**
 * VisionDesk Calling - Main orchestrator
 * Manages meeting state, modals, and WebRTC connections
 */

import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import NewMeetingPreview from './meeting/NewMeetingPreview.jsx';
import JoinMeetingModal from './meeting/JoinMeetingModal.jsx';
import MeetingRoom from './meeting/MeetingRoom.jsx';
import { callingApi } from './calling.api.js';

/**
 * Main Calling Component
 * Handles:
 * - New meeting preview modal
 * - Join meeting modal
 * - Meeting room interface
 */
function CallingApp() {
  const [showNewMeetingPreview, setShowNewMeetingPreview] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [meetingState, setMeetingState] = useState(null); // { meetingId, userName, webrtcManager, localStream, initialAudio, initialVideo }

  const handleNewMeeting = useCallback(() => {
    setShowNewMeetingPreview(true);
  }, []);

  const handleJoinMeeting = useCallback(() => {
    setShowJoinModal(true);
  }, []);

  const handleStartMeeting = useCallback(async (previewData) => {
    try {
      // Create meeting via API
      const meetingData = await callingApi.createMeeting();
      
      setMeetingState({
        meetingId: meetingData.meetingId,
        userName: 'You', // Could be fetched from user profile
        webrtcManager: previewData.webrtcManager,
        localStream: previewData.localStream,
        initialAudioEnabled: previewData.isAudioEnabled,
        initialVideoEnabled: previewData.isVideoEnabled,
      });
      
      setShowNewMeetingPreview(false);
    } catch (error) {
      console.error('Error starting meeting:', error);
      alert('Failed to start meeting. Please try again.');
    }
  }, []);

  const handleJoinMeetingSubmit = useCallback(async (joinData) => {
    try {
      // Validate and join meeting via API
      const meetingData = await callingApi.joinMeeting(joinData.meetingId);
      
      if (!meetingData.exists) {
        alert('Meeting not found. Please check the meeting ID.');
        return;
      }

      // Import WebRTC manager dynamically
      const { WebRTCManager } = await import('./calling.webrtc.js');
      const webrtcManager = new WebRTCManager();
      
      // Initialize local stream based on join options
      const localStream = await webrtcManager.initializeLocalStream({
        audio: !joinData.dontConnectAudio,
        video: !joinData.turnOffVideo,
      });

      setMeetingState({
        meetingId: joinData.meetingId,
        userName: joinData.userName,
        webrtcManager,
        localStream,
        initialAudioEnabled: !joinData.dontConnectAudio,
        initialVideoEnabled: !joinData.turnOffVideo,
      });
      
      setShowJoinModal(false);
    } catch (error) {
      console.error('Error joining meeting:', error);
      alert('Failed to join meeting. Please check your connection and try again.');
    }
  }, []);

  const handleLeaveMeeting = useCallback(() => {
    if (meetingState?.webrtcManager) {
      meetingState.webrtcManager.cleanup();
    }
    setMeetingState(null);
  }, [meetingState]);

  // If in meeting, show meeting room
  if (meetingState) {
    return (
      <MeetingRoom
        meetingId={meetingState.meetingId}
        userName={meetingState.userName}
        initialAudioEnabled={meetingState.initialAudioEnabled}
        initialVideoEnabled={meetingState.initialVideoEnabled}
        webrtcManager={meetingState.webrtcManager}
        localStream={meetingState.localStream}
        onLeave={handleLeaveMeeting}
      />
    );
  }

  // Otherwise show modals when needed
  return (
    <>
      {showNewMeetingPreview && (
        <NewMeetingPreview
          onClose={() => setShowNewMeetingPreview(false)}
          onStart={handleStartMeeting}
        />
      )}
      
      {showJoinModal && (
        <JoinMeetingModal
          onClose={() => setShowJoinModal(false)}
          onJoin={handleJoinMeetingSubmit}
        />
      )}
    </>
  );
}

/**
 * Initialize Calling App
 * This function is called from MeetDashboard to set up the calling system
 */
export function initCalling() {
  const rootElement = document.getElementById('calling-root');
  if (!rootElement) {
    console.warn('calling-root element not found');
    return null;
  }

  const root = createRoot(rootElement);
  root.render(<CallingApp />);
  
  return {
    openNewMeeting: () => {
      // This will be handled by the MeetDashboard integration
    },
    openJoinMeeting: () => {
      // This will be handled by the MeetDashboard integration
    },
  };
}

/**
 * Standalone initialization for calling.html
 */
if (typeof window !== 'undefined' && document.getElementById('calling-root')) {
  initCalling();
}

// Export for use in MeetDashboard
export { CallingApp };

