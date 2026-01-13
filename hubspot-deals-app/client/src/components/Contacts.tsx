import React, { useEffect, useState } from 'react'
import { Contact } from '../types'
import { fetchContacts } from '../services/api'

export default function Contacts(){
  const [contacts,setContacts] = useState<Contact[] | null>(null)
  const [error,setError] = useState<string | null>(null)

  useEffect(()=>{
    let mounted=true
    fetchContacts().then(c=>{ if(mounted) setContacts(c) }).catch(e=>{ if(mounted) setError(e.message || String(e)) })
    return ()=>{ mounted=false }
  },[])

  if(error) return <div className="loading">Error: {error}</div>
  if(!contacts) return <div className="loading">Loading contacts...</div>

  return (
    <div>
      <h2>Contacts ({contacts.length})</h2>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12}}>
        {contacts.map(c=> (
          <div key={c.contactId} style={{background:'white',padding:12,borderRadius:8}}>
            <div style={{fontWeight:600}}>{[c.firstname,c.lastname].filter(Boolean).join(' ') || 'Unknown'}</div>
            <div style={{fontSize:12,color:'#7c98b6'}}>{c.email || '—'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
