import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';
import InputBar from './InputBar.jsx';

export default function ChatWindow({ activeContact, messages, onSend, currentUser }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeContact?.phone]);

  if (!activeContact) {
    return (
      <section className="flex-1 flex items-center justify-center bg-slate-950/80">
        <p className="text-slate-500 text-sm">Select a chat to get started.</p>
      </section>
    );
  }

  const mePhone = currentUser ? `${currentUser.countryCode} ${currentUser.phoneNumber}` : '';
  const statusLabel = 'Online';
  const statusColor = 'bg-emerald-500';

  return (
    <section className="flex-1 flex flex-col bg-slate-950/80">
      <header className="h-16 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-semibold text-white bg-slate-700"
          >
            {activeContact.fullName
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-100">{activeContact.fullName}</div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />
              <span>{statusLabel}</span>
            </div>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
        {messages.map((msg) => {
          const isMe = msg.senderPhone === mePhone;
          return <MessageBubble key={msg.id || msg._id || msg.timestamp} message={msg} isMe={isMe} />;
        })}
      </div>

      <InputBar onSend={onSend} />
    </section>
  );
}
