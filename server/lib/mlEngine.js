/**
 * Gradient Boosting Regressor — upgraded with session + sentiment layering features
 *
 * Now reads constraints from spec.md / rules.md / skills.md via:
 *   - marketSession.js for session features
 *   - blendSentiment() for rational/irrational weighting
 *   - applyRules() for confidence adjustments
 *
 * Features (12 signals):
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
 *   10 time_to_close_norm — minutes to close normalised 0..1
 *   11 is_overlap         — 0/1: two markets open simultaneously
 */

import { getSessionContext, applyRules, blendSentiment } from './marketSession.js'

const FEATURE_NAMES = [
  'sentiment_blended','sentiment_news','sentiment_reddit',
  'momentum','volatility','sent_delta','conviction',
  'vix_norm','yield_spread',
  'session_type','time_to_close_norm','is_overlap',
]

function fitStump(X, residuals) {
  let bestGain=-Infinity, bestFeature=0, bestThreshold=0
  let bestLeftVal=0, bestRightVal=0
  const n = X.length
  for (let f=0;f<FEATURE_NAMES.length;f++) {
    const vals = [...new Set(X.map(r=>r[f]))].sort((a,b)=>a-b)
    for (let ti=0;ti<vals.length-1;ti++) {
      const threshold=(vals[ti]+vals[ti+1])/2
      const left=[],right=[]
      for (let i=0;i<n;i++)(X[i][f]<=threshold?left:right).push(residuals[i])
      if(!left.length||!right.length) continue
      const lm=left.reduce((s,v)=>s+v,0)/left.length
      const rm=right.reduce((s,v)=>s+v,0)/right.length
      const base=residuals.reduce((s,r)=>s+r*r,0)
      const gain=base-left.reduce((s,r)=>s+(r-lm)**2,0)-right.reduce((s,r)=>s+(r-rm)**2,0)
      if(gain>bestGain){bestGain=gain;bestFeature=f;bestThreshold=threshold;bestLeftVal=lm;bestRightVal=rm}
    }
  }
  return {feature:bestFeature,threshold:bestThreshold,leftVal:bestLeftVal,rightVal:bestRightVal,
          gain:bestGain,featureName:FEATURE_NAMES[bestFeature]}
}

function predictStump(stump,row){
  return row[stump.feature]<=stump.threshold?stump.leftVal:stump.rightVal
}

export function buildFeatures(historicalRows, macroSignals, trustScores) {
  const observations=[]
  const vixNorm = macroSignals?.vix ? Math.min(1,macroSignals.vix/50):0
  const yieldSpread = macroSignals?.yield_spread ?? 0
  const tNews   = trustScores?.news?.reliability   ? trustScores.news.reliability/100   : 0.5
  const tReddit = trustScores?.reddit?.reliability ? trustScores.reddit.reliability/100 : 0.5

  for (let i=1;i<historicalRows.length-1;i++) {
    const prev=historicalRows[i-1],curr=historicalRows[i],next=historicalRows[i+1]
    if (curr.sentiment_score==null||next.change_pct==null) continue

    const newsSent  = parseFloat(curr.sentiment_score)||0
    const redditRaw = curr.social?.bullish_pct!=null
      ? (parseFloat(curr.social.bullish_pct)-50)/50 : 0  // convert 0..100 → -1..1

    const { blended, conviction } = blendSentiment(newsSent, redditRaw, tNews, tReddit, vixNorm)
    const momentum = parseFloat(curr.change_pct)||0
    const prevSent = parseFloat(prev.sentiment_score)||0
    const recent = historicalRows.slice(Math.max(0,i-3),i).map(r=>parseFloat(r.change_pct)||0)
    const mn = recent.reduce((s,v)=>s+v,0)/(recent.length||1)
    const volatility = Math.sqrt(recent.reduce((s,v)=>s+(v-mn)**2,0)/(recent.length||1))
    const sentDelta = newsSent - prevSent

    // Session features
    const sessCtx = getSessionContext('NYSE', new Date(curr.generated_at))
    const sessionType = sessCtx.sessionType / 3  // normalise 0..1
    const timeToCloseNorm = sessCtx.timeToCloseMin!=null ? Math.min(1,sessCtx.timeToCloseMin/480) : 0.5
    const isOverlap = sessCtx.isOverlap ? 1 : 0

    observations.push({
      features: [blended, newsSent, redditRaw, momentum, volatility, sentDelta,
                 conviction, vixNorm, yieldSpread, sessionType, timeToCloseNorm, isOverlap],
      label: parseFloat(next.change_pct)||0,
      time: next.generated_at, price: parseFloat(next.price),
    })
  }
  return { observations, featureNames: FEATURE_NAMES }
}

