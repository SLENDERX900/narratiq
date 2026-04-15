import { useState, useEffect } from 'react'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../lib/supabase.js'
import DolphinLogo from '../components/DolphinLogo.jsx'

export default function AuthPage() {
  const [debug, setDebug] = useState({ loading: true, error: null, env: {} })
  
  useEffect(() => {
    const envUrl = import.meta.env.VITE_SUPABASE_URL
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    
    // Test Supabase connection
    supabase.auth.getSession().then(({ data, error }) => {
      setDebug({
        loading: false,
        error: error?.message || null,
        env: {
          url: envUrl || 'NOT SET',
          keyPresent: !!envKey,
          keyPrefix: envKey ? envKey.substring(0, 20) + '...' : 'NONE'
        },
        session: data?.session ? 'EXISTS' : 'NONE'
      })
    }).catch(err => {
      setDebug({
        loading: false,
        error: err.message,
        env: {
          url: envUrl || 'NOT SET',
          keyPresent: !!envKey,
          keyPrefix: envKey ? envKey.substring(0, 20) + '...' : 'NONE'
        }
      })
    })
  }, [])
  
  if (debug.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <DolphinLogo size={48} />
        <p style={{ marginLeft: '16px', color: '#64748b' }}>Checking configuration...</p>
      </div>
    )
  }
  
  if (!debug.env.url || !debug.env.keyPresent || debug.error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f8fafc' }}>
        <DolphinLogo size={48} />
        <h2 style={{ marginTop: '20px', fontSize: '18px', color: '#ef4444' }}>Configuration Error</h2>
        <div style={{ marginTop: '20px', padding: '20px', background: '#f1f5f9', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace', maxWidth: '500px', wordBreak: 'break-all' }}>
          <strong>Environment Variables:</strong><br/>
          VITE_SUPABASE_URL: {debug.env.url}<br/><br/>
          VITE_SUPABASE_ANON_KEY: {debug.env.keyPresent ? debug.env.keyPrefix : 'NOT SET'}<br/><br/>
          <strong>Connection Error:</strong><br/>
          {debug.error || 'No error - but vars missing'}
        </div>
        <p style={{ marginTop: '16px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
          Please check Vercel Dashboard → Settings → Environment Variables<br/>
          Then redeploy the project
        </p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px',
      background: 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 50%, #F0FDF4 100%)',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
        padding: '40px', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <DolphinLogo size={40} />
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '-0.02em' }}>NarratiQ</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Market narrative intelligence</p>
          </div>
        </div>
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: { brand: '#2563EB', brandAccent: '#1D4ED8' },
                fonts: {
                  bodyFontFamily: `'DM Sans', sans-serif`,
                  buttonFontFamily: `'DM Sans', sans-serif`,
                  inputFontFamily: `'DM Sans', sans-serif`,
                },
                radii: { borderRadiusButton: '10px', inputBorderRadius: '10px' },
              },
            },
          }}
          providers={[]}
        />
      </div>
    </div>
  )
}
