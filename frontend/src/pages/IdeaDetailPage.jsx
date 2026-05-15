import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowClockwise, CheckCircle, Circle,
  TrendUp, TrendDown, ArrowsClockwise, Clock,
  Lightning, Warning
} from '@phosphor-icons/react'
import { getSupabase } from '../lib/supabase.js'
import IdeaChat from '../components/IdeaChat.jsx'

const STATUS_CONFIG = {
  recorded:   { label: 'Recorded',   color: '#5a6a7d', bg: 'bg-[rgba(90,106,125,0.15)]' },
  processing: { label: 'Processing', color: '#ffa502', bg: 'bg-status-orange' },
  completed:  { label: 'Completed',  color: '#2ed573', bg: 'bg-status-green' },
  failed:     { label: 'Failed',     color: '#ff4757', bg: 'bg-status-red' },
}

const SCORE_CONFIG = {
  strong:           { label: 'Strong',            color: '#2ed573', icon: TrendUp },
  weak:             { label: 'Weak',              color: '#ff4757', icon: TrendDown },
  needs_pivot:      { label: 'Needs Pivot',       color: '#ffa502', icon: ArrowsClockwise },
  needs_refinement: { label: 'Needs Refinement',  color: '#fcc419', icon: Clock },
}

const CATEGORY_LABELS = {
  startup_idea: 'Startup Idea',
  automation: 'Automation',
  personal_tool: 'Personal Tool',
  dev_tool: 'Dev Tool',
  other: 'Other',
}

function ScoreRing({ score }) {
  const config = SCORE_CONFIG[score]
  if (!config) return null

  const Icon = config.icon
  const scoreValue = {
    strong: 100,
    needs_refinement: 75,
    needs_pivot: 50,
    weak: 25,
  }[score] || 0

  const circumference = 2 * Math.PI * 40
  const strokeDashoffset = circumference - (scoreValue / 100) * circumference

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="40"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="6"
          />
          <motion.circle
            cx="50" cy="50" r="40"
            fill="none"
            stroke={config.color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-6 h-6" style={{ color: config.color }} />
        </div>
      </div>
      <div>
        <p className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          Validation Score
        </p>
        <p className="text-2xl font-bold" style={{ color: config.color }}>
          {config.label}
        </p>
      </div>
    </div>
  )
}

function Timeline({ messages, status }) {
  const steps = messages
    .filter(m => m.message_type === 'prompt')
    .map((m, i) => ({
      id: m.id,
      label: `Step ${i + 1}`,
      completed: true,
      promptId: m.prompt_id,
    }))

  if (status === 'processing') {
    steps.push({ id: 'current', label: 'Analyzing...', completed: false, current: true })
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center gap-2 shrink-0">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono uppercase ${
            step.completed
              ? 'bg-status-green text-[#2ed573]'
              : step.current
              ? 'bg-status-orange text-[#ffa502] animate-pulse'
              : 'bg-[rgba(90,106,125,0.15)] text-[var(--color-text-muted)]'
          }`}>
            {step.completed ? (
              <CheckCircle className="w-3 h-3" weight="fill" />
            ) : step.current ? (
              <Circle className="w-3 h-3" weight="fill" />
            ) : (
              <Circle className="w-3 h-3" />
            )}
            {step.label}
          </div>
          {index < steps.length - 1 && (
            <div className="w-4 h-px bg-[var(--color-border-subtle)]" />
          )}
        </div>
      ))}
    </div>
  )
}

export default function IdeaDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [idea, setIdea] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const sb = getSupabase()
      const [{ data: ideaRow, error: ie }, { data: msgs, error: me }] = await Promise.all([
        sb.from('ideas').select('*').eq('id', id).single(),
        sb.from('chat_messages').select('*').eq('idea_id', id).order('sequence_number', { ascending: true }),
      ])
      if (ie) throw ie
      if (me) throw me
      setIdea(ideaRow)
      setMessages(msgs || [])
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Poll while processing
  useEffect(() => {
    if (!idea || idea.status !== 'processing') return

    const interval = setInterval(() => {
      fetchData()
    }, 2000)

    return () => clearInterval(interval)
  }, [idea, fetchData])

  if (loading && !idea) {
    return (
      <div className="min-h-[100dvh] pt-24 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-shimmer h-8 w-48 rounded-lg mb-8" />
          <div className="liquid-glass rounded-xl p-6 h-96 animate-shimmer" />
        </div>
      </div>
    )
  }

  if (err) {
    return (
      <div className="min-h-[100dvh] pt-24 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 p-6 rounded-xl bg-status-red text-[#ff4757]"
          >
            <Warning className="w-6 h-6" />
            <p>{err}</p>
          </motion.div>
        </div>
      </div>
    )
  }

  if (!idea) {
    return (
      <div className="min-h-[100dvh] pt-24 px-4 md:px-8">
        <div className="max-w-4xl mx-auto text-center py-20">
          <Lightning className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-dim)]" />
          <p className="text-lg">Idea not found</p>
        </div>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[idea.status] || STATUS_CONFIG.recorded
  const scoreConfig = idea.score ? SCORE_CONFIG[idea.score] : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-[100dvh] pt-24 px-4 md:px-8 pb-12"
    >
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate('/ideas')}
          className="flex items-center gap-2 text-sm mb-6 hover:text-[#00d4ff] transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Ideas
        </motion.button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="liquid-glass rounded-2xl p-6 md:p-8 mb-6"
        >
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-xl md:text-2xl font-bold leading-relaxed mb-4">
                {idea.idea}
              </h1>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={`text-xs font-mono uppercase px-2 py-1 rounded ${statusConfig.bg} ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
                {idea.category && (
                  <span className="text-xs font-mono uppercase px-2 py-1 rounded bg-[rgba(0,212,255,0.1)] text-[#00d4ff]">
                    {CATEGORY_LABELS[idea.category] || idea.category}
                  </span>
                )}
              </div>

              <Timeline messages={messages} status={idea.status} />
            </div>

            {scoreConfig && (
              <ScoreRing score={idea.score} />
            )}
          </div>
        </motion.div>

        {/* Chat */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="liquid-glass rounded-2xl p-6 md:p-8"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Conversation</h2>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-[rgba(255,255,255,0.03)] transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <ArrowClockwise className="w-4 h-4" />
              Refresh
            </button>
          </div>

          <IdeaChat
            ideaId={id}
            messages={messages}
            idea={idea}
            onUpdate={fetchData}
          />
        </motion.div>
      </div>
    </motion.div>
  )
}
