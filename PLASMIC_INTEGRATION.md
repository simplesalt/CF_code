# Plasmic Builder Integration Guide

## Overview

This guide explains how to extend the CF authentication proxy to work within the Plasmic builder at `studio.plasmic.app`, allowing developers to access authenticated APIs during design time.

## Challenge: Cross-Origin Service Workers

Service workers have same-origin restrictions, meaning a service worker from `apps.simplesalt.company` cannot directly control requests from `studio.plasmic.app`. However, there are several solutions:

## Solution 1: Cross-Origin Script Loading (RECOMMENDED)

### How It Works
1. Load the service worker registration script from your domain into Plasmic
2. The script creates an inline service worker that communicates with your CF worker
3. API calls are intercepted and proxied through your authentication system

### Implementation

#### Step 1: Add Custom Code to Plasmic Project

In Plasmic Studio, add this to your project's custom code (Head section):

```html
<!-- CF Authentication Proxy Integration -->
<script>
// Configuration
window.CF_PROXY_CONFIG = {
  workerUrl: 'https://nuywznihg08edfslfk29.api.simplesalt.company',
  routingUrl: 'https://apps.simplesalt.company/routing.json',
  authDomain: 'simplesalt.company'
};
</script>

<!-- Load CF Auth utilities -->
<script src="https://apps.simplesalt.company/cf-auth.js"></script>

<!-- Load Service Worker Registration -->
<script>
(function() {
  'use strict';
  
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        // Fetch routing configuration
        const routingResponse = await fetch(window.CF_PROXY_CONFIG.routingUrl);
        const routingRules = await routingResponse.json();
        
        // Create inline service worker for Plasmic
        const swCode = `
          let routingRules = ${JSON.stringify(routingRules)};
          const workerUrl = '${window.CF_PROXY_CONFIG.workerUrl}';
          
          self.addEventListener('fetch', (event) => {
            const url = new URL(event.request.url);
            const rule = routingRules.find(r => url.hostname.includes(r.domain));
            
            if (rule && (rule.authType === 2 || rule.authType === 3)) {
              console.log('🔄 Intercepting API call to:', url.hostname);
              
              event.respondWith(
                (async () => {
                  try {
                    // Get CF Access token
                    const clients = await self.clients.matchAll();
                    let cfToken = null;
                    
                    if (clients.length > 0) {
                      const messageChannel = new MessageChannel();
                      const tokenPromise = new Promise((resolve) => {
                        messageChannel.port1.onmessage = (e) => resolve(e.data.cfToken);
                      });
                      
                      clients[0].postMessage({ type: 'GET_CF_TOKEN' }, [messageChannel.port2]);
                      cfToken = await tokenPromise;
                    }
                    
                    // Proxy through CF Worker
                    const proxyRequest = new Request(workerUrl, {
                      method: event.request.method,
                      headers: {
                        ...Object.fromEntries(event.request.headers.entries()),
                        'X-Original-URL': event.request.url,
                        'CF-Access-Jwt-Assertion': cfToken || '',
                        'X-Auth-Type': rule.authType.toString(),
                        'Origin': 'https://studio.plasmic.app'
                      },
                      body: event.request.body
                    });
                    
                    const response = await fetch(proxyRequest);
                    console.log('✅ Proxied request completed:', response.status);
                    return response;
                    
                  } catch (error) {
                    console.error('❌ Proxy request failed:', error);
                    return fetch(event.request);
                  }
                })()
              );
            }
          });
          
          // Handle messages from main thread
          self.addEventListener('message', (event) => {
            if (event.data.type === 'GET_CF_TOKEN') {
              // This will be handled by the main thread
              event.ports[0].postMessage({ cfToken: null });
            }
          });
          
          console.log('🚀 Plasmic API Proxy Service Worker loaded');
        `;
        
        const swBlob = new Blob([swCode], { type: 'application/javascript' });
        const swUrl = URL.createObjectURL(swBlob);
        
        const registration = await navigator.serviceWorker.register(swUrl, {
          scope: '/'
        });
        
        console.log('✅ Plasmic service worker registered:', registration);
        
        // Handle CF token requests from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data.type === 'GET_CF_TOKEN') {
            const token = window.cfAuth?.getCFAccessToken?.() || null;
            event.ports[0].postMessage({ cfToken: token });
          }
        });
        
      } catch (error) {
        console.error('❌ Failed to register Plasmic service worker:', error);
      }
    });
  }
})();
</script>
```

#### Step 2: Initialize CF Authentication

Add this to your Plasmic project's custom code (Body section):

```html
<script>
// Initialize CF authentication for Plasmic
(async function() {
  try {
    // Check if we're in Plasmic studio
    if (window.location.hostname === 'studio.plasmic.app') {
      console.log('🔐 Initializing CF Auth for Plasmic...');
      
      // Try to get existing CF token from parent window or storage
      let cfToken = localStorage.getItem('cf_access_token');
      
      if (!cfToken) {
        // Prompt user to authenticate
        const authUrl = `https://apps.simplesalt.company/auth-redirect?return=${encodeURIComponent(window.location.href)}`;
        console.log('🔄 CF authentication required. Visit:', authUrl);
        
        // You could show a modal or notification here
        window.plasmicAuthRequired = true;
      } else {
        console.log('✅ CF token found for Plasmic');
        window.plasmicAuthReady = true;
      }
    }
  } catch (error) {
    console.error('❌ CF Auth initialization failed:', error);
  }
})();

