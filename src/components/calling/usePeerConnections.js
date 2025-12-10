import { useEffect, useMemo } from 'react';
import { useRoomClient } from './useRoomClient.js';

export function usePeerConnections({
  roomId,
  userName,
  isHost = false,
  initialAudioEnabled = true,
  initialVideoEnabled = true,
  localStream: externalStream = null,
  onLeave = null,
}) {
  const userId = useMemo(() => crypto.randomUUID(), []);

  const roomClient = useRoomClient(roomId, userId, userName, isHost, onLeave);
  const { initializeLocalStream } = roomClient;

  useEffect(() => {
    const constraints = {
      audio: initialAudioEnabled,
      video: initialVideoEnabled ? { width: 1280, height: 720 } : false,
    };

    initializeLocalStream(constraints).catch((error) => {
      console.error('Failed to initialize local media stream:', error);
    });
  }, [initializeLocalStream, initialAudioEnabled, initialVideoEnabled]);

  return {
    userId,
    ...roomClient,
  };
}
