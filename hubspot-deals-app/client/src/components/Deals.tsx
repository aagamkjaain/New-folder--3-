import React, { useEffect, useState } from 'react'
import { Deal } from '../types'
import { fetchDeals } from '../services/api'

export default function Deals() {
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetchDeals()
      .then(d => { if (mounted) setDeals(d) })
      .catch(e => { if (mounted) setError(e.message || String(e)) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  if (loading) return <div className="loading">Loading deals...</div>
  if (error) return <div className="loading">Error: {error}</div>
  if (!deals || deals.length === 0) return <div className="loading">No deals found.</div>

  // compute summary stats
  const totalValue = deals.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const contactsSet = new Set<string>()
  const companiesSet = new Set<string>()
  deals.forEach(d => {
    const any = d as any
    if (Array.isArray(any.contacts)) {
      any.contacts.forEach((c: any) => { if (c?.email) contactsSet.add(c.email) })
    }
    if (Array.isArray(any.companies)) {
      any.companies.forEach((c: any) => { if (c?.name) companiesSet.add(c.name) })
    }
  })

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Deals ({deals.length})</h2>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-number">{deals.length}</div>
          <div className="stat-label">Total Deals</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">${totalValue.toLocaleString()}</div>
          <div className="stat-label">Total Value</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{contactsSet.size}</div>
          <div className="stat-label">Contacts</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{companiesSet.size}</div>
          <div className="stat-label">Companies</div>
        </div>
      </div>

      <div className="deals-list">
        {deals.map(d => {
          const any = d as any
          const amount = d.amount ? `$${Number(d.amount).toLocaleString()}` : '—'
          const contacts = Array.isArray(any.contacts) ? any.contacts : []
          const companies = Array.isArray(any.companies) ? any.companies : []
          return (
            <div className="deal-card" key={d.dealId}>
              <div className="header">
                <div className="title">{d.dealName}</div>
                <div className="amount">{amount}</div>
              </div>
              <div className="deal-meta">
                <div><div className="muted" style={{fontWeight:700}}>Stage</div><div>{d.stage || '—'}</div></div>
                <div><div className="muted" style={{fontWeight:700}}>Pipeline</div><div>{d.pipeline || '—'}</div></div>
                <div><div className="muted" style={{fontWeight:700}}>Created</div><div>{(any.createdAt && new Date(any.createdAt).toLocaleDateString()) || '—'}</div></div>
                <div><div className="muted" style={{fontWeight:700}}>Close Date</div><div>{(any.closeDate && new Date(any.closeDate).toLocaleDateString()) || '—'}</div></div>
              </div>

              <div className="deal-assocs">
                <div className="assoc-box">
                  <div className="assoc-title">Contacts ({contacts.length})</div>
                  {contacts.length === 0 && <div className="muted">No contacts associated</div>}
                  {contacts.map((c: any, i: number) => (
                    <div className="assoc-item" key={i}>
                      <div style={{fontWeight:700}}>{c?.firstname ? `${c.firstname} ${c.lastname || ''}`.trim() : (c?.email || '—')}</div>
                      <div className="muted">{c?.email || ''}</div>
                    </div>
                  ))}
                </div>

                <div className="assoc-box">
                  <div className="assoc-title">Companies ({companies.length})</div>
                  {companies.length === 0 && <div className="muted">No companies associated</div>}
                  {companies.map((c: any, i: number) => (
                    <div className="assoc-item" key={i}>
                      <div style={{fontWeight:700}}>{c?.name || '—'}</div>
                      <div className="muted">{c?.domain || ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
