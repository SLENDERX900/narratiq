import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { runMLForecast } from '../lib/mlEngine.js'
import { getTrustScores } from '../lib/trustEngine.js'
import { getSessionContext, applyRules } from '../lib/marketSession.js'

const router = Router()

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function computeDivergenceValue(currentPrice, sentimentGap, atrMoveThresholdPct, storedGap) {
  const persistedGap = toFiniteNumber(storedGap)
  if (persistedGap != null) return persistedGap

  const price = toFiniteNumber(currentPrice)
  const gap = toFiniteNumber(sentimentGap)
  const atrPct = toFiniteNumber(atrMoveThresholdPct)
  if (price == null || gap == null) return 0

  const scalingPct = Math.max((atrPct ?? 1) / 100, 0.01)
  return Number((price * gap * scalingPct).toFixed(2))
}

function getDivergenceStatus(value) {
  const abs = Math.abs(Number(value) || 0)
  if (abs >= 2) return 'EXTREME'
  if (abs >= 1) return 'ELEVATED'
  if (abs >= 0.5) return 'MODERATE'
  return 'NORMAL'
}

function getInstitutionalSignal(activeRegime, sentimentGap, atrMoveProbability) {
  const gap = Number(sentimentGap || 0)
  const atrProb = Number(atrMoveProbability || 0)

  if (activeRegime === 'MACRO_SHOCK') return 'MACRO_RISK_OFF'
  if (gap <= -0.1) return 'DISTRIBUTION_DETECTED'
  if (gap >= 0.1) return 'ACCUMULATION_DETECTED'
  if (atrProb >= 0.5) return 'VOLATILITY_EXPANSION_WATCH'
  return 'BALANCED_FLOW'
}

function getInstitutionalTerm(institutionalSignal) {
  switch (institutionalSignal) {
    case 'DISTRIBUTION_DETECTED':
      return 'Distribution'
    case 'ACCUMULATION_DETECTED':
      return 'Accumulation'
    case 'MACRO_RISK_OFF':
      return 'Macro Risk-Off'
    case 'VOLATILITY_EXPANSION_WATCH':
      return 'Volatility Expansion'
    default:
      return 'Balanced Flow'
  }
}

function getSimpleAction({ institutionalSignal, activeRegime, divergenceStatus }) {
  if (institutionalSignal === 'DISTRIBUTION_DETECTED') return 'SELL / TAKE PROFITS'
  if (institutionalSignal === 'ACCUMULATION_DETECTED') return 'BUY / BUILD POSITION'
  if (institutionalSignal === 'MACRO_RISK_OFF') return 'REDUCE RISK / WAIT'
  if (institutionalSignal === 'VOLATILITY_EXPANSION_WATCH' || activeRegime === 'MACRO_SHOCK') return 'WATCH CLOSELY'
  if (divergenceStatus === 'EXTREME' || divergenceStatus === 'ELEVATED') return 'WAIT FOR CONFIRMATION'
  return 'HOLD / NO CLEAR EDGE'
}

function buildPlainEnglishReasoning({ institutionalSignal, activeRegime, sentimentScore, divergenceValue, expectedSigmaMove }) {
  const sentimentTone = Number(sentimentScore || 0) >= 0 ? 'optimistic' : 'negative'
  const gapDollars = Math.abs(Number(divergenceValue || 0)).toFixed(2)

  switch (institutionalSignal) {
    case 'DISTRIBUTION_DETECTED':
      return `The crowd mood looks ${sentimentTone}, but bigger players appear to be selling into the excitement. The $${gapDollars} gap suggests this strength may not hold.`
    case 'ACCUMULATION_DETECTED':
      return `Sentiment is still cautious, but the tape suggests larger buyers may be quietly stepping in. The $${gapDollars} gap hints the stock could catch up higher if that continues.`
    case 'MACRO_RISK_OFF':
      return `The overall market is stressed right now, so stock-specific stories matter less than usual. In this regime, protecting capital matters more than chasing a move.`
    case 'VOLATILITY_EXPANSION_WATCH':
      return expectedSigmaMove
        ? 'A bigger-than-normal move looks likely soon, but direction is less certain. This is more of a volatility setup than a clean buy or sell signal.'
        : 'Volatility is building, but the signal is not decisive yet. It may be better to wait for a clearer move before acting.'
    default:
      return 'The market signals are fairly balanced right now. There is no strong institutional edge yet, so patience may be the best move.'
  }
}

