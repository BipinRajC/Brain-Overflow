// reset.mjs — Wipes the database and redeploys everything fresh.
//
// WARNING: Deletes ALL data — rooms, ideas, messages, everything.
// Usage: npm run reset

import { execSync }                  from 'node:child_process'
import { readFileSync, existsSync }  from 'node:fs'
import { resolve, dirname }          from 'node:path'
import { fileURLToPath }             from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')

function loadEnv() {
  const envPath = resolve(ROOT, '.env')
  if (!existsSync(envPath)) { console.error('\nERROR: .env not found.\n'); process.exit(1) }
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

function requireEnv(...keys) {
  const missing = keys.filter(k => !process.env[k])
  if (missing.length) { console.error(`\nERROR: Missing env vars: ${missing.join(', ')}\n`); process.exit(1) }
}

function run(cmd, label) {
  console.log(`\n[${label}] Running: ${cmd}`)
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT })
  } catch {
    console.error(`\nFAILED at step: ${label}`)
    process.exit(1)
  }
}

loadEnv()

// Support both old and new Supabase key naming conventions
if (!process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
}

requireEnv('SUPABASE_PROJECT_REF', 'SUPABASE_SECRET_KEY', 'AI_API_KEY')

console.log('\n============================================================')
console.log('  Brain Overflow — Database Reset')
console.log('  ⚠️  This will DELETE all data in the remote database!')
console.log('============================================================\n')

console.log('Starting in 3 seconds... (Ctrl+C to abort)')
await new Promise(r => setTimeout(r, 3000))

run('npx supabase db push --include-all', '1/4 Reset & push migrations')
run('node scripts/seed.mjs',              '2/4 Seed models')
run('npx supabase functions deploy process-idea    --no-verify-jwt', '3/4 Deploy functions')
run('npx supabase functions deploy process-prompt  --no-verify-jwt', '3/4 Deploy functions')
run('npx supabase functions deploy room-management --no-verify-jwt', '3/4 Deploy functions')
run('node scripts/verify.mjs',            '4/4 Verify')

console.log('\n============================================================')
console.log('  Reset complete! ✓')
console.log('============================================================\n')
