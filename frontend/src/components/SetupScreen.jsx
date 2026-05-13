import { useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Link, Key, ArrowRight, Warning } from '@phosphor-icons/react'
import { createClient } from '@supabase/supabase-js'

export default function SetupScreen({ onDone }) {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleConnect() {
    if (!url.trim() || !key.trim()) {
      setErr('Both fields are required')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const sb = createClient(url.trim(), key.trim())
      const { error } = await sb.from('ideas').select('id').limit(1)
      if (error) throw error
      localStorage.setItem('sb_url', url.trim())
      localStorage.setItem('sb_key', key.trim())
      onDone()
    } catch (e) {
      setErr(`Connection failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[rgba(0,212,255,0.03)] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[rgba(0,212,255,0.02)] rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="liquid-glass-strong rounded-2xl p-8 md:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.2)] flex items-center justify-center mx-auto mb-4">
              <Brain weight="fill" className="w-8 h-8 text-[#00d4ff]" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Brain Overflow</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Connect to your Supabase backend
            </p>
          </div>

          {/* Form */}
          <div className="space-y-5">
            <div>
              <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                <Link className="w-4 h-4" />
                Supabase URL
              </label>
              <input
                type="text"
                placeholder="https://your-project.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm focus:border-[#00d4ff] outline-none transition-colors"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                <Key className="w-4 h-4" />
                Publishable Key
              </label>
              <input
                type="password"
                placeholder="sb_publishable_..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 text-sm focus:border-[#00d4ff] outline-none transition-colors"
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConnect}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.3)] text-[#00d4ff] font-medium hover:bg-[rgba(0,212,255,0.25)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? (
                <>
                  <div className="w-5 h-5 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </motion.button>
          </div>

          {/* Error */}
          <AnimatePresence>
            {err && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-status-red text-[#ff4757] text-sm"
              >
                <Warning className="w-4 h-4 shrink-0" />
                {err}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Help text */}
          <p className="text-xs text-center mt-6" style={{ color: 'var(--color-text-dim)' }}>
            Find your credentials in Supabase Dashboard → Project Settings → API
          </p>
        </div>
      </motion.div>
    </div>
  )
}
