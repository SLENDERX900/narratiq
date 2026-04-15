import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../lib/supabase.js'
import DolphinLogo from '../components/DolphinLogo.jsx'

export default function AuthPage() {
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
