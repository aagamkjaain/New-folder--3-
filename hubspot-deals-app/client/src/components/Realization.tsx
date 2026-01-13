import React, { useEffect, useState } from 'react'
import { RealizationDeal } from '../types'
import { fetchRealizationDeals } from '../services/api'

export default function Realization(){
  const [deals,setDeals] = useState<RealizationDeal[] | null>(null)
  const [error,setError] = useState<string | null>(null)

  useEffect(()=>{
    let mounted=true
    fetchRealizationDeals().then(d=>{ if(mounted) setDeals(d) }).catch(e=>{ if(mounted) setError(e.message || String(e)) })
    return ()=>{ mounted=false }
  },[])

  if(error) return <div className="loading">Error: {error}</div>
  if(!deals) return <div className="loading">Loading realization data...</div>

  return (
    <div>
      <h2>AI Value Realization - {deals.length} Deals</h2>
      <p className="muted" style={{marginTop:6}}>Time saved and revenue impact per deal with associated campaigns</p>

      <div className="deals-list">
        {deals.map(d=>{
          const anyD = d as any
          const title = anyD.dealname || anyD.name || 'Untitled'
          const amount = anyD.amount ? `$${Number(anyD.amount).toLocaleString()}` : '$0'
          const hours = Number(anyD.timeSaved?.totalHours || 0)
          const days = Number((hours/24).toFixed(2))
          const revenue = anyD.revenuePullForward ?? anyD.revenue ?? 0
          const campaigns = Array.isArray(anyD.campaigns) ? anyD.campaigns : []
          const stages = Array.isArray(anyD.stages) ? anyD.stages : (anyD.stage ? [anyD.stage] : [])

          return (
            <div className="deal-card" key={d.id}>
              <div className="header">
                <div className="title">{title}</div>
                <div className="amount">{amount}</div>
              </div>

              <div className="deal-meta">
                <div>
                  <div className="muted" style={{fontWeight:700}}>TIME SAVED (HOURS)</div>
                  <div style={{fontSize:16,fontWeight:700}}>{hours.toLocaleString()}</div>
                </div>
                <div>
                  <div className="muted" style={{fontWeight:700}}>TIME SAVED (DAYS)</div>
                  <div style={{fontSize:16,fontWeight:700}}>{days}</div>
                </div>
                <div>
                  <div className="muted" style={{fontWeight:700}}>REVENUE PULL-FORWARD</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#10a37f'}}>${Number(revenue).toLocaleString()}</div>
                </div>
              </div>

              <div className="deal-assocs">
                <div className="assoc-box">
                  <div className="assoc-title">📊 Stages ({stages.length})</div>
                  {stages.length === 0 && <div className="muted">No stages available</div>}
                  {stages.map((s:any, idx:number)=> {
                    const stageLabel = typeof s === 'string'
                      ? s
                      : (s && (s.stage || s.name) ? (s.stage || s.name) : JSON.stringify(s))

                    const actual = s && (s.actualDurationHours ?? s.actualHours ?? s.actual)
                    const baseline = s && (s.baselineDurationHours ?? s.baselineHours ?? s.baseline)
                    const saved = s && (s.timeSavedHours ?? (s.timeSaved && s.timeSaved.totalHours) ?? s.timeSaved)

                    return (
                      <div className="assoc-item" key={idx}>
                        <div style={{fontWeight:700}}>{stageLabel}</div>
                        <div className="muted" style={{fontSize:12}}>
                          Time Saved: {saved ?? hours} hours | Actual: {actual ?? anyD.actualHours ?? '—'} hrs | Baseline: {baseline ?? anyD.baselineHours ?? '—'} hrs
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="assoc-box">
                  <div className="assoc-title">📈 Campaigns ({campaigns.length})</div>
                  {campaigns.length === 0 && <div className="muted">No campaigns associated</div>}
                  {campaigns.map((c:any, idx:number)=> (
                    <div className="assoc-item" key={idx}>
                      <div style={{fontWeight:700}}>{c.name || c.title || 'Untitled'}</div>
                      <div className="muted" style={{fontSize:12}}>Start: {c.startDate || '—'} | End: {c.endDate || '—'}</div>
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
