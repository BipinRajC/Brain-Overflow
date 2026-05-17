import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import { User, Bot, Copy, Check, Download, FileText } from 'lucide-react'
import type { ChatMessage, Idea } from '@/types'
import { PromptInputBox } from '@/components/ui/ai-prompt-box'
import { createCustomChatPrompt } from '@/lib/api/prompts'
import { updateIdeaStatus } from '@/lib/api/ideas'
import { triggerProcessPrompt } from '@/lib/api/edgeFn'

interface Props {
  ideaId: string
  idea: Idea
  messages: ChatMessage[]
  onUpdate?: () => void
}

const ROLE_META = {
  idea: { label: 'YOU', Icon: User },
  response: { label: 'AI', Icon: Bot },
} as const

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)]"
      title={label ?? 'Copy'}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[color:var(--color-strong)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function buildFullChatText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.message_type !== 'prompt')
    .map((m) => {
      const role = m.message_type === 'response' ? 'AI' : 'YOU'
      return `${role}:\n${m.message}\n`
    })
    .join('\n')
}

function buildMarkdownExport(idea: Idea, messages: ChatMessage[]): string {
  const visible = messages.filter((m) => m.message_type !== 'prompt')
  const lines: string[] = [
    `# Brain Overflow — Chat Export`,
    `**Idea**: ${idea.idea}`,
    `**Date**: ${new Date().toLocaleString()}`,
    ``,
    `---`,
    ``,
  ]
  for (const msg of visible) {
    const role = msg.message_type === 'response' ? '**AI:**' : '**YOU:**'
    lines.push(role)
    lines.push('')
    lines.push(msg.message)
    lines.push('')
  }
  return lines.join('\n')
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function IdeaChat({ ideaId, idea, messages, onUpdate }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = messages.filter((m) => m.message_type !== 'prompt')
  const isProcessing = idea.status === 'processing'
  const [showReasoning, setShowReasoning] = useState<Record<string, boolean>>({})

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(text: string) {
    if (!text.trim()) return
    try {
      const prompt = await createCustomChatPrompt(text)
      await updateIdeaStatus(ideaId, 'processing')
      await triggerProcessPrompt(ideaId, { customPromptId: prompt.id })
      onUpdate?.()
    } catch (e) {
      console.error(e)
    }
  }

  const handleExportMd = useCallback(() => {
    const md = buildMarkdownExport(idea, messages)
    const slug = idea.idea.slice(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase()
    downloadFile(md, `brain-overflow-${slug}.md`, 'text/markdown')
  }, [idea, messages])

  const handleExportPdf = useCallback(() => {
    window.print()
  }, [])

  const fullChatText = buildFullChatText(messages)

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3">
        {visible.length === 0 && !isProcessing && (
          <p className="font-mono text-sm text-[color:var(--color-text-mute)] text-center py-12">
            no transmissions yet. waiting on the chain…
          </p>
        )}
        {visible.map((msg, i) => {
          const meta = ROLE_META[msg.message_type as keyof typeof ROLE_META] ?? ROLE_META.idea
          const Icon = meta.Icon
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.24 }}
              className="group border border-[color:var(--color-edge)] bg-[color:var(--color-surface)]/40 backdrop-blur p-4"
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Icon className="h-3.5 w-3.5 text-[color:var(--color-text-mute)]" />
                <span className="font-pixel text-[11px] tracking-[0.2em] uppercase text-[color:var(--color-text-mute)]">
                  {meta.label}
                </span>
                <span className="font-mono text-[10px] text-[color:var(--color-text-dim)]">
                  #{msg.sequence_number}
                </span>
                <CopyButton text={msg.message} label="Copy message" />
              </div>
              {msg.message_type === 'response' ? (
                <div className="prose-os text-sm">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeHighlight]}
                  >
                    {msg.message}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="font-mono text-sm whitespace-pre-wrap leading-relaxed">
                  {msg.message}
                </p>
              )}
              {msg.message_type === 'response' && msg.reasoning_content && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowReasoning({ ...showReasoning, [msg.id]: !showReasoning[msg.id] })}
                    className="text-xs text-[color:var(--color-text-mute)] hover:text-[color:var(--color-text)] underline"
                  >
                    {showReasoning[msg.id] ? 'Hide reasoning' : 'Show reasoning'}
                  </button>

                  {showReasoning[msg.id] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-2 p-3 bg-[color:var(--color-surface)]/40 border border-[color:var(--color-edge)]/30"
                    >
                      <p className="text-xs text-[color:var(--color-text-mute)] mb-1">Model reasoning:</p>
                      <div className="text-sm text-[color:var(--color-text-dim)] opacity-60 italic whitespace-pre-wrap">
                        {msg.reasoning_content}
                      </div>
                      {msg.tokens_used && (
                        <p className="text-xs text-[color:var(--color-text-mute)] mt-2">
                          Tokens used: {msg.tokens_used}
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )
        })}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border border-[color:var(--color-edge-glow)] bg-[color:var(--color-surface)]/30 px-4 py-3 flex items-center gap-3"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[color:var(--color-pivot)] opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[color:var(--color-pivot)]" />
            </span>
            <span className="font-pixel text-[11px] tracking-[0.2em] uppercase text-[color:var(--color-text-mute)]">
              ANALYZING…
            </span>
          </motion.div>
        )}
        <div ref={ref} />
      </div>

      {/* {!isProcessing && visible.length > 0 && (
        <PromptInputBox
          placeholder="continue the thought…"
          onSend={(msg) => handleSend(msg)}
        />
      )} */}
    </div>
  )
}
