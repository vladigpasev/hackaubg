# Backend

NestJS API for the HackAUBG monorepo.

## Responsibilities

- JWT auth baseline with `/api/v1/auth/login` and `/api/v1/auth/me`
- Profile and role baseline endpoints
- PostgreSQL-backed identity data via Prisma
- Redis-backed operational namespace reservation
- Health/readiness checks and Swagger docs

## Useful Commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:e2e
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

The Prisma scripts load environment variables from the monorepo root `.env` file.
