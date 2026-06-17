'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'

export default function PollCard({ poll }: { poll: any }) {
  const { user } = useUser()
  const vote = useMutation(api.polls.vote)
  const votesByOption = useQuery(api.polls.getVotesByOption, { pollId: poll._id })
  const myVote = useQuery(api.polls.getMyVote, user ? { pollId: poll._id, userId: user.id } : 'skip')

  if (!poll || !poll.options || !Array.isArray(poll.options)) {
    return null
  }

  const totalVotes = poll.totalVotes || 0
  const [voting, setVoting] = useState<string | null>(null)

  const handleVote = async (optionId: string) => {
    if (!user) return
    setVoting(optionId)
    
    if (myVote?.optionId === optionId) {
      await vote({ pollId: poll._id, optionId: null as any })
    } else {
      await vote({ pollId: poll._id, optionId })
    }
    
    setVoting(null)
  }

  useEffect(() => {
    setVoting(null)
  }, [myVote?.optionId])

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 sm:p-4 dark:border-purple-500/20 dark:bg-purple-500/5 w-full">
      <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white mb-2 sm:mb-3">{poll.question}</h4>
      <div className="space-y-1.5 sm:space-y-2">
        {poll.options.map((opt: any) => {
          const optionVotes = votesByOption?.[opt.id] || 0
          const percent = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0
          const isSelected = myVote?.optionId === opt.id
          const isLoading = voting === opt.id

          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={isLoading}
              className={`relative w-full rounded-lg sm:rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-purple-500 bg-purple-100 dark:border-purple-400 dark:bg-purple-500/20'
                  : 'border-gray-200 bg-white hover:border-purple-300 dark:bg-white/5 dark:hover:border-purple-500/30'
              } ${isLoading ? 'opacity-70' : ''}`}
            >
              <div 
                className="absolute inset-0 rounded-lg sm:rounded-xl bg-purple-500/10 dark:bg-purple-500/5 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
              
              <div className="relative flex items-center justify-between gap-2 p-2.5 sm:p-3">
                <div className="flex items-center gap-2 min-w-0">
                  {isSelected && (
                    <svg className="h-4 w-4 flex-shrink-0 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {isLoading && (
                    <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                  )}
                  <span className={`text-[11px] sm:text-sm font-semibold truncate ${isSelected ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-white/80'}`}>
                    {opt.text}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-[10px] sm:text-xs font-semibold text-gray-500">
                    {percent}%
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] sm:text-[11px] text-gray-400">{totalVotes} votes</p>
    </div>
  )
}