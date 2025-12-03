import React from 'react';
import { Search, MessageSquare, CircleUser } from 'lucide-react'; // Added Icons

// NOTE: This component is currently unused in the Messages.jsx file, 
// but is improved here for a professional look if you intend to use it.
export default function ChatsListPanel({ chats, activeChatId, onSelectChat }) {
  // Use dummy data if 'chats' prop is not provided, since the file structure doesn't 
  // currently show where 'chats' is sourced from, only 'contacts'
  const dummyChats = [
    { id: '1', name: 'Product Team Chat', lastMessage: 'Review the latest sprint docs', timestamp: '10:45 AM', unread: 2, avatarColor: 'bg-green-600' },
    { id: '2', name: 'Sarah Connor', lastMessage: 'Got it, sending the report shortly.', timestamp: '9:30 AM', unread: 0, avatarColor: 'bg-pink-600' },
    { id: '3', name: 'Marketing & Sales', lastMessage: 'Finalizing campaign budget.', timestamp: 'Yesterday', unread: 5, avatarColor: 'bg-red-600' },
  ];
  const listToRender = chats && chats.length > 0 ? chats : dummyChats;

  return (
    <section className="w-80 border-r border-gray-700 bg-gray-800 flex flex-col shrink-0 transition-colors duration-300">
      
      {/* Search Bar */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search chats"
            className="w-full bg-gray-700/80 border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="px-4 pt-3 pb-2 text-xs uppercase tracking-widest font-semibold text-gray-500 flex-shrink-0">
        All Chats
      </div>

      <div className="flex-1 overflow-y-auto">
        {listToRender.map((chat) => {
          const isActive = chat.id === activeChatId;
          return (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-4 ${
                isActive
                  ? 'bg-gray-700 border-indigo-500'
                  : 'border-transparent hover:bg-gray-700/60'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold text-white ${chat.avatarColor || 'bg-indigo-600'}`}
              >
                {/* Use proper initials logic or an icon */}
                {chat.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white truncate">{chat.name}</span>
                  <span className="text-[11px] text-gray-500 flex-shrink-0">{chat.timestamp}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-sm text-gray-400 truncate">{chat.lastMessage}</span>
                  {chat.unread > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] rounded-full bg-indigo-600 text-white font-bold flex-shrink-0">
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