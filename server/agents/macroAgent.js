/**
 * Macro Agent — fetches FRED economic signals
 *
 * Provides macro context for the ML model:
 *   - 10-year Treasury yield (risk-free rate)
 *   - Yield curve spread (10yr - 2yr): negative = inverted = risk-off
 *   - VIX: market fear gauge
 *   - Consumer sentiment: forward-looking demand signal
 *
 * These signals capture the "regime" the market is in:
 * sentiment means something very different in a VIX=40 environment vs VIX=14.
 * FRED is free, 120 req/min, data goes back decades.
 */
import axios from 'axios'
import { fredSeries } from '../config/apis.js'
import { supabase } from '../config/supabase.js'

const client = axios.create({ timeout: 10000 })

async function fetchFredSeries(seriesId) {
  const key = process.env.FRED_API_KEY
  if (!key || key === 'your-fred-key') return null
  const res = await client.get(
    `https://api.stlouisfed.org/fred/series/observations`,
    { params: { series_id: seriesId, api_key: key, file_type: 'json',
                sort_order: 'desc', limit: 1 } }
  )
  const obs = res.data?.observations?.[0]
  return obs?.value && obs.value !== '.' ? parseFloat(obs.value) : null
}

export async function runMacroAgent() {
  console.log('[MacroAgent] fetching FRED signals')
  const results = {}

  for (const [key, seriesId] of Object.entries(fredSeries)) {
    try {
      results[key] = await fetchFredSeries(seriesId)
    } catch (err) {
      console.warn(`[MacroAgent] ${seriesId} failed: ${err.message}`)
      results[key] = null
    }
  }

  // Determine macro regime
  const vix = results.vix
  const spread = results.yieldSpread
  let macro_regime = 'neutral'
  if (vix != null && spread != null) {
    if (vix > 25 || spread < 0) macro_regime = 'risk-off'
    else if (vix < 16 && spread > 0.5) macro_regime = 'risk-on'
  }

  // Store in macro_signals table (keep last 24 entries)
  try {
    await supabase.from('macro_signals').insert({
      treasury_10y:  results.treasury10y,
      yield_spread:  results.yieldSpread,
      vix:           results.vix,
      consumer_sent: results.consumerSent,
      fetched_at:    new Date().toISOString(),
    })
    // Prune old rows — keep last 48
    const { data: old } = await supabase
      .from('macro_signals').select('id').order('fetched_at', { ascending: false }).range(48, 999)
    if (old?.length) {
      await supabase.from('macro_signals').delete().in('id', old.map(r => r.id))
    }
  } catch (err) {
    console.warn(`[MacroAgent] Supabase write failed: ${err.message}`)
  }

  console.log(`[MacroAgent] done — VIX=${results.vix ?? 'n/a'} spread=${results.yieldSpread ?? 'n/a'} regime=${macro_regime}`)
  return { ...results, macro_regime }
}

export async function getLatestMacro() {
  const { data } = await supabase
    .from('macro_signals')
    .select('*')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single()
  return data ?? { treasury_10y: null, yield_spread: null, vix: null, consumer_sent: null, macro_regime: 'neutral' }
}
