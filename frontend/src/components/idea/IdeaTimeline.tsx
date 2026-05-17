import { useEffect, useMemo, useState } from 'react'
import { listPrompts } from '@/lib/api/prompts'
import { getDefaultFlow, listFlows } from '@/lib/api/flows'
import type { ChatMessage, Flow, Idea, Prompt } from '@/types'

interface Props {
  idea: Idea
  messages: ChatMessage[]
}

type StepStatus = 'completed' | 'in-progress' | 'failed' | 'pending'

interface StepEvent {
  label: string
  status: 'completed' | 'failed' | 'pending'
}

interface Step {
  id: string
  name: string
  status: StepStatus
  events: StepEvent[]
}

function StatusDot({ status }: { status: StepStatus | 'completed' | 'failed' | 'pending' }) {
  if (status === 'completed') {
    return (
      <span className="flex h-4 w-4 items-center justify-center shrink-0">
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-[color:var(--color-strong)]" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="flex h-4 w-4 items-center justify-center shrink-0">
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-[color:var(--color-weak)]" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  if (status === 'in-progress') {
    return (
      <span className="flex h-4 w-4 items-center justify-center shrink-0">
        <span className="h-2.5 w-2.5 rounded-full border border-[color:var(--color-pivot)] border-t-transparent animate-spin" />
      </span>
    )
  }
  return (
    <span className="flex h-4 w-4 items-center justify-center shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-edge)]" />
    </span>
  )
}

export function IdeaTimeline({ idea, messages }: Props) {
  const [flow, setFlow] = useState<Flow | null>(null)
  const [prompts, setPrompts] = useState<Prompt[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [allPrompts, allFlows] = await Promise.all([listPrompts(), listFlows()])
      if (cancelled) return
      setPrompts(allPrompts)
      let f = allFlows.find((x) => x.id === idea.flow_id) ?? null
      if (!f) f = await getDefaultFlow()
      setFlow(f)
    }
    load().catch(() => {})
    return () => { cancelled = true }
  }, [idea.flow_id])

  const steps: Step[] = useMemo(() => {
    if (!flow) return []
    const promptMsgs = messages.filter((m) => m.message_type === 'prompt')
    const responseMsgs = messages.filter((m) => m.message_type === 'response')

    return flow.prompt_ids.map((pid, idx) => {
      const prompt = prompts.find((p) => p.id === pid)
      const sent = idx < promptMsgs.length
      const responded = idx < responseMsgs.length
      const isCurrent = idea.status === 'processing' && sent && !responded
      const isFailedHere = idea.status === 'failed' && idx === promptMsgs.length - 1 && !responded

      const status: StepStatus = responded
        ? 'completed'
        : isFailedHere
          ? 'failed'
          : isCurrent || (idea.status === 'processing' && idx === promptMsgs.length)
            ? 'in-progress'
            : 'pending'

      const events: StepEvent[] = [
        { label: 'prompt sent', status: sent ? 'completed' : 'pending' },
        { label: 'llm responded', status: responded ? 'completed' : 'pending' },
        { label: 'parsed & validated', status: responded ? 'completed' : isFailedHere ? 'failed' : 'pending' },
        { label: 'idea updated', status: responded ? 'completed' : 'pending' },
      ]

      return {
        id: pid,
        name: prompt?.prompt_name ?? `Step ${idx + 1}`,
        status,
        events,
      }
    })
  }, [flow, prompts, messages, idea.status])

  if (!flow || steps.length === 0) {
    return (
      <div className="border border-[color:var(--color-edge)] px-4 py-5 text-center font-mono text-xs text-[color:var(--color-text-mute)]">
        no flow attached.
      </div>
    )
  }

  return (
    <div className="border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/40 backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[color:var(--color-edge)] flex items-center justify-between">
        <span className="font-pixel text-[10px] tracking-[0.22em] uppercase text-[color:var(--color-text-mute)]">
          {flow.flow_name}
        </span>
        <span className="font-mono text-[10px] text-[color:var(--color-text-dim)]">
          {steps.length} steps
        </span>
      </div>

      {/* Steps */}
      <div className="divide-y divide-[color:var(--color-edge)]/50">
        {steps.map((step, i) => (
          <StepRow key={step.id} step={step} index={i} />
        ))}
      </div>
    </div>
  )
}

function StepRow({ step, index }: { step: Step; index: number }) {
  const [expanded, setExpanded] = useState(step.status === 'in-progress' || step.status === 'failed')

  return (
    <div>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[color:var(--color-surface)]/60 transition-colors text-left"
      >
        <StatusDot status={step.status} />
        <span className={`flex-1 font-mono text-xs truncate ${
          step.status === 'completed'
            ? 'text-[color:var(--color-text-mute)] line-through decoration-[color:var(--color-edge)]'
            : step.status === 'failed'
              ? 'text-[color:var(--color-weak)]'
              : step.status === 'in-progress'
                ? 'text-[color:var(--color-text)]'
                : 'text-[color:var(--color-text-dim)]'
        }`}>
          {step.name}
        </span>
        <span className={`font-pixel text-[9px] tracking-[0.15em] uppercase shrink-0 ${
          step.status === 'completed' ? 'text-[color:var(--color-strong)]'
          : step.status === 'failed' ? 'text-[color:var(--color-weak)]'
          : step.status === 'in-progress' ? 'text-[color:var(--color-pivot)]'
          : 'text-[color:var(--color-text-dim)]'
        }`}>
          {step.status === 'in-progress' ? 'running' : step.status}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pl-11 space-y-1.5">
          {step.events.map((ev) => (
            <div key={ev.label} className="flex items-center gap-2">
              <StatusDot status={ev.status} />
              <span className={`font-mono text-[11px] ${
                ev.status === 'completed'
                  ? 'text-[color:var(--color-text-dim)] line-through'
                  : ev.status === 'failed'
                    ? 'text-[color:var(--color-weak)]'
                    : 'text-[color:var(--color-text-dim)] opacity-40'
              }`}>
                {ev.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
