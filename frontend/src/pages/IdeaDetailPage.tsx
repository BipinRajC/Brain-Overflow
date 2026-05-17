import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Zap } from 'lucide-react'
import { useIdea } from '@/hooks/useIdea'
import { ScoreRing } from '@/components/idea/ScoreRing'
import { IdeaTimeline } from '@/components/idea/IdeaTimeline'
import { IdeaChat } from '@/components/idea/IdeaChat'
import { RunsSidebar } from '@/components/RunsSidebar'
import { QuoteFooter } from '@/components/shell/QuoteFooter'
import { listRuns } from '@/lib/api/runs'
import { listFlows } from '@/lib/api/flows'
import { getSupabase } from '@/lib/supabase'
import type { Idea, IdeaRun, Flow } from '@/types'

const STATUS_META: Record<Idea['status'], { label: string; tone: string }> = {
  recorded: { label: 'RECORDED', tone: 'var(--color-text-mute)' },
  processing: { label: 'PROCESSING', tone: 'var(--color-pivot)' },
  completed: { label: 'COMPLETED', tone: 'var(--color-strong)' },
  failed: { label: 'FAILED', tone: 'var(--color-weak)' },
}

const CATEGORY_LABELS: Record<NonNullable<Idea['category']>, string> = {
  startup_idea: 'Startup',
  automation: 'Automation',
  personal_tool: 'Personal Tool',
  dev_tool: 'Dev Tool',
  other: 'Other',
}

