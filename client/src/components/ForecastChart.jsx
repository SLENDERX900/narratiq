import {
  ComposedChart, Line, Area, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'

function fmt(iso) {
  const d = new Date(iso)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:00`
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'8px', padding:'9px 13px', fontSize:'11px', boxShadow:'var(--shadow-md)' }}>
      <p style={{ color:'var(--text-muted)', marginBottom:'5px', fontWeight:500 }}>{label}</p>
      {payload.map((p,i) => p.value != null && (
        <p key={i} style={{ color:p.color||'var(--text-primary)', fontFamily:'var(--font-mono)', marginBottom:'2px' }}>
          {p.name}: {p.name?.toLowerCase().includes('price') ? `$${Number(p.value).toFixed(2)}` : `${Number(p.value).toFixed(3)}%`}
        </p>
      ))}
    </div>
  )
}

// Forecast vs Actual price — the primary comparison chart
export function ForecastVsActualChart({ history, forecastData, height = 220 }) {
  const forecast = forecastData?.forecast
  const predictions = forecastData?.predictions || []

  if (!history?.length) return (
    <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center',
      flexDirection:'column', gap:'6px', color:'var(--text-muted)' }}>
      <p style={{ fontSize:'13px' }}>No data yet</p>
      <p style={{ fontSize:'11px' }}>Run the pipeline to generate forecasts</p>
    </div>
  )

  const predMap = {}
  predictions.forEach(p => { predMap[fmt(p.time)] = p.predicted })

  const chartData = history.map(row => ({
    time: fmt(row.generated_at),
    actualPrice: parseFloat(row.price),
    forecastPrice: row.forecast_price ? parseFloat(row.forecast_price) : null,
    impliedPrice: row.implied_price ? parseFloat(row.implied_price) : null,
  }))

  // Project next-hour forecast point
  if (forecast && !forecast.insufficient_data && history.length > 0) {
    const last = history[history.length - 1]
    const futureMs = new Date(last.generated_at).getTime() + 3600000
    const lp = parseFloat(last.price)
    chartData.push({
      time: fmt(new Date(futureMs).toISOString()),
      actualPrice: null,
      forecastPrice: forecast.forecast_price,
      ciUpper: forecast.upper_bound != null ? lp*(1+forecast.upper_bound/100) : null,
      ciLower: forecast.lower_bound != null ? lp*(1+forecast.lower_bound/100) : null,
    })
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top:8, right:12, bottom:0, left:4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="time"
          tick={{ fontSize:10, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }}
          tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis orientation="left"
          tick={{ fontSize:10, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }}
          tickLine={false} axisLine={false} tickFormatter={v=>`$${v.toFixed(0)}`} width={52} />
        <Tooltip content={<ChartTip />} />
        {/* CI band */}
        <Area dataKey="ciUpper" fill="#DBEAFE" stroke="none" dot={false} connectNulls legendType="none" name="CI upper" />
        <Area dataKey="ciLower" fill="var(--surface)" stroke="none" dot={false} connectNulls legendType="none" name="CI lower" />
        {/* Implied price (pure sentiment-derived) */}
        <Line type="monotone" dataKey="impliedPrice" stroke="#9333EA" strokeWidth={1}
          strokeDasharray="2 4" dot={false} connectNulls name="Sentiment-implied price" />
        {/* Actual price */}
        <Line type="monotone" dataKey="actualPrice" stroke="#2563EB" strokeWidth={2.5}
          dot={false} activeDot={{ r:4 }} connectNulls name="Actual price" />
        {/* ML forecast */}
        <Line type="monotone" dataKey="forecastPrice" stroke="#16A34A" strokeWidth={1.5}
          strokeDasharray="5 3" dot={false} connectNulls name="ML forecast" />
        <Legend wrapperStyle={{ fontSize:'10px', paddingTop:'8px' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// Feature importance — what drives this ticker
export function FeatureImportanceChart({ featureImportance }) {
  if (!featureImportance?.length) return null
  const COLORS = ['#2563EB','#16A34A','#9333EA','#D97706','#DC2626','#0891B2','#64748B','#475569']
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
      {featureImportance.slice(0,6).map((f, i) => (
        <div key={f.name} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <span style={{ width:'116px', fontSize:'11px', color:'var(--text-secondary)',
            flexShrink:0, textAlign:'right' }}>{f.label}</span>
          <div style={{ flex:1, height:'7px', background:'var(--gray-100)', borderRadius:'99px', overflow:'hidden' }}>
            <div style={{ width:`${f.importance}%`, height:'100%',
              background: COLORS[i % COLORS.length], borderRadius:'99px',
              transition:'width 0.7s ease' }} />
          </div>
          <span style={{ width:'36px', fontSize:'11px', fontFamily:'var(--font-mono)',
            color:'var(--text-muted)', textAlign:'right' }}>{f.importance}%</span>
        </div>
      ))}
    </div>
  )
}

// Learning curve
export function LearningCurveChart({ trainErrors }) {
  if (!trainErrors?.length) return null
  const data = trainErrors.map((e,i) => ({ iter:i+1, rmse:e }))
  return (
    <ResponsiveContainer width="100%" height={90}>
      <ComposedChart data={data} margin={{ top:4, right:8, bottom:0, left:0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="iter" tick={{ fontSize:9, fill:'var(--text-muted)' }}
          tickLine={false} axisLine={false} interval={9} />
        <YAxis tick={{ fontSize:9, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }}
          tickLine={false} axisLine={false} width={34} tickFormatter={v=>v.toFixed(2)} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null
          return (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:'6px', padding:'6px 10px', fontSize:'11px' }}>
              <p style={{ fontFamily:'var(--font-mono)', color:'var(--text-secondary)' }}>
                Iter {payload[0]?.payload?.iter}: {payload[0]?.value?.toFixed(4)} RMSE
              </p>
            </div>
          )
        }} />
        <Line type="monotone" dataKey="rmse" stroke="#2563EB" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// Predicted vs actual scatter — the core "is buzz accurate?" visual
export function PredictedVsActualChart({ predictions }) {
  if (!predictions?.length || predictions.length < 3) return (
    <div style={{ height:140, display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:'12px', color:'var(--text-muted)' }}>
      Need more data points for scatter chart
    </div>
  )

  const data = predictions.map(p => ({
    actual: parseFloat(p.actual?.toFixed(3)) || 0,
    predicted: parseFloat(p.predicted?.toFixed(3)) || 0,
  }))

  const maxAbs = Math.max(...data.map(d => Math.max(Math.abs(d.actual), Math.abs(d.predicted))), 0.5)
  const domain = [-maxAbs * 1.3, maxAbs * 1.3]

  // Build as line chart with scatter using data points as reference lines
  const lineData = [
    { x: domain[0], perfect: domain[0] },
    { x: 0, perfect: 0 },
    { x: domain[1], perfect: domain[1] },
  ]

  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart margin={{ top:8, right:8, bottom:20, left:4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" dataKey="actual" data={data} domain={domain}
            tick={{ fontSize:9, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }}
            tickLine={false} axisLine={false} tickFormatter={v=>`${v.toFixed(1)}%`}
            label={{ value:'Actual Δ%', position:'insideBottom', offset:-10, fontSize:9, fill:'var(--text-muted)' }} />
          <YAxis type="number" dataKey="predicted" domain={domain}
            tick={{ fontSize:9, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }}
            tickLine={false} axisLine={false} tickFormatter={v=>`${v.toFixed(1)}%`} width={36} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0]?.payload
            return (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
                borderRadius:'6px', padding:'7px 11px', fontSize:'11px' }}>
                <p style={{ fontFamily:'var(--font-mono)', color:'var(--text-muted)', marginBottom:'3px' }}>
                  Actual: {d?.actual?.toFixed(3)}%
                </p>
                <p style={{ fontFamily:'var(--font-mono)', color:'#2563EB' }}>
                  Predicted: {d?.predicted?.toFixed(3)}%
                </p>
              </div>
            )
          }} />
          <ReferenceLine segment={[{x:domain[0],y:domain[0]},{x:domain[1],y:domain[1]}]}
            stroke="var(--border)" strokeDasharray="4 2" />
          <ReferenceLine x={0} stroke="var(--border)" strokeOpacity={0.4} />
          <ReferenceLine y={0} stroke="var(--border)" strokeOpacity={0.4} />
          <Scatter data={data} fill="#2563EB" fillOpacity={0.65} r={4} name="Observations" />
        </ComposedChart>
      </ResponsiveContainer>
      <p style={{ fontSize:'10px', color:'var(--text-muted)', textAlign:'center', marginTop:'2px' }}>
        Points on diagonal = perfect predictions · Scatter from line = model error
      </p>
    </div>
  )
}

// Forecast accuracy over time
export function AccuracyChart({ accuracyHistory }) {
  if (!accuracyHistory?.length) return null
  const data = accuracyHistory.filter(r => r.accuracy_pct != null)
    .map(r => ({ time: fmt(r.generated_at), accuracy: parseFloat(r.accuracy_pct) }))
  if (data.length < 2) return null

  return (
    <ResponsiveContainer width="100%" height={80}>
      <ComposedChart data={data} margin={{ top:4, right:8, bottom:0, left:0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize:9, fill:'var(--text-muted)' }}
          tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0,100]}
          tick={{ fontSize:9, fill:'var(--text-muted)', fontFamily:'var(--font-mono)' }}
          tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`} width={28} />
        <ReferenceLine y={70} stroke="#16A34A" strokeDasharray="3 3" strokeOpacity={0.4} />
        <Area type="monotone" dataKey="accuracy" fill="#DCFCE7" stroke="#16A34A"
          strokeWidth={1.5} dot={false} name="Accuracy %" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
