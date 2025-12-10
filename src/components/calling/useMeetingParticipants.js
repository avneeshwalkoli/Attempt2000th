import { useMemo } from 'react';

export function useMeetingParticipants({
  participants,
  localUserId,
  isScreenSharing,
  screenShareUserId,
}) {
  const allParticipants = useMemo(() => {
    if (!Array.isArray(participants)) return [];

    const local = participants.find((p) => p.id === localUserId);
    const remotes = participants.filter((p) => p.id !== localUserId);

    const withFlags = [];

    if (local) {
      withFlags.push({
        ...local,
        isScreenSharing: isScreenSharing && screenShareUserId === localUserId,
      });
    }

    remotes.forEach((p) => {
      withFlags.push({
        ...p,
        isScreenSharing: isScreenSharing && screenShareUserId === p.id,
      });
    });

    return withFlags;
  }, [participants, localUserId, isScreenSharing, screenShareUserId]);

  const screenShareParticipant = useMemo(
    () => allParticipants.find((p) => p.isScreenSharing) || null,
    [allParticipants]
  );

  const regularParticipants = useMemo(
    () => allParticipants.filter((p) => !p.isScreenSharing),
    [allParticipants]
  );

  return {
    allParticipants,
    screenShareParticipant,
    regularParticipants,
  };
}
