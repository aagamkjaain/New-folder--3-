import { VercelRequest, VercelResponse } from '@vercel/node'

// ============ JIRA Configuration ============
const DOMAIN = process.env.JIRA_DOMAIN
const EMAIL = process.env.JIRA_EMAIL
const API_TOKEN = process.env.JIRA_API_TOKEN
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY
const TEAM_FIELD = process.env.JIRA_TEAM_FIELD_ID

let auth = ''
if (EMAIL && API_TOKEN) {
  auth = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64")
}

const isJiraConfigReady = DOMAIN && EMAIL && API_TOKEN && PROJECT_KEY

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const projectKey = (req.query.projectKey as string) || PROJECT_KEY

  if (!projectKey) {
    return res.status(400).json({ error: "Project key is required. Provide it as ?projectKey=YOURKEY or set JIRA_PROJECT_KEY in .env" })
  }

  if (!isJiraConfigReady) {
    return res.status(500).json({ error: "Jira configuration missing" })
  }

  try {
    const jql = `project = "${projectKey}"`
    const url = `https://${DOMAIN}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=500&fields=key,summary,created,duedate,description,priority,status,assignee,issuetype`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(response.status).json({ error: 'Failed to fetch Jira issues', status: response.status, details: errText })
    }

    const data = await response.json()
    res.status(200).json(data)
  } catch (err) {
    console.error('[Jira API]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}