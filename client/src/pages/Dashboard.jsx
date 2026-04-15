import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useWatchlist } from '../hooks/useWatchlist.js'
import { useInsights } from '../hooks/useInsights.js'
import DolphinLogo from '../components/DolphinLogo.jsx'
import SearchBar from '../components/SearchBar.jsx'
import InsightCard from '../components/InsightCard.jsx'
import ComparisonMatrix from '../components/ComparisonMatrix.jsx'
import ExpandedCard from '../components/ExpandedCard.jsx'

function EmptyState() {
  return (
    <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      padding:'80px 20px', gap:'12px', color:'var(--text-muted)' }}>
      <DolphinLogo size={52} />
      <p style={{ fontSize:'16px', fontWeight:600, color:'var(--text-secondary)', marginTop:'8px' }}>
        Your watchlist is empty
      </p>
      <p style={{ fontSize:'13px' }}>Add a ticker above to start the AMIE analysis engine</p>
    </div>
  )
}

export default function Dashboard({ user }) {
  const { tickers, loading: wlLoading, addTicker, removeTicker } = useWatchlist()
  const { insights, history, forecasts, accuracy, trust, loading } = useInsights(tickers)
  const [view, setView] = useState('cards')
  const [expanded, setExpanded] = useState(null)

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
      {expanded && (
        <ExpandedCard
          ticker={expanded}
          data={insights[expanded]}
          forecast={forecasts[expanded]}
          onClose={() => setExpanded(null)}
        />
      )}

      <nav style={{
        background:'var(--surface)', borderBottom:'1px solid var(--border)',
        padding:'0 24px', height:'58px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:100, boxShadow:'var(--shadow-sm)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <DolphinLogo size={28} />
          <div>
            <span style={{ fontSize:'16px', fontWeight:700, letterSpacing:'-0.02em' }}>NarratiQ</span>
            <span style={{ fontSize:'10px', color:'var(--text-muted)', marginLeft:'8px',
              background:'var(--blue-50)', padding:'1px 6px', borderRadius:'99px',
              border:'1px solid var(--blue-100)', color:'var(--blue-700)', fontWeight:500 }}>
              AMIE
            </span>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          {tickers.length > 1 && (
            <div style={{ display:'flex', background:'var(--gray-100)', borderRadius:'8px', padding:'3px', gap:'2px' }}>
              {['cards','compare'].map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding:'5px 14px', borderRadius:'6px', fontSize:'12px', fontWeight:500,
                  background: view === v ? 'var(--surface)' : 'transparent',
                  color: view === v ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: view === v ? 'var(--shadow-sm)' : 'none',
                  transition:'all 0.15s', textTransform:'capitalize',
                }}>{v === 'compare' ? 'Compare' : 'Cards'}</button>
              ))}
            </div>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginLeft:'8px' }}>
            <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>{user.email}</span>
            <button onClick={() => supabase.auth.signOut()} style={{
              padding:'5px 12px', borderRadius:'8px', fontSize:'12px',
              color:'var(--text-secondary)', border:'1px solid var(--border)',
              background:'var(--surface)', transition:'all 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
            >Sign out</button>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth:'1200px', margin:'0 auto', padding:'28px 24px' }}>
        {/* Watchlist panel */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:'14px', padding:'18px 22px', marginBottom:'28px', boxShadow:'var(--shadow-sm)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
            <h2 style={{ fontSize:'14px', fontWeight:600 }}>Watchlist</h2>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              {loading && <span className="pulsing" style={{ fontSize:'11px', color:'var(--text-muted)' }}>Refreshing…</span>}
              <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>Auto-refresh 30s</span>
            </div>
          </div>
          <SearchBar onAdd={addTicker} existingTickers={tickers} />
          {tickers.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginTop:'12px' }}>
              {tickers.map(ticker => (
                <div key={ticker} style={{ display:'flex', alignItems:'center', gap:'3px',
                  padding:'3px 10px 3px 11px', background:'var(--blue-50)',
                  borderRadius:'99px', border:'1px solid var(--blue-100)' }}>
                  <span style={{ fontSize:'11px', fontWeight:700, color:'var(--blue-700)',
                    fontFamily:'var(--font-mono)' }}>{ticker}</span>
                  <button onClick={() => removeTicker(ticker)}
                    style={{ fontSize:'13px', color:'var(--blue-400)', lineHeight:1, padding:'0 2px' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        {wlLoading ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(330px,1fr))', gap:'18px' }}>
            {[1,2,3].map(i => (
              <div key={i} className="pulsing" style={{ height:'320px', background:'var(--surface)',
                borderRadius:'16px', border:'1px solid var(--border)' }} />
            ))}
          </div>
        ) : view === 'compare' && tickers.length > 1 ? (
          <ComparisonMatrix
            tickers={tickers} insights={insights} history={history}
            forecasts={forecasts} accuracy={accuracy} trust={trust}
          />
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(330px,1fr))', gap:'18px' }}>
            {tickers.length === 0 ? <EmptyState /> : tickers.map(ticker => (
              <InsightCard
                key={ticker} ticker={ticker}
                data={insights[ticker]} forecast={forecasts[ticker]}
                trustScores={trust[ticker]}
                onRemove={removeTicker}
                onExpand={setExpanded}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
