import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const API = import.meta.env.VITE_API_URL || ''

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export function useWatchlist() {
  const [tickers, setTickers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchWatchlist = useCallback(async () => {
    const headers = await getAuthHeader()
    try {
      const res = await fetch(`${API}/api/watchlist`, { headers })
      if (res.ok) {
        const data = await res.json()
        setTickers(data.map(d => d.ticker))
      }
    } catch (e) {
      console.error('Watchlist fetch failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchWatchlist() }, [fetchWatchlist])

  const addTicker = useCallback(async (ticker) => {
    const t = ticker.toUpperCase().trim()
    if (!t || tickers.includes(t)) return false
    const headers = await getAuthHeader()
    const res = await fetch(`${API}/api/watchlist`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: t }),
    })
    if (res.ok) { setTickers(prev => [...prev, t]); return true }
    return false
  }, [tickers])

  const removeTicker = useCallback(async (ticker) => {
    const headers = await getAuthHeader()
    const res = await fetch(`${API}/api/watchlist/${ticker}`, {
      method: 'DELETE', headers,
    })
    if (res.ok) setTickers(prev => prev.filter(t => t !== ticker))
  }, [])

  return { tickers, loading, addTicker, removeTicker, refetch: fetchWatchlist }
}
