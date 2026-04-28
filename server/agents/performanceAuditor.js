import 'dotenv/config'
import axios from 'axios'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { marketProviders } from '../config/apis.js'
import { callLLM } from '../config/llm.js'
import { supabase } from '../config/supabase.js'
import { extractJSON } from '../lib/llmJson.js'

const client = axios.create({ timeout: 10000 })
const AUDIT_DELAY_MS = 24 * 60 * 60 * 1000
const HIGH_ERROR_THRESHOLD = 5
const NEUTRAL_MOVE_THRESHOLD = 1.5

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, decimals = 4) {
  return Number(Number(value || 0).toFixed(decimals))
}

function getExpectedDirection(signal) {
  if (signal === 'Accumulation') return 1
  if (signal === 'Distribution') return -1
  return 0
}

function calculateActualChangePct(referenceClose, currentPrice) {
  const base = Number(referenceClose) || 0
  const latest = Number(currentPrice) || 0

  if (!base || !latest) return 0
  return ((latest - base) / base) * 100
}

function calculatePredictionError(signal, actualChangePct) {
  const expectedDirection = getExpectedDirection(signal)

  if (expectedDirection === 0) {
    return Math.abs(actualChangePct)
  }

  return expectedDirection * actualChangePct >= 0
    ? Math.max(0, Math.abs(actualChangePct) * 0.25)
    : Math.abs(actualChangePct)
}

function isPredictionCorrect(signal, actualChangePct) {
  if (signal === 'Accumulation') return actualChangePct > 0
  if (signal === 'Distribution') return actualChangePct < 0
  return Math.abs(actualChangePct) <= NEUTRAL_MOVE_THRESHOLD
}

async function fetchCurrentPrice(symbol) {
  const finnhub = marketProviders.find((provider) => provider.name === 'finnhub')

  if (!finnhub?.key) {
    throw new Error('Finnhub API key is missing')
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhub.key}`
  const res = await client.get(url)
  const currentPrice = Number(res.data?.c)

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error(`Invalid live price returned for ${symbol}`)
  }

  return currentPrice
}

function buildMetaRuleMessages({ symbol, signal, actualChangePct, predictionError, session }) {
  return [
    {
      role: 'system',
      content: [
        'You are an institutional post-trade reviewer.',
        'A prior EVR call was wrong or weak.',
        'Write ONE concise meta-rule the system should remember next time.',
        'Respond with ONLY valid JSON and no extra text.',
        'The JSON schema is exactly:',
        '{"title":"<short rule title>","meta_rule":"<one or two sentences>","summary":"<short takeaway>","importance_score":<number 0 to 1>}',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Review this failed or weak signal and produce a corrective meta-rule.

Ticker: ${symbol}
Signal: ${signal}
Actual 24h change pct: ${round(actualChangePct, 4)}
Prediction error: ${round(predictionError, 4)}
Divergence score at signal time: ${session.divergence_score ?? 'unknown'}
Narrative sentiment: ${session.narrative_sentiment ?? 'unknown'}
Price reality: ${session.price_reality ?? 'unknown'}
Arbitrator output: ${JSON.stringify(session.arbitrator_output || {})}
Quant auditor output: ${JSON.stringify(session.quant_auditor_output || {})}
Sentiment aggregator output: ${JSON.stringify(session.sentiment_aggregator_output || {})}

Respond with ONLY strict JSON:
{"title":"<short rule title>","meta_rule":"<one or two sentences>","summary":"<short takeaway>","importance_score":<number 0 to 1>}`,
    },
  ]
}

async function embedText(text) {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required to embed meta-rules')
  }

  const genai = new GoogleGenerativeAI(apiKey)
  const model = genai.getGenerativeModel({ model: 'text-embedding-004' })
  const result = await model.embedContent(text)
  const values = result?.embedding?.values

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Embedding provider returned no vector values')
  }

  return values
}

async function storeMetaRule({ session, metaRule }) {
  const content = metaRule.meta_rule.trim()
  const embedding = await embedText(content)

  const payload = {
    asset_id: session.asset_id,
    market_session_id: session.id,
    memory_type: 'meta_rule',
    title: metaRule.title.trim(),
    content,
    summary: metaRule.summary.trim(),
    embedding,
    importance_score: clamp(Number(metaRule.importance_score) || 0.5, 0, 1),
    source: 'performance_auditor',
    metadata: {
      session_date: session.session_date,
      signal: session.action || session.signal_label || session.arbitrator_output?.signal || null,
      divergence_score: session.divergence_score,
      actual_24h_change_pct: session.actual_24h_change_pct,
      prediction_correct: session.prediction_correct,
    },
  }

  const { error } = await supabase
    .from('memory_logs')
    .insert(payload)

  if (error) {
    throw new Error(`Failed to store meta-rule memory: ${error.message}`)
  }
}

