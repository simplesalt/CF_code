/**
 * Authentication Proxy Worker
 * 
 * Handles API requests from authorized domains and proxies them to target APIs
 * using stored secrets. Integrates with CF Zero Trust for authentication.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS preflight handling
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }
    
    try {
      // Verify CF Zero Trust authentication
      const authResult = await verifyZeroTrustAuth(request, env);
      if (!authResult.valid) {
        return new Response(JSON.stringify({ 
          error: 'Authentication required',
          message: authResult.message 
        }), {
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            ...getCORSHeaders(request)
          }
        });
      }
      
      // Get routing configuration
      const routingConfig = await getRoutingConfig(env);
      
      // Extract original URL from headers (set by service worker)
      const originalUrl = request.headers.get('X-Original-URL');
      if (!originalUrl) {
        return new Response(JSON.stringify({ 
          error: 'Missing original URL header' 
        }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...getCORSHeaders(request)
          }
        });
      }
      
      const targetUrl = new URL(originalUrl);
      const route = findMatchingRoute(routingConfig, targetUrl.hostname);
      
      if (!route) {
        return new Response(JSON.stringify({ 
          error: 'No routing rule found for domain',
          domain: targetUrl.hostname 
        }), {
          status: 404,
          headers: { 
            'Content-Type': 'application/json',
            ...getCORSHeaders(request)
          }
        });
      }
      
      // Get API credentials for this route
      const credentials = await getApiCredentials(env, route);
      if (!credentials) {
        return new Response(JSON.stringify({ 
          error: 'API credentials not found',
          secretName: route.secretName 
        }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            ...getCORSHeaders(request)
          }
        });
      }
      
      // Proxy the request to the target API
      return await proxyRequest(request, originalUrl, credentials, route);
      
    } catch (error) {
      console.error('Proxy error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal proxy error',
        message: error.message 
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...getCORSHeaders(request)
        }
      });
    }
  },
};

/**
 * Verify CF Zero Trust authentication
 */
async function verifyZeroTrustAuth(request, env) {
  // Check for CF Access JWT in headers
  const cfAccessJwt = request.headers.get('CF-Access-Jwt-Assertion') || 
                     request.headers.get('Cf-Access-Jwt-Assertion');
  
  if (!cfAccessJwt) {
    return { 
      valid: false, 
      message: 'Missing CF Access JWT token' 
    };
  }
  
  try {
    // Verify JWT with CF Access (simplified - in production you'd verify signature)
    const payload = JSON.parse(atob(cfAccessJwt.split('.')[1]));
    
    // Check token expiry
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return { 
        valid: false, 
        message: 'CF Access token expired' 
      };
    }
    
    // Check if email domain is authorized
    if (payload.email && !payload.email.endsWith('@simplesalt.company')) {
      return { 
        valid: false, 
        message: 'Unauthorized domain' 
      };
    }
    
    return { 
      valid: true, 
      user: payload.email,
      aud: payload.aud 
    };
    
  } catch (error) {
    return { 
      valid: false, 
      message: 'Invalid CF Access token format' 
    };
  }
}

/**
 * Get routing configuration from apps.simplesalt.company
 */
async function getRoutingConfig(env) {
  try {
    const response = await fetch('https://apps.simplesalt.company/routing.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch routing config: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching routing config:', error);
    // Fallback to default config
    return [];
  }
}

/**
 * Find matching routing rule for domain
 */
function findMatchingRoute(routingConfig, hostname) {
  return routingConfig.find(rule => {
    return hostname === rule.domain || 
           hostname.endsWith('.' + rule.domain) || 
           hostname.includes(rule.domain);
  });
}

/**
 * Get API credentials from environment secrets
 */
async function getApiCredentials(env, route) {
  if (!route.secretName) {
    return null;
  }
  
  try {
    // Get secret from environment variable
    const secretValue = env[route.secretName];
    if (secretValue) {
      return { apiKey: secretValue };
    }
    
    // Try to get from KV store as fallback
    const kvValue = await env.CF_STATE?.get(`secret_${route.secretName}`);
    if (kvValue) {
      return JSON.parse(kvValue);
    }
    
    return null;
  } catch (error) {
    console.error('Error getting API credentials:', error);
    return null;
  }
}

/**
 * Proxy request to target API with authentication
 */
async function proxyRequest(originalRequest, targetUrl, credentials, route) {
  const url = new URL(targetUrl);
  
  // Prepare headers for the proxied request
  const proxyHeaders = new Headers();
  
  // Copy relevant headers from original request
  for (const [key, value] of originalRequest.headers.entries()) {
    // Skip CF-specific and proxy-specific headers
    if (!key.toLowerCase().startsWith('cf-') && 
        !key.toLowerCase().startsWith('x-') &&
        key.toLowerCase() !== 'host') {
      proxyHeaders.set(key, value);
    }
  }
  
  // Add authentication based on route type
  if (route.authType === 2 || route.authType === 3) {
    if (credentials.apiKey) {
      // Most APIs use Bearer token
      proxyHeaders.set('Authorization', `Bearer ${credentials.apiKey}`);
    }
    if (credentials.headers) {
      // Custom headers for specific APIs
      for (const [key, value] of Object.entries(credentials.headers)) {
        proxyHeaders.set(key, value);
      }
    }
  }
  
  // Set proper host header
  proxyHeaders.set('Host', url.hostname);
  proxyHeaders.set('User-Agent', 'SimpleSalt-API-Proxy/1.0');
  
  // Get request body if present
  let body = null;
  if (originalRequest.method !== 'GET' && originalRequest.method !== 'HEAD') {
    body = await originalRequest.blob();
  }
  
  // Make the proxied request
  const proxyResponse = await fetch(url.href, {
    method: originalRequest.method,
    headers: proxyHeaders,
    body: body
  });
  
  // Prepare response headers
  const responseHeaders = new Headers();
  
  // Copy response headers (excluding some that shouldn't be forwarded)
  for (const [key, value] of proxyResponse.headers.entries()) {
    if (!key.toLowerCase().startsWith('cf-') &&
        key.toLowerCase() !== 'server' &&
        key.toLowerCase() !== 'set-cookie') {
      responseHeaders.set(key, value);
    }
  }
  
  // Add CORS headers
  Object.entries(getCORSHeaders(originalRequest)).forEach(([key, value]) => {
    responseHeaders.set(key, value);
  });
  
  // Add proxy identification
  responseHeaders.set('X-Proxied-By', 'SimpleSalt-CF-Worker');
  responseHeaders.set('X-Original-Host', url.hostname);
  
  // Return the proxied response
  return new Response(proxyResponse.body, {
    status: proxyResponse.status,
    statusText: proxyResponse.statusText,
    headers: responseHeaders
  });
}

/**
 * Handle CORS preflight requests
 */
function handleCORS(request) {
  return new Response(null, {
    status: 200,
    headers: getCORSHeaders(request)
  });
}

/**
 * Get CORS headers
 */
function getCORSHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = [
    'https://apps.simplesalt.company',
    'https://studio.plasmic.app',
    'http://localhost:3000',
    'http://localhost:54423',
    'http://localhost:55753'
  ];
  
  const corsOrigin = allowedOrigins.includes(origin) ? origin : 'https://apps.simplesalt.company';
  
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Original-URL, X-Auth-Type, X-Secret-Name, CF-Access-Jwt-Assertion',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}