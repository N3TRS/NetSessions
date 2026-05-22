# 🖥️ NetSessions — Microservicio de Sesiones Colaborativas en Tiempo Real

<div align="center">

### 🛠️ Stack Tecnológico

![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11.0.1-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Prisma_6-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Embedded-DC382D?style=for-the-badge&logo=redis&logoColor=white)

### ☁️ Colaboración & Tiempo Real

![Yjs](https://img.shields.io/badge/Yjs-CRDT_Sync-5522A1?style=for-the-badge)
![Socket.IO](https://img.shields.io/badge/Socket.IO-WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![Piston](https://img.shields.io/badge/Piston-Code_Execution-009688?style=for-the-badge)
![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)

### 🚀 Infraestructura

![Docker](https://img.shields.io/badge/Docker-Multi--stage-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI/CD-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)
![Azure](https://img.shields.io/badge/Azure-Container_Registry-0078D4?style=for-the-badge&logo=microsoftazure&logoColor=white)
![SonarQube](https://img.shields.io/badge/SonarQube-Quality-4E9BCD?style=for-the-badge&logo=sonarqube&logoColor=white)

</div>

---

## 📑 Tabla de Contenidos

1. [👤 Integrantes](#1--integrantes)
2. [🎯 Objetivo del Microservicio](#2--objetivo-del-microservicio)
3. [⚡ Funcionalidades Principales](#3--funcionalidades-principales)
4. [📋 Estrategia de Versionamiento y Branches](#4--estrategia-de-versionamiento-y-branches)
5. [⚙️ Tecnologías Utilizadas](#5-️-tecnologías-utilizadas)
6. [🧩 Funcionalidad y Endpoints](#6--funcionalidad-y-endpoints)
7. [🏛️ Arquitectura, Patrones y Módulos](#7-️-arquitectura-patrones-y-módulos)
8. [⚠️ Manejo de Errores](#8-️-manejo-de-errores)
9. [🧪 Evidencia de Pruebas y Cobertura](#9--evidencia-de-pruebas-y-cobertura)
10. [🗂️ Organización del Código](#10-️-organización-del-código)
11. [🔗 Conexiones con Servicios Externos](#11--conexiones-con-servicios-externos)
12. [🚀 Ejecución del Proyecto](#12--ejecución-del-proyecto)
13. [🐳 Dockerización](#13--dockerización)
14. [⚙️ Pipelines CI/CD](#14-️-pipelines-cicd)
15. [☁️ Despliegue en Azure](#15-️-despliegue-en-azure)
16. [🤝 Integrantes y Contribuciones](#16--integrantes-y-contribuciones)

---

## 1. 👤 Integrantes

- Tulio Riaño Sánchez
- Julian Camilo Lopez Barrero
- Juan Sebastián Puentes Julio
- David Alejandro Patacon Henao

---

## 2. 🎯 Objetivo del Microservicio

**NetSessions** es el núcleo de colaboración en tiempo real de **OmniCode**. Gestiona sesiones de programación colaborativa donde múltiples usuarios editan código simultáneamente usando CRDT (Yjs), ejecutan código en múltiples lenguajes via Piston API, y controlan permisos de participantes con roles granulares. Persiste el estado CRDT del código en MongoDB y usa Redis para caché de sesiones activas y sincronización multi-instancia.

---

## 3. ⚡ Funcionalidades Principales

| Funcionalidad | Descripción |
|---|---|
| **Sesiones colaborativas** | Crea sesiones con código de invitación (8-char hex). Soporte multi-usuario con CRDT (Yjs). |
| **Sincronización CRDT** | WebSocket nativo (`/ws/yjs/:sessionId`) para sync de Yjs entre clientes. Estado en Redis (hot) + MongoDB (cold). |
| **Ejecución de código** | Ejecuta JavaScript, TypeScript, Python y Java via Piston API con lock Redis por sesión (8s). |
| **Snapshots** | Guarda el código actual como snapshot con descripción. Vinculable con NetBoard. |
| **Control de roles** | El owner puede asignar roles: `OWNER`, `VIEW_EDIT_EXECUTE_SAVE`, `VIEW_EDIT_EXECUTE`, `VIEW_EDIT`, `VIEW`. |
| **Presencia en tiempo real** | Socket.IO gateway difunde join/leave y status online de participantes. |
| **Métricas Prometheus** | Expone `http_requests_total` y latencia en `/metrics`. |

---

## 4. 📋 Estrategia de Versionamiento y Branches

### Estrategia de Ramas (Git Flow)

#### `main` — Estable, dispara build Docker → ACR → Azure
#### `develop` — Integración de features
#### `feature/*` — Desarrollo específico

### 4.1 Convenciones para commits

```
feat: agregar endpoint PATCH /sessions/:id/participants/:email/role
fix: corregir rate limiting en ejecución de código (8s lock)
test: agregar pruebas para yjs.service
chore: actualizar prisma schema con índice en inviteCode
```

---

## 5. ⚙️ Tecnologías Utilizadas

| **Tecnología** | **Uso en el proyecto** |
|---|---|
| **TypeScript 5.7.3** | Lenguaje base. |
| **NestJS 11.0.1** | Framework REST + WebSocket. |
| **Node.js 20** | Runtime. |
| **@prisma/client 6.19.3** | ORM para MongoDB con driver nativo. |
| **ioredis 5.8.2** | Cliente Redis para caché y pub/sub. |
| **yjs 13.6.30** | CRDT para sincronización colaborativa sin conflictos. |
| **y-websocket 3.0.0** | Servidor WebSocket nativo para protocolo Yjs. |
| **ws 8.20.0** | WebSocket server para el protocolo Yjs. |
| **socket.io** | Gateway de presencia y eventos de sesión. |
| **@nestjs/jwt** | Validación JWT en REST y WebSocket. |
| **prom-client 15.1.3** | Métricas Prometheus. |
| **class-validator** | Validación de DTOs. |
| **Jest 30** | Framework de pruebas unitarias. |
| **SonarCloud** | Análisis estático de calidad. |
| **GitHub Actions** | Pipeline CI/CD (build + test + Docker + Azure). |
| **Azure Container Registry** | Almacenamiento de imágenes Docker. |
| **Azure Web App** | Despliegue en producción (`omnicode-api-real-time`). |

---

## 6. 🧩 Funcionalidad y Endpoints

**Base URL:** `/v1` | **Auth:** Bearer JWT en todas las rutas excepto `/health`

---

### Sesiones REST

#### 1️⃣ Crear Sesión — `POST /v1/sessions`

```json
{ "name": "Mi sesión Python", "language": "python" }
```

**Response (201):**
```json
{
  "id": "abc123",
  "name": "Mi sesión Python",
  "inviteCode": "a1b2c3d4",
  "ownerEmail": "user@example.com",
  "language": "python",
  "participants": [],
  "onlineCount": 0,
  "createdAt": "2026-05-22T10:00:00Z"
}
```

---

#### 2️⃣ Listar Sesiones del Usuario — `GET /v1/sessions`

#### 3️⃣ Obtener Sesión — `GET /v1/sessions/:id`

#### 4️⃣ Obtener Código Actual — `GET /v1/sessions/:id/code`

**Response:** `{ "code": "print('hello world')" }`

---

#### 5️⃣ Unirse a Sesión — `POST /v1/sessions/join`

```json
{ "inviteCode": "a1b2c3d4" }
```

---

#### 6️⃣ Renombrar Sesión — `PATCH /v1/sessions/:id/rename` *(solo owner)*

```json
{ "name": "Nuevo nombre" }
```

---

#### 7️⃣ Eliminar Sesión — `DELETE /v1/sessions/:id` *(solo owner, soft-delete)*

---

#### 8️⃣ Crear Snapshot — `POST /v1/sessions/:id/snapshots`

```json
{ "description": "Versión estable antes de refactoring" }
```

---

#### 9️⃣ Actualizar Rol de Participante — `PATCH /v1/sessions/:id/participants/:email/role` *(solo owner)*

```json
{ "role": "VIEW_EDIT_EXECUTE" }
```

| Rol | Permisos |
|---|---|
| `OWNER` | Control total |
| `VIEW_EDIT_EXECUTE_SAVE` | Ver + editar + ejecutar + guardar snapshots |
| `VIEW_EDIT_EXECUTE` | Ver + editar + ejecutar |
| `VIEW_EDIT` | Ver + editar |
| `VIEW` | Solo lectura |

---

### Ejecución de Código

#### 🔟 Ejecutar Código — `POST /v1/executions/run`

```json
{
  "sessionId": "abc123",
  "language": "python",
  "code": "print('Hello World')",
  "stdin": "",
  "args": []
}
```

**Response:**
```json
{ "stdout": "Hello World\n", "stderr": "", "runtime": 0.123, "exitCode": 0 }
```

| Lenguaje | Versión Piston |
|---|---|
| JavaScript | 18.15.0 |
| TypeScript | 5.0.3 |
| Python | 3.12.0 |
| Java | 15.0.2 |

---

### WebSocket — Presencia (`/ws/session`)

**Auth:** JWT en `handshake.auth.token`

| Evento Cliente → Servidor | Payload | Descripción |
|---|---|---|
| `session.join` | `{ sessionId }` | Registrar presencia en sesión |
| `session.leave` | `{ sessionId }` | Salir de sesión |
| `session.language.changed` | `{ sessionId, language }` | Cambiar lenguaje activo |

| Evento Servidor → Cliente | Descripción |
|---|---|
| `session.presence` | Join/leave de participantes con lista actualizada |
| `execution.result` | Resultado de ejecución difundido a todos |
| `session.roleUpdated` | Cambio de rol de un participante |

---

### WebSocket — Yjs CRDT (`/ws/yjs/:sessionId?token=JWT`)

WebSocket nativo (no Socket.IO) para protocolo Yjs:
- Frame `0x00` — Sync full state
- Frame `0x01` — Sync update incremental
- Frame `0x02` — Awareness (presencia/cursor)

---

## 7. 🏛️ Arquitectura, Patrones y Módulos

### Capas de Persistencia del Estado CRDT

```
Cliente Yjs ──► /ws/yjs/:sessionId ──► YjsService
                                           │
                              ┌────────────┴─────────────┐
                              ▼                           ▼
                        Redis (hot cache)          MongoDB (cold store)
                        TTL: sesión activa         Persistencia permanente
```

### Módulos

```
AppModule
├── AuthIntegrationModule    (JwtAuthGuard HTTP + WsJwtGuard WebSocket)
├── SessionsModule           (REST CRUD, lógica de negocio, permisos)
├── CollaborationModule      (Socket.IO gateway de presencia)
├── ExecutionModule          (Piston API client + rate limiting Redis)
├── HealthModule             (liveness probe)
├── PersistenceModule        (repositorios Prisma)
├── RedisModule              (ioredis client)
├── YjsModule                (servidor WebSocket Yjs + sincronización CRDT)
└── MetricsModule            (Prometheus)
```

### Patrones Aplicados

| Patrón | Dónde | Propósito |
|---|---|---|
| **Repository** | 4 repositorios Prisma | Abstrae queries MongoDB del servicio. |
| **Guard** | `JwtAuthGuard`, `WsJwtGuard` | Valida JWT en HTTP y WebSocket respectivamente. |
| **Rate Limiting** | Redis lock en `ExecutionService` | Previene ejecuciones concurrentes por sesión (8s lock). |
| **CRDT dual-layer** | `YjsService` | Redis para latencia baja, MongoDB para durabilidad. |
| **Interceptor** | `MetricsInterceptor` | Tracking Prometheus de requests. |

---

## 8. ⚠️ Manejo de Errores

| ⚠️ Escenario | 🔢 HTTP | Descripción |
|:---|:---:|:---|
| JWT inválido | 401 | Guards HTTP y WebSocket rechazan la petición |
| Sesión no encontrada | 404 | Repository lanza `NotFoundException` |
| Operación no permitida por rol | 403 | `permissions.ts` valida permisos mínimos |
| Código de invitación inválido | 404 | No se encuentra sesión activa con ese código |
| Error de ejecución Piston | 500 | `PistonService` retorna error con detalles |
| Error inesperado | 500 | `HttpExceptionFilter` global retorna JSON uniforme |

---

## 9. 🧪 Evidencia de Pruebas y Cobertura

### Suites de prueba — 20 archivos

```
test/unit/
├── common/http-exception.filter.spec.ts
└── modules/
    ├── auth-integration/jwt-auth.guard.spec.ts
    ├── collaboration/
    │   ├── collaboration.gateway.spec.ts
    │   ├── collaboration.gateway.di.spec.ts
    │   └── ws-jwt.guard.spec.ts
    ├── execution/
    │   ├── execution.controller.spec.ts
    │   ├── execution.service.spec.ts
    │   ├── execution.service.di.spec.ts
    │   └── piston.service.spec.ts
    ├── persistence/
    │   ├── sessions.repository.spec.ts
    │   ├── session-participants.repository.spec.ts
    │   ├── session-snapshots.repository.spec.ts
    │   └── yjs-doc-state.repository.spec.ts
    ├── redis/
    │   ├── redis.service.spec.ts
    │   └── redis.utils.spec.ts
    ├── sessions/
    │   ├── sessions.controller.spec.ts
    │   ├── sessions.controller.di.spec.ts
    │   ├── sessions.service.spec.ts
    │   └── permissions.spec.ts
    └── yjs/yjs.service.spec.ts
```

### Cómo ejecutar

```bash
npm run test          # Unitarias
npm run test:cov      # Cobertura LCOV (para SonarCloud)
npm run test:e2e      # E2E (test/app.e2e-spec.ts)
```

---

## 10. 🗂️ Organización del Código

```
NetSessions/
│
├── src/
│   ├── main.ts                          # Bootstrap, Swagger, Yjs init
│   ├── app.module.ts                    # Módulo raíz
│   ├── common/filters/                  # HttpExceptionFilter
│   ├── metrics/                         # Prometheus
│   └── modules/
│       ├── auth-integration/guards/     # JWT HTTP + WebSocket
│       ├── sessions/                    # REST CRUD + permisos + DTOs
│       ├── collaboration/               # Socket.IO gateway presencia
│       ├── execution/                   # Piston client + controller
│       ├── health/                      # GET /health
│       ├── persistence/                 # Repositorios Prisma + PrismaService
│       ├── redis/                       # ioredis client + utils
│       └── yjs/                         # Servidor Yjs WebSocket nativo
│
├── prisma/schema.prisma                 # Session, SessionYjsState, SessionParticipant, SessionSnapshot
├── docker/
│   ├── redis.conf                       # Config Redis embebido
│   └── entrypoint.sh                    # Startup: Redis + Prisma + NestJS
├── Dockerfile                           # Multi-stage con Redis embebido
├── docker-compose.yml
├── sonar-project.properties             # org: n3trs, project: N3TRS_NetSessions
├── .github/workflows/main_omnicode-real-time.yml
└── package.json
```

---

## 11. 🔗 Conexiones con Servicios Externos

| Servicio | Variable de Entorno | Descripción |
|---|---|---|
| **MongoDB Atlas** | `DATABASE_URL` | Sesiones, participantes, snapshots, estado Yjs (Prisma). |
| **Redis** | `REDIS_URL` | Caché CRDT (hot), locks de ejecución, pub/sub multi-instancia. Omitir = Redis embebido. |
| **Piston API** | `PISTON_API_URL` | Sandbox de ejecución de código. Default: `http://localhost:2000/api/v2`. |
| **JWT** (NetAuthentication) | `JWT_SECRET` | Secreto compartido para validar tokens. |
| **SonarCloud** | `SONAR_TOKEN` | Análisis estático (org: n3trs). |

---

## 12. 🚀 Ejecución del Proyecto

### 📋 Prerrequisitos

- **Node.js 20+**, **npm**, **Docker**

```bash
npm install
npx prisma generate

npm run start:dev
```

📍 **URL Local:** `http://localhost:3002`
📚 **Swagger:** `http://localhost:3002/api`
🔌 **Yjs WebSocket:** `ws://localhost:3002/ws/yjs/:sessionId?token=JWT`
🔌 **Socket.IO presencia:** `ws://localhost:3002/ws/session`

### ⚙️ Variables de Entorno

| Variable | Requerida | Default | Descripción |
|:---|:---:|:---|:---|
| `PORT` | ❌ | `3002` | Puerto del servidor |
| `DATABASE_URL` | ✅ | — | MongoDB URI |
| `REDIS_URL` | ❌ | `redis://127.0.0.1:6379` | Redis externo (omitir = embebido en Docker) |
| `PISTON_API_URL` | ❌ | `http://localhost:2000/api/v2` | Sandbox de ejecución |
| `JWT_SECRET` | ✅ | — | Clave JWT |
| `JWT_EXPIRES_IN` | ❌ | `3h` | Expiración de tokens |
| `FRONTEND_URL` | ✅ | — | Origin CORS |

---

## 13. 🐳 Dockerización

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
RUN npm ci && npx prisma generate
RUN nest build

# Stage 2: Production (Redis embebido)
FROM node:20-alpine
RUN apk add --no-cache tini redis
COPY --from=builder /app/dist ./dist
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD redis-cli ping && curl -f http://localhost:3002/v1/health
ENTRYPOINT ["tini", "--", "./docker/entrypoint.sh"]
```

| ✅ Característica | Descripción |
|:---|:---|
| **Multi-stage** | Imagen final sin devDeps ni código fuente |
| **Redis embebido** | Sin dependencia externa obligatoria en producción |
| **Tini PID 1** | Manejo correcto de señales UNIX en Docker |
| **Health check** | Redis + HTTP verificados cada 30s |

---

## 14. ⚙️ Pipelines CI/CD

### Pipeline — `main_omnicode-real-time.yml`

**Triggers:** push a `main`, `workflow_dispatch`

```
Checkout → Node.js 20 → npm install → build → test:cov
    → SonarCloud scan
    → Azure login (OIDC) → ACR login (acromnicodeprod.azurecr.io)
    → docker build + tag (SHA + latest) → docker push ACR
    → Azure WebApp deploy (imagen SHA)
    → Reconcile settings (delete REDIS_URL, set WEBSITES_PORT=3002)
    → Smoke test (retry 24x/5s → GET /v1/health)
```

### Secrets requeridos

| Secret | Descripción |
|---|---|
| `SONAR_TOKEN` | SonarCloud (org: n3trs) |
| `AZUREAPPSERVICE_CLIENTID` | Service Principal |
| `AZUREAPPSERVICE_TENANTID` | Azure tenant |
| `AZUREAPPSERVICE_SUBSCRIPTIONID` | Azure subscription |

---

## 15. ☁️ Despliegue en Azure

| Recurso | Valor |
|---|---|
| **App Service** | `omnicode-api-real-time` |
| **Container Registry** | `acromnicodeprod.azurecr.io` |
| **Runtime** | Docker (imagen del ACR) |
| **Puerto** | `WEBSITES_PORT=3002` |

### Variables en Azure App Service

| Nombre | Descripción |
|---|---|
| `DATABASE_URL` | MongoDB Atlas URI |
| `JWT_SECRET` | Clave JWT compartida |
| `PISTON_API_URL` | URL del sandbox de ejecución |
| `FRONTEND_URL` | URL del frontend (Vercel) |
| `WEBSITES_PORT` | `3002` |

---

## 16. 🤝 Integrantes y Contribuciones

<div align="center">

![Course](https://img.shields.io/badge/Course-ARSW-orange?style=for-the-badge)
![Year](https://img.shields.io/badge/Year-2026--1-blue?style=for-the-badge)

| 👤 Integrante | 🎓 Rol |
|:---|:---|
| Tulio Riaño Sánchez | Desarrollo y arquitectura |
| Julian Camilo Lopez Barrero | Desarrollo y arquitectura |
| Juan Sebastián Puentes Julio | Desarrollo y arquitectura |
| David Alejandro Patacon Henao | Desarrollo y arquitectura |

> 💡 **NetSessions** es el corazón colaborativo de OmniCode: gestiona sesiones de programación en tiempo real con sincronización CRDT (Yjs), ejecución de código multi-lenguaje, snapshots versionados y control de acceso granular por roles.

**🎓 Escuela Colombiana de Ingeniería Julio Garavito**

</div>
