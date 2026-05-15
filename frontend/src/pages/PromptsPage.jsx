import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, PencilSimple, Trash, Check, X, ChatText } from '@phosphor-icons/react'
import { getSupabase } from '../lib/supabase.js'

const BLANK = { prompt_name: '', prompt: '', context_mode: 'idea_only' }

export default function PromptsPage() {
  const [prompts, setPrompts] = useState([])
  const [form, setForm] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchPrompts() }, [])

  async function fetchPrompts() {
    const sb = getSupabase()
    const { data, error } = await sb.from('prompts').select('*').order('created_at', { ascending: true })
    if (error) { setErr(error.message); return }
    setPrompts(data || [])
  }

  async function save() {
    if (!form.prompt_name.trim() || !form.prompt.trim()) {
      setErr('Name and prompt text are required')
      return
    }
    setBusy(true)
    setErr('')
    const sb = getSupabase()
    if (form.id) {
      const { error } = await sb.from('prompts').update({
        prompt_name: form.prompt_name, prompt: form.prompt, context_mode: form.context_mode
      }).eq('id', form.id)
      if (error) { setErr(error.message); setBusy(false); return }
    } else {
      const { error } = await sb.from('prompts').insert({
        prompt_name: form.prompt_name, prompt: form.prompt, context_mode: form.context_mode
      })
      if (error) { setErr(error.message); setBusy(false); return }
    }
    setForm(null)
    setBusy(false)
    fetchPrompts()
  }

  async function del(id) {
    if (!confirm('Delete this prompt? It will break any flows using it.')) return
    const sb = getSupabase()
    const { error } = await sb.from('prompts').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    fetchPrompts()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-[100dvh] pt-24 px-4 md:px-8 pb-12"
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <ChatText className="w-6 h-6 text-[#00d4ff]" />
            <h1 className="text-3xl font-bold tracking-tight">Prompts</h1>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setForm(BLANK); setErr('') }}
            className="flex items-center gap-2 px-4 py-2 rounded-full liquid-glass text-sm hover:border-[rgba(0,212,255,0.2)] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Prompt
          </motion.button>
        </div>

        {/* Error */}
        <AnimatePresence>
          {err && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 mb-6 p-4 rounded-xl bg-status-red text-[#ff4757] text-sm"
            >
              <X className="w-4 h-4" />
              {err}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form */}
        <AnimatePresence>
          {form && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="liquid-glass rounded-2xl p-6 mb-8"
            >
              <h2 className="text-lg font-semibold mb-6">{form.id ? 'Edit Prompt' : 'New Prompt'}</h2>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-muted)' }}>
                    Prompt Name
                  </label>
                  <input
                    value={form.prompt_name}
                    onChange={e => setForm(f => ({ ...f, prompt_name: e.target.value }))}
                    placeholder="e.g. Categorize & Score"
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm focus:border-[#00d4ff] outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-muted)' }}>
                    Prompt Text
                  </label>
                  <textarea
                    value={form.prompt}
                    onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                    placeholder="You are an expert evaluator. Analyze the following idea and provide a detailed assessment..."
                    rows={6}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm focus:border-[#00d4ff] outline-none transition-colors resize-y"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-muted)' }}>
                    Context Mode
                  </label>
                  <select
                    value={form.context_mode || 'idea_only'}
                    onChange={e => setForm(f => ({ ...f, context_mode: e.target.value }))}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm focus:border-[#00d4ff] outline-none transition-colors"
                  >
                    <option value="idea_only" style={{ background: '#0a0d16', color: '#e2e8f0' }}>Idea Only</option>
                    <option value="previous_response" style={{ background: '#0a0d16', color: '#e2e8f0' }}>Previous Response</option>
                    <option value="full_history_json" style={{ background: '#0a0d16', color: '#e2e8f0' }}>Full History JSON</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={save}
                  disabled={busy}
                  className="px-6 py-2 rounded-xl bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.3)] text-[#00d4ff] text-sm font-medium hover:bg-[rgba(0,212,255,0.25)] disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Saving...' : 'Save'}
                </motion.button>
                <button
                  onClick={() => { setForm(null); setErr('') }}
                  className="px-6 py-2 rounded-xl text-sm hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List */}
        {prompts.length === 0 && !form && (
          <div className="text-center py-20">
            <ChatText className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-dim)]" />
            <p className="text-lg mb-2">No prompts yet</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Create your first prompt to get started
            </p>
          </div>
        )}

        <div className="space-y-3">
          <AnimatePresence>
            {prompts.map((p, index) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
                className="liquid-glass rounded-xl p-5 group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold mb-1">{p.prompt_name}</h3>
                    <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>
                      <span className={`px-2 py-0.5 rounded bg-[rgba(0,212,255,0.1)] text-[#00d4ff]`}>
                        {p.context_mode === 'idea_only' ? 'Idea Only' : p.context_mode === 'previous_response' ? 'Previous Response' : 'Full History JSON'}
                      </span>
                      <span className="opacity-50">•</span>
                      <span>ID: {p.id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setForm({ ...p }); setErr('') }}
                      className="p-2 rounded-lg hover:bg-[rgba(0,212,255,0.1)] text-[#00d4ff] transition-colors"
                    >
                      <PencilSimple className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => del(p.id)}
                      className="p-2 rounded-lg hover:bg-status-red hover:text-[#ff4757] transition-colors"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm line-clamp-3" style={{ color: 'var(--color-text-muted)' }}>
                  {p.prompt}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
