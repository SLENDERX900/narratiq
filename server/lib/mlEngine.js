/**
 * Regime-routed Random Forest classifier stack — upgraded with session + sentiment layering features
 *
 * Now reads constraints from spec.md / rules.md / skills.md via:
 *   - marketSession.js for session features
 *   - blendSentiment() for rational/irrational weighting
 *   - applyRules() for confidence adjustments
 *
 * Features (13 signals):
 *   0  sentiment_blended  — trust-weighted blend of news + reddit
 *   1  sentiment_news     — institutional/rational sentiment
 *   2  sentiment_reddit   — retail/irrational (contrarian at extremes)
 *   3  momentum           — previous hour price change %
 *   4  volatility         — rolling std of last 3 changes
 *   5  sent_delta         — rate of sentiment change
 *   6  conviction         — news/reddit alignment score
 *   7  vix_norm           — macro fear (CBOE VIX normalised 0..1)
 *   8  yield_spread       — 10yr-2yr (negative = risk-off)
 *   9  session_type       — 0=closed 1=pre 2=regular 3=post
 *   10 is_overlap         — 0/1: two markets open simultaneously
 *   11 rvol               — current volume / trailing 10-candle average volume
 *   12 atr_ratio          — current candle range / trailing 14-candle ATR
 */

import { getSessionContext, applyRules, blendSentiment } from './marketSession.js'
import { calculateATR, calculateRVOL } from '../agents/quantAuditor.js'
import { GatingAgent } from '../agents/gatingAgent.js'

const FEATURE_NAMES = [
  'sentiment_blended','sentiment_news','sentiment_reddit',
  'momentum','volatility','sent_delta','conviction',
  'vix_norm','yield_spread',
  'session_type','is_overlap','rvol','atr_ratio',
]

const FEATURE_INDEX = {
  vix_norm: 7,
  rvol: 11,
}

const REGIMES = {
  MOMENTUM: 'MOMENTUM',
  MEAN_REVERSION: 'MEAN_REVERSION',
  MACRO_PANIC: 'MACRO_SHOCK',
  BLENDED: 'NORMAL',
}

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return []

  return candles.flatMap((candle) => {
    const open = toFiniteNumber(candle?.open ?? candle?.o)
    const high = toFiniteNumber(candle?.high ?? candle?.h)
    const low = toFiniteNumber(candle?.low ?? candle?.l)
    const close = toFiniteNumber(candle?.close ?? candle?.c)
    const volume = toFiniteNumber(candle?.volume ?? candle?.v)

    if ([open, high, low, close, volume].some((value) => value == null)) {
      return []
    }

    return [{ open, high, low, close, volume }]
  })
}

function calculateTapeFeatures(candles) {
  const normalizedCandles = normalizeCandles(candles)
  const currentCandle = normalizedCandles[normalizedCandles.length - 1]

  if (!currentCandle) {
    return { rvol: 0, atrRatio: 0, atr: 0 }
  }

  const currentRange = currentCandle.high - currentCandle.low

  let atr = 0
  let rvol = 0

  try {
    atr = calculateATR(normalizedCandles, 14)
  } catch {}

  try {
    rvol = calculateRVOL(normalizedCandles, 10)
  } catch {}

  const atrRatio = atr > 0 ? currentRange / atr : 0

  return {
    rvol: parseFloat(rvol.toFixed(4)),
    atrRatio: parseFloat(atrRatio.toFixed(4)),
    atr: parseFloat(atr.toFixed(4)),
  }
}

function clampProbability(value) {
  if (!Number.isFinite(value)) return 0.5
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function mean(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function giniImpurity(labels) {
  if (!labels.length) return 0
  const positiveRate = mean(labels)
  return 1 - positiveRate ** 2 - (1 - positiveRate) ** 2
}

function sampleWithoutReplacement(items, sampleSize) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, Math.max(1, Math.min(sampleSize, copy.length)))
}

