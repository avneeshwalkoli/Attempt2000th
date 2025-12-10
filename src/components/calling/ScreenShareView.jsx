import React from 'react';
import ScreenShareTile from './ScreenShareTile.jsx';
import ParticipantTile from './ParticipantTile.jsx';

export default function ScreenShareView({
  screenStream,
  presenter,
  participants,
  localUserId,
  activeSpeakerId,
}) {
  if (!screenStream) {
    return null;
  }

  return (
    <>
      {/* Screen share area */}
      <div className="flex-[0.85] p-4">
        <div className="relative h-full w-full">
          <ScreenShareTile
            screenStream={screenStream}
            presenterName={presenter?.name || 'Presenter'}
            isLocal={presenter?.id === localUserId}
          />

          {/* Presenter camera as picture-in-picture in the corner */}
          {presenter && presenter.videoStream && (
            <div className="absolute bottom-4 right-4 w-64 max-w-[30%]">
              <ParticipantTile
                participant={presenter}
                isLocal={presenter.id === localUserId}
                isActiveSpeaker={activeSpeakerId === presenter.id}
                compact={true}
              />
            </div>
          )}
        </div>
      </div>

      {/* Participants sidebar */}
      <div className="flex-[0.15] min-w-[300px] border-l border-slate-800 bg-slate-900/50 overflow-y-auto p-4">
        <div className="space-y-3">
          {participants.map((participant) => (
            <div key={participant.id} className="mb-3">
              <ParticipantTile
                participant={participant}
                isLocal={participant.id === localUserId}
                isActiveSpeaker={activeSpeakerId === participant.id}
                compact={true}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
