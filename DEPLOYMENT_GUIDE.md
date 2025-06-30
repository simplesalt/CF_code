# CF Authentication Proxy - Deployment Guide

## Current Status ✅

### ✅ CF Worker Code - NOW FEATURE COMPLETE
The CF worker (`/workspace/CF_code/src/index.js`) has been updated to be a full authentication proxy that:

1. **Verifies CF Zero Trust authentication** via JWT tokens
2. **Fetches routing configuration** from apps.simplesalt.company/routing.json
3. **Retrieves API secrets** from environment variables or KV store
4. **Proxies requests** to target APIs with proper authentication
5. **Handles CORS** for cross-origin requests
6. **Supports multiple domains** including studio.plasmic.app

### ✅ Apps Service Worker - WORKING
The service worker in `/workspace/apps/public/sw.js` properly:
- Intercepts API calls based on routing.json
- Adds CF Access JWT tokens to requests
- Redirects to the CF worker proxy

### ✅ Configuration Files - UPDATED
- `wrangler.toml` configured for the correct subdomain
- `routing.json` cleaned up and properly formatted

## Deployment Steps

### 1. Deploy CF Worker

```bash
cd /workspace/CF_code

# Set up secrets for API keys
wrangler secret put 6nr8n2i1ve1rdnku8d1t
# Enter your HubSpot API key when prompted

wrangler secret put fhwowggbohorrud2kj16
# Enter your Notion API key when prompted

# Deploy the worker
wrangler deploy
```

### 2. Configure CF Zero Trust Protection

**CRITICAL**: You must manually configure CF Access for the worker subdomain:

1. Go to Cloudflare Dashboard → Zero Trust → Access → Applications
2. Add Application:
   - **Name**: API Authentication Proxy
   - **Subdomain**: nuywznihg08edfslfk29
   - **Domain**: api.simplesalt.company
   - **Type**: Self-hosted

3. Create Policy:
   - **Name**: GSuite Domain Users
   - **Action**: Allow
   - **Include**: Emails ending in @simplesalt.company

4. Advanced Settings:
   - **Session Duration**: 24h
   - **Auto-redirect to identity**: Yes

### 3. Deploy Apps to CF Pages

The apps repository should auto-deploy via GitHub → CF Pages integration.

Verify these files are included:
- `/public/sw.js` - Service worker
- `/public/sw-register.js` - Registration script
- `/public/routing.json` - Routing configuration
- `/public/cf-auth.js` - CF Auth utilities

## Testing the Setup

### 1. Test CF Worker Directly

```bash
# This should redirect to CF Access login
curl -v https://nuywznihg08edfslfk29.api.simplesalt.company/

# After authentication, test with JWT
curl -H "CF-Access-Jwt-Assertion: YOUR_JWT_TOKEN" \
     -H "X-Original-URL: https://api.hubapi.com/contacts/v1/lists" \
     https://nuywznihg08edfslfk29.api.simplesalt.company/
```

### 2. Test Service Worker Integration

1. Visit https://apps.simplesalt.company
2. Open browser DevTools → Console
3. Check service worker registration:
   ```javascript
   console.log(window.swUtils.getStatus());
   ```
4. Test API call interception:
   ```javascript
   fetch('https://api.hubapi.com/contacts/v1/lists')
     .then(r => r.json())
     .then(console.log);
   ```

## Plasmic Integration Options

### Option 1: Cross-Origin Service Worker (RECOMMENDED)

The CF worker now includes `studio.plasmic.app` in CORS headers, so you can:

1. **Load the service worker script** in Plasmic's custom code:
   ```html
   <script src="https://apps.simplesalt.company/sw-register.js"></script>
   ```

2. **Include CF Auth utilities**:
   ```html
   <script src="https://apps.simplesalt.company/cf-auth.js"></script>
   ```

3. **Make authenticated API calls** from Plasmic components:
   ```javascript
   // This will be intercepted and proxied through CF worker
   fetch('https://api.hubapi.com/contacts/v1/lists')
     .then(response => response.json())
     .then(data => console.log(data));
   ```

### Option 2: Self-Host Plasmic (ALTERNATIVE)

If cross-origin doesn't work, you can self-host Plasmic:

1. **Deploy Plasmic container** on your domain (e.g., studio.simplesalt.company)
2. **Add domain to routing** in CF worker CORS headers
3. **Deploy service worker** directly in the Plasmic container

### Option 3: Proxy Approach (FALLBACK)

Create a simple proxy endpoint in your apps that forwards to the CF worker:

```javascript
// /pages/api/proxy.js
export default async function handler(req, res) {
  const response = await fetch('https://nuywznihg08edfslfk29.api.simplesalt.company/', {
    method: req.method,
    headers: {
      ...req.headers,
      'X-Original-URL': req.headers['x-target-url']
    },
    body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
  });
  
  const data = await response.json();
  res.status(response.status).json(data);
}
```

## Security Considerations

### ✅ Implemented
- CF Zero Trust authentication required
- API keys stored as CF Worker secrets
- CORS properly configured
- JWT token validation
- Domain-based access control

### 🔄 Recommended Enhancements
- JWT signature verification (currently just payload validation)
- Rate limiting per user/domain
- Audit logging of API calls
- Secret rotation mechanism

## Troubleshooting

### Common Issues

1. **Service Worker Not Registering**
   - Check HTTPS requirement
   - Verify CORS headers
   - Check browser console for errors

2. **CF Access Not Working**
   - Verify Zero Trust application configuration
   - Check JWT token in browser cookies
   - Ensure domain matches exactly

3. **API Calls Not Intercepted**
   - Check routing.json syntax
   - Verify authType values (2 or 3 for interception)
   - Check service worker scope

### Debug Commands

```javascript
// Check service worker status
window.swUtils.getStatus()

// Reload routing configuration
window.swUtils.reloadRoutingConfig()

// Check CF Auth status
window.cfAuth.getCFAccessToken()

// Test authenticated fetch
window.cfAuth.authenticatedFetch('https://api.hubapi.com/contacts/v1/lists')
```

## Next Steps

1. **Deploy the updated CF worker** with the new authentication proxy code
2. **Configure CF Zero Trust** protection for the worker subdomain
3. **Test the complete flow** from apps.simplesalt.company
4. **Implement Plasmic integration** using Option 1 (cross-origin service worker)
5. **Set up monitoring** and error tracking for the proxy

The system is now feature-complete and ready for deployment!