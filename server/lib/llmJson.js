// Robust JSON extractor for LLM responses.
// LLMs often add explanation text before or after the JSON object.
// This extracts just the first complete {...} block.
export function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Empty LLM response')

  // Strip markdown fences first
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  // Find the first { and its matching closing }
  const start = stripped.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in response')

  let depth = 0
  let end = -1
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++
    else if (stripped[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }

  if (end === -1) throw new Error('Unclosed JSON object in response')

  const jsonStr = stripped.slice(start, end + 1)
  return JSON.parse(jsonStr)
}
