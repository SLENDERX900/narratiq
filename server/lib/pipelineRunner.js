import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../config/supabase.js'
import { runMarketAgent }       from '../agents/marketAgent.js'
import { runNewsAgent }         from '../agents/newsAgent.js'
import { runSocialAgent }       from '../agents/socialAgent.js'
import { runSentimentAgent }    from '../agents/sentimentAgent.js'
import { runOrchestratorAgent } from '../agents/orchestratorAgent.js'
import { runForecastAgent }     from '../agents/forecastAgent.js'
import { runMacroAgent }        from '../agents/macroAgent.js'
import { getSessionContext, applyRules } from './marketSession.js'

async function runTickerPipeline(ticker, runId, macro) {
  console.log(`\n[Pipeline] ▶ ${ticker} (run: ${runId.slice(0,8)})`)

  // Check session rules before running
  const sessCtx = getSessionContext(ticker)
  const { shouldForecast, flags } = applyRules(sessCtx, macro)

  if (flags.length > 0) {
    const flagLabels = flags.map(f => f.label).join(' | ')
    console.log(`[Pipeline] ${ticker} — active rules: ${flagLabels}`)
  }

  // Always collect data. Only skip ML forecast if rules block it.
  // Market data and news collection still runs even when closed
  // (to capture post-market moves and overnight news).
  try {
    const market        = await runMarketAgent(ticker, runId)
    const {headlines}   = await runNewsAgent(ticker, runId)
    const social        = await runSocialAgent(ticker, runId)
    const sentiment     = await runSentimentAgent(ticker, runId, headlines)
    const fullState     = { ...market, headlines, social, ...sentiment }
    await runOrchestratorAgent(ticker, runId, fullState)

    // Append session context to the latest insight
    const {data: latest} = await supabase.from('stock_insights')
      .select('*').eq('ticker', ticker).order('generated_at', {ascending: false}).limit(1).single()

    if (latest) {
      // Write session label and active rules to insight
      await supabase.from('stock_insights').update({
        macro_regime: macro?.macro_regime || sessCtx.sessionLabel || 'neutral',
      }).eq('id', latest.id)

      // Run ML forecast (with session-aware features)
      await runForecastAgent(ticker, runId, {
        ...latest,
        _session: sessCtx,
        _rules: flags,
        _shouldForecast: shouldForecast,
      })
    }

    console.log(`[Pipeline] ✓ ${ticker} — session: ${sessCtx.sessionLabel} (${sessCtx.currentMYT})`)
  } catch (err) {
    console.error(`[Pipeline] ✗ ${ticker} failed: ${err.message}`)
    await supabase.from('agent_run_log').upsert({
      run_id: runId, ticker, step_completed: 0, error: true,
      step_data: { error: err.message }, updated_at: new Date().toISOString(),
    }, { onConflict: 'run_id,ticker' })
  }
}

export async function runPipeline() {
  console.log(`\n[Pipeline] === Hourly run ${new Date().toISOString()} ===`)
  const runId = uuidv4()

  // Macro first (shared across all tickers)
  let macro = null
  try {
    macro = await runMacroAgent()
    console.log(`[Pipeline] Macro: VIX=${macro.vix??'n/a'} spread=${macro.yieldSpread??'n/a'} regime=${macro.macro_regime}`)
  } catch (e) { console.warn('[Pipeline] Macro fetch failed:', e.message) }

  const {data: watchlist, error} = await supabase.from('user_watchlist').select('ticker')
  if (error || !watchlist?.length) { console.log('[Pipeline] No tickers, skipping'); return }

  const tickers = [...new Set(watchlist.map(r => r.ticker.toUpperCase()))]
  console.log(`[Pipeline] ${tickers.length} tickers: ${tickers.join(', ')}`)

  await Promise.allSettled(tickers.map(t => runTickerPipeline(t, runId, macro)))
  console.log(`[Pipeline] === Run complete ===\n`)
}

export async function catchUpIfMissed() {
  const {data} = await supabase.from('agent_run_log')
    .select('updated_at').order('updated_at', {ascending: false}).limit(1)
  const last = data?.[0]?.updated_at ? new Date(data[0].updated_at) : null
  const mins = last ? (Date.now() - last.getTime()) / 60000 : 999
  if (mins > 55) {
    console.log(`[Pipeline] Catch-up: last run ${Math.round(mins)}m ago`)
    await runPipeline()
  } else {
    console.log(`[Pipeline] Last run ${Math.round(mins)}m ago — no catch-up needed`)
  }
}
