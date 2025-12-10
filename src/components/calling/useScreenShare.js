import { useMemo } from 'react';

export function useScreenShare({
  isScreenSharing,
  screenShareUserId,
  screenShareStream,
  localScreenStream,
  participants,
  localUserId,
}) {
  const hasScreenShare = !!isScreenSharing && !!screenShareUserId;

  const activeScreenShareStream = useMemo(() => {
    if (!hasScreenShare) return null;
    if (screenShareUserId === localUserId) {
      return localScreenStream || screenShareStream || null;
    }
    return screenShareStream || null;
  }, [
    hasScreenShare,
    screenShareUserId,
    localUserId,
    localScreenStream,
    screenShareStream,
  ]);

  const presenter = useMemo(() => {
    if (!hasScreenShare || !Array.isArray(participants)) return null;
    return participants.find((p) => p.id === screenShareUserId) || null;
  }, [hasScreenShare, participants, screenShareUserId]);

  return {
    hasScreenShare,
    activeScreenShareStream,
    screenShareParticipant: presenter,
  };
}
