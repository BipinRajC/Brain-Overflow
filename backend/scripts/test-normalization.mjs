// test-normalization.mjs — integration test for the model configs migration
// Usage: node scripts/test-normalization.mjs

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnv() {
  const p = resolve(ROOT, '.env')
  if (!existsSync(p)) { console.error('ERROR: .env not found.'); process.exit(1) }
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const m = line.trim().match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
}
loadEnv()

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('ERROR: SUPABASE_URL or SUPABASE_SECRET_KEY missing in .env')
  process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  global: { headers: { apikey: SUPABASE_SECRET_KEY } }
})

console.log('Testing normalization pipeline...\n')

let allPassed = true

// ── 1. model_profiles table exists and has rows ─────────────────────────────
{
  const { data, error } = await sb.from('model_profiles').select('*')
  if (error) {
    console.error('✗ model_profiles:', error.message)
    allPassed = false
  } else {
    const count = data.length
    if (count === 0) {
      console.error('✗ Model profiles: table exists but has no rows')
      allPassed = false
    } else {
      console.log(`✓ Model profiles: ${count} found`)
    }
  }
}

// ── 2. prompts table has use_system_format column ───────────────────────────
{
  const { data, error } = await sb.from('prompts').select('use_system_format')
  if (error) {
    console.error('✗ Prompts use_system_format column:', error.message)
    allPassed = false
  } else {
    const allHave = data.length > 0 && data.every(row => row.use_system_format !== null && row.use_system_format !== undefined)
    console.log(`✓ Prompts have use_system_format: ${allHave} (${data.length} prompts checked)`)
    if (!allHave) allPassed = false
  }
}

// ── 3. prompt_schemas table exists and has rows ─────────────────────────────
{
  const { data, error } = await sb.from('prompt_schemas').select('*')
  if (error) {
    console.error('✗ prompt_schemas:', error.message)
    allPassed = false
  } else {
    const count = data.length
    if (count === 0) {
      console.error('✗ Prompt schemas: table exists but has no rows')
      allPassed = false
    } else {
      console.log(`✓ Prompt schemas: ${count} found`)
    }
  }
}

// ── 4. chat_messages has reasoning_content and tokens_used columns ──────────
{
  const { data: msgsData, error: msgsError } = await sb.from('chat_messages').select('reasoning_content, tokens_used').limit(1)
  const colsExist = !msgsError
  console.log(`✓ Chat messages have new columns: ${colsExist}`)
  if (!colsExist) { allPassed = false; console.error('  Error:', msgsError.message) }
}

// ── 5. Sample model profile ─────────────────────────────────────────────────
{
  const { data, error } = await sb
    .from('model_profiles')
    .select('model_id, max_tokens, reasoning_budget, output_budget, temperature, format')
    .limit(1)
    .single()

  if (!error && data) {
    console.log('\nSample profile:')
    console.log(`  Model: ${data.model_id}`)
    console.log(`  Max tokens: ${data.max_tokens}`)
    console.log(`  Reasoning budget: ${data.reasoning_budget}`)
    console.log(`  Output budget: ${data.output_budget}`)
    console.log(`  Temperature: ${data.temperature}`)
    console.log(`  Format: ${data.format}`)
  }
}

console.log()
if (allPassed) {
  console.log('✅ All integration tests passed!')
} else {
  console.error('❌ Some integration tests failed.')
  process.exit(1)
}
