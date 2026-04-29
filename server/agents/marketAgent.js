import { marketProviders, marketHours } from '../config/apis.js'
import { createRobustClient } from '../lib/healthMonitor.js'
import { normalizePrice } from '../lib/dataNormalizer.js'
import { supabase } from '../config/supabase.js'

const OHLCV_WINDOW_HOURS = 24

function isMarketOpen() {
  const h = new Date().getUTCHours()
  const { open, close } = marketHours.NYSE
  return h >= open && h < close
}

async function fetchFinnhub(client, ticker, key) {
  const now = Math.floor(Date.now() / 1000)
  const from = now - 3600 * OHLCV_WINDOW_HOURS
  const [quote, candles] = await Promise.all([
    client.get(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`),
    client.get(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=60&from=${from}&to=${now}&token=${key}`),
  ])
  // Keep quote and candles separate — both have key "c" with different types
  // quote.c = current price (float), candles.c = array of closes
  return normalizePrice('finnhub', { quote: quote.data, candles: candles.data })
}

async function fetchTwelveData(client, ticker, key) {
  const res = await client.get(
    `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1h&outputsize=${OHLCV_WINDOW_HOURS}&apikey=${key}`
  )
  const latest = res.data.values?.[0] || {}
  return normalizePrice('twelvedata', { ...latest, values: res.data.values, percent_change: latest.close && res.data.values?.[1]?.close
    ? (((parseFloat(latest.close) - parseFloat(res.data.values[1].close)) / parseFloat(res.data.values[1].close)) * 100).toFixed(2)
    : 0
  })
}

export async function runMarketAgent(ticker, runId) {
  console.log(`[MarketAgent] ${ticker} — starting`)

  // If market is closed, reuse last known data
  if (!isMarketOpen()) {
    const { data } = await supabase
      .from('stock_insights')
      .select('price, change_pct, candles')
      .eq('ticker', ticker)
      .order('generated_at', { ascending: false })
      .limit(1)
    if (data?.[0]) {
      console.log(`[MarketAgent] ${ticker} — market closed, reusing cached price`)
      await writeCheckpoint(ticker, runId, data[0])
      return data[0]
    }
  }

  const { client } = createRobustClient(marketProviders)

  let result
  try {
    result = await fetchFinnhub(client, ticker, marketProviders[0].key)
  } catch {
    result = await fetchTwelveData(client, ticker, marketProviders[1].key)
  }

  await writeCheckpoint(ticker, runId, result)
  console.log(`[MarketAgent] ${ticker} — done. Price: ${result.price}`)
  return result
}

async function writeCheckpoint(ticker, runId, data) {
  await supabase.from('agent_run_log').upsert({
    run_id: runId,
    ticker,
    step_completed: 1,
    step_data: data,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'run_id,ticker' })
}
