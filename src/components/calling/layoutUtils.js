/**
 * Layout Utilities - Calculate grid layouts and screen share layouts
 */

/**
 * Calculate grid columns based on participant count
 */
export function getGridCols(count) {
  if (count === 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  if (count <= 4) return 'grid-cols-2';
  if (count <= 9) return 'grid-cols-3';
  if (count <= 16) return 'grid-cols-4';
  return 'grid-cols-5';
}

/**
 * Check if screen share is active
 */
export function isScreenShareActive(participants) {
  return participants.some((p) => p.isScreenSharing);
}

/**
 * Get screen share participant
 */
export function getScreenShareParticipant(participants) {
  return participants.find((p) => p.isScreenSharing);
}

/**
 * Get regular participants (excluding screen share)
 */
export function getRegularParticipants(participants) {
  return participants.filter((p) => !p.isScreenSharing);
}

/**
 * Calculate layout type
 */
export function getLayoutType(participants, screenShareActive) {
  if (screenShareActive) {
    return 'screen-share';
  }
  return 'grid';
}
