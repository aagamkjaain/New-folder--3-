/**
 * HubSpot Deals App - OAuth 2.0 Integration
 * 
 * This server uses HubSpot OAuth 2.0 (authorization_code grant) to authenticate
 * and fetch Deals with associated Contacts and Companies.
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// CONFIGURATION
// =============================================================================

const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || 'http://localhost:3000/oauth/hubspot/callback';
const HUBSPOT_API_BASE = 'https://api.hubapi.com';

// (Zapier ROI feature removed)

// OAuth scopes - required scopes
const SCOPES = [
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
].join(' ');

// In-memory token storage (for demo purposes only - use a database in production!)
let tokenStore = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null
};

// Validate required environment variables
if (!HUBSPOT_CLIENT_ID || !HUBSPOT_CLIENT_SECRET) {
  console.error('ERROR: HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET are required');
  console.error('Set them in your .env file');
  process.exit(1);
}

console.log('HubSpot OAuth Configuration:');
console.log('- Client ID:', HUBSPOT_CLIENT_ID);
console.log('- Redirect URI:', HUBSPOT_REDIRECT_URI);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Allow CORS from Vite dev server (and any allowed origins) so frontend dev on 5173 can call the API.
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:5173',
    `http://localhost:${PORT}`
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// If a built React client exists at client/dist, serve it as the app root.
const clientDist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));

  // Serve index.html for any unmatched route (SPA fallback)
  app.get('*', (req, res, next) => {
    // Only handle non-/api routes
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/oauth')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// =============================================================================
// OAUTH ENDPOINTS
// =============================================================================

/**
 * GET /auth/hubspot
 * Initiates OAuth flow by redirecting user to HubSpot authorization page
 */
app.get('/auth/hubspot', (req, res) => {
  const authUrl = new URL('https://app.hubspot.com/oauth/authorize');
  authUrl.searchParams.set('client_id', HUBSPOT_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', HUBSPOT_REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  
  console.log('Redirecting to HubSpot OAuth:', authUrl.toString());
  res.redirect(authUrl.toString());
});

/**
 * GET /oauth/hubspot/callback
 * Handles OAuth callback, exchanges code for tokens
 */
app.get('/oauth/hubspot/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, error_description);
    return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`);
  }

  // Validate authorization code
  if (!code) {
    console.error('No authorization code received');
    return res.redirect('/?error=No+authorization+code+received');
  }

  try {
    console.log('Exchanging authorization code for tokens...');

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        redirect_uri: HUBSPOT_REDIRECT_URI,
        code: code
      }).toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokens = await tokenResponse.json();

    // Store tokens in memory
    tokenStore = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000)
    };

    console.log('OAuth successful! Tokens stored.');
    console.log('Access token expires in:', tokens.expires_in, 'seconds');

    // Redirect to dashboard
    res.redirect('/dashboard');

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`/?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /auth/status
 * Check if user is authenticated
 */
app.get('/auth/status', (req, res) => {
  const isAuthenticated = tokenStore.accessToken && tokenStore.expiresAt > Date.now();
  res.json({
    authenticated: isAuthenticated,
    expiresAt: tokenStore.expiresAt
  });
});

/**
 * GET /auth/logout
 * Clear stored tokens
 */
app.get('/auth/logout', (req, res) => {
  tokenStore = { accessToken: null, refreshToken: null, expiresAt: null };
  console.log('Tokens cleared');
  res.redirect('/');
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken() {
  if (!tokenStore.refreshToken) {
    throw new Error('No refresh token available');
  }

  console.log('Refreshing access token...');

  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: HUBSPOT_CLIENT_ID,
      client_secret: HUBSPOT_CLIENT_SECRET,
      refresh_token: tokenStore.refreshToken
    }).toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const tokens = await response.json();

  tokenStore = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in * 1000)
  };

  console.log('Access token refreshed successfully');
  return tokenStore.accessToken;
}

/**
 * Get a valid access token (refreshes if expired)
 */
