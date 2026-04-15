/**
 * Market Session Engine
 *
 * Reads constraints from spec.md and rules.md to determine:
 *   - Which session a ticker is in right now (pre/regular/post/closed)
 *   - Session features for the ML model (session_type, time_to_close, is_overlap, etc.)
 *   - Whether the model should produce a forecast or wait
 *   - Active rule violations (from rules.md)
 *
 * All time math is done in UTC. Display times are in the exchange's local zone
 * plus MYT (UTC+8) for the Malaysian user.
 */

// Exchange definitions — UTC offsets and session windows in UTC minutes since midnight
// DST is handled by checking current US offset dynamically
const EXCHANGES = {
  NYSE: {
    label: 'NYSE / NASDAQ',
    timezone: 'America/New_York',
    display_tz: 'US/Eastern',
    isDST: () => isUSDST(),
    sessions: () => {
      const offset = isUSDST() ? 4 : 5  // hours behind UTC
      return {
        pre:  { open: (4  + offset) * 60, close: (9  + offset) * 60 + 30 },
        regular: { open: (9  + offset) * 60 + 30, close: (16 + offset) * 60 },
        post: { open: (16 + offset) * 60, close: (20 + offset) * 60 },
      }
    },
    lunch: null,
  },
  LSE: {
    label: 'London Stock Exchange',
    timezone: 'Europe/London',
    display_tz: 'Europe/London',
    isDST: () => isUKDST(),
    sessions: () => {
      const offset = isUKDST() ? -1 : 0  // ahead of UTC in summer
      return {
        pre:  { open: (5  + offset) * 60 + 5,  close: (7  + offset) * 60 + 50 },
        regular: { open: (8  + offset) * 60,    close: (16 + offset) * 60 + 30 },
        post: { open: (16 + offset) * 60 + 40,  close: (17 + offset) * 60 + 15 },
      }
    },
    lunch: null,
  },
  BURSA: {
    label: 'Bursa Malaysia',
    timezone: 'Asia/Kuala_Lumpur',
    display_tz: 'Asia/Kuala_Lumpur',
    isDST: () => false,
    sessions: () => {
      const offset = -8  // UTC+8 → subtract 8 to get UTC
      return {
        pre:  { open: (8  + offset) * 60 + 30, close: (9  + offset) * 60 },
        regular: { open: (9  + offset) * 60,   close: (17 + offset) * 60 },
        post: { open: (17 + offset) * 60,       close: (17 + offset) * 60 + 30 },
      }
    },
    lunch: { open: (12 - 8) * 60 + 30, close: (14 - 8) * 60 + 30 },  // UTC
  },
  TSE: {
    label: 'Tokyo Stock Exchange',
    timezone: 'Asia/Tokyo',
    display_tz: 'Asia/Tokyo',
    isDST: () => false,
    sessions: () => {
      const offset = -9
      return {
        pre:  { open: (8  + offset) * 60, close: (9  + offset) * 60 },
        regular: { open: (9  + offset) * 60, close: (15 + offset) * 60 + 30 },
        post: { open: (15 + offset) * 60 + 30, close: (16 + offset) * 60 },
      }
    },
    lunch: { open: (11 - 9) * 60 + 30, close: (12 - 9) * 60 + 30 },
  },
  HKEX: {
    label: 'Hong Kong Exchange',
    timezone: 'Asia/Hong_Kong',
    display_tz: 'Asia/Hong_Kong',
    isDST: () => false,
    sessions: () => {
      const offset = -8
      return {
        pre:  { open: (9  + offset) * 60, close: (9  + offset) * 60 + 30 },
        regular: { open: (9  + offset) * 60 + 30, close: (16 + offset) * 60 },
        post: { open: (16 + offset) * 60, close: (16 + offset) * 60 + 10 },
      }
    },
    lunch: { open: (12 - 8) * 60, close: (13 - 8) * 60 },
  },
}

// US DST: starts 2nd Sunday March, ends 1st Sunday November
function isUSDST(now = new Date()) {
  const y = now.getUTCFullYear()
  const start = getNthSundayOfMonth(y, 2, 2)  // March 2nd Sunday
  const end   = getNthSundayOfMonth(y, 10, 1) // November 1st Sunday
  return now >= start && now < end
}

// UK DST: starts last Sunday March, ends last Sunday October
function isUKDST(now = new Date()) {
  const y = now.getUTCFullYear()
  const start = getLastSundayOfMonth(y, 2)   // March last Sunday
  const end   = getLastSundayOfMonth(y, 9)   // October last Sunday
  return now >= start && now < end
}

function getNthSundayOfMonth(year, month, n) {
  const d = new Date(Date.UTC(year, month, 1))
  const firstSunday = (7 - d.getUTCDay()) % 7
  return new Date(Date.UTC(year, month, 1 + firstSunday + (n - 1) * 7, 2))
}

