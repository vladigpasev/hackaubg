# Hospital Frontend

React + Vite frontend for the MVP hospital demo.

## Environment

Copy `.env.example` to `.env` and point the frontend to the backend:

```bash
VITE_API_BASE_URL="http://localhost:3000"
```

## Auth Flow

- `/login` is public-only.
- `/registry`, `/nurse`, and `/doctor` are protected role routes.
- The frontend hydrates auth state from `GET /auth/me`.
- Login and logout use the backend REST API with `credentials: 'include'`.
- The JWT stays in an `HttpOnly` cookie and is never stored in browser storage.

## Run

```bash
npm install
npm run dev
```

## Build and Lint

```bash
npm run build
npm run lint
```
