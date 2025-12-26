// useDeskLinkWebRTC.js - FULLY FIXED VERSION
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

// Local-first signaling endpoint; override with VITE_SOCKET_URL if desired.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const TURN_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:avn.openai-coturn.workers.dev:443?transport=tcp",
    username: "avneesh",
    credential: "walkoli123",
  },
];

function sleep(ms = 100) {
  return new Promise((res) => setTimeout(res, ms));
}

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
  const startedRef = useRef(false);

  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const socketRef = useRef(null);
  const sessionRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const onDataMessageRef = useRef(null);
  const onConnectedRef = useRef(null);
  const onDisconnectedRef = useRef(null);
  const pendingRemoteIceCandidatesRef = useRef([]);
  const attachedSocketListenersRef = useRef({});

  const startStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) return;

    statsIntervalRef.current = setInterval(async () => {
      if (!pcRef.current) return;

      try {
        const s = await pcRef.current.getStats();
        let bitrate = 0;
        let rtt = 0;
        let fps = 0;
        let packetsLost = 0;

        s.forEach((report) => {
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

  const stopStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  }, []);

  const createPeerConnection = useCallback(
    async (iceServers, role) => {
      if (pcRef.current) {
        console.warn('[WebRTC] PeerConnection already exists, reusing');
        return pcRef.current;
      }

      console.log('[WebRTC] Creating PeerConnection with role:', role);

      const config = {
        iceServers: iceServers || TURN_ICE_SERVERS,
        iceCandidatePoolSize: 10,
        sdpSemantics: 'unified-plan',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      };

      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setConnectionState(state);
        console.log('[WebRTC] Connection state:', state);

        if (state === 'connected') {
          console.log('[WebRTC] ✓✓✓ CONNECTED ✓✓✓');
          startStatsCollection();

          if (
            remoteStreamRef.current &&
            !hasFiredConnectedRef.current &&
            onConnectedRef.current
          ) {
            hasFiredConnectedRef.current = true;
            try {
              onConnectedRef.current(remoteStreamRef.current);
            } catch (err) {
              console.error('[WebRTC] Error in onConnected:', err);
            }
          }
        } else if (['disconnected', 'failed', 'closed'].includes(state)) {
          console.log('[WebRTC] Connection failed/closed:', state);
          onDisconnectedRef.current?.();
          stopStatsCollection();
        }
      };

      pc.oniceconnectionstatechange = () => {
        setIceConnectionState(pc.iceConnectionState);
        console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
      };

      pc.ontrack = (event) => {
        console.log('[WebRTC] ✓ Remote track received:', event.track.kind);

        setRemoteStream((prev) => {
          const stream = prev || new MediaStream();
          const alreadyThere = stream.getTracks().some((t) => t.id === event.track.id);
          if (!alreadyThere) {
            stream.addTrack(event.track);
            console.log('[WebRTC] Track added to stream');
          }
          remoteStreamRef.current = stream;

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

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current && sessionRef.current) {
          const {
            sessionId,
            sessionToken,
            localDeviceId,
            remoteDeviceId,
            localUserId,
          } = sessionRef.current;

          console.log('[WebRTC] Sending local ICE candidate');
          
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

      // ✅ CALLER: Create datachannel IMMEDIATELY
      if (role === 'caller') {
        console.log('[WebRTC] Creating datachannel (CALLER)...');
        
        const dc = pc.createDataChannel('desklink-control', {
          ordered: true,
          maxRetransmits: 3,
        });

        dc.onopen = () => {
          console.log('[DataChannel] ✓✓✓ OPENED (caller) - readyState:', dc.readyState);
        };

        dc.onclose = () => {
          console.log('[DataChannel] Closed (caller)');
        };

        dc.onerror = (err) => {
          console.error('[DataChannel] Error (caller):', err);
        };

        dc.onmessage = (event) => {
          try {
            const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            console.log('[DataChannel] Message received:', message.type);
            onDataMessageRef.current?.(message);
          } catch (err) {
            console.error('[DataChannel] Parse error:', err);
          }
        };

        dataChannelRef.current = dc;
        console.log('[WebRTC] ✓ DataChannel created for caller');
      }

      // ✅ RECEIVER: Wait for datachannel
      pc.ondatachannel = (event) => {
        console.log('[DataChannel] ✓✓✓ RECEIVED from caller (receiver)');
        const dc = event.channel;
        dataChannelRef.current = dc;

        dc.onopen = () => {
          console.log('[DataChannel] ✓ OPENED (receiver) - readyState:', dc.readyState);
        };

        dc.onclose = () => {
          console.log('[DataChannel] Closed (receiver)');
        };

        dc.onerror = (err) => {
          console.error('[DataChannel] Error (receiver):', err);
        };

        dc.onmessage = (event) => {
          try {
            const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            onDataMessageRef.current?.(message);
          } catch (err) {
            console.error('[DataChannel] Parse error:', err);
          }
        };
      };

      return pc;
    },
    [startStatsCollection, stopStatsCollection]
  );

  const startAsCaller = useCallback(
    async ({
      sessionId,
      authToken,
      sessionToken,
      localUserId,
      localDeviceId,
      remoteDeviceId,
      iceServers: providedIceServers,
    }) => {
      try {
        if (startedRef.current) {
          console.log('[WebRTC] Already started, skipping');
          return;
        }

        console.log('[WebRTC] ===== STARTING AS CALLER =====');
        startedRef.current = true;

        if (!providedIceServers) {
          providedIceServers = TURN_ICE_SERVERS;
        }

        // Set session FIRST
        sessionRef.current = {
          sessionId,
          sessionToken,
          localUserId,
          localDeviceId,
          remoteDeviceId,
          role: 'caller',
        };

        // ✅ CRITICAL FIX: Setup socket and WAIT for it to connect before creating offer
        let socket;
        const socketReady = new Promise((resolve, reject) => {
          if (typeof window !== 'undefined' && window.__desklinkSocket) {
            socket = window.__desklinkSocket;
            console.log('[WebRTC] Using shared socket id=', socket.id);
            if (socket.connected) {
              resolve();
            } else {
              const onConnect = () => {
                socket.off('connect', onConnect);
                resolve();
              };
              socket.on('connect', onConnect);
            }
          } else {
            console.log('[WebRTC] Creating new socket connection...');
            socket = io(SOCKET_URL, {
              auth: { token: authToken },
              transports: ['websocket'],
            });

            const onLocalConnect = () => {
              console.log('[WebRTC] Socket connected', socket.id);
              if (localDeviceId) {
                socket.emit('register', { deviceId: localDeviceId });
                console.log('[WebRTC] Register emitted for', localDeviceId);
              }
              socket.off('connect', onLocalConnect);
              // ✅ Wait a bit after register to ensure server processes it
              setTimeout(() => resolve(), 300);
            };
            
            socket.on('connect', onLocalConnect);
            attachedSocketListenersRef.current.localConnect = onLocalConnect;

            socket.on('connect_error', (err) => {
              console.error('[WebRTC] Socket error:', err?.message || err);
              reject(err);
            });

            // Timeout after 10 seconds
            setTimeout(() => reject(new Error('Socket connection timeout')), 10000);
          }
        });

        socketRef.current = socket;

        // ✅ WAIT for socket to be fully ready
        console.log('[WebRTC] Waiting for socket to be ready...');
        await socketReady;
        console.log('[WebRTC] ✓ Socket ready, proceeding with WebRTC setup');

        // Answer handler
        const onAnswer = async ({ sdp, sessionId: sid }) => {
          try {
            console.log('[WebRTC] ===== ANSWER RECEIVED =====');
            const pc = pcRef.current;
            if (!pc) {
              console.warn('[WebRTC] PC missing when answer received');
              return;
            }
            
            console.log('[WebRTC] Setting remote description (answer)...');
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
            console.log('[WebRTC] ✓ Remote description set (answer)');

            // Apply buffered ICE candidates
            const buffered = pendingRemoteIceCandidatesRef.current || [];
            if (buffered.length > 0) {
              console.log('[WebRTC] Applying', buffered.length, 'buffered ICE candidates');
              for (const c of buffered) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(c));
                  console.log('[WebRTC] ✓ Applied buffered ICE');
                } catch (err) {
                  console.error('[WebRTC] Error applying buffered ICE:', err);
                }
              }
              pendingRemoteIceCandidatesRef.current = [];
            }
          } catch (err) {
            console.error('[WebRTC] Error handling answer:', err);
          }
        };

        const onIce = async ({ candidate, sessionId: sid }) => {
          try {
            if (!candidate || !candidate.candidate) return;

            const pc = pcRef.current;

            if (!pc || !pc.remoteDescription) {
              console.log('[WebRTC] Buffering ICE (caller) — remoteDesc not ready');
              pendingRemoteIceCandidatesRef.current.push(candidate);
              return;
            }

            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('[WebRTC] ✓ Added ICE candidate (caller)');
          } catch (err) {
            console.error('[WebRTC] Error adding ICE (caller):', err);
          }
        };

        socket.on('webrtc-answer', onAnswer);
        socket.on('webrtc-ice', onIce);

        attachedSocketListenersRef.current['webrtc-answer'] = onAnswer;
        attachedSocketListenersRef.current['webrtc-ice'] = onIce;

        // Create PC with explicit 'caller' role (datachannel created inside)
        const pc = await createPeerConnection(providedIceServers, 'caller');

        // Verify datachannel
        if (!dataChannelRef.current) {
          throw new Error('❌ CRITICAL: DataChannel was NOT created!');
        }
        console.log('[WebRTC] ✓ DataChannel verified, readyState:', dataChannelRef.current.readyState);

        // Wait for datachannel to be ready
        await sleep(200);

        // Create offer
        console.log('[WebRTC] Creating offer...');
        const offer = await pc.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
        });
        
        await pc.setLocalDescription(offer);
        console.log('[WebRTC] ✓ Local description set (offer)');

        // Small delay before sending
        await sleep(150);

        // Emit offer
        console.log('[WebRTC] Sending offer to', remoteDeviceId);
        socket.emit('webrtc-offer', {
          sessionId,
          fromUserId: localUserId,
          fromDeviceId: localDeviceId,
          toDeviceId: remoteDeviceId,
          sdp: offer.sdp,
          token: sessionToken,
        });

        console.log('[WebRTC] ✓✓✓ OFFER SENT ✓✓✓');
      } catch (err) {
        startedRef.current = false;
        console.error('[WebRTC] ✗ Error in startAsCaller:', err);
        throw err;
      }
    },
    [createPeerConnection]
  );

  const handleOffer = useCallback(
    async ({ sessionId, authToken, sessionToken, localUserId, localDeviceId, remoteDeviceId, sdp }) => {
      try {
        if (pcRef.current || socketRef.current) {
          console.log('[WebRTC] Receiver already started, skipping');
          return;
        }

        console.log('[WebRTC] ===== HANDLING OFFER (RECEIVER) =====');

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
          }
        });

        socket.on('webrtc-ice', async ({ candidate, sessionId: sid }) => {
          try {
            const pc = pcRef.current;
            if (pc && pc.remoteDescription && candidate && candidate.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log('[WebRTC] (receiver) ✓ Added remote ICE');
            } else {
              pendingRemoteIceCandidatesRef.current.push(candidate);
              console.log('[WebRTC] (receiver) Buffered ICE candidate');
            }
          } catch (err) {
            console.error('[WebRTC] (receiver) Error adding ICE:', err);
          }
        });

        // Create PC with 'receiver' role
        const pc = await createPeerConnection(TURN_ICE_SERVERS, 'receiver');

        console.log('[WebRTC] Setting remote description (offer)...');
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
        console.log('[WebRTC] ✓ Remote description set');

        // Apply buffered ICE
        if (pendingRemoteIceCandidatesRef.current.length > 0) {
          console.log('[WebRTC] Applying buffered ICE count=', pendingRemoteIceCandidatesRef.current.length);
          for (const c of pendingRemoteIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (err) {
              console.error('[WebRTC] Error applying buffered ICE:', err);
            }
          }
          pendingRemoteIceCandidatesRef.current = [];
        }

        console.log('[WebRTC] Creating answer...');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('[WebRTC] ✓ Local description set (answer)');

        await sleep(100);

        console.log('[WebRTC] Sending answer...');
        socket.emit('webrtc-answer', {
          sessionId,
          fromUserId: localUserId,
          fromDeviceId: localDeviceId,
          toDeviceId: remoteDeviceId,
          sdp: answer.sdp,
          token: sessionToken,
        });

        console.log('[WebRTC] ✓ Answer sent');
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
        throw err;
      }
    },
    [createPeerConnection]
  );

  const addIceCandidate = useCallback(async (candidate) => {
    try {
      if (pcRef.current && pcRef.current.remoteDescription && candidate && candidate.candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingRemoteIceCandidatesRef.current.push(candidate);
      }
    } catch (err) {
      console.error('[WebRTC] Error adding ICE candidate:', err);
    }
  }, []);

  const sendControlMessage = useCallback((message) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      dataChannelRef.current.send(payload);
      console.log('[DataChannel] Message sent:', message.type || 'unknown');
    } else {
      console.warn('[DataChannel] Not open (state:', dataChannelRef.current?.readyState || 'null', ')');
    }
  }, []);

  const stopSession = useCallback(() => {
    console.log('[WebRTC] ===== STOPPING SESSION =====');

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
      try {
        Object.entries(attachedSocketListenersRef.current || {}).forEach(([k, fn]) => {
          if (k === 'localConnect') {
            socketRef.current.off('connect', fn);
          } else {
            socketRef.current.off(k, fn);
          }
        });

        attachedSocketListenersRef.current = {};

        if (sessionRef.current) {
          socketRef.current.emit('webrtc-cancel', {
            sessionId: sessionRef.current.sessionId,
            fromUserId: sessionRef.current.localUserId,
          });
        }

        // ---- Start replacement (useDeskLinkWebRTC.js) ----
        const globalSocket = (typeof window !== 'undefined') ? window.__desklinkSocket : null;
        const isSharedSocket = globalSocket && globalSocket === socketRef.current;
        if (!isSharedSocket && socketRef.current) {
          try {
            console.log('[WebRTC] stopSession: disconnecting local socket (not shared)');
            socketRef.current.disconnect();
          } catch (e) {
            console.warn('[WebRTC] stopSession: error disconnecting socket', e);
          }
        } else {
          console.log('[WebRTC] stopSession: socket is shared — leaving it connected');
        }
        // ---- End replacement ----

      } catch (e) {
        console.warn('[WebRTC] Socket cleanup error', e);
      }
      socketRef.current = null;
    }

    if (remoteStreamRef.current) {
      try {
        remoteStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      remoteStreamRef.current = null;
    }

    setRemoteStream(null);
    setConnectionState('closed');
    setIceConnectionState('closed');

    sessionRef.current = null;
    startedRef.current = false;
    pendingRemoteIceCandidatesRef.current = [];
  }, [stopStatsCollection]);

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