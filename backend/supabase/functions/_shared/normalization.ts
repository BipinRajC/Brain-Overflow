export interface NormalizedResponse {
  analysis?: string
  category?: string
  score?: string
  reasoning?: string | null
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface ExtractionResult {
  content: any | null
  prose: string | null
  error: string | null
}

export function stripReasoning(
  text: string,
  config: { tag_based: string[]; prefix_based: string[] }
): { cleaned: string; reasoning: string | null } {
  let cleaned = text
  let reasoning: string | null = null

  // Tag-based patterns
  for (const tag of config.tag_based) {
    const tagName = tag.replace(/[<>]/g, '')
    const regex = new RegExp(`${tag}[\\s\\S]*?<\\/${tagName}>`, 'gi')
    const matches = cleaned.match(regex)
    if (matches) {
      reasoning = matches.join('\n')
      cleaned = cleaned.replace(regex, '').trim()
    }
  }

  // Prefix-based patterns
  for (const prefix of config.prefix_based) {
    const regex = new RegExp(`^${prefix}[\\s\\S]*?(?=\\n\\n|$)`, 'gim')
    const matches = cleaned.match(regex)
    if (matches) {
      reasoning = (reasoning ? reasoning + '\n' : '') + matches.join('\n')
      cleaned = cleaned.replace(regex, '').trim()
    }
  }

  return { cleaned, reasoning }
}

export function extractResponse(text: string, format: string): ExtractionResult {
  if (format === 'xml_tags') {
    const result = extractXml(text)
    if (result.content) return result
    return extractMarkdown(text)
  }
  if (format === 'markdown_sections') {
    return extractMarkdown(text)
  }
  // json_schema — try JSON first, fall back to markdown
  const jsonResult = extractJson(text)
  if (jsonResult.content) return jsonResult
  const mdResult = extractMarkdown(text)
  if (mdResult.content) return mdResult
  return jsonResult
}

const VALID_JSON_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'])

function sanitizeJsonString(text: string): string {
  let result = ''
  let inString = false
  let escape = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (escape) {
      escape = false
      result += ch
      continue
    }

    if (ch === '\\' && inString) {
      const next = text[i + 1]
      if (next !== undefined && !VALID_JSON_ESCAPES.has(next)) {
        result += '\\\\'
      } else {
        escape = true
        result += ch
      }
      continue
    }

    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }

    if (inString) {
      if (ch === '\n') { result += '\\n'; continue }
      if (ch === '\r') { result += '\\r'; continue }
      if (ch === '\t') { result += '\\t'; continue }
      if (ch < ' ') { result += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'); continue }
    }

    result += ch
  }

  return result
}

function extractJson(text: string): ExtractionResult {
  // Try fenced JSON first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try {
      const sanitized = sanitizeJsonString(fenced[1].trim())
      return {
        content: JSON.parse(sanitized),
        prose: text.replace(fenced[0], '').trim() || null,
        error: null,
      }
    } catch (e: any) {
      return { content: null, prose: text.trim(), error: `JSON parse error: ${e.message}` }
    }
  }

  // Try balanced JSON object (non-greedy, handles nested braces)
  const json = extractBalancedJson(text)
  if (json) {
    try {
      return {
        content: JSON.parse(json),
        prose: text.replace(json, '').trim() || null,
        error: null,
      }
    } catch (e: any) {
      return { content: null, prose: text.trim(), error: `JSON parse error: ${e.message}` }
    }
  }

  return { content: null, prose: text.trim(), error: 'No JSON found in response' }
}

function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false
  const parts: string[] = []

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escape) {
      escape = false
      parts.push(ch)
      continue
    }

    if (ch === '\\' && inString) {
      const next = text[i + 1]
      if (next !== undefined && !VALID_JSON_ESCAPES.has(next)) {
        parts.push('\\', '\\')
      } else {
        escape = true
        parts.push(ch)
      }
      continue
    }

    if (ch === '"') {
      inString = !inString
      parts.push(ch)
      continue
    }

    if (inString) {
      // Escape control characters that break JSON parsing
      if (ch === '\n') { parts.push('\\n'); continue }
      if (ch === '\r') { parts.push('\\r'); continue }
      if (ch === '\t') { parts.push('\\t'); continue }
      if (ch < ' ') { parts.push('\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')); continue }
      parts.push(ch)
      continue
    }

    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        parts.push(ch)
        return parts.join('')
      }
    }
    parts.push(ch)
  }

  return null
}

