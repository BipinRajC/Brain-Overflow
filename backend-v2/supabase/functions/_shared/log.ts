// Structured, human-readable logger for edge functions.
// Every log line is a JSON object — easy to grep, easy to read in Supabase logs.

export interface LogContext {
  fn: string          // function name, e.g. 'process-prompt'
  idea_id?: string
  room_id?: string
  prompt_id?: string
  provider?: string
  model?: string
  [key: string]: unknown
}

// Standard log — info level
export function log(ctx: LogContext, message: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({
    ts:      new Date().toISOString(),
    level:   'info',
    message,
    ...ctx,
    ...extra,
  }))
}

// Error log — includes error message and stack trace
export function logError(ctx: LogContext, err: unknown, message?: string): void {
  const error = err instanceof Error ? err : new Error(String(err))
  console.error(JSON.stringify({
    ts:      new Date().toISOString(),
    level:   'error',
    message: message ?? error.message,
    error:   error.message,
    stack:   error.stack,
    ...ctx,
  }))
}
