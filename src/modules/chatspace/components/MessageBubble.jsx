import React from 'react';
import { CheckCheck, Check } from 'lucide-react';

// Utility function to determine the status icon and color
const getStatusIndicator = (status) => {
    switch (status) {
        case 'read':
            // Green for read status (standard chat app pattern)
            return <CheckCheck className="w-3.5 h-3.5 text-green-400" />;
        case 'delivered':
            // Lighter indigo for delivered (double check)
            return <CheckCheck className="w-3.5 h-3.5 text-indigo-200/90" />;
        case 'sent':
        default:
            return <Check className="w-3.5 h-3.5 text-indigo-200/90" />;
    }
};

export default function MessageBubble({ message, isMe }) {
  // Use a proper timestamp format (assuming message.timestamp is a Date string or similar)
  const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...';

  // Placeholder for message status - assuming these properties exist on the message object
  const messageStatus = isMe ? (message.isRead ? 'read' : message.isDelivered ? 'delivered' : 'sent') : null;
  
  // Padding adjustment for timestamp alignment
  const timePadding = 'pr-14'; // Ensure enough space at the bottom right for the time/status

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        // 💡 CRITICAL CHANGE: Added 'relative' to allow absolute positioning of the time/status.
        // Also added padding ('pr-14' or 'pb-1') to make room for the floating timestamp.
        className={`max-w-[75%] p-3 text-sm shadow-md transition-all relative ${
          isMe
            ? 'bg-indigo-600 text-white rounded-t-xl rounded-bl-xl rounded-br-md' 
            : 'bg-gray-700 text-gray-100 rounded-t-xl rounded-br-xl rounded-bl-md' 
        }`}
      >
        {/* Message Text Container */}
        <p className={`whitespace-pre-wrap break-words ${timePadding} pb-1`}>
            {message.text}
        </p>
        
        {/* 💡 Status and Time Container - Now ABSOLUTELY positioned */}
        <div 
            className={`absolute bottom-1.5 right-2 text-[10px] flex items-center gap-1 ${
                isMe ? 'text-indigo-200' : 'text-gray-400'
            }`}
        >
            <span className="opacity-80 leading-none">{time}</span>
            
            {/* Conditional Status Indicator */}
            {isMe && messageStatus && getStatusIndicator(messageStatus)}
        </div>
      </div>
    </div>
  );
}