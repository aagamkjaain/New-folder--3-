import express, { Request, Response } from "express"
import cors from "cors"
import dotenv from "dotenv"
import fetch from "node-fetch"

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const PORT = Number(process.env.API_PORT || 3000)

// ============ HUBSPOT Configuration ============
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || 'http://localhost:4000/oauth/hubspot/callback'
const HUBSPOT_API_BASE = 'https://api.hubapi.com'

const HUBSPOT_SCOPES = [
  'oauth',
  'crm.objects.companies.read',
  'crm.objects.contacts.read',
  'crm.objects.deals.read',
  'crm.schemas.companies.read',
  'crm.schemas.contacts.read',
  'crm.schemas.deals.read',
  'marketing.campaigns.read',
  'marketing.campaigns.revenue.read',
  'tickets'
].join(' ')

let hubspotTokenStore = {
  accessToken: null as string | null,
  refreshToken: null as string | null,
  expiresAt: null as number | null
}

// ============ JIRA Configuration ============
const DOMAIN = process.env.JIRA_DOMAIN
const EMAIL = process.env.JIRA_EMAIL
const API_TOKEN = process.env.JIRA_API_TOKEN
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY
const TEAM_FIELD = process.env.JIRA_TEAM_FIELD_ID // Optional custom field key, e.g. customfield_12345

let auth = ''
if (EMAIL && API_TOKEN) {
  auth = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64")
  console.log('[Jira] Auth configured for email:', EMAIL)
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

const isJiraConfigReady = DOMAIN && EMAIL && API_TOKEN && PROJECT_KEY
if (!isJiraConfigReady) {
  console.warn("[Jira] Configuration incomplete:", { domain: !!DOMAIN, email: !!EMAIL, token: !!API_TOKEN, projectKey: !!PROJECT_KEY })
}

// ============ ASANA Configuration ============
const ASANA_TOKEN = process.env.ASANA_TOKEN
const DEFAULT_ASANA_PROJECT_ID = process.env.ASANA_PROJECT_ID
const ASANA_BASE_URL = "https://app.asana.com/api/1.0"
const IMPORTED_ASSIGNEE_FIELD_GID = "1212641939726131"

const isAsanaConfigReady = !!ASANA_TOKEN
if (!isAsanaConfigReady) {
  console.warn("Asana API is not fully configured. Please set ASANA_TOKEN in your .env file.")
}

const extractDescription = (desc: any): string => {
  if (!desc) return ""
  if (typeof desc === "string") return desc
  if (Array.isArray(desc)) return desc.join(" ")
  if (desc.content) {
    const parts: string[] = []
    const walk = (nodes: any[]): void => {
      nodes.forEach((node: any) => {
        if (node.text) parts.push(node.text)
        if (node.content) walk(node.content)
      })
    }
    walk(desc.content)
    return parts.join(" ").trim()
  }
  return ""
}

app.get("/api/issues", async (req: Request, res: Response) => {
  // Get project key from query parameter or use default from env
  const projectKey = (req.query.projectKey as string) || PROJECT_KEY

  console.log('[/api/issues] Request for:', projectKey, 'Auth ready:', !!auth)

  if (!projectKey) {
    return res.status(400).json({ error: "Project key is required. Provide it as ?projectKey=YOURKEY or set JIRA_PROJECT_KEY in .env" })
  }

  if (!isJiraConfigReady) {
    console.error('[/api/issues] Jira not configured')
    return res.status(500).json({ error: "Jira configuration missing" })
  }

  try {
    const jql = `project = "${projectKey}"`
    // Use correct Jira Cloud API v3 endpoint format
    const url = `https://${DOMAIN}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=500&fields=key,summary,created,duedate,description,priority,status,assignee,issuetype`
    
    console.log('[Jira Request] URL:', url)
    console.log('[Jira Request] Auth present:', !!auth)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    console.log('[Jira Response] Status:', response.status)

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[Jira] Failed with status ${response.status}:`, errText.substring(0, 300))
      return res.status(response.status).json({ error: 'Failed to fetch Jira issues', status: response.status, details: errText })
    }

    const data = await response.json() as any
    const issues = (data.issues || []).map((issue: any) => {
      const fields = issue.fields || {}
      const created = fields.created || null
      const due = fields.duedate || null
      const duration = created && due ? Math.ceil((new Date(due).getTime() - new Date(created).getTime()) / MS_PER_DAY) : ""

      return {
        key: issue.key || "-",
        issueType: fields.issuetype?.name || "-",
        summary: fields.summary || "-",
        description: extractDescription(fields.description),
        priority: fields.priority?.name || "-",
        status: fields.status?.name || "-",
        assignee: fields.assignee?.displayName || "Unassigned",
        team: TEAM_FIELD && fields[TEAM_FIELD] ? String(fields[TEAM_FIELD]) : "Team 1",
        created,
        due,
        duration,
      }
    })

    res.json({ issues })
  } catch (err) {
    console.error("[Jira API]", err)
    res.status(500).json({ error: "Failed to fetch Jira issues", details: err instanceof Error ? err.message : "Unknown error" })
  }
})

// Fetch list of projects from Jira (requires JIRA_DOMAIN + auth)
app.get('/api/projects', async (_req: Request, res: Response) => {
  if (!isJiraConfigReady || !DOMAIN) {
    return res.status(500).json({ error: 'Jira configuration missing' })
  }

  try {
    // Use API v2 endpoint for projects (returns direct array)
    const url = `https://${DOMAIN}/rest/api/2/project?maxResults=200`
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const txt = await response.text()
      return res.status(response.status).json({ error: 'Failed to fetch projects from Jira', details: txt })
    }

    const data = await response.json() as any
    // Jira API v2 /project returns a direct array
    const projectArray = Array.isArray(data) ? data : (data.values || data.projects || [])
    const projects = projectArray.map((p: any) => ({
      id: p.key || String(p.id),
      key: p.key || String(p.id),
      title: p.name || p.key || String(p.id),
      category: p.projectTypeKey || p.projectCategory?.name || 'Project',
      description: p.description ? (typeof p.description === 'string' ? p.description : JSON.stringify(p.description)) : '',
      avatar: p.avatarUrls ? (p.avatarUrls['48x48'] || p.avatarUrls['24x24'] || '') : '',
    }))

    res.json({ projects })
  } catch (err) {
    console.error('[Jira Projects]', err)
    res.status(500).json({ error: 'Failed to fetch Jira projects', details: err instanceof Error ? err.message : 'Unknown' })
  }
})

