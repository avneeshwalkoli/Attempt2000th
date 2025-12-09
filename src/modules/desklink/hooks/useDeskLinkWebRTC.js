import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://anydesk.onrender.com';
const TURN_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:avn.openai-coturn.workers.dev:443?transport=tcp",
    username: "avneesh",
    credential: "walkoli123",
  },
];

/**
 * DeskLink WebRTC Hook for Remote Desktop Sessions
 * Handles peer connection, datachannel, and signaling
 */
export function useDeskLinkWebRTC() {
  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');
  const [remoteStream, setRemoteStream] = useState(null);
  const [stats, setStats] = useState({
    bitrate: 0,
    rtt: 0,
    fps: 0,
    packetsLost: 0,
  });
const remoteStreamRef = useRef(null);
const hasFiredConnectedRef = useRef(false);

  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const socketRef = useRef(null);
  const sessionRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const onDataMessageRef = useRef(null);
  const onConnectedRef = useRef(null);
  const onDisconnectedRef = useRef(null);
const pendingRemoteIceCandidatesRef = useRef([]);
  /**
   * Start collecting WebRTC stats
   */
  const startStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) return;

    statsIntervalRef.current = setInterval(async () => {
      if (!pcRef.current) return;

      try {
        const stats = await pcRef.current.getStats();
        let bitrate = 0;
        let rtt = 0;
        let fps = 0;
        let packetsLost = 0;

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            bitrate = Math.round((report.bytesReceived * 8) / 1000);
            packetsLost = report.packetsLost || 0;
            fps = report.framesPerSecond || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime
              ? Math.round(report.currentRoundTripTime * 1000)
              : 0;
          }
        });

        setStats({ bitrate, rtt, fps, packetsLost });
      } catch (err) {
        console.error('[Stats] Error collecting stats:', err);
      }
    }, 1000);
  }, []);

  /**
   * Stop collecting stats
   */
  const stopStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  }, []);

  /**
   * Initialize RTCPeerConnection with STUN/TURN config
   */
  const createPeerConnection = useCallback(
    async (iceServers) => {
      // Reuse an existing PC if present (prevents double-creation)
      if (pcRef.current) {
        console.warn('[WebRTC] PeerConnection already exists, reusing existing one');
        return pcRef.current;
      }

      const config = {
        iceServers:
          iceServers || [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        iceCandidatePoolSize: 10,
      };

      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
  setConnectionState(pc.connectionState);
  console.log('[WebRTC] Connection state:', pc.connectionState);

  if (pc.connectionState === 'connected') {
    startStatsCollection();
  } else if (
    pc.connectionState === 'disconnected' ||
    pc.connectionState === 'failed' ||
    pc.connectionState === 'closed'
  ) {
    onDisconnectedRef.current?.();
    stopStatsCollection();
  }
};


      pc.oniceconnectionstatechange = () => {
        setIceConnectionState(pc.iceConnectionState);
        console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
      };

  pc.ontrack = (event) => {
  console.log('[WebRTC] Remote track received:', event.track.kind);

  setRemoteStream((prev) => {
    // Reuse existing stream if any, otherwise make a new one
    const stream = prev || new MediaStream();

    // Avoid adding the same track twice
    const alreadyThere = stream.getTracks().some((t) => t.id === event.track.id);
    if (!alreadyThere) {
      stream.addTrack(event.track);
    }

    remoteStreamRef.current = stream;

    // Fire onConnected callback ONCE when the first track arrives
    if (!hasFiredConnectedRef.current && onConnectedRef.current) {
      hasFiredConnectedRef.current = true;
      try {
        onConnectedRef.current(stream);
      } catch (err) {
        console.error('[WebRTC] Error in onConnected callback:', err);
      }
    }

    return stream;
  });
};


      // Local ICE candidates → server
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current && sessionRef.current) {
          const {
            sessionId,
            sessionToken,
            localDeviceId,
            remoteDeviceId,
            localUserId,
          } = sessionRef.current;

          socketRef.current.emit('webrtc-ice', {
            sessionId,
            fromUserId: localUserId,
            fromDeviceId: localDeviceId,
            toDeviceId: remoteDeviceId,
            candidate: event.candidate,
            token: sessionToken,
          });
        }
      };

      // DataChannel:
      //  - Caller creates it
      //  - Receiver only listens in ondatachannel
      if (sessionRef.current?.role === 'caller') {
        console.log('[DataChannel] Creating channel as Caller');
        const dc = pc.createDataChannel('desklink-control', {
          ordered: true,
          maxRetransmits: 3,
        });

        dc.onopen = () => {
          console.log('[DataChannel] Opened');
        };

        dc.onclose = () => {
          console.log('[DataChannel] Closed');
        };

        dc.onmessage = (event) => {
          try {
            const message =
              typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            onDataMessageRef.current?.(message);
          } catch (err) {
            console.error('[DataChannel] Parse error:', err);
          }
        };

        dataChannelRef.current = dc;
      }

      pc.ondatachannel = (event) => {
        console.log('[DataChannel] Received datachannel (Receiver)');
        const dc = event.channel;
        dataChannelRef.current = dc;

        dc.onopen = () => {
          console.log('[DataChannel] Opened (receiver)');
        };

        dc.onclose = () => {
          console.log('[DataChannel] Closed (receiver)');
        };

        dc.onmessage = (event) => {
          try {
            const message =
              typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            onDataMessageRef.current?.(message);
          } catch (err) {
            console.error('[DataChannel] Parse error:', err);
          }
        };
      };

      return pc;
    },
    [ startStatsCollection, stopStatsCollection]
  );

  /**
   * Start as caller (controller)
   *
   * params:
   *  - sessionId
   *  - authToken     => normal JWT for Socket.IO auth
   *  - sessionToken  => ephemeral webrtc-session token from /remote/accept
   */
  const startAsCaller = useCallback(
    async ({
      sessionId,
      authToken,
      sessionToken,
      localUserId,
      localDeviceId,
      remoteDeviceId,
      iceServers,
    }) => {
      try {
        if (pcRef.current || socketRef.current) {
          console.log('[WebRTC] Caller already started, skipping');
          return;
        }

        console.log('[WebRTC] Starting as caller');

        // Store session context for ICE callbacks
        sessionRef.current = {
          sessionId,
          sessionToken,
          localUserId,
          localDeviceId,
          remoteDeviceId,
          role: 'caller',
        };

        // Socket.IO connection for signaling
        const socket = io(SOCKET_URL, {
          auth: { token: authToken },
          transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('[WebRTC] socket connected (caller)', socket.id);
          if (localDeviceId) {
            socket.emit('register', { deviceId: localDeviceId });
            console.log('[WebRTC] register emitted for device', localDeviceId);
          }
        });

        socket.on('connect_error', (err) => {
          console.error('[WebRTC] socket connect_error (caller)', err?.message || err);
        });

        // Receive answer from agent
 socket.on('webrtc-answer', async ({ sdp, sessionId: sid }) => {
  try {
    const pc = pcRef.current;
    if (!pc) return;

    console.log('[WebRTC] webrtc-answer received for session', sid);
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
    console.log('[WebRTC] Remote description set (answer)');

    // 🔥 Apply buffered candidates now
    const buffered = pendingRemoteIceCandidatesRef.current;
    if (buffered.length > 0) {
      console.log('[WebRTC] Applying', buffered.length, 'buffered ICE candidates for', sid);
      for (const c of buffered) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (err) {
          console.error('[WebRTC] Error applying buffered ICE candidate:', err);
        }
      }
      pendingRemoteIceCandidatesRef.current = [];
    }
  } catch (err) {
    console.error('[WebRTC] Error setting remote description:', err);
  }
});


        // Remote ICE from agent
       socket.on('webrtc-ice', async ({ candidate, sessionId: sid }) => {
  try {
    const pc = pcRef.current;
    if (!pc || !candidate || !candidate.candidate) return;

    // If we don't have a remoteDescription yet, buffer the candidate
    if (!pc.remoteDescription) {
      pendingRemoteIceCandidatesRef.current.push(candidate);
      console.log('[WebRTC] Buffering ICE candidate for', sid, '(no remoteDescription yet)');
      return;
    }

    await pc.addIceCandidate(new RTCIceCandidate(candidate));
    console.log('[WebRTC] Added remote ICE candidate for', sid);
  } catch (err) {
    console.error('[WebRTC] Error adding ICE candidate:', err);
  }
});


        // Create peer connection AFTER sessionRef.role is set => creates DC as caller
        const pc = await createPeerConnection(TURN_ICE_SERVERS);


        // Create and send offer
        const offer = await pc.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
        });
        await pc.setLocalDescription(offer);

        socket.emit('webrtc-offer', {
          sessionId,
          fromUserId: localUserId,
          fromDeviceId: localDeviceId,
          toDeviceId: remoteDeviceId,
          sdp: offer.sdp,
          token: sessionToken,
        });

        console.log('[WebRTC] Offer sent');
      } catch (err) {
        console.error('[WebRTC] Error starting as caller:', err);
        throw err;
      }
    },
    [createPeerConnection]
  );

  /**
   * Handle incoming offer (receiver/host)
   *
   * Called from the agent side **browser** if you ever support that,
   * but in your current setup the NodeHelper is the receiver, so this will
   * likely not be used right now. Keeping it correct anyway.
   */
  const handleOffer = useCallback(
    async ({
      sessionId,
      authToken,
      sessionToken,
      localUserId,
      localDeviceId,
      remoteDeviceId,
      sdp,
      iceServers,
    }) => {
      try {
        if (pcRef.current || socketRef.current) {
          console.log('[WebRTC] Receiver already started, skipping');
          return;
        }

        console.log('[WebRTC] Handling offer');

        sessionRef.current = {
          sessionId,
          sessionToken,
          localUserId,
          localDeviceId,
          remoteDeviceId,
          role: 'receiver',
        };

        const socket = io(SOCKET_URL, {
          auth: { token: authToken },
          transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('[WebRTC] (receiver) socket connected', socket.id);
          if (localDeviceId) {
            socket.emit('register', { deviceId: localDeviceId });
            console.log('[WebRTC] (receiver) register emitted for device', localDeviceId);
          }
        });

        socket.on('connect_error', (err) => {
          console.error(
            '[WebRTC] socket connect_error (receiver)',
            err?.message || err
          );
        });

        // Remote ICE from caller
        socket.on('webrtc-ice', async ({ candidate, sessionId: sid }) => {
          try {
            const pc = pcRef.current;
            if (pc && candidate && candidate.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log('[WebRTC] (receiver) Added remote ICE for', sid);
            }
          } catch (err) {
            console.error('[WebRTC] (receiver) Error adding ICE candidate:', err);
          }
        });

        const pc = await createPeerConnection(iceServers);

        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp })
        );
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc-answer', {
          sessionId,
          fromUserId: localUserId,
          fromDeviceId: localDeviceId,
          toDeviceId: remoteDeviceId,
          sdp: answer.sdp,
          token: sessionToken,
        });

        console.log('[WebRTC] Answer sent');
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
        throw err;
      }
    },
    [createPeerConnection]
  );

  /**
   * Add ICE candidate manually (not really needed with our socket wiring,
   * but keeping for completeness)
   */
  const addIceCandidate = useCallback(async (candidate) => {
    try {
      if (pcRef.current && candidate && candidate.candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error('[WebRTC] Error adding ICE candidate:', err);
    }
  }, []);

  /**
   * Send control message via datachannel
   */
  const sendControlMessage = useCallback((message) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      dataChannelRef.current.send(payload);
    } else {
      console.warn('[DataChannel] Not open, cannot send message');
    }
  }, []);

  /**
   * Stop session
   */
  const stopSession = useCallback(() => {
  console.log('[WebRTC] Stopping session');

  stopStatsCollection();

  hasFiredConnectedRef.current = false;

  if (dataChannelRef.current) {
    try {
      dataChannelRef.current.close();
    } catch {}
    dataChannelRef.current = null;
  }

  if (pcRef.current) {
    try {
      pcRef.current.close();
    } catch {}
    pcRef.current = null;
  }

  if (socketRef.current) {
    if (sessionRef.current) {
      socketRef.current.emit('webrtc-cancel', {
        sessionId: sessionRef.current.sessionId,
        fromUserId: sessionRef.current.localUserId,
      });
    }
    socketRef.current.disconnect();
    socketRef.current = null;
  }

  if (remoteStreamRef.current) {
    remoteStreamRef.current.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current = null;
  }

  setRemoteStream(null);
  setConnectionState('closed');
  setIceConnectionState('closed');
  sessionRef.current = null;
}, [stopStatsCollection]);


  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  return {
    connectionState,
    iceConnectionState,
    remoteStream,
    stats,
    startAsCaller,
    handleOffer,
    addIceCandidate,
    sendControlMessage,
    stopSession,
    setOnDataMessage: (callback) => {
      onDataMessageRef.current = callback;
    },
    setOnConnected: (callback) => {
      onConnectedRef.current = callback;
    },
    setOnDisconnected: (callback) => {
      onDisconnectedRef.current = callback;
    },
  };
}
