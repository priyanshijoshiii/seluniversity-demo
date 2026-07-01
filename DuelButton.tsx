// components/DuelButton.tsx
'use client'

import { useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'
import { Swords } from 'lucide-react'
import { useCallback } from 'react'

interface DuelButtonProps {
  duelId: string
  onAccepted?: () => void
}

export function AcceptDuelButton({ duelId, onAccepted }: DuelButtonProps) {
  const acceptDuel = useMutation(api.shop.acceptDuel)
  const declineDuel = useMutation(api.shop.declineDuel)

  const handleAccept = useCallback(async () => {
    try {
      await acceptDuel({ duelId: duelId as any })
      onAccepted?.()
    } catch (e: any) {
      alert(e.message || 'Failed to accept duel')
    }
  }, [acceptDuel, duelId, onAccepted])

  const handleDecline = useCallback(async () => {
    try {
      await declineDuel({ duelId: duelId as any })
    } catch (e: any) {
      alert(e.message || 'Failed to decline duel')
    }
  }, [declineDuel, duelId])

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleAccept}
        className="rounded-full bg-green-500 px-3 py-1 text-[10px] font-bold text-white hover:bg-green-600 transition-all"
      >
        Accept
      </button>
      <button
        onClick={handleDecline}
        className="rounded-full bg-gray-200 dark:bg-white/10 px-2 py-1 text-[10px] font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-white/20 transition-all"
      >
        ✕
      </button>
    </div>
  )
}

export function StartDuelButton({ duelId, puzzleSlug }: { duelId: string; puzzleSlug: string }) {
  const startDuel = useMutation(api.shop.startDuel)

  const handleStart = useCallback(async () => {
    try {
      await startDuel({ duelId: duelId as any })
      window.location.href = `/${window.location.pathname.split('/')[1]}/puzzles/${puzzleSlug}?duel=${duelId}`
    } catch (e: any) {
      alert(e.message || 'Failed to start duel')
    }
  }, [startDuel, duelId, puzzleSlug])

  return (
    <button
      onClick={handleStart}
      className="rounded-full bg-red-500 px-3 py-1 text-[10px] font-bold text-white hover:bg-red-600 transition-all animate-pulse flex items-center gap-1"
    >
      <Swords className="h-3 w-3" />
      Start
    </button>
  )
}