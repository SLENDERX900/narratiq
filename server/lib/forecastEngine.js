/**
 * OLS (Ordinary Least Squares) Forecast Engine
 *
 * Fits a linear regression: price_change = β₀ + β₁·sentiment + β₂·buzz + ε
 * This is the econometrics foundation — same mathematics as academic
 * stock-sentiment regression papers (Tetlock 2007, Baker & Wurgler 2006).
 *
 * Output: coefficients, R², confidence intervals, and a price forecast.
 * The model retrains every hourly pipeline run as new data arrives —
 * it machine-learns by fitting to an expanding window of real observations.
 */

/**
 * Fit OLS using normal equations: β = (XᵀX)⁻¹Xᵀy
 * Works for 1 or 2 predictors. Returns null if insufficient data.
 */
function fitOLS(observations) {
  // observations: [{ x1: sentiment, x2: buzz_norm, y: change_pct }, ...]
  const n = observations.length
  if (n < 4) return null  // need at least 4 points for meaningful regression

  // Build design matrix X (with intercept column) and y vector
  // X columns: [1, sentiment, buzz_norm]
  const hasX2 = observations.every(o => o.x2 != null)

  let sumX1 = 0, sumX2 = 0, sumY = 0
  let sumX1X1 = 0, sumX1X2 = 0, sumX2X2 = 0
  let sumX1Y = 0, sumX2Y = 0

  for (const o of observations) {
    const x1 = o.x1, x2 = hasX2 ? o.x2 : 0, y = o.y
    sumX1 += x1; sumX2 += x2; sumY += y
    sumX1X1 += x1 * x1; sumX1X2 += x1 * x2; sumX2X2 += x2 * x2
    sumX1Y += x1 * y; sumX2Y += x2 * y
  }

  const meanY = sumY / n
  const meanX1 = sumX1 / n
  const meanX2 = sumX2 / n

  let beta1, beta2, beta0

  if (hasX2) {
    // 2-variable OLS via normal equations
    // [β₁]   [Σ(x1-x̄1)²    Σ(x1-x̄1)(x2-x̄2)]⁻¹  [Σ(x1-x̄1)(y-ȳ)]
    // [β₂] = [Σ(x1-x̄1)(x2-x̄2)  Σ(x2-x̄2)²   ]    [Σ(x2-x̄2)(y-ȳ)]
    let Sxx = 0, Sxz = 0, Szz = 0, Sxy = 0, Szy = 0
    for (const o of observations) {
      const dx = o.x1 - meanX1, dz = o.x2 - meanX2, dy = o.y - meanY
      Sxx += dx*dx; Sxz += dx*dz; Szz += dz*dz; Sxy += dx*dy; Szy += dz*dy
    }
    const det = Sxx*Szz - Sxz*Sxz
    if (Math.abs(det) < 1e-10) {
      // Multicollinearity — fall back to simple regression
      beta1 = Sxy / (Sxx || 1e-10)
      beta2 = 0
    } else {
      beta1 = (Szz*Sxy - Sxz*Szy) / det
      beta2 = (Sxx*Szy - Sxz*Sxy) / det
    }
    beta0 = meanY - beta1*meanX1 - beta2*meanX2
  } else {
    // Simple OLS
    let Sxx = 0, Sxy = 0
    for (const o of observations) {
      const dx = o.x1 - meanX1, dy = o.y - meanY
      Sxx += dx*dx; Sxy += dx*dy
    }
    beta1 = Sxy / (Sxx || 1e-10)
    beta2 = 0
    beta0 = meanY - beta1*meanX1
  }

  // Compute R² and standard error
  let ssTot = 0, ssRes = 0
  for (const o of observations) {
    const yHat = beta0 + beta1*o.x1 + (hasX2 ? beta2*o.x2 : 0)
    const dy = o.y - meanY
    ssTot += dy*dy
    ssRes += (o.y - yHat) ** 2
  }

  const rSquared = ssTot < 1e-10 ? 0 : Math.max(0, 1 - ssRes/ssTot)
  // Standard error of estimate (residual std dev)
  const k = hasX2 ? 3 : 2  // parameters
  const stdError = n > k ? Math.sqrt(ssRes / (n - k)) : null

  return { beta0, beta1, beta2: hasX2 ? beta2 : 0, rSquared, stdError, n }
}