function getLastSundayOfMonth(year, month) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0))
  const dayOfWeek = lastDay.getUTCDay()
  return new Date(Date.UTC(year, month, lastDay.getUTCDate() - dayOfWeek, 1))
}

// Map ticker prefixes/exchanges to exchange key
export function detectExchange(ticker) {
  // Common US stocks default to NYSE
  // Could be expanded with a lookup table
  const asianTickers = { KL: 'BURSA', '.KL': 'BURSA', '.T': 'TSE', '.HK': 'HKEX' }
  for (const [suffix, ex] of Object.entries(asianTickers)) {
    if (ticker.endsWith(suffix)) return ex
  }
  return 'NYSE'  // default
}

// Get current UTC minute-of-day
function utcMinuteOfDay(now = new Date()) {
  return now.getUTCHours() * 60 + now.getUTCMinutes()
}

// Is it a weekday (Monday–Friday) in UTC
function isWeekday(now = new Date()) {
  const day = now.getUTCDay()
  return day >= 1 && day <= 5
}

/**
 * Main session analysis function.
 * Returns full session context for a given ticker.
 */
export function getSessionContext(ticker, now = new Date()) {
  const exchangeKey = detectExchange(ticker)
  const exchange = EXCHANGES[exchangeKey]
  const sessions = exchange.sessions()
  const min = utcMinuteOfDay(now)
  const weekday = isWeekday(now)

  // Session type: 0=closed, 1=pre, 2=regular, 3=post
  let sessionType = 0
  let sessionLabel = 'Closed'
  let timeToClose = null
  let timeSinceOpen = null
  let isLunchBreak = false

  if (weekday) {
    // Check lunch break first (Asian exchanges)
    if (exchange.lunch && min >= exchange.lunch.open && min < exchange.lunch.close) {
      isLunchBreak = true
      sessionLabel = 'Lunch Break'
      sessionType = 0
    } else if (min >= sessions.pre.open && min < sessions.pre.close) {
      sessionType = 1
      sessionLabel = 'Pre-Market'
      timeToClose = sessions.pre.close - min
      timeSinceOpen = min - sessions.pre.open
    } else if (min >= sessions.regular.open && min < sessions.regular.close) {
      sessionType = 2
      sessionLabel = 'Regular Session'
      timeToClose = sessions.regular.close - min
      timeSinceOpen = min - sessions.regular.open
    } else if (min >= sessions.post.open && min < sessions.post.close) {
      sessionType = 3
      sessionLabel = 'Post-Market'
      timeToClose = sessions.post.close - min
      timeSinceOpen = min - sessions.post.open
    }
  }

  // Market overlap: US + London (13:30–16:00 UTC)
  const usSessions = EXCHANGES.NYSE.sessions()
  const lseSessions = EXCHANGES.LSE.sessions()
  const usOpen = weekday && min >= usSessions.pre.open && min < usSessions.regular.close
  const lseOpen = weekday && min >= lseSessions.regular.open && min < lseSessions.regular.close
  const isOverlap = usOpen && lseOpen

  // Weekend gap detection
  const dayOfWeek = now.getUTCDay()
  const isMondayOpen = dayOfWeek === 1 && sessionType === 2 && (timeSinceOpen ?? 0) < 30
  const weekendGapHrs = dayOfWeek === 1
    ? (now.getUTCHours() + (now.getUTCDay() === 1 ? 48 : 0))
    : 0

  // Active forecast window for US (MYT 16:00–21:00 = UTC 08:00–13:00)
  const isPreForecastWindow = exchangeKey === 'NYSE'
    && min >= 8 * 60 && min < 13 * 60  // 08:00–13:00 UTC
    && weekday

  // Convert current time to MYT for display
  const myt = new Date(now.getTime() + 8 * 3600 * 1000)
  const mytStr = `${String(myt.getUTCHours()).padStart(2,'0')}:${String(myt.getUTCMinutes()).padStart(2,'0')} MYT`

  return {
    exchange: exchangeKey,
    exchangeLabel: exchange.label,
    sessionType,
    sessionLabel,
    isMarketOpen: sessionType === 2,
    isPreMarket: sessionType === 1,
    isPostMarket: sessionType === 3,
    isLunchBreak,
    isOverlap,
    isMondayOpen,
    weekendGapHrs,
    isPreForecastWindow,
    timeToCloseMin: timeToClose,
    timeSinceOpenMin: timeSinceOpen,
    currentMYT: mytStr,
    timezone: exchange.timezone,
  }
}

/**
 * Apply rules.md constraints to determine if a forecast should be generated.
 * Returns { shouldForecast, flags, confidenceAdjustment }
 */
