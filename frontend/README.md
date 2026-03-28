# Frontend

Plain React client-side application built with Vite.

## Routes

- `/`: backend health and API connectivity smoke test
- `/auth-smoke`: login and current-user verification using the seeded admin account

## Environment

The app reads `VITE_API_URL` from the monorepo root `.env` file because `vite.config.ts` points `envDir` to the repository root.
