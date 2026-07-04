'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Moon, Sun, Monitor, Info, Shield, ArrowRight } from 'lucide-react'

export default function MenuPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'auto', padding: '14px 18px 18px', height: '100%' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#172027', fontFamily: 'Sora, Manrope, sans-serif', margin: 0 }}>Menu</h2>

      <section>
        <h3 className="eyebrow" style={{ marginBottom: '8px' }}>Profile</h3>
        <div className="hero-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#dff6ee', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontWeight: 700, color: '#087b68' }}>C</span>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#172027', margin: 0 }}>Commuter</p>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Demo mode</p>
          </div>
          <button onClick={() => router.push('/operator')} className="text-button" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>Switch to operator <ArrowRight size={12} /></button>
        </div>
      </section>

      <section>
        <h3 className="eyebrow" style={{ marginBottom: '8px' }}>Preferences</h3>
        <div className="hero-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#4f616b', marginBottom: '8px' }}>Theme</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'System', icon: Monitor }].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setTheme(id)} className={theme === id ? 'button primary' : 'button'} style={{ fontSize: '12px', padding: '6px 12px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}><Icon size={14} /> {label}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#4f616b', marginBottom: '4px' }}>Language</p>
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>English (more coming soon)</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="eyebrow" style={{ marginBottom: '8px' }}>About</h3>
        <div className="hero-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Info size={16} style={{ color: '#087b68' }} />
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#4f616b', margin: 0 }}>What is Re-LoadSense?</p>
          </div>
          <p style={{ fontSize: '13px', color: '#4f616b', margin: 0 }}>PUV occupancy intelligence platform — tells commuters how full the next jeepney is, helps operators manage fleets, gives regulators city-wide data.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #d9e4e7' }}>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#fff8ef', color: '#8f5308', fontWeight: 700 }}>SIM DATA</span>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>All vehicle data is simulated.</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="eyebrow" style={{ marginBottom: '8px' }}>Data & Privacy</h3>
        <div className="hero-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Shield size={16} style={{ color: '#087b68' }} />
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#4f616b', margin: 0 }}>Your Data</p>
          </div>
          <p style={{ fontSize: '13px', color: '#4f616b', margin: 0 }}>Chatbot queries are PII-redacted. No personal data collected in this demo.</p>
        </div>
      </section>

      <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>Re-LoadSense v0.1.0 — Cebu Demo</p>
    </div>
  )
}
