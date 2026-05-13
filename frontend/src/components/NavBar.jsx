import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, List, ChatText, Stack, Circuitry, X, List as ListIcon } from '@phosphor-icons/react'

const NAV_ITEMS = [
  { path: '/', label: 'Recorder', icon: Brain },
  { path: '/ideas', label: 'Ideas', icon: List },
  { path: '/prompts', label: 'Prompts', icon: ChatText },
  { path: '/flows', label: 'Flows', icon: Stack },
  { path: '/models', label: 'Models', icon: Circuitry },
]

export default function NavBar({ onDisconnect }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <>
      {/* Desktop Nav - Floating Pill */}
      <nav className="hidden md:flex fixed top-6 left-1/2 -translate-x-1/2 z-50">
        <div className="liquid-glass-strong rounded-full px-2 py-2 flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))
            const Icon = item.icon

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive: navActive }) =>
                  `relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    navActive || isActive
                      ? 'text-[#00d4ff]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  }`
                }
              >
                {(isActive) => (
                  <>
                    {(isActive || isActive) && (
                      <motion.div
                        layoutId="nav-pill"
                        className="absolute inset-0 bg-[rgba(0,212,255,0.1)] rounded-full border border-[rgba(0,212,255,0.2)]"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                    <Icon className="w-4 h-4 relative z-10" weight={isActive || isActive ? 'fill' : 'regular'} />
                    <span className="relative z-10">{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}

          <div className="w-px h-5 bg-[var(--color-border-subtle)] mx-1" />

          <button
            onClick={onDisconnect}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-[var(--color-text-muted)] hover:text-[#ff4757] transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Disconnect</span>
          </button>
        </div>
      </nav>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed top-4 right-4 z-50">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="liquid-glass-strong rounded-full p-3"
        >
          <motion.div
            animate={mobileOpen ? 'open' : 'closed'}
          >
            {mobileOpen ? (
              <X className="w-5 h-5 text-[#00d4ff]" />
            ) : (
              <ListIcon className="w-5 h-5 text-[var(--color-text-primary)]" />
            )}
          </motion.div>
        </button>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute top-full right-0 mt-2 liquid-glass-strong rounded-2xl p-2 min-w-[200px]"
            >
              {NAV_ITEMS.map((item, index) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path))
                const Icon = item.icon

                return (
                  <motion.div
                    key={item.path}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <NavLink
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'text-[#00d4ff] bg-[rgba(0,212,255,0.1)]'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.03)]'
                      }`}
                    >
                      <Icon className="w-5 h-5" weight={isActive ? 'fill' : 'regular'} />
                      {item.label}
                    </NavLink>
                  </motion.div>
                )
              })}

              <div className="h-px bg-[var(--color-border-subtle)] my-2" />

              <button
                onClick={() => {
                  setMobileOpen(false)
                  onDisconnect()
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[var(--color-text-muted)] hover:text-[#ff4757] w-full"
              >
                <X className="w-5 h-5" />
                Disconnect
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </>
  )
}