export function trainGBR(observations, opts={}) {
  const {n_estimators=50,learning_rate=0.1,subsample=0.8}=opts
  const n=observations.length
  if (n<4) return null
  const X=observations.map(o=>o.features)
  const y=observations.map(o=>o.label)
  const meanY=y.reduce((s,v)=>s+v,0)/n
  let predictions=new Array(n).fill(meanY)
  const stumps=[],trainErrors=[]
  const featureGains=new Array(FEATURE_NAMES.length).fill(0)

  for (let t=0;t<n_estimators;t++) {
    const residuals=y.map((yi,i)=>yi-predictions[i])
    const indices=[]
    for (let i=0;i<n;i++) if(Math.random()<subsample) indices.push(i)
    if(indices.length<2) continue
    const stump=fitStump(indices.map(i=>X[i]),indices.map(i=>residuals[i]))
    stumps.push(stump)
    featureGains[stump.feature]+=Math.max(0,stump.gain)
    for (let i=0;i<n;i++) predictions[i]+=learning_rate*predictStump(stump,X[i])
    const mse=y.reduce((s,yi,i)=>s+(yi-predictions[i])**2,0)/n
    trainErrors.push(parseFloat(Math.sqrt(mse).toFixed(4)))
  }

  const meanYf=y.reduce((s,v)=>s+v,0)/n
  const ssTot=y.reduce((s,yi)=>s+(yi-meanYf)**2,0)
  const ssRes=y.reduce((s,yi,i)=>s+(yi-predictions[i])**2,0)
  const r2=ssTot>1e-10?Math.max(0,1-ssRes/ssTot):0
  const rmse=Math.sqrt(ssRes/n)
  const totalGain=featureGains.reduce((s,v)=>s+v,0)||1

  const LABELS = {
    sentiment_blended:'Blended sentiment',sentiment_news:'News sentiment',
    sentiment_reddit:'Reddit/social',momentum:'Price momentum',
    volatility:'Volatility',sent_delta:'Sentiment shift',
    conviction:'Signal conviction',vix_norm:'Market fear (VIX)',
    yield_spread:'Yield curve',session_type:'Session type',
    time_to_close_norm:'Time to close',is_overlap:'Market overlap',
  }

  const featureImportance=FEATURE_NAMES.map((name,i)=>({
    name,
    importance:parseFloat(((featureGains[i]/totalGain)*100).toFixed(1)),
    label:LABELS[name]||name,
  })).sort((a,b)=>b.importance-a.importance)

  return {
    stumps,meanY,featureImportance,
    r2:parseFloat(r2.toFixed(4)),rmse:parseFloat(rmse.toFixed(4)),n,
    trainErrors,
    finalPredictions:predictions.map((p,i)=>({
      time:observations[i].time,price:observations[i].price,
      actual:y[i],predicted:parseFloat(p.toFixed(4)),
    })),
  }
}

export function predictGBR(model,featureVector,lr=0.1){
  if(!model) return null
  let pred=model.meanY
  for (const s of model.stumps) pred+=lr*predictStump(s,featureVector)
  return parseFloat(pred.toFixed(4))
}

export function bootstrapCI(model,featureVector,observations,n_boot=30){
  if(!model||observations.length<6) return {lower:null,upper:null,std:null}
  const n=observations.length
  const bootPreds=[]
  for (let b=0;b<n_boot;b++){
    const sample=Array.from({length:n},()=>observations[Math.floor(Math.random()*n)])
    const bm=trainGBR(sample,{n_estimators:20,learning_rate:0.1})
    if(bm){const p=predictGBR(bm,featureVector);if(p!=null)bootPreds.push(p)}
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

export function runMLForecast(historicalRows, currentRow, macroSignals, trustScores) {
  const { observations } = buildFeatures(historicalRows, macroSignals, trustScores)
  if (observations.length<4) return {
    insufficient_data:true, n_observations:observations.length,
    message:`Need 4+ data points, have ${observations.length}.`,
  }

  const model=trainGBR(observations,{n_estimators:50,learning_rate:0.1,subsample:0.8})
  if(!model) return {insufficient_data:true,n_observations:0}

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
  const timeToClose  = sessCtx.timeToCloseMin!=null?Math.min(1,sessCtx.timeToCloseMin/480):0.5
  const isOverlap    = sessCtx.isOverlap?1:0

  const featureVector=[blended,newsSent,redditRaw,momentum,volatility,newsSent-prevSent,
                       conviction,vixNorm,yieldSpread,sessionType,timeToClose,isOverlap]

  // Apply rules.md
  const {flags, confidenceAdj} = applyRules(sessCtx, macroSignals, false)

  const predicted_change=predictGBR(model,featureVector)
  const ci=bootstrapCI(model,featureVector,observations,30)
  const price=parseFloat(currentRow.price)||null
  const forecast_price=price&&predicted_change!=null
    ?parseFloat((price*(1+predicted_change/100)).toFixed(2)):null

  // Implied price: sentiment-only component (features 0-2 only)
  const sentOnlyVec=[...featureVector]
  // Zero out non-sentiment features for pure sentiment-implied calculation
  sentOnlyVec[3]=0;sentOnlyVec[4]=0;sentOnlyVec[9]=0;sentOnlyVec[10]=0;sentOnlyVec[11]=0
  const sentOnlyChange=predictGBR(model,sentOnlyVec)
  const implied_price=price&&sentOnlyChange!=null
    ?parseFloat((price*(1+sentOnlyChange/100)).toFixed(2)):null
  const price_divergence=price&&implied_price?parseFloat((price-implied_price).toFixed(2)):null

  return {
    insufficient_data:false,n_observations:observations.length,
    n_estimators:model.stumps.length,r2:model.r2,rmse:model.rmse,
    feature_importance:model.featureImportance,train_errors:model.trainErrors,
    predicted_change,lower_bound:ci.lower,upper_bound:ci.upper,ci_std:ci.std,
    forecast_price,implied_price,price_divergence,
    conviction,divergence,wasContrarian,
    session:sessCtx,rules:flags,confidence_adj:confidenceAdj,
    current_features:{
      sentiment_blended:blended,news_sentiment:newsSent,reddit_sentiment:redditRaw,
      momentum,volatility,conviction,vix:macroSignals?.vix||null,
      yield_spread:yieldSpread,session:sessCtx.sessionLabel,
    },
    predictions:model.finalPredictions,
  }
}

function detectTickerExchange(ticker) {
  if (ticker?.endsWith('.KL')) return 'BURSA'
  if (ticker?.endsWith('.T'))  return 'TSE'
  if (ticker?.endsWith('.HK')) return 'HKEX'
  if (ticker?.endsWith('.L'))  return 'LSE'
  return 'NYSE'
}
