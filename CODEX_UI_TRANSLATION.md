# CODEX_UI_TRANSLATION.md
**Objective:** Refactor the frontend UI and API payload to provide a "Dual-Layer" display. Layer 1 is plain-English actionable advice (Buy/Sell). Layer 2 is the institutional reasoning (Accumulation/Distribution) to educate the user.

---

## 1. THE API PAYLOAD UPDATE (The Translation Layer)
**File to Modify:** `server/api/forecastPayload.js`

**Instructions for Codex:**
Update the JSON payload. The backend must translate the complex EVR math into a simple `action` (Traffic Light) and a plain-English `reasoning` string, alongside the technical terms.

**Target JSON Payload Structure:**
```json
{
  "ticker": "AAPL",
  "current_price": 270.06,
  "evr_engine": {
    "active_regime": "MOMENTUM",
    "simple_action": "SELL / TAKE PROFITS", 
    "institutional_term": "Distribution",
    "plain_english_reasoning": "The news is great and the crowd is buying, but large institutions are using this hype to quietly sell their shares. The stock is likely to drop soon.",
    "divergence_magnitude": {
      "value": -1.62,
      "status": "EXTREME"
    }
  }
}