import { useState } from 'react'

export default function SearchBar({ onAdd, existingTickers = [] }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const ticker = value.toUpperCase().trim()
    if (!ticker) return
    if (existingTickers.includes(ticker)) {
      setError(`${ticker} is already in your watchlist`)
      return
    }
    setLoading(true)
    setError('')
    const ok = await onAdd(ticker)
    if (ok) {
      setValue('')
    } else {
      setError('Could not add ticker — check the symbol and try again')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          value={value}
          onChange={e => { setValue(e.target.value.toUpperCase()); setError('') }}
          placeholder="Add ticker — e.g. AAPL, TSLA, NVDA"
          maxLength={10}
          style={{
            flex: 1,
            height: '44px',
            padding: '0 16px',
            border: `1.5px solid ${error ? 'var(--red-500)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-md)',
            fontSize: '14px',
            fontFamily: 'var(--font-mono)',
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { if (!error) e.target.style.borderColor = 'var(--blue-500)' }}
          onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border)' }}
        />
        <button
          type="submit"
          disabled={loading || !value}
          style={{
            height: '44px',
            padding: '0 20px',
            background: loading || !value ? 'var(--gray-200)' : 'var(--blue-600)',
            color: loading || !value ? 'var(--gray-400)' : 'white',
            borderRadius: 'var(--radius-md)',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Adding…' : '+ Add'}
        </button>
      </div>
      {error && (
        <span style={{ fontSize: '12px', color: 'var(--red-500)', paddingLeft: '4px' }}>
          {error}
        </span>
      )}
    </form>
  )
}