async function getValidAccessToken() {
  if (!tokenStore.accessToken) {
    throw new Error('Not authenticated. Please connect HubSpot first.');
  }

  // Refresh if token expires in less than 5 minutes
  if (tokenStore.expiresAt < Date.now() + 300000) {
    return await refreshAccessToken();
  }

  return tokenStore.accessToken;
}

/**
 * Make authenticated request to HubSpot API
 */
async function hubspotRequest(endpoint, options = {}) {
  const accessToken = await getValidAccessToken();
  const url = `${HUBSPOT_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// =============================================================================
// DATA FETCHING FUNCTIONS
// =============================================================================

/**
 * Fetch all Deals from HubSpot
 */
async function fetchDeals() {
  const properties = [
    'dealname',
    'amount',
    'dealstage',
    'pipeline',
    'createdate',
    'closedate'
  ];

  const endpoint = `/crm/v3/objects/deals?properties=${properties.join(',')}&limit=100`;
  const data = await hubspotRequest(endpoint);
  return data.results || [];
}

/**
 * Fetch all Contacts from HubSpot
 */
async function fetchAllContacts() {
  const properties = [
    'email',
    'firstname',
    'lastname',
    'phone',
    'company'
  ];

  const endpoint = `/crm/v3/objects/contacts?properties=${properties.join(',')}&limit=100`;
  const data = await hubspotRequest(endpoint);
  return (data.results || []).map(contact => ({
    contactId: contact.id,
    email: contact.properties.email || null,
    firstname: contact.properties.firstname || null,
    lastname: contact.properties.lastname || null,
    phone: contact.properties.phone || null,
    company: contact.properties.company || null
  }));
}

/**
 * Fetch all Tickets from HubSpot with all details
 */
async function fetchAllTickets() {
  // Fetch comprehensive ticket properties
  const properties = [
    'subject', // Ticket title/name
    'content', // Ticket description
    'hs_pipeline', // Pipeline name
    'hs_pipeline_stage', // Current stage
    'hs_ticket_priority', // Priority level
    'hs_ticket_category', // Category
    'hs_resolution', // Resolution
    'hubspot_owner_id', // Assigned owner ID
    'hs_ticket_id', // Ticket ID
    'createdate', // Created date
    'closedate', // Closed date
    'hs_last_contacted_date', // Last contacted
    'hs_first_contacted_date', // First contacted
    'hs_next_activity_date', // Next activity
    'hs_num_associated_companies', // Number of companies
    'hs_num_associated_contacts', // Number of contacts
    'hs_num_associated_deals' // Number of deals
  ];

  // Fetch all tickets with pagination
  let allTickets = [];
  let after = null;
  
  do {
    let endpoint = `/crm/v3/objects/tickets?properties=${properties.join(',')}&limit=100`;
    if (after) {
      endpoint += `&after=${after}`;
    }

    const data = await hubspotRequest(endpoint);
    const tickets = data.results || [];
    allTickets = allTickets.concat(tickets);

    // Check if there are more pages
    after = data.paging?.next?.after || null;
  } while (after);

  return allTickets.map(ticket => ({
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
  }));
}

/**
 * Fetch all Campaigns from HubSpot
 */
async function fetchCampaigns() {
  // Try multiple possible property names for start/end dates and name
  const properties = [
    'name',
    'hs_name', // Alternative name property
    'hs_campaign_name', // Another possible name property
    'hs_campaign_start_date',
    'hs_campaign_end_date',
    'hs_start_date',
    'hs_end_date',
    'hs_analytics_num_visits',
    'hs_analytics_num_conversions',
    'createdate',
    'hs_campaign_rk_date'
  ];

  const endpoint = `/crm/v3/objects/campaigns?properties=${properties.join(',')}&limit=100`;
  const data = await hubspotRequest(endpoint);
  
  console.log(`Fetched ${data.results?.length || 0} campaigns from HubSpot`);
  
  // Log first campaign to debug property structure
  if (data.results && data.results.length > 0) {
    console.log('Sample campaign properties:', JSON.stringify(data.results[0].properties, null, 2));
    console.log('Sample campaign full object keys:', Object.keys(data.results[0]));
  }
  
  return (data.results || []).map((campaign, index) => {
    // Try different property name variations for campaign name
    const campaignName = campaign.properties.name || 
                        campaign.properties.hs_name || 
                        campaign.properties.hs_campaign_name ||
                        campaign.name ||
                        `Campaign ${campaign.id}` ||
                        '(Unnamed Campaign)';
    
    // Try different property name variations for start/end dates
    const startDate = campaign.properties.hs_campaign_start_date || 
                     campaign.properties.hs_start_date || 
                     campaign.properties.createdate || 
                     null;
    const endDate = campaign.properties.hs_campaign_end_date || 
                   campaign.properties.hs_end_date || 
                   null;
    
    // Debug logging for first few campaigns
    if (index < 3) {
      console.log(`Campaign ${index + 1} - ID: ${campaign.id}, Name resolved to: "${campaignName}"`);
      console.log(`  - Raw property "name": ${campaign.properties.name || 'MISSING'}`);
      console.log(`  - Raw property "hs_name": ${campaign.properties.hs_name || 'MISSING'}`);
      console.log(`  - Raw property "hs_campaign_name": ${campaign.properties.hs_campaign_name || 'MISSING'}`);
      console.log(`  - All properties available:`, Object.keys(campaign.properties || {}));
    }
    
    return {
      campaignId: campaign.id,
      name: campaignName,
      startDate: startDate,
      endDate: endDate,
      visits: campaign.properties.hs_analytics_num_visits ? parseInt(campaign.properties.hs_analytics_num_visits) : 0,
      conversions: campaign.properties.hs_analytics_num_conversions ? parseInt(campaign.properties.hs_analytics_num_conversions) : 0,
      createdAt: campaign.properties.createdate || null,
      lastActivity: campaign.properties.hs_campaign_rk_date || null,
      // Include raw properties for debugging (remove in production)
      _debug: {
        rawProperties: campaign.properties,
        hasName: !!campaign.properties.name,
        hasHsName: !!campaign.properties.hs_name,
        hasHsCampaignName: !!campaign.properties.hs_campaign_name,
        allPropertyKeys: Object.keys(campaign.properties || {})
      }
    };
  });
}

/**
 * Fetch Contact IDs associated with a Deal
 */
async function fetchDealContactAssociations(dealId) {
  try {
    const endpoint = `/crm/v4/objects/deals/${dealId}/associations/contacts`;
    const data = await hubspotRequest(endpoint);
    return (data.results || []).map(assoc => assoc.toObjectId);
  } catch (error) {
    console.warn(`No contact associations for deal ${dealId}`);
    return [];
  }
}

/**
 * Fetch Company IDs associated with a Deal
 */
async function fetchDealCompanyAssociations(dealId) {
  try {
    const endpoint = `/crm/v4/objects/deals/${dealId}/associations/companies`;
    const data = await hubspotRequest(endpoint);
    return (data.results || []).map(assoc => assoc.toObjectId);
  } catch (error) {
    console.warn(`No company associations for deal ${dealId}`);
    return [];
  }
}

/**
 * Fetch Contact by ID
 */
async function fetchContactById(contactId) {
  try {
    const properties = ['email', 'firstname', 'lastname'];
    const endpoint = `/crm/v3/objects/contacts/${contactId}?properties=${properties.join(',')}`;
    const data = await hubspotRequest(endpoint);
    return {
      email: data.properties.email || null,
      firstname: data.properties.firstname || null,
      lastname: data.properties.lastname || null
    };
  } catch (error) {
    console.warn(`Could not fetch contact ${contactId}`);
    return null;
  }
}

/**
 * Fetch Company by ID
 */
async function fetchCompanyById(companyId) {
  try {
    const properties = ['name', 'domain'];
    const endpoint = `/crm/v3/objects/companies/${companyId}?properties=${properties.join(',')}`;
    const data = await hubspotRequest(endpoint);
    return {
      name: data.properties.name || null,
      domain: data.properties.domain || null
    };
  } catch (error) {
    console.warn(`Could not fetch company ${companyId}`);
    return null;
  }
}

/**
 * Fetch all contacts for a deal
 */
async function fetchContactsForDeal(dealId) {
  const contactIds = await fetchDealContactAssociations(dealId);
  if (contactIds.length === 0) return [];

  const contacts = await Promise.all(contactIds.map(id => fetchContactById(id)));
  return contacts.filter(c => c !== null);
}

/**
 * Fetch all companies for a deal
 */
async function fetchCompaniesForDeal(dealId) {
  const companyIds = await fetchDealCompanyAssociations(dealId);
  if (companyIds.length === 0) return [];

  const companies = await Promise.all(companyIds.map(id => fetchCompanyById(id)));
  return companies.filter(c => c !== null);
}

/**
 * Fetch Campaign IDs associated with a Deal
 */
async function fetchDealCampaignAssociations(dealId) {
  try {
    const endpoint = `/crm/v4/objects/deals/${dealId}/associations/campaigns`;
    const data = await hubspotRequest(endpoint);
    return (data.results || []).map(assoc => assoc.toObjectId);
  } catch (error) {
    console.warn(`No campaign associations for deal ${dealId}`);
    return [];
  }
}

/**
 * Fetch Campaign IDs associated with a Deal (for realization service)
 */
async function fetchDealCampaignAssociationsForRealization(dealId) {
  try {
    const endpoint = `/crm/v4/objects/deals/${dealId}/associations/campaigns`;
    const data = await hubspotRequestForRealization(endpoint);
    return (data.results || []).map(assoc => assoc.toObjectId);
  } catch (error) {
    console.warn(`No campaign associations for deal ${dealId}`);
    return [];
  }
}

/**
 * Fetch Campaign by ID with details (for realization service)
 * Returns only: name, start date, end date
 */
async function fetchCampaignByIdForRealization(campaignId) {
  try {
    // Try multiple possible property names for start/end dates
    const properties = [
      'name',
      'hs_campaign_start_date',
      'hs_campaign_end_date',
      'hs_start_date',
      'hs_end_date',
      'createdate' // Fallback if start date not available
    ];
    const endpoint = `/crm/v3/objects/campaigns/${campaignId}?properties=${properties.join(',')}`;
    const data = await hubspotRequestForRealization(endpoint);
    
    // Try different property name variations
    const startDate = data.properties.hs_campaign_start_date || 
                     data.properties.hs_start_date || 
                     data.properties.createdate || 
                     null;
    const endDate = data.properties.hs_campaign_end_date || 
                   data.properties.hs_end_date || 
                   null;
    
    return {
      name: data.properties.name || '(Unnamed Campaign)',
      startDate: startDate,
      endDate: endDate
    };
  } catch (error) {
    console.warn(`Could not fetch campaign ${campaignId}:`, error.message);
    return null;
  }
}

/**
 * Fetch all campaigns for a deal (for realization service)
 */
async function fetchCampaignsForDealForRealization(dealId) {
  try {
    const campaignIds = await fetchDealCampaignAssociationsForRealization(dealId);
    if (campaignIds.length === 0) return [];

    const campaigns = await Promise.all(campaignIds.map(id => fetchCampaignByIdForRealization(id)));
    return campaigns.filter(c => c !== null);
  } catch (error) {
    console.warn(`Could not fetch campaigns for deal ${dealId}:`, error.message);
    return [];
  }
}

// =============================================================================
// AI VALUE REALIZATION SERVICE
// =============================================================================

/**
 * Configuration for baseline calculation
 * Number of historical deals to use for baseline (default: 100)
 */
const BASELINE_DEAL_COUNT = parseInt(process.env.BASELINE_DEAL_COUNT || '100', 10);

/**
 * Get access token for HubSpot API
 * Priority: 1. HUBSPOT_ACCESS_TOKEN env var, 2. OAuth token store
 */
async function getHubSpotAccessToken() {
  // First, try to use access token from environment variable (PUBLIC APP)
  if (process.env.HUBSPOT_ACCESS_TOKEN) {
    return process.env.HUBSPOT_ACCESS_TOKEN;
  }

  // Fall back to OAuth token store
  try {
    return await getValidAccessToken();
  } catch (error) {
    throw new Error('No HubSpot access token available. Set HUBSPOT_ACCESS_TOKEN or authenticate via OAuth.');
  }
}

/**
 * Make authenticated request to HubSpot API for realization service
 */
async function hubspotRequestForRealization(endpoint, options = {}) {
  const accessToken = await getHubSpotAccessToken();
  const url = `${HUBSPOT_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Fetch deals for realization service
 * Returns deals with: id (hs_object_id), dealname, amount, pipeline, dealstage, createdate, closedate
 */
async function fetchDealsForRealization() {
  const properties = [
    'dealname',
    'amount',
    'pipeline',
    'dealstage',
    'createdate',
    'closedate'
  ];

  // Fetch all deals with pagination
  let allDeals = [];
  let after = null;
  
  do {
    let endpoint = `/crm/v3/objects/deals?properties=${properties.join(',')}&limit=100`;
    if (after) {
      endpoint += `&after=${after}`;
    }

    const data = await hubspotRequestForRealization(endpoint);
    const deals = data.results || [];
    allDeals = allDeals.concat(deals);

    // Check if there are more pages
    after = data.paging?.next?.after || null;
  } while (after);

  return allDeals.map(deal => ({
    id: deal.id,
    hsObjectId: deal.id, // alias for clarity
    dealname: deal.properties.dealname || null,
    amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
    pipeline: deal.properties.pipeline || null,
    dealstage: deal.properties.dealstage || null,
    createdate: deal.properties.createdate || null,
    closedate: deal.properties.closedate || null
  }));
}

/**
 * Fetch stage history for a deal
 * Returns array of { stage, timestamp } sorted by timestamp
 * Uses HubSpot's property history via Timeline Events API
 */
async function fetchDealStageHistory(dealId) {
  try {
    const history = [];
    
    // First, get the current deal to ensure we have current stage
    const dealEndpoint = `/crm/v3/objects/deals/${dealId}?properties=dealstage,createdate`;
    const dealData = await hubspotRequestForRealization(dealEndpoint);
    const currentStage = dealData.properties?.dealstage;
    const createdAt = dealData.properties?.createdate || dealData.createdAt;
    
    // Try to fetch property history using Timeline Events
    // HubSpot Timeline Events API for property changes
    try {
      // Use the engagements/associations endpoint to find property change events
      // Alternative: use /integrations/v1/{appId}/timeline/events for custom events
      // For now, we'll use a simpler approach: fetch deal with propertiesWithHistory
      const historyEndpoint = `/crm/v3/objects/deals/${dealId}?properties=dealstage&propertiesWithHistory=dealstage`;
      const historyData = await hubspotRequestForRealization(historyEndpoint);
      
      // Extract property history from response
      // HubSpot may return this in different formats depending on API version
      if (historyData.propertiesWithHistory) {
        const stageHistory = historyData.propertiesWithHistory.dealstage;
        
        if (Array.isArray(stageHistory)) {
          stageHistory.forEach(item => {
            const value = item.value !== undefined ? item.value : item;
            const timestamp = item.timestamp || item.time || item.updatedAt;
            
            if (value) {
              history.push({
                stage: value,
                timestamp: timestamp || null
              });
            }
          });
        } else if (stageHistory && typeof stageHistory === 'object') {
          // Handle object format
          Object.keys(stageHistory).forEach(key => {
            const item = stageHistory[key];
            const value = item.value !== undefined ? item.value : key;
            const timestamp = item.timestamp || item.time || item.updatedAt;
            
            history.push({
              stage: value,
              timestamp: timestamp || null
            });
          });
        }
      }
      
      // If history data structure is different, try alternative parsing
      if (history.length === 0 && historyData.properties?.dealstage) {
        // Check if versions are in a different location
        const dealstageData = historyData.properties.dealstage;
        if (Array.isArray(dealstageData)) {
          dealstageData.forEach(item => {
            history.push({
              stage: item.value || item,
              timestamp: item.timestamp || item.time || null
            });
          });
        }
      }
    } catch (historyError) {
      console.warn(`Could not fetch detailed history for deal ${dealId}, using current stage only`);
    }
    
    // If no history found, add current stage with created date
    if (history.length === 0 && currentStage) {
      history.push({
        stage: currentStage,
        timestamp: createdAt || null
      });
    }

    // Ensure we have at least the current stage
    if (history.length === 0 && currentStage) {
      history.push({
        stage: currentStage,
        timestamp: createdAt || new Date().toISOString()
      });
    }

    // Sort by timestamp (oldest first)
    history.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeA - timeB;
    });

    return history;
  } catch (error) {
    console.warn(`Could not fetch stage history for deal ${dealId}:`, error.message);
    // Return empty array - will be handled gracefully in calculations
    return [];
  }
}

