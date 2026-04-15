# NarratiQ AMIE — Decision Engine Rules (rules.md)
# These are hard constraints the ML model must respect before generating a forecast.
# Any rule violation should be flagged in the output and reduce confidence score.

---

## 1. NO-FORECAST ZONES

The ML model must NOT generate a new forecast during these windows:

```
RULE-001: MARKET_CLOSED_BLOCK
  condition: session_type == 0 (closed) AND weekend_gap_hrs < 2
  action: SKIP_FORECAST
  reason: Insufficient price action to anchor sentiment forecast

RULE-002: LUNCH_BREAK_BLOCK
  condition: is_lunch_break == 1 (Bursa, TSE, HKEX)
  action: USE_STALE_FORECAST
  reason: Asian exchanges pause trading — no new price discovery

RULE-003: HOLIDAY_BLOCK
  condition: is_holiday == 1
  action: SKIP_FORECAST, flag = "Market Holiday"
  reason: Holiday-adjacent sessions have abnormal volume patterns

RULE-004: INSUFFICIENT_DATA_BLOCK
  condition: n_observations < 4
  action: RETURN_NULL_FORECAST, message = "Building model..."
  reason: Gradient boosting requires minimum 4 data points
```

---

## 2. HIGH VOLATILITY MODE

Activate when any of these conditions are true:

```
RULE-005: OPENING_BELL_CAUTION
  condition: time_since_open_min < 30 AND session_type == 2
  action: flag = "Opening volatility — low conviction"
  confidence_penalty: -15
  reason: First 30 minutes have erratic price action; sentiment less predictive

RULE-006: CLOSING_BELL_CAUTION
  condition: time_to_close_min < 30 AND session_type == 2
  action: flag = "Closing bell — momentum surge possible"
  confidence_penalty: -10
  reason: End-of-day institutional rebalancing distorts sentiment signal

RULE-007: PANIC_SPIKE_TRIGGER
  condition: social_mention_surge > 300%  (GameStop / meme stock effect)
  action: flag = "HIGH VOLATILITY MODE — social panic detected"
  confidence_penalty: -30
  model_override: contrarian_signal = True
  reason: >300% mention surge historically precedes reversal, not continuation
```

---

## 3. SENTIMENT CONVICTION RULES

```
RULE-008: LOW_CONVICTION_WARNING
  condition: news_sentiment > 0.3 AND reddit_sentiment < -0.3
  action: flag = "Caution: Institutional vs retail disagreement"
  reason: When news is bullish but Reddit is bearish, signal is unreliable

RULE-009: HIGH_CONVICTION_SIGNAL
  condition: |news_sentiment - reddit_sentiment| < 0.2 AND |macro_fear - 0.5| < 0.2
  action: flag = "High conviction — sources aligned"
  confidence_boost: +10

RULE-010: CONTRARIAN_EXTREME
  condition: reddit_sentiment > 0.85 OR reddit_sentiment < -0.85
  action: flag = "Extreme social sentiment — potential reversal signal"
  model_hint: reverse_reddit_weight = True
  reason: Extreme retail sentiment (euphoria/panic) is historically contrarian
```

---

## 4. MACRO REGIME RULES

```
RULE-011: RISK_OFF_DAMPENER
  condition: vix > 25 OR yield_spread < 0
  action: macro_regime = "risk-off", scale sentiment_weight by 0.7
  reason: In risk-off regimes, all sentiment is less predictive; fear dominates

RULE-012: RISK_ON_AMPLIFIER
  condition: vix < 16 AND yield_spread > 0.5
  action: macro_regime = "risk-on", scale sentiment_weight by 1.15
  reason: Low-fear environments allow sentiment to drive price more cleanly

RULE-013: YIELD_CURVE_INVERSION_WARNING
  condition: yield_spread < 0
  action: flag = "Inverted yield curve — recession signal active"
  confidence_penalty: -5
  reason: Inverted yield curve historically precedes volatility regime change

RULE-014: ELECTION_VOLATILITY_2026
  condition: current_year == 2026 AND month >= 9
  action: flag = "US Midterm election season — policy uncertainty elevated"
  confidence_penalty: -8
  reason: Midterm elections increase sector rotation and macro uncertainty
```

---

## 5. WEEKEND GAP RULES

```
RULE-015: MONDAY_GAP_CAUTION
  condition: is_monday_open == 1
  action: flag = "Weekend gap — digest 48hrs of news before trusting forecast"
  confidence_penalty: -12
  time_series_feature: weekend_gap_hrs (continuous weight applied to news recency)

RULE-016: TIME_DECAY_REDDIT
  condition: hours_since_social_fetch > 24
  action: scale reddit_weight by max(0, 1 - (hours_since_social_fetch - 24) / 24)
  reason: Reddit sentiment effect decays to zero after ~48 hours
```

---

## 6. SIGNAL LEAD TIME CONSTRAINT

```
RULE-017: PREMARKET_FORECAST_DEADLINE
  condition: exchange == "NYSE/NASDAQ"
  active_window: 16:00–21:00 MYT (5 hours pre-market)
  required_output: forecast + implied_price + trust_score + conviction_flag
  deadline: 21:00 MYT (30 min before regular open)
  fallback: use_last_valid_forecast

RULE-018: ASIA_MORNING_FORECAST
  condition: exchange == "Bursa/TSE/HKEX"
  active_window: 07:00–09:00 MYT (2 hours before open)
  required_output: forecast + session_context
```