// ============ ASANA API Endpoints ============
app.get("/api/asana/issues", async (req: Request, res: Response) => {
  // Get project ID from query parameter or use default from env
  const projectId = (req.query.projectKey as string) || DEFAULT_ASANA_PROJECT_ID

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required. Provide it as ?projectKey=YOUR_PROJECT_ID or set ASANA_PROJECT_ID in .env" })
  }

  if (!isAsanaConfigReady) {
    return res.status(500).json({ error: "Asana configuration missing - ASANA_TOKEN not set" })
  }

  try {
    const response = await fetch(
      `${ASANA_BASE_URL}/tasks?project=${projectId}&opt_fields=name,completed,assignee.name,start_on,due_on,memberships.section.name,notes,custom_fields,custom_fields.enum_value,custom_fields.enum_value.name`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ASANA_TOKEN}`,
          Accept: "application/json",
        },
      }
    )

    if (!response.ok) {
      const message = await response.text()
      return res.status(response.status).json({ error: "Failed to fetch Asana tasks", details: message })
    }

    const data = await response.json() as any
    const tasks = (data.data || []).map((task: any) => {
      const startDate = task.start_on || null
      const due = task.due_on || null
      
      // Calculate duration from start_on to due_on (inclusive of both start and end dates)
      const duration = startDate && due 
        ? Math.ceil((new Date(due).getTime() - new Date(startDate).getTime()) / MS_PER_DAY) + 1
        : ""

      // Get imported assignee from custom field
      const importedAssigneeField = task.custom_fields?.find(
        (cf: any) => cf.gid === IMPORTED_ASSIGNEE_FIELD_GID
      )
      const importedAssignee = importedAssigneeField?.enum_value?.name || null

      // Use imported assignee if regular assignee is missing
      const finalAssignee = task.assignee?.name || importedAssignee || "Unassigned"

      return {
        key: task.gid || "-",
        issueType: "-",
        summary: task.name || "-",
        description: task.notes || "",
        priority: "-",
        status: task.completed ? "Done" : "Open",
        assignee: finalAssignee,
        team: task.memberships?.[0]?.section?.name || "-",
        startDate,
        due,
        duration,
      }
    })

    res.json({ issues: tasks })
  } catch (err) {
    console.error("[Asana API]", err)
    res.status(500).json({ error: "Failed to fetch Asana tasks", details: err instanceof Error ? err.message : "Unknown error" })
  }
})

// Fetch list of Asana projects (requires ASANA_TOKEN). Uses ASANA_WORKSPACE env if provided,
// otherwise returns the DEFAULT_ASANA_PROJECT_ID as a single-item list when available.
app.get('/api/asana/projects', async (_req: Request, res: Response) => {
  if (!isAsanaConfigReady) {
    return res.status(500).json({ error: 'Asana configuration missing' })
  }

  try {
    const workspace = process.env.ASANA_WORKSPACE_ID
    if (workspace) {
      const url = `${ASANA_BASE_URL}/projects?workspace=${workspace}&archived=false&opt_fields=gid,name,notes`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${ASANA_TOKEN}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        const txt = await response.text()
        return res.status(response.status).json({ error: 'Failed to fetch Asana projects', details: txt })
      }

      const data = await response.json() as any
      const values = data.data || []
      const projects = values.map((p: any) => ({
        id: p.gid,
        key: p.gid,
        title: p.name,
        description: p.notes || '',
        avatar: '',
      }))

      return res.json({ projects })
    }

    // If no workspace provided, try returning the default project if set
    if (DEFAULT_ASANA_PROJECT_ID) {
      const url = `${ASANA_BASE_URL}/projects/${DEFAULT_ASANA_PROJECT_ID}?opt_fields=gid,name,notes`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${ASANA_TOKEN}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        const txt = await response.text()
        return res.status(response.status).json({ error: 'Failed to fetch Asana project', details: txt })
      }

      const data = await response.json() as any
      const p = data.data
      const project = p ? [{ id: p.gid, key: p.gid, title: p.name, description: p.notes || '', avatar: '' }] : []
      return res.json({ projects: project })
    }

    // No workspace and no default project configured
    return res.json({ projects: [] })
  } catch (err) {
    console.error('[Asana Projects]', err)
    return res.status(500).json({ error: 'Failed to fetch Asana projects', details: err instanceof Error ? err.message : 'Unknown' })
  }
})

// ============ HUBSPOT HELPER FUNCTIONS ============

async function refreshHubSpotAccessToken(): Promise<string> {
  if (!hubspotTokenStore.refreshToken) {
    throw new Error('No HubSpot refresh token available')
  }

  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: HUBSPOT_CLIENT_ID || '',
      client_secret: HUBSPOT_CLIENT_SECRET || '',
      refresh_token: hubspotTokenStore.refreshToken
    }).toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token refresh failed: ${errorText}`)
  }

  const tokens = await response.json() as any
  hubspotTokenStore = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in * 1000)
  }

  return hubspotTokenStore.accessToken || ''
}