/**
 * Parse timestamp string to milliseconds
 */
function parseTimestamp(timestamp) {
  if (!timestamp) return null;
  return new Date(timestamp).getTime();
}

/**
 * Calculate duration in hours between two timestamps
 */
function calculateDurationHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const start = parseTimestamp(startTime);
  const end = parseTimestamp(endTime);
  if (!start || !end) return 0;
  return (end - start) / (1000 * 60 * 60); // Convert ms to hours
}

/**
 * Calculate stage durations for a deal based on stage history
 * Returns array of { stage, enteredAt, exitedAt, durationHours }
 */
function calculateStageDurations(deal, stageHistory) {
  const durations = [];
  
  if (!stageHistory || stageHistory.length === 0) {
    return durations;
  }

  // For each stage transition, calculate time spent in that stage
  for (let i = 0; i < stageHistory.length; i++) {
    const currentStage = stageHistory[i];
    const nextStage = stageHistory[i + 1];
    
    const enteredAt = currentStage.timestamp;
    const exitedAt = nextStage ? nextStage.timestamp : (deal.closedate || new Date().toISOString());
    
    const durationHours = calculateDurationHours(enteredAt, exitedAt);
    
    durations.push({
      stage: currentStage.stage,
      enteredAt,
      exitedAt,
      durationHours
    });
  }

  return durations;
}

