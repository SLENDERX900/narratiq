/**
 * SessionBadge — shows current market session status and active rules
 * Reads from the session context returned by /api/forecast/:ticker
 */

const SESSION_STYLES = {
  'Regular Session': { bg: '#F0FDF4', color: '#16A34A', dot: '#16A34A', label: 'Live' },
  'Pre-Market':      { bg: '#FFFBEB', color: '#D97706', dot: '#D97706', label: 'Pre-Market' },
  'Post-Market':     { bg: '#EFF6FF', color: '#2563EB', dot: '#2563EB', label: 'Post-Market' },
  'Lunch Break':     { bg: '#F1F5F9', color: '#64748B', dot: '#94A3B8', label: 'Lunch' },
  'Closed':          { bg: '#F1F5F9', color: '#64748B', dot: '#94A3B8', label: 'Closed' },
}

const RULE_COLORS = {
  success: '#16A34A',
  warning: '#D97706',
  danger:  '#DC2626',
  info:    '#2563EB',
}

export default function SessionBadge({ session, rules = [], compact = false }) {
  if (!session) return null
  const style = SESSION_STYLES[session.sessionLabel] ?? SESSION_STYLES['Closed']

  const dangerRules  = (rules || []).filter(r => r.severity === 'danger')
  const warningRules = (rules || []).filter(r => r.severity === 'warning')
  const successRules = (rules || []).filter(r => r.severity === 'success')

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%',
          background: style.dot,
          boxShadow: session.isMarketOpen ? `0 0 0 2px ${style.dot}30` : 'none',
        }} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: style.color }}>
          {style.label}
        </span>
        {session.currentMYT && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{session.currentMYT}</span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Session pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '99px',
            background: style.bg, color: style.color,
            fontSize: '11px', fontWeight: 600,
            border: `1px solid ${style.dot}30`,
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%', background: style.dot,
              ...(session.isMarketOpen ? { animation: 'pulse 2s infinite' } : {}),
            }} />
            {session.sessionLabel}
          </span>
          {session.exchangeLabel && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{session.exchangeLabel}</span>
          )}
        </div>
        {session.currentMYT && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {session.currentMYT}
          </span>
        )}
      </div>

      {/* Time context */}
      {session.isMarketOpen && session.timeToCloseMin != null && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {session.timeToCloseMin < 30
            ? <span style={{ color: '#D97706' }}>⚠ {session.timeToCloseMin}min to close</span>
            : `${session.timeToCloseMin}min to close`}
        </div>
      )}
      {session.isPreMarket && session.timeToCloseMin != null && (
        <div style={{ fontSize: '11px', color: '#D97706' }}>
          Pre-market forecast window — {session.timeToCloseMin}min until open
        </div>
      )}
      {session.isOverlap && (
        <div style={{ fontSize: '11px', color: '#16A34A' }}>
          ↗ US/London overlap — peak liquidity window
        </div>
      )}

      {/* Active rules */}
      {rules?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {rules.map((rule, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '10px', color: RULE_COLORS[rule.severity] || 'var(--text-muted)',
            }}>
              <span style={{
                width: '4px', height: '4px', borderRadius: '50%',
                background: RULE_COLORS[rule.severity] || 'var(--text-muted)', flexShrink: 0,
              }} />
              <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>{rule.rule}</span>
              <span>{rule.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
