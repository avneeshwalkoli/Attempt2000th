import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://anydesk.onrender.com';

export function useDeskLinkSocket({ token, onRemoteRequest, onRemoteResponse }) {
  const socketRef = useRef(null);

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

    // Create socket with explicit path and reconnection options
    const socket = io(SOCKET_URL, {
      auth: { token: effectiveToken },
      transports: ['websocket'],
      path: '/socket.io',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    // expose for debugging in dev
    try { window.__desklinkSocket = socket; } catch (e) {}

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[useDeskLinkSocket] connected', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[useDeskLinkSocket] disconnected', reason);
    });

    socket.on('connect_error', (err) => {
      // err can be Error or object; log useful details
      try {
        console.error('[useDeskLinkSocket] connect_error', err && (err.message || JSON.stringify(err)));
      } catch (e) {
        console.error('[useDeskLinkSocket] connect_error', err);
      }
    });

    // app events
    socket.on('desklink-remote-request', (payload) => {
      onRemoteRequest?.(payload);
    });

    socket.on('desklink-remote-response', (payload) => {
      onRemoteResponse?.(payload);
    });

    return () => {
      try { socket.disconnect(); } catch (e) { /* ignore */ }
      if (window.__desklinkSocket === socket) {
        try { window.__desklinkSocket = undefined; } catch (e) {}
      } 
      socketRef.current = null;
    };
  }, [token, onRemoteRequest, onRemoteResponse]);

  return { socket: socketRef.current };
}
