import { useState } from 'react'
import SentimentBadge from './SentimentBadge.jsx'
import TrustMeter from './TrustMeter.jsx'
import SessionBadge from './SessionBadge.jsx'

function MiniChart({ candles }) {
  if (!candles?.length) return null
  const prices = candles.map(c => c.c).filter(Boolean)
  if (prices.length < 2) return null
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1
  const W = 100, H = 28
  const pts = prices.map((p, i) => `${(i/(prices.length-1))*W},${H-((p-min)/range)*H}`).join(' ')
  const up = prices[prices.length-1] >= prices[0]
  return (
    <svg width={W} height={H} style={{ overflow: 'visible', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={up ? '#16A34A' : '#DC2626'}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ConvictionBadge({ conviction, divergence, wasContrarian }) {
  if (conviction == null) return null
  const pct = Math.round(conviction * 100)
  const isHigh = pct >= 70
  const isLow  = pct < 40
  const color = isHigh ? '#16A34A' : isLow ? '#DC2626' : '#D97706'
  const label = wasContrarian ? 'Contrarian' : isHigh ? 'High conviction' : isLow ? 'Low conviction' : 'Moderate'

  return (
    <span style={{
      fontSize: '10px', padding: '2px 8px', borderRadius: '99px', fontWeight: 600,
      background: isHigh ? '#F0FDF4' : isLow ? '#FFF1F2' : '#FFFBEB',
      color, border: `1px solid ${color}30`,
    }}>
      {label} {pct}%
    </span>
  )
}

export default function InsightCard({ ticker, data, forecast, trustScores, onRemove, onExpand }) {
  const isLoading = !data
  const fd = forecast?.forecast
  const hasML = fd && !fd.insufficient_data
  const session = forecast?.session
  const activeRules = fd?.active_rules || []
  const hasSocial = data?.social && !data.social.is_neutral_fallback

  const sourceLabel = {
    'marketaux':'Marketaux', 'apewisdom':'Reddit (ApeWisdom)',
    'stocksera':'WSB Stocksera', 'news-derived':'News',
  }[data?.social?.social_source] ?? null

  return (
    <div className="fade-in" style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '16px', padding: '16px 18px',
      boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '12px',
      transition: 'box-shadow 0.2s, transform 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow='var(--shadow-md)'; e.currentTarget.style.transform='translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow='var(--shadow-sm)'; e.currentTarget.style.transform='none' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '19px', fontWeight: 700, letterSpacing: '-0.03em' }}>{ticker}</span>
            {data && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 500 }}>${data.price?.toFixed(2)}</span>}
            {data?.change_pct != null && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600,
                color: data.change_pct >= 0 ? '#16A34A' : '#DC2626' }}>
                {data.change_pct >= 0 ? '+' : ''}{data.change_pct.toFixed(2)}%
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
            {data && <SentimentBadge category={data.sentiment_cat} score={data.sentiment_score} />}
            <SessionBadge session={session} rules={[]} compact={true} />
            {hasML && <ConvictionBadge conviction={fd.conviction} divergence={fd.divergence} wasContrarian={fd.wasContrarian} />}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {data?.candles && <MiniChart candles={data.candles} />}
          {onRemove && (
            <button onClick={() => onRemove(ticker)} style={{
              width: '24px', height: '24px', borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
              fontSize: '15px', transition: 'all 0.15s', marginLeft: '6px',
            }}
              onMouseEnter={e => { e.currentTarget.style.background='#FFF1F2'; e.currentTarget.style.color='#DC2626' }}
              onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='var(--text-muted)' }}
            >×</button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {[130,80,110,60].map((w,i)=>(
            <div key={i} className="pulsing" style={{ height:'10px', width:`${w}px`, background:'var(--gray-100)', borderRadius:'6px' }} />
          ))}
        </div>
      ) : (
        <>
          {/* ML Forecast strip */}
          {hasML ? (
            <div style={{ borderRadius: '8px', overflow: 'hidden',
              border: `1px solid ${fd.predicted_change >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
              <div style={{ padding: '7px 11px',
                background: fd.predicted_change >= 0 ? '#F0FDF4' : '#FFF1F2',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '1px' }}>
                    ML forecast (next hour)
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700,
                    color: fd.predicted_change >= 0 ? '#16A34A' : '#DC2626' }}>
                    {fd.predicted_change >= 0 ? '+' : ''}{fd.predicted_change?.toFixed(2)}%
                    {fd.forecast_price && <span style={{ fontSize: '11px', fontWeight: 500 }}> → ${fd.forecast_price}</span>}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block' }}>R²</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
                    color: fd.r2 >= 0.7 ? '#16A34A' : fd.r2 >= 0.4 ? '#D97706' : 'var(--text-muted)' }}>
                    {fd.r2?.toFixed(3)}
                  </span>
                </div>
              </div>
              {/* Price-sentiment divergence */}
              {fd.price_divergence != null && Math.abs(fd.price_divergence) > 0.5 && (
                <div style={{ padding: '4px 11px', fontSize: '10px',
                  background: 'var(--gray-50)', color: '#D97706',
                  borderTop: `1px solid ${fd.predicted_change >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
                  {fd.price_divergence > 0
                    ? `↑ Price $${Math.abs(fd.price_divergence).toFixed(2)} ahead of sentiment`
                    : `↓ Sentiment $${Math.abs(fd.price_divergence).toFixed(2)} ahead of price`}
                </div>
              )}
              {/* Active warning rules on card */}
              {activeRules.filter(r => r.severity === 'warning' || r.severity === 'danger').slice(0,1).map((r,i) => (
                <div key={i} style={{ padding: '4px 11px', fontSize: '10px',
                  background: r.severity === 'danger' ? '#FFF1F2' : '#FFFBEB',
                  color: r.severity === 'danger' ? '#DC2626' : '#D97706',
                  borderTop: `1px solid ${fd.predicted_change >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
                  ⚠ {r.label}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '7px 11px', borderRadius: '8px', background: 'var(--gray-50)',
              border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
              {fd?.n_observations != null
                ? `ML training: ${fd.n_observations}/4 observations collected`
                : 'Run pipeline to generate ML forecast'}
            </div>
          )}

          {/* Narrative */}
          {data.narrative && data.narrative !== 'Insufficient data to generate narrative.' && (
            <p style={{ fontSize: '12px', lineHeight: 1.65, color: 'var(--text-secondary)',
              fontFamily: 'var(--font-serif)', fontStyle: 'italic',
              borderLeft: '2px solid var(--blue-100)', paddingLeft: '10px', margin: 0 }}>
              {data.narrative.slice(0, 180)}{data.narrative.length > 180 ? '…' : ''}
            </p>
          )}

          {/* Key themes */}
          {data.key_themes?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {data.key_themes.map((t,i) => (
                <span key={i} style={{ padding: '2px 8px', background: 'var(--blue-50)',
                  color: 'var(--blue-700)', borderRadius: '99px', fontSize: '10px', fontWeight: 500 }}>{t}</span>
              ))}
            </div>
          )}

          {/* Sentiment source label */}
          {hasSocial && sourceLabel && (
            <div style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: '10px', color: 'var(--text-muted)' }}>
              <span>Social source</span>
              <span style={{ background: 'var(--gray-100)', padding: '1px 7px', borderRadius: '99px' }}>{sourceLabel}</span>
            </div>
          )}

          {/* Trust meter */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <TrustMeter trustScores={trustScores} compact={true} />
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {data.generated_at
                ? `Updated ${new Date(data.generated_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`
                : ''}
            </span>
            {onExpand && (
              <button onClick={() => onExpand(ticker)} style={{
                fontSize: '11px', color: 'var(--blue-600)', fontWeight: 500,
                padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--blue-100)',
                background: 'var(--blue-50)', transition: 'all 0.15s', cursor: 'pointer',
              }}
                onMouseEnter={e => e.currentTarget.style.background='#DBEAFE'}
                onMouseLeave={e => e.currentTarget.style.background='var(--blue-50)'}
              >Full analysis ↗</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
