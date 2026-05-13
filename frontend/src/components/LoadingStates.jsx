import { motion } from 'framer-motion'
import { Lightning, Warning, ArrowClockwise } from '@phosphor-icons/react'

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`liquid-glass rounded-xl p-6 animate-shimmer ${className}`}>
      <div className="h-4 w-3/4 rounded bg-[rgba(255,255,255,0.05)] mb-4" />
      <div className="h-4 w-1/2 rounded bg-[rgba(255,255,255,0.05)] mb-2" />
      <div className="h-4 w-2/3 rounded bg-[rgba(255,255,255,0.05)]" />
    </div>
  )
}

export function SkeletonList({ count = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="liquid-glass rounded-xl p-4 animate-shimmer">
          <div className="h-4 w-full rounded bg-[rgba(255,255,255,0.05)] mb-2" />
          <div className="h-4 w-2/3 rounded bg-[rgba(255,255,255,0.05)]" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, description, action, onAction }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-20"
    >
      <Lightning className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-dim)]" />
      <p className="text-lg font-semibold mb-2">{title}</p>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
        {description}
      </p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-3 rounded-full bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.3)] text-[#00d4ff] text-sm font-medium hover:bg-[rgba(0,212,255,0.25)] transition-colors"
        >
          {action}
        </button>
      )}
    </motion.div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-4 py-20"
    >
      <div className="flex items-center gap-3 p-4 rounded-xl bg-status-red text-[#ff4757]">
        <Warning className="w-6 h-6" />
        <p>{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm hover:text-[#00d4ff] transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <ArrowClockwise className="w-4 h-4" />
          Retry
        </button>
      )}
    </motion.div>
  )
}
