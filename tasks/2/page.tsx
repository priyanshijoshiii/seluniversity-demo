'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'
import { Id } from '@convex/_generated/dataModel'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Swords, Trophy, ArrowLeft, Zap, X, Search, MessageCircle, AlertTriangle, Loader2, Crown, Coins, Send, Check, Clock, ChevronDown, Circle } from 'lucide-react'
import NextLink from 'next/link'

const PUZZLE_OPTIONS = ['tcp-encapsulation', 'tcp-handshake', 'ip-fragmentation', 'arp-spoofing', 'dns-resolution']
const USERS_PER_PAGE = 5
const MAX_RECENT_USERS = 10

const rankColors: Record<string, string> = {
  'Novice': '#9ca3af', 'Apprentice': '#10b981', 'Scholar': '#3b82f6', 'Researcher': '#6366f1',
  'Engineer': '#f59e0b', 'Architect': '#eab308', 'Specialist': '#14b8a6', 'Expert': '#8b5cf6',
  'Master': '#f97316', 'Grandmaster': '#ef4444', 'Sage': '#06b6d4', 'Titan': '#d946ef',
  'Oracle': '#a855f7', 'Wizard': '#7c3aed', 'Phantom': '#1e293b', 'Dragon': '#dc2626',
  'Phoenix': '#ea580c', 'Leviathan': '#0369a1', 'Immortal': '#fbbf24', 'Creator': '#22c55e',
}

const rankIcons: Record<string, string> = {
  'Novice': '🌱', 'Apprentice': '📖', 'Scholar': '🎓', 'Researcher': '🔬',
  'Engineer': '⚙️', 'Architect': '🏗️', 'Specialist': '🎯', 'Expert': '💎',
  'Master': '👑', 'Grandmaster': '🔥', 'Sage': '🧙', 'Titan': '⚡',
  'Oracle': '🔮', 'Wizard': '🪄', 'Phantom': '👻', 'Dragon': '🐉',
  'Phoenix': '🦅', 'Leviathan': '🐋', 'Immortal': '⭐', 'Creator': '🌌',
}

