import { useCallback, useEffect, useRef, useState } from 'react'
import { getIdea } from '@/lib/api/ideas'
import { listByIdea } from '@/lib/api/chatMessages'
import type { ChatMessage, Idea } from '@/types'

export function useIdea(id: string | undefined) {
  const [idea, setIdea] = useState<Idea | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const mountedRef = useRef(true)

  const fetchAll = useCallback(async () => {
    if (!id) return
    try {
      const [ideaRow, msgs] = await Promise.all([getIdea(id), listByIdea(id)])
      if (!mountedRef.current) return
      setIdea(ideaRow)
      setMessages(msgs)
      setError('')
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load idea')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchAll()
    return () => {
      mountedRef.current = false
    }
  }, [fetchAll])

  useEffect(() => {
    if (!idea || idea.status !== 'processing') return
    const tid = window.setInterval(() => {
      if (!document.hidden) fetchAll()
    }, 2000)
    return () => window.clearInterval(tid)
  }, [idea, fetchAll])

  return { idea, messages, loading, error, refetch: fetchAll }
}
