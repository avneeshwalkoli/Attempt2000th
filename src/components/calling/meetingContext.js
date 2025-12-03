/**
 * Meeting Context - Global state management for meetings
 */

import { createContext, useContext, useState, useCallback } from 'react';

const MeetingContext = createContext(null);

export function MeetingProvider({ children }) {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [isInMeeting, setIsInMeeting] = useState(false);
  const [meetingState, setMeetingState] = useState(null);

  const createRoom = useCallback(() => {
    const roomId = crypto.randomUUID();
    const newRoom = {
      id: roomId,
      hostId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      participants: [],
    };
    setCurrentRoom(newRoom);
    return newRoom;
  }, []);

  const joinRoom = useCallback((roomId, userName, isHost = false) => {
    setCurrentRoom({
      id: roomId,
      isHost,
    });
    setIsInMeeting(true);
  }, []);

  const leaveRoom = useCallback(() => {
    setCurrentRoom(null);
    setIsInMeeting(false);
    setMeetingState(null);
  }, []);

  const updateMeetingState = useCallback((state) => {
    setMeetingState(state);
  }, []);

  return (
    <MeetingContext.Provider
      value={{
        currentRoom,
        isInMeeting,
        meetingState,
        createRoom,
        joinRoom,
        leaveRoom,
        updateMeetingState,
      }}
    >
      {children}
    </MeetingContext.Provider>
  );
}

export function useMeetingContext() {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error('useMeetingContext must be used within MeetingProvider');
  }
  return context;
}

