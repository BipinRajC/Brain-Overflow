import { useEffect, useState } from 'react'
import { getSupabase, isConfigured } from '@/lib/supabase'

export type BootFrame = 'init' | 'verify' | 'probe' | 'reveal' | 'done' | 'setup' | 'error'

interface BootState {
  frame: BootFrame
  message: string
  error?: string
}

export function useBootSequence() {
  const [state, setState] = useState<BootState>({ frame: 'init', message: 'INITIALIZING…' })

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let timers: number[] = []
    let cancelled = false

    function setFrame(frame: BootFrame, message: string, error?: string) {
      if (cancelled) return
      setState({ frame, message, error })
    }

    function schedule(fn: () => void, delay: number) {
      const t = window.setTimeout(fn, reducedMotion ? 0 : delay)
      timers.push(t)
    }

    // Frame 1: init
    schedule(() => {
      // Frame 2: verify
      setFrame('verify', '> verifying credentials')
      if (!isConfigured()) {
        schedule(() => setFrame('setup', '> setup required'), 300)
        return
      }
      // Frame 3: probe
      schedule(async () => {
        setFrame('probe', '> probing supabase')
        try {
          const sb = getSupabase()
          const { error } = await sb.from('ideas').select('id').limit(1)
          if (cancelled) return
          if (error) {
            setFrame('error', '> CONNECTION_LOST', error.message)
            return
          }
          schedule(() => setFrame('reveal', '> initialization complete'), 200)
          schedule(() => setFrame('done', ''), 400)
        } catch (e) {
          setFrame('error', '> CONNECTION_LOST', e instanceof Error ? e.message : 'Unknown')
        }
      }, 400)
    }, 300)

    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  return state
}
