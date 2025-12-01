import { useEffect, useMemo, useState } from 'react';

const dummyChatsList = [
  {
    id: '1',
    name: 'Design Squad',
    avatarColor: 'bg-pink-500',
    lastMessage: 'Let’s lock the layout by EOD.',
    timestamp: '2:14 PM',
    unread: 2,
    status: 'online',
  },
  {
    id: '2',
    name: 'WebRTC Core',
    avatarColor: 'bg-emerald-500',
    lastMessage: 'ICE negotiation looks stable now.',
    timestamp: '1:03 PM',
    unread: 0,
    status: 'offline',
  },
  {
    id: '3',
    name: 'VisionDesk Backend',
    avatarColor: 'bg-sky-500',
    lastMessage: 'JWT flow is good to go.',
    timestamp: 'Yesterday',
    unread: 5,
    status: 'online',
  },
];

const baseMessages = {
  '1': [
    { id: 'm1', sender: 'them', text: 'Morning! Ready to finalize the ChatSpace UI?', timestamp: '2:01 PM' },
    { id: 'm2', sender: 'me', text: 'Yep, just adding the input bar interactions.', timestamp: '2:05 PM' },
  ],
  '2': [
    { id: 'm3', sender: 'them', text: 'Turned on simulcast, quality looks great.', timestamp: '12:44 PM' },
  ],
  '3': [
    { id: 'm4', sender: 'them', text: 'Access tokens wired with Socket.IO namespace.', timestamp: 'Yesterday' },
  ],
};

export function useChatData() {
  const [activeChatId, setActiveChatId] = useState('1');
  const [messagesByChat, setMessagesByChat] = useState(baseMessages);

  const chats = useMemo(() => dummyChatsList, []);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? chats[0],
    [chats, activeChatId]
  );

  const messages = useMemo(
    () => (activeChat ? messagesByChat[activeChat.id] ?? [] : []),
    [activeChat, messagesByChat]
  );

  const sendMessage = (text) => {
    if (!text.trim() || !activeChat) return;

    setMessagesByChat((prev) => {
      const existing = prev[activeChat.id] ?? [];
      const newMessage = {
        id: `m-${Date.now()}`,
        sender: 'me',
        text: text.trim(),
        timestamp: 'Now',
      };
      return {
        ...prev,
        [activeChat.id]: [...existing, newMessage],
      };
    });
  };

  // Optional: could auto-select first chat on mount
  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChatId, chats]);

  return {
    chats,
    activeChat,
    activeChatId,
    setActiveChatId,
    messages,
    sendMessage,
  };
}
