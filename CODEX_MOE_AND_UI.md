# CODEX_MOE_AND_UI.md
**Objective:** Implement the backend "Mixture of Experts" Gating Agent and refactor the frontend UI payload to display Institutional Alpha metrics instead of retail noise.

---

## PART 1: THE BACKEND (The Gating Agent)
**File to Create/Modify:** `server/agents/gatingAgent.js`

**Instructions for Codex:**
1. Create a routing utility that acts as the "Portfolio Manager" before the ML models are invoked.
2. It must evaluate `VIX` (Macro Volatility) and `RVOL` (Relative Volume) to determine the current `Market Regime`.
3. Based on the Regime, it dictates which "Expert" model logic should be trusted.

**Code Specification:**
```javascript
// server/agents/gatingAgent.js

export const GatingAgent = {
  /**
   * Evaluates market conditions to determine the Active Regime.
   * @param {number} vix - Current CBOE Volatility Index
   * @param {number} rvol - Relative Volume (Current Vol / 10-day SMA Vol)
   * @returns {string} The active regime identifier.
   */
  determineRegime(vix, rvol) {
    if (vix > 25) {
      return 'MACRO_SHOCK'; // High volatility overrides everything
    }
    if (rvol > 1.5) {
      return 'MOMENTUM'; // High participation, trust the trend
    }
    if (rvol < 0.8) {
      return 'MEAN_REVERSION'; // Low participation, fade the extremes
    }
    return 'NORMAL'; // Standard operating environment
  },

  /**
   * Routes the payload to the appropriate logic/model weighting based on regime.
   */
  routePayload(ticker, vix, rvol, sentimentScore, quantData) {
    const regime = this.determineRegime(vix, rvol);
    let signalWeighting = {};

    switch (regime) {
      case 'MACRO_SHOCK':
        signalWeighting = { macro: 0.9, sentiment: 0.05, tape: 0.05 };
        break;
      case 'MOMENTUM':
        signalWeighting = { macro: 0.1, sentiment: 0.4, tape: 0.5 };
        break;
      case 'MEAN_REVERSION':
        // In mean reversion, extreme sentiment is faded (contrarian)
        signalWeighting = { macro: 0.2, sentiment: -0.3, tape: 0.8 };
        break;
      default:
        signalWeighting = { macro: 0.2, sentiment: 0.3, tape: 0.5 };
    }

    return { regime, signalWeighting };
  }
};
```

---

## PART 2: THE FRONTEND PAYLOAD & UI REFACTOR
**File to Modify:** `server/api/forecastPayload.js` (or your equivalent endpoint) AND your React/Frontend components.

**Instructions for Codex:**
1. **Remove Toxic Retail Metrics:** Strip out `Time to close` and `R² Model Quality` from the JSON payload.
2. **Inject EVR Metrics:** Add `Active Regime`, `Divergence Magnitude`, and `Institutional Signal`.
3. **Update the UI Component:** Refactor the frontend cards (referencing the previous screenshots) to display these new metrics.

**Target JSON Payload Structure:**
```json
{
  "ticker": "AAPL",
  "current_price": 270.06,
  "evr_engine": {
    "active_regime": "MOMENTUM",
    "institutional_signal": "DISTRIBUTION_DETECTED",
    "divergence_magnitude": {
      "value": -1.62,
      "status": "EXTREME",
      "description": "Sentiment is highly bullish (+8), but price and RVOL show institutional selling."
    },
    "volatility_target": {
      "expected_1_sigma_move": true,
      "risk_band_upper": 274.50,
      "risk_band_lower": 268.10
    }
  }
}
```

**Frontend Refactoring Directives for Codex:**
* **Replace the R² block:** Where the UI currently shows `R² = 0.950`, replace it with a badge showing the `evr_engine.active_regime` (e.g., a yellow badge for MEAN REVERSION, red for MACRO SHOCK).
* **Replace the "Price-Sentiment Gap" text:** Change "↓ Price $1.62 below sentiment signal" to a bolder alert: **"Divergence Magnitude: Extreme ($1.62 Gap)"**.
* **Replace "ML Forecast (Next Hour)":** Change this from a specific price prediction (e.g., `-0.08% -> $269.84`) to a **Directional Conviction & Volatility Target** (e.g., `Institutional Signal: DISTRIBUTION`).
```

---

### How to execute this with Codex:

1. **First Prompt (The Backend):**
   > "Read `@CODEX_MOE_AND_UI.md`. Execute PART 1. Create the `gatingAgent.js` file exactly as specified. This will act as our central router before we process any ML predictions."

2. **Second Prompt (The API Payload):**
   > "Now look at PART 2 of `@CODEX_MOE_AND_UI.md`. Update our backend API endpoint that serves the frontend. It needs to format the final output to match the `Target JSON Payload Structure` perfectly, stripping out all the old R² and Time-to-close metrics."

3. **Third Prompt (The Frontend):**
   > "Look at the frontend components that render the stock cards. Using the new JSON payload structure from PART 2, update the React code. Remove the old ML Forecast and R² displays, and replace them with the `Active Regime` badge, the `Institutional Signal`, and the `Divergence Magnitude`."
