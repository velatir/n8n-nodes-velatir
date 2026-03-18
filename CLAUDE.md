# n8n Nodes Velatir

Official n8n community node package for Velatir — human-in-the-loop AI function approval.

## Structure

```
src/
  index.ts                              # Package entry point
  credentials/
    VelatirApi.credentials.ts           # API key credential definition
  nodes/
    Velatir/                            # Velatir node implementation
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

- Node API version: 1
- Credential: `VelatirApi.credentials.ts` — API key authentication
- Node: `Velatir.node.ts` — main node definition
- Uses `n8n-workflow` as a peer dependency
- Built output goes to `dist/` and is the only published directory
- Icons are copied via gulp during build

## Testing Locally

To test in a local n8n instance, link the package:

```bash
npm run build
npm link
cd ~/.n8n/custom
npm link n8n-nodes-velatir
```

Then restart n8n.