async function getValidHubSpotAccessToken(): Promise<string> {
  if (!hubspotTokenStore.accessToken) {
    throw new Error('Not authenticated. Please connect HubSpot first.')
  }

  // Refresh if token expires in less than 5 minutes
  if (hubspotTokenStore.expiresAt! < Date.now() + 300000) {
    return await refreshHubSpotAccessToken()
  }

  return hubspotTokenStore.accessToken
}

async function hubspotRequest(endpoint: string, options: any = {}): Promise<any> {
  const accessToken = await getValidHubSpotAccessToken()
  const url = `${HUBSPOT_API_BASE}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HubSpot API error (${response.status}): ${errorText}`)
  }

  return response.json()
}

async function fetchDealsFromHubSpot() {
  const properties = [
    'dealname',
    'amount',
    'dealstage',
    'pipeline',
    'createdate',
    'closedate'
  ]

  const endpoint = `/crm/v3/objects/deals?properties=${properties.join(',')}&limit=100`
  const data = await hubspotRequest(endpoint)
  return data.results || []
}

async function fetchContactsFromHubSpot() {
  const properties = [
    'email',
    'firstname',
    'lastname',
    'phone',
    'company'
  ]

  const endpoint = `/crm/v3/objects/contacts?properties=${properties.join(',')}&limit=100`
  const data = await hubspotRequest(endpoint)
  return (data.results || []).map((contact: any) => ({
    contactId: contact.id,
    email: contact.properties.email || null,
    firstname: contact.properties.firstname || null,
    lastname: contact.properties.lastname || null,
    phone: contact.properties.phone || null,
    company: contact.properties.company || null
  }))
}

