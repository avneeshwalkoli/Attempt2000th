import React, { useCallback, useEffect, useState } from 'react';
import SidebarContacts from '../components/SidebarContacts.jsx';
import ChatWindow from '../components/ChatWindow.jsx';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { messagesApi } from '../services/messages.api.js';
import { useChatSocket } from '../hooks/useChatSocket.js';

export default function Messages() {
  const { user, token } = useAuth();
  const [activePhone, setActivePhone] = useState('');
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [contactsRefreshKey, setContactsRefreshKey] = useState(0);

  const handleSocketMessage = useCallback(
    (msg) => {
      const mePhone = `${user.countryCode} ${user.phoneNumber}`;
      const participants = [msg.senderPhone, msg.receiverPhone];
      const involvesMe = participants.includes(mePhone);
      const involvesActive = activePhone ? participants.includes(activePhone) : true;

      if (involvesMe && involvesActive) {
        setMessages((prev) => [...prev, msg]);
        // If current user is receiver, trigger contacts refresh to pull any new unsaved contact
        if (msg.receiverPhone === mePhone) {
          setContactsRefreshKey((v) => v + 1);

          // If no chat is currently open, auto-open this conversation on the receiver side
          if (!activePhone) {
            setActivePhone(msg.senderPhone);
            const [countryCode, ...rest] = msg.senderPhone.split(' ');
            const phoneNumber = rest.join(' ');
            setActiveContact({
              fullName: msg.senderPhone,
              countryCode,
              phoneNumber,
              phone: msg.senderPhone,
            });
          }
        }
      } else {
        // Debug: message not appended due to filter
        // console.log('[chat] message ignored by filter', { msg, mePhone, activePhone });
      }
    },
    [activePhone, user]
  );

  const { sendMessage } = useChatSocket({ token, onMessage: handleSocketMessage });

  useEffect(() => {
    const loadHistory = async () => {
      if (!token || !activePhone) return;
      try {
        const data = await messagesApi.history(token, activePhone);
        setMessages(data.messages || []);
      } catch (err) {
        console.error('Failed to load history', err);
      }
    };
    loadHistory();
  }, [token, activePhone]);

  const handleSelectContact = (phone) => {
    setActivePhone(phone);
    const [countryCode, ...rest] = phone.split(' ');
    const phoneNumber = rest.join(' ');
    setActiveContact({ fullName: phone, countryCode, phoneNumber, phone });
  };

  const handleSend = (text) => {
    if (!activePhone) return;
    sendMessage(activePhone, text);
  };

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-50">
      <SidebarContacts
        activePhone={activePhone}
        onSelectContact={handleSelectContact}
        refreshKey={contactsRefreshKey}
      />
      <main className="flex-1 flex">
        <ChatWindow
          activeContact={activeContact}
          messages={messages}
          onSend={handleSend}
          currentUser={user}
        />
      </main>
    </div>
  );
}
