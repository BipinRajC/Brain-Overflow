import { useState, useEffect, useCallback } from 'react'
import { getSupabase, isConfigured } from '../lib/supabase'

export function useIdeaPolling(ideaId, interval = 2000) {
  const [status, setStatus] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const fetchData = useCallback(async () => {
    if (!isConfigured() || !ideaId) return
    
    try {
      const supabase = getSupabase()
      
      const [{ data: ideaRow, error: ie }, { data: msgs, error: me }] = await Promise.all([
        supabase.from('ideas').select('*').eq('id', ideaId).single(),
        supabase.from('chat_messages').select('*').eq('idea_id', ideaId).order('sequence_number', { ascending: true }),
      ])
      
      if (ie) throw ie
      if (me) throw me
      
      setStatus(ideaRow?.status || null)
      setMessages(msgs || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [ideaId])
  
  useEffect(() => {
    if (!ideaId) return
    
    fetchData()
    
    // Poll while processing
    const pollInterval = setInterval(() => {
      if (status === 'processing' || status === 'recorded') {
        fetchData()
      }
    }, interval)
    
    return () => clearInterval(pollInterval)
  }, [ideaId, status, interval, fetchData])
  
  return { status, messages, loading, error, refetch: fetchData }
}
