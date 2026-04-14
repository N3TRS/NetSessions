# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev        # Watch mode (recommended for development)
npm run start:debug      # Watch mode with Node debugger

# Build & Production
npm run build            # Compile TypeScript via nest build
npm run start:prod       # Run compiled output (dist/main)

# Testing
npm run test             # Unit tests
npm run test:watch       # Unit tests in watch mode
npm run test:cov         # Unit tests with coverage
npm run test:e2e         # End-to-end tests (uses test/jest-e2e.json)

# Linting
npm run lint             # ESLint with auto-fix

# Prisma / Database
npm run prisma:generate  # Regenerate Prisma client after schema changes
npm run prisma:push      # Push schema changes to MongoDB
npm run prisma:studio    # Open Prisma Studio GUI
```

## Architecture Overview

**net-sessions** is a NestJS backend for real-time collaborative code editing and execution. It is one service within a larger OMNICODE platform.

### Module Map

| Module | Responsibility |
|---|---|
| `sessions` | CRUD for sessions, invite codes, participant management, snapshots |
| `collaboration` | Socket.io gateway (`/ws/session`) — presence, language changes, execution result broadcast |
| `execution` | Calls Piston API to run code; uses Redis locks to prevent concurrent runs |
| `yjs` | Native WebSocket server (`/ws/yjs/:sessionId`) — Yjs CRDT sync for collaborative editing |
| `redis` | Shared Redis client; session cache (TTL 5m), presence (TTL 2m), execution locks (TTL 8s) |
| `auth-integration` | JWT guard for HTTP + WebSocket; extracts `userEmail` from token payload |
| `persistence` | Prisma repositories over MongoDB (Session, SessionParticipant, SessionSnapshot) |
| `health` | `GET /v1/health` liveness check |

### Request Flow

**HTTP (REST):** All routes are prefixed `/v1`. A global `ValidationPipe` (whitelist + forbidNonWhitelisted) runs on every request. JwtAuthGuard protects routes that require authentication.

**Socket.io collaboration (`/ws/session`):** JWT is passed on connection. Clients emit `session.join` / `session.leave` / `session.language.changed`; the gateway broadcasts `execution.result` and `session.presence`.

**Yjs WebSocket (`/ws/yjs/:sessionId?token=JWT`):** Initialized on the raw HTTP server in `main.ts` alongside the NestJS app. Handles Yjs sync/awareness protocols directly using `y-websocket` utilities.

**Code execution:** `POST /v1/executions/run` → acquires a Redis lock → calls Piston API → broadcasts result via Socket.io → releases lock.

### External Dependencies

- **MongoDB Atlas** — primary persistence (via Prisma ORM)
- **Redis** (`redis://localhost:6379`) — session cache, presence, execution locks, pub/sub
- **Piston API** (`http://localhost:2000/api/v2`) — sandboxed code execution runtime (must be running locally)

### Key Constraints

- Max 5 collaborators per session (enforced in `sessions.service.ts`)
- Invite codes are 8-character hex strings
- Execution is serialized per session via an 8-second Redis lock
- JWT default expiry: 3h; secret configured via `JWT_SECRET` env var

### Environment Variables

```
PORT=3002
FRONTEND_URL=http://localhost:3001
DATABASE_URL=mongodb+srv://...
REDIS_URL=redis://localhost:6379
PISTON_API_URL=http://localhost:2000/api/v2
JWT_SECRET=...
JWT_EXPIRES_IN=3h
```