/**
 * Calculate baseline average duration per stage from historical deals
 * @param {Array} deals - Array of deals with stage durations
 * @param {number} baselineCount - Number of deals to use for baseline
 * @returns {Object} Map of stage -> average duration in hours
 */
function calculateBaselineAverages(dealsWithDurations, baselineCount) {
  // Sort deals by createdate (oldest first) and take last N deals
  const sortedDeals = [...dealsWithDurations]
    .sort((a, b) => {
      const timeA = a.createdate ? new Date(a.createdate).getTime() : 0;
      const timeB = b.createdate ? new Date(b.createdate).getTime() : 0;
      return timeA - timeB;
    });

  const baselineDeals = sortedDeals.slice(-baselineCount);

  // Aggregate durations per stage
  const stageDurations = {}; // { stage: [duration1, duration2, ...] }

  baselineDeals.forEach(deal => {
    if (deal.stageDurations && deal.stageDurations.length > 0) {
      deal.stageDurations.forEach(sd => {
        if (!stageDurations[sd.stage]) {
          stageDurations[sd.stage] = [];
        }
        stageDurations[sd.stage].push(sd.durationHours);
      });
    }
  });

  // Calculate averages
  const baselineAverages = {};
  Object.keys(stageDurations).forEach(stage => {
    const durations = stageDurations[stage];
    const sum = durations.reduce((acc, d) => acc + d, 0);
    baselineAverages[stage] = sum / durations.length;
  });

  return baselineAverages;
}

