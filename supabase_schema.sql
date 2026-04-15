-- ============================================================
-- NarratiQ — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- 1. USER WATCHLIST
create table if not exists public.user_watchlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  ticker      text not null,
  created_at  timestamptz default now(),
  unique (user_id, ticker)
);

alter table public.user_watchlist enable row level security;

create policy "Users manage own watchlist"
  on public.user_watchlist
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. AGENT RUN LOG (checkpoint table)
create table if not exists public.agent_run_log (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null,
  ticker         text not null,
  step_completed int  not null default 0,
  step_data      jsonb,
  error          boolean default false,
  updated_at     timestamptz default now(),
  unique (run_id, ticker)
);

alter table public.agent_run_log enable row level security;

create policy "Service role full access to run log"
  on public.agent_run_log
  for all
  using (true);

-- 3. STOCK INSIGHTS (what the frontend reads)
create table if not exists public.stock_insights (
  id               uuid primary key default gen_random_uuid(),
  ticker           text not null,
  price            numeric,
  change_pct       numeric,
  candles          jsonb,
  headlines        jsonb,
  social           jsonb,
  sentiment_score  numeric,
  sentiment_cat    text,
  key_themes       jsonb,
  narrative        text,
  confidence_score int,
  social_source    text,
  generated_at     timestamptz default now()
);

alter table public.stock_insights enable row level security;

create policy "Anyone authenticated can read insights"
  on public.stock_insights
  for select
  using (auth.role() = 'authenticated');

create policy "Service role can write insights"
  on public.stock_insights
  for all
  using (true);

-- Index for fast ticker lookups
create index if not exists idx_stock_insights_ticker_time
  on public.stock_insights(ticker, generated_at desc);

create index if not exists idx_agent_run_log_ticker_run
  on public.agent_run_log(ticker, run_id, updated_at desc);

-- ============================================================
-- ADDITIONS — run these in Supabase SQL Editor after the original schema
-- ============================================================

-- 4. STOCK FORECASTS (OLS regression model output per run)
create table if not exists public.stock_forecasts (
  id                uuid primary key default gen_random_uuid(),
  ticker            text not null,
  run_id            uuid not null,

  -- OLS model coefficients
  beta_0            numeric,   -- intercept
  beta_1            numeric,   -- sentiment slope
  beta_2            numeric,   -- momentum slope (optional)
  r_squared         numeric,   -- goodness of fit 0..1
  std_error         numeric,   -- standard error of estimate
  n_observations    int,       -- data points used

  -- Forecast output
  current_sentiment numeric,
  predicted_change  numeric,   -- % change predicted
  lower_bound       numeric,   -- 95% CI lower
  upper_bound       numeric,   -- 95% CI upper
  forecast_price    numeric,   -- absolute price forecast

  -- Accuracy (filled next run by comparing to previous forecast)
  previous_predicted_change numeric,
  actual_change             numeric,
  forecast_error            numeric,   -- actual - predicted
  accuracy_pct              numeric,   -- 1 - |error/actual| * 100

  generated_at      timestamptz default now()
);

alter table public.stock_forecasts enable row level security;

create policy "Authenticated users can read forecasts"
  on public.stock_forecasts for select
  using (auth.role() = 'authenticated');

create policy "Service role can write forecasts"
  on public.stock_forecasts for all
  using (true);

create index if not exists idx_stock_forecasts_ticker_time
  on public.stock_forecasts(ticker, generated_at desc);

-- 5. Add forecast_price column to stock_insights for easy joining
alter table public.stock_insights
  add column if not exists forecast_price numeric,
  add column if not exists forecast_error numeric,
  add column if not exists macro_context  text;

-- ============================================================
-- AMIE ADDITIONS — run in Supabase SQL Editor
-- ============================================================

-- 6. SOURCE RELIABILITY TRACKING
-- Tracks per-source trustworthiness over time (the AMIE adaptive layer)
create table if not exists public.source_reliability (
  id             uuid primary key default gen_random_uuid(),
  ticker         text not null,
  source         text not null,  -- 'news', 'reddit', 'macro', 'tiingo'
  window_start   timestamptz not null,
  n_predictions  int default 0,
  avg_error      numeric,        -- mean |actual - predicted| when this source was primary
  reliability    numeric,        -- 0..100, higher = more trustworthy
  weight         numeric,        -- dynamic weight for ML blending
  updated_at     timestamptz default now(),
  unique (ticker, source)
);

alter table public.source_reliability enable row level security;
create policy "Auth users read reliability" on public.source_reliability for select using (auth.role() = 'authenticated');
create policy "Service role write reliability" on public.source_reliability for all using (true);

-- 7. MACRO SIGNALS (FRED data — hourly snapshot)
create table if not exists public.macro_signals (
  id           uuid primary key default gen_random_uuid(),
  treasury_10y numeric,   -- DGS10 10-year yield
  yield_spread numeric,   -- T10Y2Y: 10yr - 2yr (negative = inverted = risk-off)
  vix          numeric,   -- VIXCLS volatility index
  consumer_sent numeric,  -- UMCSENT consumer confidence
  fetched_at   timestamptz default now()
);

alter table public.macro_signals enable row level security;
create policy "Auth users read macro" on public.macro_signals for select using (auth.role() = 'authenticated');
create policy "Service write macro" on public.macro_signals for all using (true);

-- 8. Add trustworthiness columns to stock_insights
alter table public.stock_insights
  add column if not exists trust_score      numeric,
  add column if not exists implied_price    numeric,
  add column if not exists price_divergence numeric,  -- actual - implied (positive = price running ahead of sentiment)
  add column if not exists macro_regime     text;     -- 'risk-on' | 'risk-off' | 'neutral'
