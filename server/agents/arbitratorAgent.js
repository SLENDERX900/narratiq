import { callLLM } from '../config/llm.js'
import { supabase } from '../config/supabase.js'
import { extractJSON } from '../lib/llmJson.js'
import { getFullContext, getRelatedAssets } from '../lib/vectorMemory.js'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, decimals = 4) {
  return Number(Number(value || 0).toFixed(decimals))
}

function normalizeSignal(value) {
  return ['Accumulation', 'Distribution', 'Neutral'].includes(value) ? value : 'Neutral'
}

function derivePriceRealityScore(layer1) {
  const priceChangePct = Number(layer1?.price_change_pct) || 0
  const rvol = Number(layer1?.rvol) || 0
  const volatilityStatus = layer1?.volatility_status || 'medium'

  const volumeMultiplier = rvol >= 2 ? 1.5
    : rvol >= 1.2 ? 1.2
    : rvol >= 0.8 ? 1
    : 0.8

  const volatilityMultiplier = volatilityStatus === 'high' ? 1.1
    : volatilityStatus === 'low' ? 0.9
    : 1

  return clamp(priceChangePct * volumeMultiplier * volatilityMultiplier, -10, 10)
}

function calculateDivergenceScore(layer1, layer2) {
  const sentimentScore = clamp(Number(layer2?.sentiment_score) || 0, -10, 10)
  const priceRealityScore = derivePriceRealityScore(layer1)
  const divergenceScore = Math.abs(sentimentScore - priceRealityScore)

  return {
    sentiment_score: sentimentScore,
    price_reality_score: round(priceRealityScore, 4),
    divergence_score: round(clamp(divergenceScore, 0, 20), 4),
  }
}

function deriveRuleBasedSignal({ sentiment_score: sentimentScore, price_reality_score: priceRealityScore, divergence_score: divergenceScore }) {
  if (divergenceScore < 4) {
    return 'Neutral'
  }

  if (sentimentScore <= -2 && priceRealityScore >= 1) {
    return 'Accumulation'
  }

  if (sentimentScore >= 2 && priceRealityScore <= -1) {
    return 'Distribution'
  }

  if (sentimentScore <= -3 && priceRealityScore > 0) {
    return 'Accumulation'
  }

  if (sentimentScore >= 3 && priceRealityScore < 0) {
    return 'Distribution'
  }

  return 'Neutral'
}

async function resolveAssetId(assetId, ticker) {
  if (assetId) return assetId
  if (!ticker) return null

  const { data, error } = await supabase
    .from('assets')
    .select('id')
    .eq('symbol', ticker.toUpperCase())
    .maybeSingle()

  if (error) {
    throw new Error(`Asset lookup failed: ${error.message}`)
  }

  return data?.id ?? null
}

function buildMessages({
  ticker,
  layer1,
  layer2,
  divergence,
  context,
  preliminarySignal,
}) {
  return [
    {
      role: 'system',
      content: [
        'You are a skeptical JPMorgan Managing Director reviewing a junior trader pitch.',
        'Your job is to challenge soft narratives, privilege tape action over headlines, and look for institutional accumulation or distribution.',
        'You are not allowed to recalculate the divergence score; treat the provided score as ground truth.',
        'Respond with ONLY one valid JSON object and no extra text.',
        'The JSON schema is exactly:',
        '{"signal":"Accumulation|Distribution|Neutral","director_take":"<string>"}',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Review this EVR setup for ${ticker}.

LAYER_1_REALITY=${JSON.stringify(layer1)}
LAYER_2_EXPECTATION=${JSON.stringify(layer2)}
MEMORY_CONTEXT=${JSON.stringify(context)}

Computed metrics:
- sentiment_score: ${divergence.sentiment_score}
- price_reality_score: ${divergence.price_reality_score}
- divergence_score: ${divergence.divergence_score}
- preliminary_signal: ${preliminarySignal}

Decision rules:
- "Accumulation" means the crowd is negative but the tape is stronger than expected.
- "Distribution" means the crowd is positive but the tape is weaker than expected.
- "Neutral" means divergence is weak, noisy, or inconclusive.

Respond with ONLY strict JSON:
{"signal":"Accumulation|Distribution|Neutral","director_take":"<short skeptical institutional explanation>"}`,
    },
  ]
}

async function writeCheckpoint(ticker, runId, data) {
  if (!runId) return

  await supabase.from('agent_run_log').upsert({
    run_id: runId,
    ticker,
    step_completed: 5,
    step_data: data,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'run_id,ticker' })
}

export async function runArbitratorAgent(ticker, runId, {
  layer1,
  layer2,
  queryEmbedding = null,
  assetId = null,
  memoryType = null,
} = {}) {
  console.log(`[Arbitrator] ${ticker} — starting`)

  if (!layer1 || !layer2) {
    throw new Error('runArbitratorAgent requires layer1 and layer2 inputs')
  }

  const resolvedAssetId = await resolveAssetId(assetId, ticker)

  let context = {
    historical_context: [],
    related_assets: [],
  }

  if (queryEmbedding && resolvedAssetId) {
    try {
      context = await getFullContext({
        queryEmbedding,
        assetId: resolvedAssetId,
        memoryType,
        matchCount: 5,
        relatedLimit: 10,
      })
    } catch (err) {
      console.warn(`[Arbitrator] ${ticker} — memory lookup failed: ${err.message}`)
    }
  } else if (resolvedAssetId) {
    try {
      context = {
        historical_context: [],
        related_assets: await getRelatedAssets({
          assetId: resolvedAssetId,
          limit: 10,
        }),
      }
    } catch (err) {
      console.warn(`[Arbitrator] ${ticker} — related asset lookup fallback failed: ${err.message}`)
      context = {
        historical_context: [],
        related_assets: [],
      }
    }
  }

  const divergence = calculateDivergenceScore(layer1, layer2)
  const preliminarySignal = deriveRuleBasedSignal(divergence)

  let result = {
    divergence_score: divergence.divergence_score,
    signal: preliminarySignal,
    director_take: 'Narrative and tape have not diverged enough to justify a stronger institutional read.',
    sentiment_score: divergence.sentiment_score,
    price_reality_score: divergence.price_reality_score,
    memory_context: context,
  }

  try {
    const raw = await callLLM({
      tier: 'smart',
      messages: buildMessages({
        ticker,
        layer1,
        layer2,
        divergence,
        context,
        preliminarySignal,
      }),
    })

    const parsed = extractJSON(raw)
    result = {
      ...result,
      signal: normalizeSignal(parsed.signal) || preliminarySignal,
      director_take: typeof parsed.director_take === 'string' && parsed.director_take.trim()
        ? parsed.director_take.trim()
        : result.director_take,
    }
  } catch (err) {
    console.error(`[Arbitrator] ${ticker} — LLM parse failed: ${err.message}`)
  }

  await writeCheckpoint(ticker, runId, result)
  console.log(`[Arbitrator] ${ticker} — done. Signal: ${result.signal} | Divergence: ${result.divergence_score}`)
  return result
}

export {
  calculateDivergenceScore,
  derivePriceRealityScore,
  deriveRuleBasedSignal,
}