function fitTreeNode(rows, depth, maxDepth, featureSubsetSize, featureGainMap) {
  const labels = rows.map(row => row.label)
  const prediction = clampProbability(mean(labels))
  const positives = labels.reduce((sum, value) => sum + value, 0)
  const negatives = labels.length - positives

  if (
    depth >= maxDepth ||
    rows.length < 3 ||
    positives === 0 ||
    negatives === 0
  ) {
    return {
      type: 'leaf',
      probability: prediction,
      sampleCount: rows.length,
    }
  }

  const featureIndices = sampleWithoutReplacement(
    FEATURE_NAMES.map((_, index) => index),
    featureSubsetSize,
  )
  const parentGini = giniImpurity(labels)
  let bestSplit = null

  for (const featureIndex of featureIndices) {
    const sortedValues = [...new Set(rows.map(row => row.features[featureIndex]))].sort((a, b) => a - b)
    for (let i = 0; i < sortedValues.length - 1; i += 1) {
      const threshold = (sortedValues[i] + sortedValues[i + 1]) / 2
      const leftRows = []
      const rightRows = []

      for (const row of rows) {
        if (row.features[featureIndex] <= threshold) leftRows.push(row)
        else rightRows.push(row)
      }

      if (!leftRows.length || !rightRows.length) continue

      const weightedGini =
        (leftRows.length / rows.length) * giniImpurity(leftRows.map(row => row.label)) +
        (rightRows.length / rows.length) * giniImpurity(rightRows.map(row => row.label))
      const gain = parentGini - weightedGini

      if (!bestSplit || gain > bestSplit.gain) {
        bestSplit = { featureIndex, threshold, gain, leftRows, rightRows }
      }
    }
  }

  if (!bestSplit || bestSplit.gain <= 0) {
    return {
      type: 'leaf',
      probability: prediction,
      sampleCount: rows.length,
    }
  }

  featureGainMap[bestSplit.featureIndex] += bestSplit.gain

  return {
    type: 'node',
    feature: bestSplit.featureIndex,
    threshold: bestSplit.threshold,
    sampleCount: rows.length,
    left: fitTreeNode(bestSplit.leftRows, depth + 1, maxDepth, featureSubsetSize, featureGainMap),
    right: fitTreeNode(bestSplit.rightRows, depth + 1, maxDepth, featureSubsetSize, featureGainMap),
  }
}

function predictTree(tree, featureVector) {
  let node = tree
  while (node && node.type === 'node') {
    node = featureVector[node.feature] <= node.threshold ? node.left : node.right
  }
  return clampProbability(node?.probability ?? 0.5)
}

function getRegimeFromSignals(rvol, vixValue) {
  const regime = GatingAgent.determineRegime(vixValue, rvol)
  return {
    regime,
    label: regime === REGIMES.MACRO_PANIC
      ? 'Macro Shock'
      : regime === REGIMES.MOMENTUM
      ? 'Momentum'
      : regime === REGIMES.MEAN_REVERSION
      ? 'Mean Reversion'
      : 'Normal',
    reason: regime === REGIMES.MACRO_PANIC
      ? `VIX ${Number(vixValue || 0).toFixed(2)} > 25`
      : regime === REGIMES.MOMENTUM
      ? `RVOL ${Number(rvol || 0).toFixed(2)} > 1.5`
      : regime === REGIMES.MEAN_REVERSION
      ? `RVOL ${Number(rvol || 0).toFixed(2)} < 0.8`
      : 'Standard operating environment',
  }
}

export function routeModelByRegime({ rvol, vix }) {
  return getRegimeFromSignals(Number(rvol), Number(vix))
}

function getObservationRegime(observation) {
  const rvol = observation.features?.[FEATURE_INDEX.rvol]
  const vixNorm = observation.features?.[FEATURE_INDEX.vix_norm]
  const vixValue = Number.isFinite(vixNorm) ? vixNorm * 50 : null
  return getRegimeFromSignals(rvol, vixValue)
}

