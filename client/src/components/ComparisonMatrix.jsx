import { useState } from 'react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import SentimentBadge from './SentimentBadge.jsx'
import TrustMeter from './TrustMeter.jsx'
import { AccuracyChart } from './ForecastChart.jsx'

const COLORS = ['#2563EB','#16A34A','#DC2626','#9333EA','#D97706','#0891B2']

function fmt(iso) {
  const d = new Date(iso)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:00`
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

// Single unified multi-ticker chart with mode control
function UnifiedChart({ tickers, history, forecasts, mode }) {
  // Build merged timeline
  const timeMap = {}
  tickers.forEach(ticker => {
    const rows = history[ticker] || []
    rows.forEach(row => {
      const t = fmt(row.generated_at)
      if (!timeMap[t]) timeMap[t] = { time: t }
      if (mode === 'price' || mode === 'both') {
        timeMap[t][`${ticker}_actual`] = parseFloat(row.price)
        if (row.forecast_price) timeMap[t][`${ticker}_forecast`] = parseFloat(row.forecast_price)
        if (row.implied_price) timeMap[t][`${ticker}_implied`] = parseFloat(row.implied_price)
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
        <code style={{ fontSize:'11px', background:'var(--gray-100)', padding:'4px 10px',
          borderRadius:'6px', fontFamily:'var(--font-mono)' }}>
          curl -X POST http://localhost:3001/api/pipeline/run
        </code>
      </div>
    )
  }

  // Need dual Y-axes when showing both price and sentiment
  const hasPriceAxis    = mode === 'price' || mode === 'both'
  const hasSentAxis     = mode === 'sentiment' || mode === 'both'

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
            hasPriceAxis && (
              <Line key={`${ticker}_forecast`} yAxisId="price" type="monotone"
                dataKey={`${ticker}_forecast`} stroke={color} strokeWidth={1.5}
                strokeDasharray="5 3" dot={false} connectNulls name={`${ticker} forecast`} />
            ),
            hasPriceAxis && (
              <Line key={`${ticker}_implied`} yAxisId="price" type="monotone"
                dataKey={`${ticker}_implied`} stroke={color} strokeWidth={1}
                strokeDasharray="2 4" dot={false} connectNulls name={`${ticker} sentiment-implied`} />
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

// Per-ticker stat card in the comparison grid
function TickerCard({ ticker, data, forecast, accuracy, trust, color }) {
  const fd = forecast?.forecast
  const hasML = fd && !fd.insufficient_data
  const avgAcc = accuracy?.length
    ? accuracy.filter(r => r.accuracy_pct != null).reduce((s,r,_,a) => s + r.accuracy_pct/a.length, 0)
    : null

  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderTop:`3px solid ${color}`, borderRadius:'12px', padding:'14px 16px',
      boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column', gap:'10px',
    }}>
      {/* Header */}
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

      {/* Forecast row */}
      {hasML && (
        <div style={{
          padding:'8px 10px', borderRadius:'8px',
          background: fd.predicted_change >= 0 ? '#F0FDF4' : '#FFF1F2',
          border:`1px solid ${fd.predicted_change >= 0 ? '#bbf7d0' : '#fecaca'}`,
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'10px', color:'var(--text-muted)' }}>ML forecast</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'13px', fontWeight:700,
              color: fd.predicted_change >= 0 ? '#16A34A' : '#DC2626' }}>
              {fd.predicted_change >= 0 ? '+' : ''}{fd.predicted_change?.toFixed(2)}%
            </span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:'3px' }}>
            <span style={{ fontSize:'10px', color:'var(--text-muted)' }}>
              95% CI: [{fd.lower_bound?.toFixed(1)}%, {fd.upper_bound?.toFixed(1)}%]
            </span>
            <span style={{ fontSize:'10px', fontFamily:'var(--font-mono)', color:'var(--text-muted)' }}>
              R²={fd.r2?.toFixed(3)}
            </span>
          </div>
        </div>
      )}

      {/* Price divergence signal */}
      {fd?.price_divergence != null && Math.abs(fd.price_divergence) > 0.5 && (
        <div style={{ fontSize:'11px', color:'var(--text-muted)', padding:'5px 8px',
          background:'var(--gray-50)', borderRadius:'6px', border:'1px solid var(--border)' }}>
          {fd.price_divergence > 0
            ? `↑ Price $${Math.abs(fd.price_divergence).toFixed(2)} above sentiment signal`
            : `↓ Price $${Math.abs(fd.price_divergence).toFixed(2)} below sentiment signal`}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'6px' }}>
        {[
          { label:'Forecast acc.', value: avgAcc != null ? `${avgAcc.toFixed(0)}%` : '—' },
          { label:'Model R²',      value: fd?.r2 != null ? fd.r2.toFixed(3) : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign:'center', padding:'5px',
            background:'var(--gray-50)', borderRadius:'6px' }}>
            <p style={{ fontSize:'9px', color:'var(--text-muted)', marginBottom:'2px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</p>
            <p style={{ fontSize:'13px', fontWeight:700, fontFamily:'var(--font-mono)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Accuracy mini chart */}
      {accuracy?.length > 2 && <AccuracyChart accuracyHistory={accuracy} />}

      {/* Trust meter */}
      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'8px' }}>
        <TrustMeter trustScores={trust} compact={false} />
      </div>

      {/* Narrative snippet */}
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

      {/* Controls */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px' }}>
        <h2 style={{ fontSize:'14px', fontWeight:600, color:'var(--text-secondary)' }}>
          Comparing {tickers.join(', ')} — actual vs forecast vs sentiment-implied
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

      {/* Color legend */}
      <div style={{ display:'flex', gap:'16px', flexWrap:'wrap', fontSize:'11px' }}>
        {tickers.map((t, i) => (
          <div key={t} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
            <div style={{ width:'12px', height:'3px', background:COLORS[i%COLORS.length], borderRadius:'2px' }} />
            <span style={{ color:'var(--text-secondary)', fontFamily:'var(--font-mono)', fontWeight:600 }}>{t}</span>
          </div>
        ))}
        {(mode === 'price' || mode === 'both') && <>
          <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
            <div style={{ width:'16px', borderTop:'2px dashed var(--gray-400)' }} />
            <span style={{ color:'var(--text-muted)' }}>ML forecast</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
            <div style={{ width:'16px', borderTop:'1px dotted var(--gray-400)' }} />
            <span style={{ color:'var(--text-muted)' }}>Sentiment-implied</span>
          </div>
        </>}
      </div>

      {/* Main unified chart */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:'14px', padding:'20px', boxShadow:'var(--shadow-sm)' }}>
        <UnifiedChart tickers={tickers} history={history} forecasts={forecasts} mode={mode} />
        <p style={{ fontSize:'10px', color:'var(--text-muted)', textAlign:'center', marginTop:'8px' }}>
          {mode === 'both'
            ? 'Solid = actual price · Dashed = ML forecast · Dotted = sentiment-implied price · Shaded = AI sentiment score'
            : mode === 'price'
            ? 'Solid = actual · Dashed = ML next-hour forecast · Dotted = what price SHOULD be based on sentiment alone'
            : 'AI sentiment score per ticker over time (−1 bearish → +1 bullish)'}
        </p>
      </div>

      {/* Per-ticker cards grid */}
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
