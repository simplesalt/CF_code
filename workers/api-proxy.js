/**
 * API Proxy Worker
 * Handles API requests from apps.simplesalt.company and proxies them to appropriate services
 * Uses routing rules from apps.simplesalt.company/routing.json
 * API keys are bound directly as secrets (no separate secrets store needed)
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  

  try {
    // Get routing configuration from apps.simplesalt.company
    const routingResponse = await fetch('https://apps.simplesalt.company/routing.json')
    const routing = await routingResponse.json()
    
    // Find matching route
    const path = url.pathname
    const route = findMatchingRoute(routing.routes, path)
    
    if (!route) {
      return new Response('Route not found', { 
        status: 404,
        headers: getCorsHeaders()
      })
    }
    
    // Get API key from secrets store
    const apiKey = await getApiKey(route.secretName)
    if (!apiKey) {
      return new Response('API key not found', { 
        status: 500,
        headers: getCorsHeaders()
      })
    }
    
    // Proxy the request
    const targetUrl = route.target + path.replace(route.pattern, '')
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: {
        ...request.headers,
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Cloudflare-Worker-API-Proxy'
      },
      body: request.method !== 'GET' ? request.body : undefined
    })
    
    const response = await fetch(proxyRequest)
    const responseBody = await response.text()
    
    return new Response(responseBody, {
      status: response.status,
      headers: {
        ...getCorsHeaders(),
        'Content-Type': response.headers.get('Content-Type') || 'application/json'
      }
    })
    
  } catch (error) {
    return new Response(`Proxy error: ${error.message}`, { 
      status: 500,
      headers: getCorsHeaders()
    })
  }
}

function findMatchingRoute(routes, path) {
  for (const route of routes) {
    const regex = new RegExp(route.pattern)
    if (regex.test(path)) {
      return route
    }
  }
  return null
}

async function getApiKey(secretName) {
  try {
    // Get API key from bound secret
    const apiKeys = JSON.parse(API_KEYS || '{}')
    return apiKeys[secretName]
  } catch (error) {
    console.error('Error getting API key:', error)
    return null
  }
}

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://apps.simplesalt.company',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}