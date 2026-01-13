# HubSpot Deals & Emails App

A minimal web application that fetches Deals and associated Email activities from HubSpot and displays them on a webpage.

## Prerequisites

- Node.js (v18+ recommended for native `fetch` support)
- HubSpot Private App Token with the following scopes:
  - `crm.objects.deals.read`
  - `crm.objects.emails.read`

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set your HubSpot token:**

   **Windows (Command Prompt):**
   ```cmd
   set HUBSPOT_TOKEN=your_private_app_token_here
   ```

   **Windows (PowerShell):**
   ```powershell
   $env:HUBSPOT_TOKEN="your_private_app_token_here"
   ```

   **Linux/Mac:**
   ```bash
   export HUBSPOT_TOKEN=your_private_app_token_here
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## API Endpoint

### GET /api/deals

Returns all deals with their associated email activities.

**Response format:**
```json
[
  {
    "dealId": "12345",
    "dealName": "Example Deal",
    "amount": 50000,
    "stage": "closedwon",
    "pipeline": "default",
    "createdAt": "2024-01-15T10:30:00Z",
    "closeDate": "2024-02-01T00:00:00Z",
    "emails": [
      {
        "direction": "INCOMING",
        "subject": "Re: Proposal",
        "body": "Thank you for the proposal...",
        "timestamp": "2024-01-20T14:22:00Z"
      }
    ]
  }
]
```

## Project Structure

```
hubspot-deals-app/
├── server.js        # Express backend with HubSpot API integration
├── public/
│   └── index.html   # Frontend HTML/CSS/JS
├── package.json     # Node.js dependencies
└── README.md        # This file
```

## HubSpot API Usage

This app uses the following HubSpot APIs:
- **Deals API (v3):** Fetch deal records with properties
- **Emails API (v3):** Fetch email engagement records
- **Associations API (v4):** Link deals to their associated emails

## Troubleshooting

- **401 Unauthorized:** Check that your HUBSPOT_TOKEN is set correctly
- **No deals showing:** Verify your token has the required scopes
- **No emails for deals:** Ensure email activities are associated with deals in HubSpot
