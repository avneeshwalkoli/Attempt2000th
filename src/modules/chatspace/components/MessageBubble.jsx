import React from 'react';

export default function MessageBubble({ message, isMe }) {
  return (
    <div className={`flex mb-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs md:max-w-md lg:max-w-xl px-3 py-2 rounded-2xl text-sm shadow-sm ${
          isMe
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-slate-800 text-slate-50 rounded-bl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <div className="mt-1 text-[10px] text-slate-300/80 text-right">{message.timestamp}</div>
      </div>
    </div>
  );
}
