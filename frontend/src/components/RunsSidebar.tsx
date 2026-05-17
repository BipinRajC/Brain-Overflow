import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { startRun } from '@/lib/api/runs'
import type { IdeaRun, Flow } from '@/types'

interface RunsSidebarProps {
  ideaId: string
  runs: IdeaRun[]
  flows: Flow[]
  selectedRunId: string | null
  onRunSelect: (runId: string) => void
  onRunCreated: (run: IdeaRun) => void
}

function statusColor(status: IdeaRun['status']): string {
  switch (status) {
    case 'completed': return 'text-[color:var(--color-strong)]'
    case 'failed':    return 'text-[color:var(--color-weak)]'
    case 'partial':   return 'text-[color:var(--color-text-mute)]'
    default:          return 'text-[color:var(--color-text-mute)]'
  }
}

function RunStatusIndicator({ status }: { status: IdeaRun['status'] }) {
  if (status === 'processing') {
    return (
      <span className="inline-block h-2 w-2 rounded-full border border-[color:var(--color-edge-glow)] border-t-transparent animate-spin" />
    )
  }
  if (status === 'queued') {
    return (
      <span className="inline-block h-2 w-2 rounded-full bg-[color:var(--color-text-dim)] animate-pulse opacity-50" />
    )
  }
  return null
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function RunsSidebar({
  ideaId,
  runs,
  flows,
  selectedRunId,
  onRunSelect,
  onRunCreated,
}: RunsSidebarProps) {
  const [showFlowPicker, setShowFlowPicker] = useState(false)
  const [selectedFlowId, setSelectedFlowId] = useState<string>(flows[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Sync selectedFlowId when flows load asynchronously (useState initializer only runs once)
  useEffect(() => {
    if (selectedFlowId === '' && flows.length > 0) {
      setSelectedFlowId(flows[0].id)
    }
  }, [flows, selectedFlowId])

  async function handleStartRun() {
    if (!selectedFlowId) return
    setBusy(true)
    setErr('')

    const flow = flows.find(f => f.id === selectedFlowId)
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticRun: IdeaRun = {
      id: optimisticId,
      idea_id: ideaId,
      flow_id: selectedFlowId,
      model_id: null,
      status: 'queued',
      category: null,
      score: null,
      validation_state: 'valid',
      total_tokens: 0,
      error_message: null,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      flow: flow ? { flow_name: flow.flow_name } : undefined,
    }
    onRunCreated(optimisticRun)
    setShowFlowPicker(false)

    try {
      const { run_id } = await startRun(ideaId, selectedFlowId)
      onRunCreated({ ...optimisticRun, id: run_id })
      onRunSelect(run_id)
    } catch (e) {
      onRunCreated({ ...optimisticRun, id: optimisticId, status: 'failed', error_message: e instanceof Error ? e.message : 'Failed' })
      setErr(e instanceof Error ? e.message : 'Failed to start run')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="flex flex-col gap-3 w-52 shrink-0">
      <div>
        <Button
          size="sm"
          variant="outline"
          className="w-full font-pixel text-[10px] tracking-[0.15em]"
          onClick={() => { setShowFlowPicker(v => !v); setErr('') }}
          disabled={busy || flows.length === 0}
        >
          RUN WITH FLOW
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>

        <AnimatePresence>
          {showFlowPicker && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-2 p-3 border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/80"
            >
              <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
                <SelectTrigger className="h-7 text-xs font-mono mb-2">
                  <SelectValue placeholder="Select flow" />
                </SelectTrigger>
                <SelectContent>
                  {flows.map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-xs font-mono">
                      {f.flow_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="w-full text-[10px]"
                onClick={handleStartRun}
                disabled={busy || !selectedFlowId}
              >
                {busy ? 'STARTING…' : 'START'}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {err && (
          <p className="mt-1 text-[10px] font-mono text-[color:var(--color-weak)]">
            ! {err}
          </p>
        )}
      </div>

      <div className="space-y-1">
        {runs.length === 0 && (
          <p className="text-[10px] font-mono text-[color:var(--color-text-mute)]">
            no runs yet
          </p>
        )}
        {runs.map(run => (
          <button
            key={run.id}
            onClick={() => onRunSelect(run.id)}
            className={`
              w-full text-left px-3 py-2.5 border transition-all
              ${run.id === selectedRunId
                ? 'border-[color:var(--color-edge-glow)] bg-[color:var(--color-surface)]/60'
                : 'border-[color:var(--color-edge)] bg-transparent hover:border-[color:var(--color-edge-glow)]/50'
              }
              ${run.status === 'queued' ? 'opacity-50' : ''}
            `}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <RunStatusIndicator status={run.status} />
              <span className="font-pixel text-[10px] tracking-[0.1em] truncate">
                {run.flow?.flow_name ?? 'Unknown flow'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {run.score && (
                <span className={`font-mono text-[9px] uppercase ${statusColor(run.status)}`}>
                  {run.score}
                </span>
              )}
              {run.score && (
                <span className="text-[color:var(--color-text-dim)] text-[9px]">·</span>
              )}
              <span className="font-mono text-[9px] text-[color:var(--color-text-mute)]">
                {run.status}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[9px] text-[color:var(--color-text-dim)]">
              {relativeTime(run.created_at)}
            </div>
          </button>
        ))}
      </div>
    </aside>
  )
}
