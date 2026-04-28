import axios from 'axios'
import { newsProviders } from '../config/apis.js'
import { callLLM } from '../config/llm.js'
import { extractJSON } from '../lib/llmJson.js'
import { supabase } from '../config/supabase.js'

const client = axios.create({ timeout: 10000 })

const FALLBACK_RESULT = {
  sentiment_score: 0,
  main_hype_driver: 'No strong narrative detected from available news and social data.',
  headlines: [],
  social: {
    social_source: 'stocktwits',
    message_count: 0,
    bullish_ratio: 0,
    bearish_ratio: 0,
    watchlist_count: 0,
  },
  raw_data: {
    finnhub_news: [],
    stocktwits_messages: [],
  },
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function compactHeadline(item) {
  return {
    headline: item?.headline || '',
    summary: item?.summary || '',
    source: item?.source || '',
    datetime: item?.datetime || null,
    url: item?.url || '',
  }
}

function compactStocktwitsMessage(message) {
  const sentiment = message?.entities?.sentiment?.basic || null

  return {
    id: message?.id || null,
    created_at: message?.created_at || null,
    body: message?.body || '',
    likes: message?.likes?.total || 0,
    sentiment,
    user: message?.user?.username || null,
  }
}

async function fetchFinnhubNews(ticker) {
  const key = newsProviders.find((provider) => provider.name === 'finnhub')?.key
  if (!key) return []

  const to = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${key}`
  const res = await client.get(url)

  return Array.isArray(res.data) ? res.data.slice(0, 20).map(compactHeadline) : []
}

async function fetchStocktwitsStream(ticker) {
  const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`
  const res = await client.get(url)
  const messages = Array.isArray(res.data?.messages) ? res.data.messages : []
  const compactMessages = messages.slice(0, 20).map(compactStocktwitsMessage)

  const bullishCount = compactMessages.filter((message) => message.sentiment === 'Bullish').length
  const bearishCount = compactMessages.filter((message) => message.sentiment === 'Bearish').length
  const labeledCount = bullishCount + bearishCount

  return {
    messages: compactMessages,
    summary: {
      social_source: 'stocktwits',
      message_count: compactMessages.length,
      bullish_ratio: labeledCount ? bullishCount / labeledCount : 0,
      bearish_ratio: labeledCount ? bearishCount / labeledCount : 0,
      watchlist_count: Number(res.data?.symbol?.watchlist_count) || 0,
    },
  }
}

function buildMessages(ticker, finnhubNews, stocktwitsPayload) {
  return [
    {
      role: 'system',
      content: [
        'You are the Sentiment Aggregator in an institutional EVR trading pipeline.',
        'Your job is to read raw news and raw social feed data, then estimate crowd expectation.',
        'Respond with ONLY one valid JSON object.',
        'Do not include markdown, prose, code fences, or extra keys.',
        'The JSON schema is exactly:',
        '{"sentiment_score":<number from -10 to 10>,"main_hype_driver":"<string>"}',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Analyze crowd expectation for ${ticker} using the raw datasets below.

Return ONLY strict JSON in this exact shape:
{"sentiment_score":<number from -10 to 10>,"main_hype_driver":"<string>"}

Scoring guidance:
- Positive scores mean bullish crowd expectation.
- Negative scores mean bearish crowd expectation.
- Use 0 only when the signal is genuinely mixed or weak.
- "main_hype_driver" should be one concise sentence describing the dominant narrative.

RAW_FINNHUB_NEWS=${JSON.stringify(finnhubNews)}
RAW_STOCKTWITS=${JSON.stringify(stocktwitsPayload)}`,
    },
  ]
}

async function writeCheckpoint(ticker, runId, data) {
  if (!runId) return

  await supabase.from('agent_run_log').upsert({
    run_id: runId,
    ticker,
    step_completed: 2,
    step_data: data,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'run_id,ticker' })
}

export async function runSentimentAggregator(ticker, runId) {
  console.log(`[SentimentAggregator] ${ticker} — starting`)

  let finnhubNews = []
  let stocktwitsPayload = { messages: [], summary: { ...FALLBACK_RESULT.social } }

  try {
    finnhubNews = await fetchFinnhubNews(ticker)
  } catch (err) {
    console.warn(`[SentimentAggregator] ${ticker} — Finnhub failed: ${err.message}`)
  }

  try {
    stocktwitsPayload = await fetchStocktwitsStream(ticker)
  } catch (err) {
    console.warn(`[SentimentAggregator] ${ticker} — StockTwits failed: ${err.message}`)
  }

  let llmResult = {
    sentiment_score: FALLBACK_RESULT.sentiment_score,
    main_hype_driver: FALLBACK_RESULT.main_hype_driver,
  }

  if (finnhubNews.length > 0 || stocktwitsPayload.messages.length > 0) {
    try {
      const raw = await callLLM({
        tier: 'fast',
        messages: buildMessages(ticker, finnhubNews, stocktwitsPayload),
      })

      const parsed = extractJSON(raw)
      llmResult = {
        sentiment_score: clamp(Number(parsed.sentiment_score) || 0, -10, 10),
        main_hype_driver: typeof parsed.main_hype_driver === 'string' && parsed.main_hype_driver.trim()
          ? parsed.main_hype_driver.trim()
          : FALLBACK_RESULT.main_hype_driver,
      }
    } catch (err) {
      console.error(`[SentimentAggregator] ${ticker} — LLM parse failed: ${err.message}`)
    }
  }

  const result = {
    sentiment_score: llmResult.sentiment_score,
    main_hype_driver: llmResult.main_hype_driver,
    headlines: finnhubNews,
    social: stocktwitsPayload.summary,
    raw_data: {
      finnhub_news: finnhubNews,
      stocktwits_messages: stocktwitsPayload.messages,
    },
  }

  await writeCheckpoint(ticker, runId, result)
  console.log(`[SentimentAggregator] ${ticker} — done. Score: ${result.sentiment_score}`)
  return result
}