async function fetchCampaignsFromHubSpot() {
  const properties = [
    'name',
    'hs_name',
    'hs_campaign_name',
    'hs_campaign_start_date',
    'hs_campaign_end_date',
    'hs_start_date',
    'hs_end_date',
    'hs_analytics_num_visits',
    'hs_analytics_num_conversions',
    'createdate',
    'hs_campaign_rk_date'
  ]

  const endpoint = `/crm/v3/objects/campaigns?properties=${properties.join(',')}&limit=100`
  const data = await hubspotRequest(endpoint)

  return (data.results || []).map((campaign: any) => {
    const campaignName = campaign.properties.name || 
                        campaign.properties.hs_name || 
                        campaign.properties.hs_campaign_name ||
                        `Campaign ${campaign.id}`

    const startDate = campaign.properties.hs_campaign_start_date || 
                     campaign.properties.hs_start_date || 
                     campaign.properties.createdate || 
                     null

    const endDate = campaign.properties.hs_campaign_end_date || 
                   campaign.properties.hs_end_date || 
                   null

    return {
      campaignId: campaign.id,
      name: campaignName,
      startDate: startDate,
      endDate: endDate,
      visits: campaign.properties.hs_analytics_num_visits ? parseInt(campaign.properties.hs_analytics_num_visits) : 0,
      conversions: campaign.properties.hs_analytics_num_conversions ? parseInt(campaign.properties.hs_analytics_num_conversions) : 0,
      createdAt: campaign.properties.createdate || null,
      lastActivity: campaign.properties.hs_campaign_rk_date || null
    }
  })
}

async function fetchTicketsFromHubSpot() {
  const properties = [
    'subject',
    'content',
    'hs_pipeline',
    'hs_pipeline_stage',
    'hs_ticket_priority',
    'hs_ticket_category',
    'hs_resolution',
    'hubspot_owner_id',
    'hs_ticket_id',
    'createdate',
    'closedate',
    'hs_last_contacted_date',
    'hs_first_contacted_date',
    'hs_next_activity_date',
    'hs_num_associated_companies',
    'hs_num_associated_contacts',
    'hs_num_associated_deals'
  ]

  let allTickets = []
  let after = null

  do {
    let endpoint = `/crm/v3/objects/tickets?properties=${properties.join(',')}&limit=100`
    if (after) {
      endpoint += `&after=${after}`
    }

    const data = await hubspotRequest(endpoint)
    const tickets = data.results || []
    allTickets = [...allTickets, ...tickets]

    after = data.paging?.next?.after || null
  } while (after)

  return allTickets.map((ticket: any) => ({
    ticketId: ticket.id,
    subject: ticket.properties.subject || '(No Subject)',
    content: ticket.properties.content || null,
    pipeline: ticket.properties.hs_pipeline || null,
    pipelineStage: ticket.properties.hs_pipeline_stage || null,
    priority: ticket.properties.hs_ticket_priority || null,
    category: ticket.properties.hs_ticket_category || null,
    resolution: ticket.properties.hs_resolution || null,
    ownerId: ticket.properties.hubspot_owner_id || null,
    ticketIdNumber: ticket.properties.hs_ticket_id || null,
    createdAt: ticket.properties.createdate || null,
    closedAt: ticket.properties.closedate || null,
    lastContactedDate: ticket.properties.hs_last_contacted_date || null,
    firstContactedDate: ticket.properties.hs_first_contacted_date || null,
    nextActivityDate: ticket.properties.hs_next_activity_date || null,
    numCompanies: ticket.properties.hs_num_associated_companies ? parseInt(ticket.properties.hs_num_associated_companies) : 0,
    numContacts: ticket.properties.hs_num_associated_contacts ? parseInt(ticket.properties.hs_num_associated_contacts) : 0,
    numDeals: ticket.properties.hs_num_associated_deals ? parseInt(ticket.properties.hs_num_associated_deals) : 0
  }))
}

async function fetchContactById(contactId: string) {
  try {
    const properties = ['email', 'firstname', 'lastname']
    const endpoint = `/crm/v3/objects/contacts/${contactId}?properties=${properties.join(',')}`
    const data = await hubspotRequest(endpoint)
    return {
      email: data.properties.email || null,
      firstname: data.properties.firstname || null,
      lastname: data.properties.lastname || null
    }
  } catch (error) {
    console.warn(`Could not fetch contact ${contactId}`)
    return null
  }
}