/**
 * Calculate time saved for a deal
 * @param {Array} stageDurations - Array of stage durations for the deal
 * @param {Object} baselineAverages - Map of stage -> average duration in hours
 * @returns {Object} Time saved metrics
 */
function calculateTimeSaved(stageDurations, baselineAverages) {
  const stages = [];

  let totalTimeSavedHours = 0;

  stageDurations.forEach(sd => {
    const baselineDurationHours = baselineAverages[sd.stage] || 0;
    const actualDurationHours = sd.durationHours;
    
    // Time saved = max(0, baseline - actual)
    const timeSavedHours = Math.max(0, baselineDurationHours - actualDurationHours);
    totalTimeSavedHours += timeSavedHours;

    stages.push({
      stage: sd.stage,
      actualDurationHours: Math.round(actualDurationHours * 100) / 100, // Round to 2 decimals
      baselineDurationHours: Math.round(baselineDurationHours * 100) / 100,
      timeSavedHours: Math.round(timeSavedHours * 100) / 100
    });
  });

  const totalTimeSavedDays = totalTimeSavedHours / 24;

  return {
    totalTimeSavedHours: Math.round(totalTimeSavedHours * 100) / 100,
    totalTimeSavedDays: Math.round(totalTimeSavedDays * 100) / 100,
    stages
  };
}

