# Hospital Frontend

`frontend` is the hospital-side web client for the HackAUBG project. It serves staff workflows for registry, nurse, doctor, and admin roles, and it also includes the public patient tracking pages that let a patient follow an active hospital visit by phone number.

## Deployment Note

The intended production model is self-hosted deployment for hospitals. For demo purposes, the hospital frontend is also hosted at [frontend-production-438f.up.railway.app](https://frontend-production-438f.up.railway.app).

## What This App Covers

- Staff login and session hydration
- Role-gated routes for registry, nurse, doctor, and admin flows
- Live hospital workspace updates backed by server-sent events
- Public patient lookup and patient-specific live status pages
- Admin staff management and archive browsing
- Frontend-specific design and safety guidance under `docs/`

## Route Map

| Route | Audience | Purpose |
| --- | --- | --- |
| `/login` | Public-only | Staff sign-in page |
| `/` | Auth-aware redirect | Sends authenticated users to the correct workspace |
| `/registry` | `registry` | Intake and queue-management flow |
| `/nurse` | `nurse` | Nurse-facing patient queue flow |
| `/doctor` | `doctor` | Doctor and tester workspace |
| `/admin` | `admin` | Staff management and archive access |
| `/public/patient` | Public | Phone-number lookup form |
| `/public/patient/:phoneNumber` | Public | Live patient status page |

## Auth And Session Behavior

The real auth behavior is slightly richer than "cookie only," and the README documents that explicitly.

- The backend is the source of truth for authentication.
- On page load, `AuthProvider` hydrates the session with `GET /auth/me`.
- Login posts credentials to `POST /auth/login`.
- The backend sets an `HttpOnly` cookie named `hospital_auth`.
- The login response can also include a JWT token, and the frontend stores that token in local storage as a fallback for bearer-auth requests and SSE edge cases.
- Route protection is enforced in the frontend with `ProtectedRoute` and `PublicOnlyRoute`.
- Logout clears local auth state and asks the backend to clear the cookie.

## Realtime Behavior

- Staff workspace state is hydrated from `GET /workspace/bootstrap`.
- After bootstrap, the app subscribes to the backend SSE stream at `/stream`.
- When queue or patient events arrive, the frontend refreshes the hospital snapshot instead of trying to patch every state branch manually.
- Public patient pages use `/public/patient/:phoneNumber` for the initial fetch and `/public/stream?patient_id=...` for patient-specific live updates.

## Environment Variables

Copy `.env.example` to `.env`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | Base URL of the hospital backend API |
| `PORT` | No | Preview/start port used by `vite preview` scripts |

Example:

```bash
VITE_API_BASE_URL="http://localhost:3000"
PORT=4173
```

## Install And Run

```bash
npm install
cp .env.example .env
npm run dev
```

The app expects the hospital backend to be running and reachable at `VITE_API_BASE_URL`.

## How The Frontend Is Organized

| Path | Purpose | Relationship |
| --- | --- | --- |
| `src/auth` | Auth provider, route guards, client helpers, token storage | Shared auth layer for all protected routes |
| `src/pages` | Top-level route pages | Composes the feature modules into the actual route map |
| `src/features/receptionist` | Staff queue and workspace flows | Powers registry, nurse, and doctor-facing operational screens |
| `src/features/public-patient` | Public lookup form and patient status UI | Talks to the backend's public patient endpoints |
| `src/features/admin` | Staff management and archive UI | Wraps admin API operations exposed by the backend |
| `docs` | Product direction, design rules, and UX safety guidance | Canonical docs for future frontend evolution |

## Key Frontend Flows

### Registry, nurse, and doctor flows

- `useHospitalState` loads the current hospital snapshot and keeps it fresh.
- The receptionist/workspace service layer fetches the bootstrap payload, then reacts to SSE refresh events.
- Queue actions such as assigning work, starting visits, marking tests ready, or finishing steps go through the backend API and then refresh the shared snapshot.

### Public patient tracking

- The patient enters the phone number used at check-in.
- The frontend fetches the active patient record from `GET /public/patient/:phoneNumber`.
- The patient details page opens a patient-specific SSE stream and refreshes when the backend emits updates or checkout events.

### Admin

- Admin flows use dedicated API helpers for staff CRUD and archive lookup.
- Archive browsing reads the backend's archived data snapshots rather than live Redis state.

## Frontend Docs In This Repo

These docs already exist and remain the canonical product guidance for the hospital frontend:

- [`docs/design-system.md`](docs/design-system.md)
- [`docs/ux-safety-rules.md`](docs/ux-safety-rules.md)
- [`docs/content-localization.md`](docs/content-localization.md)

## Useful Commands

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Current Validation Status

These commands were re-run against the current repository state:

- `npm test`: passes

There is active automated coverage for auth, hospital-state hooks, public patient pages, workspace behavior, and several receptionist utilities/components.
