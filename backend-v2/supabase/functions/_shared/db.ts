import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Creates a Supabase client using the secret key (formerly service_role).
// This bypasses RLS — only use inside edge functions, never expose to clients.
//
// ── Supabase API key naming history ────────────────────────────────────────
//  Legacy format (JWT):     SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//                           starts with "eyJ..."
//  New format (non-JWT):    SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY
//                           starts with "sb_publishable_..." / "sb_secret_..."
//
// Edge function runtime auto-injects the secret key as SUPABASE_SERVICE_ROLE_KEY
// regardless of which format the project uses. We read it with that name.
//
// The new non-JWT keys are passed via the 'apikey' HTTP header (not Authorization Bearer).
// The Supabase JS client handles this automatically when initialized with the key.
export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase runtime')
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        // Pass the key as apikey header — required for new sb_secret_... format
        apikey: key,
      },
    },
  })
}