/**
 * Calculate estimated revenue pull-forward
 * @param {number} dealAmount - Deal amount
 * @param {number} totalTimeSavedDays - Total time saved in days
 * @returns {number} Estimated revenue pulled forward
 */
function calculateRevenuePullForward(dealAmount, totalTimeSavedDays) {
  if (!dealAmount || dealAmount <= 0) return 0;
  // Revenue pull-forward = deal.amount * (total_time_saved_days / 365)
  return Math.round((dealAmount * (totalTimeSavedDays / 365)) * 100) / 100;
}

// =============================================================================
// API ENDPOINTS
// =============================================================================

/**
 * GET /api/deals
 * Returns all deals with associated contacts and companies
 */
app.get('/api/deals', async (req, res) => {
  try {
    console.log('Fetching deals from HubSpot...');

    // Fetch all deals
    const deals = await fetchDeals();
    console.log(`Found ${deals.length} deals`);

    // Fetch associations for each deal
    const dealsWithAssociations = await Promise.all(
      deals.map(async (deal) => {
        const [contacts, companies] = await Promise.all([
          fetchContactsForDeal(deal.id),
          fetchCompaniesForDeal(deal.id)
        ]);

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
        };
      })
    );

    console.log('Successfully fetched all deals with associations');
    res.json(dealsWithAssociations);

  } catch (error) {
    console.error('Error fetching deals:', error);
    
    if (error.message.includes('Not authenticated')) {
      return res.status(401).json({ error: 'Not authenticated', message: error.message });
    }
    
    res.status(500).json({ error: 'Failed to fetch deals', message: error.message });
  }
});

