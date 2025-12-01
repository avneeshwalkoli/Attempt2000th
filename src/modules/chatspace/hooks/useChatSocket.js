import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export function useChatSocket({ token, onMessage }) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[socket] connected', socket.id);
    });

    socket.on('private-message', (msg) => {
      console.log('[socket] private-message received', msg);
      onMessage?.(msg);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, onMessage]);

  const sendMessage = (toPhone, text) => {
    if (!socketRef.current) return;
    socketRef.current.emit('private-message', { to: toPhone, text });
  };

  return { sendMessage };
}
