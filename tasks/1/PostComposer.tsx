'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { 
  Send, BarChart3, X, Maximize2, Minimize2, 
  Bold, Italic, Strikethrough, Code, Type, 
  Trash2,
  Reply,
  Pin,
  MessageCircle,
  Repeat2,
  Share2,
  Bookmark
} from 'lucide-react'
import NextLink from 'next/link'
import PollCard from '@/components/PollCard'
import { Id } from '@convex/_generated/dataModel'
import { useParams } from 'next/navigation'
import CommentReactions from './CommentReactions'
import { useDraft } from '@/hooks/useDraft'
import { motion, AnimatePresence } from 'framer-motion'
import ConfirmModal from '@/components/ConfirmModal'

const QUICK_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥', '💯', '🎉', '👀']

// bug #5 fix: single source of truth for post length limit
const MAX_POST_LENGTH = 500

// bug #6 fix: formatters created once, reused on every call
const formatters = {
  enTime: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  ruTime: new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  enDate: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
  ruDate: new Intl.DateTimeFormat('ru-RU', { month: 'short', day: 'numeric' }),
}

// bug #6 fix: single formatTimestamp function, calendar-date comparison, no duplicate
function formatTimestamp(ts: number, lang: 'ru' | 'en'): string {
  const safeLang: 'ru' | 'en' = (lang === 'ru' || lang === 'en') ? lang : 'en'

  if (!Number.isFinite(ts)) return ''

  const date = new Date(ts)
  if (isNaN(date.getTime())) return ''

  const now = new Date()

  try {
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()

    const timeStr = safeLang === 'ru'
      ? formatters.ruTime.format(date)
      : formatters.enTime.format(date)

    if (isToday) return timeStr

    const dateStr = safeLang === 'ru'
      ? formatters.ruDate.format(date)
      : formatters.enDate.format(date)

    return dateStr + ' · ' + timeStr
  } catch {
    return ''
  }
}

// bug #1 fix: no dangerouslySetInnerHTML, React elements only, XSS safe
export function renderContent(content: string, lang?: string) {
  if (!content) return null

  const parts = content.split(/(\*\*.*?\*\*|~~.*?~~|`.*?`|_.*?_|@[\w-]+|\n)/g)

  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <b key={i}>{part.slice(2, -2)}</b>

        if (part.startsWith('~~') && part.endsWith('~~'))
          return <s key={i}>{part.slice(2, -2)}</s>

        if (part.startsWith('`') && part.endsWith('`'))
          return <code key={i}>{part.slice(1, -1)}</code>

        if (part.startsWith('_') && part.endsWith('_'))
          return <i key={i}>{part.slice(1, -1)}</i>

        if (part.startsWith('@') && lang)
          return (
            <NextLink key={i} href={`/${lang}/profile/${part.slice(1)}`} className="text-blue-500 hover:underline font-medium">
              {part}
            </NextLink>
          )

        if (part === '\n') return <br key={i} />

        // plain text: React escapes this automatically, no XSS possible
        return <span key={i}>{part}</span> // bug 17 fix
      })}
    </span>
  )
}

function htmlToMarkdown(html: string): string {
  let text = html

  text = text.replace(/<b>(.*?)<\/b>/gi, '**$1**')
  text = text.replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
  text = text.replace(/<i>(.*?)<\/i>/gi, '_$1_')
  text = text.replace(/<em>(.*?)<\/em>/gi, '_$1_')
  text = text.replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
  text = text.replace(/<strike>(.*?)<\/strike>/gi, '~~$1~~')
  text = text.replace(/<del>(.*?)<\/del>/gi, '~~$1~~')
  text = text.replace(/<code>(.*?)<\/code>/gi, '`$1`')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<div>(.*?)<\/div>/gi, '\n$1\n')
  text = text.replace(/<p>(.*?)<\/p>/gi, '\n$1\n')
  text = text.replace(/<[^>]+>/g, '')
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.trim()

  return text
}

// bug #4 fix: moved outside PostComposer, receives props instead of closing over parent scope
const FormatBar = ({
  selectionState,
  applyFormat,
  isRu
}: {
  selectionState: { bold: boolean; italic: boolean; strike: boolean }
  applyFormat: (command: string, value?: string) => void
  isRu: boolean
}) => (
  <div className="flex items-center gap-0.5">
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); applyFormat('bold') }}
      className={`p-1.5 rounded-md transition-colors ${selectionState.bold ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'}`}
      title={isRu ? 'Жирный (Ctrl+B)' : 'Bold (Ctrl+B)'}
    >
      <Bold className="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); applyFormat('italic') }}
      className={`p-1.5 rounded-md transition-colors ${selectionState.italic ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'}`}
      title={isRu ? 'Курсив (Ctrl+I)' : 'Italic (Ctrl+I)'}
    >
      <Italic className="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); applyFormat('strikeThrough') }}
      className={`p-1.5 rounded-md transition-colors ${selectionState.strike ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'}`}
      title={isRu ? 'Зачёркнутый (Ctrl+Shift+X)' : 'Strikethrough (Ctrl+Shift+X)'}
    >
      <Strikethrough className="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); applyFormat('fontName', 'monospace') }}
      className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
      title={isRu ? 'Моноширинный (Ctrl+E)' : 'Monospace (Ctrl+E)'}
    >
      <Code className="h-3.5 w-3.5" />
    </button>
  </div>
)

