# Brain Overflow — Backend v2

A minimal, deterministic, human-debuggable backend for the Brain Overflow AI Idea Logger.

Built with: **Supabase** (Postgres + Edge Functions + Realtime) · **Deno TypeScript** · **No frameworks**

---

## Quick Start

```bash
# 1. Copy the env template and fill in your values
cp .env.example .env

# 2. Run setup — does everything in one command
npm run setup
```

That's it. Setup prints your `SUPABASE_URL` and `SUPABASE_ANON_KEY` at the end — give these to the Flutter app.

---

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- Node.js 18+
- A Supabase project (create one free at [supabase.com](https://supabase.com))
- A Fireworks AI API key (or OpenAI / Anthropic)

---

## Environment Variables

| Variable | Where to find it | Required |
|---|---|---|
| `SUPABASE_PROJECT_REF` | Project Settings → General | ✅ |
| `SUPABASE_URL` | Project Settings → API | ✅ |
| `SUPABASE_PUBLISHABLE_KEY` | Project Settings → API → **Publishable** (formerly anon key) | ✅ |
| `SUPABASE_SECRET_KEY` | Project Settings → API → **Secret** (formerly service_role key) | ✅ |
| `AI_API_KEY` | Your Fireworks AI account | ✅ |
| `OPENAI_API_KEY` | Your OpenAI account | ⬜ optional |
| `ANTHROPIC_API_KEY` | Your Anthropic account | ⬜ optional |

> **Security:** `SUPABASE_SECRET_KEY` and AI keys are **never** exposed to the mobile app.
> The app only uses `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`.
>
> **Edge function note:** Supabase's runtime still auto-injects `SUPABASE_SERVICE_ROLE_KEY`
> and `SUPABASE_ANON_KEY` internally — the new dashboard names are UI-only.
> The edge function code uses the auto-injected names and does not need to change.

---

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | Full first-time setup (link → migrate → seed → deploy → verify) |
| `npm run reset` | Wipe DB and redeploy (dev/testing only — **deletes all data**) |
| `npm run seed` | Re-seed models table only |
| `npm run verify` | Smoke-test all deployed edge functions |

---

## Folder Structure

```
backend-v2/
├── package.json
├── .env.example
├── scripts/
│   ├── setup.mjs       ← npm run setup
│   ├── reset.mjs       ← npm run reset
│   ├── seed.mjs        ← upserts models table
│   └── verify.mjs      ← smoke tests after deployment
└── supabase/
    ├── config.toml
    ├── migrations/
    │   └── 00001_schema.sql    ← complete idempotent schema
    └── functions/
        ├── _shared/
        │   ├── cors.ts         ← CORS headers + response helpers
        │   ├── db.ts           ← createServiceClient()
        │   ├── log.ts          ← structured JSON logger
        │   ├── context.ts      ← deterministic context builder (KEY FILE)
        │   └── providers/
        │       ├── fireworks.ts
        │       ├── openai.ts
        │       └── anthropic.ts
        ├── process-idea/
        │   └── index.ts        ← entry point for idea submission
        ├── process-prompt/
        │   └── index.ts        ← processes exactly ONE prompt
        └── room-management/
            └── index.ts        ← all CRUD + export
```

---

## How Prompt Chaining Works

```
Flutter app
    │
    │  POST /functions/v1/process-idea
    │  { room_id, content_text, author_name }
    │
    ▼
process-idea
    ├── Insert idea row (status='recording')
    ├── Store original text as chat_messages (role='user', prompt_id=NULL)
    ├── Update idea status → 'processing'
    ├── Load room.first_prompt_id
    └── EdgeRuntime.waitUntil → POST process-prompt { idea_id, prompt_id }
    
    Returns { idea_id } immediately ←──────────────────────────────────────┐
                                                                            │
process-prompt (prompt 1)                                                   │
    ├── Load prompt from DB                                                 │
    ├── Check prompt_executions — skip if already 'done' (idempotency)     │
    ├── Mark execution 'running'                                            │
    ├── Fetch original idea text (first user message, prompt_id IS NULL)   │
    ├── Fetch prior prompt_executions outputs (for context)                │
    ├── buildContext(ideaText, priorOutputs)  ← size-bounded, deterministic│
    ├── Call AI provider adapter                                            │
    ├── Store: system_prompt sent (role='user') + response (role='assistant')│
    ├── Mark execution 'done', store output_text                            │
    ├── Parse CATEGORY: / SCORE: → upsert idea_metadata                    │
    └── EdgeRuntime.waitUntil → POST process-prompt { idea_id, next_prompt_id }
    
process-prompt (prompt 2)
    └── (same as above)
    
process-prompt (last prompt)
    └── Update idea status → 'completed'
```

**Key design rule:** Each prompt runs in its own edge function invocation. No loops. No shared memory.

---

## Context Building (The Fix)

The existing backend sent the **entire chat history** to every prompt. This caused:
- Token explosions on long chains
- Wrong responses (model got confused by growing history)

The new `context.ts` builds context deterministically:

```
context = [
  { role: 'user', content: ORIGINAL_IDEA_TEXT },         // always present
  { role: 'assistant', content: "[step-1]: SUMMARY..." }, // trimmed to 1000 chars
  { role: 'assistant', content: "[step-2]: SUMMARY..." }, // trimmed to 1000 chars
]
```

Rules:
- Original idea is **always** the first message and is **never removed**
- Prior outputs come from `prompt_executions.output_text` (not chat_messages)
- Each prior output is trimmed to 1000 chars
- Total context is capped at 6000 chars
- If over cap, oldest prior outputs are dropped first

---

## Idempotency & Resumability

The `prompt_executions` table tracks per-prompt status:

```sql
(idea_id, prompt_id) PRIMARY KEY
status: 'pending' | 'running' | 'done' | 'failed'
output_text: TEXT   -- used for context in later prompts
error: TEXT         -- error message if status='failed'
```

**If prompt 3 fails:**
- Prompts 1 and 2 remain `done` — their outputs are preserved
- Re-invoking `process-prompt` for prompt 3 skips 1 and 2 automatically
- The chain resumes correctly from prompt 3

**If process-prompt is called twice for the same prompt:**
- Second invocation finds `status='done'` → skips → continues chain
- No duplicate AI calls, no duplicate messages

---

## AI Providers

| Provider | Secret | Model examples |
|---|---|---|
| Fireworks (default) | `AI_API_KEY` | `kimi-k2p5`, `llama-v3p1-405b-instruct` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-3-5-sonnet-20241022` |

To add a new provider:
1. Add a file `supabase/functions/_shared/providers/yourprovider.ts`
2. Export `generateCompletion(params)` with the same interface
3. Add an `if (provider === 'yourprovider')` branch in `process-prompt/index.ts`
4. Add the API key to `.env` and inject it via `supabase secrets set`
5. Add model rows to `scripts/seed.mjs`

---

## Flutter App Integration

### Setup screen

```dart
// Store these in encrypted Hive box, never expose service role key
final url     = 'https://your-project-ref.supabase.co'
final anonKey = 'eyJ...'

await Supabase.initialize(url: url, anonKey: anonKey)
```

### Submit an idea

```dart
final res = await supabase.functions.invoke('process-idea', body: {
  'room_id':      currentRoomId,
  'content_text': transcript,
  'author_name':  userName,
})
final ideaId = res.data['idea_id']
// Status is 'processing' — UI updates via Realtime subscription
```

### Room management

```dart
// List all rooms
await supabase.functions.invoke('room-management', body: {
  'action': 'list_rooms',
})

// Create a room
await supabase.functions.invoke('room-management', body: {
  'action': 'create_room',
  'name': 'My Ideas',
})

// Set prompts for a room (replaces entire chain)
await supabase.functions.invoke('room-management', body: {
  'action': 'set_prompts',
  'room_id': roomId,
  'prompts': [
    {
      'name': 'categorize',
      'system_prompt': 'Categorize this idea...',
      'is_enabled': true,
    },
    {
      'name': 'evaluate',
      'system_prompt': 'Evaluate this idea...',
      'is_enabled': true,
    },
  ],
})

// Get ideas for a room (paginated)
await supabase.functions.invoke('room-management', body: {
  'action':   'get_ideas',
  'room_id':  roomId,
  'page':     0,
  'per_page': 20,
})
```

### Export an idea (for AI context)

```dart
// Returns { text: "# Brain Overflow — Idea Export\n..." }
final res = await supabase.functions.invoke('room-management', body: {
  'action':  'export_idea',
  'idea_id': ideaId,
})
final exportText = res.data['text']

// Show in a dialog with a "Copy to clipboard" button
// User pastes into ChatGPT / Claude to continue the conversation
```

### Realtime subscriptions

```dart
// Subscribe to idea status updates
supabase
  .from('ideas')
  .stream(primaryKey: ['id'])
  .eq('room_id', roomId)
  .listen((rows) => updateIdeasList(rows))

// Subscribe to new messages for an idea
supabase
  .from('chat_messages')
  .stream(primaryKey: ['id'])
  .eq('idea_id', ideaId)
  .order('created_at', ascending: true)
  .listen((rows) => updateChatView(rows))
```

---

## Adding Prompts

Prompts are configured per-room through the Flutter UI (which calls `set_prompts`).

**Optional metadata markers:**
Add these instructions to any prompt's `system_prompt` to extract structured data:

```
At the end of your response, include:
CATEGORY: <one of: startup_idea, dev_tool, ai_agent, automation, saas, consumer_app, other>
SCORE: <one of: high_potential, promising, needs_refinement, needs_pivot, weak>
```

`process-prompt` will parse these and write them to `idea_metadata.category` / `idea_metadata.score`.
The Flutter app reads `idea_metadata` to show colored badges on idea cards.

---

## Export Format

The `export_idea` action returns a markdown document like this:

```markdown
# Brain Overflow — Idea Export

**Room:** My Ideas
**Author:** John
**Date:** 2026-05-10
**Status:** completed
**Category:** startup_idea
**Score:** high_potential

---

## Original Idea

An app that lets developers voice-log ideas while coding...

---

## AI Analysis

### Step 1: categorize

**Prompt Instructions:**
> Categorize this idea and identify its key attributes...

**AI Response:**

This is a developer productivity tool that...

CATEGORY: dev_tool
SCORE: high_potential

---

### Step 2: evaluate

...

---

*Exported from Brain Overflow on 2026-05-10*
*Idea ID: abc123-...*
```

Paste this directly into Claude, ChatGPT, or Gemini to continue the analysis.

---

## Debugging

**Check edge function logs:**
```bash
npx supabase functions logs process-prompt --project-ref YOUR_REF
```

Every log line is JSON — grep by `idea_id`, `prompt_id`, or `level`:
```bash
npx supabase functions logs process-prompt | grep '"level":"error"'
```

**Check prompt execution status:**
```sql
SELECT pe.*, p.name
FROM prompt_executions pe
JOIN prompts p ON p.id = pe.prompt_id
WHERE pe.idea_id = 'YOUR_IDEA_ID'
ORDER BY pe.completed_at ASC;
```

**Manual prompt retry:**
If a prompt fails, you can re-invoke it by calling:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/process-prompt \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"idea_id":"...","room_id":"...","prompt_id":"..."}'
```
The function will skip already-completed prompts and resume from the failed one.

---

## What This Does NOT Do

- ❌ Authentication — this is a trust-based system; all users with the anon key share the same data
- ❌ Iterative chat — ideas go through the configured prompt chain once; no back-and-forth AI chat
- ❌ File storage — ideas are text only
- ❌ Rate limiting — add this yourself if needed
- ❌ Multi-tenancy — all rooms are visible to anyone with the credentials
