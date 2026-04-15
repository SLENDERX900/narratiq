import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { runMLForecast } from '../lib/mlEngine.js'
import { getTrustScores } from '../lib/trustEngine.js'
import { getSessionContext, applyRules } from '../lib/marketSession.js'

const router = Router()

// GET /api/forecast/accuracy?tickers=AAPL,TSLA
router.get('/accuracy', async (req, res) => {
  const tickers = req.query.tickers?.split(',').map(t=>t.toUpperCase()).filter(Boolean)
  if (!tickers?.length) return res.json({})
  const results={}
  await Promise.all(tickers.map(async ticker=>{
    const {data}=await supabase.from('stock_forecasts')
      .select('predicted_change,actual_change,forecast_error,accuracy_pct,r_squared,generated_at')
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
      .select('price,change_pct,sentiment_score,social,forecast_price,implied_price,price_divergence,trust_score,macro_regime,generated_at')
      .eq('ticker',ticker).order('generated_at',{ascending:true}).limit(48),
    getTrustScores(ticker),
    supabase.from('macro_signals').select('*').order('fetched_at',{ascending:false}).limit(1).single(),
  ])

  const stored=forecastRes.data
  const history=histRes.data||[]
  if (!stored) return res.status(404).json({error:'No forecast yet'})

  let mlResult=null
  if (history.length>=4) {
    mlResult=runMLForecast(history,history[history.length-1],macroRes.data,trustRes)
  }

  // Current session context
  const sessCtx=getSessionContext(ticker)
  const {flags,confidenceAdj}=applyRules(sessCtx,macroRes.data)

  res.json({
    forecast:{
      ...stored,
      r2:mlResult?.r2??stored.r_squared,
      rmse:mlResult?.rmse??stored.std_error,
      n_observations:mlResult?.n_observations??stored.n_observations,
      feature_importance:mlResult?.feature_importance??[],
      train_errors:mlResult?.train_errors??[],
      current_features:mlResult?.current_features??{},
      implied_price:mlResult?.implied_price??null,
      price_divergence:mlResult?.price_divergence??null,
      conviction:mlResult?.conviction??null,
      divergence:mlResult?.divergence??null,
      wasContrarian:mlResult?.wasContrarian??false,
      insufficient_data:mlResult?.insufficient_data??true,
      active_rules:flags,
      confidence_adj:confidenceAdj,
    },
    predictions:mlResult?.predictions||[],
    history,
    trust:trustRes,
    session:sessCtx,
    macro:macroRes.data,
  })
})

export default router
