import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import { executeCommand } from '../../lib/commands'
import BlinkingCursor from './BlinkingCursor'
import VoiceRecorder from './VoiceRecorder'

export default function Terminal() {
  const [lines, setLines] = useState([])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)
  const inputRef = useRef(null)
  const terminalRef = useRef(null)
  const bootComplete = useAppStore((s) => s.bootComplete)
  
  const addLine = useCallback((text, type = 'output') => {
    if (text === 'CLEAR') {
      setLines([])
      return
    }
    setLines(prev => [...prev, { text, type, id: Date.now() + Math.random() }])
  }, [])
  
  const execute = useCallback(async (cmdLine) => {
    if (!cmdLine.trim()) return
    
    setIsProcessing(true)
    
    // Add command to history
    setHistory(prev => [...prev, cmdLine])
    setHistoryIndex(-1)
    
    // Show command in terminal
    addLine(`> ${cmdLine}`, 'command')
    
    // Special handling for "record" without arguments
    const parts = cmdLine.trim().split(/\s+/)
    if (parts[0].toLowerCase() === 'record' && parts.length === 1) {
      setShowRecorder(true)
      setIsProcessing(false)
      return
    }
    
    // Execute command
    const results = await executeCommand(cmdLine)
    
    // Display results with slight delay for atmosphere
    for (let i = 0; i < results.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 30))
      addLine(results[i], 'output')
    }
    
    setIsProcessing(false)
  }, [addLine])
  
  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    if (!input.trim() || isProcessing) return
    
    const cmd = input
    setInput('')
    execute(cmd)
  }, [input, isProcessing, execute])
  
  const handleKeyDown = useCallback((e) => {
    // Ctrl+L to clear
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault()
      setLines([])
      return
    }
    
    // Escape to cancel recorder
    if (e.key === 'Escape' && showRecorder) {
      e.preventDefault()
      handleRecorderCancel()
      return
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length > 0) {
        const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex
        setHistoryIndex(newIndex)
        setInput(history[history.length - 1 - newIndex] || '')
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setInput(history[history.length - 1 - newIndex] || '')
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setInput('')
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // Simple tab completion
      const partial = input.toLowerCase()
      const commands = ['help', 'setup', 'record', 'ideas', 'idea', 'flows', 'prompts', 'models', 'settings', 'clear', 'theme', 'reboot', 'status', 'time']
      const matches = commands.filter(cmd => cmd.startsWith(partial))
      if (matches.length === 1) {
        setInput(matches[0] + ' ')
      }
    }
  }, [input, history, historyIndex, showRecorder, handleRecorderCancel])
  
  const handleRecorderComplete = useCallback((ideaId) => {
    setShowRecorder(false)
    addLine('', 'system')
    addLine('TRANSMISSION COMPLETE.', 'output')
    addLine(`IDEA ID: ${ideaId?.slice(0, 8) || 'UNKNOWN'}`, 'output')
    addLine('USE "ideas" TO VIEW ALL TRANSMISSIONS.', 'output')
    addLine('', 'system')
    
    // Refocus input
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [addLine])
  
  const handleRecorderCancel = useCallback(() => {
    setShowRecorder(false)
    addLine('', 'system')
    addLine('TRANSMISSION CANCELLED.', 'output')
    addLine('', 'system')
    
    // Refocus input
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [addLine])
  
  // Auto-focus input
  useEffect(() => {
    if (bootComplete && inputRef.current && !showRecorder) {
      inputRef.current.focus()
    }
  }, [bootComplete, showRecorder])
  
  // Scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [lines, showRecorder])
  
  // Welcome message after boot
  useEffect(() => {
    if (bootComplete && lines.length === 0) {
      const welcomeLines = [
        '',
        'WELCOME TO BRAIN OVERFLOW.',
        'AN ABANDONED OPERATING SYSTEM FOR THINKERS AND DREAMERS.',
        '',
        'TYPE "help" FOR AVAILABLE COMMANDS.',
        'TYPE "record" TO CAPTURE AN IDEA (VOICE OR TEXT).',
        'TYPE "setup <url> <key>" TO CONFIGURE SUPABASE.',
        '',
        'SHORTCUTS: CTRL+L = CLEAR  |  TAB = COMPLETE  |  ↑↓ = HISTORY',
        ''
      ]
      
      welcomeLines.forEach((line, i) => {
        setTimeout(() => {
          addLine(line, line ? 'output' : 'system')
        }, i * 80)
      })
    }
  }, [bootComplete, lines.length, addLine])
  
  if (!bootComplete) return null
  
  return (
    <div className="fixed inset-0 z-10 flex flex-col pt-10 px-6 md:px-12 pb-6">
      {/* Terminal Output */}
      <div 
        ref={terminalRef}
        className="flex-1 overflow-y-auto font-mono text-sm leading-relaxed"
        style={{ 
          fontFamily: 'var(--font-mono)',
          scrollbarWidth: 'thin'
        }}
        onClick={() => !showRecorder && inputRef.current?.focus()}
      >
        {lines.map((line) => (
          <div 
            key={line.id}
            className={`terminal-line ${
              line.type === 'command' ? 'prompt phosphor-glow' : ''
            } ${
              line.type === 'error' ? 'text-[#ff3030]' : ''
            } ${
              line.type === 'system' ? 'text-[#4a4a4a] text-xs' : ''
            }`}
          >
            {line.text}
          </div>
        ))}
        
        {/* Inline Voice Recorder */}
        {showRecorder && (
          <div className="my-4 p-4 border border-[#2a2a2a] bg-[#0a0a0f]/80">
            <div className="text-xs text-[#4a4a4a] uppercase tracking-wider mb-3">
              VOICE RECORDER MODULE
            </div>
            <VoiceRecorder 
              onComplete={handleRecorderComplete}
              onCancel={handleRecorderCancel}
            />
          </div>
        )}
      </div>
      
      {/* Input Line */}
      {!showRecorder && (
        <form onSubmit={handleSubmit} className="mt-4 flex items-center shrink-0">
          <span className="text-[#00f3ff] mr-2 font-mono shrink-0">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-[#e0e0e0] font-mono text-sm caret-[#00f3ff] min-w-0"
            style={{ fontFamily: 'var(--font-mono)' }}
            placeholder={isProcessing ? 'PROCESSING...' : 'Type a command...'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            disabled={isProcessing}
          />
          <BlinkingCursor active={!isProcessing} style="block" className="text-[#00f3ff] shrink-0" />
        </form>
      )}
    </div>
  )
}
