import { supabase } from '../config/supabase.js'
import { runMLForecast, deriveTargetObservation } from '../lib/mlEngine.js'
import { updateTrustScore, getTrustScores, getOverallTrust } from '../lib/trustEngine.js'
import { getLatestMacro } from './macroAgent.js'

const HISTORY_WINDOW = 168

export async function runForecastAgent(ticker, runId, currentInsight) {
  console.log(`[ForecastAgent] ${ticker} — ML training`)

  const [{ data: rows }, macro, trustScores] = await Promise.all([
    supabase.from('stock_insights').select('price, change_pct, sentiment_score, social, candles, forecast_price, generated_at')
      .eq('ticker', ticker).order('generated_at', { ascending: true }).limit(HISTORY_WINDOW),
    getLatestMacro(),
    getTrustScores(ticker),
  ])

  // Get previous forecast for accuracy
  const { data: prevForecasts } = await supabase.from('stock_forecasts')
    .select('predicted_change, generated_at').eq('ticker', ticker)
    .order('generated_at', { ascending: false }).limit(1)
  const prev = prevForecasts?.[0]

  // Run ML
  const result = runMLForecast(rows || [], currentInsight, macro, trustScores)

  // Compute classification accuracy & update trust scores
  let forecast_error = null, accuracy_pct = null
  const realizedTarget = rows?.length >= 3
    ? deriveTargetObservation(
        rows[rows.length - 3],
        rows[rows.length - 2],
        rows[rows.length - 1],
        macro,
        trustScores,
        rows.slice(Math.max(0, rows.length - 5), rows.length - 2),
      )
    : null
  const actualDivergenceLabel = realizedTarget?.divergenceLabel ?? null

  if (prev?.predicted_change != null && actualDivergenceLabel != null) {
    const predicted = parseFloat(prev.predicted_change)
    const actual = Number(actualDivergenceLabel)
    forecast_error = parseFloat((actual - predicted).toFixed(4))
    accuracy_pct = predicted >= 0.5
      ? (actual === 1 ? 100 : 0)
      : (actual === 0 ? 100 : 0)

    // Update trust scores per source
    const socialSource = currentInsight.social?.social_source || 'unknown'
    await updateTrustScore(ticker, 'news', actual, predicted)
    if (socialSource !== 'news-derived' && socialSource !== 'none') {
      await updateTrustScore(ticker, 'reddit', actual, predicted)
    }
    if (macro?.vix != null) {
      await updateTrustScore(ticker, 'macro', actual, predicted)
    }
  }

  const overallTrust = await getOverallTrust(ticker)

  // Store forecast
  await supabase.from('stock_forecasts').insert({
    ticker, run_id: runId,
    beta_0: result.divergence_probability ?? null,
    beta_1: result.atr_move_probability ?? null,
    beta_2: result.atr_move_threshold_pct ?? null,
    r_squared: null,
    std_error: result.rmse ?? null,
    n_observations: result.n_observations,
    current_sentiment: parseFloat(currentInsight.sentiment_score) || null,
    predicted_change: result.divergence_probability ?? null,
    lower_bound: result.divergence_ci_lower ?? null,
    upper_bound: result.divergence_ci_upper ?? null,
    forecast_price: null,
    previous_predicted_change: prev?.predicted_change ?? null,
    actual_change: actualDivergenceLabel,
    forecast_error, accuracy_pct,
    generated_at: new Date().toISOString(),
  })

  // Update stock_insights with trust + implied price
  const { data: latest } = await supabase.from('stock_insights')
    .select('id').eq('ticker', ticker).order('generated_at', { ascending: false }).limit(1).single()
  if (latest) {
    await supabase.from('stock_insights').update({
      forecast_price: null,
      forecast_error, trust_score: overallTrust,
      implied_price: result.implied_price,
      price_divergence: result.price_divergence,
      macro_regime: macro?.macro_regime || 'neutral',
    }).eq('id', latest.id)
  }

  const divergenceStr = result.divergence_probability != null ? `${(result.divergence_probability * 100).toFixed(1)}%` : 'n/a'
  const atrMoveStr = result.atr_move_probability != null ? `${(result.atr_move_probability * 100).toFixed(1)}%` : 'n/a'
  console.log(`[ForecastAgent] ${ticker} — div=${divergenceStr} atr=${atrMoveStr} trust=${overallTrust ?? 'n/a'}`)
  return { ...result, forecast_error, accuracy_pct, trustScores, overallTrust }
}
