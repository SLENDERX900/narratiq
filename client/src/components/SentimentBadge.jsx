export default function SentimentBadge({ category, score }) {
  const config = {
    bullish: { bg: 'var(--green-50)', color: 'var(--green-600)', label: 'Bullish' },
    bearish: { bg: 'var(--red-50)',   color: 'var(--red-600)',   label: 'Bearish' },
    neutral: { bg: 'var(--gray-100)', color: 'var(--gray-600)', label: 'Neutral' },
  }
  const c = config[category] || config.neutral

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 10px',
      borderRadius: '99px',
      background: c.bg,
      color: c.color,
      fontSize: '12px',
      fontWeight: 600,
      letterSpacing: '0.02em',
    }}>
      <span style={{
        width: '6px', height: '6px',
        borderRadius: '50%',
        background: c.color,
        flexShrink: 0,
      }} />
      {c.label}
      {score !== undefined && (
        <span style={{ opacity: 0.7, fontWeight: 400 }}>
          {score > 0 ? '+' : ''}{score.toFixed(2)}
        </span>
      )}
    </span>
  )
}
