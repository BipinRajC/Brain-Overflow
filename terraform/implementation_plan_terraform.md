# Terraform & Backend Implementation Plan

## 1. Philosophy & Constraints

- **No `config/` folder** exists in this repo. All mutable configuration (prompts, models, room settings) lives in the database.
- **Single generic API key**: The Supabase Secret is always named `AI_API_KEY`. Whichever provider is used (Fireworks today, another tomorrow), the edge function reads the same secret name.
- **Minimal data**: Every table has exactly one purpose. No redundant columns (e.g., `transcript` is NOT stored in `ideas`; it lives as the first user message in `chat_messages`).
- **Always room-based**: There is no "offline-only single-user mode." A single user simply creates a private room and does not share the access code. Everything is stored in Supabase.
- **No Authentication / No RLS**: Access is controlled entirely by possessing the correct `SUPABASE_URL` + `SUPABASE_ANON_KEY` (shared among collaborators) and knowing a room's 6-character `access_code`.

---

## 2. Database Schema (DDL)

Run the script below in the **Supabase SQL Editor** (or via `psql`) immediately after Terraform creates the project.

```sql
-- ==========================================
-- 1. rooms  (Collaboration spaces)
-- ==========================================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    access_code TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 2. models  (Global AI model catalog)
-- ==========================================
CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'fireworks',
    display_name TEXT NOT NULL,
    api_model_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 3. ideas  (Conversation thread headers)
-- ==========================================
CREATE TABLE IF NOT EXISTS ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    status TEXT CHECK (status IN ('recorded', 'processing', 'completed', 'failed')) NOT NULL DEFAULT 'recorded',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ideas_room_created ON ideas(room_id, created_at DESC);

-- ==========================================
-- 4. prompts  (Room-specific, fully editable)
-- ==========================================
CREATE TABLE IF NOT EXISTS prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    execution_order INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN DEFAULT true,
    response_schema JSONB NOT NULL DEFAULT '{}',
    updates_metadata BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(room_id, name)
);

CREATE INDEX idx_prompts_room_order ON prompts(room_id, execution_order ASC);

-- ==========================================
-- 5. room_config  (Per-room runtime settings)
-- ==========================================
CREATE TABLE IF NOT EXISTS room_config (
    room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
    selected_model_id TEXT NOT NULL REFERENCES models(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 6. chat_messages  (Transcripts + AI responses)
-- ==========================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id),
    role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
    content TEXT NOT NULL,
    prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
    model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_idea ON chat_messages(idea_id, created_at ASC);
CREATE INDEX idx_chat_messages_room ON chat_messages(room_id);

-- ==========================================
-- 7. idea_metadata  (Parsed AI analysis)
-- ==========================================
CREATE TABLE IF NOT EXISTS idea_metadata (
    idea_id UUID PRIMARY KEY REFERENCES ideas(id) ON DELETE CASCADE,
    category TEXT,
    score TEXT,
    refined_idea TEXT,
    key_features JSONB,
    target_persona TEXT,
    paul_graham_details JSONB,
    responses JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_metadata_category ON idea_metadata(category);
CREATE INDEX idx_metadata_score ON idea_metadata(score);
```

### Relationship Map

```
rooms ||--o{ ideas : contains
rooms ||--o{ chat_messages : contains
rooms ||--o{ prompts : defines
rooms ||--|| room_config : configures
ideas ||--o{ chat_messages : has
ideas ||--|| idea_metadata : describes
prompts ||--o{ chat_messages : generated
models ||--o{ room_config : selected_by
models ||--o{ chat_messages : used_by
```

**Summary of Cardinality**
- `rooms` 1:N `ideas`
- `rooms` 1:N `chat_messages`
- `rooms` 1:N `prompts`
- `rooms` 1:1 `room_config`
- `ideas` 1:N `chat_messages`
- `ideas` 1:1 `idea_metadata`
- `chat_messages` N:1 `prompts` (nullable)
- `chat_messages` N:1 `models` (nullable)
- `room_config` N:1 `models`
- `prompts` N:1 `rooms`

