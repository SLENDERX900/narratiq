import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../lib/supabase.js'
import DolphinLogo from '../components/DolphinLogo.jsx'

export default function AuthPage() {
  // Debug: Check if env vars are loaded
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const hasKey = !!import.meta.env.VITE_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !hasKey) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f8fafc' }}>
        <DolphinLogo size={48} />
        <h2 style={{ marginTop: '20px', fontSize: '18px', color: '#ef4444' }}>Configuration Error</h2>
        <p style={{ marginTop: '12px', color: '#64748b', textAlign: 'center' }}>
          Supabase environment variables not found.
        </p>
        <div style={{ marginTop: '20px', padding: '16px', background: '#f1f5f9', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace' }}>
          VITE_SUPABASE_URL: {supabaseUrl || 'NOT SET'}<br/>
          VITE_SUPABASE_ANON_KEY: {hasKey ? 'SET (hidden)' : 'NOT SET'}
        </div>
        <p style={{ marginTop: '16px', fontSize: '12px', color: '#94a3b8' }}>
          Please check your Vercel environment variables and redeploy.
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
