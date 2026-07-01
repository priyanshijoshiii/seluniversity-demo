'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Award, Code2, Trophy, MessageCircle, Newspaper, ChevronLeft, ChevronRight, PenLine, X, TrendingUp, Clock, Eye, SlidersHorizontal, Swords, Zap, Circle, Crown, Flame, Sparkles, Gift, Lock, Star, Gem, Shield, Target, Rocket } from 'lucide-react'
import NextLink from 'next/link'
import dynamic from 'next/dynamic'
import GroupChats from '@/components/GroupChats'
import BattlePass from '@/components/BattlePass'
import { getTranslations } from '@/lib/i18n'
import { useParams } from 'next/navigation'
import CooldownModal from '../PostCooldownModal'
import { useDebounce } from 'use-debounce'

const PostComposer = dynamic(() => import('@/components/PostComposer').then(m => ({ default: m.PostComposer })), { ssr: false })
const PostCard = dynamic(() => import('@/components/PostComposer').then(m => ({ default: m.PostCard })), { ssr: false })

const USERS_PER_PAGE = 10

// ========== LEADERBOARD CACHE (24 часа) ==========
const LEADERBOARD_CACHE_KEY = 'leaderboard_cache'
const LEADERBOARD_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 часа

interface LeaderboardCache {
  data: LeaderboardUser[]
  timestamp: number
}

function getCachedLeaderboard(): LeaderboardCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LEADERBOARD_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as LeaderboardCache
    if (Date.now() - cache.timestamp > LEADERBOARD_CACHE_TTL) {
      localStorage.removeItem(LEADERBOARD_CACHE_KEY)
      return null
    }
    return cache
  } catch {
    localStorage.removeItem(LEADERBOARD_CACHE_KEY)
    return null
  }
}

function setCachedLeaderboard(data: LeaderboardUser[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }))
  } catch {
    // localStorage переполнен — игнорируем
  }
}

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

const RANK_NAMES = ['Novice', 'Apprentice', 'Scholar', 'Researcher', 'Engineer', 'Architect', 'Specialist', 'Expert', 'Master', 'Grandmaster', 'Sage', 'Titan', 'Oracle', 'Wizard', 'Phantom', 'Dragon', 'Phoenix', 'Leviathan', 'Immortal', 'Creator']

const RANK_XP_GAPS: Record<string, number> = {
  'Novice': 100, 'Apprentice': 150, 'Scholar': 250, 'Researcher': 500,
  'Engineer': 750, 'Architect': 1050, 'Specialist': 1400, 'Expert': 1800,
  'Master': 2200, 'Grandmaster': 2800, 'Sage': 3500, 'Titan': 4200,
  'Oracle': 5000, 'Wizard': 5800, 'Phantom': 6700, 'Dragon': 7700,
  'Phoenix': 8800, 'Leviathan': 10000, 'Immortal': 11300, 'Creator': 0,
}

const rankThresholds = (() => {
  const thresholds: Record<string, number> = { 'Novice': 0 }
  let cumulative = 0
  for (let i = 1; i < RANK_NAMES.length; i++) {
    cumulative += RANK_XP_GAPS[RANK_NAMES[i - 1]] || 100
    thresholds[RANK_NAMES[i]] = cumulative
  }
  return thresholds
})()

const nextRankNames: Record<string, string> = {}
for (let i = 0; i < RANK_NAMES.length - 1; i++) {
  nextRankNames[RANK_NAMES[i]] = RANK_NAMES[i + 1]
}
nextRankNames['Creator'] = 'Creator'

type FeedSort = 'trending' | 'latest' | 'popular'
type FeedMode = 'for_you' | 'following'
type LangFilter = 'all' | 'en' | 'ru'
type PostTypeFilter = 'all' | 'general' | 'question' | 'achievement' | 'tutorial'

interface LeaderboardUser {
  name: string
  username: string
  avatar: string
  xp: number
  rank: string
  totalModules?: number
  completedModules?: number
  bio?: string
  lastSeen?: number
  isOnline?: boolean
  clerkId?: string
}

function normalizeUser(raw: any): LeaderboardUser {
  return {
    name: String(raw.name || ''),
    username: String(raw.username || ''),
    avatar: String(raw.avatar || ''),
    xp: Number(raw.xp || 0),
    rank: typeof raw.rank === 'number' ? RANK_NAMES[raw.rank] || 'Novice' : String(raw.badge || raw.rank || 'Novice'),
    totalModules: raw.totalModules != null ? Number(raw.totalModules) : undefined,
    completedModules: raw.completedModules != null ? Number(raw.completedModules) : undefined,
    bio: raw.bio ? String(raw.bio) : undefined,
    lastSeen: raw.lastSeen != null ? Number(raw.lastSeen) : undefined,
    isOnline: undefined,
    clerkId: raw.clerkId ? String(raw.clerkId) : undefined,
  }
}