export function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { idea, messages, loading, error, refetch } = useIdea(id)

  const [searchParams, setSearchParams] = useSearchParams()
  const runIdParam = searchParams.get('run')

  const [runs, setRuns] = useState<IdeaRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [flows, setFlows] = useState<Flow[]>([])

  useEffect(() => {
    if (!idea?.id) return

    Promise.all([
      listRuns(idea.id),
      listFlows(),
    ]).then(([fetchedRuns, fetchedFlows]) => {
      setRuns(fetchedRuns)
      setFlows(fetchedFlows)

      const fromUrl = fetchedRuns.find(r => r.id === runIdParam)
      if (fromUrl) {
        setSelectedRunId(fromUrl.id)
      } else if (fetchedRuns.length > 0) {
        setSelectedRunId(fetchedRuns[0].id)
      }
    }).catch(() => {})
  }, [idea?.id, runIdParam])

  useEffect(() => {
    if (!idea?.id) return

    const sb = getSupabase()
    const channel = sb
      .channel(`idea-runs-${idea.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'idea_runs',
          filter: `idea_id=eq.${idea.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setRuns(prev => {
              const incoming = payload.new as IdeaRun
              if (prev.some(r => r.id === incoming.id)) return prev
              return [incoming, ...prev]
            })
          } else if (payload.eventType === 'UPDATE') {
            setRuns(prev => prev.map(r =>
              r.id === (payload.new as IdeaRun).id ? { ...r, ...payload.new as IdeaRun } : r
            ))
          }
        }
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [idea?.id])

  function handleRunSelect(runId: string) {
    setSelectedRunId(runId)
    setSearchParams(prev => { prev.set('run', runId); return prev })
  }

  if (loading && !idea) {
    return (
      <div className="min-h-[100dvh] pt-24 px-4 md:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="h-8 w-48 bg-[color:var(--color-surface)] animate-pulse mb-8" />
          <div className="h-72 bg-[color:var(--color-surface)] animate-pulse mb-6" />
          <div className="h-96 bg-[color:var(--color-surface)] animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !idea) {
    return (
      <div className="min-h-[100dvh] pt-24 px-4 md:px-8">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/ideas"
            className="inline-flex items-center gap-2 font-mono text-xs text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)] mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> back
          </Link>
          <div className="border border-[color:var(--color-weak)]/40 p-6 text-center">
            <Zap className="h-10 w-10 mx-auto mb-3 text-[color:var(--color-text-dim)]" />
            <p className="font-pixel text-sm tracking-wider mb-2">
              {error ? 'TRANSMISSION_LOST' : 'IDEA_NOT_FOUND'}
            </p>
            {error && (
              <p className="font-mono text-xs text-[color:var(--color-text-mute)]">{error}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const status = STATUS_META[idea.status]

  // Filter messages to selected run; 'legacy' shows messages with null run_id
  const displayedMessages = selectedRunId
    ? messages.filter(m =>
        m.message_type === 'idea' ||
        (selectedRunId === 'legacy' ? m.run_id === null : m.run_id === selectedRunId)
      )
    : messages

  // Append a legacy entry if there are messages without run_id
  const legacyMessages = messages.filter(m => m.run_id === null && m.message_type !== 'idea')
  const runsWithLegacy: IdeaRun[] = legacyMessages.length > 0
    ? [...runs, {
        id: 'legacy',
        idea_id: idea.id,
        flow_id: null,
        model_id: null,
        status: 'completed' as const,
        category: null,
        score: null,
        validation_state: 'valid' as const,
        total_tokens: 0,
        error_message: null,
        completed_at: null,
        created_at: idea.created_at,
        updated_at: idea.created_at,
        flow: { flow_name: 'Legacy' },
      }]
    : runs

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24 }}
      className="relative min-h-[100dvh] pt-20 pb-32 px-4 md:px-10 xl:px-16"
    >
      <div className="mx-auto max-w-screen-2xl">
        <Link
          to="/ideas"
          className="inline-flex items-center gap-2 font-mono text-xs text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)] mb-6 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> back to ideas
        </Link>

        {/* Full-width header — idea text needs all the horizontal space it can get */}
        <div className="border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/40 backdrop-blur p-6 md:p-8 mb-8">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              <h1 className="font-mono text-base md:text-lg leading-relaxed text-[color:var(--color-text)] mb-4">
                {idea.idea}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: status.tone, boxShadow: `0 0 6px ${status.tone}80` }}
                  />
                  <span
                    className="font-pixel text-[10px] tracking-[0.2em] uppercase"
                    style={{ color: status.tone }}
                  >
                    {status.label}
                  </span>
                </div>
                {idea.category && (
                  <span className="font-pixel text-[10px] tracking-[0.2em] uppercase text-[color:var(--color-text-mute)]">
                    {CATEGORY_LABELS[idea.category]}
                  </span>
                )}
                <span className="font-mono text-[10px] text-[color:var(--color-text-dim)]">
                  {new Date(idea.created_at).toLocaleString()}
                </span>
              </div>
            </div>
            <ScoreRing score={idea.score} />
          </div>
        </div>

        {/* Two-column: narrow left (timeline + runs) | wide right (chat) */}
        <div className="flex gap-8 xl:gap-10 items-start">

          {/* LEFT — fixed-width panel for timeline + runs */}
          <div className="flex flex-col gap-6 w-64 shrink-0">
            <div>
              <h2 className="font-pixel text-[11px] tracking-[0.2em] uppercase text-[color:var(--color-text-mute)] mb-3">
                EXECUTION_TIMELINE
              </h2>
              <IdeaTimeline idea={idea} messages={messages} />
            </div>

            <div>
              <h2 className="font-pixel text-[11px] tracking-[0.2em] uppercase text-[color:var(--color-text-mute)] mb-3">
                RUNS
              </h2>
              <RunsSidebar
                ideaId={idea.id}
                runs={runsWithLegacy}
                flows={flows}
                selectedRunId={selectedRunId}
                onRunSelect={handleRunSelect}
                onRunCreated={(run) => {
                  setRuns(prev => {
                    const exists = prev.some(r => r.id === run.id)
                    if (exists) return prev.map(r => r.id === run.id ? run : r)
                    return [run, ...prev]
                  })
                }}
              />
            </div>
          </div>

          {/* RIGHT — chat fills the remaining width */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="font-pixel text-[11px] tracking-[0.2em] uppercase text-[color:var(--color-text-mute)]">
                TRANSMISSIONS
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const visible = displayedMessages.filter((m) => m.message_type !== 'prompt')
                    const text = visible.map((m) => {
                      const role = m.message_type === 'response' ? 'AI' : 'YOU'
                      return `${role}:\n${m.message}\n`
                    }).join('\n')
                    navigator.clipboard.writeText(text)
                  }}
                  className="font-pixel text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)] border border-[color:var(--color-edge)] px-3 py-1 transition-colors"
                >
                  COPY ALL
                </button>
                <button
                  onClick={() => {
                    const visible = displayedMessages.filter((m) => m.message_type !== 'prompt')
                    const lines = [
                      `# Brain Overflow — Chat Export`,
                      `**Idea**: ${idea.idea}`,
                      `**Date**: ${new Date().toLocaleString()}`,
                      ``, `---`, ``,
                    ]
                    for (const msg of visible) {
                      lines.push(msg.message_type === 'response' ? '**AI:**' : '**YOU:**')
                      lines.push('')
                      lines.push(msg.message)
                      lines.push('')
                    }
                    const slug = idea.idea.slice(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase()
                    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `brain-overflow-${slug}.md`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }}
                  className="font-pixel text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)] border border-[color:var(--color-edge)] px-3 py-1 transition-colors"
                >
                  EXPORT .MD
                </button>
                <button
                  onClick={() => window.print()}
                  className="font-pixel text-[10px] tracking-[0.18em] uppercase text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)] border border-[color:var(--color-edge)] px-3 py-1 transition-colors"
                >
                  EXPORT PDF
                </button>
              </div>
            </div>
            <IdeaChat
              ideaId={idea.id}
              idea={idea}
              messages={displayedMessages}
              onUpdate={refetch}
            />
          </div>
        </div>
      </div>
      <QuoteFooter />
    </motion.div>
  )
}
