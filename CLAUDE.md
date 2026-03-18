# n8n Nodes Velatir

Official n8n community node package for Velatir — human-in-the-loop AI function approval.

## Structure

```
src/
  index.ts                              # Package entry point
  credentials/
    VelatirApi.credentials.ts           # API key credential (X-API-Key header)
  nodes/
    Velatir/
      Velatir.node.ts                   # Versioned node wrapper (default: v2)
      Velatir.node.json                 # Node metadata
      velatir.svg                       # Node icon
      v1/VelatirV1.node.ts             # V1: polling-based approval
      v2/VelatirV2.node.ts             # V2: webhook/HITL-based
package.json                            # Node.js package config
tsconfig.json                           # TypeScript configuration
gulpfile.js                             # Build tasks (icon copying)
```

## Build & Development

```bash
# Install dependencies
npm install

# Build (TypeScript + gulp icon copy)
npm run build

# Watch mode for development
npm run dev

# Lint
npm run lint

# Fix lint issues
npm run lintfix

# Format
npm run format
```

## n8n Node Conventions

- Node API version: 1, uses `VersionedNodeType` (V1 + V2, default V2)
- **V1**: Polling-based — `POST /api/v1/watches` then polls status
- **V2**: Webhook/HITL — `POST /api/v1/trace`, supports `putExecutionToWait()` for human decisions
- Credential: `VelatirApi.credentials.ts` — `X-API-Key` header auth, test via `GET /api/v1/project`
- Uses `n8n-workflow` as a peer dependency
- Built output goes to `dist/` and is the only published directory
- Icons are copied via gulp during build
- Linting: ESLint with `eslint-plugin-n8n-nodes-base`

## Testing Locally

To test in a local n8n instance, link the package:

```bash
npm run build
npm link
cd ~/.n8n/custom
npm link n8n-nodes-velatir
```

Then restart n8n.
