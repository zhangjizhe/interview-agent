import { memo } from 'react';
import { Bot, User as UserIcon } from 'lucide-react';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export const ChatBubble = memo(function ChatBubble({
  role,
  content,
  streaming,
}: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-2 md:gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-blue-600' : 'bg-gradient-to-br from-violet-500 to-purple-600'
        }`}
      >
        {isUser ? (
          <UserIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
        ) : (
          <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
        )}
      </div>
      <div
        className={`rounded-2xl px-3 py-2 md:px-4 md:py-3 text-sm md:text-base break-words whitespace-pre-wrap max-w-[85%] md:max-w-[70%] ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white border border-slate-200 text-slate-900'
        }`}
      >
        {content || (streaming ? '' : '')}
        {streaming && (
          <span className="inline-block w-1.5 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
});
