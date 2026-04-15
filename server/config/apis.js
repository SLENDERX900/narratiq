export const marketProviders = [
  { name: 'finnhub',    baseURL: 'https://finnhub.io/api/v1',    key: process.env.FINNHUB_API_KEY },
  { name: 'twelvedata', baseURL: 'https://api.twelvedata.com',    key: process.env.TWELVE_DATA_API_KEY },
]

export const newsProviders = [
  { name: 'finnhub',    baseURL: 'https://finnhub.io/api/v1',             key: process.env.FINNHUB_API_KEY },
  { name: 'alpaca',     baseURL: 'https://data.alpaca.markets/v1beta1',    key: process.env.ALPACA_API_KEY, secret: process.env.ALPACA_SECRET_KEY },
  { name: 'tiingo',     baseURL: 'https://api.tiingo.com',                 key: process.env.TIINGO_API_KEY },
]

export const socialProviders = [
  // Marketaux: news with entity sentiment scores — free 100 req/day
  { name: 'marketaux',  baseURL: 'https://api.marketaux.com/v1',      key: process.env.MARKETAUX_API_KEY },
  // ApeWisdom: Reddit WSB + r/stocks mention counts & sentiment — fully free, no key required
  // Endpoint: /filter/all/for/{ticker}  returns mentions, upvotes, rank, sentiment
  { name: 'apewisdom',  baseURL: 'https://apewisdom.io/api/v1.0',     key: null },
  // Stocksera: WSB mentions, Stocktwits trending — free public API, no key required
  // Endpoint: /ticker_stats/?ticker={ticker}
  { name: 'stocksera',  baseURL: 'https://stocksera.netlify.app/api', key: null },
]

export const llmProviders = [
  {
    name: 'cerebras', baseURL: 'https://api.cerebras.ai/v1', key: process.env.CEREBRAS_API_KEY,
    models: { fast: 'llama3.1-8b', smart: 'llama-3.3-70b' },
  },
  {
    name: 'groq', baseURL: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY,
    models: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
  },
  {
    name: 'gemini', baseURL: null, key: process.env.GEMINI_API_KEY,
    models: { fast: 'gemini-2.0-flash', smart: 'gemini-2.0-flash' },
  },
]

export const fredSeries = {
  treasury10y:   'DGS10',
  yieldSpread:   'T10Y2Y',
  vix:           'VIXCLS',
  consumerSent:  'UMCSENT',
}

export const marketHours = {
  NYSE:    { open: 13, close: 20 },
  NASDAQ:  { open: 13, close: 20 },
  LSE:     { open: 8,  close: 16 },
  default: { open: 13, close: 20 },
}
