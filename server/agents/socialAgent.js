import axios from 'axios'
import { socialProviders } from '../config/apis.js'
import { normalizeSocial, deriveNewsBasedSocial, NEUTRAL_SOCIAL } from '../lib/dataNormalizer.js'
import { supabase } from '../config/supabase.js'

const client = axios.create({ timeout: 10000 })

// Marketaux: sentiment from news with entity-level scoring — free 100 req/day
async function fetchMarketaux(ticker) {
  const key = socialProviders[0].key
  if (!key || key === 'your-marketaux-key') return null
  const res = await client.get(
    `https://api.marketaux.com/v1/news/all?symbols=${ticker}&filter_entities=true&language=en&limit=10&api_token=${key}`
  )
  return normalizeSocial('marketaux', res.data)
}

// ApeWisdom: Reddit WSB + r/stocks mentions & sentiment — fully free, no key
// Endpoint returns trending stocks; we filter for our ticker
async function fetchApeWisdom(ticker) {
  // ApeWisdom /filter/all/for/{ticker} returns mentions from multiple subreddits
  const res = await client.get(
    `https://apewisdom.io/api/v1.0/filter/all/for/${ticker}`
  )
  // Attach the ticker so the normalizer can find the right row
  const data = res.data
  data._ticker = ticker
  return normalizeSocial('apewisdom', data)
}

// Stocksera: WSB + Stocktwits trending — free public API, no key
async function fetchStocksera(ticker) {
  const res = await client.get(
    `https://stocksera.netlify.app/api/reddit/wsb/?ticker=${ticker}&days=1`
  )
  return normalizeSocial('stocksera', res.data)
}

async function deriveFromNews(ticker, runId) {
  const { data } = await supabase
    .from('agent_run_log')
    .select('step_data, step_completed')
    .eq('run_id', runId)
    .eq('ticker', ticker)
    .in('step_completed', [2, 4])
  const newsRow      = data?.find(r => r.step_completed === 2)
  const sentimentRow = data?.find(r => r.step_completed === 4)
  const headlines    = newsRow?.step_data?.headlines || []
  const aiScore      = sentimentRow?.step_data?.ai_score ?? null
  return deriveNewsBasedSocial(headlines, aiScore)
}

async function getStaleCache(ticker) {
  const { data } = await supabase
    .from('agent_run_log')
    .select('step_data')
    .eq('ticker', ticker)
    .eq('step_completed', 3)
    .neq('step_data->>social_source', 'none')
    .order('updated_at', { ascending: false })
    .limit(1)
  return data?.[0]?.step_data ?? null
}

export async function runSocialAgent(ticker, runId) {
  console.log(`[SocialAgent] ${ticker} — starting`)
  let social = null

  // 1. Marketaux (free 100 req/day, best quality)
  try {
    const r = await fetchMarketaux(ticker)
    if (r) { social = r; console.log(`[SocialAgent] ${ticker} — marketaux`) }
  } catch (err) { console.warn(`[SocialAgent] ${ticker} — marketaux: ${err.message}`) }

  // 2. ApeWisdom (fully free, Reddit WSB + r/stocks)
  if (!social) {
    try {
      const r = await fetchApeWisdom(ticker)
      if (r) { social = r; console.log(`[SocialAgent] ${ticker} — apewisdom`) }
    } catch (err) { console.warn(`[SocialAgent] ${ticker} — apewisdom: ${err.message}`) }
  }

  // 3. Stocksera (fully free, WSB + Stocktwits)
  if (!social) {
    try {
      const r = await fetchStocksera(ticker)
      if (r) { social = r; console.log(`[SocialAgent] ${ticker} — stocksera`) }
    } catch (err) { console.warn(`[SocialAgent] ${ticker} — stocksera: ${err.message}`) }
  }

  // 4. Derive from news headlines + AI score already in this run
  if (!social) {
    try {
      const r = await deriveFromNews(ticker, runId)
      if (r) { social = r; console.log(`[SocialAgent] ${ticker} — news-derived`) }
    } catch (err) { console.warn(`[SocialAgent] ${ticker} — news derive: ${err.message}`) }
  }

  // 5. Stale cache from previous run
  if (!social) social = await getStaleCache(ticker)

  // 6. Neutral placeholder
  if (!social) { social = NEUTRAL_SOCIAL; console.warn(`[SocialAgent] ${ticker} — neutral fallback`) }

  await supabase.from('agent_run_log').upsert({
    run_id: runId, ticker, step_completed: 3,
    step_data: social, updated_at: new Date().toISOString(),
  }, { onConflict: 'run_id,ticker' })

  console.log(`[SocialAgent] ${ticker} — done. Source: ${social.social_source}`)
  return social
}
