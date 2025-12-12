import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://anydesk.onrender.com';

export function useDeskLinkSocket({ token, onRemoteRequest, onRemoteResponse }) {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const effectiveToken =
      token ||
      (typeof window !== 'undefined'
        ? localStorage.getItem('token') || localStorage.getItem('vd_auth_token')
        : null);

    if (!effectiveToken) {
      console.warn('[useDeskLinkSocket] no token available yet; socket will not connect');
      return;
    }

    const s = io(SOCKET_URL, {
      auth: { token: effectiveToken },
      transports: ['websocket'],
      path: '/socket.io',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = s;
    setSocket(s); // 🔥 forces re-render with real socket

    try {
      window.__desklinkSocket = s;
    } catch (e) {}

    s.on('connect', () => {
      console.log('[useDeskLinkSocket] connected', s.id);
    });

    s.on('disconnect', (reason) => {
      console.log('[useDeskLinkSocket] disconnected', reason);
    });

    s.on('connect_error', (err) => {
      try {
        console.error(
          '[useDeskLinkSocket] connect_error',
          err && (err.message || JSON.stringify(err))
        );
      } catch (e) {
        console.error('[useDeskLinkSocket] connect_error', err);
      }
    });

    // app events
    s.on('desklink-remote-request', (payload) => {
      console.log('[useDeskLinkSocket] remote-request', payload);
      onRemoteRequest?.(payload);
    });

    s.on('desklink-remote-response', (payload) => {
      console.log('[useDeskLinkSocket] remote-response', payload);
      onRemoteResponse?.(payload);
    });

    return () => {
       try {
    const globalSocket = (typeof window !== 'undefined') ? window.__desklinkSocket : null;
    // If the socket we created is the same as the global shared socket, we should disconnect it.
    // If it's NOT the global socket (i.e., some other component owns the shared socket), leave it running.
    const weCreatedShared = globalSocket === socketRef.current;

    if (weCreatedShared) {
      console.log('[useDeskLinkSocket] cleanup: we created the shared socket — disconnecting');
      socketRef.current?.disconnect();
      if (typeof window !== 'undefined' && window.__desklinkSocket === socketRef.current) {
        window.__desklinkSocket = undefined;
      }
    } else {
      console.log('[useDeskLinkSocket] cleanup: not owner of shared socket — leaving it connected');
      // don't disconnect shared socket owned by another component
    }
  } catch (err) {
    console.warn('[useDeskLinkSocket] cleanup error', err);
  }
      socketRef.current = null;
      setSocket(null);
    };
  }, [token, onRemoteRequest, onRemoteResponse]);

  return { socket };
}
