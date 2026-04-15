import axios from 'axios'
import { newsProviders } from '../config/apis.js'
import { normalizeNews } from '../lib/dataNormalizer.js'
import { supabase } from '../config/supabase.js'

const client = axios.create({ timeout: 10000 })

async function fetchFinnhubNews(ticker) {
  const key = newsProviders[0].key
  const to = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const res = await client.get(
    `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${key}`
  )
  return normalizeNews('finnhub', res.data)
}

async function fetchAlpacaNews(ticker) {
  const { key, secret } = newsProviders[1]
  const res = await client.get(
    `https://data.alpaca.markets/v1beta1/news?symbols=${ticker}&limit=20`,
    { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret } }
  )
  return normalizeNews('alpaca', res.data)
}

async function fetchTwelveDataNews(ticker) {
  const key = newsProviders[2].key
  const res = await client.get(
    `https://api.twelvedata.com/news?symbol=${ticker}&outputsize=20&apikey=${key}`
  )
  return normalizeNews('twelvedata', res.data)
}

const ATTEMPTS = [fetchFinnhubNews, fetchAlpacaNews, fetchTwelveDataNews]

export async function runNewsAgent(ticker, runId) {
  console.log(`[NewsAgent] ${ticker} — starting`)

  let headlines = []
  for (const attempt of ATTEMPTS) {
    try {
      const result = await attempt(ticker)
      if (result.length > 0) {
        headlines = result
        break
      }
    } catch (err) {
      console.warn(`[NewsAgent] ${ticker} — provider failed: ${err.message}`)
    }
  }

  // Always write something — never null — so Step 4 can safely read
  await supabase.from('agent_run_log').upsert({
    run_id: runId,
    ticker,
    step_completed: 2,
    step_data: { headlines },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'run_id,ticker' })

  console.log(`[NewsAgent] ${ticker} — done. ${headlines.length} headlines`)
  return { headlines }
}
