import React, { useEffect, useState } from 'react'
import { Ticket } from '../types'
import { fetchTickets } from '../services/api'

export default function Tickets(){
  const [tickets,setTickets] = useState<Ticket[] | null>(null)
  const [error,setError] = useState<string | null>(null)

  useEffect(()=>{
    let mounted=true
    fetchTickets().then(c=>{ if(mounted) setTickets(c) }).catch(e=>{ if(mounted) setError(e.message || String(e)) })
    return ()=>{ mounted=false }
  },[])

  if(error) return <div className="loading">Error: {error}</div>
  if(!tickets) return <div className="loading">Loading tickets...</div>

  return (
    <div>
      <h2>All Tickets ({tickets.length})</h2>
      <div style={{display:'flex',flexDirection:'column',gap:18}}>
        {tickets.map(t=>{
          const anyT = t as any
          const created = anyT.createdAt ? new Date(anyT.createdAt).toLocaleDateString() : (anyT.createdAtDate ? new Date(anyT.createdAtDate).toLocaleDateString() : '—')
          const closed = anyT.closedAt ? new Date(anyT.closedAt).toLocaleDateString() : '—'
          const priority = anyT.priority || anyT.priorityLabel || 'MEDIUM'

          return (
            <div className="deal-card" key={t.ticketId}>
              <div className="header">
                <div style={{display:'flex',flexDirection:'column'}}>
                  <div style={{fontWeight:700}}>{anyT.subject || 'Untitled Ticket'}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{color:'#7b98a8', fontSize:12, marginRight:12}}>TICKET ID<br/><strong style={{color:'#102a43'}}>{t.ticketId}</strong></div>
                  <div style={{background:'#fdecea',color:'#d9534f',padding:'6px 12px',borderRadius:20,fontWeight:700}}>{priority}</div>
                </div>
              </div>

              <div className="deal-meta">
                <div>
                  <div className="muted" style={{fontWeight:700}}>PIPELINE</div>
                  <div>{anyT.pipeline ?? '—'}</div>
                </div>
                <div>
                  <div className="muted" style={{fontWeight:700}}>STAGE</div>
                  <div>{anyT.stage ?? anyT.pipelineStage ?? '—'}</div>
                </div>
                <div>
                  <div className="muted" style={{fontWeight:700}}>CATEGORY</div>
                  <div>{anyT.category ?? '—'}</div>
                </div>
                <div>
                  <div className="muted" style={{fontWeight:700}}>CREATED</div>
                  <div>{created}</div>
                </div>
                <div>
                  <div className="muted" style={{fontWeight:700}}>CLOSED</div>
                  <div>{closed}</div>
                </div>
              </div>

              <div className="deal-assocs">
                <div className="assoc-box">
                  <div style={{fontWeight:700,color:'#3b5563',marginBottom:8}}>Details</div>
                  <div className="muted">{anyT.content || anyT.details || '—'}</div>
                </div>

                <div className="assoc-box">
                  <div style={{fontWeight:700,color:'#3b5563',marginBottom:8}}>Associations</div>
                  <div className="muted">Companies: {anyT.numCompanies ?? anyT.num_associated_companies ?? 0}</div>
                  <div className="muted">Contacts: {anyT.numContacts ?? anyT.num_associated_contacts ?? 0}</div>
                  <div className="muted">Deals: {anyT.numDeals ?? anyT.num_associated_deals ?? 0}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
