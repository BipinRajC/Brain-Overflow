import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createElement } from 'react'
import { isConfigured, getSupabase } from '@/lib/supabase'

interface PulseState {
  activeIds: string[]
  count: number
  completedEvents: CompletedEvent[]
}

export interface CompletedEvent {
  id: string
  score: string | null
  idea: string
  ts: number
}

const PulseContext = createContext<PulseState>({
  activeIds: [],
  count: 0,
  completedEvents: [],
})

export function ProcessingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PulseState>({
    activeIds: [],
    count: 0,
    completedEvents: [],
  })
  const prevSnapshotRef = useRef<Map<string, { status: string; score: string | null; idea: string }>>(
    new Map(),
  )

  useEffect(() => {
    let cancelled = false

    async function poll() {
      if (document.hidden) return
      if (!isConfigured()) return
      try {
        const sb = getSupabase()
        const { data, error } = await sb
          .from('ideas')
          .select('id, status, score, idea')
          .order('created_at', { ascending: false })
          .limit(50)
        if (error || cancelled) return

        const rows = (data ?? []) as Array<{
          id: string
          status: string
          score: string | null
          idea: string
        }>
        const activeIds = rows.filter((r) => r.status === 'processing').map((r) => r.id)
        const prev = prevSnapshotRef.current
        const newCompleted: CompletedEvent[] = []
        for (const r of rows) {
          const before = prev.get(r.id)
          if (
            before &&
            before.status === 'processing' &&
            (r.status === 'completed' || r.status === 'failed') &&
            r.score
          ) {
            newCompleted.push({ id: r.id, score: r.score, idea: r.idea, ts: Date.now() })
          }
        }
        prevSnapshotRef.current = new Map(
          rows.map((r) => [r.id, { status: r.status, score: r.score, idea: r.idea }]),
        )
        setState((s) => ({
          activeIds,
          count: activeIds.length,
          completedEvents: newCompleted.length
            ? [...s.completedEvents, ...newCompleted].slice(-20)
            : s.completedEvents,
        }))
      } catch {
        /* swallow */
      }
    }

    poll()
    const id = window.setInterval(poll, 2000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return createElement(PulseContext.Provider, { value: state }, children)
}

export function useProcessingPulse() {
  return useContext(PulseContext)
}
