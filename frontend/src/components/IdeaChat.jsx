import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PaperPlaneRight, User, Robot, Spinner } from '@phosphor-icons/react'
import { getSupabase } from '../lib/supabase.js'

function renderMarkdown(text) {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-[rgba(0,0,0,0.4)] border border-[var(--color-border-subtle)] rounded-lg p-4 overflow-x-auto mb-4"><code class="text-sm font-mono">$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-[rgba(255,255,255,0.08)] rounded px-1 py-0.5 text-sm font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-5 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-[var(--color-border-subtle)] pl-4 my-3 text-[var(--color-text-muted)]">$1</blockquote>')
    .replace(/\n/g, '<br/>')
  return html
}

const ROLE_CONFIG = {
  idea: { label: 'You', icon: User, color: '#e8ecf1', bg: 'bg-[rgba(255,255,255,0.03)]' },
  prompt: { label: 'System', icon: Robot, color: '#5a6a7d', bg: 'bg-[rgba(90,106,125,0.05)]' },
  response: { label: 'AI Advisor', icon: Robot, color: '#00d4ff', bg: 'bg-[rgba(0,212,255,0.05)]' },
}

export default function IdeaChat({ ideaId, messages, idea, onUpdate }) {
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

  const displayedMessages = messages.filter(m => m.message_type !== 'prompt')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSendReply() {
    if (!reply.trim() || sending) return
    setSending(true)

    try {
      const supabase = getSupabase()

      // Create a custom prompt to continue the conversation in "Full History JSON" mode
      const { data: promptData, error: promptErr } = await supabase.from('prompts').insert({
        prompt_name: 'Chat Follow-up',
        prompt: reply.trim(),
        context_mode: 'full_history_json'
      }).select('id').single()

      if (promptErr) throw promptErr

      // Update idea status back to processing
      await supabase.from('ideas').update({ status: 'processing' }).eq('id', ideaId)

      // Trigger custom prompt processing
      const url = localStorage.getItem('sb_url')
      const key = localStorage.getItem('sb_key')

      await fetch(`${url}/functions/v1/process-prompt`, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_id: ideaId, custom_prompt_id: promptData.id }),
      })

      setReply('')
      if (onUpdate) onUpdate()
    } catch (err) {
      console.error('Failed to send reply:', err)
    } finally {
      setSending(false)
    }
  }

  const isCompleted = false // We allow chatting forever
  const isProcessing = idea?.status === 'processing'

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        <AnimatePresence>
          {displayedMessages.length === 0 && !isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No messages yet. The AI is analyzing your idea...
              </p>
            </motion.div>
          )}

          {displayedMessages.map((msg, index) => {
            const config = ROLE_CONFIG[msg.message_type] || ROLE_CONFIG.idea
            const Icon = config.icon

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`rounded-xl p-4 ${config.bg} border border-[var(--color-border-subtle)]`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: `${config.color}15` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider" style={{ color: config.color }}>
                    {msg.message_type === 'prompt' && msg.prompt_name ? `${config.label} (${msg.prompt_name})` : config.label}
                  </span>
                  <span className="text-xs font-mono ml-auto" style={{ color: 'var(--color-text-dim)' }}>
                    #{msg.sequence_number}
                  </span>
                </div>

                {msg.message_type === 'response' ? (
                  <div
                    className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.message) }}
                  />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {/* Processing indicator */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-[rgba(0,212,255,0.05)] border border-[var(--color-border-subtle)]"
          >
            <Spinner className="w-5 h-5 text-[#00d4ff] animate-spin" />
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              AI is analyzing...
            </span>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Input */}
      {!isCompleted && !isProcessing && displayedMessages.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4"
        >
          <div className="liquid-glass rounded-xl p-3 flex items-end gap-3">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendReply()
                }
              }}
              placeholder="Reply to refine your idea..."
              className="flex-1 bg-transparent border-none outline-none text-sm resize-none min-h-[40px] max-h-[120px]"
              rows={1}
            />
            <button
              onClick={handleSendReply}
              disabled={!reply.trim() || sending}
              className="p-2 rounded-lg bg-[rgba(0,212,255,0.15)] text-[#00d4ff] hover:bg-[rgba(0,212,255,0.25)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <PaperPlaneRight weight="fill" className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Completed state */}
      {isCompleted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-4 rounded-xl bg-status-green text-center"
        >
          <p className="text-sm text-[#2ed573]">
            Analysis complete. Your idea has been fully evaluated.
          </p>
        </motion.div>
      )}
    </div>
  )
}
