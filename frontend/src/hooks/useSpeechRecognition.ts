import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SRConstructor = new () => SpeechRecognitionLike

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const transcriptRef = useRef('')
  const interimRef = useRef('')
  const stopResolveRef = useRef<((value: string) => void) | null>(null)

  const start = useCallback(() => {
    const SR: SRConstructor | undefined =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      console.error('Speech recognition not supported in this browser')
      return false
    }

    transcriptRef.current = ''
    interimRef.current = ''
    setTranscript('')
    setInterimTranscript('')

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => setIsListening(true)

    recognition.onresult = (event: any) => {
      let finalChunk = ''
      let interimChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalChunk += result[0].transcript + ' '
        } else {
          interimChunk += result[0].transcript
        }
      }
      if (finalChunk) {
        transcriptRef.current += finalChunk
        setTranscript(transcriptRef.current)
      }
      interimRef.current = interimChunk
      setInterimTranscript(interimChunk)
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.error('Speech recognition error:', event.error)
    }

    recognition.onend = () => {
      setIsListening(false)
      const remainingInterim = interimRef.current.trim()
      if (remainingInterim) {
        transcriptRef.current = (transcriptRef.current + ' ' + remainingInterim).trim()
        interimRef.current = ''
      }
      setTranscript(transcriptRef.current)
      setInterimTranscript('')
      if (stopResolveRef.current) {
        stopResolveRef.current(transcriptRef.current)
        stopResolveRef.current = null
      }
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
      return true
    } catch (err) {
      console.error('Failed to start speech recognition:', err)
      return false
    }
  }, [])

  const stop = useCallback((): Promise<string> => {
    if (recognitionRef.current) {
      return new Promise<string>((resolve) => {
        stopResolveRef.current = resolve
        try {
          recognitionRef.current!.stop()
        } catch {
          stopResolveRef.current = null
          const remainingInterim = interimRef.current.trim()
          if (remainingInterim) {
            transcriptRef.current = (transcriptRef.current + ' ' + remainingInterim).trim()
            interimRef.current = ''
          }
          resolve(transcriptRef.current)
        }
        recognitionRef.current = null
      })
    }
    const remainingInterim = interimRef.current.trim()
    if (remainingInterim) {
      transcriptRef.current = (transcriptRef.current + ' ' + remainingInterim).trim()
      interimRef.current = ''
    }
    setTranscript(transcriptRef.current)
    setInterimTranscript('')
    setIsListening(false)
    return Promise.resolve(transcriptRef.current)
  }, [])

  const reset = useCallback(() => {
    transcriptRef.current = ''
    interimRef.current = ''
    setTranscript('')
    setInterimTranscript('')
  }, [])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          /* noop */
        }
      }
    }
  }, [])

  return {
    transcript,
    interimTranscript,
    isListening,
    start,
    stop,
    reset,
    fullTranscript: transcript + interimTranscript,
  }
}
