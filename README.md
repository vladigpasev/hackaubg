# HackAUBG Workspace

This repository contains three independent applications:

- `backend`: Main hospital API (NestJS + Prisma)
- `frontend`: Hospital web client (React + Vite)
- `centralised-api`: Additional centralised NestJS API service

## Quick Start

### backend

```bash
cd backend
npm install
npm run start:dev
```

### frontend

```bash
cd frontend
npm install
npm run dev
```

### centralised-api

```bash
cd centralised-api
npm install
npm run start:dev
```

By default `backend` runs on port `3000` and `centralised-api` is configured for port `3001`.
