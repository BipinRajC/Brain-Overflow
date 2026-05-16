import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { VoiceRecorder } from '@/components/recorder/VoiceRecorder'
import { IdeaCard } from '@/components/idea/IdeaCard'
import { QuoteFooter } from '@/components/shell/QuoteFooter'
import { listRecentIdeas } from '@/lib/api/ideas'
import type { Idea } from '@/types'

export function LandingPage() {
  const [recent, setRecent] = useState<Idea[]>([])

  useEffect(() => {
    listRecentIdeas(6).then(setRecent).catch(() => {})
  }, [])

  return (
    <div className="relative min-h-[100dvh] pt-20 pb-32 px-4 md:px-8">
      <div className="mx-auto max-w-5xl flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="text-center mb-12 relative"
        >
          <div className="absolute inset-x-[-3rem] inset-y-[-2rem] bg-[color:var(--color-void)]/50 backdrop-blur-sm -z-10 rounded-sm" />
          <h1 className="font-pixel text-[clamp(2rem,5vw,3.4rem)] leading-[1.05] tracking-[0.06em] text-[color:var(--color-text)] blink-cursor">
            BRAIN_OVERFLOW
          </h1>
          <p className="mt-4 font-mono text-base text-[color:var(--color-text)] opacity-80 max-w-xl mx-auto">
            an abandoned operating system for thinkers and dreamers.
            <br />
            speak an idea — the machine remembers.
          </p>
        </motion.div>

        <VoiceRecorder />

        {recent.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="mt-20 w-full"
          >
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="font-pixel text-xs tracking-[0.25em] uppercase text-[color:var(--color-text-mute)]">
                RECENT_TRANSMISSIONS
              </h2>
              <span className="font-mono text-[10px] text-[color:var(--color-text-dim)]">
                last {recent.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recent.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} compact />
              ))}
            </div>
          </motion.div>
        )}
      </div>
      <QuoteFooter />
    </div>
  )
}
