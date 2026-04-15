import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || ''

export function useInsights(tickers) {
  const [insights,  setInsights]  = useState({})
  const [history,   setHistory]   = useState({})
  const [forecasts, setForecasts] = useState({})
  const [accuracy,  setAccuracy]  = useState({})
  const [trust,     setTrust]     = useState({})
  const [loading,   setLoading]   = useState(false)
  const tickerKey = (tickers || []).join(',')

  const fetchAll = useCallback(async () => {
    if (!tickers?.length) return
    setLoading(true)
    try {
      const [latestRes, histRes, accRes, trustRes] = await Promise.all([
        fetch(`${API}/api/insights?tickers=${tickerKey}`),
        fetch(`${API}/api/insights/history?tickers=${tickerKey}&limit=48`),
        fetch(`${API}/api/forecast/accuracy?tickers=${tickerKey}`),
        fetch(`${API}/api/forecast/trust?tickers=${tickerKey}`),
      ])

      if (latestRes.ok) {
        const d = await latestRes.json()
        const m = {}; d.forEach(i => { if (i?.ticker) m[i.ticker] = i }); setInsights(m)
      }
      if (histRes.ok)   setHistory(await histRes.json())
      if (accRes.ok)    setAccuracy(await accRes.json())
      if (trustRes.ok)  setTrust(await trustRes.json())

      if (tickers.length > 0) {
        const fRes = await Promise.all(
          tickers.map(t => fetch(`${API}/api/forecast/${t}`).then(r => r.ok ? r.json() : null).catch(()=>null))
        )
        const fm = {}
        fRes.forEach((f, i) => { if (f) fm[tickers[i]] = f })
        setForecasts(fm)
      }
    } catch (e) { console.error('Fetch failed', e) }
    finally { setLoading(false) }
  }, [tickerKey])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 30000)
    return () => clearInterval(iv)
  }, [fetchAll])

  return { insights, history, forecasts, accuracy, trust, loading, refetch: fetchAll }
}
