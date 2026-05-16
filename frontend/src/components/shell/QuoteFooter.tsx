import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Quote } from 'lucide-react'
import { QUOTES } from '@/lib/quotes'
import { useTypewriter } from '@/hooks/useTypewriter'

function pickQuote(prev: number) {
  if (QUOTES.length <= 1) return 0
  let i = prev
  while (i === prev) {
    i = Math.floor(Math.random() * QUOTES.length)
  }
  return i
}

export function QuoteFooter() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * QUOTES.length))
  const quote = QUOTES[idx]
  const { output, done } = useTypewriter(quote.text, {
    speedMs: 38,
    pauseMs: 2200,
    startDelayMs: 400,
  })

  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setIdx((i) => pickQuote(i)), 300)
    return () => window.clearTimeout(t)
  }, [done])

  return (
    <div className="mt-8 md:mt-0 md:fixed md:bottom-6 md:left-6 px-4 md:px-0 z-20 max-w-[280px] md:max-w-[440px] pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="relative"
        >
          <Quote
            className="absolute -left-1 -top-3 h-3 w-3 text-[color:var(--color-text-dim)]"
            strokeWidth={1.4}
            aria-hidden
          />
          <blockquote className="pl-5">
            <p className="text-[13px] md:text-[15px] italic font-mono text-[color:var(--color-text-mute)] leading-relaxed">
              {output}
              {!done && <span className="blink-cursor" />}
            </p>
            <div
              className="mt-1.5 text-[10px] md:text-[11px] font-pixel uppercase tracking-[0.2em] transition-opacity duration-500"
              style={{ color: 'var(--color-text-mute)', opacity: done ? 1 : 0.55 }}
            >
              — {quote.cite}
            </div>
          </blockquote>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
