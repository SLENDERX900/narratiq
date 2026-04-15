import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || ''

export function useInsights(tickers) {
  const [insights, setInsights] = useState({})
  const [history, setHistory] = useState({})
  const [loading, setLoading] = useState(false)
  const tickerKey = (tickers || []).join(',')

  const fetchInsights = useCallback(async () => {
    if (!tickers?.length) return
    setLoading(true)
    try {
      const [latestRes, historyRes] = await Promise.all([
        fetch(`${API}/api/insights?tickers=${tickerKey}`),
        fetch(`${API}/api/insights/history?tickers=${tickerKey}&limit=48`),
      ])
      if (latestRes.ok) {
        const data = await latestRes.json()
        const map = {}
        data.forEach(item => { if (item?.ticker) map[item.ticker] = item })
        setInsights(map)
      }
      if (historyRes.ok) {
        const data = await historyRes.json()
        setHistory(data)
      }
    } catch (e) {
      console.error('Insights fetch failed', e)
    } finally {
      setLoading(false)
    }
  }, [tickerKey])

  useEffect(() => {
    fetchInsights()
    const interval = setInterval(fetchInsights, 30000)
    return () => clearInterval(interval)
  }, [fetchInsights])

  return { insights, history, loading, refetch: fetchInsights }
}
