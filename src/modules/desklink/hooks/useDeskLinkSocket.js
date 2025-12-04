import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export function useDeskLinkSocket({ token, onRemoteRequest, onRemoteResponse }) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('desklink-remote-request', (payload) => {
      onRemoteRequest?.(payload);
    });

    socket.on('desklink-remote-response', (payload) => {
      onRemoteResponse?.(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, onRemoteRequest, onRemoteResponse]);

  return { socket: socketRef.current };
}