---

## 3. Edge Functions

All edge functions live under `supabase/functions/`.

### 3.1 `_shared/ai_client.ts`

A shared Deno module imported by `process_idea`. It calls the external AI API using the generic `AI_API_KEY` secret.

```typescript
// supabase/functions/_shared/ai_client.ts

export async function callAi(
  apiModelId: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const apiKey = Deno.env.get('AI_API_KEY')
  if (!apiKey) throw new Error('AI_API_KEY secret not configured')

  const res = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: apiModelId,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2048,
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`AI API error: ${res.status} ${txt}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

/**
 * Converts a JSON response object into a Markdown string for the chat UI.
 * Uses custom templates for known prompts, generic JSON-to-markdown fallback
 * for user-created prompts.
 */
export function formatJsonToMarkdown(json: any, promptName: string): string {
  if (promptName === 'categorize_and_refine') {
    const features = (json.key_features ?? []).map((f: string) => `- ${f}`).join('\n')
    return `**Category:** ${json.category ?? 'N/A'}\n\n**Refined Idea:**\n${json.refined_idea ?? 'N/A'}\n\n**Key Features:**\n${features}\n\n**Target Persona:** ${json.target_persona ?? 'N/A'}`
  }

  if (promptName === 'paul_graham_test') {
    const criteria = json.criteria_assessment ?? {}
    let md = `**Overall Score:** ${json.score ?? 'N/A'}\n\n**Criteria Assessment:**\n`
    for (const [k, v] of Object.entries(criteria)) {
      md += `\n- **${k}**: ${JSON.stringify(v)}`
    }
    md += `\n\n**Summary:** ${json.overall_summary ?? 'N/A'}\n\n**Key Question:** ${json.most_important_question ?? 'N/A'}`
    return md
  }

  // Generic fallback
  return Object.entries(json)
    .map(([k, v]) => `**${k}:** ${JSON.stringify(v)}`)
    .join('\n\n')
}
```

### 3.2 `create_room` Edge Function

**Responsibilities**
- Generate a unique 6-character access code.
- Insert the `rooms` row.
- Insert `room_config` with the first active global model.
- Seed **default prompts** for this room (hardcoded inside the function so there is no external `config/` dependency).

**Deploy:**
```bash
supabase functions deploy create_room
```

**Implementation skeleton:**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { name, author_name } = await req.json()
    if (!name || !author_name) throw new Error('Missing name or author_name')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Unique access code
    let accessCode = generateAccessCode()
    let exists = true
    while (exists) {
      const { data } = await supabaseAdmin.from('rooms').select('id').eq('access_code', accessCode).maybeSingle()
      if (!data) exists = false
      else accessCode = generateAccessCode()
    }

    // Create room
    const { data: room, error: roomErr } = await supabaseAdmin
      .from('rooms')
      .insert({ name, access_code: accessCode, is_active: true })
      .select()
      .single()
    if (roomErr || !room) throw roomErr ?? new Error('Room creation failed')

    // Default model
    const { data: firstModel } = await supabaseAdmin
      .from('models')
      .select('id')
      .eq('is_active', true)
      .order('created_at')
      .limit(1)
      .single()

    const defaultModelId = firstModel?.id ?? 'llama-3.1-405b'

    await supabaseAdmin.from('room_config').insert({
      room_id: room.id,
      selected_model_id: defaultModelId,
    })

    // Seed default prompts (room-specific)
    const defaultPrompts = [
      {
        room_id: room.id,
        name: 'categorize_and_refine',
        display_name: 'Categorize & Refine',
        system_prompt:
          `You are an expert startup analyst. Analyze the user's idea and return a JSON object containing: ` +
          `category (Startup Idea, Developer Tool, Productivity App, Consumer App, B2B SaaS, Hardware, Social Impact, or Other), ` +
          `refined_idea (string), key_features (array of strings), target_persona (string).`,
        execution_order: 1,
        is_enabled: true,
        response_schema: {
          category: 'string',
          refined_idea: 'string',
          key_features: ['string'],
          target_persona: 'string',
        },
        updates_metadata: true,
      },
      {
        room_id: room.id,
        name: 'paul_graham_test',
        display_name: 'Paul Graham Test',
        system_prompt:
          `You are Paul Graham evaluating a startup idea against Y Combinator criteria. ` +
          `Return a JSON object with: score (exactly one of: Good Idea, Weak, Needs Pivot), ` +
          `criteria_assessment (object with keys per criterion and values containing score and explanation), ` +
          `overall_summary (string), most_important_question (string).`,
        execution_order: 2,
        is_enabled: true,
        response_schema: {
          score: 'string (exactly: Good Idea | Weak | Needs Pivot)',
          criteria_assessment: 'object',
          overall_summary: 'string',
          most_important_question: 'string',
        },
        updates_metadata: true,
      },
    ]

    await supabaseAdmin.from('prompts').insert(defaultPrompts as any)

    return new Response(
      JSON.stringify({ room_id: room.id, access_code: accessCode, name: room.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
```

### 3.3 `process_idea` Edge Function

**Responsibilities**
- Validate the room is active.
- Update `ideas.status` to `'processing'`.
- Fetch the room's selected model and enabled prompts (ordered by `execution_order`).
- For each prompt:
  1. Append the JSON schema requirement to the system prompt.
  2. Call `callAi()` (shared module).
  3. Parse JSON (strip any accidental markdown fences).
  4. Format the JSON into human-readable Markdown via `formatJsonToMarkdown()`.
  5. Insert an assistant `chat_messages` row.
  6. If `prompt.updates_metadata === true`, upsert `idea_metadata` with parsed fields.
- Update `ideas.status` to `'completed'` (or `'failed'` on error).

**Input body:**
```json
{
  "room_id": "uuid",
  "idea_id": "uuid",
  "author_name": "Alice",
  "transcript": "...",
  "enabled_prompts": ["categorize_and_refine"] // optional filter
}
```

**Deploy:**
```bash
supabase functions deploy process_idea
```

**Implementation skeleton:**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callAi, formatJsonToMarkdown } from '../_shared/ai_client.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { room_id, idea_id, author_name, transcript, enabled_prompts } = await req.json()
    if (!room_id || !idea_id || !transcript) throw new Error('Missing required fields')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Validate room
    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('id')
      .eq('id', room_id)
      .eq('is_active', true)
      .single()
    if (!room) throw new Error('Room not found or inactive')

    // 2. Mark processing
    await supabaseAdmin
      .from('ideas')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', idea_id)

    // 3. Get room config (model)
    const { data: config } = await supabaseAdmin
      .from('room_config')
      .select('selected_model_id')
      .eq('room_id', room_id)
      .single()

    // Resolve api_model_id
    const { data: model } = await supabaseAdmin
      .from('models')
      .select('api_model_id')
      .eq('id', config?.selected_model_id ?? '')
      .single()
    const apiModelId = model?.api_model_id
    if (!apiModelId) throw new Error('Selected model not found')

    // 4. Fetch enabled prompts
    let query = supabaseAdmin
      .from('prompts')
      .select('*')
      .eq('room_id', room_id)
      .eq('is_enabled', true)
      .order('execution_order', { ascending: true })

    if (enabled_prompts && enabled_prompts.length > 0) {
      query = query.in('name', enabled_prompts)
    }

    const { data: prompts } = await query
    if (!prompts || prompts.length === 0) {
      await supabaseAdmin.from('ideas').update({ status: 'completed' }).eq('id', idea_id)
      return new Response(
        JSON.stringify({ status: 'completed', message: 'No prompts enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Sequential prompt execution
    let previousOutput = transcript

    for (const prompt of prompts) {
      const messages: any[] = []
      if (prompt.execution_order > 1) {
        messages.push({ role: 'assistant', content: previousOutput })
      }
      messages.push({ role: 'user', content: transcript })

      const schemaInstruction =
        `\n\nCRITICAL: You must respond with a single valid JSON object matching this schema. ` +
        `Do not include markdown formatting, explanations, or any text outside the JSON object.\nSchema:\n` +
        JSON.stringify(prompt.response_schema, null, 2)

      const fullSystemPrompt = prompt.system_prompt + schemaInstruction

      const rawText = await callAi(apiModelId, fullSystemPrompt, messages)

      // Parse JSON
      let parsedJson: any = null
      try {
        const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        parsedJson = JSON.parse(cleaned)
      } catch (e) {
        console.error('JSON parse failed for prompt', prompt.name, 'raw:', rawText)
      }

      const content = parsedJson ? formatJsonToMarkdown(parsedJson, prompt.name) : rawText

      // Store assistant message
      await supabaseAdmin.from('chat_messages').insert({
        idea_id,
        room_id,
        role: 'assistant',
        content,
        prompt_id: prompt.id,
        model_id: config?.selected_model_id,
        metadata: { raw_response: parsedJson ?? rawText },
      })

      // Update metadata
      if (prompt.updates_metadata && parsedJson) {
        const metaUpdate: any = { idea_id, updated_at: new Date().toISOString() }
        const responseLog: any = {}

        if (prompt.name === 'categorize_and_refine') {
          metaUpdate.category = parsedJson.category
          metaUpdate.refined_idea = parsedJson.refined_idea
          metaUpdate.key_features = parsedJson.key_features
          metaUpdate.target_persona = parsedJson.target_persona
          responseLog['categorize_and_refine'] = parsedJson
        } else if (prompt.name === 'paul_graham_test') {
          metaUpdate.score = parsedJson.score
          metaUpdate.paul_graham_details = parsedJson.criteria_assessment
          responseLog['paul_graham_test'] = parsedJson
        }

        const { data: existing } = await supabaseAdmin
          .from('idea_metadata')
          .select('responses')
          .eq('idea_id', idea_id)
          .single()

        const mergedResponses = { ...(existing?.responses ?? {}), ...responseLog }

        await supabaseAdmin.from('idea_metadata').upsert(
          { ...metaUpdate, responses: mergedResponses },
          { onConflict: 'idea_id' }
        )
      }

      previousOutput = rawText
    }

    // 6. Finalize
    await supabaseAdmin
      .from('ideas')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', idea_id)

    return new Response(
      JSON.stringify({ status: 'completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    // Mark failed
    const body = await req.json().catch(() => ({}))
    if (body.idea_id) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      await supabaseAdmin.from('ideas').update({ status: 'failed' }).eq('id', body.idea_id)
    }

    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
```

---

## 4. Terraform Configuration

### File Layout

```
terraform/
├── main.tf
├── variables.tf
├── outputs.tf
├── setup_database.sql   # The DDL script from Section 2
└── seed.js              # Node.js seed script for default models
```

### `main.tf`

```hcl
terraform {
  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
  }
}

provider "supabase" {
  access_token = var.supabase_access_token
}

resource "supabase_project" "idea_vault" {
  organization_id   = var.supabase_organization_id
  name              = var.project_name
  region            = var.region
  database_password = var.database_password
}
```

### `variables.tf`

```hcl
variable "supabase_access_token" {
  description = "Supabase Management API personal access token"
  type        = string
  sensitive   = true
}

variable "supabase_organization_id" {
  description = "Supabase organization ID"
  type        = string
}

variable "project_name" {
  description = "Name of the Supabase project"
  type        = string
  default     = "idea-vault"
}

variable "region" {
  description = "Supabase region (e.g. us-east-1)"
  type        = string
  default     = "us-east-1"
}

variable "database_password" {
  description = "Password for the PostgreSQL database"
  type        = string
  sensitive   = true
}

variable "fireworks_api_key" {
  description = "API key for the AI provider (stored as AI_API_KEY secret)"
  type        = string
  sensitive   = true
}
```

### `outputs.tf`

```hcl
output "supabase_url" {
  value = supabase_project.idea_vault.api_url
}

output "supabase_anon_key" {
  value     = supabase_project.idea_vault.anon_key
  sensitive = true
}

output "supabase_project_ref" {
  value = supabase_project.idea_vault.id
}
```

### Secret Injection

After `terraform apply`, manually set the edge-function secret via the Supabase CLI or dashboard:

```bash
supabase secrets set --project-ref <PROJECT_REF> AI_API_KEY=<YOUR_FIREWORKS_KEY>
```

*(Terraform may support secret resources in future provider versions; use CLI as the stable path today.)*

---

## 5. Setup & Seeding Steps

### Step 1: Provision Infrastructure

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

Provide `fireworks_api_key` when prompted. Capture the outputs:
- `supabase_url`
- `supabase_anon_key`

### Step 2: Create Database Tables

**Option A — SQL Editor (simplest):**
1. Open the Supabase Dashboard for the new project.
2. Go to **SQL Editor** → **New Query**.
3. Paste the entire contents of `terraform/setup_database.sql`.
4. Click **Run**.

**Option B — psql (if installed):**
```bash
# Obtain the connection string from Dashboard -> Settings -> Database
psql "postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres" -f terraform/setup_database.sql
```

### Step 3: Seed Default Models

Run the provided Node.js script. It requires `SUPABASE_URL` (project URL) and `SUPABASE_SERVICE_ROLE_KEY` (from Dashboard → Settings → API → service_role key).

```bash
cd terraform
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
node seed.js
```

`seed.js`:

```javascript
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing env vars'); process.exit(1) }

const supabase = createClient(url, key)

const models = [
  {
    id: 'kimi-k2.5',
    provider: 'fireworks',
    display_name: 'Kimi K2.5',
    api_model_id: 'accounts/fireworks/models/kimi-k2p5',
    is_active: true,
  },
  {
    id: 'llama-3.1-405b',
    provider: 'fireworks',
    display_name: 'Llama 3.1 405B',
    api_model_id: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
    is_active: true,
  },
]

async function seed() {
  const { error } = await supabase.from('models').upsert(models, { onConflict: 'id' })
  if (error) { console.error(error); process.exit(1) }
  console.log('Seeded default models.')
}

seed()
```

### Step 4: Deploy Edge Functions

```bash
supabase link --project-ref <PROJECT_REF>
supabase functions deploy create_room
supabase functions deploy process_idea
```

### Step 5: Share Credentials with App Users

Share the following with anyone installing the Flutter app:
- `SUPABASE_URL` (from Terraform output)
- `SUPABASE_ANON_KEY` (from Terraform output)

They paste these into the app on first launch. The app uses them for all database and edge-function calls.

---

## 6. Security & Access Model

| Layer | Implementation |
|-------|----------------|
| **Authentication** | None. No Supabase Auth, no RLS. |
| **Database Access** | Anon key is user-pasted. Anyone with the key can read/write any table. |
| **Room Isolation** | Every query is filtered by `room_id`. Data is logically isolated per room. |
| **Collaboration** | Users share the same Supabase URL + Anon Key + a 6-char room `access_code`. |
| **AI API Keys** | `AI_API_KEY` lives only in Supabase Secrets. Never exposed to the client. |
| **Edge Functions** | Run with Service Role Key, bypassing any client-side restrictions. |
| **Trust Model** | This is intentional trust-based collaboration. Do not use for sensitive data. |

---

*End of Terraform & Backend Implementation Plan*
