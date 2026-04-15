// Normalizes all provider responses into canonical shapes
// before anything is written to Supabase

export function normalizePrice(source, raw) {
  const normalizers = {
    finnhub: () => ({
      price: raw.quote?.c ?? null,
      change_pct: raw.quote?.dp ?? null,
      candles: (raw.candles?.t || []).map((t, i) => ({
        t,
        o: raw.candles.o?.[i],
        h: raw.candles.h?.[i],
        l: raw.candles.l?.[i],
        c: raw.candles.c?.[i],
        v: raw.candles.v?.[i],
      })),
    }),
    twelvedata: () => ({
      price: parseFloat(raw.close) || null,
      change_pct: parseFloat(raw.percent_change) || null,
      candles: (raw.values || []).map(v => ({
        t: new Date(v.datetime).getTime() / 1000,
        o: parseFloat(v.open), h: parseFloat(v.high),
        l: parseFloat(v.low),  c: parseFloat(v.close),
        v: parseFloat(v.volume),
      })),
    }),
  }
  return (normalizers[source] ?? normalizers.finnhub)()
}

export function normalizeNews(source, raw) {
  const normalizers = {
    finnhub: () => (Array.isArray(raw) ? raw : []).slice(0, 20).map(n => ({
      title: n.headline,
      url: n.url,
      summary: n.summary,
      source: n.source,
      published_at: n.datetime,
    })),
    alpaca: () => ((raw.news) || []).slice(0, 20).map(n => ({
      title: n.headline,
      url: n.url,
      summary: n.summary,
      source: n.author,
      published_at: new Date(n.created_at).getTime() / 1000,
    })),
    twelvedata: () => ((raw.data) || []).slice(0, 20).map(n => ({
      title: n.title,
      url: n.url,
      summary: n.snippet || '',
      source: n.source,
      published_at: new Date(n.published_at).getTime() / 1000,
    })),
  }
  return (normalizers[source] ?? normalizers.finnhub)()
}

export function normalizeSocial(source, raw) {
  const normalizers = {
    // Marketaux: articles have entities[] with sentiment_score per ticker
    marketaux: () => {
      const articles = raw.data || []
      if (articles.length === 0) return null

      let totalScore = 0
      let scoredCount = 0

      for (const article of articles) {
        for (const entity of (article.entities || [])) {
          const score = parseFloat(entity.sentiment_score)
          if (!isNaN(score)) {
            totalScore += score
            scoredCount++
          }
        }
      }

      if (scoredCount === 0) return null

      const avgScore = totalScore / scoredCount
      // avgScore is -1..1 — convert to bullish/bearish pct
      const bullishPct = Math.round(((avgScore + 1) / 2) * 100)
      return {
        bullish_pct: Math.max(5, Math.min(95, bullishPct)),
        bearish_pct: Math.max(5, Math.min(95, 100 - bullishPct)),
        buzz_score: Math.min(100, articles.length * 5),
        social_source: 'marketaux',
        is_neutral_fallback: false,
      }
    },
    // ApeWisdom: returns { results: [{ ticker, mentions, upvotes, rank, sentiment }] }
    // Fully free, no key required
    apewisdom: () => {
      const results = raw.results || []
      const match = results.find(r => r.ticker?.toUpperCase() === (raw._ticker || ''))
        || results[0]
      if (!match || !match.mentions) return null
      const mentions = parseInt(match.mentions || 0)
      if (mentions === 0) return null
      // ApeWisdom sentiment: string 'Bullish'/'Bearish'/'Neutral' or numeric
      let bullishPct = 50
      if (typeof match.sentiment === 'string') {
        bullishPct = match.sentiment === 'Bullish' ? 70 : match.sentiment === 'Bearish' ? 30 : 50
      } else if (typeof match.sentiment === 'number') {
        bullishPct = Math.round(((match.sentiment + 1) / 2) * 100)
      }
      // Use upvote ratio if mentions + upvotes available
      if (match.upvotes && match.mentions) {
        const ratio = parseInt(match.upvotes) / parseInt(match.mentions)
        bullishPct = Math.round(Math.min(95, Math.max(5, ratio * 100)))
      }
      return {
        bullish_pct: Math.max(5, Math.min(95, bullishPct)),
        bearish_pct: Math.max(5, Math.min(95, 100 - bullishPct)),
        buzz_score: Math.min(100, Math.round(mentions / 5)),
        social_source: 'apewisdom',
        is_neutral_fallback: false,
      }
    },
    // Stocksera: returns array of { ticker, no_of_comments, sentiment } from WSB + Stocktwits
    // Fully free, no key required
    stocksera: () => {
      const data = Array.isArray(raw) ? raw : (raw.data || [])
      if (!data.length) return null
      const row = data[0]
      const comments = parseInt(row.no_of_comments || row.mentions || 0)
      if (comments === 0) return null
      const sentStr = (row.sentiment || '').toLowerCase()
      const bullishPct = sentStr === 'bullish' ? 72
        : sentStr === 'bearish' ? 28
        : sentStr === 'very bullish' ? 85
        : sentStr === 'very bearish' ? 15
        : 50
      return {
        bullish_pct: bullishPct,
        bearish_pct: 100 - bullishPct,
        buzz_score: Math.min(100, Math.round(comments / 3)),
        social_source: 'stocksera',
        is_neutral_fallback: false,
      }
    },
  }
  return (normalizers[source] ?? (() => null))()
}

// Derives social-like sentiment from news headlines already in the pipeline.
// Uses the AI sentiment score if available, otherwise keyword-scores headlines.
// This is always available — it uses data we already fetched in Steps 2 and 4.
export function deriveNewsBasedSocial(headlines, aiScore) {
  if (!headlines || headlines.length === 0) return null

  let bullishPct

  if (aiScore !== null && aiScore !== undefined && !isNaN(aiScore)) {
    // AI score is -1..1, convert to 0..100
    bullishPct = Math.round(((parseFloat(aiScore) + 1) / 2) * 100)
  } else {
    const positiveWords = ['beats', 'beat', 'strong', 'growth', 'record', 'upgrade',
                           'raises', 'rally', 'surge', 'gain', 'profit', 'exceed']
    const negativeWords = ['misses', 'miss', 'weak', 'decline', 'cut', 'downgrade',
                           'falls', 'drops', 'loss', 'concern', 'warn', 'below']
    let score = 0
    for (const h of headlines.slice(0, 10)) {
      const title = (h.title || '').toLowerCase()
      if (positiveWords.some(w => title.includes(w))) score++
      if (negativeWords.some(w => title.includes(w))) score--
    }
    const n = Math.min(headlines.length, 10)
    bullishPct = Math.round(((score + n) / (2 * n)) * 100)
  }

  bullishPct = Math.max(10, Math.min(90, bullishPct))

  return {
    bullish_pct: bullishPct,
    bearish_pct: 100 - bullishPct,
    buzz_score: Math.min(100, headlines.length * 5),
    social_source: 'news-derived',
    is_neutral_fallback: false,
  }
}

export const NEUTRAL_SOCIAL = {
  bullish_pct: 50,
  bearish_pct: 50,
  buzz_score: 0,
  social_source: 'none',
  is_neutral_fallback: true,
}

