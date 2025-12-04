import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDeskLinkWebRTC } from '../hooks/useDeskLinkWebRTC';
import RemoteVideoArea from '../components/RemoteVideoArea';
import RemoteControls from '../components/RemoteControls';
import { useAuth } from '../../auth/hooks/useAuth';
import { desklinkApi } from '../services/desklink.api';
import { getNativeDeviceId } from '../utils/nativeBridge';
import { createKeyMessage } from '../utils/controlProtocol';

export default function RemoteViewerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuth();

  const sessionId = searchParams.get('sessionId');
  const remoteDeviceId = searchParams.get('remoteDeviceId');

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sessionToken, setSessionToken] = useState(null);
  const [localDeviceId, setLocalDeviceId] = useState('');
  const [permissions, setPermissions] = useState({ allowControl: true });
  const [iceServers, setIceServers] = useState(null);

  const {
    connectionState,
    iceConnectionState,
    remoteStream,
    stats,
    startAsCaller,
    sendControlMessage,
    stopSession,
    setOnDataMessage,
    setOnConnected,
    setOnDisconnected,
  } = useDeskLinkWebRTC();

  useEffect(() => {
    const init = async () => {
      const deviceId = await getNativeDeviceId();
      setLocalDeviceId(deviceId);

      // Fetch TURN/STUN config
      try {
        const config = await desklinkApi.getTurnToken(token);
        setIceServers(config.iceServers);
      } catch (err) {
        console.error('Failed to fetch TURN config:', err);
      }
    };
    init();
  }, [token]);

  useEffect(() => {
    if (!sessionId || !remoteDeviceId || !localDeviceId || !user || !iceServers) return;

    // Start WebRTC as caller
    startAsCaller({
      sessionId,
      token: sessionToken || token,
      localUserId: user._id || user.id,
      localDeviceId,
      remoteDeviceId,
      iceServers,
    });
  }, [sessionId, remoteDeviceId, localDeviceId, user, sessionToken, token, iceServers, startAsCaller]);

  useEffect(() => {
    setOnConnected((stream) => {
      console.log('[Viewer] Connected, stream:', stream);
    });

    setOnDisconnected(() => {
      console.log('[Viewer] Disconnected');
      handleEnd();
    });

    setOnDataMessage((message) => {
      console.log('[Viewer] Data message:', message);
    });
  }, [setOnConnected, setOnDisconnected, setOnDataMessage]);

  const handleEnd = useCallback(async () => {
    stopSession();
    try {
      await desklinkApi.completeRemote(token, { sessionId });
    } catch (err) {
      console.error('Failed to complete session:', err);
    }
    navigate('/desklink');
  }, [stopSession, token, sessionId, navigate]);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const handleControlMessage = useCallback(
    (message) => {
      sendControlMessage(message);
    },
    [sendControlMessage]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!permissions?.allowControl) return;

      // Prevent default for common shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
      }

      const message = createKeyMessage(
        e.key,
        'press',
        {
          ctrl: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          meta: e.metaKey,
        },
        sessionId,
        sessionToken || token
      );
      sendControlMessage(message);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [permissions, sessionId, sessionToken, token, sendControlMessage]);

  if (!sessionId || !remoteDeviceId) {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Invalid Session</h2>
          <p className="text-slate-400 mt-2">Session ID or device ID missing</p>
          <button
            onClick={() => navigate('/desklink')}
            className="mt-4 px-4 py-2 bg-emerald-500 rounded-xl text-slate-950 font-medium"
          >
            Back to DeskLink
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <RemoteControls
          onEnd={handleEnd}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
          connectionState={connectionState}
          iceConnectionState={iceConnectionState}
        />

        <div className="aspect-video w-full">
          {remoteStream ? (
            <RemoteVideoArea
              stream={remoteStream}
              onControlMessage={handleControlMessage}
              sessionId={sessionId}
              token={sessionToken || token}
              permissions={permissions}
              stats={stats}
            />
          ) : (
            <div className="w-full h-full bg-slate-900 rounded-2xl flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto" />
                <p className="text-slate-400 mt-4">
                  {connectionState === 'connecting' ? 'Connecting...' : 'Waiting for stream...'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}