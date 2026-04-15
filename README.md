# NarratiQ — Multi-Agent Market Intelligence

**A living experiment in AI-powered market analysis.**

[![Try it Live](https://img.shields.io/badge/Try%20it%20Live-netlify-blue?style=for-the-badge&logo=netlify)](https://narratiq.netlify.app)

> **Note:** This app requires a backend running on Railway to function fully. The live demo shows the UI, but you'll need to deploy your own backend instance for full functionality. See [Setup Guide](#setup-guide) below.

NarratiQ is my attempt to solve a problem that's bothered me for years: most financial tools show you *what* happened, but rarely help you understand *why* it happened and *what might come next*. I built this to explore whether a team of specialized AI agents, working together with a unified memory, could generate insights that feel closer to how an experienced trader thinks — connecting price action, news sentiment, social buzz, and macro context into a coherent narrative.

**This is a work in progress.** I'm building this in public to test ideas, learn what works, and gradually evolve it toward something genuinely useful. Some parts are rough. Some ideas might fail. But that's the point — it's a living project, not a finished product.

---

## The Idea Behind NarratiQ

### The Problem I Was Trying to Solve

I kept finding myself with 20 browser tabs open every morning: checking prices on one site, news on another, Reddit sentiment somewhere else, then trying to mentally synthesize it all. Existing "AI trading tools" felt like black boxes or overhyped signal services. I wanted something different:

- **Transparent reasoning** — show me *how* the conclusion was reached
- **Multi-source synthesis** — don't just tell me "AAPL is up 2%", tell me "AAPL is up 2% driven by AI chip optimism, but social sentiment is cooling and the narrative confidence is only moderate"
- **Persistent memory** — remember what it said yesterday and track whether it was right
- **Continuous operation** — run 24/7 without my laptop being open

### The Core Insight

Markets are driven by narratives. Prices move when the collective story changes. But narratives are messy — they emerge from the interaction of price action, news flow, social sentiment, and macro conditions. No single data source captures this.

My hypothesis: *if you give different AI agents specialized roles (one for price data, one for news, one for social sentiment, one for synthesis), and give them a shared memory to build on each other's work, you can generate richer, more contextual narratives than any single model could produce alone.*

### What's Working Now

- **7-agent pipeline** runs hourly, collecting market data, news, social sentiment, macro context, and generating narratives with confidence scores
- **Fallback system** — if one data provider fails, the agents automatically try alternatives
- **Forecast tracking** — predictions are scored against actual outcomes; accuracy feeds back into trust scores
- **Session-aware logic** — the system knows when markets are closed and adjusts its behavior (collecting overnight news but skipping certain forecasts)
- **Live dashboard** with real-time updates, comparison views, and expandable detail cards

### What's Still Being Figured Out

- The narrative quality varies — sometimes insightful, sometimes generic. Still tuning prompts and model selection.
- Forecast accuracy is tracked but the ML component is basic; improving this is a priority.
- Social sentiment coverage is spotty for smaller tickers — working on better fallbacks.
- The "trust score" algorithm needs more real-world data to validate.

---

## Architecture Overview

```
GitHub → Railway (Express + node-cron)  ←→  Supabase (Postgres + Auth)
                ↓                                      ↑
        7-agent pipeline                     stock_insights table
                                                       ↓
                              Netlify (React/Vite) ← polls every 30s
```

### The Agent Pipeline (runs hourly on Railway)

| Step | Agent | Role | Data Sources |
|------|-------|------|--------------|
| 1 | **Macro Agent** | Establish market regime context | VIX, yield spreads, sector momentum |
| 2 | **Market Agent** | Price action & technical structure | Finnhub, Twelve Data |
| 3 | **News Agent** | Headline collection & initial filtering | Finnhub, Alpaca, Tiingo |
| 4 | **Social Agent** | Retail sentiment & buzz detection | Marketaux, StockTwits |
| 5 | **Sentiment Agent** | AI classification of news sentiment | Cerebras/Groq 8B |
| 6 | **Orchestrator** | Narrative synthesis with confidence | Cerebras/Groq 70B |
| 7 | **Forecast Agent** | Directional prediction with accuracy tracking | ML-based on historical patterns |

Every step writes checkpoints. If any provider fails, the Health Monitor rotates to alternatives and resumes from the last checkpoint — zero data loss.

**Session-aware rules** prevent the system from making silly predictions when markets are closed. The agents know pre-market from regular hours from after-hours, and adjust their expectations accordingly.

---

## Why This Stack?

I chose these tools based on a few principles:

- **Serverless-first for the frontend** — I want the UI to be fast globally without managing CDN configs. Netlify handles this automatically.
- **Always-on backend for cheap** — Railway's free tier keeps a small Express server running 24/7, which is perfect for the cron-scheduled agent pipeline. No VPS management, no sleep/wakeup complexity.
- **Postgres as the system backbone** — Supabase gives me auth, a real database, and realtime subscriptions in one service. The agents write to it, the frontend reads from it — simple.
- **Multiple LLM providers with fallbacks** — I don't trust any single provider. If Cerebras is down, Groq takes over. If both fail, Gemini Flash catches it. This redundancy is essential for 24/7 operation without human intervention.
- **Free data APIs with fallbacks** — All the market data sources have free tiers. The system is designed to gracefully degrade when rate limits hit.

The result: a system that runs continuously for ~$0, can be deployed by anyone with free accounts, and degrades gracefully rather than failing hard.

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
│   │   ├── marketAgent.js       ← Price + OHLCV candles
│   │   ├── newsAgent.js         ← Headlines last 24h
│   │   ├── socialAgent.js       ← Sentiment + buzz score
│   │   ├── sentimentAgent.js   ← AI classification (8B)
│   │   ├── orchestratorAgent.js ← Narrative synthesis (70B)
│   │   ├── forecastAgent.js    ← ML prediction + accuracy tracking
│   │   └── macroAgent.js       ← Macro regime detection
│   ├── lib/
│   │   ├── dataNormalizer.js   ← Maps all provider shapes → canonical schema
│   │   ├── healthMonitor.js    ← Axios interceptor for 429/503 rotation
│   │   ├── pipelineRunner.js   ← Orchestrates all 7 steps per ticker
│   │   └── marketSession.js    ← Market hours awareness
│   └── routes/
│       ├── insights.js         ← GET /api/insights/:ticker
│       ├── watchlist.js        ← GET/POST/DELETE /api/watchlist
│       └── forecast.js         ← GET /api/forecast/:ticker
└── client/                      ← React/Vite frontend (deploy to Netlify)
    ├── .env.example             ← Copy to .env and fill in Supabase keys
    ├── netlify.toml             ← Netlify deployment config
    └── src/
        ├── lib/supabase.js      ← Supabase anon client
        ├── hooks/
        │   ├── useWatchlist.js  ← Watchlist CRUD + persistence
        │   └── useInsights.js   ← 30s polling hook
        ├── components/
        │   ├── DolphinLogo.jsx
        │   ├── SearchBar.jsx
        │   ├── SentimentBadge.jsx
        │   ├── SentimentChart.jsx
        │   ├── InsightCard.jsx
        │   ├── ExpandedCard.jsx
        │   └── ComparisonMatrix.jsx
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

### Step 5 — Deploy to Netlify (frontend)

1. Go to [netlify.com](https://netlify.com) → Add new site → Import from GitHub
2. Select the `client/` folder as the base directory
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add environment variables in **Site settings → Environment variables**:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon key
   - `VITE_API_URL` → your Railway backend URL (from Step 4)
6. Deploy — Netlify auto-deploys on every `git push`

Your frontend URL will be something like `https://narratiq-xyz123.netlify.app`

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

## What's Next

I'm treating this as a long-term learning project. The roadmap is intentionally fluid — I'm building what I need, learning what works, and discarding what doesn't.

**Near-term ideas I'm exploring:**
- Better forecast models — the current ML is too simple; I want to test whether adding more features (sector momentum, earnings calendar proximity) improves directional accuracy
- Confidence calibration — tracking whether the model's confidence scores actually correlate with forecast accuracy
- Alert system — webhook notifications when high-confidence narratives emerge
- Historical backtesting — replay past market conditions to validate agent behavior
- Options flow integration — Unusual Whales data is already in the fallback chain, but I want to make it a first-class signal

**Deeper questions I'm thinking about:**
- Can the agents develop "memory" of past predictions and adjust their confidence based on their own track record?
- Should there be a meta-agent that reviews the other agents' outputs and flags contradictions?
- How do you visualize narrative evolution over time, not just point-in-time snapshots?

If you're interested in any of these directions — or have completely different ideas — I'd love to hear them. This is intentionally an open, collaborative experiment.

---

## A Personal Note

I built NarratiQ because I was frustrated with the gap between raw market data and actionable understanding. The financial world is awash in information but starved of insight. I wanted to see if AI agents, properly orchestrated, could bridge that gap — not by replacing human judgment, but by augmenting it with a persistent, tireless research assistant.

This isn't a product I'm selling. It's a project I'm growing. Some parts will work. Some won't. I'll share the wins and the failures openly because that's how I learn best.

If you deploy your own instance and find it useful — or if you find bugs, have ideas, or want to contribute — please reach out. The best part of building in public is the unexpected connections and insights that come from other people engaging with your work.

**Happy trading, happy building, happy learning.**