// Utility function for authenticated API calls in Plasmic
window.authenticatedFetch = async function(url, options = {}) {
  const cfToken = localStorage.getItem('cf_access_token');
  
  if (!cfToken) {
    throw new Error('CF authentication required. Please authenticate first.');
  }
  
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'CF-Access-Jwt-Assertion': cfToken
    }
  });
};
</script>
```

#### Step 3: Create Authentication Helper Page

Create a page at `apps.simplesalt.company/auth-redirect` that handles CF authentication and passes the token back to Plasmic:

```html
<!DOCTYPE html>
<html>
<head>
  <title>CF Auth for Plasmic</title>
  <script src="/cf-auth.js"></script>
</head>
<body>
  <div id="status">Authenticating...</div>
  
  <script>
  (async function() {
    try {
      // Initialize CF auth
      const token = await window.cfAuth.initializeAuth();
      
      if (token) {
        // Get return URL from query params
        const urlParams = new URLSearchParams(window.location.search);
        const returnUrl = urlParams.get('return');
        
        if (returnUrl && returnUrl.includes('studio.plasmic.app')) {
          // Store token for Plasmic to access
          const message = {
            type: 'CF_AUTH_SUCCESS',
            token: token,
            domain: 'simplesalt.company'
          };
          
          // Try to post message to parent window
          if (window.opener) {
            window.opener.postMessage(message, 'https://studio.plasmic.app');
          }
          
          // Also store in localStorage for cross-tab access
          localStorage.setItem('cf_access_token', token);
          
          document.getElementById('status').innerHTML = `
            <h2>✅ Authentication Successful</h2>
            <p>You can now close this window and return to Plasmic.</p>
            <script>
              // Auto-close after 3 seconds
              setTimeout(() => window.close(), 3000);
            </script>
          `;
        }
      }
    } catch (error) {
      document.getElementById('status').innerHTML = `
        <h2>❌ Authentication Failed</h2>
        <p>Error: ${error.message}</p>
      `;
    }
  })();
  </script>
</body>
</html>
```

## Solution 2: Self-Hosted Plasmic (ALTERNATIVE)

If cross-origin integration proves challenging, you can self-host Plasmic:

### Steps:

1. **Deploy Plasmic Container**:
   ```bash
   # Example using Docker
   docker run -d \
     --name plasmic-studio \
     -p 3000:3000 \
     -e PLASMIC_HOST=studio.simplesalt.company \
     plasmicapp/plasmic-studio
   ```

2. **Configure DNS**:
   - Point `studio.simplesalt.company` to your server
   - Set up SSL certificate

3. **Deploy Service Worker**:
   - Copy `/workspace/apps/public/sw.js` to your Plasmic deployment
   - Update CORS headers in CF worker to include your domain

4. **Configure CF Zero Trust**:
   - Add `studio.simplesalt.company` to your CF Access application

## Solution 3: API Proxy Endpoint (SIMPLE)

Create a simple proxy in your apps that forwards requests to the CF worker:

```javascript
// /pages/api/plasmic-proxy.js
export default async function handler(req, res) {
  // Verify request is from Plasmic
  const origin = req.headers.origin;
  if (!origin || !origin.includes('plasmic.app')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const targetUrl = req.headers['x-target-url'];
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target URL' });
  }
  
  try {
    const response = await fetch('https://nuywznihg08edfslfk29.api.simplesalt.company/', {
      method: req.method,
      headers: {
        ...req.headers,
        'X-Original-URL': targetUrl,
        'CF-Access-Jwt-Assertion': req.headers['cf-access-jwt-assertion'] || ''
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
    
  } catch (error) {
    res.status(500).json({ error: 'Proxy error', message: error.message });
  }
}
```

Then in Plasmic, use:
```javascript
// Instead of direct API calls
fetch('https://api.hubapi.com/contacts/v1/lists')

// Use the proxy
fetch('https://apps.simplesalt.company/api/plasmic-proxy', {
  headers: {
    'X-Target-URL': 'https://api.hubapi.com/contacts/v1/lists',
    'CF-Access-Jwt-Assertion': 'your-token'
  }
})
```

## Testing Plasmic Integration

### 1. Test Service Worker in Plasmic

1. Open Plasmic Studio
2. Open browser DevTools → Console
3. Check for service worker registration:
   ```javascript
   navigator.serviceWorker.getRegistrations().then(console.log);
   ```

### 2. Test API Interception

In Plasmic's code components or interactions:

```javascript
// This should be intercepted and proxied
fetch('https://api.hubapi.com/contacts/v1/lists')
  .then(response => response.json())
  .then(data => {
    console.log('API data:', data);
    // Use data in your Plasmic component
  })
  .catch(error => {
    console.error('API error:', error);
  });
```

### 3. Debug Issues

```javascript
// Check authentication status
console.log('CF Token:', localStorage.getItem('cf_access_token'));

// Check service worker status
navigator.serviceWorker.ready.then(registration => {
  console.log('Service Worker ready:', registration);
});

// Test authenticated fetch
window.authenticatedFetch('https://api.hubapi.com/contacts/v1/lists')
  .then(r => r.json())
  .then(console.log);
```

## Recommendations

1. **Start with Solution 1** (Cross-Origin Script Loading) as it's the least invasive
2. **Implement proper error handling** and user feedback in Plasmic
3. **Consider caching** API responses to reduce proxy load
4. **Set up monitoring** to track API usage from Plasmic
5. **Document the integration** for your development team

The cross-origin approach should work well for most use cases and allows you to leverage the existing CF infrastructure without self-hosting Plasmic.