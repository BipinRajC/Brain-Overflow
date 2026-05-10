// verify.mjs — Smoke tests each edge function after deployment.
// Usage: npm run verify  (also called automatically by npm run setup)

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

// Support both new and old Supabase key naming
if (!process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_ANON_KEY) {
  process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY
}
if (!process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
}

const url       = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !secretKey) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

// Invoke an edge function using the 'apikey' header (compatible with both
// new sb_secret_... format and legacy JWT format keys).
// Functions are deployed with --no-verify-jwt so no user JWT is needed.
async function invoke(fnName, body) {
  const res = await fetch(`${url}/functions/v1/${fnName}`, {
    method:  'POST',
    headers: {
      'apikey':        secretKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = { _raw: text } }
  return { ok: res.ok, status: res.status, data }
}

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

console.log('\n────────────────────────────────────────')
console.log('  Brain Overflow — Verification')
console.log('────────────────────────────────────────')

// ── Test 1: list_rooms ──────────────────────────────────────────────────────
await test('room-management: list_rooms', async () => {
  const { ok, status, data } = await invoke('room-management', { action: 'list_rooms' })
  assert(ok, `HTTP ${status}: ${JSON.stringify(data)}`)
  assert(data?.rooms !== undefined, `Expected 'rooms' array, got: ${JSON.stringify(data)}`)
})

// ── Test 2: list_models ─────────────────────────────────────────────────────
await test('room-management: list_models', async () => {
  const { ok, status, data } = await invoke('room-management', { action: 'list_models' })
  assert(ok, `HTTP ${status}: ${JSON.stringify(data)}`)
  assert(Array.isArray(data?.models), `Expected models array`)
  assert(data.models.length > 0, `Expected at least one model — did seed.mjs run?`)
})

// ── Test 3: create_room → get_room → delete_room ───────────────────────────
let testRoomId = null

await test('room-management: create_room', async () => {
  const { ok, status, data } = await invoke('room-management', {
    action: 'create_room', name: '__verify_test_room__',
  })
  assert(ok, `HTTP ${status}: ${JSON.stringify(data)}`)
  assert(data?.room?.id, `Expected room.id in response, got: ${JSON.stringify(data)}`)
  testRoomId = data.room.id
})

await test('room-management: get_room', async () => {
  assert(testRoomId, 'Skipping — create_room failed')
  const { ok, status, data } = await invoke('room-management', {
    action: 'get_room', room_id: testRoomId,
  })
  assert(ok, `HTTP ${status}: ${JSON.stringify(data)}`)
  assert(data?.id === testRoomId, `Expected room_id to match`)
})

await test('room-management: delete_room (cleanup)', async () => {
  if (!testRoomId) return
  const { ok, status, data } = await invoke('room-management', {
    action: 'delete_room', room_id: testRoomId,
  })
  assert(ok, `HTTP ${status}: ${JSON.stringify(data)}`)
  assert(data?.deleted === true, `Expected deleted: true`)
})

// ── Test 4: process-idea (no prompts configured) ────────────────────────────
let tempRoomId = null
await test('process-idea: submit idea (no prompts → completes immediately)', async () => {
  const { ok: rOk, data: rData } = await invoke('room-management', {
    action: 'create_room', name: '__verify_idea_test__',
  })
  assert(rOk, `Could not create test room: ${JSON.stringify(rData)}`)
  tempRoomId = rData?.room?.id

  const { ok, status, data } = await invoke('process-idea', {
    room_id:      tempRoomId,
    content_text: 'This is a verification test idea — please ignore.',
    author_name:  'verify-script',
  })
  assert(ok, `HTTP ${status}: ${JSON.stringify(data)}`)
  assert(data?.idea_id, `Expected idea_id in response, got: ${JSON.stringify(data)}`)

  // Cleanup
  if (tempRoomId) {
    await invoke('room-management', { action: 'delete_room', room_id: tempRoomId })
  }
})

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────')
console.log(`  Results: ${passed} passed, ${failed} failed`)
console.log('────────────────────────────────────────\n')

if (failed > 0) {
  console.error('Some tests failed. Check function logs in the Supabase dashboard:')
  console.error(`  https://supabase.com/dashboard/project/${process.env.SUPABASE_PROJECT_REF}/functions\n`)
  process.exit(1)
}
