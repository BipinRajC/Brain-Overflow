import { useCallback, useEffect, useRef, useState } from 'react'
import { listIdeas } from '@/lib/api/ideas'
import type { Idea } from '@/types'

export function useIdeas() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const mountedRef = useRef(true)

  const fetchAll = useCallback(async () => {
    try {
      const rows = await listIdeas()
      if (!mountedRef.current) return
      setIdeas(rows)
      setError('')
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load ideas')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchAll()
    return () => {
      mountedRef.current = false
    }
  }, [fetchAll])

  useEffect(() => {
    const hasProcessing = ideas.some((i) => i.status === 'processing')
    if (!hasProcessing) return
    const id = window.setInterval(() => {
      if (!document.hidden) fetchAll()
    }, 2000)
    return () => window.clearInterval(id)
  }, [ideas, fetchAll])

  return { ideas, loading, error, refetch: fetchAll }
}
