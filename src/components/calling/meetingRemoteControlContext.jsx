import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useDeskLinkWebRTC } from '../../modules/desklink/hooks/useDeskLinkWebRTC.js';
import { useDeskLinkSocket } from '../../modules/desklink/hooks/useDeskLinkSocket.js';
import { desklinkApi } from '../../modules/desklink/services/desklink.api.js';
import { getNativeDeviceId } from '../../modules/desklink/utils/nativeBridge.js';
import { useAuth } from '../../modules/auth/hooks/useAuth.js';

const MeetingRemoteControlContext = createContext(null);

export function MeetingRemoteControlProvider({ children }) {
  const { user, token } = useAuth();

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [sessionConfig, setSessionConfig] = useState(null);
  const [permissions, setPermissions] = useState({ allowControl: true, viewOnly: false });
  const [localDeviceId, setLocalDeviceId] = useState('');
  const [pendingSession, setPendingSession] = useState(null); // controller side
  const [incomingRequest, setIncomingRequest] = useState(null); // owner side

  // Load native device id (DeskLink agent id) for this machine
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const id = await getNativeDeviceId();
        if (!cancelled && id) {
          setLocalDeviceId(id);
        }
      } catch (err) {
        console.warn('[MeetingRemoteControl] failed to resolve native device id', err);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // DeskLink signaling socket (shared with DeskLink page via window.__desklinkSocket)
  const { socket } = useDeskLinkSocket({
    token,
    onRemoteRequest: (payload) => {
      // Incoming request for THIS user (owner side)
      setIncomingRequest({
        sessionId: payload.sessionId,
        fromUserId: payload.fromUserId,
        fromDeviceId: payload.fromDeviceId,
        callerName: payload.callerName,
      });
    },
    onRemoteResponse: (payload) => {
      // Pending outgoing request updated (accepted/rejected/ended)
      if (!pendingSession || payload.sessionId !== pendingSession.sessionId) return;

      if (payload.status === 'rejected') {
        // Simple UX for now; can be replaced by toast/snackbar later
        console.warn('[MeetingRemoteControl] Remote user rejected request');
        setPendingSession(null);
      }

      if (payload.status === 'ended') {
        setPendingSession(null);
      }
    },
  });

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
  }, []);

  const beginControl = useCallback(
    async (config) => {
      if (!config || !config.sessionId) {
        console.warn('[MeetingRemoteControl] beginControl called without session config');
        return;
      }

      let effectiveConfig = { ...config };

      // If no ICE servers were provided by the caller, fetch them from the backend
      // so that in-meeting DeskLink sessions benefit from the same TURN/STUN
      // configuration as the rest of the app.
      if (!effectiveConfig.iceServers && token) {
        try {
          const data = await desklinkApi.getTurnToken(token);
          if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
            effectiveConfig = { ...effectiveConfig, iceServers: data.iceServers };
          }
        } catch (err) {
          console.error('[MeetingRemoteControl] Failed to fetch ICE servers for DeskLink session', err);
        }
      }

      setSessionConfig(effectiveConfig);
      setIsPanelOpen(true);
      startAsCaller(effectiveConfig);
    },
    [startAsCaller, token]
  );

  const endControl = useCallback(() => {
    stopSession();
    setSessionConfig(null);
  }, [stopSession]);

  // Controller: request control of another participant's PC by backend user id (webId-only mode)
  // For in-meeting remote access we intentionally do NOT send fromDeviceId. The backend
  // will resolve the caller's active deviceId based on the authenticated user.
  const requestControlForUser = useCallback(
    async ({ targetUserId, targetName }) => {
      if (!token || !user) {
        console.warn('[MeetingRemoteControl] Missing auth context for requestControlForUser');
        return;
      }
      if (!targetUserId) {
        console.warn('[MeetingRemoteControl] No targetUserId provided for requestControlForUser');
        return;
      }
      try {
        const { session } = await desklinkApi.requestMeetingRemote(token, targetUserId);
        setPendingSession({
          sessionId: session.sessionId,
          targetUserId,
          targetName,
        });
        setIsPanelOpen(true);
      } catch (err) {
        console.error('[MeetingRemoteControl] requestControlForUser failed', err);
      }
    },
    [token, user]
  );

  // Owner: accept/reject incoming request inside meeting
  const acceptIncomingRequest = useCallback(
    async (acceptPermissions) => {
      if (!incomingRequest || !token || !localDeviceId) return;
      try {
        const payload = {
          sessionId: incomingRequest.sessionId,
          receiverDeviceId: localDeviceId,
          permissions: acceptPermissions,
        };
        await desklinkApi.acceptRemote(token, payload);
        setIncomingRequest(null);
      } catch (err) {
        console.error('[MeetingRemoteControl] acceptIncomingRequest failed', err);
      }
    },
    [incomingRequest, token, localDeviceId]
  );

  const rejectIncomingRequest = useCallback(
    async () => {
      if (!incomingRequest || !token) {
        setIncomingRequest(null);
        return;
      }
      try {
        await desklinkApi.rejectRemote(token, { sessionId: incomingRequest.sessionId });
      } catch (err) {
        console.error('[MeetingRemoteControl] rejectIncomingRequest failed', err);
      } finally {
        setIncomingRequest(null);
      }
    },
    [incomingRequest, token]
  );

  // Handle desklink-session-start -> start WebRTC as caller when we are the controller
  useEffect(() => {
    if (!socket || !token || !user) return;

    const handleSessionStart = async (payload) => {
      try {
        if (!payload || !payload.sessionId) return;
        if (payload.role !== 'caller') {
          // Host/agent side will be handled by native agent; we only drive viewer here
          return;
        }

        const effectiveUserId = user._id || user.id;
        const config = {
          sessionId: payload.sessionId,
          authToken: token,
          sessionToken: payload.token,
          localUserId: effectiveUserId,
          localDeviceId: payload.callerDeviceId,
          remoteDeviceId: payload.receiverDeviceId,
        };

        if (payload.permissions) {
          setPermissions((prev) => ({ ...prev, ...payload.permissions }));
        }

        await beginControl(config);
      } catch (err) {
        console.error('[MeetingRemoteControl] desklink-session-start handler error', err);
      }
    };

    socket.on('desklink-session-start', handleSessionStart);
    return () => {
      socket.off('desklink-session-start', handleSessionStart);
    };
  }, [socket, token, user, beginControl]);

  const value = {
    // UI state
    isPanelOpen,
    openPanel,
    closePanel,
    togglePanel,

    // Session state
    sessionConfig,
    beginControl,
    endControl,
    pendingSession,

    // Incoming owner-side request (for future in-meeting modal)
    incomingRequest,
    acceptIncomingRequest,
    rejectIncomingRequest,

    // Permissions (owner controls)
    permissions,
    setPermissions,

    // Request flow from controller side
    requestControlForUser,

    // WebRTC state for remote desktop
    connectionState,
    iceConnectionState,
    remoteStream,
    stats,
    sendControlMessage,
    setOnDataMessage,
    setOnConnected,
    setOnDisconnected,
  };

  return (
    <MeetingRemoteControlContext.Provider value={value}>
      {children}
    </MeetingRemoteControlContext.Provider>
  );
}

export function useMeetingRemoteControl() {
  const ctx = useContext(MeetingRemoteControlContext);
  if (!ctx) {
    throw new Error('useMeetingRemoteControl must be used within MeetingRemoteControlProvider');
  }
  return ctx;
}