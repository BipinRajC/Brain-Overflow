import { useEffect, useRef, useState } from 'react'

export interface TypewriterOpts {
  speedMs?: number
  pauseMs?: number
  startDelayMs?: number
}

export function useTypewriter(text: string, opts: TypewriterOpts = {}) {
  const { speedMs = 50, pauseMs = 6000, startDelayMs = 200 } = opts
  const [output, setOutput] = useState('')
  const [done, setDone] = useState(false)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    setOutput('')
    setDone(false)
    let i = 0
    const startTimer = window.setTimeout(() => {
      const tick = () => {
        i += 1
        setOutput(text.slice(0, i))
        if (i < text.length) {
          const t = window.setTimeout(tick, speedMs)
          timersRef.current.push(t)
        } else {
          const t = window.setTimeout(() => setDone(true), pauseMs)
          timersRef.current.push(t)
        }
      }
      tick()
    }, startDelayMs)
    timersRef.current.push(startTimer)

    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t))
      timersRef.current = []
    }
  }, [text, speedMs, pauseMs, startDelayMs])

  return { output, done }
}
