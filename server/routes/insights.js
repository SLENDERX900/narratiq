import { Router } from 'express'
import { supabase } from '../config/supabase.js'

const router = Router()

// IMPORTANT: /history must be defined BEFORE /:ticker
// Express matches routes in order — if /:ticker is first, "history" gets
// captured as a ticker name and this route never fires.

// GET /api/insights/history?tickers=AAPL,TSLA&limit=48
router.get('/history', async (req, res) => {
  const tickers = req.query.tickers?.split(',').map(t => t.toUpperCase()).filter(Boolean)
  const limit   = Math.min(parseInt(req.query.limit) || 48, 168)
  if (!tickers?.length) return res.json({})

  const results = {}
  await Promise.all(
    tickers.map(async ticker => {
      const { data } = await supabase
        .from('stock_insights')
        .select('ticker, price, change_pct, sentiment_score, sentiment_cat, confidence_score, social, forecast_price, generated_at')
        .eq('ticker', ticker)
        .order('generated_at', { ascending: true })  // oldest first for charts
        .limit(limit)
      results[ticker] = data || []
    })
  )
  res.json(results)
})

// GET /api/insights?tickers=AAPL,TSLA — latest for multiple tickers
router.get('/', async (req, res) => {
  const tickers = req.query.tickers?.split(',').map(t => t.toUpperCase()).filter(Boolean)
  if (!tickers?.length) return res.json([])

  const results = await Promise.all(
    tickers.map(async ticker => {
      const { data } = await supabase
        .from('stock_insights')
        .select('*')
        .eq('ticker', ticker)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()
      return data || null
    })
  )
  res.json(results.filter(Boolean))
})

// GET /api/insights/:ticker — latest for single ticker
router.get('/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase()
  const { data, error } = await supabase
    .from('stock_insights')
    .select('*')
    .eq('ticker', ticker)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return res.status(404).json({ error: 'No data yet for this ticker' })
  res.json(data)
})

export default router
