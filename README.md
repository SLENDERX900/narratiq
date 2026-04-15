# NarratiQ — Multi-Agent Market Narrative Intelligence Platform

A fully cloud-hosted financial dashboard that runs 24/7 without your laptop. Five AI agents
collaborate hourly to pull market data, news, social sentiment, and generate economics-aware
narratives for every ticker in your watchlist.

---

## Architecture Overview

```
GitHub → Railway (Express + node-cron)  ←→  Supabase (Postgres + Auth)
                ↓                                      ↑
        5-step agent pipeline                  stock_insights table
                                                       ↓
                              Vercel (React/Vite) ← polls every 30s
```

### The 5-Step Pipeline (runs hourly on Railway)

| Step | Agent | Primary | Fallback 1 | Fallback 2 |
|------|-------|---------|------------|------------|
| 1 | Market Agent | Finnhub | Twelve Data | — |
| 2 | News Agent | Finnhub | Alpaca News | Twelve Data |
| 3 | Social Agent | Finnhub Social | StockTwits | Unusual Whales |
| 4 | Sentiment Agent | Cerebras 8B | Groq 8B | Gemini Flash |
| 5 | Orchestrator | Cerebras 70B | Groq 70B | Gemini Flash |

Every step writes a checkpoint to `agent_run_log` keyed on `(run_id, ticker)`.
If any provider fails with 429/503, the Health Monitor rotates to the next provider
and resumes from the last checkpoint — zero data loss.

---

## Project Structure

```
narratiq/
├── supabase_schema.sql          ← Run this first in Supabase SQL Editor
├── server/                      ← Express backend (deploy to Railway)
│   ├── index.js                 ← Entry point + cron scheduler
│   ├── .env.example             ← Copy to .env and fill in keys
│   ├── railway.toml             ← Railway deployment config
│   ├── config/
│   │   ├── apis.js              ← All provider URLs and keys
│   │   ├── llm.js               ← Unified LLM client (Cerebras/Groq/Gemini)
│   │   └── supabase.js          ← Supabase service-role client
│   ├── agents/
│   │   ├── marketAgent.js       ← Step 1: price + OHLCV candles
│   │   ├── newsAgent.js         ← Step 2: headlines last 24h
│   │   ├── socialAgent.js       ← Step 3: sentiment + buzz score
│   │   ├── sentimentAgent.js    ← Step 4: AI classification (8B)
│   │   └── orchestratorAgent.js ← Step 5: narrative + confidence (70B)
│   ├── lib/
│   │   ├── dataNormalizer.js    ← Maps all provider shapes → canonical schema
│   │   ├── healthMonitor.js     ← Axios interceptor for 429/503 rotation
│   │   └── pipelineRunner.js    ← Orchestrates all 5 steps per ticker
│   └── routes/
│       ├── insights.js          ← GET /api/insights/:ticker
│       └── watchlist.js         ← GET/POST/DELETE /api/watchlist
└── client/                      ← React/Vite frontend (deploy to Vercel)
    ├── .env.example             ← Copy to .env and fill in Supabase keys
    ├── vercel.json              ← Vercel deployment config
    └── src/
        ├── lib/supabase.js      ← Supabase anon client
        ├── hooks/
        │   ├── useWatchlist.js  ← Watchlist CRUD + persistence
        │   └── useInsights.js   ← 30s polling hook
        ├── components/
        │   ├── DolphinLogo.jsx
        │   ├── SearchBar.jsx
        │   ├── SentimentBadge.jsx
        │   ├── SentimentChart.jsx   ← Dual-axis price + sentiment chart
        │   ├── InsightCard.jsx      ← Full ticker card
        │   └── ComparisonMatrix.jsx ← Side-by-side multi-ticker view
        └── pages/
            ├── AuthPage.jsx     ← Supabase Auth UI
            └── Dashboard.jsx    ← Main dashboard
```

---

## Setup Guide

### Step 1 — Supabase

1. Go to [supabase.com](https://supabase.com) and create a free project
2. In the SQL Editor, paste and run the entire contents of `supabase_schema.sql`
3. Go to **Settings → API** and copy:
   - `Project URL`
   - `anon public` key
   - `service_role secret` key

### Step 2 — Get API Keys (all free tiers)

| Service | URL | Notes |
|---------|-----|-------|
| Finnhub | finnhub.io | Free tier: 60 req/min |
| Twelve Data | twelvedata.com | Free tier: 800 req/day |
| Alpaca | alpaca.markets | Free market data |
| Cerebras | cerebras.ai | Free tier, very fast |
| Groq | console.groq.com | Free tier |
| Gemini | aistudio.google.com | Free tier |

StockTwits and Unusual Whales require no API key for the endpoints used.

### Step 3 — Run Locally (development)

```bash
# Backend
cd server
cp .env.example .env        # Fill in all keys
npm install
npm run dev                 # Starts on port 3001

# Frontend (separate terminal)
cd client
cp .env.example .env        # Fill in Supabase URL + anon key
npm install
npm run dev                 # Starts on port 5173
```

To trigger the pipeline manually without waiting for the hourly cron:
```bash
curl -X POST http://localhost:3001/api/pipeline/run
```

### Step 4 — Deploy to Railway (backend, runs 24/7)

1. Push your code to a GitHub repository
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select the `server/` folder as the root directory
4. Add all environment variables from `.env.example` in the Railway dashboard
5. Railway will auto-deploy on every `git push`

Your backend URL will be something like `https://narratiq-server.up.railway.app`

### Step 5 — Deploy to Vercel (frontend)

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select the `client/` folder as the root directory
3. Add environment variables:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon key
   - `VITE_API_URL` → your Railway backend URL
4. Deploy — Vercel auto-deploys on every `git push`

---

## Key Design Decisions

### Why `(run_id, ticker)` as the upsert key
Each hourly batch gets a fresh UUID (`run_id`). This means 20 tickers running in
parallel never overwrite each other's checkpoints, and the Health Monitor always
reads the correct step for the correct ticker in the correct batch.

### Why StockTwits + Unusual Whales as social fallbacks
Finnhub Social Sentiment has thin coverage for small/mid-cap tickers. StockTwits
has a public REST endpoint (no auth required) with strong retail trader coverage
for mid-caps. Unusual Whales covers a broad ticker universe via options flow signals.
Between the three, virtually any traded ticker gets some social signal.

### Why the `is_neutral_fallback` flag matters
When all social providers return empty, the orchestrator prompt is automatically
adjusted to omit social analysis. This prevents the 70B model from hallucinating
a social narrative based on a 50/50 placeholder.

### Why Railway over a VPS
Railway's free tier keeps Express alive continuously with zero server management.
The `railway.toml` configures automatic restarts on failure and a `/health`
endpoint for uptime monitoring. The catch-up logic in `pipelineRunner.js` ensures
a missed hourly run fires immediately on restart.

---

## Extending the Platform

**Add a new data source:** Add a new provider object to the relevant array in
`config/apis.js`, write a fetch function in the agent file, and add it to that
agent's `attempts` array. The normalizer handles the shape mapping.

**Add a new ticker universe:** The pipeline automatically processes every ticker
in `user_watchlist`. No code changes needed — just add tickers through the UI.

**Adjust the pipeline schedule:** Change the cron expression in `index.js`.
`'0 * * * *'` = hourly. `'*/30 * * * *'` = every 30 minutes.

**Add webhook alerts:** After the Orchestrator writes to `stock_insights`, add a
Supabase Database Webhook that fires when confidence_score > 80 and
sentiment_cat = 'bullish' or 'bearish'. Point it at a free service like ntfy.sh.
