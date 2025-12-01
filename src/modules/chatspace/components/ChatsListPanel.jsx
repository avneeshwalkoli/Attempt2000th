import React from 'react';

export default function ChatsListPanel({ chats, activeChatId, onSelectChat }) {
  return (
    <section className="w-72 border-r border-slate-800 bg-slate-900/80 flex flex-col">
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="relative">
          <input
            type="text"
            placeholder="Search chats"
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-9 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="absolute left-3 top-2.5 text-slate-500 text-sm">
            🔍
          </span>
        </div>
      </div>

      <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide text-slate-500 flex-shrink-0">
        All Chats
      </div>

      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => {
          const isActive = chat.id === activeChatId;
          return (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors border-l-2 ${
                isActive
                  ? 'bg-slate-800/80 border-indigo-500'
                  : 'border-transparent hover:bg-slate-800/60'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-semibold text-white ${chat.avatarColor}`}
              >
                {chat.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-100 truncate">{chat.name}</span>
                  <span className="text-[11px] text-slate-500 flex-shrink-0">{chat.timestamp}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-slate-400 truncate">{chat.lastMessage}</span>
                  {chat.unread > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] rounded-full bg-indigo-600 text-white flex-shrink-0">
                      {chat.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
