import {
  ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

function formatTime(unixTs) {
  const d = new Date(unixTs * 1000)
  return `${d.getHours()}:00`
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
      fontSize: '12px',
      boxShadow: 'var(--shadow-md)',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, fontFamily: 'var(--font-mono)' }}>
          {p.name}: {p.name === 'Price' ? `$${p.value?.toFixed(2)}` : p.value?.toFixed(2)}
        </p>
      ))}
    </div>
  )
}

export default function SentimentChart({ candles, sentimentScore }) {
  if (!candles?.length) {
    return (
      <div style={{
        height: 180, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px',
      }}>
        No chart data available yet
      </div>
    )
  }

  // Overlay flat sentiment score across all candles for visual context
  const data = candles.slice(-12).map(c => ({
    time: formatTime(c.t),
    Price: c.c,
    Sentiment: sentimentScore != null ? parseFloat(sentimentScore.toFixed(2)) : null,
  }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          tickLine={false} axisLine={false}
        />
        <YAxis
          yAxisId="price"
          orientation="left"
          tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          tickLine={false} axisLine={false}
          tickFormatter={v => `$${v.toFixed(0)}`}
          width={52}
        />
        <YAxis
          yAxisId="sentiment"
          orientation="right"
          domain={[-1, 1]}
          tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          tickLine={false} axisLine={false}
          width={32}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          yAxisId="sentiment"
          type="monotone"
          dataKey="Sentiment"
          fill={sentimentScore > 0 ? '#DCFCE7' : sentimentScore < 0 ? '#FEF2F2' : '#F1F5F9'}
          stroke={sentimentScore > 0 ? '#22C55E' : sentimentScore < 0 ? '#EF4444' : '#94A3B8'}
          strokeWidth={1.5}
          dot={false}
        />
        <Line
          yAxisId="price"
          type="monotone"
          dataKey="Price"
          stroke="#2563EB"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#2563EB' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
