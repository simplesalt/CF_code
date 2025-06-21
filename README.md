# CF_code

Cloudflare Workers and Pages code for the simplesalt organization.

**Note**: This directory is intended to be moved to a separate `CF_code` repository.

This contains:
- Cloudflare Workers scripts
- Pages applications  
- Wrangler configuration
- Build and deployment scripts

## Structure

```
├── src/
│   └── index.js          # Main worker script
├── wrangler.toml         # Wrangler configuration
├── package.json          # Node.js dependencies
└── README.md            # This file
```

## Setup

1. Move this directory to a separate `CF_code` repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure wrangler:
   ```bash
   npx wrangler login
   ```
4. Update `wrangler.toml` with your KV namespace ID from the CF_IaC terraform outputs.

## Development

```bash
# Start development server
npm run dev

# Deploy to Cloudflare
npm run deploy

# Deploy to staging
npm run deploy:staging
```

## KV Integration

This worker integrates with the `CF_state` KV namespace created by the CF_IaC repository. The namespace stores:
- `0trust_applications`: Zero Trust application configurations

## Related Repositories

- [CF_IaC](https://github.com/simplesalt/CF_IaC) - Infrastructure as Code (DNS, Zero Trust, KV namespaces)