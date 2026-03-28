# HackAUBG Monorepo

Hackathon-ready monorepo with a Vite React frontend, a NestJS backend, PostgreSQL for durable identity data, and Redis reserved for operational state such as queues and alerts.

## Stack

- `frontend/`: Vite, React, TypeScript, React Router, CSR only
- `backend/`: NestJS, Prisma, PostgreSQL, Redis, JWT auth, RBAC, Swagger
- `infra/`: Docker Compose for PostgreSQL and Redis

## Requirements

- Node.js 22.x
- pnpm 8.x
- Docker

## Quick Start

1. Copy the sample environment file:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start PostgreSQL and Redis:

   ```bash
   pnpm dev:infra
   ```

4. Run the initial migration and seed baseline roles plus a local admin user:

   ```bash
   pnpm --filter backend prisma:generate
   pnpm --filter backend prisma:migrate:deploy
   pnpm --filter backend prisma:seed
   ```

5. Start both applications:

   ```bash
   pnpm dev
   ```

6. Open:

- Frontend: http://localhost:5173
- API docs: http://localhost:3000/api/docs
- Health endpoint: http://localhost:3000/api/v1/health

## Seeded Admin Account

- Email: `admin@local.dev`
- Password: `admin1234`

## Local Service Ports

- PostgreSQL: `127.0.0.1:5433`
- Redis: `127.0.0.1:6380`

## Workspace Scripts

- `pnpm dev`: run frontend and backend together
- `pnpm dev:frontend`: run only the frontend
- `pnpm dev:backend`: run only the backend
- `pnpm dev:infra`: start PostgreSQL and Redis
- `pnpm dev:infra:down`: stop PostgreSQL and Redis
- `pnpm build`: build all workspaces
- `pnpm lint`: lint all workspaces
- `pnpm typecheck`: typecheck all workspaces
- `pnpm test`: run backend unit and e2e smoke tests
- `pnpm format`: format the repository
