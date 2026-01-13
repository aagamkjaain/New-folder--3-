import React, { useEffect, useState } from 'react'
import { Campaign } from '../types'
import { fetchCampaigns } from '../services/api'

export default function Campaigns(){
  const [campaigns,setCampaigns] = useState<Campaign[] | null>(null)
  const [error,setError] = useState<string | null>(null)

  useEffect(()=>{
    let mounted=true
    fetchCampaigns().then(c=>{ if(mounted) setCampaigns(c) }).catch(e=>{ if(mounted) setError(e.message || String(e)) })
    return ()=>{ mounted=false }
  },[])

  if(error) return <div className="loading">Error: {error}</div>
  if(!campaigns) return <div className="loading">Loading campaigns...</div>

  return (
    <div>
      <h2>Campaigns ({campaigns.length})</h2>

      <div style={{display:'flex',flexDirection:'column',gap:20}}>
        {campaigns.map(c=> {
          const anyC = c as any
          const visits = anyC.visits ?? anyC.visitsCount ?? anyC.hs_analytics_num_visits ?? 0
          const conversions = anyC.conversions ?? anyC.hs_analytics_num_conversions ?? 0
          const convRate = conversions && visits ? `${Math.round((conversions / Math.max(1, visits)) * 100)}%` : '0%'
          const start = anyC.startDate ? new Date(anyC.startDate).toLocaleDateString() : (anyC.createdAt ? new Date(anyC.createdAt).toLocaleDateString() : '—')
          const end = anyC.endDate ? new Date(anyC.endDate).toLocaleDateString() : '—'

          return (
            <div className="deal-card" key={c.campaignId}>
              <div className="header">
                <div className="title">{anyC.name || anyC.title || 'Untitled'}</div>
              </div>

              <div className="deal-meta">
                <div>
                  <div className="muted" style={{fontWeight:700}}>Visits</div>
                  <div style={{fontSize:20,fontWeight:700,color:'#ff6b4d'}}>{visits}</div>
                </div>
                <div>
                  <div className="muted" style={{fontWeight:700}}>Conversions</div>
                  <div style={{fontSize:20,fontWeight:700,color:'#00a4bd'}}>{conversions}</div>
                </div>
                <div>
                  <div className="muted" style={{fontWeight:700}}>Conversion Rate</div>
                  <div style={{fontSize:20,fontWeight:700}}>{convRate}</div>
                </div>
              </div>

              <div style={{padding:18}}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                  <div style={{fontWeight:700}}>📅 Campaign Dates</div>
                </div>
                <div style={{background:'#f7fbfc',padding:14,borderRadius:8}}>
                  <div style={{fontWeight:700}}>Start: <span style={{fontWeight:500,color:'#33475b'}}>{start}</span></div>
                  <div style={{fontWeight:700, marginTop:8}}>End: <span style={{fontWeight:500,color:'#33475b'}}>{end}</span></div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