/**
 * GET /api/contacts
 * Returns all contacts
 */
app.get('/api/contacts', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!tokenStore.accessToken) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Please authenticate with HubSpot first' });
    }

    console.log('Fetching all contacts from HubSpot...');

    const contacts = await fetchAllContacts();
    console.log(`Found ${contacts.length} contacts`);

    res.json(contacts);

  } catch (error) {
    console.error('Error fetching contacts:', error);
    
    if (error.message.includes('Not authenticated') || error.message.includes('401')) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Your session has expired. Please reconnect.' });
    }
    
    res.status(500).json({ error: 'Failed to fetch contacts', message: error.message });
  }
});

/**
 * GET /api/campaigns
 * Returns all campaigns in HubSpot (requires authentication)
 */
app.get('/api/campaigns', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!tokenStore.accessToken) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Please authenticate with HubSpot first' });
    }

    console.log('Fetching campaigns from HubSpot...');

    const campaigns = await fetchCampaigns();
    console.log(`Found ${campaigns.length} campaigns`);
    
    // Log campaign names for debugging
    if (campaigns.length > 0) {
      console.log('Campaign names found:');
      campaigns.slice(0, 5).forEach((camp, idx) => {
        console.log(`  ${idx + 1}. "${camp.name}" (ID: ${camp.campaignId})`);
      });
    } else {
      console.log('WARNING: No campaigns returned from HubSpot');
    }

    res.json(campaigns);

  } catch (error) {
    console.error('Error fetching campaigns:', error);
    
    if (error.message.includes('Not authenticated') || error.message.includes('401')) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Your session has expired. Please reconnect.' });
    }
    
    res.status(500).json({ error: 'Failed to fetch campaigns', message: error.message });
  }
});

