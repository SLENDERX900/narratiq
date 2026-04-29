import { useState } from 'react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import SentimentBadge from './SentimentBadge.jsx'
import TrustMeter from './TrustMeter.jsx'

const COLORS = ['#2563EB','#16A34A','#DC2626','#9333EA','#D97706','#0891B2']

function fmt(iso) {
  const d = new Date(iso)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:00`
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

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'8px', padding:'9px 13px', fontSize:'11px', boxShadow:'var(--shadow-md)', maxWidth:'220px' }}>
      <p style={{ color:'var(--text-muted)', marginBottom:'5px', fontWeight:500 }}>{label}</p>
      {payload.map((p, i) => p.value != null && (
        <p key={i} style={{ color:p.color, fontFamily:'var(--font-mono)', marginBottom:'2px' }}>
          {p.name}: {p.name?.toLowerCase().includes('price') ? `$${Number(p.value).toFixed(2)}` : Number(p.value).toFixed(3)}
        </p>
      ))}
    </div>
  )
}

function UnifiedChart({ tickers, history, mode }) {
  const timeMap = {}
  tickers.forEach(ticker => {
    const rows = history[ticker] || []
    rows.forEach(row => {
      const t = fmt(row.generated_at)
      if (!timeMap[t]) timeMap[t] = { time: t }
      if (mode === 'price' || mode === 'both') {
        timeMap[t][`${ticker}_actual`] = parseFloat(row.price)
      }
      if (mode === 'sentiment' || mode === 'both') {
        timeMap[t][`${ticker}_sentiment`] = parseFloat(row.sentiment_score) || 0
      }
    })
  })

  const chartData = Object.values(timeMap).sort((a,b) => new Date(a.time) - new Date(b.time))
  if (chartData.length < 2) {
    return (
      <div style={{ height:280, display:'flex', alignItems:'center', justifyContent:'center',
        flexDirection:'column', gap:'10px', color:'var(--text-muted)' }}>
        <p style={{ fontSize:'14px', fontWeight:500 }}>Not enough history yet</p>
        <p style={{ fontSize:'12px' }}>Charts populate after 2+ pipeline runs per ticker</p>
      </div>
    )
  }

  const hasPriceAxis = mode === 'price' || mode === 'both'
  const hasSentAxis = mode === 'sentiment' || mode === 'both'

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top:8, right:hasSentAxis?40:12, bottom:0, left:4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="time"
          tick={{ fontSize:10, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }}
          tickLine={false} axisLine={false} interval="preserveStartEnd" />

        {hasPriceAxis && (
          <YAxis yAxisId="price" orientation="left"
            tick={{ fontSize:10, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }}
            tickLine={false} axisLine={false} tickFormatter={v=>`$${v.toFixed(0)}`} width={52} />
        )}
        {hasSentAxis && (
          <YAxis yAxisId="sentiment" orientation="right" domain={[-1.2,1.2]}
            tick={{ fontSize:10, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }}
            tickLine={false} axisLine={false} width={28} />
        )}
        {hasSentAxis && <ReferenceLine yAxisId="sentiment" y={0} stroke="var(--border)" />}
        <Tooltip content={<ChartTip />} />
        <Legend wrapperStyle={{ fontSize:'10px', paddingTop:'8px' }} />

        {tickers.map((ticker, i) => {
          const color = COLORS[i % COLORS.length]
          return [
            hasPriceAxis && (
              <Line key={`${ticker}_actual`} yAxisId="price" type="monotone"
                dataKey={`${ticker}_actual`} stroke={color} strokeWidth={2.5}
                dot={false} activeDot={{ r:3 }} connectNulls name={`${ticker} actual`} />
            ),
            hasSentAxis && (
              <Area key={`${ticker}_sentiment`} yAxisId="sentiment" type="monotone"
                dataKey={`${ticker}_sentiment`} stroke={color}
                fill={color + (mode==='both' ? '18' : '33')}
                strokeWidth={mode==='both' ? 1 : 1.5}
                strokeDasharray={mode==='both' ? '4 2' : undefined}
                dot={false} connectNulls name={`${ticker} sentiment`} />
            ),
          ].filter(Boolean)
        })}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function TickerCard({ ticker, data, forecast, accuracy, trust, color }) {
  const evr = forecast?.evr_engine
  const avgAcc = accuracy?.length
    ? accuracy.filter(r => r.accuracy_pct != null).reduce((s,r,_,a) => s + r.accuracy_pct/a.length, 0)
    : null
  const regime = evr?.active_regime
  const regimeStyle = regimeStyles(regime)

  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderTop:`3px solid ${color}`, borderRadius:'12px', padding:'14px 16px',
      boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column', gap:'10px',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ display:'flex', alignItems:'baseline', gap:'7px' }}>
            <span style={{ fontSize:'16px', fontWeight:700 }}>{ticker}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'14px' }}>
              {data ? `$${data.price?.toFixed(2)}` : '—'}
            </span>
          </div>
          {data?.change_pct != null && (
            <span style={{ fontSize:'12px', fontFamily:'var(--font-mono)', fontWeight:600,
              color: data.change_pct >= 0 ? '#16A34A' : '#DC2626' }}>
              {data.change_pct >= 0 ? '+' : ''}{data.change_pct.toFixed(2)}% today
            </span>
          )}
        </div>
        {data && <SentimentBadge category={data.sentiment_cat} score={data.sentiment_score} />}
      </div>

      {evr && (
        <div style={{
          padding:'8px 10px', borderRadius:'8px',
          background: regimeStyle.background, border:`1px solid ${regimeStyle.border}`,
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
            <span style={{ fontSize:'10px', color:'var(--text-muted)' }}>Simple action</span>
            <span style={{ fontSize:'10px', fontWeight:700, color:regimeStyle.color }}>
              {regime?.replaceAll('_', ' ')}
            </span>
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'12px', fontWeight:700, color:regimeStyle.color }}>
            {evr.simple_action}
          </div>
          <p style={{ fontSize:'11px', lineHeight:1.5, color:'var(--text-secondary)', margin:'6px 0 0 0' }}>
            {evr.plain_english_reasoning}
          </p>
          <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'6px' }}>
            Institutional term: <strong style={{ color:regimeStyle.color }}>{evr.institutional_term}</strong>
          </div>
        </div>
      )}

      {evr?.divergence_magnitude && (
        <div style={{ fontSize:'11px', color:'#C2410C', padding:'7px 9px',
          background:'#FFF7ED', borderRadius:'6px', border:'1px solid #FED7AA' }}>
          <strong>Divergence Magnitude: {evr.divergence_magnitude.status}</strong>{' '}
          (${Math.abs(Number(evr.divergence_magnitude.value || 0)).toFixed(2)} Gap)
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'6px' }}>
        {[
          { label:'Forecast acc.', value: avgAcc != null ? `${avgAcc.toFixed(0)}%` : '—' },
          { label:'1σ move', value: evr?.volatility_target?.expected_1_sigma_move ? 'Expected' : 'Contained' },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign:'center', padding:'5px',
            background:'var(--gray-50)', borderRadius:'6px' }}>
            <p style={{ fontSize:'9px', color:'var(--text-muted)', marginBottom:'2px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</p>
            <p style={{ fontSize:'13px', fontWeight:700, fontFamily:'var(--font-mono)' }}>{value}</p>
          </div>
        ))}
      </div>

      {accuracy?.length > 2 && (
        <div style={{ padding:'16px', textAlign:'center', color:'var(--text-muted)' }}>
          <small>Accuracy chart available for {accuracy.length} data points</small>
        </div>
      )}

      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'8px' }}>
        <TrustMeter trustScores={trust} compact={false} />
      </div>

      {data?.narrative && data.narrative !== 'Insufficient data to generate narrative.' && (
        <p style={{ fontSize:'11px', lineHeight:1.6, color:'var(--text-muted)',
          fontFamily:'var(--font-serif)', fontStyle:'italic',
          borderTop:'1px solid var(--border)', paddingTop:'8px', margin:0 }}>
          {data.narrative.slice(0, 140)}…
        </p>
      )}
    </div>
  )
}

export default function ComparisonMatrix({ tickers, insights, history, forecasts, accuracy, trust }) {
  const [mode, setMode] = useState('both')
  const modes = ['price','sentiment','both']

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px' }}>
        <h2 style={{ fontSize:'14px', fontWeight:600, color:'var(--text-secondary)' }}>
          Comparing {tickers.join(', ')} — price, sentiment, and EVR regimes
        </h2>
        <div style={{ display:'flex', background:'var(--gray-100)', borderRadius:'8px', padding:'3px', gap:'2px' }}>
          {modes.map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding:'4px 12px', borderRadius:'6px', fontSize:'12px', fontWeight:500,
              background: mode === m ? 'var(--surface)' : 'transparent',
              color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
              transition:'all 0.15s', textTransform:'capitalize',
            }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', gap:'16px', flexWrap:'wrap', fontSize:'11px' }}>
        {tickers.map((t, i) => (
          <div key={t} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
            <div style={{ width:'12px', height:'3px', background:COLORS[i%COLORS.length], borderRadius:'2px' }} />
            <span style={{ color:'var(--text-secondary)', fontFamily:'var(--font-mono)', fontWeight:600 }}>{t}</span>
          </div>
        ))}
      </div>

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:'14px', padding:'20px', boxShadow:'var(--shadow-sm)' }}>
        <UnifiedChart tickers={tickers} history={history} mode={mode} />
        <p style={{ fontSize:'10px', color:'var(--text-muted)', textAlign:'center', marginTop:'8px' }}>
          {mode === 'both'
            ? 'Solid = actual price · Shaded = AI sentiment score'
            : mode === 'price'
            ? 'Actual price action over time'
            : 'AI sentiment score per ticker over time (−1 bearish → +1 bullish)'}
        </p>
      </div>

      <div style={{
        display:'grid',
        gridTemplateColumns:`repeat(${Math.min(tickers.length, 3)}, 1fr)`,
        gap:'14px',
      }}>
        {tickers.map((ticker, i) => (
          <TickerCard
            key={ticker}
            ticker={ticker}
            data={insights[ticker]}
            forecast={forecasts?.[ticker]}
            accuracy={accuracy?.[ticker]}
            trust={trust?.[ticker]}
            color={COLORS[i % COLORS.length]}
          />
        ))}
      </div>
    </div>
  )
}