async function fetchCompanyById(companyId: string) {
  try {
    const properties = ['name', 'domain']
    const endpoint = `/crm/v3/objects/companies/${companyId}?properties=${properties.join(',')}`
    const data = await hubspotRequest(endpoint)
    return {
      name: data.properties.name || null,
      domain: data.properties.domain || null
    }
  } catch (error) {
    console.warn(`Could not fetch company ${companyId}`)
    return null
  }
}

async function fetchDealAssociations(dealId: string, type: 'contacts' | 'companies' = 'contacts') {
  try {
    const endpoint = `/crm/v4/objects/deals/${dealId}/associations/${type}`
    const data = await hubspotRequest(endpoint)
    return (data.results || []).map((assoc: any) => assoc.toObjectId)
  } catch (error) {
    return []
  }
}

async function fetchContactsForDeal(dealId: string) {
  const contactIds = await fetchDealAssociations(dealId, 'contacts')
  if (contactIds.length === 0) return []

  const contacts = await Promise.all(contactIds.map(id => fetchContactById(id)))
  return contacts.filter(c => c !== null)
}

async function fetchCompaniesForDeal(dealId: string) {
  const companyIds = await fetchDealAssociations(dealId, 'companies')
  if (companyIds.length === 0) return []

  const companies = await Promise.all(companyIds.map(id => fetchCompanyById(id)))
  return companies.filter(c => c !== null)
}

// ============ HUBSPOT OAUTH ENDPOINTS ============

app.get('/auth/hubspot', (req: Request, res: Response) => {
  const authUrl = new URL('https://app.hubspot.com/oauth/authorize')
  authUrl.searchParams.set('client_id', HUBSPOT_CLIENT_ID || '')
  authUrl.searchParams.set('redirect_uri', HUBSPOT_REDIRECT_URI)
  authUrl.searchParams.set('scope', HUBSPOT_SCOPES)

  console.log('Redirecting to HubSpot OAuth:', authUrl.toString())
  res.redirect(authUrl.toString())
})