function buildDivergenceDescription({ sentimentScore, divergenceValue, rvol, activeRegime, institutionalSignal }) {
  const bias = Number(sentimentScore || 0) >= 0 ? 'bullish' : 'bearish'
  const gapText = Number(divergenceValue || 0) >= 0 ? 'price lagging sentiment' : 'price running ahead of sentiment'
  const rvolText = toFiniteNumber(rvol) != null ? `RVOL ${Number(rvol).toFixed(2)}` : 'RVOL unavailable'
  return `Sentiment is ${bias} (${Number(sentimentScore || 0).toFixed(2)}), ${gapText}, with ${rvolText} under ${activeRegime}. Signal: ${institutionalSignal}.`
}

function buildFrontendForecastPayload(ticker, currentPrice, stored, mlResult, latestHistoryRow) {
  const activeRegime = mlResult?.active_regime_key ?? 'NORMAL'
  const sentimentGap = mlResult?.current_features?.sentiment_gap ?? 0
  const atrMoveProbability = mlResult?.atr_move_probability ?? stored.beta_1 ?? null
  const atrMovePrediction = mlResult?.atr_move_prediction ?? null
  const atrMoveThresholdPct = mlResult?.atr_move_threshold_pct ?? stored.beta_2 ?? null
  const divergenceValue = computeDivergenceValue(
    currentPrice,
    sentimentGap,
    atrMoveThresholdPct,
    latestHistoryRow?.price_divergence ?? null,
  )
  const institutionalSignal = getInstitutionalSignal(activeRegime, sentimentGap, atrMoveProbability)
  const institutionalTerm = getInstitutionalTerm(institutionalSignal)
  const divergenceStatus = getDivergenceStatus(divergenceValue)
  const sigmaMove = currentPrice && atrMoveThresholdPct != null
    ? Number((currentPrice * (atrMoveThresholdPct / 100)).toFixed(2))
    : null
  const expectedSigmaMove = atrMovePrediction === 1 || Number(atrMoveProbability || 0) >= 0.5
  const simpleAction = getSimpleAction({ institutionalSignal, activeRegime, divergenceStatus })
  const plainEnglishReasoning = buildPlainEnglishReasoning({
    institutionalSignal,
    activeRegime,
    sentimentScore: latestHistoryRow?.sentiment_score ?? 0,
    divergenceValue,
    expectedSigmaMove,
  })

  return {
    ticker,
    current_price: currentPrice,
    evr_engine: {
      active_regime: activeRegime,
      simple_action: simpleAction,
      institutional_signal: institutionalSignal,
      institutional_term: institutionalTerm,
      plain_english_reasoning: plainEnglishReasoning,
      divergence_magnitude: {
        value: divergenceValue,
        status: divergenceStatus,
        description: buildDivergenceDescription({
          sentimentScore: latestHistoryRow?.sentiment_score ?? 0,
          divergenceValue,
          rvol: mlResult?.current_features?.rvol ?? null,
          activeRegime,
          institutionalSignal,
        }),
      },
      volatility_target: {
        expected_1_sigma_move: expectedSigmaMove,
        risk_band_upper: sigmaMove != null ? Number((currentPrice + sigmaMove).toFixed(2)) : null,
        risk_band_lower: sigmaMove != null ? Number((currentPrice - sigmaMove).toFixed(2)) : null,
      },
    },
    current_features: mlResult?.current_features ?? {},
    signal_weighting: mlResult?.signal_weighting ?? {},
    model_architecture: mlResult?.model_architecture ?? null,
    routing_reason: mlResult?.routing_reason ?? null,
    expert_models: mlResult?.expert_models ?? {},
    regime_breakdown: mlResult?.regime_breakdown ?? [],
    accuracy: mlResult?.accuracy ?? stored.accuracy_pct ?? null,
    rmse: mlResult?.rmse ?? stored.std_error ?? null,
    insufficient_data: mlResult?.insufficient_data ?? true,
  }
}

