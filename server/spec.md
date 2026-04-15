# NarratiQ AMIE — Technical Specification (spec.md)
# This file is read by the ML model as hard boundaries and API schemas.
# Version: 2.0 | Last updated: 2026

---

## 1. EXCHANGE SESSION WINDOWS (UTC Reference)

All times stored and compared in UTC. Display converted to user's local timezone.

### NYSE / NASDAQ (US/Eastern — UTC-5 winter, UTC-4 summer DST)
```
pre_market:   04:00–09:30 ET  =  09:00–14:30 UTC (winter) | 08:00–13:30 UTC (summer)
regular:      09:30–16:00 ET  =  14:30–21:00 UTC (winter) | 13:30–20:00 UTC (summer)
post_market:  16:00–20:00 ET  =  21:00–01:00 UTC (winter) | 20:00–00:00 UTC (summer)
malaysia_regular: 21:30–04:00 MYT (winter) | 22:30–05:00 MYT (DST)
```

### LSE London (Europe/London — UTC+0 winter, UTC+1 summer)
```
pre_market:   05:05–07:50 BST = 04:05–06:50 UTC
regular:      08:00–16:30 BST = 07:00–15:30 UTC
post_market:  16:40–17:15 BST = 15:40–16:15 UTC
malaysia_regular: 15:00–23:30 MYT
```

### Bursa Malaysia (Asia/Kuala_Lumpur — UTC+8 constant, no DST)
```
pre_market:   08:30–09:00 MYT = 00:30–01:00 UTC
regular_am:   09:00–12:30 MYT = 01:00–04:30 UTC
lunch_break:  12:30–14:30 MYT = 04:30–06:30 UTC  [ML: treat as closed]
regular_pm:   14:30–17:00 MYT = 06:30–09:00 UTC
post_market:  17:00–17:30 MYT = 09:00–09:30 UTC
```

### TSE Tokyo (Asia/Tokyo — UTC+9 constant, no DST)
```
pre_market:   08:00–09:00 JST = 23:00–00:00 UTC
regular_am:   09:00–11:30 JST = 00:00–02:30 UTC
lunch_break:  11:30–12:30 JST = 02:30–03:30 UTC  [ML: treat as closed]
regular_pm:   12:30–15:30 JST = 03:30–06:30 UTC
post_market:  15:30–16:00 JST = 06:30–07:00 UTC
```

### HKEX Hong Kong (Asia/Hong_Kong — UTC+8 constant, no DST)
```
pre_market:   09:00–09:30 HKT = 01:00–01:30 UTC
regular_am:   09:30–12:00 HKT = 01:30–04:00 UTC
lunch_break:  12:00–13:00 HKT = 04:00–05:00 UTC  [ML: treat as closed]
regular_pm:   13:00–16:00 HKT = 05:00–08:00 UTC
post_market:  16:00–16:10 HKT = 08:00–08:10 UTC
```

---

## 2. MARKET OVERLAP WINDOWS (ML: highest volume periods)

These windows produce the strongest price-sentiment signal due to cross-market liquidity.

```
US_LONDON_OVERLAP:  13:30–15:30 UTC  (US pre-market + London regular)
                    = 21:30–23:30 MYT  ← PRIMARY TRADING SIGNAL WINDOW
US_FULL_OVERLAP:    13:30–16:00 UTC  (London closes, US in full session)
                    = 21:30–00:00 MYT
ASIA_EUROPE_OVERLAP: 01:00–07:00 UTC  (Asia regular + early London)
                    = 09:00–15:00 MYT
```

---

## 3. MALAYSIA ACTIVE FORECAST SCHEDULE (MYT Reference)

This is the primary operational schedule for users in UTC+8:

```
08:00–16:00 MYT  → STANDBY:       Market closed (US). Parse macro updates, FRED data.
16:00–21:29 MYT  → PRE-FORECAST:  US pre-market active. HIGH PRIORITY ingestion window.
                                    Model runs sentiment analysis + draft forecast.
21:30–04:00 MYT  → LIVE TRADING:  US regular session. Monitor vs forecast. Update trust scores.
04:00–08:00 MYT  → COOLDOWN:      Post-market. Evaluate accuracy. Retrain ML weights.
```

**SIGNAL LEAD TIME = 330 minutes** (5.5 hours pre-market available before NYSE open)
Model must produce forecast by 21:00 MYT at the latest for US stocks.

---

## 4. ML FEATURE SCHEMA

### Session Features (injected into every ML observation)
```json
{
  "session_type": "0=closed | 1=pre_market | 2=regular | 3=post_market",
  "is_market_open": "0 or 1",
  "is_lunch_break": "0 or 1 (Asian exchanges)",
  "time_to_close_min": "continuous: minutes until session end",
  "time_since_open_min": "continuous: minutes since session opened",
  "is_overlap": "0 or 1: two major markets open simultaneously",
  "is_monday_open": "0 or 1: first candle after weekend gap",
  "is_premarket_active": "0 or 1: currently in pre-market window",
  "weekend_gap_hrs": "continuous: hours since last regular session close"
}
```

### Sentiment Features
```json
{
  "news_sentiment":     "float -1..1 (institutional/rational — momentum indicator)",
  "reddit_sentiment":   "float -1..1 (retail/irrational — contrarian at extremes)",
  "macro_fear":         "float 0..1 (VIX normalised — risk-off signal)",
  "sentiment_delta":    "float: rate of change vs previous hour",
  "sentiment_divergence": "float: news_sentiment - reddit_sentiment (disagreement signal)",
  "panic_spike":        "0 or 1: social mentions >300% surge (GameStop effect)",
  "conviction":         "float 0..1: alignment between news + reddit + macro"
}
```

---

## 5. DATA API ENDPOINTS

```
Market data:    Finnhub /quote, /candle | Twelve Data /time_series
News:           Finnhub /company-news | Alpaca /news | Tiingo /news
Social:         Marketaux /news/all | ApeWisdom /filter/all/for/{ticker} | Stocksera /reddit/wsb
Macro (FRED):   DGS10, T10Y2Y, VIXCLS, UMCSENT
Historical:     Tiingo /daily/{ticker}/prices (30yr adjusted)
```

---

## 6. ASYMMETRIC SENTIMENT IMPACT (research-backed)

```
negative_amplification_factor: 1.4x  (negative sentiment drives 40% more volatility than positive)
social_decay_hours: 24               (Reddit sentiment effect typically decays within 24 hours)
news_lead_time_hours: 2              (institutional news leads price by ~2 hours on average)
extreme_social_threshold: 0.85       (above this, contrarian signal — potential reversal)
rational_sources: ["news", "macro"]  (momentum indicators)
irrational_sources: ["reddit", "wsb"] (noise/contrarian at extremes)
```
