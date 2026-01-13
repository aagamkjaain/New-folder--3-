import { VercelRequest, VercelResponse } from '@vercel/node'

// ============ ASANA Configuration ============
const ASANA_TOKEN = process.env.ASANA_TOKEN
const DEFAULT_ASANA_PROJECT_ID = process.env.ASANA_PROJECT_ID
const ASANA_BASE_URL = "https://app.asana.com/api/1.0"
const IMPORTED_ASSIGNEE_FIELD_GID = "1212641939726131"

const isAsanaConfigReady = !!ASANA_TOKEN

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isAsanaConfigReady) {
    return res.status(500).json({ error: 'Asana configuration missing' })
  }

  try {
    const projectId = (req.query.projectId as string) || DEFAULT_ASANA_PROJECT_ID
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' })
    }

    const workspaceParam = req.query.workspace ? `&workspace=${req.query.workspace}` : ''
    const url = `${ASANA_BASE_URL}/projects/${projectId}/tasks?opt_fields=name,assignee.name,created_at,due_on,notes,completed,${IMPORTED_ASSIGNEE_FIELD_GID}${workspaceParam}`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${ASANA_TOKEN}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(response.status).json({ error: 'Failed to fetch Asana tasks', details: errText })
    }

    const data = await response.json()
    const tasks = data.data.map((task: any) => ({
      id: task.gid,
      key: task.gid,
      summary: task.name,
      description: extractDescription(task.notes),
      status: task.completed ? 'Done' : 'To Do',
      assignee: task.assignee?.name || null,
      created: task.created_at,
      dueDate: task.due_on,
      issuetype: { name: 'Task' },
      priority: { name: 'Medium' }
    }))

    res.status(200).json({ issues: tasks })
  } catch (err) {
    console.error('[Asana API]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}