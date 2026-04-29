# MODEL_TRAINING_REVAMP.md: The Institutional "MoE" Engine
**Objective:** Transition the ML forecasting model from "Absolute Price Prediction" to a "Regime-Aware Mixture of Experts (MoE)" predicting Divergence Resolution and Volatility.

---

## 1. FEATURE ENGINEERING (Prune & Replace)
The current feature set contains leaky and static variables. Codex must update the data preparation pipeline.

* **DELETE "Toxic" Features:** * Remove `Time to close` (causes artificial R² inflation).
    * Remove raw `Time of day`.
* **ADD "Institutional" Features (The Tape):**
    * `RVOL` (Relative Volume): Current Volume / 10-period SMA Volume.
    * `ATR_Ratio`: Current candle range / 14-period ATR.
    * `VIX_State`: Macro volatility flag (Low < 15, Medium 15-25, High > 25).
* **MODIFY "Sentiment" Features:**
    * Convert static "Sentiment Score" to `Sentiment_Divergence` (Sentiment Score delta minus Price delta).
    * Apply dynamic source weighting: Institutional 13G/8K filings = 5x weight; Retail Social Media = 1x weight.

---

## 2. THE TARGET VARIABLE SHIFT (What we predict)
Stop training the model to predict `Price Next Hour`. Markets are random walks on short timeframes. Update the loss function and targets:

* **Target A: Divergence Resolution (Classification)**
    * When `Price-Sentiment Gap` exists, predict: `1` (Price catches up to Sentiment) or `0` (Sentiment was a trap; Price reverses).
* **Target B: Volatility Expansion (Regression/Classification)**
    * Predict if the next move will exceed $1\sigma$ (1 Standard Deviation / ATR). 
    * *Logic:* We don't care *where* it goes if it barely moves. We only trade expansions.

---

## 3. REGIME-AWARE ARCHITECTURE (Mixture of Experts)
Do not use a single monolithic model. Instruct the ML pipeline to build a "Gating Network" with 3 Sub-Models (Experts).

### The Gating Agent (The Router)
* **Logic:** Evaluates `RVOL` and `VIX`. Routes the input to the correct Expert.

### Expert 1: The Momentum Model (Trend)
* **Trigger:** `RVOL > 1.5` (High Volume).
* **Behavior:** Trusts sentiment more. Expects price to follow the narrative.

### Expert 2: The Mean Reversion Model (Sideways)
* **Trigger:** `RVOL < 1.0` and normal `VIX`.
* **Behavior:** Heavily fades extreme sentiment. Treats retail hype as a counter-indicator.

### Expert 3: The Macro/Panic Model (Shock)
* **Trigger:** `VIX > 25` or sudden macro data drops (e.g., CPI/Fed days).
* **Behavior:** Ignores stock-specific sentiment entirely. Weights macro correlations at 90%.

---

## 4. UI & METRICS REFACTORING (The Output)
Update the frontend payload logic to remove misleading retail metrics.

* **Remove:** `R² Model Quality` (Misleading for financial time series).
* **Add:** `Expected Error (RMSE)` or `95% Confidence Interval Band`.
* **Rename:** Change "Price $X below sentiment" to **"Divergence Magnitude."**
* **Add UI Flag:** Display the Active Regime (e.g., "🟢 Regime: Momentum" or "🟡 Regime: Mean Reverting").