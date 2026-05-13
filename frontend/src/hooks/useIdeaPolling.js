import { useState, useEffect, useRef } from 'react'

export function useIdeaPolling(supabase, ideaId, interval = 1000) {
  const [idea, setIdea] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!supabase || !ideaId) return

    const fetchData = async () => {
      try {
        const [{ data: ideaRow, error: ideaErr }, { data: msgs, error: msgErr }] = await Promise.all([
          supabase.from('ideas').select('*').eq('id', ideaId).single(),
          supabase.from('chat_messages').select('*').eq('idea_id', ideaId).order('sequence_number', { ascending: true }),
        ])

        if (ideaErr) throw ideaErr
        if (msgErr) throw msgErr

        setIdea(ideaRow)
        setMessages(msgs || [])
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    intervalRef.current = setInterval(() => {
      if (idea && (idea.status === 'processing' || idea.status === 'recorded')) {
        fetchData()
      }
    }, interval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [supabase, ideaId, interval])

  return { idea, messages, loading, error, refetch: () => {} }
}
