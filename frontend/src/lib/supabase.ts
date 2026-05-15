import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export class NotConfiguredError extends Error {
  constructor() {
    super('Supabase not configured')
    this.name = 'NotConfiguredError'
  }
}

export type CredentialsSource = 'env' | 'localStorage' | 'none'

let _client: SupabaseClient | null = null
let _source: CredentialsSource = 'none'

function resolveCredentials(): { url: string; key: string; source: CredentialsSource } | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
  if (envUrl && envKey) {
    return { url: envUrl, key: envKey, source: 'env' }
  }
  const lsUrl = localStorage.getItem('sb_url')
  const lsKey = localStorage.getItem('sb_key')
  if (lsUrl && lsKey) {
    return { url: lsUrl, key: lsKey, source: 'localStorage' }
  }
  return null
}

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const creds = resolveCredentials()
  if (!creds) throw new NotConfiguredError()
  _client = createClient(creds.url, creds.key)
  _source = creds.source
  return _client
}

export function isConfigured(): boolean {
  return resolveCredentials() !== null
}

export function credentialsSource(): CredentialsSource {
  if (!_client) {
    const creds = resolveCredentials()
    return creds?.source ?? 'none'
  }
  return _source
}

export function clearCredentials(): boolean {
  const creds = resolveCredentials()
  if (creds?.source === 'env') return false
  localStorage.removeItem('sb_url')
  localStorage.removeItem('sb_key')
  _client = null
  _source = 'none'
  return true
}

export function setLocalCredentials(url: string, key: string) {
  localStorage.setItem('sb_url', url)
  localStorage.setItem('sb_key', key)
  _client = null
  _source = 'localStorage'
}

export function getEdgeFnHeaders(): { apikey: string; 'Content-Type': string } {
  const creds = resolveCredentials()
  if (!creds) throw new NotConfiguredError()
  return { apikey: creds.key, 'Content-Type': 'application/json' }
}

export function getSupabaseUrl(): string {
  const creds = resolveCredentials()
  if (!creds) throw new NotConfiguredError()
  return creds.url
}
