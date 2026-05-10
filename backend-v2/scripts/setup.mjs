// setup.mjs — One-command setup for Brain Overflow backend v2.
//
// Steps:
//   1. Validate .env
//   2. Install npm dependencies
//   3. Link Supabase project
//   4. Push database migrations
//   5. Seed models
//   6. Inject AI provider secrets
//   7. Deploy all edge functions
//   8. Verify + print summary
//
// Usage: npm run setup

import { execSync }                  from 'node:child_process'
import { readFileSync, existsSync }  from 'node:fs'
import { resolve, dirname }          from 'node:path'
import { fileURLToPath }             from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')

// ─── Env loading ──────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(ROOT, '.env')
  if (!existsSync(envPath)) {
    console.error('\nERROR: .env file not found.')
    console.error('  → Copy .env.example to .env and fill in your values.\n')
    process.exit(1)
  }
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
  if (missing.length) {
    console.error(`\nERROR: Missing required env vars: ${missing.join(', ')}`)
    console.error('  → Fill these in your .env file.\n')
    process.exit(1)
  }
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

// ─── Main ─────────────────────────────────────────────────────────────────────
loadEnv()

// Support both old names (SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)
// and new Supabase names (SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY)
if (!process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_ANON_KEY) {
  process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY
}
if (!process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
}

requireEnv(
  'SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'AI_API_KEY',
)

console.log('\n============================================================')
console.log('  Brain Overflow — Backend v2 Setup')
console.log('============================================================')

// 1. Install dependencies
if (!existsSync(resolve(ROOT, 'node_modules'))) {
  run('npm install', '1/7 Install dependencies')
} else {
  console.log('\n[1/7 Install dependencies] node_modules already present — skipping')
}

// 2. Link Supabase project
run(
  `npx supabase link --project-ref ${process.env.SUPABASE_PROJECT_REF}`,
  '2/7 Link Supabase project',
)

// 3. Push migrations
run('npx supabase db push', '3/7 Push database migrations')

// 4. Seed models
run('node scripts/seed.mjs', '4/7 Seed models')

// 5. Inject secrets into edge functions
// Note: SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by Supabase's runtime — we only need to inject AI provider keys.
run(`npx supabase secrets set AI_API_KEY=${process.env.AI_API_KEY}`, '5/7 Inject AI_API_KEY secret')

if (process.env.OPENAI_API_KEY) {
  run(`npx supabase secrets set OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`, '5/7 Inject OPENAI_API_KEY secret')
}
if (process.env.ANTHROPIC_API_KEY) {
  run(`npx supabase secrets set ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`, '5/7 Inject ANTHROPIC_API_KEY secret')
}

// 6. Deploy edge functions
// --no-verify-jwt: our system uses anonymous access with the apikey header.
// Without this flag, Supabase checks the Authorization header for a valid JWT
// before running the function, which would reject all our calls.
run('npx supabase functions deploy process-idea    --no-verify-jwt', '6/7 Deploy process-idea')
run('npx supabase functions deploy process-prompt  --no-verify-jwt', '6/7 Deploy process-prompt')
run('npx supabase functions deploy room-management --no-verify-jwt', '6/7 Deploy room-management')

// 7. Verify
run('node scripts/verify.mjs', '7/7 Verify setup')

console.log('\n============================================================')
console.log('  Setup complete! ✓')
console.log('============================================================')
console.log('\n  Give these two values to the Flutter app:')
console.log('\n  SUPABASE_URL           =', process.env.SUPABASE_URL)
console.log('  SUPABASE_PUBLISHABLE_KEY =', process.env.SUPABASE_PUBLISHABLE_KEY)
console.log('\n  Share both with collaborators who need access to the same rooms.\n')
