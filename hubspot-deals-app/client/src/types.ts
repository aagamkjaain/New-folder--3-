export type Deal = {
  dealId: string
  dealName: string
  amount: number | null
  stage?: string | null
  pipeline?: string | null
}

export type Contact = {
  contactId: string
  email?: string | null
  firstname?: string | null
  lastname?: string | null
}

export type Campaign = {
  campaignId: string
  name: string
  startDate?: string | null
}

export type Ticket = {
  ticketId: string
  subject?: string | null
  pipeline?: string | null
}

export type RealizationDeal = {
  id: string
  dealname?: string | null
  timeSaved?: { totalHours?: number }
}