/**
 * Main forecast function.
 * @param {Array} historicalRows - rows from stock_insights (last N hours)
 * @param {number} currentSentiment - today's AI sentiment score (-1..1)
 * @param {number} currentPrice - today's price
 * @param {number} currentBuzz - today's buzz score (0..100)
 * @returns Forecast object with predicted price, CI, model stats
 */
export function computeForecast(historicalRows, currentSentiment, currentPrice, currentBuzz) {
  if (!historicalRows || historicalRows.length < 4) {
    return {
      predicted_change: null,
      lower_bound: null,
      upper_bound: null,
      forecast_price: null,
      beta_0: null,
      beta_1: null,
      beta_2: null,
      r_squared: null,
      std_error: null,
      n_observations: historicalRows?.length || 0,
      insufficient_data: true,
    }
  }

  // Build observations: use consecutive rows so y = next_row.change_pct
  // (sentiment at time t predicts price change at time t+1)
  const observations = []
  for (let i = 0; i < historicalRows.length - 1; i++) {
    const row = historicalRows[i]
    const nextRow = historicalRows[i + 1]
    if (row.sentiment_score == null || nextRow.change_pct == null) continue
    observations.push({
      x1: parseFloat(row.sentiment_score) || 0,
      x2: parseFloat(row.social?.buzz_score || 0) / 100,  // normalise 0..1
      y:  parseFloat(nextRow.change_pct) || 0,
    })
  }

  const model = fitOLS(observations)
  if (!model) {
    return { predicted_change: null, forecast_price: null, r_squared: null,
             n_observations: observations.length, insufficient_data: true }
  }

  const buzzNorm = (currentBuzz || 0) / 100
  const predicted_change = model.beta0 + model.beta1 * currentSentiment + model.beta2 * buzzNorm

  // 95% confidence interval: ±1.96 * std_error (approximate, not exact t-interval)
  const halfWidth = model.stdError ? 1.96 * model.stdError : Math.abs(predicted_change) * 0.5
  const lower_bound = predicted_change - halfWidth
  const upper_bound = predicted_change + halfWidth

  const forecast_price = currentPrice
    ? currentPrice * (1 + predicted_change / 100)
    : null

  return {
    beta_0: parseFloat(model.beta0.toFixed(6)),
    beta_1: parseFloat(model.beta1.toFixed(6)),
    beta_2: parseFloat(model.beta2.toFixed(6)),
    r_squared: parseFloat(model.rSquared.toFixed(4)),
    std_error: model.stdError ? parseFloat(model.stdError.toFixed(4)) : null,
    n_observations: model.n,
    current_sentiment: currentSentiment,
    predicted_change: parseFloat(predicted_change.toFixed(4)),
    lower_bound: parseFloat(lower_bound.toFixed(4)),
    upper_bound: parseFloat(upper_bound.toFixed(4)),
    forecast_price: forecast_price ? parseFloat(forecast_price.toFixed(2)) : null,
    insufficient_data: false,
  }
}

/**
 * Compute accuracy of the previous forecast vs what actually happened.
 * Returns the forecast_error and accuracy_pct.
 */
export function computeAccuracy(previousPredicted, actualChange) {
  if (previousPredicted == null || actualChange == null) return {}
  const error = actualChange - previousPredicted
  const accuracy = Math.abs(actualChange) > 0.01
    ? Math.max(0, (1 - Math.abs(error) / Math.abs(actualChange)) * 100)
    : 100 - Math.abs(error) * 10  // when actual change ~0, small error is good
  return {
    forecast_error: parseFloat(error.toFixed(4)),
    accuracy_pct: parseFloat(Math.min(100, Math.max(0, accuracy)).toFixed(1)),
  }
}

/**
 * Build regression scatter data for charting.
 * Returns [{sentiment, actual_change, predicted_change}] for all historical points.
 */
export function buildRegressionScatter(historicalRows, model) {
  if (!model || !historicalRows) return []
  const points = []
  for (let i = 0; i < historicalRows.length - 1; i++) {
    const row = historicalRows[i]
    const nextRow = historicalRows[i + 1]
    if (row.sentiment_score == null || nextRow.change_pct == null) continue
    const sentiment = parseFloat(row.sentiment_score) || 0
    const buzz = parseFloat(row.social?.buzz_score || 0) / 100
    const predicted = model.beta_0 + model.beta_1 * sentiment + model.beta_2 * buzz
    points.push({
      time: row.generated_at,
      price: parseFloat(nextRow.price),
      sentiment,
      actual_change: parseFloat(nextRow.change_pct),
      predicted_change: parseFloat(predicted.toFixed(4)),
    })
  }
  return points
}
