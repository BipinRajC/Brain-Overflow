import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, PencilSimple, Trash, ArrowUp, ArrowDown, X,
  Stack, ArrowLeft, Check
} from '@phosphor-icons/react'
import { getSupabase } from '../lib/supabase.js'

export default function FlowsPage() {
  const [flows, setFlows] = useState([])
  const [prompts, setPrompts] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const sb = getSupabase()
    const [{ data: f }, { data: p }] = await Promise.all([
      sb.from('flows').select('*').order('created_at', { ascending: true }),
      sb.from('prompts').select('id, prompt_name').order('created_at', { ascending: true }),
    ])
    setFlows(f || [])
    setPrompts(p || [])
  }

  async function createFlow() {
    if (!form.flow_name.trim()) { setErr('Flow name required'); return }
    if (form.telegram_command && !/^[a-z0-9_]+$/.test(form.telegram_command)) {
      setErr('Telegram command must be lowercase letters, numbers, or underscores only'); return
    }
    setBusy(true); setErr('')
    const sb = getSupabase()
    const { data, error } = await sb
      .from('flows')
      .insert({
        flow_name: form.flow_name.trim(),
        telegram_command: form.telegram_command?.trim().toLowerCase() || null,
        prompt_ids: [],
      })
      .select().single()
    if (error) { setErr(error.message); setBusy(false); return }
    setForm(null); setBusy(false)
    setEditing({ ...data, prompt_ids: [] })
    fetchAll()
  }

  async function saveFlow() {
    if (editing.telegram_command && !/^[a-z0-9_]+$/.test(editing.telegram_command)) {
      setErr('Telegram command must be lowercase letters, numbers, or underscores only'); return
    }
    setBusy(true); setErr('')
    const sb = getSupabase()
    const { error } = await sb.from('flows')
      .update({
        flow_name: editing.flow_name,
        telegram_command: editing.telegram_command?.trim().toLowerCase() || null,
        prompt_ids: editing.prompt_ids,
      })
      .eq('id', editing.id)
    if (error) { setErr(error.message); setBusy(false); return }
    setBusy(false); setEditing(null); fetchAll()
  }

  async function deleteFlow(id) {
    if (!confirm('Delete this flow?')) return
    const sb = getSupabase()
    await sb.from('flows').delete().eq('id', id)
    fetchAll()
  }

  function addPromptToFlow(promptId) {
    if (editing.prompt_ids.includes(promptId)) return
    setEditing(e => ({ ...e, prompt_ids: [...e.prompt_ids, promptId] }))
  }

  function removeFromFlow(idx) {
    setEditing(e => ({ ...e, prompt_ids: e.prompt_ids.filter((_, i) => i !== idx) }))
  }

  function moveUp(idx) {
    if (idx === 0) return
    setEditing(e => {
      const ids = [...e.prompt_ids]
      ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
      return { ...e, prompt_ids: ids }
    })
  }

  function moveDown(idx) {
    setEditing(e => {
      if (idx >= e.prompt_ids.length - 1) return e
      const ids = [...e.prompt_ids]
      ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
      return { ...e, prompt_ids: ids }
    })
  }

  function promptName(id) {
    return prompts.find(p => p.id === id)?.prompt_name ?? id.slice(0, 8)
  }

  // Edit view
  if (editing) {
    const unusedPrompts = prompts.filter(p => !editing.prompt_ids.includes(p.id))

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-[100dvh] pt-24 px-4 md:px-8 pb-12"
      >
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => { setEditing(null); setErr('') }}
            className="flex items-center gap-2 text-sm mb-6 hover:text-[#00d4ff] transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Flows
          </button>

          <h1 className="text-3xl font-bold tracking-tight mb-8">Edit Flow</h1>

          {err && (
            <div className="flex items-center gap-2 mb-6 p-4 rounded-xl bg-status-red text-[#ff4757] text-sm">
              <X className="w-4 h-4" />
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Flow settings */}
            <div className="liquid-glass rounded-xl p-6">
              <h2 className="text-sm font-mono uppercase tracking-wider mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Flow Settings
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-muted)' }}>
                    Flow Name
                  </label>
                  <input
                    value={editing.flow_name}
                    onChange={e => setEditing(f => ({ ...f, flow_name: e.target.value }))}
                    placeholder="e.g. Startup Analysis"
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm focus:border-[#00d4ff] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-muted)' }}>
                    Telegram Command
                  </label>
                  <input
                    value={editing.telegram_command ?? ''}
                    onChange={e => setEditing(f => ({ ...f, telegram_command: e.target.value.toLowerCase() }))}
                    placeholder="startup"
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm focus:border-[#00d4ff] outline-none transition-colors"
                  />
                  <p className="text-xs mt-2" style={{ color: 'var(--color-text-dim)' }}>
                    Send /startup idea in Telegram
                  </p>
                </div>
              </div>
            </div>

            {/* Prompt chain */}
            <div className="liquid-glass rounded-xl p-6">
              <h2 className="text-sm font-mono uppercase tracking-wider mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Prompt Chain ({editing.prompt_ids.length} steps)
              </h2>
              {editing.prompt_ids.length === 0 && (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  Add prompts from the list below
                </p>
              )}
              <div className="space-y-2">
                {editing.prompt_ids.map((pid, idx) => (
                  <motion.div
                    key={pid}
                    layout
                    className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(255,255,255,0.03)]"
                  >
                    <span className="text-xs font-mono w-6" style={{ color: 'var(--color-text-dim)' }}>#{idx + 1}</span>
                    <span className="text-sm flex-1">{promptName(pid)}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-1 rounded hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-30 transition-colors">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => moveDown(idx)} disabled={idx === editing.prompt_ids.length - 1} className="p-1 rounded hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-30 transition-colors">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button onClick={() => removeFromFlow(idx)} className="p-1 rounded hover:bg-status-red hover:text-[#ff4757] transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Available prompts */}
          <div className="mt-6">
            <h2 className="text-sm font-mono uppercase tracking-wider mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Available Prompts
            </h2>
            {unusedPrompts.length === 0 && (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                All prompts are in the chain
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {unusedPrompts.map(p => (
                <motion.button
                  key={p.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => addPromptToFlow(p.id)}
                  className="liquid-glass rounded-xl p-4 text-left hover:border-[rgba(0,212,255,0.2)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{p.prompt_name}</span>
                    <Plus className="w-4 h-4 text-[#00d4ff]" />
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={saveFlow}
              disabled={busy}
              className="px-6 py-2 rounded-xl bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.3)] text-[#00d4ff] text-sm font-medium hover:bg-[rgba(0,212,255,0.25)] disabled:opacity-50 transition-colors"
            >
              {busy ? 'Saving...' : 'Save Flow'}
            </motion.button>
            <button
              onClick={() => { setEditing(null); setErr('') }}
              className="px-6 py-2 rounded-xl text-sm hover:bg-[rgba(255,255,255,0.03)] transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  // List view
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-[100dvh] pt-24 px-4 md:px-8 pb-12"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Stack className="w-6 h-6 text-[#00d4ff]" />
            <h1 className="text-3xl font-bold tracking-tight">Flows</h1>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setForm({ flow_name: '', telegram_command: '' }); setErr('') }}
            className="flex items-center gap-2 px-4 py-2 rounded-full liquid-glass text-sm hover:border-[rgba(0,212,255,0.2)] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Flow
          </motion.button>
        </div>

        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
          Flows chain prompts together. Set a Telegram Command on each flow so users can type
          <code className="mx-1 px-1.5 py-0.5 rounded bg-[rgba(0,212,255,0.1)] text-[#00d4ff] text-xs">/startup</code>
          in Telegram.
        </p>

        {err && (
          <div className="flex items-center gap-2 mb-6 p-4 rounded-xl bg-status-red text-[#ff4757] text-sm">
            <X className="w-4 h-4" />
            {err}
          </div>
        )}

        {/* New flow form */}
        <AnimatePresence>
          {form && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="liquid-glass rounded-2xl p-6 mb-8"
            >
              <h2 className="text-lg font-semibold mb-6">New Flow</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-muted)' }}>
                    Flow Name
                  </label>
                  <input
                    value={form.flow_name}
                    onChange={e => setForm(f => ({ ...f, flow_name: e.target.value }))}
                    placeholder="e.g. Startup Analysis"
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm focus:border-[#00d4ff] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-muted)' }}>
                    Telegram Command
                  </label>
                  <input
                    value={form.telegram_command ?? ''}
                    onChange={e => setForm(f => ({ ...f, telegram_command: e.target.value.toLowerCase() }))}
                    placeholder="startup"
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm focus:border-[#00d4ff] outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={createFlow}
                  disabled={busy}
                  className="px-6 py-2 rounded-xl bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.3)] text-[#00d4ff] text-sm font-medium hover:bg-[rgba(0,212,255,0.25)] disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Creating...' : 'Create'}
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

        {flows.length === 0 && !form && (
          <div className="text-center py-20">
            <Stack className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-dim)]" />
            <p className="text-lg mb-2">No flows yet</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Create your first flow to chain prompts together
            </p>
          </div>
        )}

        <div className="space-y-3">
          <AnimatePresence>
            {flows.map((flow, index) => (
              <motion.div
                key={flow.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
                className="liquid-glass rounded-xl p-5 group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{flow.flow_name}</h3>
                      {flow.telegram_command && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-[rgba(0,212,255,0.1)] text-[#00d4ff]">
                          /{flow.telegram_command}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>
                      {(flow.prompt_ids || []).length} prompt(s) ·{' '}
                      {(flow.prompt_ids || []).map(id => promptName(id)).join(' → ') || 'no prompts'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditing({ ...flow, prompt_ids: [...(flow.prompt_ids || [])] })}
                      className="p-2 rounded-lg hover:bg-[rgba(0,212,255,0.1)] text-[#00d4ff] transition-colors"
                    >
                      <PencilSimple className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteFlow(flow.id)}
                      className="p-2 rounded-lg hover:bg-status-red hover:text-[#ff4757] transition-colors"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
