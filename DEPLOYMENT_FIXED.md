# Fixed Cloudflare Worker Deployment Guide

## Issues Fixed

### 1. Wrangler Version Update
- **Issue**: Wrangler was out of date
- **Fix**: Updated to Wrangler v4
```bash
npm install --save-dev wrangler@4
```

### 2. Routes Configuration
- **Issue**: `routes` was configured as an object instead of array
- **Before**: 
```toml
[routes]
patterns = ["api.simplesalt.company/nuywznihg08edfslfk29/*"]
```
- **After**:
```toml
routes = ["nuywznihg08edfslfk29.api.simplesalt.company/*"]
```

### 3. KV Namespace Configuration
- **Issue**: Empty KV namespace ID causing validation error
- **Fix**: Commented out KV namespace until ID is available
```toml
# [[kv_namespaces]]
# binding = "CF_STATE"
# id = ""  # Will be populated from CF_IaC terraform outputs
```

### 4. Build Configuration
- **Issue**: Build command referenced non-existent npm script
- **Fix**: Commented out build section
```toml
# [build]
# command = "npm run build"
```

## Deployment Steps

### 1. Authenticate with Cloudflare
```bash
cd /workspace/CF_code
npx wrangler auth login
```

### 2. Test Configuration (Dry Run)
```bash
npx wrangler deploy --dry-run --env=""
```

### 3. Deploy to Production
```bash
npx wrangler deploy --env=""
```

### 4. Configure Secrets
After deployment, set up the required API secrets:

```bash
# HubSpot API Key
npx wrangler secret put 6nr8n2i1ve1rdnku8d1t

# Notion API Key  
npx wrangler secret put fhwowggbohorrud2kj16

# Add other secrets as needed based on routing.json
```

### 5. Verify Deployment
Test the worker endpoint:
```bash
curl -X GET "https://nuywznihg08edfslfk29.api.simplesalt.company/health" \
  -H "Origin: https://studio.plasmic.app"
```

## Configuration Summary

### Current wrangler.toml
```toml
name = "cf-workers"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"

routes = ["nuywznihg08edfslfk29.api.simplesalt.company/*"]

[env.development]
vars = { ENVIRONMENT = "development" }

[env.staging]
vars = { ENVIRONMENT = "staging" }
```

### Worker Features
✅ **CF Zero Trust Authentication** - Validates CF-Access-Jwt-Assertion headers
✅ **API Proxying** - Routes requests based on routing.json configuration
✅ **CORS Support** - Includes studio.plasmic.app in allowed origins
✅ **Secret Management** - Supports both CF Secrets and KV storage
✅ **Error Handling** - Comprehensive error responses and logging
✅ **Health Check** - `/health` endpoint for monitoring

### Supported Authentication Types
- **Type 2**: API Key authentication (stored in CF Secrets)
- **Type 3**: Bearer token authentication (stored in CF Secrets)

### Next Steps

1. **Deploy the worker** using the commands above
2. **Configure CF Zero Trust** protection for the subdomain
3. **Set up API secrets** for the services you want to proxy
4. **Test with Plasmic** using the service worker integration
5. **Add KV namespace** when available from CF_IaC terraform

### Troubleshooting

#### Common Issues:
1. **Authentication errors**: Ensure CF Zero Trust is configured
2. **CORS errors**: Check that origins are properly configured
3. **Secret not found**: Verify secrets are set with correct names
4. **Route not matching**: Ensure subdomain DNS is configured

#### Debug Commands:
```bash
# Check worker logs
npx wrangler tail

# Test specific route
curl -v "https://nuywznihg08edfslfk29.api.simplesalt.company/test"

# Validate configuration
npx wrangler deploy --dry-run
```

## Security Notes

- All API keys are stored as CF Secrets (encrypted)
- CF Zero Trust provides authentication layer
- CORS is restricted to specific domains
- No sensitive data is logged or exposed
- Requests are validated before proxying

The worker is now ready for deployment with proper configuration!