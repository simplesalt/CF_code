# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start local development server
npm run dev
```

**Deployment**: Automatic on `git push origin dev` via GitHub integration with Cloudflare Workers. No manual deployment commands needed.

## Architecture Overview

This is a Cloudflare Workers repository that implements an authentication proxy system for the SimpleSalt organization. The codebase consists of two main worker implementations:

### Core Components

1. **Main Worker** (`src/index.js`) - Modern authentication proxy that:
   - Integrates with Cloudflare Zero Trust for authentication
   - Fetches routing configuration from `apps.simplesalt.company/routing.json`
   - Proxies authenticated API requests to target services
   - Handles CORS for allowed origins including Plasmic Studio
   - Supports multiple authentication types and credential sources

2. **Legacy Worker** (`workers/api-proxy.js`) - Simpler proxy implementation using older event listener pattern

### Key Features

- **Zero Trust Integration**: Validates CF-Access-Jwt-Assertion tokens
- **Dynamic Routing**: Fetches routing rules from external JSON configuration  
- **Multi-source Credentials**: Supports environment variables and KV store for API keys
- **CORS Support**: Configured for apps.simplesalt.company and Plasmic development environments
- **Error Handling**: Comprehensive error responses with proper HTTP status codes

### Configuration

- **Worker Name**: `nuywznihg08edfslfk29` (deployed to api.simplesalt.company/nuywznihg08edfslfk29)
- **KV Namespace**: `CF_STATE` (currently commented out, needs ID from CF_IaC terraform outputs)
- **Environment Variables**: Configured in wrangler.toml with development/staging overrides
- **Secrets**: API keys stored as Wrangler secrets (set via `wrangler secret put`)

### Related Infrastructure

This worker integrates with:
- **CF_IaC repository**: Provides KV namespace IDs and Zero Trust configuration
- **apps.simplesalt.company**: Hosts routing configuration and serves as authorized origin
- **Plasmic Studio**: Supported as development environment for UI components

### Authentication Flow

1. Request arrives with CF-Access-Jwt-Assertion header
2. JWT token is validated for expiry and authorized domain (@simplesalt.company)
3. Original URL is extracted from X-Original-URL header
4. Routing configuration determines target API and required credentials
5. Request is proxied with appropriate authentication headers