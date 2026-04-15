import { supabase } from '../config/supabase.js'
import { runMLForecast } from '../lib/mlEngine.js'
import { updateTrustScore, getTrustScores, getOverallTrust } from '../lib/trustEngine.js'
import { getLatestMacro } from './macroAgent.js'

const HISTORY_WINDOW = 168

export async function runForecastAgent(ticker, runId, currentInsight) {
  console.log(`[ForecastAgent] ${ticker} — ML training`)

  const [{ data: rows }, macro] = await Promise.all([
    supabase.from('stock_insights').select('price, change_pct, sentiment_score, social, forecast_price, generated_at')
      .eq('ticker', ticker).order('generated_at', { ascending: true }).limit(HISTORY_WINDOW),
    getLatestMacro(),
  ])

  // Get previous forecast for accuracy
  const { data: prevForecasts } = await supabase.from('stock_forecasts')
    .select('predicted_change, generated_at').eq('ticker', ticker)
    .order('generated_at', { ascending: false }).limit(1)
  const prev = prevForecasts?.[0]

  // Run ML
  const result = runMLForecast(rows || [], currentInsight, macro)

  // Compute accuracy & update trust scores
  let forecast_error = null, accuracy_pct = null
  if (prev?.predicted_change != null && currentInsight.change_pct != null) {
    const actual = parseFloat(currentInsight.change_pct)
    const predicted = parseFloat(prev.predicted_change)
    forecast_error = parseFloat((actual - predicted).toFixed(4))
    const absActual = Math.abs(actual)
    accuracy_pct = absActual > 0.01
      ? parseFloat(Math.min(100, Math.max(0, (1-Math.abs(forecast_error)/absActual)*100)).toFixed(1))
      : parseFloat(Math.min(100, 100-Math.abs(forecast_error)*20).toFixed(1))

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

  // Get overall trust score
  const trustScores = await getTrustScores(ticker)
  const overallTrust = await getOverallTrust(ticker)

  // Store forecast
  await supabase.from('stock_forecasts').insert({
    ticker, run_id: runId,
    beta_0: result.predicted_change ?? null,
    beta_1: result.r2 ?? null,
    beta_2: result.rmse ?? null,
    r_squared: result.r2 ?? null,
    std_error: result.rmse ?? null,
    n_observations: result.n_observations,
    current_sentiment: parseFloat(currentInsight.sentiment_score) || null,
    predicted_change: result.predicted_change ?? null,
    lower_bound: result.lower_bound ?? null,
    upper_bound: result.upper_bound ?? null,
    forecast_price: result.forecast_price ?? null,
    previous_predicted_change: prev?.predicted_change ?? null,
    actual_change: parseFloat(currentInsight.change_pct) || null,
    forecast_error, accuracy_pct,
    generated_at: new Date().toISOString(),
  })

  // Update stock_insights with trust + implied price
  const { data: latest } = await supabase.from('stock_insights')
    .select('id').eq('ticker', ticker).order('generated_at', { ascending: false }).limit(1).single()
  if (latest) {
    await supabase.from('stock_insights').update({
      forecast_price: result.forecast_price,
      forecast_error, trust_score: overallTrust,
      implied_price: result.implied_price,
      price_divergence: result.price_divergence,
      macro_regime: macro?.macro_regime || 'neutral',
    }).eq('id', latest.id)
  }

  const r2Str = result.r2 != null ? result.r2.toFixed(3) : 'n/a'
  console.log(`[ForecastAgent] ${ticker} — R²=${r2Str} trust=${overallTrust ?? 'n/a'} pred=${result.predicted_change ?? 'n/a'}%`)
  return { ...result, forecast_error, accuracy_pct, trustScores, overallTrust }
}
