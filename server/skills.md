# NarratiQ AMIE — Strategy Skills (skills.md)
# These are learned behaviors the ML model applies to interpret signals.
# Each skill is a pattern the gradient boosting trees should learn to identify.

---

## 1. GAP ANALYSIS SKILL

Detect and classify price gaps for direction bias.

```
GAP_TYPE_1: BREAKAWAY_GAP
  signal: gap_pct > 1.5% on above-average pre-market volume
  interpretation: Strong directional move; sentiment usually confirms
  ml_weight: high — include gap_pct as feature when available

GAP_TYPE_2: EXHAUSTION_GAP
  signal: gap_pct > 2% but volume is below 30-day average
  interpretation: Trend may be ending; watch for reversal
  ml_flag: check if reddit_sentiment is at extreme (>0.85 or <-0.15)

GAP_TYPE_3: WEEKEND_GAP
  signal: friday_close to monday_open deviation > 0.8%
  interpretation: News over weekend was significant
  ml_feature: weekend_gap_pct = (monday_open - friday_close) / friday_close * 100
```

---

## 2. SENTIMENT LAYERING SKILL

How to combine multiple sentiment sources with appropriate weights.

```
RATIONAL_LAYER (institutional, momentum-following):
  sources: ["news", "macro", "tiingo_news"]
  weight_base: 0.6
  behavior: momentum — if bullish, price usually follows within 2-4 hours
  decay: slow (24–72 hours)

IRRATIONAL_LAYER (retail, noise/contrarian at extremes):
  sources: ["reddit", "wsb", "apewisdom", "stocksera"]
  weight_base: 0.4
  behavior: contrarian above 0.85 / below -0.85 threshold
  decay: fast (6–24 hours)
  asymmetry: negative_weight *= 1.4 (fear > greed amplification)

BLENDING FORMULA:
  blended_sentiment = (rational_score * rational_weight * trust_news)
                    + (irrational_score * irrational_weight * trust_reddit)
  where trust_* = learned reliability score from trust engine (0..1)
```

---

## 3. VOLATILITY REGIME DETECTION SKILL

Classify the current market environment before applying sentiment.

```
REGIME_1: LOW_VOLATILITY (VIX < 16)
  sentiment_predictive_power: HIGH
  best_features: sentiment_score, sentiment_delta
  model_behavior: sentiment is a stronger price driver; trust it more

REGIME_2: MEDIUM_VOLATILITY (VIX 16–25)
  sentiment_predictive_power: MODERATE
  best_features: momentum, volatility, sentiment
  model_behavior: balanced — price action and sentiment roughly equal weight

REGIME_3: HIGH_VOLATILITY (VIX > 25)
  sentiment_predictive_power: LOW
  best_features: momentum, volatility (sentiment becomes noise)
  model_behavior: momentum and fear dominate; discount sentiment signals

REGIME_4: CRISIS (VIX > 35)
  sentiment_predictive_power: VERY LOW (panic is non-linear)
  model_behavior: flag as "crisis mode"; output only directional signal, no price target
```

---

## 4. PRE-MARKET SIGNAL SKILL (The Active Forecast Window)

How to use pre-market data (16:00–21:30 MYT for US stocks):

```
STEP_1: OVERNIGHT_NEWS_DIGEST
  window: market_close (04:00 MYT) to pre_market_start (16:00 MYT)
  action: ingest all news sentiment, FRED updates
  output: overnight_sentiment_score, macro_regime_update

STEP_2: PRE_MARKET_PRICE_ANCHOR
  window: 16:00–21:00 MYT
  action: monitor pre-market price vs previous close
  feature: premarket_change_pct = (premarket_price - prev_close) / prev_close * 100
  ml_use: strong directional anchor for regular session forecast

STEP_3: CONVICTION_CALIBRATION
  condition: overnight_sentiment aligns with premarket_change direction
  output: conviction = HIGH (both sources agree)
  condition: overnight_sentiment OPPOSES premarket_change direction
  output: conviction = LOW, flag = "Signal conflict — divergence detected"

STEP_4: FINAL_FORECAST_COMMIT
  deadline: 21:00 MYT (30 min before NYSE open)
  outputs: predicted_change, implied_price, ci_bounds, conviction_level, active_rules
```

---

## 5. SENTIMENT DECAY SKILL

Apply time-based decay to older sentiment signals.

```
decay_function(score, hours_old, source):
  if source in ["reddit", "wsb", "apewisdom"]:
    half_life_hours = 12
    return score * exp(-0.693 * hours_old / half_life_hours)
  if source in ["news", "tiingo"]:
    half_life_hours = 48
    return score * exp(-0.693 * hours_old / half_life_hours)
  if source == "macro":
    half_life_hours = 168  # macro signals last ~1 week
    return score * exp(-0.693 * hours_old / half_life_hours)
```

---

## 6. 2026 MARKET CONTEXT SKILLS

Specific 2026 investor behavior patterns to incorporate as bias features:

```
DOWNTURN_ANXIETY_BIAS:
  context: 76% of 2026 investors fear a downturn
  ml_feature: add global_fear_index = weighted avg of (VIX + yield_inversion + news_negativity)
  effect: when global_fear_index > 0.6, discount bullish social sentiment by 30%

AI_SECTOR_LENS:
  context: AI bubble debate — productivity vs overvaluation narrative
  ml_feature: ai_theme_ratio = (positive_ai_mentions / total_ai_mentions) in news
  effect: for AI/tech stocks, high ai_theme_ratio + high VIX = skepticism flag

ELECTION_VOLATILITY_2026:
  context: US Midterm Elections late 2026 — policy uncertainty, affordability concerns
  ml_feature: months_to_election (continuous countdown feature from Nov 2026)
  effect: as months_to_election decreases below 3, scale volatility estimate up 10%

CRYPTO_SENTIMENT_ISOLATION:
  context: 54% cautious on crypto, 44% optimistic on gold/commodities
  rule: do NOT use crypto sentiment as a proxy for equity sentiment
```

---

## 7. OVERLAP WINDOW SKILL

Use market overlaps as a volume/liquidity signal.

```
US_LONDON_OVERLAP (13:30–16:00 UTC = 21:30–00:00 MYT):
  property: highest combined volume of any session overlap
  ml_use: is_overlap=1 → increase momentum feature weight by 20%
  reason: large institutions move simultaneously, sentiment becomes more reliable

ASIA_EUROPE_OVERLAP (01:00–07:00 UTC = 09:00–15:00 MYT):
  property: moderate volume, influenced by Asian open
  ml_use: is_overlap=1 → good window to validate overnight sentiment
```