function buildObservation(prev, curr, next, macroSignals, trustScores, recentRows = []) {
  if (!curr || !next || curr.sentiment_score == null || next.change_pct == null) return null

  const vixNorm = macroSignals?.vix ? Math.min(1,macroSignals.vix/50):0
  const yieldSpread = macroSignals?.yield_spread ?? 0
  const tNews   = trustScores?.news?.reliability   ? trustScores.news.reliability/100   : 0.5
  const tReddit = trustScores?.reddit?.reliability ? trustScores.reddit.reliability/100 : 0.5

  const newsSent  = parseFloat(curr.sentiment_score)||0
  const redditRaw = curr.social?.bullish_pct!=null
    ? (parseFloat(curr.social.bullish_pct)-50)/50 : 0

  const { blended, conviction } = blendSentiment(newsSent, redditRaw, tNews, tReddit, vixNorm)
  const momentum = parseFloat(curr.change_pct)||0
  const prevSent = parseFloat(prev?.sentiment_score)||0
  const recent = recentRows.map(r=>parseFloat(r.change_pct)||0)
  const mn = recent.reduce((s,v)=>s+v,0)/(recent.length||1)
  const volatility = Math.sqrt(recent.reduce((s,v)=>s+(v-mn)**2,0)/(recent.length||1))
  const sentDelta = newsSent - prevSent

  const sessCtx = getSessionContext('NYSE', new Date(curr.generated_at))
  const sessionType = sessCtx.sessionType / 3
  const isOverlap = sessCtx.isOverlap ? 1 : 0
  const { rvol, atrRatio, atr } = calculateTapeFeatures(curr.candles)

  const featureVector = [
    blended, newsSent, redditRaw, momentum, volatility, sentDelta,
    conviction, vixNorm, yieldSpread, sessionType, isOverlap, rvol, atrRatio,
  ]

  const normalizedMomentum = Math.max(-1, Math.min(1, momentum / 5))
  const sentimentGap = blended - normalizedMomentum
  const nextChangePct = parseFloat(next.change_pct) || 0
  const gapDirection = Math.sign(sentimentGap)
  const nextDirection = Math.sign(nextChangePct)
  const divergenceLabel = Math.abs(sentimentGap) >= 0.05
    ? (gapDirection !== 0 && nextDirection === gapDirection ? 1 : 0)
    : null

  const currentPrice = parseFloat(curr.price) || 0
  const nextPrice = parseFloat(next.price) || 0
  const nextMoveAbs = currentPrice > 0 && nextPrice > 0
    ? Math.abs(nextPrice - currentPrice)
    : Math.abs((nextChangePct / 100) * currentPrice)
  const atrMoveLabel = atr > 0 ? (nextMoveAbs >= atr ? 1 : 0) : null
  const atrThresholdPct = atr > 0 && currentPrice > 0
    ? parseFloat(((atr / currentPrice) * 100).toFixed(4))
    : null

  return {
    features: featureVector,
    divergenceLabel,
    atrMoveLabel,
    time: next.generated_at,
    price: parseFloat(next.price),
    nextChangePct,
    sentimentGap: parseFloat(sentimentGap.toFixed(4)),
    atrThresholdPct,
  }
}

export function deriveTargetObservation(prev, curr, next, macroSignals, trustScores, recentRows = []) {
  return buildObservation(prev, curr, next, macroSignals, trustScores, recentRows)
}

export function buildFeatures(historicalRows, macroSignals, trustScores) {
  const observations=[]

  for (let i=1;i<historicalRows.length-1;i++) {
    const prev=historicalRows[i-1],curr=historicalRows[i],next=historicalRows[i+1]
    const recentRows = historicalRows.slice(Math.max(0,i-3),i)
    const observation = buildObservation(prev, curr, next, macroSignals, trustScores, recentRows)
    if (observation) observations.push(observation)
  }
  return { observations, featureNames: FEATURE_NAMES }
}

export function trainRandomForest(observations, opts={}) {
  const { n_trees=31, max_depth=3, sample_rate=0.8, feature_ratio=0.5 } = opts
  const n=observations.length
  if (n<4) return null

  const trees=[]
  const trainErrors=[]
  const featureGains=new Array(FEATURE_NAMES.length).fill(0)
  const featureSubsetSize = Math.max(1, Math.round(FEATURE_NAMES.length * feature_ratio))

  for (let t=0; t<n_trees; t++) {
    const sampleSize = Math.max(2, Math.round(n * sample_rate))
    const sample = Array.from({ length: sampleSize }, () => observations[Math.floor(Math.random() * n)])
    const treeGainMap = new Array(FEATURE_NAMES.length).fill(0)
    const tree = fitTreeNode(sample, 0, max_depth, featureSubsetSize, treeGainMap)
    trees.push(tree)

    for (let i = 0; i < FEATURE_NAMES.length; i += 1) {
      featureGains[i] += treeGainMap[i]
    }

    const partialForest = { trees: [...trees] }
    const predictions = observations.map((row) => predictRandomForest(partialForest, row.features))
    const mse = observations.reduce((sum, row, index) => sum + (row.label - predictions[index]) ** 2, 0) / n
    trainErrors.push(parseFloat(Math.sqrt(mse).toFixed(4)))
  }

  const predictions = observations.map((row) => predictRandomForest({ trees }, row.features))
  const ssRes=observations.reduce((sum,row,index)=>sum+(row.label-predictions[index])**2,0)
  const rmse=Math.sqrt(ssRes/n)
  const accuracy=observations.reduce((sum,row,index)=>sum+((predictions[index]>=0.5?1:0)===row.label?1:0),0)/n
  const totalGain=featureGains.reduce((s,v)=>s+v,0)||1

  const LABELS = {
    sentiment_blended:'Blended sentiment',sentiment_news:'News sentiment',
    sentiment_reddit:'Reddit/social',momentum:'Price momentum',
    volatility:'Volatility',sent_delta:'Sentiment shift',
    conviction:'Signal conviction',vix_norm:'Market fear (VIX)',
    yield_spread:'Yield curve',session_type:'Session type',
    is_overlap:'Market overlap',rvol:'Relative volume',atr_ratio:'ATR ratio',
  }

  const featureImportance=FEATURE_NAMES.map((name,i)=>({
    name,
    importance:parseFloat(((featureGains[i]/totalGain)*100).toFixed(1)),
    label:LABELS[name]||name,
  })).sort((a,b)=>b.importance-a.importance)

  return {
    trees,featureImportance,
    accuracy:parseFloat(accuracy.toFixed(4)),rmse:parseFloat(rmse.toFixed(4)),n,
    trainErrors,
    finalPredictions:predictions.map((p,i)=>({
      time:observations[i].time,price:observations[i].price,
      actual:observations[i].label,predicted_probability:parseFloat(p.toFixed(4)),
      predicted_label:p>=0.5?1:0,
    })),
  }
}

