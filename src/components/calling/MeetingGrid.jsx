import React from 'react';
import ParticipantTile from './ParticipantTile.jsx';
import { getGridCols } from './layoutUtils.js';

export default function MeetingGrid({ participants, localUserId, activeSpeakerId }) {
  const count = participants ? participants.length : 0;

  return (
    <div className="flex-1 overflow-auto p-4 w-full">
      <div className={`grid ${getGridCols(count)} gap-4 h-full`}>
        {participants.map((participant) => (
          <ParticipantTile
            key={participant.id}
            participant={participant}
            isLocal={participant.id === localUserId}
            isActiveSpeaker={activeSpeakerId === participant.id}
            compact={false}
          />
        ))}
      </div>
    </div>
  );
}