app.get('/oauth/hubspot/callback', async (req: Request, res: Response) => {
  const { code, error, error_description } = req.query as any

  if (error) {
    console.error('OAuth error:', error, error_description)
    return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`)
  }

  if (!code) {
    console.error('No authorization code received')
    return res.redirect('/?error=No+authorization+code+received')
  }

  try {
    console.log('Exchanging authorization code for tokens...')

    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: HUBSPOT_CLIENT_ID || '',
        client_secret: HUBSPOT_CLIENT_SECRET || '',
        redirect_uri: HUBSPOT_REDIRECT_URI,
        code: code as string
      }).toString()
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      throw new Error(`Token exchange failed: ${errorText}`)
    }

    const tokens = await tokenResponse.json() as any

    hubspotTokenStore = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000)
    }

    console.log('OAuth successful! Tokens stored.')
    res.redirect('http://localhost:5173/hubspot')

  } catch (error) {
    console.error('OAuth callback error:', error)
    res.redirect(`/?error=${encodeURIComponent((error as any).message)}`)
  }
})

app.get('/auth/status', (req: Request, res: Response) => {
  const isAuthenticated = hubspotTokenStore.accessToken && hubspotTokenStore.expiresAt! > Date.now()
  res.json({
    authenticated: isAuthenticated,
    expiresAt: hubspotTokenStore.expiresAt
  })
})

app.get('/auth/logout', (req: Request, res: Response) => {
  hubspotTokenStore = { accessToken: null, refreshToken: null, expiresAt: null }
  console.log('HubSpot tokens cleared')
  res.redirect('/hubspot')
})

// ============ HUBSPOT API ENDPOINTS ============

app.get('/api/deals', async (req: Request, res: Response) => {
  try {
    console.log('Fetching deals from HubSpot...')

    const deals = await fetchDealsFromHubSpot()
    console.log(`Found ${deals.length} deals`)

    const dealsWithAssociations = await Promise.all(
      deals.map(async (deal: any) => {
        const [contacts, companies] = await Promise.all([
          fetchContactsForDeal(deal.id),
          fetchCompaniesForDeal(deal.id)
        ])

        return {
          dealId: deal.id,
          dealName: deal.properties.dealname || '(Unnamed Deal)',
          amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
          stage: deal.properties.dealstage || null,
          pipeline: deal.properties.pipeline || null,
          createdAt: deal.properties.createdate || null,
          closeDate: deal.properties.closedate || null,
          contacts,
          companies
        }
      })
    )

    console.log('Successfully fetched all deals with associations')
    res.json(dealsWithAssociations)

  } catch (error) {
    console.error('Error fetching deals:', error)

    if ((error as any).message.includes('Not authenticated')) {
      return res.status(401).json({ error: 'Not authenticated', message: (error as any).message })
    }

    res.status(500).json({ error: 'Failed to fetch deals', message: (error as any).message })
  }
})

app.get('/api/contacts', async (req: Request, res: Response) => {
  try {
    if (!hubspotTokenStore.accessToken) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Please authenticate with HubSpot first' })
    }

    console.log('Fetching all contacts from HubSpot...')

    const contacts = await fetchContactsFromHubSpot()
    console.log(`Found ${contacts.length} contacts`)

    res.json(contacts)

  } catch (error) {
    console.error('Error fetching contacts:', error)

    if ((error as any).message.includes('Not authenticated') || (error as any).message.includes('401')) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Your session has expired. Please reconnect.' })
    }

    res.status(500).json({ error: 'Failed to fetch contacts', message: (error as any).message })
  }
})

app.get('/api/campaigns', async (req: Request, res: Response) => {
  try {
    if (!hubspotTokenStore.accessToken) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Please authenticate with HubSpot first' })
    }

    console.log('Fetching campaigns from HubSpot...')

    const campaigns = await fetchCampaignsFromHubSpot()
    console.log(`Found ${campaigns.length} campaigns`)

    res.json(campaigns)

  } catch (error) {
    console.error('Error fetching campaigns:', error)

    if ((error as any).message.includes('Not authenticated') || (error as any).message.includes('401')) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Your session has expired. Please reconnect.' })
    }

    res.status(500).json({ error: 'Failed to fetch campaigns', message: (error as any).message })
  }
})

app.get('/api/tickets', async (req: Request, res: Response) => {
  try {
    if (!hubspotTokenStore.accessToken) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Please authenticate with HubSpot first' })
    }

    console.log('Fetching tickets from HubSpot...')

    const tickets = await fetchTicketsFromHubSpot()
    console.log(`Found ${tickets.length} tickets`)

    res.json(tickets)

  } catch (error) {
    console.error('Error fetching tickets:', error)

    if ((error as any).message.includes('Not authenticated') || (error as any).message.includes('401')) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Your session has expired. Please reconnect.' })
    }

    res.status(500).json({ error: 'Failed to fetch tickets', message: (error as any).message })
  }
})

app.get('/api/realization/deals', async (req: Request, res: Response) => {
  try {
    console.log('Starting AI Value Realization calculation...')

    const deals = await fetchDealsFromHubSpot()
    console.log(`Found ${deals.length} deals`)

    if (deals.length === 0) {
      return res.json([])
    }

    const realizationResults = deals.map((deal: any) => ({
      dealId: deal.id,
      id: deal.id,
      dealName: deal.properties.dealname || '(Unnamed Deal)',
      dealname: deal.properties.dealname || '(Unnamed Deal)',
      amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
      timeSaved: {
        totalHours: 0,
        totalDays: 0,
        estimatedRevenuePulledForward: 0
      },
      stages: [],
      campaigns: []
    }))

    console.log(`Successfully calculated realization metrics for ${realizationResults.length} deals`)
    res.json(realizationResults)

  } catch (error) {
    console.error('Error calculating realization metrics:', error)

    if ((error as any).message.includes('No HubSpot access token')) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: (error as any).message
      })
    }

    res.status(500).json({
      error: 'Failed to calculate realization metrics',
      message: (error as any).message
    })
  }
})

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" })
})

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`)
  console.log(`  - Jira API: ${isJiraConfigReady ? 'configured' : 'NOT configured'}`)
  console.log(`  - Asana API: ${isAsanaConfigReady ? 'configured' : 'NOT configured'}`)
  console.log(`  - HubSpot API: ${HUBSPOT_CLIENT_ID ? 'configured' : 'NOT configured'}`)
})
