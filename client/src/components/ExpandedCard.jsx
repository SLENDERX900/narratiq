import { useState } from 'react'
import SentimentBadge from './SentimentBadge.jsx'
import TrustMeter from './TrustMeter.jsx'
import SessionBadge from './SessionBadge.jsx'

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

export default function ExpandedCard({ ticker, data, forecast, onClose }) {
  const [tab, setTab] = useState('engine')
  const headlines = data?.headlines || []
  const evr = forecast?.evr_engine
  const trust = forecast?.trust || {}
  const regimeStyle = regimeStyles(evr?.active_regime)

  const tabs = [
    { id:'engine', label:'EVR engine' },
    { id:'news', label:`News (${headlines.length})` },
    { id:'analysis', label:'AI analysis' },
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
              </div>
              {evr && (
                <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{
                    fontSize:'10px', padding:'3px 8px', borderRadius:'99px', fontWeight:700,
                    background: regimeStyle.background, color: regimeStyle.color, border:`1px solid ${regimeStyle.border}`,
                  }}>
                    {evr.active_regime?.replaceAll('_', ' ')}
                  </span>
                  <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>
                    Simple action: <strong style={{ color: regimeStyle.color }}>{evr.simple_action}</strong>
                  </span>
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

        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
          {tab === 'engine' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'18px' }}>
              {evr ? (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'7px' }}>
                    <StatBox label="Active regime" value={evr.active_regime?.replaceAll('_', ' ')} />
                    <StatBox label="Action" value={evr.simple_action} />
                    <StatBox label="Institutional term" value={evr.institutional_term} />
                    <StatBox label="1σ move" value={evr.volatility_target?.expected_1_sigma_move ? 'Expected' : 'Contained'} />
                  </div>

                  <div style={{ padding:'12px 14px', borderRadius:'10px',
                    background:'var(--blue-50)', border:'1px solid var(--blue-100)' }}>
                    <p style={{ fontSize:'11px', fontWeight:600, color:'#1D4ED8', marginBottom:'6px' }}>
                      Plain-English reasoning
                    </p>
                    <p style={{ fontSize:'13px', lineHeight:1.7, color:'var(--text-secondary)', margin:0 }}>
                      {evr.plain_english_reasoning}
                    </p>
                  </div>

                  <div style={{ padding:'12px 14px', borderRadius:'10px', background:'#FFF7ED', border:'1px solid #FED7AA' }}>
                    <p style={{ fontSize:'11px', fontWeight:600, color:'#C2410C', marginBottom:'6px' }}>
                      Divergence Magnitude: {evr.divergence_magnitude?.status} (${Math.abs(Number(evr.divergence_magnitude?.value || 0)).toFixed(2)} Gap)
                    </p>
                    <p style={{ fontSize:'12px', lineHeight:1.7, color:'var(--text-secondary)', margin:0 }}>
                      {evr.divergence_magnitude?.description || `Institutional term: ${evr.institutional_term}.`}
                    </p>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'10px' }}>
                    <StatBox
                      label="Risk band upper"
                      value={evr.volatility_target?.risk_band_upper != null ? `$${evr.volatility_target.risk_band_upper.toFixed(2)}` : '—'}
                      sub="1σ upper bound"
                    />
                    <StatBox
                      label="Risk band lower"
                      value={evr.volatility_target?.risk_band_lower != null ? `$${evr.volatility_target.risk_band_lower.toFixed(2)}` : '—'}
                      sub="1σ lower bound"
                    />
                  </div>

                  {forecast?.session && (
                    <div style={{ padding:'12px 14px', borderRadius:'10px',
                      background:'var(--gray-50)', border:'1px solid var(--border)' }}>
                      <p style={{ fontSize:'11px', fontWeight:500, color:'var(--text-muted)',
                        marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        Market session
                      </p>
                      <SessionBadge session={forecast.session} rules={forecast.session.active_rules||[]} compact={false} />
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color:'var(--text-muted)', fontSize:'14px' }}>EVR engine is still collecting enough observations.</p>
              )}
            </div>
          )}

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

              <div style={{ padding:'14px', borderRadius:'10px',
                background:'var(--gray-50)', border:'1px solid var(--border)' }}>
                <p style={{ fontSize:'11px', fontWeight:500, color:'var(--text-muted)',
                  marginBottom:'12px', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  Sentiment reliability by source
                </p>
                <TrustMeter trustScores={trust} compact={false} />
              </div>

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
