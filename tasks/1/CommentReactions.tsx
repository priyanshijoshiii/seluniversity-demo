// Файл: components/CommentReactions.tsx
'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { motion, AnimatePresence } from 'framer-motion'
import { SmilePlus } from 'lucide-react'

const COMMON_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥', '💯', '🎉', '👀']

interface CommentReactionsProps {
  reactions: Array<{ emoji: string; count: number; users: string[] }>
  onToggle: (emoji: string) => void
}

export default function CommentReactions({ reactions, onToggle }: CommentReactionsProps) {
  const { user } = useUser()
  const [showPicker, setShowPicker] = useState(false)

  return (
    <div className="flex items-center gap-1 mt-0.5">
     {reactions.map((reaction: any) => (
  <button
    key={reaction.emoji}
    data-reaction-btn 
    onClick={(e) => {
      e.stopPropagation()  
      onToggle(reaction.emoji)
    }}
    className={`inline-flex items-center h-6 rounded-full px-2 text-[12px] transition-all flex-shrink-0 active:scale-95 ${
      user && reaction.users?.includes(user.id)
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 ring-1 ring-blue-300'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
    }`}
  >
    <span>{reaction.emoji}</span>
    <span className="text-[10px] font-bold ml-0.5">{reaction.count}</span>
  </button>
))}
      
      <div className="relative">

        <AnimatePresence>
          {showPicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 5 }}
              className="absolute bottom-full left-0 mb-2 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-white/10 p-2"
            >
              <div className="flex gap-1">
                {COMMON_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { onToggle(emoji); setShowPicker(false) }}
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-base transition-all hover:scale-110"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}