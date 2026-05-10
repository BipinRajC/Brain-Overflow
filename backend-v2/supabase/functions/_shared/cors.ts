// CORS headers for all edge function responses.
// All origins are allowed — this is an anonymous, trust-based system.
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Returns a 200 OK response for CORS preflight OPTIONS requests.
export function corsPreflight(): Response {
  return new Response('ok', { headers: CORS_HEADERS })
}

// Wraps data in a JSON response with CORS headers.
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Wraps an error message in a JSON error response with CORS headers.
export function errorResponse(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