export default function DuelsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const lang = (params?.lang as string) || 'en'
  const isRu = lang === 'ru'
  const { user } = useUser()
  const challengerParam = searchParams.get('challenger')
  const cancelDuelMutation = useMutation(api.duels.cancelDuel)

  // Состояния
  const [showDuelCreator, setShowDuelCreator] = useState(false)
  const [duelWager, setDuelWager] = useState(100)
  const [duelPuzzle, setDuelPuzzle] = useState(PUZZLE_OPTIONS[0])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedOpponent, setSelectedOpponent] = useState<any>(null)
  const [wagerPulse, setWagerPulse] = useState(false)

  // Запросы
  const leaderboard = useQuery(api.users.getLeaderboard, {}) || []
  
  // Поиск пользователей
  const searchedUsers = useQuery(
    api.users.searchUsers, 
    searchQuery ? { query: searchQuery, limit: 50 } : 'skip'
  ) as any[] | undefined

  // Batch-запрос presence для пользователей
  const allUsers = useMemo(() => {
    const users = searchQuery && searchedUsers ? searchedUsers : leaderboard
    return users.slice(0, 50)
  }, [searchQuery, searchedUsers, leaderboard])

  const clerkIds = useMemo(() => {
    return allUsers.map((u: any) => u.clerkId).filter(Boolean).slice(0, 20)
  }, [allUsers])

  const usersPresence = useQuery(
    api.users.getUsersPresence,
    clerkIds.length ? { clerkIds } : 'skip'
  )

  // Обогащаем пользователей presence данными
  const enrichedUsers = useMemo(() => {
    if (!allUsers.length) return []
    
    const presenceMap = new Map<string, { isOnline: boolean; lastSeen: number }>()
    if (usersPresence) {
      for (const p of usersPresence) {
        presenceMap.set(p.clerkId, { isOnline: p.isOnline, lastSeen: p.lastSeen })
      }
    }

    return allUsers.map((u: any) => {
      const presence = u.clerkId ? presenceMap.get(u.clerkId) : null
      return {
        ...u,
        isOnline: presence?.isOnline || false,
        lastSeen: presence?.lastSeen || 0,
        name: u.name || '',
        username: u.username || '',
        avatar: u.avatar || '',
        xp: u.xp || 0,
        badge: u.badge || u.rank || 'Novice',
      }
    }).filter((u: any) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
    })
  }, [allUsers, usersPresence, searchQuery])

  // Пагинация
  const totalPages = Math.ceil(enrichedUsers.length / USERS_PER_PAGE)
  const paginatedUsers = enrichedUsers.slice((page - 1) * USERS_PER_PAGE, page * USERS_PER_PAGE)

  // Дуэли
  const myDuels = useQuery(api.shop.getMyDuels) || []
  const allMyDuels = useQuery(api.shop.getAllMyDuels) || []
  const duelWins = useQuery(api.shop.getDuelWins, user ? { clerkId: user.id } : 'skip') || 0
  const myCoins = useQuery(api.shop.getCoins, user ? { clerkId: user.id } : 'skip') || 0

  // Мутации
  const getOrCreateChat = useMutation(api.privateChat.getOrCreateChat)
  const createDuel = useMutation(api.shop.createDuel)
  const acceptDuel = useMutation(api.shop.acceptDuel)
  const startDuel = useMutation(api.shop.startDuel)
  const declineDuel = useMutation(api.shop.declineDuel)

  // Пульсация призового фонда
  useEffect(() => {
    const interval = setInterval(() => {
      setWagerPulse(prev => !prev)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const { canStart, activeDuelId } = useQuery(
  api.duels.canStartDuel,
  user ? { userId: user.id } : 'skip'
) || { canStart: false, activeDuelId: null }

  // Форматирование времени
  const formatLastSeen = useCallback((timestamp: number) => {
    if (!timestamp) return ''
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (minutes < 1) return isRu ? 'сейчас' : 'now'
    if (minutes < 60) return isRu ? `${minutes}м` : `${minutes}m`
    if (hours < 24) return isRu ? `${hours}ч` : `${hours}h`
    if (days < 7) return isRu ? `${days}д` : `${days}d`
    return isRu ? 'давно' : 'long ago'
  }, [isRu])

  // Переход в чат при клике на аватарку из Recently Active
  const handleQuickChat = useCallback(async (opponent: any) => {
    if (!user || !opponent) return
    try {
      const chatId = await getOrCreateChat({ otherClerkId: opponent.clerkId })
      router.push(`/${lang}/messages/${chatId}`)
    } catch (e: any) {
      setErrorMessage(e.message || (isRu ? 'Не удалось открыть чат' : 'Cannot open chat'))
    }
  }, [user, getOrCreateChat, router, lang, isRu])

  // Открыть создание дуэли
  const handleOpenDuelCreator = useCallback(async (opponent: any) => {
    if (!user) return
    if (opponent.username === user.username) return
    
    setIsCreatingChat(true)
    setErrorMessage(null)
    
    try {
      const chatId = await getOrCreateChat({ otherClerkId: opponent.clerkId })
      ;(opponent as any)._chatId = chatId
      setSelectedOpponent(opponent)
      setShowDuelCreator(true)
    } catch (e: any) {
      setErrorMessage(e.message || (isRu ? 'Не удалось открыть чат' : 'Cannot open chat'))
    } finally {
      setIsCreatingChat(false)
    }
  }, [user, getOrCreateChat, isRu])

  // Создать дуэль
  const handleCreateDuel = useCallback(async () => {
    if (!user || !selectedOpponent) return
    
    if (duelWager < 100) {
      setErrorMessage(isRu ? 'Минимальная ставка 100 монет' : 'Minimum wager 100 coins')
      return
    }
    if (duelWager > myCoins) {
      setErrorMessage(isRu ? 'Недостаточно монет' : 'Not enough coins')
      return
    }
    
    try {
      await createDuel({
        chatId: (selectedOpponent as any)._chatId,
        chatType: 'private',
        opponentUsername: selectedOpponent.username,
        wager: duelWager,
        puzzleSlug: duelPuzzle,
      })
      setShowDuelCreator(false)
      setSelectedOpponent(null)
    } catch (e: any) {
      setErrorMessage(e.message || (isRu ? 'Ошибка создания дуэли' : 'Failed to create duel'))
    }
  }, [user, selectedOpponent, duelWager, duelPuzzle, myCoins, createDuel, isRu])

  // Принять дуэль
  const handleAcceptDuel = useCallback(async (duelId: string) => {
    try {
      await acceptDuel({ duelId: duelId as any })
    } catch (e: any) {
      alert(e.message || 'Failed')
    }
  }, [acceptDuel])

  // Начать дуэль
  const handleStartDuel = useCallback(async (duelId: string, puzzleSlug: string) => {
    try {
      await startDuel({ duelId: duelId as any })
      router.push(`/${lang}/puzzles/${puzzleSlug}?duel=${duelId}`)
    } catch (e: any) {
      alert(e.message || 'Failed')
    }
  }, [startDuel, router, lang])

  // Отклонить дуэль
  const handleDeclineDuel = useCallback(async (duelId: string) => {
    try {
      await declineDuel({ duelId: duelId as any })
    } catch (e: any) {
      alert(e.message || 'Failed')
    }
  }, [declineDuel])

  // Онлайн пользователи для Recently Active — МАКСИМУМ 10
  const onlineUsers = useMemo(() => {
    return enrichedUsers
      .filter((u: any) => u.lastSeen > 0)
      .sort((a: any, b: any) => {
        if (a.isOnline && !b.isOnline) return -1
        if (!a.isOnline && b.isOnline) return 1
        return (b.lastSeen || 0) - (a.lastSeen || 0)
      })
      .slice(0, MAX_RECENT_USERS) // ← Ограничение до 10
  }, [enrichedUsers])

  // Топ-3 дуэлянта для подиума
  const topDuelists = useMemo(() => {
    return leaderboard.slice(0, 3)
  }, [leaderboard])

  // Фильтруем дуэли
  const pendingForOpponent = allMyDuels.filter((d: any) => d.status === 'pending' && d.opponentId === user?.id)
  const pendingFromInitiator = allMyDuels.filter((d: any) => d.status === 'pending' && d.initiatorId === user?.id)
  const acceptedDuels = allMyDuels.filter((d: any) => d.status === 'accepted')

  return (
    <div className="min-h-screen bg-white sm:pt-5 dark:bg-[#0d0d0d]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <NextLink prefetch={false} href={`/${lang}?tab=community`} className="p-2 -ml-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </NextLink>
          <div>
            <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              ⚔️ {isRu ? 'Дуэли' : 'Duels'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-white/40">
              {isRu ? 'Вызывай соперников и зарабатывай монеты' : 'Challenge opponents and earn coins'}
            </p>
          </div>
        </div>

        {/* Статистика */}
        {user && (
          <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl sm:rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-3 sm:p-4 text-center">
              <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-500 mx-auto mb-1" />
              <p className="text-lg sm:text-2xl font-extrabold text-gray-900 dark:text-white">{duelWins}</p>
              <p className="text-[9px] sm:text-[10px] text-gray-400">{isRu ? 'Побед' : 'Wins'}</p>
            </div>
            <div className="rounded-xl sm:rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-3 sm:p-4 text-center">
              <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500 mx-auto mb-1" />
              <p className="text-lg sm:text-2xl font-extrabold text-gray-900 dark:text-white">{myCoins}</p>
              <p className="text-[9px] sm:text-[10px] text-gray-400">{isRu ? 'Монет' : 'Coins'}</p>
            </div>
            <div className="rounded-xl sm:rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-3 sm:p-4 text-center">
              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 mx-auto mb-1" />
              <p className="text-lg sm:text-2xl font-extrabold text-gray-900 dark:text-white">{pendingForOpponent.length + pendingFromInitiator.length}</p>
              <p className="text-[9px] sm:text-[10px] text-gray-400">{isRu ? 'Ожидают' : 'Pending'}</p>
            </div>
          </div>
        )}

        {/* Топ-3 дуэлянтов — подиум с кнопками дуэли */}
        {topDuelists.length >= 3 && !showDuelCreator && (
          <div className="mt-4 mb-6">
            <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Crown className="h-4 w-4 text-yellow-500" />
              {isRu ? 'Топ дуэлянтов' : 'Top duelists'}
            </h2>
            
            {/* Подиум */}
            <div className="flex items-end justify-center gap-2 sm:gap-4 h-52 sm:h-60">
              {/* 2 место */}
              <div className="flex flex-col items-center">
                <NextLink prefetch={false} href={`/${lang}/profile/${topDuelists[1].username}`}>
                  <img src={topDuelists[1].avatar || ''} alt={topDuelists[1].name}
                    className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-cover border-2 border-gray-300 shadow-md mb-1 hover:scale-105 transition-transform" />
                </NextLink>
                <p className="text-[10px] font-semibold text-gray-900 dark:text-white truncate max-w-[70px] text-center">{topDuelists[1].name}</p>
                <p className="text-[9px] text-gray-400">{topDuelists[1].xp} XP</p>
          <button 
  onClick={() => handleOpenDuelCreator(topDuelists[1])}
  disabled={!canStart || isCreatingChat}
  className="mt-1 rounded-full bg-gradient-to-r from-gray-400 to-gray-500 px-2.5 py-1 text-[9px] font-bold text-white hover:from-gray-500 hover:to-gray-600 transition-all shadow-md flex items-center gap-1"
>
  <Swords className="h-3 w-3" />
  {isRu ? 'Бой' : 'Fight'}
</button>
                <div className="mt-1 w-16 sm:w-20 h-14 sm:h-16 rounded-t-xl bg-gradient-to-b from-gray-300 to-gray-200 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-2xl">🥈</div>
              </div>

              {/* 1 место */}
              <div className="flex flex-col items-center -mt-6">
                <div className="relative">
                  <NextLink prefetch={false} href={`/${lang}/profile/${topDuelists[0].username}`}>
                    <img src={topDuelists[0].avatar || ''} alt={topDuelists[0].name}
                      className="h-14 w-14 sm:h-16 sm:w-16 rounded-full object-cover border-2 border-yellow-400 shadow-lg mb-1 ring-2 ring-yellow-400/50 hover:scale-105 transition-transform" />
                  </NextLink>
                  <Crown className="absolute -top-3 -right-3 h-5 w-5 text-yellow-500 drop-shadow-lg" />
                </div>
                <p className="text-[10px] font-bold text-gray-900 dark:text-white truncate max-w-[70px] text-center">{topDuelists[0].name}</p>
                <p className="text-[9px] text-gray-400">{topDuelists[0].xp} XP</p>
                <button
                  onClick={() => handleOpenDuelCreator(topDuelists[0])}
                  className="mt-1 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 px-3 py-1.5 text-[10px] font-bold text-white hover:from-yellow-500 hover:to-amber-600 transition-all shadow-lg shadow-yellow-500/30 animate-pulse"
                >
                  ⚔️ {isRu ? 'Бой' : 'Fight'}
                </button>
                <div className="mt-1 w-16 sm:w-20 h-20 sm:h-24 rounded-t-xl bg-gradient-to-b from-yellow-400 to-amber-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center text-3xl shadow-lg">🥇</div>
              </div>

              {/* 3 место */}
              <div className="flex flex-col items-center">
                <NextLink prefetch={false} href={`/${lang}/profile/${topDuelists[2].username}`}>
                  <img src={topDuelists[2].avatar || ''} alt={topDuelists[2].name}
                    className="h-10 w-10 sm:h-12 sm:w-12 rounded-full object-cover border-2 border-orange-300 shadow-md mb-1 hover:scale-105 transition-transform" />
                </NextLink>
                <p className="text-[10px] font-semibold text-gray-900 dark:text-white truncate max-w-[70px] text-center">{topDuelists[2].name}</p>
                <p className="text-[9px] text-gray-400">{topDuelists[2].xp} XP</p>
                <button
                  onClick={() => handleOpenDuelCreator(topDuelists[2])}
                  className="mt-1 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 px-2.5 py-1 text-[9px] font-bold text-white hover:from-orange-500 hover:to-orange-600 transition-all shadow-md"
                >
                  ⚔️ {isRu ? 'Бой' : 'Fight'}
                </button>
                <div className="mt-1 w-16 sm:w-20 h-10 sm:h-12 rounded-t-xl bg-gradient-to-b from-orange-400 to-orange-300 dark:from-orange-600 dark:to-orange-700 flex items-center justify-center text-2xl">🥉</div>
              </div>
            </div>
          </div>
        )}

 {activeDuelId && (
  <button
    onClick={() => cancelDuelMutation({ duelId: activeDuelId, userId: user?.id || '' })}
    className="mt-2 text-xs text-red-500 hover:text-red-700"
  >
    {isRu ? 'Отменить текущую дуэль' : 'Cancel current duel'}
  </button>
)}

        {/* Recently Active — МАКСИМУМ 10 ЮЗЕРОВ */}
        {onlineUsers.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="rounded-lg bg-green-100 dark:bg-green-500/10 p-1">
                <Zap className="h-3.5 w-3.5 text-green-500" />
              </div>
              <h2 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                {isRu ? 'Недавно активны' : 'Recently Active'}
              </h2>
              <span className="text-[10px] text-green-500 font-semibold">
                {onlineUsers.filter((u: any) => u.isOnline).length} {isRu ? 'онлайн' : 'online'}
              </span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {onlineUsers.slice(0, MAX_RECENT_USERS).map((recentUser: any) => (
                <button
                  key={recentUser.username}
                  onClick={() => handleQuickChat(recentUser)}
                  className="flex-shrink-0 flex flex-col items-center gap-1 group"
                >
                  <div className="relative">
                    <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full p-[2px] ${
                      recentUser.isOnline 
                        ? 'bg-gradient-to-tr from-green-400 to-emerald-500 shadow-lg shadow-green-500/20' 
                        : 'bg-gray-200 dark:bg-white/10'
                    }`}>
                      <div className="h-full w-full rounded-full bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden ring-2 ring-white dark:ring-gray-800">
                        {recentUser.avatar ? (
                          <img src={recentUser.avatar} alt={recentUser.name} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="text-base font-bold text-gray-400">{recentUser.name?.charAt(0)?.toUpperCase() || '?'}</span>
                        )}
                      </div>
                    </div>
                    {recentUser.isOnline && (
                      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-green-500 border-[3px] border-white dark:border-gray-800 shadow-sm" />
                    )}
                  </div>
                  <span className="text-[10px] text-gray-600 dark:text-gray-400 max-w-[56px] truncate text-center font-medium">{recentUser.name}</span>
                  <span className="text-[9px] text-gray-400 -mt-1">
                    {recentUser.isOnline ? (isRu ? 'в сети' : 'online') : formatLastSeen(recentUser.lastSeen)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Сообщение об ошибке */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="mb-4 rounded-xl sm:rounded-2xl border-2 border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5 p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="text-sm font-bold text-red-700 dark:text-red-400">{isRu ? 'Ошибка' : 'Error'}</h3>
              </div>
              <p className="text-xs text-red-600 dark:text-red-300 mb-3">{errorMessage}</p>
              <button onClick={() => setErrorMessage(null)} className="rounded-full bg-red-200 dark:bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400">OK</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Создание дуэли */}
        <AnimatePresence>
          {showDuelCreator && selectedOpponent && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="mb-6 rounded-xl sm:rounded-2xl border-2 border-purple-200 bg-purple-50 dark:border-purple-500/20 dark:bg-purple-500/5 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Swords className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
                  {isRu ? 'Вызов на дуэль' : 'Challenge to duel'}
                </h3>
                <button onClick={() => { setShowDuelCreator(false); setSelectedOpponent(null) }} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>

              <div className="flex items-center gap-3 mb-3 p-2.5 sm:p-3 rounded-xl bg-white dark:bg-white/5">
                <img src={selectedOpponent.avatar || ''} alt={selectedOpponent.name} className="h-8 w-8 sm:h-10 sm:w-10 rounded-full object-cover" />
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{selectedOpponent.name}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400">@{selectedOpponent.username}</p>
                </div>
              </div>

              {/* Ставка */}
              <div className="mb-3">
                <label className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                  {isRu ? 'Ставка (монет)' : 'Wager (coins)'}
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="number" value={duelWager} onChange={(e) => setDuelWager(Math.max(100, Math.min(5000, Number(e.target.value))))}
                    className="flex-1 min-w-[100px] rounded-xl border border-gray-200 bg-white px-3 sm:px-4 py-2 sm:py-2.5 text-sm focus:outline-none focus:border-purple-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    min={100} max={5000} step={100} />
                  <span className="text-xs sm:text-sm text-gray-400 flex items-center gap-1 whitespace-nowrap">
                    <Coins className="h-3.5 w-3.5 sm:h-4 sm:w-4" />{isRu ? 'доступно' : 'avail'}: {myCoins}
                  </span>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[100, 500, 1000, 2000].map(amount => (
                    <button key={amount} onClick={() => setDuelWager(amount)}
                      className={`rounded-lg px-3 py-1 text-[10px] sm:text-xs font-semibold transition-all ${
                        duelWager === amount ? 'bg-purple-500 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-purple-300 dark:bg-white/5 dark:border-white/10'
                      }`}>{amount}</button>
                  ))}
                </div>
              </div>

              {/* Пазл */}
              <div className="mb-3">
                <label className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">{isRu ? 'Пазл' : 'Puzzle'}</label>
                <div className="flex flex-wrap gap-1.5">
                  {PUZZLE_OPTIONS.map(puzzle => (
                    <button key={puzzle} onClick={() => setDuelPuzzle(puzzle)}
                      className={`rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold transition-all ${
                        duelPuzzle === puzzle ? 'bg-purple-500 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-purple-300 dark:bg-white/5 dark:border-white/10'
                      }`}>{puzzle.replace(/-/g, ' ')}</button>
                  ))}
                </div>
              </div>

              {/* Призовой фонд с пульсацией */}
              <div className="mb-3 p-2.5 sm:p-3 rounded-xl bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/10">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  🏆 {isRu ? 'Призовой фонд' : 'Prize pool'}:{' '}
                  <motion.span
                    className="font-bold inline-block"
                    animate={wagerPulse ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                    transition={{ duration: 0.6, ease: 'easeInOut' }}
                  >
                    {duelWager * 2} coins
                  </motion.span>
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-300 mt-0.5">
                  {isRu ? 'Победитель получает всё!' : 'Winner takes all!'}
                </p>
              </div>

              <button onClick={handleCreateDuel} disabled={duelWager < 100 || duelWager > myCoins}
                className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 sm:py-3 text-sm font-bold text-white hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2">
                <Send className="h-4 w-4" />{isRu ? 'Отправить вызов' : 'Send challenge'}
              </button>

              {selectedOpponent._chatId && (
                <button onClick={() => router.push(`/${lang}/messages/${selectedOpponent._chatId}`)}
                  className="w-full mt-2 rounded-xl border border-gray-200 dark:border-white/10 px-4 py-2 sm:py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2">
                  <MessageCircle className="h-3.5 w-3.5" />{isRu ? 'Открыть чат' : 'Open chat'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pending дуэли */}
        {pendingForOpponent.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              {isRu ? 'Ожидают принятия' : 'Pending acceptance'}
            </h2>
            <div className="space-y-2">
              {pendingForOpponent.map((duel: any) => (
                <div key={duel._id} className="rounded-xl border-2 border-yellow-200 bg-yellow-50 dark:border-yellow-500/20 dark:bg-yellow-500/5 p-3 sm:p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-500/10 flex items-center justify-center flex-shrink-0"><Swords className="h-5 w-5 text-yellow-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{isRu ? 'Дуэль на' : 'Duel for'} {duel.prize || duel.wager * 2} coins</p>
                      <p className="text-[10px] sm:text-xs text-gray-400">{duel.puzzleSlug?.replace(/-/g, ' ')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleAcceptDuel(duel._id)} className="rounded-full bg-green-500 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold text-white hover:bg-green-600 transition-all">{isRu ? 'Принять' : 'Accept'}</button>
                      <button onClick={() => handleDeclineDuel(duel._id)} className="rounded-full bg-gray-200 dark:bg-white/10 px-3 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400">{isRu ? '✕' : '✕'}</button>
                    </div>
                  </div>
                  <button onClick={() => router.push(`/${lang}/messages/${duel.chatId}`)} className="mt-2 w-full text-center text-[10px] text-gray-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1">
                    <MessageCircle className="h-3 w-3" />{isRu ? 'Открыть чат' : 'Open chat'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ожидание ответа */}
        {pendingFromInitiator.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              {isRu ? 'Ожидают ответа' : 'Waiting for response'}
            </h2>
            <div className="space-y-2">
              {pendingFromInitiator.map((duel: any) => (
                <div key={duel._id} className="rounded-xl border-2 border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/5 p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0"><Clock className="h-5 w-5 text-blue-500" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{isRu ? 'Дуэль на' : 'Duel for'} {duel.prize || duel.wager * 2} coins</p>
                      <p className="text-[10px] sm:text-xs text-gray-400">{duel.puzzleSlug?.replace(/-/g, ' ')}</p>
                    </div>
                    <span className="text-[10px] text-gray-400">{isRu ? 'Ждём...' : 'Waiting...'}</span>
                  </div>
                  <button onClick={() => router.push(`/${lang}/messages/${duel.chatId}`)} className="mt-2 w-full text-center text-[10px] text-gray-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1">
                    <MessageCircle className="h-3 w-3" />{isRu ? 'Открыть чат' : 'Open chat'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Готовы к началу */}
        {acceptedDuels.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              {isRu ? 'Готовы к началу' : 'Ready to start'}
            </h2>
            <div className="space-y-2">
              {acceptedDuels.map((duel: any) => (
                <div key={duel._id} className="rounded-xl border-2 border-green-200 bg-green-50 dark:border-green-500/20 dark:bg-green-500/5 p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center flex-shrink-0"><Swords className="h-5 w-5 text-green-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{isRu ? 'Дуэль на' : 'Duel for'} {duel.prize || duel.wager * 2} coins</p>
                      <p className="text-[10px] sm:text-xs text-gray-400">{duel.puzzleSlug?.replace(/-/g, ' ')}</p>
                    </div>
                    {duel.initiatorId === user?.id ? (
                      <button onClick={() => handleStartDuel(duel._id, duel.puzzleSlug)} className="rounded-full bg-red-500 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold text-white hover:bg-red-600 transition-all animate-pulse">{isRu ? '⚔️ Начать!' : '⚔️ Start!'}</button>
                    ) : (
                      <span className="text-[10px] text-amber-500 font-bold">{isRu ? 'Ожидание...' : 'Waiting...'}</span>
                    )}
                  </div>
                  <button onClick={() => router.push(`/${lang}/messages/${duel.chatId}`)} className="mt-2 w-full text-center text-[10px] text-gray-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1">
                    <MessageCircle className="h-3 w-3" />{isRu ? 'Открыть чат' : 'Open chat'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Поиск + список противников */}
        {!showDuelCreator && (
          <div>
            <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              {isRu ? 'Выбери противника' : 'Choose your opponent'}
            </h2>

            {/* Поиск */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input 
                type="text" 
                value={searchQuery} 
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                placeholder={isRu ? 'Поиск по имени или username...' : 'Search by name or username...'}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-purple-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/20"
              />
            </div>

            {/* Список с пагинацией */}
            <div className="space-y-2">
              {paginatedUsers.length > 0 ? (
                paginatedUsers.map((player: any) => {
                  const isCurrentUser = user && player.username === user.username
                  if (isCurrentUser) return null
                  
                  return (
                    <motion.div 
                      key={player.username} 
                      initial={{ opacity: 0, y: 5 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-3 hover:border-gray-300 dark:hover:border-white/20 transition-all"
                    >
                      {/* Верхняя строка: аватар + имя + кнопки */}
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <img 
                            src={player.avatar || ''} 
                            alt={player.name} 
                            className="h-11 w-11 rounded-full object-cover"
                            style={{ borderColor: rankColors[player.badge] || '#9ca3af', borderWidth: 2 }} 
                          />
                          {player.isOnline && (
                            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-white dark:border-gray-900" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-[13px] sm:text-sm text-gray-900 dark:text-white truncate">
                            {player.name}
                          </h3>
                          <p className="text-[11px] text-gray-400 truncate">
                            @{player.username}
                          </p>
                        </div>

                        {/* Кнопки действий */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button 
                            onClick={() => handleQuickChat(player)}
                            className="rounded-full bg-gray-100 dark:bg-white/5 p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all"
                            title={isRu ? 'Написать' : 'Message'}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleOpenDuelCreator(player)}
                            className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1.5 text-[11px] font-bold text-white hover:from-purple-600 hover:to-pink-600 transition-all shadow-md shadow-purple-500/20 flex items-center gap-1"
                          >
                            <Swords className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{isRu ? 'Дуэль' : 'Duel'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Нижняя строка: XP + ранг + статус */}
                      <div className="flex items-center gap-2 mt-2 text-[11px] sm:text-xs">
                        <span className="font-bold text-gray-900 dark:text-white">{player.xp} XP</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-400">{rankIcons[player.badge]} {player.badge}</span>
                        {player.isOnline ? (
                          <span className="text-green-500 font-medium flex items-center gap-1 ml-auto">
                            <Circle className="h-1.5 w-1.5 fill-current" />
                            {isRu ? 'онлайн' : 'online'}
                          </span>
                        ) : player.lastSeen ? (
                          <span className="text-gray-400 ml-auto">{formatLastSeen(player.lastSeen)}</span>
                        ) : null}
                      </div>
                    </motion.div>
                  )
                })
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-400">{isRu ? 'Никого не найдено' : 'No users found'}</p>
                </div>
              )}
            </div>

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-1.5">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))} 
                  disabled={page === 1}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                >
                  <ChevronDown className="h-4 w-4 rotate-90" />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (page <= 3) {
                    pageNum = i + 1
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = page - 2 + i
                  }
                  return (
                    <button 
                      key={pageNum} 
                      onClick={() => setPage(pageNum)}
                      className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all ${
                        page === pageNum 
                          ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' 
                          : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
                {totalPages > 5 && page < totalPages - 2 && (
                  <span className="text-gray-400 text-xs">...</span>
                )}
                <button 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                  disabled={page === totalPages}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                >
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}