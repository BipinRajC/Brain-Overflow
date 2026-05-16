import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ProcessingProvider } from '@/hooks/useProcessingPulse'
import { BackgroundLayer } from './BackgroundLayer'
import { CircularNav } from './CircularNav'
import { BootSequence } from './BootSequence'
import { AlertStack } from './AlertStack'
import { isConfigured } from '@/lib/supabase'
import { SetupScreen } from './SetupScreen'

interface Props {
  children: ReactNode
}

export function AppShell({ children }: Props) {
  const location = useLocation()
  const [booted, setBooted] = useState(false)
  const [configured, setConfigured] = useState(() => isConfigured())

  useEffect(() => {
    if (!configured && booted) setBooted(false)
  }, [configured, booted])

  if (!configured) {
    return (
      <SetupScreen
        onSubmitted={() => {
          setConfigured(true)
          window.location.reload()
        }}
      />
    )
  }

  return (
    <ProcessingProvider>
      <BackgroundLayer />
      <div className="relative min-h-[100dvh]">
        <AnimatePresence mode="popLayout">
          <motion.main
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
            className="relative"
          >
            {children}
          </motion.main>
        </AnimatePresence>
        <AlertStack />
        <CircularNav />
      </div>
      {!booted && <BootSequence onReady={() => setBooted(true)} />}
    </ProcessingProvider>
  )
}
