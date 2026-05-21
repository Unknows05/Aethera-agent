# 1 — Project Scaffolding

## Inisialisasi

```bash
mkdir aethera-v2 && cd aethera-v2
npm init -y
```

## package.json

```json
{
  "name": "aethera-v2",
  "version": "2.0.0",
  "type": "module",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "dev": "tsx watch src/cli/index.ts",
    "start": "tsx src/cli/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build:tui": "cd tui && npm run build"
  },
  "dependencies": {
    "@clack/prompts": "^0.9.0",
    "better-sqlite3": "^11.7.0",
    "dotenv": "^16.4.0",
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "js-yaml": "^4.1.0",
    "picocolors": "^1.1.0",
    "ws": "^8.18.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/js-yaml": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^4.1.6"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tui"]
}
```

## vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

## Directory Structure

```
aethera-v2/
├── src/
│   ├── cli/          # CLI commands
│   ├── config/       # Config schema, crypto, YAML loader
│   ├── exchange/     # Binance Futures client
│   ├── llm/          # OpenRouter client
│   ├── screening/    # Scanner, indicators, regime, microstructure
│   │   └── indicators/
│   ├── risk/         # Position sizing, leverage, circuit breaker
│   ├── learning/     # Lessons, pool memory, weights, curator
│   ├── orchestrator/ # Context, tools, trade handlers, cycles
│   └── api/          # Hono server + routes
├── tui/              # Ink+React terminal UI
├── tests/            # Vitest test files
└── data/             # Runtime data (gitignored)
```

## Install

```bash
npm install
mkdir -p data
```

## Verifikasi

```bash
npx tsc --noEmit           # Harus clean (0 error)
npx vitest run             # 0 tests for now
```

## Rules Penting

1. **ESM**: `"type": "module"` di package.json → semua import pakai `.js` extension
2. **ModuleResolution**: `"bundler"` → compatible dengan tsx dan TypeScript 5.x
3. **React 18**: Keep `react@^18.3.1` — React 19 break Ink