/**
 * GET /api/tickets
 * Returns all tickets in HubSpot with all details (requires authentication)
 */
app.get('/api/tickets', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!tokenStore.accessToken) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Please authenticate with HubSpot first' });
    }

    console.log('Fetching tickets from HubSpot...');

    const tickets = await fetchAllTickets();
    console.log(`Found ${tickets.length} tickets`);

    res.json(tickets);

  } catch (error) {
    console.error('Error fetching tickets:', error);
    
    if (error.message.includes('Not authenticated') || error.message.includes('401')) {
      return res.status(401).json({ error: 'Not authenticated', message: 'Your session has expired. Please reconnect.' });
    }
    
    res.status(500).json({ error: 'Failed to fetch tickets', message: error.message });
  }
});



/**
 * GET /api/realization/deals
 * Returns AI Value Realization metrics for all deals
 * Calculates time saved vs baseline and revenue pull-forward
 */
app.get('/api/realization/deals', async (req, res) => {
  try {
    console.log('Starting AI Value Realization calculation...');

    // Fetch all deals
    console.log('Fetching deals from HubSpot...');
    const deals = await fetchDealsForRealization();
    console.log(`Found ${deals.length} deals`);

    if (deals.length === 0) {
      return res.json([]);
    }

    // Fetch stage history and campaign associations for each deal
    console.log('Fetching stage history and campaigns for each deal...');
    const dealsWithHistory = await Promise.all(
      deals.map(async (deal) => {
        const [stageHistory, campaigns] = await Promise.all([
          fetchDealStageHistory(deal.id),
          fetchCampaignsForDealForRealization(deal.id)
        ]);
        const stageDurations = calculateStageDurations(deal, stageHistory);
        
        return {
          ...deal,
          stageHistory,
          stageDurations,
          campaigns
        };
      })
    );

    console.log('Calculating baseline averages...');
    // Calculate baseline averages from historical deals
    const baselineAverages = calculateBaselineAverages(dealsWithHistory, BASELINE_DEAL_COUNT);
    console.log('Baseline averages:', Object.keys(baselineAverages).length, 'stages');

    // Calculate time saved and revenue pull-forward for each deal
    console.log('Calculating time saved and revenue metrics...');
    const realizationResults = dealsWithHistory.map(deal => {
      const timeSaved = calculateTimeSaved(deal.stageDurations, baselineAverages);
      const estimatedRevenuePulledForward = calculateRevenuePullForward(
        deal.amount,
        timeSaved.totalTimeSavedDays
      );

      return {
        dealId: deal.id,
        dealName: deal.dealname || '(Unnamed Deal)',
        amount: deal.amount,
        // Time saved and profit grouped together
        timeSaved: {
          totalHours: timeSaved.totalTimeSavedHours,
          totalDays: timeSaved.totalTimeSavedDays,
          estimatedRevenuePulledForward
        },
        stages: timeSaved.stages,
        campaigns: deal.campaigns || []
      };
    });

    console.log(`Successfully calculated realization metrics for ${realizationResults.length} deals`);
    res.json(realizationResults);

  } catch (error) {
    console.error('Error calculating realization metrics:', error);
    
    if (error.message.includes('No HubSpot access token')) {
      return res.status(401).json({ 
        error: 'Not authenticated', 
        message: error.message 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to calculate realization metrics', 
      message: error.message 
    });
  }
});

/**
 * GET /dashboard
 * Serve the dashboard page
 */
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`\nServer running at http://localhost:${PORT}`);
  console.log(`\nOAuth Endpoints:`);
  console.log(`  - Connect: http://localhost:${PORT}/auth/hubspot`);
  console.log(`  - Callback: ${HUBSPOT_REDIRECT_URI}`);
});
