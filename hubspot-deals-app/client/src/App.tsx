import React, { useState, useEffect } from 'react'
import Deals from './components/Deals'
import Contacts from './components/Contacts'
import Campaigns from './components/Campaigns'
import Tickets from './components/Tickets'
import Realization from './components/Realization'
import './App.css'
import ConnectPage from './components/ConnectPage'
import { authStatus } from './services/api'

type Tab = 'deals' | 'contacts' | 'campaigns' | 'tickets' | 'realization'

export default function App() {
  const [tab, setTab] = useState<Tab>('deals')
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    authStatus().then(s => { if (mounted) setAuthenticated(!!s.authenticated) }).catch(() => { if (mounted) setAuthenticated(false) })
    return () => { mounted = false }
  }, [])

  return (
    <div className="app-root">
      <header className="navbar">
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div className="brand"><span className="logo"/>HubSpot Deals App</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div className="tabs">
            <button className={`tab ${tab === 'deals' ? 'active' : ''}`} onClick={() => setTab('deals')}>📊 Deals</button>
            <button className={`tab ${tab === 'contacts' ? 'active' : ''}`} onClick={() => setTab('contacts')}>👥 All Contacts</button>
            <button className={`tab ${tab === 'campaigns' ? 'active' : ''}`} onClick={() => setTab('campaigns')}>📈 Campaigns</button>
            <button className={`tab ${tab === 'tickets' ? 'active' : ''}`} onClick={() => setTab('tickets')}>🎫 Tickets</button>
            <button className={`tab ${tab === 'realization' ? 'active' : ''}`} onClick={() => setTab('realization')}>🧠 AI Value Realization</button>
          </div>

          {authenticated === false && (
            <a href="/auth/hubspot" className="connect-cta">Connect HubSpot</a>
          )}
          {authenticated && (
            <a href="/auth/logout" style={{marginLeft:12,color:'#d63649',textDecoration:'none'}}>Disconnect</a>
          )}
        </div>
      </header>

      {authenticated === false && (
        <ConnectPage />
      )}

      <main className="container">
        {tab === 'deals' && <Deals />}
        {tab === 'contacts' && <Contacts />}
        {tab === 'campaigns' && <Campaigns />}
        {tab === 'tickets' && <Tickets />}
        {tab === 'realization' && <Realization />}
      </main>
    </div>
  )
}