export function applyRules(sessionCtx, macroSignals, socialSpike = false) {
  const flags = []
  let confidenceAdj = 0
  let shouldForecast = true

  // RULE-001: Market closed block
  if (sessionCtx.sessionType === 0 && !sessionCtx.isLunchBreak && !sessionCtx.isPreMarket) {
    if (!sessionCtx.isPreForecastWindow) {
      shouldForecast = false
      flags.push({ rule: 'RULE-001', label: 'Market closed', severity: 'info' })
    }
  }

  // RULE-002: Lunch break
  if (sessionCtx.isLunchBreak) {
    flags.push({ rule: 'RULE-002', label: 'Lunch break — using last forecast', severity: 'info' })
  }

  // RULE-005: Opening bell caution
  if (sessionCtx.isMarketOpen && (sessionCtx.timeSinceOpenMin ?? 99) < 30) {
    confidenceAdj -= 15
    flags.push({ rule: 'RULE-005', label: 'Opening 30min — high volatility', severity: 'warning' })
  }

  // RULE-006: Closing bell caution
  if (sessionCtx.isMarketOpen && (sessionCtx.timeToCloseMin ?? 99) < 30) {
    confidenceAdj -= 10
    flags.push({ rule: 'RULE-006', label: 'Closing 30min — momentum surge possible', severity: 'warning' })
  }

  // RULE-007: Panic spike
  if (socialSpike) {
    confidenceAdj -= 30
    flags.push({ rule: 'RULE-007', label: 'Social panic detected — contrarian signal active', severity: 'danger' })
  }

  // RULE-011: Risk-off dampener
  if (macroSignals?.vix > 25 || macroSignals?.yield_spread < 0) {
    confidenceAdj -= 5
    flags.push({ rule: 'RULE-011', label: 'Risk-off macro regime', severity: 'warning' })
  }

  // RULE-013: Yield curve inversion
  if (macroSignals?.yield_spread < 0) {
    confidenceAdj -= 5
    flags.push({ rule: 'RULE-013', label: 'Inverted yield curve — recession signal', severity: 'warning' })
  }

  // RULE-014: 2026 election season
  const now = new Date()
  if (now.getUTCFullYear() === 2026 && now.getUTCMonth() >= 8) {
    confidenceAdj -= 8
    flags.push({ rule: 'RULE-014', label: 'US Midterm election season — policy uncertainty', severity: 'info' })
  }

  // RULE-015: Monday gap
  if (sessionCtx.isMondayOpen) {
    confidenceAdj -= 12
    flags.push({ rule: 'RULE-015', label: 'Monday gap — weekend news digesting', severity: 'warning' })
  }

  // RULE-017: Pre-forecast window active
  if (sessionCtx.isPreForecastWindow) {
    flags.push({ rule: 'RULE-017', label: 'Pre-market forecast window active', severity: 'success' })
  }

  return { shouldForecast, flags, confidenceAdj: Math.max(-50, confidenceAdj) }
}

/**
 * Compute blended sentiment using skills.md layering formula.
 * Applies asymmetric weighting, decay, and contrarian logic.
 */
export function blendSentiment(newsSentiment, redditSentiment, trustNews, trustReddit, macroFear) {
  const rationalWeight  = 0.6
  const irrationalWeight = 0.4

  // Asymmetric amplification: negative sentiment has 1.4x impact (research-backed)
  const asymmetricFactor = redditSentiment < 0 ? 1.4 : 1.0

  // Contrarian flip at extremes (RULE-010 / skills.md CONTRARIAN_EXTREME)
  let effectiveReddit = redditSentiment
  if (Math.abs(redditSentiment) > 0.85) {
    effectiveReddit = -redditSentiment * 0.7  // flip and dampen
  }

  // Trust-weighted blend
  const tN = trustNews  ?? 0.5
  const tR = trustReddit ?? 0.5
  const blended = (newsSentiment * rationalWeight * tN)
                + (effectiveReddit * irrationalWeight * asymmetricFactor * tR)

  // Conviction: how aligned are sources? (0..1)
  const divergence = Math.abs(newsSentiment - redditSentiment)
  const conviction = Math.max(0, 1 - divergence)

  // Macro fear dampener (RULE-011)
  const fearScale = macroFear > 0.5 ? 0.7 : macroFear > 0.3 ? 0.85 : 1.0

  return {
    blended: parseFloat((blended * fearScale).toFixed(4)),
    conviction: parseFloat(conviction.toFixed(3)),
    divergence: parseFloat(divergence.toFixed(3)),
    wasContrarian: Math.abs(redditSentiment) > 0.85,
    fearScale,
  }
}

export { EXCHANGES }
