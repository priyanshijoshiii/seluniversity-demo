// Файл: hooks/useDraft.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import { saveDraft, getDraft, deleteDraft } from '@/lib/drafts'

export function useDraft(key: string, type: 'post' | 'comment' | 'puzzle') {
  const [content, setContent] = useState('')

  useEffect(() => {
    const draft = getDraft(key)
    if (draft && draft.content) {
      setContent(draft.content)
    }
  }, [key])

  const updateContent = useCallback((newContent: string) => {
    setContent(newContent)
    if (newContent.trim()) {
      saveDraft(key, newContent, type)
    } else {
      deleteDraft(key)
    }
  }, [key, type])

  const clearDraft = useCallback(() => {
    setContent('')
    deleteDraft(key)
  }, [key])

  return { content, updateContent, clearDraft }
}