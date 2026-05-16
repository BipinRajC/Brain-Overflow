import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Menu, Mic, Layers, MessageSquareText, Workflow, Cpu, LogOut } from 'lucide-react'
import { CircularNavigation } from '@/components/ui/circular-navigation'
import { useProcessingPulse } from '@/hooks/useProcessingPulse'
import { clearCredentials, credentialsSource } from '@/lib/supabase'

const NAV_ITEMS = [
  { name: 'RECORDER', icon: Mic, to: '/' },
  { name: 'IDEAS', icon: Layers, to: '/ideas' },
  { name: 'PROMPTS', icon: MessageSquareText, to: '/prompts' },
  { name: 'FLOWS', icon: Workflow, to: '/flows' },
  { name: 'MODELS', icon: Cpu, to: '/models' },
]

export function CircularNav() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { count } = useProcessingPulse()
  const canDisconnect = credentialsSource() === 'localStorage'

  const toggleMenu = useCallback(() => setIsOpen((prev) => !prev), [])

  // Keyboard shortcut: press 'm' or 'Escape' to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        setIsOpen((prev) => !prev)
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const navItems = NAV_ITEMS.map((item) => {
    const isActive =
      item.to === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.to)
    const showPulse = item.to === '/ideas' && count > 0

    return {
      name: item.name,
      icon: item.icon,
      onClick: () => navigate(item.to),
      badge: showPulse ? (
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[color:var(--color-text)] opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[color:var(--color-text)]" />
        </span>
      ) : undefined,
    }
  })

  // Add disconnect as last item
  if (canDisconnect) {
    navItems.push({
      name: 'DISCONNECT',
      icon: LogOut,
      onClick: () => {
        if (clearCredentials()) window.location.reload()
      },
      badge: undefined,
    })
  }

  return (
    <>
      {/* NAV trigger button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8, ease: [0.32, 0.72, 0, 1] }}
        onClick={toggleMenu}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 rounded-full border transition-all duration-300 hover:scale-105 group"
        style={{
          background: 'rgba(17, 20, 28, 0.85)',
          borderColor: 'rgba(220, 224, 230, 0.12)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
        aria-label="Open navigation menu"
      >
        <Menu
          className="h-4 w-4 sm:h-5 sm:w-5 transition-colors duration-300"
          style={{ color: 'rgba(228, 230, 235, 0.6)' }}
          strokeWidth={1.5}
        />
        <span
          className="hidden sm:inline font-pixel uppercase tracking-[0.25em] transition-colors duration-300"
          style={{
            fontSize: '11px',
            color: 'rgba(228, 230, 235, 0.6)',
          }}
        >
          NAV
        </span>
        {count > 0 && (
          <span className="relative flex h-2.5 w-2.5 ml-1">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[color:var(--color-text)] opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[color:var(--color-text)]" />
          </span>
        )}
      </motion.button>

      {/* Circular Navigation Overlay */}
      <CircularNavigation
        navItems={navItems}
        isOpen={isOpen}
        toggleMenu={toggleMenu}
      />
    </>
  )
}