export default function UsersContent() {
  const params = useParams()
  const lang = (params?.lang as string) || 'en'
  const isRu = lang === 'ru'
  const t = getTranslations(lang)
  const { user } = useUser()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch] = useDebounce(searchQuery, 800)
  const [sortBy, setSortBy] = useState<'xp' | 'modules' | 'name'>('xp')
  
  const [tab, setTab] = useState<'users' | 'feed'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('arena_tab')
      return (saved === 'users' || saved === 'feed') ? saved : 'feed'
    }
    return 'feed'
  })

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('arena_tab', tab)
  }, [tab])

  const [page, setPage] = useState(1)
  const [showComposer, setShowComposer] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [postCooldownSeconds, setPostCooldownSeconds] = useState(0)
  const [showPostCooldownModal, setShowPostCooldownModal] = useState(false)
  const [feedSort, setFeedSort] = useState<FeedSort>('trending')
  const [feedMode, setFeedMode] = useState<FeedMode>('for_you')
  const [langFilter, setLangFilter] = useState<LangFilter>('all')
  const [postTypeFilter, setPostTypeFilter] = useState<PostTypeFilter>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [showChallengePanel, setShowChallengePanel] = useState(false)
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ========== LEADERBOARD WITH CACHE ==========
  const [cachedLeaderboard, setCachedLeaderboardState] = useState<LeaderboardUser[]>(() => {
    const cached = getCachedLeaderboard()
    return cached?.data || []
  })

  const leaderboardRaw = useQuery(api.users.getLeaderboard, tab === 'users' ? { limit: 50 } : 'skip')
  
  const leaderboard: LeaderboardUser[] = useMemo(() => {
    if (leaderboardRaw && leaderboardRaw.length > 0) {
      const fresh = leaderboardRaw.map(normalizeUser)
      setCachedLeaderboard(fresh)
      return fresh
    }
    return cachedLeaderboard
  }, [leaderboardRaw, cachedLeaderboard])
  
  const searchedUsersRaw = useQuery(api.users.searchUsers, (tab === 'users' && debouncedSearch) ? { query: debouncedSearch, limit: 100 } : 'skip')
  const searchedUsers: LeaderboardUser[] = useMemo(() => searchedUsersRaw ? searchedUsersRaw.map(normalizeUser) : [], [searchedUsersRaw])

  // Batch-запрос presence
  const leaderboardClerkIds = useMemo(() => {
    if (!leaderboard.length) return null
    return leaderboard.slice(0, 20).map(u => u.clerkId).filter(Boolean) as string[]
  }, [leaderboard])

  const usersPresence = useQuery(
    api.users.getUsersPresence,
    (tab === 'users' && leaderboardClerkIds?.length) ? { clerkIds: leaderboardClerkIds } : 'skip'
  )

  const displayRecentUsers = useMemo(() => {
    if (!leaderboard.length) return []
    
    const presenceMap = new Map<string, { isOnline: boolean; lastSeen: number }>()
    if (usersPresence) {
      for (const p of usersPresence) {
        presenceMap.set(p.clerkId, { isOnline: p.isOnline, lastSeen: p.lastSeen })
      }
    }
    
    const enriched = leaderboard.slice(0, 20).map(u => {
      const presence = u.clerkId ? presenceMap.get(u.clerkId) : null
      return { ...u, isOnline: presence?.isOnline || false, lastSeen: presence?.lastSeen || 0 }
    })
    
    return enriched
      .filter(u => u.lastSeen > 0 || u.isOnline)
      .sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1
        if (!a.isOnline && b.isOnline) return 1
        return (b.lastSeen || 0) - (a.lastSeen || 0)
      })
      .slice(0, 10)
  }, [leaderboard, usersPresence])

  const duelWins = useQuery(api.shop.getDuelWins, user ? { clerkId: user.id } : 'skip') || 0

  // ========== BATTLE PASS QUERIES ==========
  const battlePassData = useQuery(api.shop.getBattlePass, user ? { clerkId: user.id } : 'skip')
  const purchaseBattlePass = useMutation(api.shop.purchaseBattlePass)
  const claimBattlePassReward = useMutation(api.shop.claimBattlePassReward)

  const battlePassLevel = battlePassData?.level || 0
  const battlePassXP = battlePassData?.xp || 0
  const hasPremium = battlePassData?.premium || false
  const claimedFree = battlePassData?.claimedFree || []
  const claimedPremium = battlePassData?.claimedPremium || []

  const daysLeft = useMemo(() => {
    return Math.max(0, Math.ceil((new Date(2026, 5, 1).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000)))
  }, [])

  const feedData = useQuery(api.posts.getPosts, tab === 'feed' ? {
    feedMode: feedMode === 'following' ? 'following' : undefined,
    viewerId: user?.id,
    lang: langFilter !== 'all' ? langFilter : undefined,
    postType: postTypeFilter !== 'all' ? postTypeFilter : undefined,
    searchQuery: debouncedSearch || undefined,
    limit: 20,
  } : 'skip')
  
  const feedPosts = (feedData as any)?.posts || []

  const postIds = useMemo(() => feedPosts?.length ? feedPosts.map((p: any) => p._id) : null, [feedPosts])

  const allPolls = useQuery(api.polls.getByPosts, (tab === 'feed' && postIds?.length) ? { postIds } : 'skip') || []
  const pollsByPostId = useMemo(() => {
    const map = new Map()
    for (const poll of allPolls as any[]) map.set(poll.postId, poll)
    return map
  }, [allPolls])

  const allReactions = useQuery(api.reactions.getAllReactionsForPosts, (tab === 'feed' && postIds?.length) ? { postIds } : 'skip') || []
  const reactionsByPostId = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const reaction of allReactions as any[]) {
      if (!map.has(reaction.postId)) map.set(reaction.postId, [])
      map.get(reaction.postId)!.push(reaction)
    }
    const result = new Map<string, any[]>()
    for (const [postId, reactions] of map.entries()) {
      const emojiMap = new Map<string, { emoji: string; count: number; users: string[] }>()
      for (const r of reactions) {
        if (!emojiMap.has(r.emoji)) emojiMap.set(r.emoji, { emoji: r.emoji, count: 0, users: [] })
        const entry = emojiMap.get(r.emoji)!
        entry.count++
        entry.users.push(r.userId)
      }
      result.set(postId, Array.from(emojiMap.values()))
    }
    return result
  }, [allReactions])

  const bookmarks = useQuery(api.postBookmarks.getAll, (tab === 'feed' && user) ? { clerkId: user.id } : 'skip') || []
  const bookmarkedPostIds = useMemo(() => {
    if (!(bookmarks as any[])?.length) return new Set<string>()
    return new Set((bookmarks as any[]).map((b: any) => b.postId))
  }, [bookmarks])

  const getModuleCount = useCallback((u: LeaderboardUser): number => u.totalModules || u.completedModules || 0, [])
  
  const getXpInCurrentRank = useCallback((xp: number, rank: string): number => {
    const threshold = rankThresholds[rank] || 0
    return Math.max(0, xp - threshold)
  }, [])

  const getXpToNextRank = useCallback((xp: number, rank: string): number => {
    const nextRank = nextRankNames[rank]
    if (!nextRank || nextRank === rank) return 0
    const nextThreshold = rankThresholds[nextRank] || 0
    const currentThreshold = rankThresholds[rank] || 0
    const gap = nextThreshold - currentThreshold
    const progress = xp - currentThreshold
    return Math.max(0, gap - progress)
  }, [])

  const getRankProgressPercent = useCallback((xp: number, rank: string): number => {
    const currentThreshold = rankThresholds[rank] || 0
    const nextRank = nextRankNames[rank]
    if (!nextRank || nextRank === rank) return 100
    const nextThreshold = rankThresholds[nextRank] || 0
    const gap = nextThreshold - currentThreshold
    if (gap <= 0) return 100
    const progress = xp - currentThreshold
    return Math.min(100, Math.max(0, Math.round((progress / gap) * 100)))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const viewport = window.visualViewport
    let initialHeight = viewport.height
    let resizeTimer: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => setKeyboardVisible(initialHeight - viewport.height > 150), 100)
    }
    viewport.addEventListener('resize', handleResize)
    return () => { viewport.removeEventListener('resize', handleResize); clearTimeout(resizeTimer) }
  }, [])

  const displayedUsers = searchedUsers.length > 0 ? searchedUsers : leaderboard
  const totalPages = Math.ceil(displayedUsers.length / USERS_PER_PAGE)

  const sortedUsers = useMemo(() => [...displayedUsers].sort((a, b) => {
    if (sortBy === 'xp') return b.xp - a.xp
    if (sortBy === 'modules') return getModuleCount(b) - getModuleCount(a)
    return a.name.localeCompare(b.name)
  }), [displayedUsers, sortBy, getModuleCount])

  const paginatedUsers = sortedUsers.slice((page - 1) * USERS_PER_PAGE, page * USERS_PER_PAGE)

  const currentUserRank = useMemo(() => {
    if (!user) return -1
    return sortedUsers.findIndex((u: LeaderboardUser) => u.username === user.username) + 1
  }, [sortedUsers, user])

  const currentUserData = useMemo(() => {
    if (!user) return null
    return sortedUsers.find((u: LeaderboardUser) => u.username === user.username) || null
  }, [sortedUsers, user])

  const sortedPosts = useMemo(() => {
    const posts = [...feedPosts]
    switch (feedSort) {
      case 'trending':
        return posts.sort((a: any, b: any) => {
          if (a.globallyPinned && !b.globallyPinned) return -1
          if (!a.globallyPinned && b.globallyPinned) return 1
          const now = Date.now(); const hourMs = 60 * 60 * 1000
          const ageAHours = (now - a.createdAt) / hourMs; const ageBHours = (now - b.createdAt) / hourMs
          const engagementA = (a.likesCount || 0) + (a.commentCount || 0) * 2
          const engagementB = (b.likesCount || 0) + (b.commentCount || 0) * 2
          const timeDecayA = ageAHours > 24 ? 0.5 : ageAHours < 1 ? 0.3 : 1.0
          const timeDecayB = ageBHours > 24 ? 0.5 : ageBHours < 1 ? 0.3 : 1.0
          const scoreA = engagementA * timeDecayA + (a.views || 0) * 0.05
          const scoreB = engagementB * timeDecayB + (b.views || 0) * 0.05
          return scoreB - scoreA
        })
      case 'popular': return posts.sort((a: any, b: any) => { if (a.globallyPinned && !b.globallyPinned) return -1; if (!a.globallyPinned && b.globallyPinned) return 1; return (b.views || 0) - (a.views || 0) })
      case 'latest':
      default: return posts.sort((a: any, b: any) => { if (a.globallyPinned && !b.globallyPinned) return -1; if (!a.globallyPinned && b.globallyPinned) return 1; return b.createdAt - a.createdAt })
    }
  }, [feedPosts, feedSort])

  const startPostCooldown = useCallback((seconds: number) => {
    const endTime = Date.now() + seconds * 1000
    sessionStorage.setItem('post_cooldown_end', String(endTime))
    setShowPostCooldownModal(true)
    const update = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
      setPostCooldownSeconds(remaining)
      if (remaining <= 0) { if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current); setShowPostCooldownModal(false); sessionStorage.removeItem('post_cooldown_end') }
    }
    if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current)
    update()
    cooldownIntervalRef.current = setInterval(update, 1000)
  }, [])

  useEffect(() => {
    const endTime = parseInt(sessionStorage.getItem('post_cooldown_end') || '0')
    if (endTime > Date.now()) startPostCooldown(0)
    return () => { if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current) }
  }, [startPostCooldown])

  const feedSortOptions = useMemo(() => [
    { key: 'trending' as FeedSort, icon: TrendingUp, label: 'Trending', labelRu: 'Популярное' },
    { key: 'latest' as FeedSort, icon: Clock, label: 'Latest', labelRu: 'Новое' },
    { key: 'popular' as FeedSort, icon: Eye, label: 'Most Viewed', labelRu: 'Просмотры' },
  ], [])

  const langFilterOptions = useMemo(() => [
    { key: 'all' as LangFilter, label: isRu ? 'Все языки' : 'All', icon: '🌐' },
    { key: 'en' as LangFilter, label: 'English', icon: '🇬🇧' },
    { key: 'ru' as LangFilter, label: 'Русский', icon: '🇷🇺' },
  ], [isRu])

  const postTypeFilterOptions = useMemo(() => [
    { key: 'all' as PostTypeFilter, label: 'All', labelRu: 'Все', icon: '💬' },
    { key: 'general' as PostTypeFilter, label: 'General', labelRu: 'Общее', icon: '💬' },
    { key: 'question' as PostTypeFilter, label: 'Questions', labelRu: 'Вопросы', icon: '❓' },
    { key: 'achievement' as PostTypeFilter, label: 'Achievements', labelRu: 'Достижения', icon: '🏆' },
    { key: 'tutorial' as PostTypeFilter, label: 'Tutorials', labelRu: 'Туториалы', icon: '📚' },
  ], [isRu])

  const hasActiveFilters = feedSort !== 'trending' || langFilter !== 'all' || postTypeFilter !== 'all' || searchQuery
  const handleResetFilters = useCallback(() => { setFeedSort('trending'); setLangFilter('all'); setPostTypeFilter('all'); setSearchQuery('') }, [])

  const formatLastSeen = (timestamp: number) => {
    if (!timestamp) return ''
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (minutes < 1) return isRu ? 'сейчас' : 'now'
    if (minutes < 60) return isRu ? `${minutes}м` : `${minutes}m`
    if (hours < 24) return isRu ? `${hours}ч` : `${hours}h`
    return isRu ? `${Math.floor(hours/24)}д` : `${Math.floor(hours/24)}d`
  }

  const handlePurchasePass = async () => {
    if (!user) return
    try {
      await purchaseBattlePass({ clerkId: user.id })
    } catch (e: any) {
      alert(e.message || 'Failed to purchase')
    }
  }

  const handleClaimReward = async (level: number, isPremium: boolean) => {
    if (!user) return
    try {
      await claimBattlePassReward({ clerkId: user.id, level, isPremium })
    } catch (e: any) {
      alert(e.message || 'Failed to claim')
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0d0d0d]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-0 pb-8 sm:py-12">
        {/* Динамический заголовок */}
        <div className="mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            {tab === 'feed' 
              ? (isRu ? 'Сообщество' : 'Community')
              : (isRu ? 'Арена' : 'The Arena')
            }
          </h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-500 dark:text-white/40">
            {tab === 'feed'
              ? (isRu ? 'Лента постов и обсуждений' : 'Feed of posts and discussions')
              : (isRu ? 'Сражайся за вершину рейтинга' : 'Fight for the top of the leaderboard')
            }
          </p>
          {tab === 'users' && (
            <p className="mt-1 text-xs text-gray-400 dark:text-white/30">
              🕐 {isRu ? 'Обновляется раз в сутки' : 'Updates once a day'}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
          <button onClick={() => setTab('feed')} className={`flex items-center gap-2 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${tab === 'feed' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white' : 'text-gray-500 dark:text-white/40'}`}>
            <Newspaper className="h-4 w-4" /> {isRu ? 'Лента' : 'Feed'}
          </button>
          <button onClick={() => setTab('users')} className={`flex items-center gap-2 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${tab === 'users' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white' : 'text-gray-500 dark:text-white/40'}`}>
            <Swords className="h-4 w-4" /> {isRu ? 'Арена' : 'Arena'}
          </button>
        </div>

        {tab === 'feed' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setFeedMode('for_you')} className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${feedMode === 'for_you' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400'}`}>{isRu ? 'Для вас' : 'For You'}</button>
                {user && <button onClick={() => setFeedMode('following')} className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${feedMode === 'following' ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400'}`}>{isRu ? 'Подписки' : 'Following'}</button>}
              </div>
              <button onClick={() => setShowFilters(!showFilters)} className={`rounded-full p-2 transition-all ${showFilters || hasActiveFilters ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'}`} title={isRu ? 'Фильтры' : 'Filters'}><SlidersHorizontal className="h-4 w-4" /></button>
            </div>

            {/* ====== ПАНЕЛЬ ФИЛЬТРОВ ====== */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mb-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4 space-y-4">
                    {/* Сортировка */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{isRu ? 'Сортировка' : 'Sort by'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {feedSortOptions.map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => setFeedSort(opt.key)}
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] sm:text-xs font-semibold transition-all ${
                              feedSort === opt.key
                                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
                            }`}
                          >
                            <opt.icon className="h-3 w-3" />
                            {isRu ? opt.labelRu : opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Язык */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{isRu ? 'Язык' : 'Language'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {langFilterOptions.map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => setLangFilter(opt.key)}
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] sm:text-xs font-semibold transition-all ${
                              langFilter === opt.key
                                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
                            }`}
                          >
                            <span>{opt.icon}</span>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Тип поста */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{isRu ? 'Тип' : 'Type'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {postTypeFilterOptions.map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => setPostTypeFilter(opt.key)}
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] sm:text-xs font-semibold transition-all ${
                              postTypeFilter === opt.key
                                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
                            }`}
                          >
                            <span>{opt.icon}</span>
                            {isRu ? opt.labelRu : opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Кнопка сброса */}
                    {hasActiveFilters && (
                      <button
                        onClick={handleResetFilters}
                        className="w-full rounded-xl border border-gray-200 dark:border-white/10 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        {isRu ? 'Сбросить фильтры' : 'Reset filters'}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }} placeholder={isRu ? 'Поиск постов...' : 'Search posts...'} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/20" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>}
            </div>

            {sortedPosts.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {sortedPosts.map((post: any, index: number) => (
                  <PostCard key={post._id} post={post} isPriority={index < 3} pollsMap={pollsByPostId} reactionsMap={reactionsByPostId} bookmarkedPostIds={bookmarkedPostIds} />
                ))}
              </div>
            ) : (
              <div className="py-20 text-center">
                <Newspaper className="mx-auto h-12 w-12 text-gray-300 dark:text-white/10" />
                <p className="mt-4 text-gray-500 dark:text-white/40">{isRu ? 'Пока нет постов.' : 'No posts yet.'}</p>
              </div>
            )}
          </div>
        ) : (
          // ========== ARENA TAB ==========
          <>
            {/* CHALLENGE BANNER */}
            {leaderboard.length > 0 && (
              <div className="mb-6 sm:mb-8">
                <NextLink 
                  prefetch={false}
                  href={`/${lang}/duels`}
                  className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-400 via-red-500 to-purple-600 p-5 sm:p-6 text-white shadow-xl shadow-orange-500/20 transition-all hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] block"
                >
                  <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                  <div className="relative flex items-center justify-between">
                    <div className="text-left">
                      <p className="text-xs sm:text-sm font-bold text-orange-100 mb-1">⚔️ {isRu ? 'ВЫЗОВ АРЕНЫ' : 'ARENA CHALLENGE'}</p>
                      <p className="text-lg sm:text-xl font-extrabold">{isRu ? 'Сразиcь с лучшими!' : 'Beat the best!'}</p>
                      <p className="text-xs sm:text-sm text-orange-100 mt-1">{isRu ? 'Докажи что ты достоин вершины' : 'Prove you deserve the top'}</p>
                    </div>
                    <div className="text-4xl sm:text-5xl">🏆</div>
                  </div>
                </NextLink>
              </div>
            )}

            {/* BATTLE PASS */}
            <BattlePass
              isRu={isRu}
              battlePassLevel={battlePassLevel}
              battlePassXP={battlePassXP}
              hasPremium={hasPremium}
              claimedFree={claimedFree}
              claimedPremium={claimedPremium}
              onClaim={handleClaimReward}
              onPurchase={handlePurchasePass}
              daysLeft={daysLeft}
            />

            {/* RECENTLY ACTIVE */}
            {displayRecentUsers.length > 0 && (
              <div className="mb-6 sm:mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <div className="rounded-lg bg-green-100 dark:bg-green-500/10 p-1.5">
                    <Zap className="h-4 w-4 text-green-500" />
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                    {isRu ? 'Недавно активны' : 'Recently Active'}
                  </h2>
                  <span className="flex items-center gap-1 text-[10px] text-green-500 font-semibold">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    {displayRecentUsers.filter(u => u.isOnline).length} {isRu ? 'онлайн' : 'online'}
                  </span>
                </div>
                
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {displayRecentUsers.map((recentUser) => (
                    <NextLink key={recentUser.username} prefetch={false} href={`/${lang}/profile/${recentUser.username}`} className="flex-shrink-0 flex flex-col items-center gap-1.5 group">
                      <div className="relative">
                        <div className={`h-14 w-14 sm:h-16 sm:w-16 rounded-full p-[2.5px] ${recentUser.isOnline ? 'bg-gradient-to-tr from-green-400 to-emerald-500 shadow-lg shadow-green-500/20' : 'bg-gray-200 dark:bg-white/10'}`}>
                          <div className="h-full w-full rounded-full bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden ring-2 ring-white dark:ring-gray-800">
                            {recentUser.avatar ? (
                              <img src={recentUser.avatar} alt={recentUser.name} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <span className="text-lg font-bold text-gray-400">{recentUser.name?.charAt(0)?.toUpperCase() || '?'}</span>
                            )}
                          </div>
                        </div>
                        {recentUser.isOnline && (
                          <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-green-500 border-[3px] border-white dark:border-gray-800 shadow-sm" />
                        )}
                      </div>
                      <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 max-w-[64px] truncate text-center font-medium">{recentUser.name}</span>
                      <span className="text-[9px] text-gray-400 -mt-1">
                        {recentUser.isOnline ? (isRu ? 'в сети' : 'online') : recentUser.lastSeen ? formatLastSeen(recentUser.lastSeen) : ''}
                      </span>
                    </NextLink>
                  ))}
                </div>
              </div>
            )}

            {/* TOP 3 */}
            {!searchQuery && leaderboard.length > 0 && (
              <div className="mb-8 sm:mb-10">
                <div className="mb-3 sm:mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-yellow-100 dark:bg-yellow-500/10 p-1.5">
                    <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">{isRu ? 'Топ бойцов' : 'Top Fighters'}</h2>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-3">
                  {leaderboard.slice(0, 3).map((u, i) => {
                    const rankProgress = getRankProgressPercent(u.xp, u.rank)
                    const neededXp = getXpToNextRank(u.xp, u.rank)
                    const nextRank = nextRankNames[u.rank] || u.rank
                    
                    return (
                      <motion.div key={u.username} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                        <NextLink prefetch={false} href={`/${lang}/profile/${u.username}`}>
                          <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 sm:p-5 transition-all hover:border-gray-300 hover:shadow-lg dark:border-white/5 dark:from-white/[0.02] dark:to-transparent dark:hover:border-white/10">
                            <div className="absolute -right-4 -top-4 text-4xl sm:text-6xl opacity-10">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
                            <div className="relative flex items-center gap-3 sm:gap-4">
                              {user && u.username === user.username ? (
                                <img src={user.imageUrl} alt={u.name} className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border-2 border-white shadow-md dark:border-gray-800 object-cover ring-2 ring-offset-2 ring-yellow-400/50" />
                              ) : (
                                <img src={u.avatar} alt={u.name} className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border-2 border-white shadow-md dark:border-gray-800 object-cover" />
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm sm:font-bold text-gray-900 dark:text-white truncate">{u.name}</h3>
                                <p className="text-[10px] sm:text-xs text-gray-400">@{u.username}</p>
                                <div className="mt-1 sm:mt-1.5 flex items-center gap-2 text-[10px] sm:text-xs">
                                  <span className="flex items-center gap-1 text-gray-500"><Award className="h-3 w-3" /> {u.xp} XP</span>
                                  <span className="flex items-center gap-1 text-gray-500"><Code2 className="h-3 w-3" /> {getModuleCount(u)}</span>
                                </div>
                                
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-[9px] text-gray-400 mb-1">
                                    <span>{rankIcons[u.rank]} {u.rank}</span>
                                    <span>{neededXp > 0 ? `${neededXp} XP → ${rankIcons[nextRank]} ${nextRank}` : '🏆 MAX'}</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${rankProgress}%`, background: `linear-gradient(90deg, ${rankColors[u.rank] || '#9ca3af'}, ${rankColors[nextRank] || rankColors[u.rank] || '#9ca3af'})` }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </NextLink>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* YOUR RANK CARD */}
            {user && currentUserData && currentUserRank > 3 && (
              <div className="mb-6 sm:mb-8">
                <NextLink prefetch={false} href={`/${lang}/profile/${user.username}`}>
                  <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-5 dark:border-blue-500/20 dark:from-blue-500/5 dark:to-indigo-500/5 transition-all hover:shadow-md hover:border-blue-300">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-blue-500 text-white text-sm font-bold flex-shrink-0 shadow-lg shadow-blue-500/25">#{currentUserRank}</div>
                      <img src={user.imageUrl} alt={user.fullName || ''} className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border-2 border-white shadow-md object-cover" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{isRu ? 'Твоя позиция' : 'Your Rank'}</h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{currentUserData.xp} XP</span>
                          <span>·</span>
                          <span>{rankIcons[currentUserData.rank]} {currentUserData.rank}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Swords className="h-3 w-3" /> {duelWins}</span>
                        </div>
                        {getXpToNextRank(currentUserData.xp, currentUserData.rank) > 0 && (
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
                            {getXpToNextRank(currentUserData.xp, currentUserData.rank)} XP {isRu ? 'до' : 'to'} {rankIcons[nextRankNames[currentUserData.rank]]} {nextRankNames[currentUserData.rank]}
                          </p>
                        )}
                      </div>
                      <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />
                    </div>
                  </div>
                </NextLink>
              </div>
            )}

            {/* GROUP CHATS */}
            {!searchQuery && (
              <div className="mb-8 sm:mb-10">
                <div className="mb-3 sm:mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-purple-100 dark:bg-purple-500/10 p-1.5">
                    <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">{isRu ? 'Групповые чаты' : 'Group Chats'}</h2>
                </div>
                <GroupChats />
              </div>
            )}

            {/* HALL OF FAME */}
            <div>
              <div className="mb-3 sm:mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-orange-100 dark:bg-orange-500/10 p-1.5">
                    <Flame className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                    {searchQuery ? (isRu ? 'Результаты поиска' : 'Search Results') : (isRu ? 'Зал Славы' : 'Hall of Fame')}
                  </h2>
                </div>
                {!searchQuery && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] sm:text-xs text-gray-400">{isRu ? 'Сорт.' : 'Sort'}:</span>
                    {[{ key: 'xp' as const, label: 'XP' }, { key: 'modules' as const, label: isRu ? 'Модули' : 'Modules' }, { key: 'name' as const, label: isRu ? 'Имя' : 'Name' }].map((opt) => (
                      <button key={opt.key} onClick={() => { setSortBy(opt.key); setPage(1) }} className={`rounded-lg px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold transition-all ${sortBy === opt.key ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/5 dark:text-white/40 dark:hover:bg-white/10'}`}>{opt.label}</button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }} placeholder={isRu ? 'Поиск бойца...' : 'Search fighter...'} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 sm:py-3 pl-10 pr-4 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/20" />
              </div>

              {paginatedUsers.length === 0 ? (
                <div className="py-16 sm:py-20 text-center">
                  <Search className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-white/10" />
                  <p className="mt-3 sm:mt-4 text-sm sm:text-base text-gray-500 dark:text-white/40">{isRu ? 'Бойцы не найдены' : 'No fighters found'}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5 sm:space-y-2">
                    {paginatedUsers.map((u: LeaderboardUser, index: number) => {
                      const globalIndex = (page - 1) * USERS_PER_PAGE + index
                      const prevUser = globalIndex > 0 ? sortedUsers[globalIndex - 1] : null
                      const xpGap = prevUser ? prevUser.xp - u.xp : 0
                      const rankProgress = getRankProgressPercent(u.xp, u.rank)
                      const neededXp = getXpToNextRank(u.xp, u.rank)
                      const nextRank = nextRankNames[u.rank] || u.rank
                      
                      return (
                        <motion.div key={u.username} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.02 }}>
                          <NextLink prefetch={false} href={`/${lang}/profile/${u.username}`}>
                            <div className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-xl border border-gray-100 bg-white p-3 sm:p-4 transition-all hover:border-gray-200 hover:shadow-md dark:border-white/5 dark:bg-white/[0.01] dark:hover:border-white/10">
                              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                                <div className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-[10px] sm:text-xs font-bold flex-shrink-0 ${globalIndex < 3 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-white/40'}`}>{globalIndex + 1}</div>
                                <div className="relative flex-shrink-0">
                                  {user && u.username === user.username ? (
                                    <img src={user.imageUrl} alt={u.name} className="h-8 w-8 sm:h-10 sm:w-10 rounded-full border-2 border-white shadow-sm dark:border-gray-800 object-cover ring-2 ring-offset-1 ring-blue-400/50" style={{ borderColor: rankColors[u.rank] || '#9ca3af' }} />
                                  ) : (
                                    <img src={u.avatar} alt={u.name} className="h-8 w-8 sm:h-10 sm:w-10 rounded-full border-2 border-white shadow-sm dark:border-gray-800 object-cover" style={{ borderColor: rankColors[u.rank] || '#9ca3af' }} />
                                  )}
                                  <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 sm:h-4 sm:w-4 items-center justify-center rounded-full text-[8px] sm:text-[10px] shadow-sm" style={{ backgroundColor: rankColors[u.rank] || '#9ca3af' }}>{rankIcons[u.rank] || '🌱'}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <h3 className="text-sm sm:font-semibold text-gray-900 dark:text-white truncate">{u.name}</h3>
                                    <span className="text-[10px] sm:text-xs text-gray-400 truncate">@{u.username}</span>
                                    {user && u.username === user.username && <span className="text-[9px] rounded-full bg-blue-100 dark:bg-blue-500/20 px-1.5 py-0.5 text-blue-600 dark:text-blue-400 font-bold">{isRu ? 'Ты' : 'You'}</span>}
                                  </div>
                                  {u.bio && <p className="text-[10px] sm:text-xs text-gray-400 truncate hidden sm:block">{u.bio}</p>}
                                  
                                  <div className="mt-1.5 hidden sm:block">
                                    <div className="flex items-center justify-between text-[9px] text-gray-400 mb-0.5">
                                      <span>{rankIcons[u.rank]} {u.rank}</span>
                                      <span>{neededXp > 0 ? `${neededXp} XP → ${rankIcons[nextRank]} ${nextRank}` : '🏆 MAX'}</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden max-w-[200px]">
                                      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${rankProgress}%`, background: `linear-gradient(90deg, ${rankColors[u.rank] || '#9ca3af'}, ${rankColors[nextRank] || rankColors[u.rank] || '#9ca3af'})` }} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-gray-500 dark:text-white/40 flex-shrink-0 ml-10 sm:ml-0">
                                <span className="flex items-center gap-1"><Award className="h-3 w-3 sm:h-3.5 sm:w-3.5" /><span className="font-semibold text-gray-900 dark:text-white">{u.xp} XP</span></span>
                                <span className="flex items-center gap-1 hidden sm:flex"><Code2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /><span className="font-semibold text-gray-900 dark:text-white">{getModuleCount(u)}</span></span>
                              </div>
                            </div>
                          </NextLink>
                        </motion.div>
                      )
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-center gap-2">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button key={i} onClick={() => setPage(i + 1)} className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all ${page === i + 1 ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'}`}>{i + 1}</button>
                      ))}
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* FAB */}
      {tab === 'feed' && user && !keyboardVisible && (
        <button onClick={() => setShowComposer(true)} aria-label={isRu ? 'Создать пост' : 'Create post'} className="fixed bottom-24 sm:bottom-8 right-4 sm:right-8 z-40 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/25 transition-all hover:from-blue-600 hover:to-purple-600 active:scale-95">
          <PenLine className="h-5 w-5" /><span className="hidden sm:inline">{isRu ? 'Новый пост' : 'New Post'}</span>
        </button>
      )}

      {/* COMPOSER MODAL */}
      <AnimatePresence>
        {showComposer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[15vh] bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowComposer(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.2 }} className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{isRu ? 'Создать пост' : 'Create Post'}</h3>
                <button onClick={() => setShowComposer(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4"><PostComposer onPost={() => setShowComposer(false)} onRateLimit={startPostCooldown} /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CooldownModal isOpen={showPostCooldownModal} onClose={() => setShowPostCooldownModal(false)} seconds={postCooldownSeconds} type="post" />

      <style jsx>{`
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-bounce-slow {
          animation: bounceSlow 2s ease-in-out infinite;
        }
        @keyframes bounceSlow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  )
}