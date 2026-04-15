import { callLLM } from '../config/llm.js'
import { extractJSON } from '../lib/llmJson.js'
import { supabase } from '../config/supabase.js'

export async function runOrchestratorAgent(ticker, runId, fullState) {
  console.log(`[Orchestrator] ${ticker} — starting`)

  const { price, change_pct, headlines, social, sentiment_category, ai_score, key_themes } = fullState
  const hasSocial = !social?.is_neutral_fallback
  const socialSourceLabel = {
    'marketaux':    'Marketaux news sentiment',
    'news-derived': 'derived from news headlines',
    'stocktwits':   'StockTwits',
    'finnhub':      'Reddit + StockTwits',
  }[social?.social_source] || 'unavailable'

  const socialSection = hasSocial
    ? `Social sentiment (${socialSourceLabel}): ${social.bullish_pct}% bullish / ${social.bearish_pct}% bearish (buzz: ${social.buzz_score}/100)`
    : `Social sentiment: Not available — focus on price action and news only.`

  const messages = [
    {
      role: 'system',
      content: `You are an institutional-grade market analyst with a background in macroeconomics and behavioral finance. You identify divergences between price action, sentiment, and narrative. You MUST respond with ONLY a valid JSON object and nothing else — no explanation, no markdown, no extra text.`,
    },
    {
      role: 'user',
      content: `Analyze ${ticker} and produce a market narrative.

PRICE: $${price} | Change: ${change_pct > 0 ? '+' : ''}${change_pct?.toFixed(2)}%
NEWS SENTIMENT: ${sentiment_category} (AI score: ${ai_score?.toFixed(2)})
KEY THEMES: ${(key_themes || []).join(', ') || 'none'}
RECENT HEADLINES: ${(headlines || []).slice(0, 5).map(h => h.title).join(' | ')}
${socialSection}

Write a 3-4 sentence narrative weighing price action vs sentiment${hasSocial ? ', and buzz vs fundamentals' : ''}. Assign a confidence score 0-100 based on data quality and signal coherence.

Respond with ONLY this JSON, nothing else:
{"narrative":"<3-4 sentences>","confidence_score":<int 0-100>}`,
    },
  ]

  let result = { narrative: 'Insufficient data to generate narrative.', confidence_score: 0 }

  try {
    const raw = await callLLM({ tier: 'smart', messages })
    const parsed = extractJSON(raw)
    result = {
      narrative: parsed.narrative || result.narrative,
      confidence_score: Math.min(100, Math.max(0, parseInt(parsed.confidence_score) || 0)),
    }
  } catch (err) {
    console.error(`[Orchestrator] ${ticker} — LLM parse failed: ${err.message}`)
  }

  await supabase.from('stock_insights').insert({
    ticker,
    price: fullState.price,
    change_pct: fullState.change_pct,
    candles: fullState.candles,
    headlines: fullState.headlines,
    social: fullState.social,
    sentiment_score: fullState.ai_score,
    sentiment_cat: fullState.sentiment_category,
    key_themes: fullState.key_themes,
    narrative: result.narrative,
    confidence_score: result.confidence_score,
    social_source: fullState.social?.social_source || 'none',
    generated_at: new Date().toISOString(),
  })

  await supabase.from('agent_run_log').upsert({
    run_id: runId,
    ticker,
    step_completed: 5,
    step_data: result,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'run_id,ticker' })

  console.log(`[Orchestrator] ${ticker} — done. Confidence: ${result.confidence_score}`)
  return result
}
