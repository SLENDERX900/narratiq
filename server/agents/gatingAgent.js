export const GatingAgent = {
  /**
   * Evaluates market conditions to determine the Active Regime.
   * @param {number} vix - Current CBOE Volatility Index
   * @param {number} rvol - Relative Volume (Current Vol / 10-day SMA Vol)
   * @returns {string} The active regime identifier.
   */
  determineRegime(vix, rvol) {
    if (vix > 25) {
      return 'MACRO_SHOCK' // High volatility overrides everything
    }
    if (rvol > 1.5) {
      return 'MOMENTUM' // High participation, trust the trend
    }
    if (rvol < 0.8) {
      return 'MEAN_REVERSION' // Low participation, fade the extremes
    }
    return 'NORMAL' // Standard operating environment
  },

  /**
   * Routes the payload to the appropriate logic/model weighting based on regime.
   */
  routePayload(ticker, vix, rvol, sentimentScore, quantData) {
    const regime = this.determineRegime(vix, rvol)
    let signalWeighting = {}

    switch (regime) {
      case 'MACRO_SHOCK':
        signalWeighting = { macro: 0.9, sentiment: 0.05, tape: 0.05 }
        break
      case 'MOMENTUM':
        signalWeighting = { macro: 0.1, sentiment: 0.4, tape: 0.5 }
        break
      case 'MEAN_REVERSION':
        // In mean reversion, extreme sentiment is faded (contrarian)
        signalWeighting = { macro: 0.2, sentiment: -0.3, tape: 0.8 }
        break
      default:
        signalWeighting = { macro: 0.2, sentiment: 0.3, tape: 0.5 }
    }

    return { regime, signalWeighting }
  }
}
