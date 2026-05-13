import { motion } from 'framer-motion'
import {
  Circle, CheckCircle, XCircle, Clock,
  TrendUp, TrendDown, ArrowsClockwise, Warning
} from '@phosphor-icons/react'

const STATUS_CONFIG = {
  recorded:   { label: 'Recorded',   color: '#5a6a7d', bg: 'bg-[rgba(90,106,125,0.15)]', icon: Circle },
  processing: { label: 'Processing', color: '#ffa502', bg: 'bg-status-orange', icon: Clock },
  completed:  { label: 'Completed',  color: '#2ed573', bg: 'bg-status-green', icon: CheckCircle },
  failed:     { label: 'Failed',     color: '#ff4757', bg: 'bg-status-red', icon: XCircle },
}

const SCORE_CONFIG = {
  strong:           { label: 'Strong',            color: '#2ed573', bg: 'bg-status-green', icon: TrendUp },
  weak:             { label: 'Weak',              color: '#ff4757', bg: 'bg-status-red', icon: TrendDown },
  needs_pivot:      { label: 'Needs Pivot',       color: '#ffa502', bg: 'bg-status-orange', icon: ArrowsClockwise },
  needs_refinement: { label: 'Needs Refinement',  color: '#fcc419', bg: 'bg-status-yellow', icon: Warning },
}

export default function StatusBadge({ status, score, size = 'sm' }) {
  const config = status ? STATUS_CONFIG[status] : score ? SCORE_CONFIG[score] : null
  if (!config) return null

  const Icon = config.icon
  const isProcessing = status === 'processing'

  return (
    <motion.span
      className={`inline-flex items-center gap-1.5 font-mono uppercase tracking-wider rounded ${config.bg} ${config.color} ${
        size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5'
      }`}
      animate={isProcessing ? { opacity: [0.7, 1, 0.7] } : {}}
      transition={isProcessing ? { duration: 2, repeat: Infinity } : {}}
    >
      <Icon className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'}`} weight={isProcessing ? 'regular' : 'fill'} />
      {config.label}
    </motion.span>
  )
}