async function generateMetaRule(session, signal, actualChangePct, predictionError) {
  const raw = await callLLM({
    tier: 'smart',
    messages: buildMetaRuleMessages({
      symbol: session.assets?.symbol || 'UNKNOWN',
      signal,
      actualChangePct,
      predictionError,
      session,
    }),
  })

  const parsed = extractJSON(raw)

  return {
    title: typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : 'Signal Failure Pattern',
    meta_rule: typeof parsed.meta_rule === 'string' && parsed.meta_rule.trim()
      ? parsed.meta_rule.trim()
      : 'When sentiment and tape diverge but follow-through fails, treat the setup as regime-sensitive and demand stronger confirmation.',
    summary: typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'Demand stronger confirmation before repeating this setup.',
    importance_score: clamp(Number(parsed.importance_score) || 0.5, 0, 1),
  }
}

async function updateSessionAudit(sessionId, fields) {
  const { error } = await supabase
    .from('market_sessions')
    .update(fields)
    .eq('id', sessionId)

  if (error) {
    throw new Error(`Failed to update market session ${sessionId}: ${error.message}`)
  }
}

export async function runPerformanceAuditorForSession(session) {
  const signal = session.action || session.signal_label || session.arbitrator_output?.signal || 'Neutral'
  const symbol = session.assets?.symbol
  const referenceClose = session.close_price

  if (!symbol) {
    throw new Error(`Session ${session.id} is missing asset symbol`)
  }

  if (!referenceClose) {
    throw new Error(`Session ${session.id} is missing close_price`)
  }

  const currentPrice = await fetchCurrentPrice(symbol)
  const actualChangePct = round(calculateActualChangePct(referenceClose, currentPrice), 4)
  const predictionError = round(calculatePredictionError(signal, actualChangePct), 4)
  const predictionCorrect = isPredictionCorrect(signal, actualChangePct)

  await updateSessionAudit(session.id, {
    actual_24h_change_pct: actualChangePct,
    prediction_correct: predictionCorrect,
    audited_at: new Date().toISOString(),
    metadata: {
      ...(session.metadata || {}),
      auditor_current_price: currentPrice,
      auditor_prediction_error: predictionError,
    },
  })

  let metaRule = null

  if (predictionError >= HIGH_ERROR_THRESHOLD) {
    metaRule = await generateMetaRule(session, signal, actualChangePct, predictionError)
    await storeMetaRule({
      session: {
        ...session,
        actual_24h_change_pct: actualChangePct,
        prediction_correct: predictionCorrect,
      },
      metaRule,
    })
  }

  return {
    session_id: session.id,
    symbol,
    signal,
    actual_24h_change_pct: actualChangePct,
    prediction_error: predictionError,
    prediction_correct: predictionCorrect,
    meta_rule_created: Boolean(metaRule),
    meta_rule: metaRule,
  }
}

export async function runPerformanceAuditor({ limit = 25 } = {}) {
  const cutoff = new Date(Date.now() - AUDIT_DELAY_MS).toISOString()

  const { data, error } = await supabase
    .from('market_sessions')
    .select(`
      id,
      asset_id,
      session_date,
      signal_label,
      action,
      divergence_score,
      narrative_sentiment,
      price_reality,
      quant_auditor_output,
      sentiment_aggregator_output,
      arbitrator_output,
      close_price,
      actual_24h_change_pct,
      prediction_correct,
      audited_at,
      metadata,
      created_at,
      assets!market_sessions_asset_id_fkey (
        id,
        symbol,
        name
      )
    `)
    .is('audited_at', null)
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch due sessions: ${error.message}`)
  }

  const sessions = Array.isArray(data) ? data : []
  const results = []

  for (const session of sessions) {
    try {
      const result = await runPerformanceAuditorForSession(session)
      results.push(result)
      console.log(`[PerformanceAuditor] ${result.symbol} — audited. Error: ${result.prediction_error} | Meta-rule: ${result.meta_rule_created}`)
    } catch (err) {
      console.error(`[PerformanceAuditor] session ${session.id} failed: ${err.message}`)
    }
  }

  return results
}

