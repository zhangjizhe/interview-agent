import { memo } from 'react';
import { Bot, User as UserIcon } from 'lucide-react';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export const ChatBubble = memo(function ChatBubble({ role, content, streaming }: ChatBubbleProps) {
  return (
    <div className={`flex gap-2 md:gap-3 ${role === 'user' ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center ${
          role === 'user'
            ? 'bg-blue-600'
            : 'bg-gradient-to-br from-violet-500 to-purple-600'
        }`}
      >
        {role === 'user' ? (
          <UserIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
        ) : (
          <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
        )}
      </div>
      <div
        className={`rounded-2xl px-3 py-2 md:px-4 md:py-3 text-sm md:text-base ${
          role === 'user'
            ? 'bg-blue-600 text-white max-w-[78%] md:max-w-[70%]'
            : 'bg-white border border-slate-200 text-slate-900 max-w-[85%] md:max-w-[70%]'
        }`}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">
          {content || (streaming ? '...' : '')}
          {streaming && (
            <span className="inline-block w-1.5 h-4 bg-blue-500 ml-0.5 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
});
