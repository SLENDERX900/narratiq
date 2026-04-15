import { callLLM } from '../config/llm.js'
import { extractJSON } from '../lib/llmJson.js'
import { supabase } from '../config/supabase.js'

const NEUTRAL_SENTIMENT = {
  sentiment_category: 'neutral',
  ai_score: 0,
  key_themes: [],
}

export async function runSentimentAgent(ticker, runId, headlines) {
  console.log(`[SentimentAgent] ${ticker} — starting`)

  if (!headlines || headlines.length === 0) {
    console.warn(`[SentimentAgent] ${ticker} — no headlines, using neutral`)
    await writeCheckpoint(ticker, runId, NEUTRAL_SENTIMENT)
    return NEUTRAL_SENTIMENT
  }

  const headlineText = headlines
    .slice(0, 10)
    .map((h, i) => `${i + 1}. ${h.title}`)
    .join('\n')

  const messages = [
    {
      role: 'system',
      content: `You are a financial sentiment classifier. You MUST respond with ONLY a valid JSON object and nothing else — no explanation, no markdown, no extra text before or after the JSON.`,
    },
    {
      role: 'user',
      content: `Classify sentiment for ${ticker} based on these headlines:\n\n${headlineText}\n\nRespond with ONLY this JSON, nothing else:\n{"sentiment_category":"bullish|bearish|neutral","ai_score":<float -1.0 to 1.0>,"key_themes":["theme1","theme2","theme3"]}`,
    },
  ]

  let result = NEUTRAL_SENTIMENT
  try {
    const raw = await callLLM({ tier: 'fast', messages })
    const parsed = extractJSON(raw)
    result = {
      sentiment_category: ['bullish','bearish','neutral'].includes(parsed.sentiment_category)
        ? parsed.sentiment_category : 'neutral',
      ai_score: parseFloat(parsed.ai_score) || 0,
      key_themes: Array.isArray(parsed.key_themes) ? parsed.key_themes.slice(0, 5) : [],
    }
  } catch (err) {
    console.error(`[SentimentAgent] ${ticker} — LLM parse failed: ${err.message}`)
  }

  await writeCheckpoint(ticker, runId, result)
  console.log(`[SentimentAgent] ${ticker} — done. Category: ${result.sentiment_category}`)
  return result
}

async function writeCheckpoint(ticker, runId, data) {
  await supabase.from('agent_run_log').upsert({
    run_id: runId,
    ticker,
    step_completed: 4,
    step_data: data,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'run_id,ticker' })
}
