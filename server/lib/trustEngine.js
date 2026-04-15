/**
 * Trust Engine — Adaptive Sentiment Reliability Scoring
 *
 * This is the AMIE "adaptive learning" layer.
 *
 * For each ticker × source, it tracks:
 *   - How often this source's sentiment correctly predicted price direction
 *   - The average magnitude of prediction error when using this source
 *   - A reliability score (0–100) updated each run
 *   - A dynamic weight used when blending multiple sources in the ML model
 *
 * Over time the system learns:
 *   - "News sentiment is 78% reliable for AAPL"
 *   - "Reddit WSB is only 31% reliable for large-caps"
 *   - "Macro regime signals are 85% reliable during risk-off periods"
 *
 * Sources tracked: news, reddit, macro, tiingo_historical
 */
import { supabase } from '../config/supabase.js'

const DECAY = 0.85      // exponential decay for older predictions
const MIN_OBS = 3       // minimum observations before scoring is meaningful

export async function updateTrustScore(ticker, source, actualChange, predictedChange) {
  if (predictedChange == null || actualChange == null) return

  const error = Math.abs(actualChange - predictedChange)
  const absActual = Math.abs(actualChange)

  // Direction accuracy: did we get the sign right?
  const directionCorrect = (actualChange >= 0) === (predictedChange >= 0) ? 1 : 0

  // Magnitude accuracy: 1 - normalised absolute error
  const magAccuracy = absActual > 0.01
    ? Math.max(0, 1 - error / absActual)
    : Math.max(0, 1 - error * 10)  // when actual ~0, small error is good

  // Combined reliability score 0..100
  const newScore = (directionCorrect * 0.6 + magAccuracy * 0.4) * 100

  // Read existing record
  const { data: existing } = await supabase
    .from('source_reliability')
    .select('*')
    .eq('ticker', ticker)
    .eq('source', source)
    .single()

  if (existing) {
    // Exponentially weighted update
    const n = existing.n_predictions + 1
    const updatedReliability = existing.reliability * DECAY + newScore * (1 - DECAY)
    const updatedAvgError = existing.avg_error * DECAY + error * (1 - DECAY)
    const weight = computeWeight(updatedReliability, n)

    await supabase.from('source_reliability').update({
      n_predictions: n,
      avg_error: parseFloat(updatedAvgError.toFixed(4)),
      reliability: parseFloat(updatedReliability.toFixed(1)),
      weight: parseFloat(weight.toFixed(3)),
      updated_at: new Date().toISOString(),
    }).eq('ticker', ticker).eq('source', source)
  } else {
    // First observation
    const weight = computeWeight(newScore, 1)
    await supabase.from('source_reliability').insert({
      ticker, source,
      window_start: new Date().toISOString(),
      n_predictions: 1,
      avg_error: parseFloat(error.toFixed(4)),
      reliability: parseFloat(newScore.toFixed(1)),
      weight: parseFloat(weight.toFixed(3)),
    })
  }
}

function computeWeight(reliability, n) {
  // Weight scales with reliability, discounted by uncertainty when n is small
  const confidenceDiscount = Math.min(1, n / MIN_OBS)
  return (reliability / 100) * confidenceDiscount
}

export async function getTrustScores(ticker) {
  const { data } = await supabase
    .from('source_reliability')
    .select('*')
    .eq('ticker', ticker)

  const scores = {}
  for (const row of (data || [])) {
    scores[row.source] = {
      reliability: row.reliability,
      weight: row.weight,
      n: row.n_predictions,
      avg_error: row.avg_error,
    }
  }
  return scores
}

export async function getOverallTrust(ticker) {
  const scores = await getTrustScores(ticker)
  const entries = Object.values(scores)
  if (entries.length === 0) return null

  const validEntries = entries.filter(e => e.n >= MIN_OBS)
  if (validEntries.length === 0) return null

  const avg = validEntries.reduce((s, e) => s + e.reliability, 0) / validEntries.length
  return parseFloat(avg.toFixed(1))
}

/**
 * Build a human-readable trustworthiness summary for the UI.
 * Returns { overall, sources: { news, reddit, macro }, description }
 */
export function formatTrustSummary(scores, socialSource) {
  const sourceMap = {
    'news-derived': 'news',
    'marketaux':    'news',
    'finnhub':      'reddit',
    'quiver_wsb':   'reddit',
    'stocktwits':   'reddit',
  }

  const news   = scores['news']   ?? scores['news-derived'] ?? null
  const reddit = scores['reddit'] ?? scores['quiver_wsb']   ?? null
  const macro  = scores['macro']  ?? null

  const allScores = [news?.reliability, reddit?.reliability, macro?.reliability]
    .filter(v => v != null)

  const overall = allScores.length > 0
    ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
    : null

  return {
    overall,
    sources: { news: news?.reliability ?? null, reddit: reddit?.reliability ?? null, macro: macro?.reliability ?? null },
    weights: { news: news?.weight ?? null,       reddit: reddit?.weight ?? null,       macro: macro?.weight ?? null },
  }
}
