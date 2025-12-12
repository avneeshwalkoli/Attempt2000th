// useDeskLinkWebRTC.js
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

function sleep(ms = 100) {
  return new Promise((res) => setTimeout(res, ms));
}

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
  const attachedSocketListenersRef = useRef({}); // track functions we attached so we can remove them

  /**
   * Start collecting WebRTC stats
   */
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
        iceServers: iceServers || TURN_ICE_SERVERS,
        iceCandidatePoolSize: 10,
        sdpSemantics: 'unified-plan',
      };

      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        console.log('[WebRTC] Connection state:', pc.connectionState);

        if (pc.connectionState === 'connected') {
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
              console.error('[WebRTC] Error in onConnected (state change):', err);
            }
          }
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
          const stream = prev || new MediaStream();
          const alreadyThere = stream.getTracks().some((t) => t.id === event.track.id);
          if (!alreadyThere) {
            stream.addTrack(event.track);
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

          try {
            socketRef.current.emit('webrtc-ice', {
              sessionId,
              fromUserId: localUserId,
              fromDeviceId: localDeviceId,
              toDeviceId: remoteDeviceId,
              candidate: event.candidate,
              token: sessionToken,
            });
          } catch (err) {
            console.warn('[WebRTC] Failed to emit ICE candidate:', err);
          }
        }
      };

      // If this client was already marked as caller when PC created, create datachannel
      if (sessionRef.current?.role === 'caller') {
        // create datachannel only if none exists
        if (!dataChannelRef.current) {
          try {
            const dc = pc.createDataChannel('desklink-control', {
              ordered: true,
              maxRetransmits: 3,
            });

            dc.onopen = () => {
              console.log('[DataChannel] Opened - readyState=', dc.readyState);
            };

            dc.onclose = () => {
              console.log('[DataChannel] Closed');
            };

            dc.onmessage = (event) => {
              try {
                const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                onDataMessageRef.current?.(message);
              } catch (err) {
                console.error('[DataChannel] Parse error:', err);
              }
            };

            dataChannelRef.current = dc;
          } catch (err) {
            console.warn('[DataChannel] Failed to create as caller', err);
          }
        }
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

  /**
   * Start as caller (controller)
   */
  const startAsCaller = useCallback(
    async ({
      sessionId,
      authToken,
      sessionToken,
      localUserId,
      localDeviceId,
      remoteDeviceId,
      iceServers: providedIceServers, // optional
    }) => {
      try {
        if (startedRef.current) {
          console.log('[WebRTC] startAsCaller called but already started, skipping');
          return;
        }

        console.log('[WebRTC] Starting as caller');
        startedRef.current = true;

        // FORCE TURN if not provided
        if (!providedIceServers) {
          providedIceServers = TURN_ICE_SERVERS;
        }

        sessionRef.current = {
          sessionId,
          sessionToken,
          localUserId,
          localDeviceId,
          remoteDeviceId,
          role: 'caller',
        };

        // Socket selection: prefer global if present
        let socket;
        if (typeof window !== 'undefined' && window.__desklinkSocket) {
          socket = window.__desklinkSocket;
          console.log('[WebRTC] Using shared app socket id=', socket.id);
        } else {
          socket = io(SOCKET_URL, {
            auth: { token: authToken },
            transports: ['websocket'],
          });

          // register local device on connect
          const onLocalConnect = () => {
            console.log('[WebRTC] Local caller socket connected', socket.id);
            if (localDeviceId) {
              socket.emit('register', { deviceId: localDeviceId });
            }
          };
          socket.on('connect', onLocalConnect);

          // we will remove these listeners on cleanup if we created socket
          attachedSocketListenersRef.current.localConnect = onLocalConnect;

          socket.on('connect_error', (err) => {
            console.error('[WebRTC] Caller socket connect_error:', err?.message || err);
          });

          socket.on('disconnect', (r) => {
            console.warn('[WebRTC] Caller socket disconnected:', r);
          });
        }

        // store socket
        socketRef.current = socket;

        // attach answer handler
        const onAnswer = async ({ sdp, sessionId: sid }) => {
          try {
            console.log('[WebRTC] webrtc-answer RECEIVED (caller) for session', sid);
            const pc = pcRef.current;
            if (!pc) {
              console.warn('[WebRTC] pc missing when answer received');
              return;
            }
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
            console.log('[WebRTC] Remote description set (answer)');

            // apply buffered candidates now
            const buffered = pendingRemoteIceCandidatesRef.current || [];
            if (buffered.length > 0) {
              console.log('[WebRTC] Applying', buffered.length, 'buffered ICE candidates');
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
            console.error('[WebRTC] Error handling webrtc-answer (caller):', err);
          }
        };

        const onIce = async ({ candidate, sessionId: sid }) => {
          try {
            // basic guard
            if (!candidate || !candidate.candidate) return;

            const pc = pcRef.current;

            // if PC or remoteDescription not ready → buffer and return
            if (!pc || !pc.remoteDescription) {
              console.log('[WebRTC] Buffering ICE (caller) — PC/remoteDesc not ready');
              pendingRemoteIceCandidatesRef.current.push(candidate);
              return;
            }

            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('[WebRTC] Added ICE candidate (caller)');
          } catch (err) {
            console.error('[WebRTC] Error adding ICE (caller):', err);
          }
        };

        // attach handlers (safe to attach even on shared socket)
        socket.on('webrtc-answer', onAnswer);
        socket.on('webrtc-ice', onIce);

        // save so we can remove them later
        attachedSocketListenersRef.current['webrtc-answer'] = onAnswer;
        attachedSocketListenersRef.current['webrtc-ice'] = onIce;

        // create PC (ensures datachannel created for caller)
        const pc = await createPeerConnection(providedIceServers);

        // create offer and set local desc
        const offer = await pc.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
        });
        await pc.setLocalDescription(offer);

        // small delay to ensure remote is ready to receive the offer
        await sleep(120);

        // emit offer
        socket.emit('webrtc-offer', {
          sessionId,
          fromUserId: localUserId,
          fromDeviceId: localDeviceId,
          toDeviceId: remoteDeviceId,
          sdp: offer.sdp,
          token: sessionToken,
        });

        console.log('[WebRTC] Offer SENT (caller) to', remoteDeviceId);
      } catch (err) {
        startedRef.current = false;
        console.error('[WebRTC] Error in startAsCaller:', err);
        throw err;
      }
    },
    [createPeerConnection]
  );

  /**
   * Handle incoming offer (receiver/host) — browser-side receiver support.
   * In your current setup NodeHelper is the receiver so browser rarely uses this,
   * but we keep it correct for completeness.
   */
  const handleOffer = useCallback(
    async ({ sessionId, authToken, sessionToken, localUserId, localDeviceId, remoteDeviceId, sdp }) => {
      try {
        if (pcRef.current || socketRef.current) {
          console.log('[WebRTC] Receiver already started, skipping');
          return;
        }

        console.log('[WebRTC] Handling offer (receiver)');

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

        socket.on('connect_error', (err) => {
          console.error('[WebRTC] socket connect_error (receiver)', err?.message || err);
        });

        socket.on('webrtc-ice', async ({ candidate, sessionId: sid }) => {
          try {
            const pc = pcRef.current;
            if (pc && candidate && candidate.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log('[WebRTC] (receiver) Added remote ICE for', sid);
            } else {
              // buffer if pc not ready
              pendingRemoteIceCandidatesRef.current.push(candidate);
              console.log('[WebRTC] (receiver) Buffered ICE candidate because pc not ready');
            }
          } catch (err) {
            console.error('[WebRTC] (receiver) Error adding ICE candidate:', err);
          }
        });

        // create PC and ensure tracks/datachannel handlers
        const pc = await createPeerConnection(TURN_ICE_SERVERS);

        // set remote (offer) then create+send answer
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));

        // apply any buffered ICE now (common case)
        if (pendingRemoteIceCandidatesRef.current.length > 0) {
          console.log('[WebRTC] (receiver) Applying buffered ICE count=', pendingRemoteIceCandidatesRef.current.length);
          for (const c of pendingRemoteIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (err) {
              console.error('[WebRTC] (receiver) Error applying buffered ICE:', err);
            }
          }
          pendingRemoteIceCandidatesRef.current = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // small delay to ensure our socket and PC have stabilized
        await sleep(100);

        socket.emit('webrtc-answer', {
          sessionId,
          fromUserId: localUserId,
          fromDeviceId: localDeviceId,
          toDeviceId: remoteDeviceId,
          sdp: answer.sdp,
          token: sessionToken,
        });

        console.log('[WebRTC] (receiver) Answer sent');
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
        throw err;
      }
    },
    [createPeerConnection]
  );

  /**
   * Add ICE candidate manually (not usually necessary)
   */
  const addIceCandidate = useCallback(async (candidate) => {
    try {
      if (pcRef.current && candidate && candidate.candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // buffer if not ready
        pendingRemoteIceCandidatesRef.current.push(candidate);
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
   * Stop session and cleanup
   */
  const stopSession = useCallback(() => {
    console.log('[WebRTC] Stopping session');

    stopStatsCollection();

    hasFiredConnectedRef.current = false;

    // Close datachannel
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch {}
      dataChannelRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }

    // Socket cleanup: remove listeners we attached and disconnect if local
    if (socketRef.current) {
      try {
        // if this is the shared app socket, do not disconnect it; only remove listeners
        const isSharedSocket =
          typeof window !== 'undefined' &&
          window.__desklinkSocket &&
          window.__desklinkSocket === socketRef.current;

        // remove the main handlers we may have attached
        Object.entries(attachedSocketListenersRef.current || {}).forEach(([k, fn]) => {
          try {
            if (k === 'localConnect') {
              socketRef.current.off('connect', fn);
            } else {
              socketRef.current.off(k, fn);
            }
          } catch (e) {}
        });

        attachedSocketListenersRef.current = {};

        // send cancel
        if (sessionRef.current) {
          try {
            socketRef.current.emit('webrtc-cancel', {
              sessionId: sessionRef.current.sessionId,
              fromUserId: sessionRef.current.localUserId,
            });
          } catch (e) {}
        }

        if (!isSharedSocket) {
          try {
            socketRef.current.disconnect();
          } catch (e) {}
        } else {
          // remove only webrtc handlers if shared socket
          try {
            socketRef.current.off('webrtc-answer');
            socketRef.current.off('webrtc-ice');
            socketRef.current.off('webrtc-offer');
          } catch (e) {}
        }
      } catch (e) {
        console.warn('[WebRTC] socket cleanup err', e);
      }
      socketRef.current = null;
    }

    // Stop remote stream tracks
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
