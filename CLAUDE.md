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
npm run test:debug       # Unit tests with Node inspector (--runInBand)

# Run a single test file
npx jest src/modules/sessions/sessions.service.spec.ts

# Linting & Formatting
npm run lint             # ESLint with auto-fix
npm run format           # Prettier format src/ and test/

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
| `redis` | Shared Redis client; session cache (TTL 1d), presence (TTL 2m), execution locks (TTL 8s) |
| `auth-integration` | JWT guard for HTTP + WebSocket; extracts `userEmail` from token payload |
| `persistence` | Prisma repositories over MongoDB (Session, SessionParticipant, SessionSnapshot, SessionYjsState) |
| `health` | `GET /health` liveness check (note: not under `/v1` prefix) |

### Request Flow

**HTTP (REST):** All routes are prefixed `/v1`. A global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform) and `HttpExceptionFilter` (`src/common/filters/`) run on every request. `JwtAuthGuard` protects routes requiring authentication; the guard extracts `userEmail` from the JWT payload into `request.user`.

**Socket.io collaboration (`/ws/session`):** JWT passed via `handshake.auth.token` or `Authorization` header. Clients emit `session.join` / `session.leave` / `session.language.changed`; the gateway broadcasts `execution.result` and `session.presence`. Presence state is synced across instances via Redis pub/sub on channel `channel:session:{id}:events`.

**Yjs WebSocket (`/ws/yjs/:sessionId?token=JWT`):** Initialized on the raw HTTP server in `main.ts` alongside the NestJS app. Handles Yjs sync/awareness protocols using binary frame types: `0x00` (sync full), `0x01` (sync update), `0x02` (awareness). CORS is validated on the HTTP upgrade.

**Code execution:** `POST /v1/executions/run` → acquire Redis lock (`session:{id}:run:lock`, 8s TTL) → call Piston API → broadcast result via Socket.io → release lock.

### Data Layer

**MongoDB models (via Prisma):**
- `Session` — core entity; soft-deleted via `isActive`; indexed on `ownerEmail`, `isActive`, `createdAt`
- `SessionParticipant` — join table; unique on `(sessionId, userEmail)`; tracks `isOnline`, `joinedAt`, `leftAt`
- `SessionSnapshot` — versioned code saves; up to 200k chars of code per snapshot
- `SessionYjsState` — binary Yjs document state (`Bytes`); 1:1 with Session; cascade-deleted

**Yjs dual-layer persistence:**
- Hot: Redis binary cache (`yjs:doc:{sessionId}`, 1-day TTL, 500ms write debounce)
- Cold: MongoDB `SessionYjsState` (5-second write debounce); flushed synchronously on graceful shutdown

### External Dependencies

- **MongoDB Atlas** — primary persistence (via Prisma ORM)
- **Redis** (`redis://localhost:6379`) — session cache, presence, execution locks, pub/sub
- **Piston API** (`http://localhost:2000/api/v2`) — sandboxed code execution (must be running locally); supported languages: JavaScript 18.15.0, TypeScript 5.0.3, Python 3.12.0, Java 15.0.2

### Key Constraints

- Max 5 collaborators per session (enforced in `sessions.service.ts:markParticipantOnline`)
- Invite codes are 8-character hex strings (5-retry uniqueness check, throws `ConflictException` on failure)
- Execution is serialized per session via an 8-second Redis lock; lock owner format: `{email}:{timestamp}`
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