function mapPredictionSeries(series) {
  return (series || []).map((row) => ({
    time: row.time,
    actual: row.actual,
    predicted_probability: row.predicted_probability,
    predicted_label: row.predicted_label,
  }))
}

function mapHistory(historyRows) {
  return (historyRows || []).map((row) => ({
    ticker: row.ticker,
    price: row.price,
    change_pct: row.change_pct,
    sentiment_score: row.sentiment_score,
    generated_at: row.generated_at,
    divergence_magnitude: row.price_divergence ?? null,
  }))
}

function buildSessionPayload(sessCtx, flags, confidenceAdj) {
  const {
    timeToCloseMin,
    ...sessionWithoutTimeToClose
  } = sessCtx || {}
  return {
    ...sessionWithoutTimeToClose,
    active_rules: flags,
    confidence_adj: confidenceAdj,
  }
}

// GET /api/forecast/accuracy?tickers=AAPL,TSLA
router.get('/accuracy', async (req, res) => {
  const tickers = req.query.tickers?.split(',').map(t=>t.toUpperCase()).filter(Boolean)
  if (!tickers?.length) return res.json({})
  const results={}
  await Promise.all(tickers.map(async ticker=>{
    const {data}=await supabase.from('stock_forecasts')
      .select('predicted_change,actual_change,forecast_error,accuracy_pct,generated_at')
      .eq('ticker',ticker).order('generated_at',{ascending:true}).limit(48)
    results[ticker]=data||[]
  }))
  res.json(results)
})

// GET /api/forecast/trust?tickers=AAPL,TSLA
router.get('/trust', async (req, res) => {
  const tickers = req.query.tickers?.split(',').map(t=>t.toUpperCase()).filter(Boolean)
  if (!tickers?.length) return res.json({})
  const results={}
  await Promise.all(tickers.map(async ticker=>{results[ticker]=await getTrustScores(ticker)}))
  res.json(results)
})

// GET /api/forecast/session?ticker=AAPL
router.get('/session', async (req, res) => {
  const ticker = req.query.ticker?.toUpperCase() || 'AAPL'
  const ctx = getSessionContext(ticker)
  const {data:macro} = await supabase.from('macro_signals')
    .select('*').order('fetched_at',{ascending:false}).limit(1).single()
  const {flags, confidenceAdj} = applyRules(ctx, macro)
  res.json({ session: ctx, rules: flags, confidence_adj: confidenceAdj, macro })
})

// GET /api/forecast/:ticker
router.get('/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase()
  const [forecastRes, histRes, trustRes, macroRes] = await Promise.all([
    supabase.from('stock_forecasts').select('*').eq('ticker',ticker)
      .order('generated_at',{ascending:false}).limit(1).single(),
    supabase.from('stock_insights')
      .select('ticker,price,change_pct,sentiment_score,social,candles,forecast_price,implied_price,price_divergence,trust_score,macro_regime,generated_at')
      .eq('ticker',ticker).order('generated_at',{ascending:true}).limit(48),
    getTrustScores(ticker),
    supabase.from('macro_signals').select('*').order('fetched_at',{ascending:false}).limit(1).single(),
  ])

  const stored=forecastRes.data
  const history=histRes.data||[]
  const latestHistoryRow = history[history.length - 1] || null
  if (!stored) return res.status(404).json({error:'No forecast yet'})

  let mlResult=null
  if (history.length>=4) {
    mlResult=runMLForecast(history,history[history.length-1],macroRes.data,trustRes)
  }

  // Current session context
  const sessCtx=getSessionContext(ticker)
  const {flags,confidenceAdj}=applyRules(sessCtx,macroRes.data)
  const currentPrice = toFiniteNumber(latestHistoryRow?.price) ?? 0

  res.json({
    ...buildFrontendForecastPayload(ticker, currentPrice, stored, mlResult, latestHistoryRow),
    predictions:mapPredictionSeries(mlResult?.predictions),
    history:mapHistory(history),
    trust:trustRes,
    session:buildSessionPayload(sessCtx, flags, confidenceAdj),
    macro:macroRes.data,
  })
})

export default router
