import { useState } from 'react'
import SentimentBadge from './SentimentBadge.jsx'
import TrustMeter from './TrustMeter.jsx'
import SessionBadge from './SessionBadge.jsx'
import { FeatureImportanceChart, LearningCurveChart, PredictedVsActualChart, ForecastVsActualChart } from './ForecastChart.jsx'

function NewsItem({ h }) {
  return (
    <a href={h.url} target="_blank" rel="noopener noreferrer" style={{
      display:'flex', flexDirection:'column', gap:'4px',
      padding:'11px 13px', background:'var(--gray-50)',
      borderRadius:'8px', border:'1px solid var(--border)',
      textDecoration:'none', transition:'all 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background='var(--blue-50)'; e.currentTarget.style.borderColor='var(--blue-100)' }}
      onMouseLeave={e => { e.currentTarget.style.background='var(--gray-50)'; e.currentTarget.style.borderColor='var(--border)' }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'8px' }}>
        <p style={{ fontSize:'13px', fontWeight:500, color:'var(--text-primary)', lineHeight:1.4, margin:0 }}>
          {h.title}
        </p>
        <span style={{ fontSize:'10px', color:'var(--blue-600)', background:'var(--blue-50)',
          padding:'2px 7px', borderRadius:'99px', whiteSpace:'nowrap', flexShrink:0,
          border:'1px solid var(--blue-100)' }}>↗ open</span>
      </div>
      {h.summary && (
        <p style={{ fontSize:'11px', color:'var(--text-muted)', margin:0, lineHeight:1.5 }}>
          {h.summary.slice(0, 160)}{h.summary.length > 160 ? '…' : ''}
        </p>
      )}
      <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
        {h.source && <span style={{ fontSize:'10px', color:'var(--text-muted)', fontWeight:500 }}>{h.source}</span>}
        {h.published_at && (
          <span style={{ fontSize:'10px', color:'var(--text-muted)' }}>
            · {new Date(h.published_at * 1000).toLocaleDateString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
          </span>
        )}
      </div>
    </a>
  )
}

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ padding:'9px 11px', background:'var(--gray-50)', borderRadius:'8px', border:'1px solid var(--border)' }}>
      <p style={{ fontSize:'9px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'3px' }}>{label}</p>
      <p style={{ fontSize:'14px', fontWeight:700, fontFamily:'var(--font-mono)', color: color || 'var(--text-primary)', marginBottom: sub ? '2px' : 0 }}>{value}</p>
      {sub && <p style={{ fontSize:'9px', color:'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

export default function ExpandedCard({ ticker, data, forecast, onClose }) {
  const [tab, setTab] = useState('news')
  const headlines = data?.headlines || []
  const fd = forecast?.forecast
  const predictions = forecast?.predictions || []
  const history = forecast?.history || []
  const trust = forecast?.trust || {}
  const hasML = fd && !fd.insufficient_data

  const tabs = [
    { id:'news',      label:`News (${headlines.length})` },
    { id:'forecast',  label:'Forecast chart' },
    { id:'ml',        label:'ML model' },
    { id:'analysis',  label:'AI analysis' },
  ]

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000,
      background:'rgba(15,23,42,0.65)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:'24px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:'var(--surface)', borderRadius:'20px',
        border:'1px solid var(--border)',
        boxShadow:'0 25px 60px rgba(0,0,0,0.18)',
        width:'100%', maxWidth:'720px', maxHeight:'90vh',
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
        {/* Header */}
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ display:'flex', alignItems:'baseline', gap:'10px', flexWrap:'wrap', marginBottom:'5px' }}>
                <span style={{ fontSize:'22px', fontWeight:700, letterSpacing:'-0.03em' }}>{ticker}</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'18px', fontWeight:500 }}>
                  ${data?.price?.toFixed(2)}
                </span>
                {data?.change_pct != null && (
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'13px', fontWeight:600,
                    color: data.change_pct >= 0 ? '#16A34A' : '#DC2626' }}>
                    {data.change_pct >= 0 ? '+' : ''}{data.change_pct.toFixed(2)}%
                  </span>
                )}
                {data && <SentimentBadge category={data.sentiment_cat} score={data.sentiment_score} />}
                {data?.macro_regime && data.macro_regime !== 'neutral' && (
                  <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'99px',
                    background: data.macro_regime === 'risk-off' ? '#FFF1F2' : '#F0FDF4',
                    color: data.macro_regime === 'risk-off' ? '#DC2626' : '#16A34A',
                    fontWeight:600 }}>
                    {data.macro_regime === 'risk-off' ? '⚠ Risk-off regime' : '↗ Risk-on regime'}
                  </span>
                )}
              </div>
              {hasML && (
                <div style={{ display:'flex', gap:'14px', flexWrap:'wrap', fontSize:'12px', color:'var(--text-muted)' }}>
                  <span>ML forecast: <strong style={{
                    color: fd.predicted_change >= 0 ? '#16A34A' : '#DC2626',
                    fontFamily:'var(--font-mono)',
                  }}>{fd.predicted_change >= 0 ? '+' : ''}{fd.predicted_change?.toFixed(2)}%</strong></span>
                  <span>R²=<strong style={{ fontFamily:'var(--font-mono)' }}>{fd.r2?.toFixed(3)}</strong></span>
                  <span>{fd.n_observations} obs · {fd.n_estimators || 50} trees</span>
                  {fd.price_divergence != null && Math.abs(fd.price_divergence) > 0.5 && (
                    <span style={{ color: fd.price_divergence > 0 ? '#D97706' : '#2563EB' }}>
                      {fd.price_divergence > 0 ? '↑' : '↓'} ${Math.abs(fd.price_divergence).toFixed(2)} price-sentiment gap
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{
              width:'30px', height:'30px', borderRadius:'50%', display:'flex',
              alignItems:'center', justifyContent:'center', fontSize:'17px',
              color:'var(--text-muted)', flexShrink:0, transition:'all 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-100)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'0 22px', flexShrink:0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:'10px 14px', fontSize:'12px', fontWeight:500,
              color: tab === t.id ? '#2563EB' : 'var(--text-muted)',
              borderBottom:`2px solid ${tab === t.id ? '#2563EB' : 'transparent'}`,
              marginBottom:'-1px', transition:'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>

          {/* NEWS TAB */}
          {tab === 'news' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
              {headlines.length === 0
                ? <p style={{ color:'var(--text-muted)', fontSize:'14px', textAlign:'center', padding:'40px' }}>
                    No headlines yet — run the pipeline first.
                  </p>
                : headlines.map((h, i) => <NewsItem key={i} h={h} />)
              }
            </div>
          )}

          {/* FORECAST CHART TAB */}
          {tab === 'forecast' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'18px' }}>
              <div>
                <p style={{ fontSize:'12px', fontWeight:500, color:'var(--text-muted)', marginBottom:'10px',
                  textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  Actual price vs ML forecast vs sentiment-implied price
                </p>
                <ForecastVsActualChart history={history} forecastData={forecast} height={220} />
                <p style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'6px', lineHeight:1.6 }}>
                  <strong style={{ color:'#2563EB' }}>Blue solid</strong> = actual market price ·{' '}
                  <strong style={{ color:'#16A34A' }}>Green dashed</strong> = ML model forecast ·{' '}
                  <strong style={{ color:'#9333EA' }}>Purple dotted</strong> = what price <em>should</em> be based
                  purely on sentiment signals. Gap between purple and blue = divergence.
                </p>
              </div>
              {predictions.length > 0 && (
                <div>
                  <p style={{ fontSize:'12px', fontWeight:500, color:'var(--text-muted)', marginBottom:'10px',
                    textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    Predicted vs actual % change
                  </p>
                  <PredictedVsActualChart predictions={predictions} />
                </div>
              )}
            </div>
          )}

          {/* ML MODEL TAB */}
          {tab === 'ml' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'18px' }}>
              {!hasML ? (
                <div style={{ textAlign:'center', padding:'40px', color:'var(--text-muted)' }}>
                  <p style={{ fontSize:'14px', fontWeight:500, marginBottom:'8px' }}>Model training in progress</p>
                  <p style={{ fontSize:'12px', lineHeight:1.6 }}>
                    Gradient boosting needs at least 4 hourly observations.
                    {fd?.n_observations != null && ` You have ${fd.n_observations}.`}
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'7px' }}>
                    <StatBox label="Predicted Δ"
                      value={`${fd.predicted_change >= 0 ? '+' : ''}${fd.predicted_change?.toFixed(2)}%`}
                      sub="next hour"
                      color={fd.predicted_change >= 0 ? '#16A34A' : '#DC2626'} />
                    <StatBox label="Target price" value={fd.forecast_price ? `$${fd.forecast_price}` : '—'} sub="ML model" />
                    <StatBox label="R² fit" value={fd.r2?.toFixed(3) ?? '—'} sub="model quality" />
                    <StatBox label="RMSE" value={fd.rmse?.toFixed(3) ?? '—'} sub="train error" />
                  </div>

                  {fd.lower_bound != null && (
                    <div style={{ padding:'9px 12px', borderRadius:'8px',
                      background:'var(--gray-50)', border:'1px solid var(--border)',
                      fontSize:'12px', color:'var(--text-muted)' }}>
                      95% bootstrap CI:{' '}
                      <span style={{ fontFamily:'var(--font-mono)', color:'var(--text-primary)' }}>
                        [{fd.lower_bound?.toFixed(2)}%, {fd.upper_bound?.toFixed(2)}%]
                      </span>
                      {fd.ci_std && ` · σ = ${fd.ci_std?.toFixed(3)}`}
                    </div>
                  )}

                  <div>
                    <p style={{ fontSize:'11px', fontWeight:500, color:'var(--text-muted)', marginBottom:'10px',
                      textTransform:'uppercase', letterSpacing:'0.06em' }}>What drives {ticker}</p>
                    <FeatureImportanceChart featureImportance={fd.feature_importance} />
                  </div>

                  <div>
                    <p style={{ fontSize:'11px', fontWeight:500, color:'var(--text-muted)', marginBottom:'8px',
                      textTransform:'uppercase', letterSpacing:'0.06em' }}>Model learning curve</p>
                    <LearningCurveChart trainErrors={fd.train_errors} />
                    <p style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'4px' }}>
                      RMSE falling = model converging. Flat line = fully trained.
                    </p>
                  </div>

                  <div style={{ padding:'12px 14px', borderRadius:'8px',
                    background:'var(--blue-50)', border:'1px solid var(--blue-100)',
                    fontSize:'12px', color:'var(--text-secondary)', lineHeight:1.7 }}>
                    <strong style={{ color:'#1D4ED8' }}>Reading the model: </strong>
                    Gradient boosting trained on {fd.n_observations} hourly observations
                    using 8 signals (sentiment, momentum, volatility, macro). The top driver is{' '}
                    <strong>{fd.feature_importance?.[0]?.label}</strong> at{' '}
                    {fd.feature_importance?.[0]?.importance}% importance.
                    R²={fd.r2?.toFixed(3)} means the model explains{' '}
                    {(fd.r2 * 100).toFixed(1)}% of historical price variance.{' '}
                    {fd.price_divergence != null && Math.abs(fd.price_divergence) > 0.5
                      ? `Current price-sentiment gap: $${Math.abs(fd.price_divergence).toFixed(2)} — ${fd.price_divergence > 0 ? 'price is running ahead of sentiment' : 'sentiment is running ahead of price'}.`
                      : 'Price and sentiment are broadly aligned.'}
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI ANALYSIS TAB */}
          {tab === 'analysis' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              {data?.narrative && data.narrative !== 'Insufficient data to generate narrative.' ? (
                <div style={{ padding:'14px 16px', borderRadius:'10px',
                  background:'var(--blue-50)', border:'1px solid var(--blue-100)' }}>
                  <p style={{ fontSize:'14px', fontFamily:'var(--font-serif)', fontStyle:'italic',
                    lineHeight:1.8, color:'var(--text-secondary)', margin:0 }}>
                    {data.narrative}
                  </p>
                </div>
              ) : (
                <p style={{ color:'var(--text-muted)', fontSize:'14px' }}>No narrative yet.</p>
              )}

              {data?.key_themes?.length > 0 && (
                <div>
                  <p style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'8px', fontWeight:500 }}>Key themes</p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                    {data.key_themes.map((t, i) => (
                      <span key={i} style={{ padding:'4px 12px', background:'var(--blue-50)',
                        color:'var(--blue-700)', borderRadius:'99px', fontSize:'12px',
                        fontWeight:500, border:'1px solid var(--blue-100)' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Trust meter — full detail */}
              <div style={{ padding:'14px', borderRadius:'10px',
                background:'var(--gray-50)', border:'1px solid var(--border)' }}>
                <p style={{ fontSize:'11px', fontWeight:500, color:'var(--text-muted)',
                  marginBottom:'12px', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  Sentiment reliability by source
                </p>
                <TrustMeter trustScores={trust} compact={false} />
                <p style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'10px', lineHeight:1.6 }}>
                  Reliability is learned from historical prediction accuracy — how often each source's
                  sentiment correctly predicted actual price direction. Updates every pipeline run.
                </p>
              </div>

              {/* Session context */}
              {forecast?.session && (
                <div style={{ padding:'12px 14px', borderRadius:'10px',
                  background:'var(--gray-50)', border:'1px solid var(--border)' }}>
                  <p style={{ fontSize:'11px', fontWeight:500, color:'var(--text-muted)',
                    marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    Market session
                  </p>
                  <SessionBadge session={forecast.session} rules={fd?.active_rules||[]} compact={false} />
                </div>
              )}
              <p style={{ fontSize:'11px', color:'var(--text-muted)' }}>
                Updated {data?.generated_at ? new Date(data.generated_at).toLocaleString() : '—'}
                {data?.macro_regime && ` · Macro regime: ${data.macro_regime}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