function extractMarkdown(text: string): ExtractionResult {
  const result: any = {}

  // Try standard ## Section format (last occurrence to handle preambles)
  const analysisMatches = [...text.matchAll(/##\s*Analysis\s*\n([\s\S]*?)(?=\n##\s*\w|\n*$)/gi)]
  if (analysisMatches.length > 0) {
    result.analysis = analysisMatches[analysisMatches.length - 1][1].trim()
  }

  const categoryMatches = [...text.matchAll(/##\s*Category\s*\n\s*(\S[^\n]*)/gi)]
  if (categoryMatches.length > 0) {
    result.category = categoryMatches[categoryMatches.length - 1][1].trim()
  }

  const scoreMatches = [...text.matchAll(/##\s*Score\s*\n\s*(\S[^\n]*)/gi)]
  if (scoreMatches.length > 0) {
    result.score = scoreMatches[scoreMatches.length - 1][1].trim()
  }

  // Fallback: Gemma-style bullet format (* *Field:* value)
  // Gemma often ignores ## headers and uses its own bullet-point structure.
  // Format is *Field:* (colon before asterisk), values may be backtick-wrapped.
  if (Object.keys(result).length === 0) {
    const gemmaAnalysis = [...text.matchAll(/\*\s+\*\s*Analysis(?!\s+Section)\s*:?\*?\s*\n([\s\S]*?)(?=\n\s*\*\s+\*\s*(?:Category|Score)(?!\s+Section)\s*:?\*?|\n*$)/gi)]
    if (gemmaAnalysis.length > 0) {
      result.analysis = gemmaAnalysis[gemmaAnalysis.length - 1][1].trim()
    }

    const gemmaCategory = [...text.matchAll(/^\s*\*\s+\*\s*Category(?!\s*Section)\s*:?\*?\s*`?\s*([^\n`]+)\s*`?/gim)]
    if (gemmaCategory.length > 0) {
      result.category = gemmaCategory[gemmaCategory.length - 1][1].trim()
    }

    const gemmaScore = [...text.matchAll(/^\s*\*\s+\*\s*Score(?!\s*Section)\s*:?\*?\s*`?\s*([^\n`]+)\s*`?/gim)]
    if (gemmaScore.length > 0) {
      result.score = gemmaScore[gemmaScore.length - 1][1].trim()
    }
  }

  // Fallback: [SECTION] format used by Google-specific system prompt
  // Format: [ANALYSIS]\ncontent\n[CATEGORY]\nvalue\n[SCORE]\nvalue
  if (Object.keys(result).length === 0) {
    const bracketAnalysis = [...text.matchAll(/\[ANALYSIS\]\s*\n([\s\S]*?)(?=\n\[(?:CATEGORY|SCORE)\]|\n*$)/gi)]
    if (bracketAnalysis.length > 0) {
      result.analysis = bracketAnalysis[bracketAnalysis.length - 1][1].trim()
    }

    const bracketCategory = [...text.matchAll(/\[CATEGORY\]\s*\n\s*(\S[^\n]*)/gi)]
    if (bracketCategory.length > 0) {
      result.category = bracketCategory[bracketCategory.length - 1][1].trim()
    }

    const bracketScore = [...text.matchAll(/\[SCORE\]\s*\n\s*(\S[^\n]*)/gi)]
    if (bracketScore.length > 0) {
      result.score = bracketScore[bracketScore.length - 1][1].trim()
    }
  }

  if (Object.keys(result).length === 0) {
    return { content: null, prose: text.trim(), error: 'No markdown sections found' }
  }

  return { content: result, prose: null, error: null }
}

function extractXml(text: string): ExtractionResult {
  const responseMatch = text.match(/<response>([\s\S]*?)<\/response>/)
  if (!responseMatch) {
    return { content: null, prose: text.trim(), error: 'No XML response tag found' }
  }

  const xmlContent = responseMatch[1]
  const result: any = {}

  const fields = ['analysis', 'category', 'score']
  for (const field of fields) {
    const match = xmlContent.match(new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`))
    if (match) {
      result[field] = match[1].trim()
    }
  }

  return {
    content: result,
    prose: text.replace(responseMatch[0], '').trim() || null,
    error: null,
  }
}

export function normalizeResponse(
  parsed: any,
  aliases: Record<string, string[]>
): NormalizedResponse {
  const result: NormalizedResponse = {}

  for (const [coreField, aliasList] of Object.entries(aliases)) {
    for (const alias of aliasList) {
      if (parsed[alias] !== undefined) {
        result[coreField as keyof NormalizedResponse] = parsed[alias]
        break
      }
    }
  }

  return result
}

export function normalizeVerdict(
  verdict: string,
  synonymMap: Record<string, string>
): string {
  const normalized = verdict.toLowerCase().trim()
  return synonymMap[normalized] || normalized
}

export function extractVerdict(text: string, strategy: string): string | null {
  const matches = text.match(/VERDICT:\s*(\w+)/gi)
  if (!matches || matches.length === 0) return null

  if (strategy === 'last_occurrence') {
    const lastMatch = matches[matches.length - 1]
    return lastMatch.replace(/VERDICT:\s*/i, '').toLowerCase()
  }

  if (strategy === 'first_occurrence') {
    return matches[0].replace(/VERDICT:\s*/i, '').toLowerCase()
  }

  return null
}

export function validateResponse(
  normalized: NormalizedResponse,
  allowedCategories: string[],
  allowedScores: string[]
): ValidationResult {
  const errors: string[] = []

  if (!normalized.analysis) errors.push("Missing 'analysis' field")
  if (!normalized.category) errors.push("Missing 'category' field")
  if (!normalized.score) errors.push("Missing 'score' field")

  if (normalized.category && !allowedCategories.includes(normalized.category)) {
    errors.push(`Invalid category: ${normalized.category}`)
  }

  if (normalized.score && !allowedScores.includes(normalized.score)) {
    errors.push(`Invalid score: ${normalized.score}`)
  }

  return { valid: errors.length === 0, errors }
}
