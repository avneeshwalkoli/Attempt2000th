import React, { useEffect, useRef, useState } from 'react';

export default function MeetingChatPanel({
  messages,
  currentUserId,
  onSendMessage,
  onClose,
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendMessage?.(text);
    setDraft('');
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-900/80 text-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90">
        <div className="text-sm font-semibold">Meeting Chat</div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
        >
          Close
        </button>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-xs bg-slate-950/60"
      >
        {messages && messages.length > 0 ? (
          messages.map((msg, idx) => {
            const isSelf = msg.userId === currentUserId;
            return (
              <div
                key={`${msg.ts || msg.time || idx}-${idx}`}
                className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 shadow text-xs space-y-1 ${
                    isSelf
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-slate-800 text-slate-100 rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[11px]">
                      {isSelf ? 'You' : msg.userName || 'Participant'}
                    </span>
                    {msg.ts && (
                      <span className="text-[10px] opacity-70">
                        {new Date(msg.ts).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center text-slate-500 text-[11px] mt-4">
            No messages yet. Start the conversation!
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-800 bg-slate-900/90 px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message to everyone..."
            className="flex-1 rounded-md bg-slate-800 text-xs px-3 py-2 outline-none border border-slate-700 focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-medium"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
