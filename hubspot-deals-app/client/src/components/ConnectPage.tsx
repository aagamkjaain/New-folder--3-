import React from 'react'
import './../App.css'

export default function ConnectPage() {
  return (
    <div className="connect-landing">
      <div className="connect-card">
        <div className="connect-top">
          <div className="logo-large" />
        </div>
        <h1>HubSpot Deals App</h1>
        <div className="badge">Not Connected</div>
        <p className="connect-desc">Connect your HubSpot account to view deals, contacts, and companies in one place.</p>
        <a className="connect-btn" href="/auth/hubspot">Connect HubSpot</a>

        <div className="features-box">
          <div className="features-title">WHAT YOU'LL GET ACCESS TO:</div>
          <ul className="features-list">
            <li><span className="check">✓</span> View all your deals</li>
            <li><span className="check">✓</span> See associated contacts</li>
            <li><span className="check">✓</span> See associated companies</li>
            <li><span className="check">✓</span> Real-time data sync</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