export function predictRandomForest(model,featureVector){
  if(!model) return null
  const trees = model.trees || []
  if (!trees.length) return null
  const pred = mean(trees.map((tree) => predictTree(tree, featureVector)))
  return parseFloat(clampProbability(pred).toFixed(4))
}

export function bootstrapCI(model,featureVector,observations,n_boot=30){
  if(!model||observations.length<6) return {lower:null,upper:null,std:null}
  const n=observations.length
  const bootPreds=[]
  for (let b=0;b<n_boot;b++){
    const sample=Array.from({length:n},()=>observations[Math.floor(Math.random()*n)])
    const bm=trainRandomForest(sample,{n_trees:15,max_depth:3,sample_rate:0.8,feature_ratio:0.5})
    if(bm){const p=predictRandomForest(bm,featureVector);if(p!=null)bootPreds.push(p)}
  }
  if(bootPreds.length<10) return {lower:null,upper:null,std:null}
  bootPreds.sort((a,b)=>a-b)
  const mean=bootPreds.reduce((s,v)=>s+v,0)/bootPreds.length
  const std=Math.sqrt(bootPreds.reduce((s,v)=>s+(v-mean)**2,0)/bootPreds.length)
  return {
    lower:parseFloat(bootPreds[Math.floor(0.025*bootPreds.length)].toFixed(4)),
    upper:parseFloat(bootPreds[Math.floor(0.975*bootPreds.length)].toFixed(4)),
    std:parseFloat(std.toFixed(4)),
  }
}

function trainExpertModels(observations, opts = {}) {
  const grouped = {
    [REGIMES.MOMENTUM]: [],
    [REGIMES.MEAN_REVERSION]: [],
    [REGIMES.MACRO_PANIC]: [],
    [REGIMES.BLENDED]: [],
  }

  for (const observation of observations) {
    const { regime } = getObservationRegime(observation)
    grouped[regime].push(observation)
    grouped[REGIMES.BLENDED].push(observation)
  }

  const experts = {}
  for (const [regime, items] of Object.entries(grouped)) {
    const model = items.length >= 4 ? trainRandomForest(items, opts) : null
    experts[regime] = {
      regime,
      label: regime === REGIMES.MOMENTUM ? 'Momentum'
        : regime === REGIMES.MEAN_REVERSION ? 'Mean Reversion'
        : regime === REGIMES.MACRO_PANIC ? 'Macro Shock'
        : 'Normal',
      n_observations: items.length,
      observations: items,
      model,
    }
  }

  return experts
}

function selectExpertModel(experts, router) {
  const requested = experts?.[router.regime]
  if (requested?.model) {
    return {
      ...requested,
      routed_regime: router.regime,
      routed_label: router.label,
      routing_reason: router.reason,
      fallback_used: false,
    }
  }

  const fallback = experts?.[REGIMES.BLENDED]
  if (fallback?.model) {
    return {
      ...fallback,
      routed_regime: router.regime,
      routed_label: router.label,
      routing_reason: `${router.reason}; fallback to blended expert`,
      fallback_used: true,
    }
  }

  return null
}

