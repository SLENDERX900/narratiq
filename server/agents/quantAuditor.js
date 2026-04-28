function toNumber(value, fieldName) {
  const num = Number(value)

  if (!Number.isFinite(num)) {
    throw new Error(`Invalid numeric value for ${fieldName}`)
  }

  return num
}

function normalizeCandle(candle, index) {
  const open = candle.open ?? candle.o
  const high = candle.high ?? candle.h
  const low = candle.low ?? candle.l
  const close = candle.close ?? candle.c
  const volume = candle.volume ?? candle.v

  return {
    open: toNumber(open, `open at index ${index}`),
    high: toNumber(high, `high at index ${index}`),
    low: toNumber(low, `low at index ${index}`),
    close: toNumber(close, `close at index ${index}`),
    volume: toNumber(volume, `volume at index ${index}`),
  }
}

function normalizeHistory(ohlcvHistory) {
  if (!Array.isArray(ohlcvHistory) || ohlcvHistory.length < 2) {
    throw new Error('OHLCV history must contain at least 2 candles')
  }

  return ohlcvHistory.map(normalizeCandle)
}

function calculateTrueRange(currentCandle, previousClose) {
  const intradayRange = currentCandle.high - currentCandle.low
  const gapUpRange = Math.abs(currentCandle.high - previousClose)
  const gapDownRange = Math.abs(currentCandle.low - previousClose)

  return Math.max(intradayRange, gapUpRange, gapDownRange)
}

function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) {
    throw new Error(`ATR(${period}) requires at least ${period + 1} candles`)
  }

  const trueRanges = []

  for (let i = 1; i < candles.length; i += 1) {
    trueRanges.push(calculateTrueRange(candles[i], candles[i - 1].close))
  }

  const recentTrueRanges = trueRanges.slice(-period)
  const atr = recentTrueRanges.reduce((sum, value) => sum + value, 0) / period

  return atr
}

function calculateRVOL(candles, averagePeriod = 10) {
  if (candles.length < averagePeriod) {
    throw new Error(`RVOL requires at least ${averagePeriod} candles`)
  }

  const currentVolume = candles[candles.length - 1].volume
  const trailingVolumes = candles
    .slice(-(averagePeriod + 1), -1)
    .map((candle) => candle.volume)

  if (trailingVolumes.length < averagePeriod) {
    throw new Error(`RVOL requires ${averagePeriod} prior candles plus the current candle`)
  }

  const averageVolume = trailingVolumes.reduce((sum, value) => sum + value, 0) / averagePeriod

  if (averageVolume === 0) {
    return 0
  }

  return currentVolume / averageVolume
}

function calculatePriceChangePct(candles) {
  const previousClose = candles[candles.length - 2].close
  const currentClose = candles[candles.length - 1].close

  if (previousClose === 0) {
    return 0
  }

  return ((currentClose - previousClose) / previousClose) * 100
}

function getVolatilityStatus(atr, latestClose) {
  if (latestClose <= 0) {
    return 'unknown'
  }

  const atrPct = (atr / latestClose) * 100

  if (atrPct >= 5) {
    return 'high'
  }

  if (atrPct >= 2) {
    return 'medium'
  }

  return 'low'
}

function round(value, decimals = 4) {
  return Number(value.toFixed(decimals))
}

export function runQuantAuditor(ohlcvHistory) {
  const candles = normalizeHistory(ohlcvHistory)
  const atr = calculateATR(candles, 14)
  const rvol = calculateRVOL(candles, 10)
  const priceChangePct = calculatePriceChangePct(candles)
  const latestClose = candles[candles.length - 1].close

  return {
    price_change_pct: round(priceChangePct, 4),
    rvol: round(rvol, 4),
    volatility_status: getVolatilityStatus(atr, latestClose),
  }
}

export {
  calculateATR,
  calculateRVOL,
}

