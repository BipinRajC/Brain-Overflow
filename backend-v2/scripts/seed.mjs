// seed.mjs — Seeds the models table with default AI models.
// Safe to re-run: uses upsert (onConflict: 'id').
// Usage: npm run seed

import { createClient }             from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }         from 'node:path'
import { fileURLToPath }            from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')

function loadEnv() {
  const envPath = resolve(ROOT, '.env')
  if (!existsSync(envPath)) { console.error('ERROR: .env not found.'); process.exit(1) }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([^=]+)=(.*)$/)
    if (match) {
      let value = match[2].trim()
      if (/^["'].*["']$/.test(value)) value = value.slice(1, -1)
      process.env[match[1].trim()] = value
    }
  }
}

loadEnv()

const url = process.env.SUPABASE_URL

// Support both new (SUPABASE_SECRET_KEY) and old (SUPABASE_SERVICE_ROLE_KEY) names
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(url, key)

// ─── Default models ───────────────────────────────────────────────────────────
// 'id' is a stable human-readable key used by room_config.
// 'api_model_id' is the exact model identifier sent to the provider API.
const models = [
  // ── Fireworks (active by default) ──
  {
    id:           'kimi-k2p5',
    provider:     'fireworks',
    display_name: 'Kimi K2.5 (Fireworks)',
    api_model_id: 'accounts/fireworks/models/kimi-k2p5',
    is_active:    true,
  },
  {
    id:           'llama-3.1-405b',
    provider:     'fireworks',
    display_name: 'Llama 3.1 405B (Fireworks)',
    api_model_id: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
    is_active:    true,
  },
  {
    id:           'llama-3.3-70b',
    provider:     'fireworks',
    display_name: 'Llama 3.3 70B (Fireworks)',
    api_model_id: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    is_active:    true,
  },
  // ── OpenAI (disabled — add OPENAI_API_KEY secret to enable) ──
  {
    id:           'gpt-4o',
    provider:     'openai',
    display_name: 'GPT-4o (OpenAI)',
    api_model_id: 'gpt-4o',
    is_active:    false,
  },
  {
    id:           'gpt-4o-mini',
    provider:     'openai',
    display_name: 'GPT-4o Mini (OpenAI)',
    api_model_id: 'gpt-4o-mini',
    is_active:    false,
  },
  // ── Anthropic (disabled — add ANTHROPIC_API_KEY secret to enable) ──
  {
    id:           'claude-3-5-sonnet',
    provider:     'anthropic',
    display_name: 'Claude 3.5 Sonnet (Anthropic)',
    api_model_id: 'claude-3-5-sonnet-20241022',
    is_active:    false,
  },
]

const { error } = await supabase.from('models').upsert(models, { onConflict: 'id' })

if (error) {
  console.error('Seed failed:', error.message)
  process.exit(1)
}

console.log(`Seeded ${models.length} models (${models.filter(m => m.is_active).length} active by default)`)