export function runMLForecast(historicalRows, currentRow, macroSignals, trustScores) {
  const { observations } = buildFeatures(historicalRows, macroSignals, trustScores)
  const divergenceObservations = observations
    .filter(o=>o.divergenceLabel!=null)
    .map(o=>({ ...o, label:o.divergenceLabel }))
  const atrObservations = observations
    .filter(o=>o.atrMoveLabel!=null)
    .map(o=>({ ...o, label:o.atrMoveLabel }))

  if (divergenceObservations.length<4 && atrObservations.length<4) return {
    insufficient_data:true, n_observations:observations.length,
    message:`Need 4+ labeled data points, have divergence=${divergenceObservations.length}, atr=${atrObservations.length}.`,
  }

  const divergenceExpertsRf = trainExpertModels(divergenceObservations,{ n_trees:31, max_depth:3, sample_rate:0.8, feature_ratio:0.5 })
  const atrExperts = trainExpertModels(atrObservations,{ n_trees:31, max_depth:3, sample_rate:0.8, feature_ratio:0.5 })

  // Build current feature vector
  const prevRow=historicalRows[historicalRows.length-2]
  const newsSent  = parseFloat(currentRow.sentiment_score)||0
  const redditRaw = currentRow.social?.bullish_pct!=null
    ? (parseFloat(currentRow.social.bullish_pct)-50)/50 : 0
  const tNews   = trustScores?.news?.reliability  ?trustScores.news.reliability/100  :0.5
  const tReddit = trustScores?.reddit?.reliability?trustScores.reddit.reliability/100:0.5
  const vixNorm = macroSignals?.vix?Math.min(1,macroSignals.vix/50):0
  const {blended,conviction,divergence,wasContrarian}=blendSentiment(newsSent,redditRaw,tNews,tReddit,vixNorm)
  const momentum  = parseFloat(currentRow.change_pct)||0
  const prevSent  = parseFloat(prevRow?.sentiment_score)||0
  const recent    = historicalRows.slice(-4).map(r=>parseFloat(r.change_pct)||0)
  const m         = recent.reduce((s,v)=>s+v,0)/recent.length
  const volatility= Math.sqrt(recent.reduce((s,v)=>s+(v-m)**2,0)/recent.length)
  const yieldSpread=macroSignals?.yield_spread??0
  const sessCtx   = getSessionContext(detectTickerExchange(currentRow.ticker||'NYSE'))
  const sessionType  = sessCtx.sessionType/3
  const isOverlap    = sessCtx.isOverlap?1:0
  const { rvol, atrRatio, atr } = calculateTapeFeatures(currentRow.candles)
  const normalizedMomentum = Math.max(-1, Math.min(1, momentum / 5))
  const sentimentGap = parseFloat((blended - normalizedMomentum).toFixed(4))
  const router = routeModelByRegime({ rvol, vix: macroSignals?.vix ?? null })
  const gatingDecision = GatingAgent.routePayload(
    currentRow.ticker || '',
    macroSignals?.vix ?? 0,
    rvol,
    newsSent,
    { momentum, volatility, atr_ratio: atrRatio },
  )

  const featureVector=[blended,newsSent,redditRaw,momentum,volatility,newsSent-prevSent,
                       conviction,vixNorm,yieldSpread,sessionType,isOverlap,rvol,atrRatio]

  // Apply rules.md
  const {flags, confidenceAdj} = applyRules(sessCtx, macroSignals, false)

  const activeDivergenceExpert = selectExpertModel(divergenceExpertsRf, router)
  const activeAtrExpert = selectExpertModel(atrExperts, router)
  if(!activeDivergenceExpert?.model && !activeAtrExpert?.model) return {insufficient_data:true,n_observations:0}

  const divergenceProbability=activeDivergenceExpert?.model?predictRandomForest(activeDivergenceExpert.model,featureVector):null
  const atrMoveProbability=activeAtrExpert?.model?predictRandomForest(activeAtrExpert.model,featureVector):null
  const divergenceCi=activeDivergenceExpert?.model
    ? bootstrapCI(activeDivergenceExpert.model,featureVector,activeDivergenceExpert.observations,30)
    : {lower:null,upper:null,std:null}
  const atrMoveCi=activeAtrExpert?.model
    ? bootstrapCI(activeAtrExpert.model,featureVector,activeAtrExpert.observations,30)
    : {lower:null,upper:null,std:null}
  const price=parseFloat(currentRow.price)||null
  const atrThresholdPct=atr>0&&price?parseFloat(((atr/price)*100).toFixed(4)):null
  const divergenceResolutionPrediction=divergenceProbability!=null?(divergenceProbability>=0.5?1:0):null
  const atrMovePrediction=atrMoveProbability!=null?(atrMoveProbability>=0.5?1:0):null
  const expertModels = {
    divergence: {
      active_regime: activeDivergenceExpert?.routed_regime ?? router.regime,
      active_label: activeDivergenceExpert?.routed_label ?? router.label,
      expert_used: activeDivergenceExpert?.regime ?? null,
      fallback_used: activeDivergenceExpert?.fallback_used ?? false,
      routing_reason: activeDivergenceExpert?.routing_reason ?? router.reason,
      n_observations: activeDivergenceExpert?.n_observations ?? 0,
    },
    atr: {
      active_regime: activeAtrExpert?.routed_regime ?? router.regime,
      active_label: activeAtrExpert?.routed_label ?? router.label,
      expert_used: activeAtrExpert?.regime ?? null,
      fallback_used: activeAtrExpert?.fallback_used ?? false,
      routing_reason: activeAtrExpert?.routing_reason ?? router.reason,
      n_observations: activeAtrExpert?.n_observations ?? 0,
    },
  }
  const regimeBreakdown = Object.values(REGIMES).map((regime) => ({
    regime,
    divergence_observations: divergenceExpertsRf[regime]?.n_observations ?? 0,
    atr_observations: atrExperts[regime]?.n_observations ?? 0,
    divergence_ready: Boolean(divergenceExpertsRf[regime]?.model),
    atr_ready: Boolean(atrExperts[regime]?.model),
  }))

  return {
    insufficient_data:false,n_observations:observations.length,
    n_estimators:Math.max(activeDivergenceExpert?.model?.trees.length||0, activeAtrExpert?.model?.trees.length||0),
    accuracy:activeDivergenceExpert?.model?.accuracy??null,
    rmse:activeDivergenceExpert?.model?.rmse??activeAtrExpert?.model?.rmse??null,
    feature_importance:activeDivergenceExpert?.model?.featureImportance??activeAtrExpert?.model?.featureImportance??[],
    atr_feature_importance:activeAtrExpert?.model?.featureImportance??[],
    train_errors:activeDivergenceExpert?.model?.trainErrors??activeAtrExpert?.model?.trainErrors??[],
    atr_train_errors:activeAtrExpert?.model?.trainErrors??[],
    divergence_probability:divergenceProbability,
    divergence_resolution_prediction:divergenceResolutionPrediction,
    divergence_ci_lower:divergenceCi.lower,
    divergence_ci_upper:divergenceCi.upper,
    divergence_ci_std:divergenceCi.std,
    atr_move_probability:atrMoveProbability,
    atr_move_prediction:atrMovePrediction,
    atr_move_ci_lower:atrMoveCi.lower,
    atr_move_ci_upper:atrMoveCi.upper,
    atr_move_ci_std:atrMoveCi.std,
    atr_move_threshold_pct:atrThresholdPct,
    active_regime: expertModels.divergence.active_label,
    active_regime_key: expertModels.divergence.active_regime,
    routing_reason: expertModels.divergence.routing_reason,
    signal_weighting: gatingDecision.signalWeighting,
    expert_models: expertModels,
    regime_breakdown: regimeBreakdown,
    model_architecture: 'random_forest_experts',
    predicted_change:null,lower_bound:null,upper_bound:null,ci_std:null,
    forecast_price:null,implied_price:null,price_divergence:null,
    conviction,divergence,wasContrarian,
    session:sessCtx,rules:flags,confidence_adj:confidenceAdj,
    current_features:{
      sentiment_blended:blended,news_sentiment:newsSent,reddit_sentiment:redditRaw,
      momentum,volatility,conviction,vix:macroSignals?.vix||null,
      yield_spread:yieldSpread,session:sessCtx.sessionLabel,rvol,atr_ratio:atrRatio,
      sentiment_gap:sentimentGap,atr_move_threshold_pct:atrThresholdPct,
    },
    predictions:activeDivergenceExpert?.model?.finalPredictions??[],
    atr_predictions:activeAtrExpert?.model?.finalPredictions??[],
  }
}

function detectTickerExchange(ticker) {
  if (ticker?.endsWith('.KL')) return 'BURSA'
  if (ticker?.endsWith('.T'))  return 'TSE'
  if (ticker?.endsWith('.HK')) return 'HKEX'
  if (ticker?.endsWith('.L'))  return 'LSE'
  return 'NYSE'
}
