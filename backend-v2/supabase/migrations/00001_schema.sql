-- ============================================================================
-- Brain Overflow — Complete Schema (v2)
-- Idempotent migration: safe to run multiple times on an existing database.
--
-- NOTE: rooms.first_prompt_id → prompts circular dependency is handled by:
--   1. Creating rooms WITHOUT first_prompt_id
--   2. Creating prompts (which references rooms)
--   3. ALTER TABLE rooms ADD COLUMN first_prompt_id (now prompts exists)
--   4. Adding the FK constraint via a DO block (ADD CONSTRAINT IF NOT EXISTS
--      is NOT valid PostgreSQL syntax — only ADD COLUMN IF NOT EXISTS is)
-- ============================================================================

-- ─── 1. rooms ────────────────────────────────────────────────────────────────
-- Created WITHOUT first_prompt_id to break the rooms↔prompts circular FK.
-- first_prompt_id is added below after the prompts table exists.
CREATE TABLE IF NOT EXISTS rooms (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. models ───────────────────────────────────────────────────────────────
-- Global AI model catalog. 'provider' determines which adapter is used.
-- Allowed values: 'fireworks', 'openai', 'anthropic'
CREATE TABLE IF NOT EXISTS models (
    id           TEXT PRIMARY KEY,
    provider     TEXT NOT NULL DEFAULT 'fireworks',
    display_name TEXT NOT NULL,
    api_model_id TEXT NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. ideas ────────────────────────────────────────────────────────────────
-- One row per submitted idea. The original idea text is stored as the first
-- chat_messages row (role='user', prompt_id IS NULL) — not as a column here.
CREATE TABLE IF NOT EXISTS ideas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'recorded'
                    CHECK (status IN ('recorded', 'processing', 'completed', 'failed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ideas_room_created ON ideas(room_id, created_at DESC);

-- ─── 4. prompts ──────────────────────────────────────────────────────────────
-- Per-room, user-defined prompts. Forms a singly linked list via next_prompt_id.
-- Execution order = follow the list from rooms.first_prompt_id.
CREATE TABLE IF NOT EXISTS prompts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id        UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    system_prompt  TEXT NOT NULL,
    is_enabled     BOOLEAN NOT NULL DEFAULT true,
    next_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (room_id, name)
);

-- ─── 5. Add first_prompt_id to rooms (now that prompts table exists) ─────────
-- ADD COLUMN IF NOT EXISTS is valid PostgreSQL. The FK constraint is added
-- separately in a DO block because ADD CONSTRAINT IF NOT EXISTS is NOT valid.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS first_prompt_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rooms_first_prompt_id_fkey'
          AND conrelid = 'rooms'::regclass
    ) THEN
        ALTER TABLE rooms
            ADD CONSTRAINT rooms_first_prompt_id_fkey
            FOREIGN KEY (first_prompt_id) REFERENCES prompts(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ─── 6. room_config ──────────────────────────────────────────────────────────
-- Per-room settings: which model to use. One row per room.
CREATE TABLE IF NOT EXISTS room_config (
    room_id           UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
    selected_model_id TEXT NOT NULL REFERENCES models(id) ON DELETE RESTRICT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 7. chat_messages ────────────────────────────────────────────────────────
-- Immutable append-only transcript. Never UPDATE or DELETE rows here.
--
-- Row types (identified by role + prompt_id):
--   role='user',      prompt_id IS NULL  → original idea from the user
--   role='user',      prompt_id SET      → system prompt sent to AI for this step
--   role='assistant', prompt_id SET      → AI response for this step
CREATE TABLE IF NOT EXISTS chat_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id    UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    prompt_id  UUID REFERENCES prompts(id) ON DELETE SET NULL,
    model_id   TEXT REFERENCES models(id) ON DELETE SET NULL,
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_idea ON chat_messages(idea_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id, created_at DESC);

-- ─── 8. idea_metadata ────────────────────────────────────────────────────────
-- Parsed AI outputs. Upserted by process-prompt when it finds CATEGORY:/SCORE:.
CREATE TABLE IF NOT EXISTS idea_metadata (
    idea_id    UUID PRIMARY KEY REFERENCES ideas(id) ON DELETE CASCADE,
    category   TEXT,
    score      TEXT,
    responses  JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idea_metadata_category ON idea_metadata(category);
CREATE INDEX IF NOT EXISTS idx_idea_metadata_score    ON idea_metadata(score);

-- ─── 9. prompt_executions ────────────────────────────────────────────────────
-- Tracks per-prompt execution status. Core reliability mechanism.
--
-- Before running a prompt, process-prompt checks for a 'done' row.
-- If found → skip (idempotency). This makes the chain safely replayable.
-- output_text is used as context input for subsequent prompts.
CREATE TABLE IF NOT EXISTS prompt_executions (
    idea_id      UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    prompt_id    UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'running', 'done', 'failed')),
    output_text  TEXT,
    error        TEXT,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (idea_id, prompt_id)
);

CREATE INDEX IF NOT EXISTS idx_prompt_executions_idea
    ON prompt_executions(idea_id, completed_at ASC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Disabled: trust-based anonymous access. Edge functions use the secret key.
ALTER TABLE rooms             DISABLE ROW LEVEL SECURITY;
ALTER TABLE models            DISABLE ROW LEVEL SECURITY;
ALTER TABLE ideas             DISABLE ROW LEVEL SECURITY;
ALTER TABLE prompts           DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_config       DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages     DISABLE ROW LEVEL SECURITY;
ALTER TABLE idea_metadata     DISABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_executions DISABLE ROW LEVEL SECURITY;