// bug #3 fix: moved outside PostComposer, stable reference, no remounting on every keystroke
const EditorContent = ({
  editorRef,
  onInput,
  onFocus,
  onBlur,
  onKeyDown,
  isRu
}: {
  editorRef: React.RefObject<HTMLDivElement>
  onInput: () => void
  onFocus: () => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  isRu: boolean
}) => (
  <div
    ref={editorRef}
    contentEditable
    suppressContentEditableWarning
    onInput={onInput}
    onFocus={onFocus}
    onBlur={onBlur}
    onKeyDown={onKeyDown}
    data-placeholder={isRu ? 'Поделитесь прогрессом... Используйте @username для упоминаний!' : 'Share your progress... Use @username to mention!'}
    className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white min-h-[80px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-white/20"
  />
)

export function PostComposer({ 
  onPost, 
  inModal,
  onRateLimit 
}: { 
  onPost?: () => void; 
  inModal?: boolean;
  onRateLimit?: (seconds: number) => void;
}) {
  const { user } = useUser()
  const params = useParams()
  const lang = (params?.lang as string) || 'en'
  const isRu = lang === 'ru'
  
  const { content, updateContent, clearDraft } = useDraft('post-composer', 'post')
  const [tags, setTags] = useState('')
  const [showPoll, setShowPoll] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [useMask, setUseMask] = useState<string | null>(null)
  const [useMicrophone, setUseMicrophone] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [selectionState, setSelectionState] = useState({ bold: false, italic: false, strike: false })
  
  const editorRef = useRef<HTMLDivElement>(null)
  const fullscreenEditorRef = useRef<HTMLDivElement>(null)
  
  const [isPosting, setIsPosting] = useState(false)
  const [postCooldownSeconds, setPostCooldownSeconds] = useState(0)

  useEffect(() => {
    const endTime = parseInt(sessionStorage.getItem('post_cooldown_end') || '0')
    if (endTime > Date.now()) {
      const remaining = Math.ceil((endTime - Date.now()) / 1000)
      setPostCooldownSeconds(remaining)
      const interval = setInterval(() => {
        const r = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
        setPostCooldownSeconds(r)
        if (r <= 0) {
          clearInterval(interval)
          sessionStorage.removeItem('post_cooldown_end')
        }
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (content && editorRef.current && !editorRef.current.isSameNode(document.activeElement)) {
      const html = content
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/_(.*?)_/g, '<i>$1</i>')
        .replace(/~~(.*?)~~/g, '<s>$1</s>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br/>')
      if (editorRef.current.innerHTML !== html) {
        editorRef.current.innerHTML = html
      }
    }
  }, [content])

  useEffect(() => {
    if (fullscreen && fullscreenEditorRef.current && editorRef.current) {
      fullscreenEditorRef.current.innerHTML = editorRef.current.innerHTML
      setTimeout(() => fullscreenEditorRef.current?.focus(), 100)
    }
  }, [fullscreen])

  const createPost = useMutation(api.posts.createPost)
  const createPoll = useMutation(api.polls.create)
  const inventory = useQuery(api.shop.getInventory, user ? { clerkId: user.id } : 'skip')
  const canPostQuery = useQuery(api.posts.canCreatePost, user ? {} : 'skip')

  const equippedItems = inventory?.filter(i => i.equipped) || []
  const hasGuyFawkes = equippedItems.some(i => i.itemSlug === 'anon-mask-guy-fawkes')
  const hasDoge = equippedItems.some(i => i.itemSlug === 'anon-mask-doge')
  const hasClaude = equippedItems.some(i => i.itemSlug === 'anon-mask-claude')
  const hasMicrophone = equippedItems.some(i => i.itemSlug === 'microphone')

  const updateSelectionState = useCallback(() => {
    setSelectionState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      strike: document.queryCommandState('strikeThrough'),
    })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', updateSelectionState)
    return () => document.removeEventListener('selectionchange', updateSelectionState)
  }, [updateSelectionState])

  const applyFormat = useCallback((command: string, value?: string) => {
    const ref = fullscreen ? fullscreenEditorRef.current : editorRef.current
    if (!ref) return
    ref.focus()
    document.execCommand(command, false, value)
    updateSelectionState()
    const html = ref.innerHTML
    const text = htmlToMarkdown(html)
    updateContent(text)
  }, [fullscreen, updateContent, updateSelectionState])

  const handleEditorInput = useCallback(() => {
    const ref = fullscreen ? fullscreenEditorRef.current : editorRef.current
    if (!ref) return
    const html = ref.innerHTML
    const text = htmlToMarkdown(html)
    updateContent(text)
    updateSelectionState()
  }, [fullscreen, updateContent, updateSelectionState])

  const addPollOption = () => setPollOptions([...pollOptions, ''])
  const removePollOption = (i: number) => setPollOptions(pollOptions.filter((_, idx) => idx !== i))
  const updatePollOption = (i: number, val: string) => {
    const newOpts = [...pollOptions]
    newOpts[i] = val
    setPollOptions(newOpts)
  }

  const handlePost = async () => {
    // bug #5 fix:  enforce MAX_POST_LENGTH before sending
    if (!user || !content.trim() || isPosting || postCooldownSeconds > 0 || content.length > MAX_POST_LENGTH) return

    if (canPostQuery && !canPostQuery.canPost) {
      const seconds = canPostQuery.remainingSeconds
      const endTime = Date.now() + seconds * 1000
      sessionStorage.setItem('post_cooldown_end', String(endTime))
      onRateLimit?.(seconds)
      return
    }

    setIsPosting(true)
    const contentToSend = content.trim()
    // bug #15 fix: updated regex to support hyphenated usernames
    const mentions = content.match(/@([\w-]+)/g)?.map((m) => m.slice(1)) || []

    try {
      const postId = await createPost({
        authorId: user.id,
        authorName: user.fullName || 'User',
        authorAvatar: user.imageUrl || '',
        authorUsername: user.username || '',
        content: contentToSend,
        mentions,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        useMask: useMask || undefined,
        pinWithMicrophone: useMicrophone || undefined,
      })

      if (showPoll && pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2) {
        await createPoll({
          question: pollQuestion.trim(),
          options: pollOptions.filter((o) => o.trim()).map((o, i) => ({ id: `opt_${i}`, text: o.trim() })),
          postId: postId,
        })
      }

      clearDraft()
      setTags('')
      setShowPoll(false)
      setPollQuestion('')
      setPollOptions(['', ''])
      setUseMask(null)
      setUseMicrophone(false)
      setIsFocused(false)
      setShowSuccess(true)
      setFullscreen(false)
      setTimeout(() => setShowSuccess(false), 2500)
      onPost?.()
    } catch (error: any) {
      if (error.message?.includes('Rate limit exceeded') ||
          error.message?.includes('Server Error') ||
          error.message?.includes('rate') ||
          error.message?.includes('Rate')) {
        const match = error.message.match(/(\d+)\s*seconds?/)
        const seconds = match ? parseInt(match[1]) : 600
        const endTime = Date.now() + seconds * 1000
        sessionStorage.setItem('post_cooldown_end', String(endTime))
        if (onRateLimit) {
          onRateLimit(seconds)
        } else {
          setPostCooldownSeconds(seconds)
          const interval = setInterval(() => {
            const r = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
            setPostCooldownSeconds(r)
            if (r <= 0) { clearInterval(interval); sessionStorage.removeItem('post_cooldown_end') }
          }, 1000)
        }
      } else {
        // bug #7 fix: operator precedence fixed, both languages get error detail
        const errorMessage = error.message || 'Unknown error'
        alert(isRu ? `Не удалось создать пост: ${errorMessage}` : `Failed to create post: ${errorMessage}`)
      }
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <>
      {!fullscreen && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-white/[0.01]" style={{ display: !inModal && keyboardOpen ? 'none' : 'block' }}>
          <div className="flex items-start gap-3">
            <img src={user?.imageUrl || ''} className="h-10 w-10 rounded-full flex-shrink-0" alt="" />
            <div className="flex-1 min-w-0">
              {/* bug #3 fix: EditorContent moved outside, stable reference */}
              <EditorContent
                editorRef={editorRef}
                onInput={handleEditorInput}
                onFocus={() => setIsFocused(true)}
                onBlur={() => { setIsFocused(false); handleEditorInput() }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); applyFormat('bold') }
                  if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); applyFormat('italic') }
                  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') { e.preventDefault(); applyFormat('strikeThrough') }
                  if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); applyFormat('fontName', 'monospace') }
                }}
                isRu={isRu}
              />
              
              <div className="flex items-center justify-between mt-2">
                {/* bug #4 fix: FormatBar moved outside, receives props */}
                <FormatBar
                  selectionState={selectionState}
                  applyFormat={applyFormat}
                  isRu={isRu}
                />
                <button
                  type="button"
                  onClick={() => setFullscreen(true)}
                  className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  title={isRu ? 'На весь экран' : 'Fullscreen'}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
             
              {showPoll && (
                <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 p-4 dark:border-purple-500/20 dark:bg-purple-500/5">
                  <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder={isRu ? 'Вопрос опроса...' : 'Poll question...'} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm mb-3 focus:outline-none dark:bg-white/5 dark:text-white" />
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                      <input value={opt} onChange={(e) => updatePollOption(i, e.target.value)} placeholder={`${isRu ? 'Вариант' : 'Option'} ${i + 1}`} className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none dark:bg-white/5 dark:text-white" />
                      {pollOptions.length > 2 && (
                        <button onClick={() => removePollOption(i)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-white/5 transition-all">✕</button>
                      )}
                    </div>
                  ))}
                  <button onClick={addPollOption} className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 mb-3">+ {isRu ? 'Добавить вариант' : 'Add option'}</button>
                </div>
              )}

              <div className="relative mt-2">
                <input
                  value={tags}
                  onChange={(e) => {
                    const val = e.target.value
                    const tagArray = val.split(',').map(t => t.trim()).filter(Boolean)
                    if (tagArray.length <= 5 && tagArray.every(t => t.length <= 30)) setTags(val)
                  }}
                  placeholder={isRu ? 'Теги: tcp-ip, networking' : 'Tags: tcp-ip, networking'}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 pr-16 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 tabular-nums">
                  {tags.split(',').filter(Boolean).length}/5
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {hasGuyFawkes && (
                  <button onClick={() => setUseMask(useMask === 'anon-mask-guy-fawkes' ? null : 'anon-mask-guy-fawkes')} className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${useMask === 'anon-mask-guy-fawkes' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-purple-100 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'}`}>🎭 {isRu ? 'Анонимно' : 'Anonymous'}</button>
                )}
                {hasDoge && (
                  <button onClick={() => setUseMask(useMask === 'anon-mask-doge' ? null : 'anon-mask-doge')} className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${useMask === 'anon-mask-doge' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-purple-100 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'}`}>🐕 Doge</button>
                )}
                {hasClaude && (
                  <button onClick={() => setUseMask(useMask === 'anon-mask-claude' ? null : 'anon-mask-claude')} className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${useMask === 'anon-mask-claude' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-purple-100 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'}`}>🤖 Claude</button>
                )}
                {hasMicrophone && (
                  <button onClick={() => setUseMicrophone(!useMicrophone)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${useMicrophone ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-red-100 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'}`}>🎤 {isRu ? 'Закрепить пост (1 раз)' : 'Pin Post (1 use)'}</button>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button onClick={() => setShowPoll(!showPoll)} className={`rounded-lg p-2 transition-all ${showPoll ? 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'}`} title={isRu ? 'Добавить опрос' : 'Add poll'}>
                  <BarChart3 className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2">
                  {/* bug #5 fix: consistent limit shown */}
                  <span className="text-[11px] text-gray-400">{content.length} / {MAX_POST_LENGTH}</span>
                  <button 
                    onClick={handlePost} 
                    disabled={!content.trim() || isPosting || postCooldownSeconds > 0}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 px-5 py-2 text-sm font-semibold text-white transition-all hover:from-blue-600 hover:to-purple-600 disabled:opacity-50"
                  >
                    {postCooldownSeconds > 0 ? (
                      <span className="flex items-center gap-1">
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {postCooldownSeconds}s
                      </span>
                    ) : isPosting ? (
                      <span className="flex items-center gap-1">
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {isRu ? 'Публикация...' : 'Posting...'}
                      </span>
                    ) : (
                      <><Send className="h-4 w-4" /> {isRu ? 'Опубликовать' : 'Post'}</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#0a0a0f]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/5 flex-shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (fullscreenEditorRef.current && editorRef.current) {
                      editorRef.current.innerHTML = fullscreenEditorRef.current.innerHTML
                      const html = fullscreenEditorRef.current.innerHTML
                      updateContent(htmlToMarkdown(html))
                    }
                    setFullscreen(false)
                  }}
                  className="p-2 -ml-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  <Minimize2 className="h-5 w-5" />
                </button>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {isRu ? 'Новый пост' : 'New Post'}
                </span>
              </div>
              <button 
                onClick={handlePost} 
                disabled={!content.trim() || isPosting || postCooldownSeconds > 0}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:from-blue-600 hover:to-purple-600 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {isRu ? 'Опубликовать' : 'Post'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-4 py-4">
                <div className="flex items-start gap-3 mb-4">
                  <img src={user?.imageUrl || ''} className="h-10 w-10 rounded-full flex-shrink-0" alt="" />
                  <div className="flex-1">
                    <div
                      ref={fullscreenEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={handleEditorInput}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); applyFormat('bold') }
                        if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); applyFormat('italic') }
                        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') { e.preventDefault(); applyFormat('strikeThrough') }
                        if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); applyFormat('fontName', 'monospace') }
                      }}
                      data-placeholder={isRu ? 'Поделитесь прогрессом, достижениями или мыслями...' : 'Share your progress, achievements, or thoughts...'}
                      className="w-full text-lg text-gray-900 dark:text-white outline-none min-h-[200px] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-white/20 pb-4"
                      autoFocus
                    />
                  </div>
                </div>

                {showPoll && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 dark:border-purple-500/20 dark:bg-purple-500/5 mb-4">
                    <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder={isRu ? 'Вопрос опроса...' : 'Poll question...'} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm mb-3 focus:outline-none dark:bg-white/5 dark:text-white" />
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <input value={opt} onChange={(e) => updatePollOption(i, e.target.value)} placeholder={`${isRu ? 'Вариант' : 'Option'} ${i + 1}`} className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none dark:bg-white/5 dark:text-white" />
                        {pollOptions.length > 2 && (
                          <button onClick={() => removePollOption(i)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-white/5 transition-all">✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={addPollOption} className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 mb-3">+ {isRu ? 'Добавить вариант' : 'Add option'}</button>
                  </div>
                )}

                <input
                  value={tags}
                  onChange={(e) => {
                    const val = e.target.value
                    const tagArray = val.split(',').map(t => t.trim()).filter(Boolean)
                    if (tagArray.length <= 5 && tagArray.every(t => t.length <= 30)) setTags(val)
                  }}
                  placeholder={isRu ? 'Теги: tcp-ip, networking' : 'Tags: tcp-ip, networking'}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/20 mb-4"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-white/5 px-4 py-3 flex-shrink-0">
              <div className="max-w-2xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* bug #4 fix: FormatBar with props */}
                  <FormatBar
                    selectionState={selectionState}
                    applyFormat={applyFormat}
                    isRu={isRu}
                  />
                  <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />
                  <button onClick={() => setShowPoll(!showPoll)} className={`p-1.5 rounded-md transition-colors ${showPoll ? 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'}`} title={isRu ? 'Добавить опрос' : 'Add poll'}>
                    <BarChart3 className="h-4 w-4" />
                  </button>
                  {hasGuyFawkes && (
                    <button onClick={() => setUseMask(useMask === 'anon-mask-guy-fawkes' ? null : 'anon-mask-guy-fawkes')} className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${useMask === 'anon-mask-guy-fawkes' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-purple-100 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'}`}>🎭</button>
                  )}
                  {hasDoge && (
                    <button onClick={() => setUseMask(useMask === 'anon-mask-doge' ? null : 'anon-mask-doge')} className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${useMask === 'anon-mask-doge' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-purple-100 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'}`}>🐕</button>
                  )}
                  {hasClaude && (
                    <button onClick={() => setUseMask(useMask === 'anon-mask-claude' ? null : 'anon-mask-claude')} className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${useMask === 'anon-mask-claude' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-purple-100 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'}`}>🤖</button>
                  )}
                </div>
                {/* bug #5 fix: consistent limit in fullscreen */}
                <span className="text-[11px] text-gray-400">{content.length} / {MAX_POST_LENGTH}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .dark [data-placeholder]:empty:before {
          color: rgba(255,255,255,0.2);
        }
        [contenteditable] b, [contenteditable] strong { font-weight: 700; }
        [contenteditable] i, [contenteditable] em { font-style: italic; }
        [contenteditable] s, [contenteditable] strike, [contenteditable] del { text-decoration: line-through; }
        [contenteditable] code {
          font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
          background: rgba(0,0,0,0.06);
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 0.85em;
        }
        .dark [contenteditable] code {
          background: rgba(255,255,255,0.08);
        }
      `}</style>

      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-full bg-gray-900 dark:bg-white px-5 py-2.5 shadow-2xl"
          >
            <p className="text-sm font-semibold text-white dark:text-gray-900">✅ {isRu ? 'Пост создан!' : 'Post created!'}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function CommentItem({ comment, isReply, lang, onReply, onDelete, onToggleReaction }: {
  comment: any
  isReply: boolean
  lang: string
  onReply: (id: Id<'postComments'>) => void
  onDelete: (id: Id<'postComments'>) => void
  onToggleReaction: (commentId: Id<'postComments'>, emoji: string) => void
}) {
  const { user } = useUser()
  const [showPicker, setShowPicker] = useState(false)
  const reactions = useQuery(api.reactions.getPostCommentReactions, { commentId: comment._id }) || []
  const isRu = lang === 'ru'

  // bug #6 fix: formatTimestamp removed from here, using the single shared function above

  const handleQuickReaction = (emoji: string) => {
    onToggleReaction(comment._id, emoji)
    setShowPicker(false)
  }

  return (
    <div className={`flex items-start gap-2 mb-3 ${isReply ? 'ml-6 pl-4 border-l-2 border-gray-200 dark:border-white/10' : ''}`}>
      {comment.authorId === user?.id && user?.imageUrl ? (
        <img src={user.imageUrl} className="h-6 w-6 rounded-full mt-0.5 object-cover" alt="" />
      ) : comment.authorAvatar && comment.authorAvatar.length <= 4 ? (
        <span className="text-lg flex-shrink-0 mt-0.5">{comment.authorAvatar}</span>
      ) : (
        // bug #13 fix: fallback for broken or empty avatar
        comment.authorAvatar ? (
          <img
            src={comment.authorAvatar}
            className="h-6 w-6 rounded-full mt-0.5 object-cover"
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="h-6 w-6 rounded-full mt-0.5 bg-gray-200 dark:bg-white/10 flex-shrink-0" />
        )
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {comment.authorUsername === 'anonymous' ? (
            <span className="text-xs font-semibold text-gray-900 dark:text-white">{comment.authorName}</span>
          ) : (
            <NextLink prefetch={false} href={`/${lang}/profile/${comment.authorUsername}`} onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-gray-900 dark:text-white hover:text-blue-500">
              @{comment.authorUsername}
            </NextLink>
          )}
          {/* bug #6 fix: cast to satisfy TypeScript, runtime validated inside formatTimestamp */}
          <span className="text-[10px] text-gray-400">{formatTimestamp(comment.createdAt, lang as 'ru' | 'en')}</span>
        </div>
        <p className="text-xs text-gray-600 dark:text-white/60 mt-0.5">{comment.content}</p>
        <div className="flex items-center gap-2 mt-1 relative cursor-pointer" onClick={() => setShowPicker(!showPicker)}>
          <CommentReactions reactions={reactions} onToggle={(emoji) => onToggleReaction(comment._id, emoji)} />
          {!isReply && (
            <button onClick={(e) => { e.stopPropagation(); onReply(comment._id) }} className="text-gray-400 hover:text-blue-500 transition-colors" title={isRu ? 'Ответить' : 'Reply'}>
              <Reply className="h-3 w-3" />
            </button>
          )}
          {user && comment.authorId === user.id && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(comment._id) }} className="text-gray-400 hover:text-red-500 transition-colors" title={isRu ? 'Удалить' : 'Delete'}>
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          <AnimatePresence>
            {showPicker && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="absolute bottom-full left-0 mb-2 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-white/10 p-1.5 flex"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex gap-1 overflow-x-auto whitespace-nowrap scroll-smooth w-[140px] overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{ touchAction: 'pan-x' }}
                >
                  {QUICK_EMOJIS.map((emoji) => (
                    <motion.button
                      key={emoji}
                      onClick={() => handleQuickReaction(emoji)}
                      whileTap={{ scale: 0.85 }}
                      className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-lg transition-colors select-none"
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

interface PostCardProps {
  post: any
  showPin?: boolean
  pollsMap?: Map<string, any>
  reactionsMap?: Map<string, any[]>
  bookmarkedPostIds?: Set<string>
}

export function PostCard({ 
  post, 
  showPin = false,
  pollsMap,
  reactionsMap,
  bookmarkedPostIds
}: PostCardProps) {
  const { user } = useUser()
  const params = useParams()
  const lang = (params?.lang as string) || 'en'
  const isRu = lang === 'ru'
  const [showComments, setShowComments] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showRepostToast, setShowRepostToast] = useState(false)
  // bug #8 fix: track reposting state to prevent duplicate requests
  const [isReposting, setIsReposting] = useState(false)
  const { content: commentText, updateContent: setCommentText, clearDraft: clearCommentDraft } = useDraft(`comment-post-${post?._id}`, 'comment')
  const [replyTo, setReplyTo] = useState<Id<'postComments'> | null>(null)
  const { content: replyText, updateContent: setReplyText, clearDraft: clearReplyDraft } = useDraft(`reply-post-${post?._id}`, 'comment')
  const [isDeleting, setIsDeleting] = useState(false)
  const polls = pollsMap?.get(post._id) ? [pollsMap.get(post._id)] : []
  const postReactions = reactionsMap?.get(post._id) ?? []
  const isBookmarked = bookmarkedPostIds?.has(post._id) ?? false

  const comments = useQuery(api.postComments.getByPost, (showComments && post && post._id) ? { postId: post._id } : 'skip')
  const togglePin = useMutation(api.posts.togglePin)
  const deletePost = useMutation(api.posts.deletePost)
  const deleteComment = useMutation(api.postComments.deleteComment)
  const createComment = useMutation(api.postComments.create)
  const toggleCommentReaction = useMutation(api.reactions.togglePostCommentReaction)
  const togglePostReaction = useMutation(api.reactions.togglePostReaction)
  const createPost = useMutation(api.posts.createPost)
  const toggleBookmark = useMutation(api.postBookmarks.toggle)

  const [mentionSearch, setMentionSearch] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [showReplyMentions, setShowReplyMentions] = useState(false)
  const searchedUsers = useQuery(api.users.searchUsers, mentionSearch ? { query: mentionSearch, limit: 5 } : 'skip')

  const [deleteConfirm, setDeleteConfirm] = useState<'post' | 'comment' | null>(null)
  const [commentToDelete, setCommentToDelete] = useState<Id<'postComments'> | null>(null)

  if (!post || !post._id) return null

  // bug #6 fix: formatTimestamp removed from here, using the single shared function above

  const handlePin = () => user && togglePin({ postId: post._id })
  const handleDelete = () => setDeleteConfirm('post')
  const handleBookmark = () => {
    if (!user) return
    toggleBookmark({
      postId: post._id,
      postContent: post.content?.slice(0, 100) || '',
      postAuthorName: post.authorName || '',
      postAuthorUsername: post.authorUsername || ''
    })
  }
  
  // bug #8 + #10 fix: rate limiting and content length check
  const handleRepost = async () => {
    if (!user || isReposting) return
    setIsReposting(true)
    try {
      const prefix = `🔄 ${isRu ? 'Репост от' : 'Repost from'} @${post.authorUsername}:\n\n`
      const trimmedContent = post.content.slice(0, MAX_POST_LENGTH - prefix.length)
      await createPost({
        authorId: user.id,
        authorName: user.fullName || 'User',
        authorAvatar: user.imageUrl || '',
        authorUsername: user.username || '',
        content: prefix + trimmedContent,
        mentions: [post.authorUsername],
        tags: post.tags || [],
      })
      setShowRepostToast(true)
      setTimeout(() => setShowRepostToast(false), 2500)
    } finally {
      setIsReposting(false)
    }
  }

  const handleComment = async (parentId?: Id<'postComments'>) => {
    if (!user) return
    const c = parentId ? replyText : commentText
    if (!c.trim()) return
    await createComment({ postId: post._id, content: c.trim(), parentCommentId: parentId })
    if (parentId) {
      setReplyText('')
      clearReplyDraft()
      setReplyTo(null)
    } else {
      setCommentText('')
      clearCommentDraft()
    }
  }
  
  const handleDeleteComment = (id: Id<'postComments'>) => {
    setCommentToDelete(id)
    setDeleteConfirm('comment')
  }
  
  // bug #11 fix: check clipboard exists, handle success and failure
  const handleShare = () => {
    if (!navigator.clipboard) {
      alert(isRu ? 'Буфер обмена недоступен' : 'Clipboard not available')
      return
    }
    navigator.clipboard
      .writeText(`${window.location.origin}/${lang}/posts/${post._id}`)
      .then(() => alert(isRu ? 'Ссылка скопирована' : 'Link copied!'))
      .catch(() => alert(isRu ? 'Не удалось скопировать' : 'Failed to copy link'))
  }

  const handleQuickReaction = (emoji: string) => {
    togglePostReaction({ postId: post._id, emoji })
    setShowReactionPicker(false)
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 sm:p-5 dark:bg-white/[0.01] relative ${post.globallyPinned ? 'border-yellow-300 ring-2 ring-yellow-100 dark:ring-yellow-500/10' : post.isPinned ? 'border-blue-200' : 'border-gray-200 dark:border-white/5'}`}>
      <div className="flex items-start gap-3">
        <NextLink prefetch={false} href={`/${lang}/profile/${post.authorUsername}`} onClick={(e) => e.stopPropagation()}>
          {post.authorId === user?.id && user?.imageUrl ? (
            <img src={user.imageUrl} className="h-10 w-10 rounded-full hover:ring-2 ring-purple-500 transition-all object-cover" alt="" />
          ) : post.authorAvatar ? (
            // bug #16 fix: fallback for broken or empty post avatar
            <img
              src={post.authorAvatar}
              className="h-10 w-10 rounded-full hover:ring-2 ring-purple-500 transition-all object-cover"
              alt=""
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-white/10 flex-shrink-0" />
          )}
        </NextLink>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.authorUsername === 'anonymous' ? (
              <span className="font-semibold text-sm text-gray-900 dark:text-white">{post.authorName}</span>
            ) : (
              <NextLink prefetch={false} href={`/${lang}/profile/${post.authorUsername}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-sm text-gray-900 dark:text-white hover:text-blue-500">
                @{post.authorUsername}
              </NextLink>
            )}
            {/* bug #6 fix: cast to satisfy TypeScript */}
            <span className="text-xs text-gray-400">{formatTimestamp(post.createdAt, lang as 'ru' | 'en')}</span>
            {post.globallyPinned && <Pin className="h-3 w-3 text-yellow-500 fill-current" />}
            {post.isPinned && !post.globallyPinned && <Pin className="h-3 w-3 text-gray-400" />}
          </div>

          <NextLink prefetch={false} href={`/${lang}/posts/${post._id}`} className="block mt-2">
            <div className="text-sm text-gray-700 dark:text-white/60 whitespace-pre-wrap">
              {renderContent(post.content, lang)}
            </div>
          </NextLink>

          {polls && polls.length > 0 && polls.map((poll: any) => (
            <div key={poll._id} className="mt-2">
              <PollCard poll={poll} />
            </div>
          ))}

          {post.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {post.tags.map((t: string) => (
                <NextLink prefetch={false} key={t} href={`/${lang}/trends?topic=${t}`} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 hover:bg-blue-100">#{t}</NextLink>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="mt-3 flex items-center border-t border-gray-100 pt-3 dark:border-white/5 relative cursor-pointer"
        onClick={(e) => {
          const isReactionButton = (e.target as HTMLElement).closest('[data-reaction-btn]')
          if (!isReactionButton) {
            setShowReactionPicker(!showReactionPicker)
          }
        }}
      >
        <CommentReactions reactions={postReactions} onToggle={e => togglePostReaction({ postId: post._id, emoji: e })} />
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={(e) => { e.stopPropagation(); setShowComments(!showComments) }} className="flex items-center gap-1 text-gray-400 hover:text-blue-500 transition-colors" title={isRu ? 'Комментарии' : 'Comments'}>
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">{post.commentCount}</span>
          </button>
          {/* bug #8 fix: disabled while reposting */}
          <button
            disabled={isReposting}
            onClick={(e) => { e.stopPropagation(); handleRepost() }}
            className="text-gray-400 hover:text-green-500 transition-colors disabled:opacity-50"
            title={isRu ? 'Репост' : 'Repost'}
          >
            <Repeat2 className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleShare() }} className="text-gray-400 hover:text-blue-500 transition-colors" title={isRu ? 'Поделиться' : 'Share'}>
            <Share2 className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleBookmark() }} className={`transition-colors ${isBookmarked ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`} title={isRu ? 'В закладки' : 'Bookmark'}>
            <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
          </button>
        </div>
        {showPin && user && post.authorId === user.id && (
          <div className="flex items-center gap-1 ml-1">
            <button onClick={(e) => { e.stopPropagation(); handlePin() }} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-yellow-500 dark:hover:bg-white/5 dark:hover:text-yellow-400 transition-all" title={isRu ? 'Закрепить' : 'Pin'}>
              <Pin className="h-4 w-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleDelete() }} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-white/5 dark:hover:text-red-400 transition-all" title={isRu ? 'Удалить' : 'Delete'}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
        <AnimatePresence>
          {showReactionPicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute bottom-full left-0 mb-2 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-white/10 p-1.5 flex"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex gap-1 overflow-x-auto whitespace-nowrap scroll-smooth w-[140px] overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ touchAction: 'pan-x' }}
              >
                {QUICK_EMOJIS.map((emoji) => (
                  <motion.button
                    key={emoji}
                    onClick={() => handleQuickReaction(emoji)}
                    whileTap={{ scale: 0.85 }}
                    className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-lg transition-colors select-none"
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showComments && (
        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/5">
          {comments?.filter((c: any) => !c.parentCommentId).map((c: any) => (
            <div key={c._id}>
              <CommentItem comment={c} isReply={false} lang={lang} onReply={id => setReplyTo(replyTo === id ? null : id)} onDelete={handleDeleteComment} onToggleReaction={(id, emoji) => toggleCommentReaction({ commentId: id, emoji })} />
              {replyTo === c._id && (
                <div className="flex items-center gap-2 mt-2 mb-3 ml-6 pl-4 border-l-2 border-gray-200 dark:border-white/10 relative">
                  <input
                    value={replyText}
                    onChange={(e) => {
                      if (e.target.value.length <= 300) setReplyText(e.target.value)
                      const val = e.target.value
                      const cursorPos = e.target.selectionStart || 0
                      const beforeCursor = val.slice(0, cursorPos)
                      const atIndex = beforeCursor.lastIndexOf('@')
                      if (atIndex !== -1 && (atIndex === 0 || beforeCursor[atIndex - 1] === ' ')) {
                        const search = beforeCursor.slice(atIndex + 1)
                        if (!search.includes(' ')) {
                          setMentionSearch(search)
                          setShowReplyMentions(true)
                          return
                        }
                      }
                      setShowReplyMentions(false)
                    }}
                    maxLength={300}
                    placeholder={isRu ? 'Написать ответ... @username' : 'Write a reply... @username'}
                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs dark:bg-white/5 dark:text-white"
                  />
                  {showReplyMentions && searchedUsers && searchedUsers.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden z-50">
                      {searchedUsers.map((u: any) => (
                        <button key={u.username} onClick={() => {
                          const before = replyText.slice(0, replyText.lastIndexOf('@'))
                          setReplyText(before + '@' + u.username + ' ')
                          setShowReplyMentions(false)
                        }} className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 text-left">
                          {user && u.username === user.username ? (
                            <img src={user.imageUrl} className="h-4 w-4 rounded-full object-cover" alt="" />
                          ) : (
                            <img src={u.avatar} className="h-4 w-4 rounded-full object-cover" alt="" />
                          )}
                          <span className="text-[10px] font-semibold text-gray-900 dark:text-white">@{u.username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => handleComment(c._id)} className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all"><Send className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {comments?.filter((r: any) => r.parentCommentId === c._id).map((r: any) => (
                <CommentItem key={r._id} comment={r} isReply={true} lang={lang} onReply={() => {}} onDelete={handleDeleteComment} onToggleReaction={(id, emoji) => toggleCommentReaction({ commentId: id, emoji })} />
              ))}
            </div>
          ))}
          <div className="flex items-center gap-2 mt-3 relative">
            <input
              value={commentText}
              onChange={(e) => {
                if (e.target.value.length <= 300) setCommentText(e.target.value)
                const val = e.target.value
                const cursorPos = e.target.selectionStart || 0
                const beforeCursor = val.slice(0, cursorPos)
                const atIndex = beforeCursor.lastIndexOf('@')
                if (atIndex !== -1 && (atIndex === 0 || beforeCursor[atIndex - 1] === ' ')) {
                  const search = beforeCursor.slice(atIndex + 1)
                  if (!search.includes(' ')) {
                    setMentionSearch(search)
                    setShowMentions(true)
                    return
                  }
                }
                setShowMentions(false)
              }}
              maxLength={300}
              placeholder={isRu ? 'Написать комментарий... @username' : 'Write a comment... @username'}
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs focus:outline-none dark:bg-white/5 dark:text-white"
            />
            <span className="text-[10px] text-gray-400 flex-shrink-0">{commentText.length}/300</span>
            {showMentions && searchedUsers && searchedUsers.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden z-50">
                {searchedUsers.map((u: any) => (
                  <button key={u.username} onClick={() => {
                    const before = commentText.slice(0, commentText.lastIndexOf('@'))
                    setCommentText(before + '@' + u.username + ' ')
                    setShowMentions(false)
                  }} className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 text-left">
                    {user && u.username === user.username ? (
                      <img src={user.imageUrl} className="h-4 w-4 rounded-full object-cover" alt="" />
                    ) : (
                      <img src={u.avatar} className="h-4 w-4 rounded-full object-cover" alt="" />
                    )}
                    <span className="text-[10px] font-semibold text-gray-900 dark:text-white">@{u.username}</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => handleComment()} className="rounded-lg p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10"><Send className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showRepostToast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 rounded-full bg-gray-900 dark:bg-white px-4 py-1.5 shadow-lg"
          >
            <p className="text-xs font-semibold text-white dark:text-gray-900">🔄 {isRu ? 'Репост сделан!' : 'Reposted!'}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteConfirm === 'post' && !isDeleting}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={async () => {
          setIsDeleting(true)
          setDeleteConfirm(null)
          await new Promise(r => setTimeout(r, 300))
          await deletePost({ postId: post._id })
        }}
        title={isRu ? 'Удалить пост' : 'Delete Post'}
        message={isRu ? 'Это действие нельзя отменить. Вы уверены, что хотите удалить этот пост?' : 'This action cannot be undone. Are you sure you want to delete this post?'}
      />

      <ConfirmModal
        isOpen={deleteConfirm === 'comment'}
        onClose={() => { setDeleteConfirm(null); setCommentToDelete(null) }}
        onConfirm={() => {
          if (commentToDelete) {
            deleteComment({ commentId: commentToDelete })
          }
          setDeleteConfirm(null)
          setCommentToDelete(null)
        }}
        title={isRu ? 'Удалить комментарий' : 'Delete Comment'}
        message={isRu ? 'Вы уверены, что хотите удалить этот комментарий?' : 'Are you sure you want to delete this comment?'}
      />
    </div>
  )
}

export default function PostCardDefault({ post, showPin = false }: { post: any; showPin?: boolean }) {
  return <PostCard post={post} showPin={showPin} />
}

