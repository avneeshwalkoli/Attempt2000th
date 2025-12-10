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

  const presenter = useMemo(() => {
    if (!hasScreenShare || !Array.isArray(participants)) return null;
    return participants.find((p) => p.id === screenShareUserId) || null;
  }, [hasScreenShare, participants, screenShareUserId]);

  const activeScreenShareStream = useMemo(() => {
    if (!hasScreenShare) return null;

    if (screenShareUserId === localUserId) {
      // For the sharer, prefer the local displayMedia stream, then any dedicated screenShareStream,
      // and finally fall back to the presenter's video stream.
      return localScreenStream || screenShareStream || presenter?.videoStream || null;
    }

    // For remote participants, prefer the dedicated screenShareStream, but fall back
    // to the presenter's video stream if classification hasn't completed yet.
    return screenShareStream || presenter?.videoStream || null;
  }, [
    hasScreenShare,
    screenShareUserId,
    localUserId,
    localScreenStream,
    screenShareStream,
    presenter,
  ]);

  return {
    hasScreenShare,
    activeScreenShareStream,
    screenShareParticipant: presenter,
  };
}
