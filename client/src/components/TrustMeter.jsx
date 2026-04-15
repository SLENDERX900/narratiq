/**
 * TrustMeter — Sentiment Trustworthiness / Reliability Score
 *
 * Replaces the old "AI confidence" number.
 * Shows per-source reliability learned by the trust engine over time.
 */

function SourceBar({ label, reliability, weight, n }) {
  if (reliability == null) return null
  const pct = Math.round(reliability)
  const color = pct >= 70 ? '#16A34A' : pct >= 45 ? '#D97706' : '#DC2626'
  const bgColor = pct >= 70 ? '#F0FDF4' : pct >= 45 ? '#FFFBEB' : '#FFF1F2'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ width: '54px', fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '6px', background: 'var(--gray-100)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.6s ease' }} />
      </div>
      <span style={{
        fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600,
        color, minWidth: '34px', textAlign: 'right',
      }}>{pct}%</span>
      {n != null && n < 3 && (
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>~</span>
      )}
    </div>
  )
}

export default function TrustMeter({ trustScores, compact = false }) {
  const news   = trustScores?.news   ?? trustScores?.['news-derived'] ?? null
  const reddit = trustScores?.reddit ?? trustScores?.quiver_wsb       ?? null
  const macro  = trustScores?.macro  ?? null

  const allScores = [news?.reliability, reddit?.reliability, macro?.reliability].filter(v => v != null)
  const overall   = allScores.length > 0
    ? Math.round(allScores.reduce((s,v) => s+v, 0) / allScores.length)
    : null

  if (overall == null && !news && !reddit && !macro) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sentiment reliability</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Building… (needs 3+ runs)
        </span>
      </div>
    )
  }

  if (compact) {
    const color = overall >= 70 ? '#16A34A' : overall >= 45 ? '#D97706' : '#DC2626'
    const label = overall >= 70 ? 'High' : overall >= 45 ? 'Moderate' : 'Low'
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sentiment reliability</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '72px', height: '4px', background: 'var(--gray-100)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${overall}%`, height: '100%', background: color, borderRadius: '99px' }} />
          </div>
          <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>
            {overall}%
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
          Sentiment reliability
        </span>
        {overall != null && (
          <span style={{
            fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600,
            color: overall >= 70 ? '#16A34A' : overall >= 45 ? '#D97706' : '#DC2626',
          }}>
            {overall}% overall
          </span>
        )}
      </div>
      <SourceBar label="News" reliability={news?.reliability} n={news?.n} />
      <SourceBar label="Reddit" reliability={reddit?.reliability} n={reddit?.n} />
      <SourceBar label="Macro" reliability={macro?.reliability} n={macro?.n} />
    </div>
  )
}
