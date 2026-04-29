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

function regimeStyles(regime) {
  switch (regime) {
    case 'MACRO_SHOCK':
      return { background: '#FFF1F2', color: '#DC2626', border: '#FECACA' }
    case 'MEAN_REVERSION':
      return { background: '#FFFBEB', color: '#D97706', border: '#FDE68A' }
    case 'MOMENTUM':
      return { background: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' }
    default:
      return { background: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' }
  }
}

function RegimeBadge({ regime }) {
  if (!regime) return null
  const style = regimeStyles(regime)
  return (
    <span style={{
      fontSize: '10px', padding: '2px 8px', borderRadius: '99px', fontWeight: 700,
      background: style.background, color: style.color, border: `1px solid ${style.border}`,
    }}>
      {regime.replaceAll('_', ' ')}
    </span>
  )
}

function ActionBadge({ action }) {
  if (!action) return null
  const upper = action.toUpperCase()
  const style = upper.includes('SELL')
    ? { background:'#FFF1F2', color:'#DC2626', border:'#FECACA' }
    : upper.includes('BUY')
    ? { background:'#F0FDF4', color:'#16A34A', border:'#BBF7D0' }
    : { background:'#FFFBEB', color:'#D97706', border:'#FDE68A' }

  return (
    <span style={{
      fontSize: '11px', padding: '4px 10px', borderRadius: '99px', fontWeight: 800,
      background: style.background, color: style.color, border: `1px solid ${style.border}`,
      letterSpacing: '0.02em',
    }}>
      {action}
    </span>
  )
}

function DivergenceAlert({ divergence }) {
  if (!divergence) return null
  const value = Math.abs(Number(divergence.value || 0))
  return (
    <div style={{
      padding: '6px 11px', fontSize: '11px', background: '#FFF7ED', color: '#C2410C',
      borderTop: '1px solid #FED7AA',
    }}>
      <strong>Divergence Magnitude: {divergence.status}</strong> (${value.toFixed(2)} Gap)
    </div>
  )
}

export default function InsightCard({ ticker, data, forecast, trustScores, onRemove, onExpand }) {
  const isLoading = !data
  const evr = forecast?.evr_engine
  const hasEngine = Boolean(evr) && !forecast?.insufficient_data
  const session = forecast?.session
  const activeRules = forecast?.session?.active_rules || []
  const hasSocial = data?.social && !data.social.is_neutral_fallback
  const regimeStyle = regimeStyles(evr?.active_regime)

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
            {hasEngine && <ActionBadge action={evr.simple_action} />}
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
          {hasEngine ? (
            <div style={{ borderRadius: '10px', overflow: 'hidden', border: `1px solid ${regimeStyle.border}` }}>
              <div style={{
                padding: '9px 11px', background: regimeStyle.background,
                display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start',
              }}>
                <div>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                    Plain-English action
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: regimeStyle.color }}>
                    {evr.simple_action}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                    Active regime
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: regimeStyle.color }}>
                    {evr.active_regime?.replaceAll('_', ' ')}
                  </span>
                </div>
              </div>
              <div style={{ padding:'8px 11px', background:'var(--surface)', borderTop:'1px solid var(--border)' }}>
                <p style={{ fontSize:'11px', lineHeight:1.6, color:'var(--text-secondary)', margin:0 }}>
                  {evr.plain_english_reasoning}
                </p>
              </div>
              <div style={{ padding:'6px 11px', fontSize:'10px', color:'var(--text-muted)', background:'var(--gray-50)', borderTop:'1px solid var(--border)' }}>
                Institutional term: <strong style={{ color: regimeStyle.color }}>{evr.institutional_term}</strong>
              </div>
              <DivergenceAlert divergence={evr.divergence_magnitude} />
              {activeRules.filter(r => r.severity === 'warning' || r.severity === 'danger').slice(0,1).map((r,i) => (
                <div key={i} style={{ padding: '4px 11px', fontSize: '10px',
                  background: r.severity === 'danger' ? '#FFF1F2' : '#FFFBEB',
                  color: r.severity === 'danger' ? '#DC2626' : '#D97706',
                  borderTop: '1px solid var(--border)' }}>
                  ⚠ {r.label}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '7px 11px', borderRadius: '8px', background: 'var(--gray-50)',
              border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
              {forecast?.insufficient_data
                ? 'EVR engine is collecting enough observations to activate.'
                : 'Run pipeline to generate EVR engine output'}
            </div>
          )}

          {data.narrative && data.narrative !== 'Insufficient data to generate narrative.' && (
            <p style={{ fontSize: '12px', lineHeight: 1.65, color: 'var(--text-secondary)',
              fontFamily: 'var(--font-serif)', fontStyle: 'italic',
              borderLeft: '2px solid var(--blue-100)', paddingLeft: '10px', margin: 0 }}>
              {data.narrative.slice(0, 180)}{data.narrative.length > 180 ? '…' : ''}
            </p>
          )}

          {data.key_themes?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {data.key_themes.map((t,i) => (
                <span key={i} style={{ padding: '2px 8px', background: 'var(--blue-50)',
                  color: 'var(--blue-700)', borderRadius: '99px', fontSize: '10px', fontWeight: 500 }}>{t}</span>
              ))}
            </div>
          )}

          {hasEngine && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px' }}>
              <div style={{ padding:'8px 10px', background:'var(--gray-50)', borderRadius:'8px', border:'1px solid var(--border)' }}>
                <p style={{ fontSize:'9px', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'3px' }}>Risk band</p>
                <p style={{ fontSize:'12px', fontFamily:'var(--font-mono)', fontWeight:700 }}>
                  ${evr.volatility_target?.risk_band_lower?.toFixed?.(2) ?? '—'} - ${evr.volatility_target?.risk_band_upper?.toFixed?.(2) ?? '—'}
                </p>
              </div>
              <div style={{ padding:'8px 10px', background:'var(--gray-50)', borderRadius:'8px', border:'1px solid var(--border)' }}>
                <p style={{ fontSize:'9px', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'3px' }}>Divergence</p>
                <p style={{ fontSize:'12px', fontFamily:'var(--font-mono)', fontWeight:700, color:'#C2410C' }}>
                  {evr.divergence_magnitude?.status} (${Math.abs(Number(evr.divergence_magnitude?.value || 0)).toFixed(2)})
                </p>
              </div>
            </div>
          )}

          {hasSocial && sourceLabel && (
            <div style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: '10px', color: 'var(--text-muted)' }}>
              <span>Social source</span>
              <span style={{ background: 'var(--gray-100)', padding: '1px 7px', borderRadius: '99px' }}>{sourceLabel}</span>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <TrustMeter trustScores={trustScores} compact={true} />
          </div>

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
