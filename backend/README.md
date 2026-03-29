# Hospital Backend

`backend` is the hospital-side API for the HackAUBG demo. It owns staff authentication, patient intake, live workflow state, public patient lookup, admin tools, hospital archives, and the hospital's self-registration with the central dispatch service.

## Deployment Note

The intended production model is for us to host the system on-site inside hospitals. For demo purposes, this backend is also hosted at:

- API: [backend-production-785e.up.railway.app](https://backend-production-785e.up.railway.app)
- Swagger: [backend-production-785e.up.railway.app/api](https://backend-production-785e.up.railway.app/api)
- Health: [backend-production-785e.up.railway.app/health](https://backend-production-785e.up.railway.app/health)

## What This Service Does

- Authenticates staff with JWT-backed sessions stored in an `HttpOnly` cookie.
- Persists staff accounts and specialty waterfall configuration in SQLite through Prisma.
- Stores live queue state, active patient records, and matching state in Redis.
- Streams live updates to the hospital frontend and the public patient page through server-sent events.
- Matches waiting patients to doctors and lab/test flows.
- Archives hospital state snapshots and exposes archive lookup endpoints.
- Registers the hospital instance with the centralised API on boot.

## Runtime Model

### Persistence split

- SQLite stores durable configuration such as users and specialty waterfalls.
- Redis stores live operational state such as queue entries, current assignments, and active patient records.
- `archives/` stores exported historical snapshots used by the archive endpoints.

### Auth model

- `POST /auth/login` validates credentials and returns the current user.
- The backend sets an `HttpOnly` cookie named `hospital_auth`.
- In production the cookie is `Secure` and `SameSite=None`.
- The response also includes a JWT token that the frontend can keep as a bearer fallback for cross-site and SSE edge cases.

### Realtime model

- `GET /stream` is the authenticated SSE stream used by the staff frontend.
- `GET /public/stream?patient_id=...` is the patient-specific SSE stream used by the public tracking page.
- Queue, workflow, and patient events are pushed through a shared `StreamService`.

### Central dispatch registration

On startup, the backend attempts to call the centralised API's `/add-instance` endpoint using `HOSPITAL_LAT`, `HOSPITAL_LNG`, and an optional externally reachable `HOSPITAL_BASE_URL`. That is how the hospital becomes discoverable to the ambulance-side system.

## Environment Variables

Copy `.env.example` to `.env` and adjust values for your environment.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma SQLite connection string. Defaults are handled in code, but local `.env` should set it explicitly. |
| `JWT_SECRET` | Yes | Secret used by Nest JWT auth and cookie-backed session validation. |
| `REDIS_URL` | Yes | Redis connection used for live hospital state and queue orchestration. |
| `FRONTEND_ORIGIN` | Yes in practice | Comma-separated CORS allowlist for the hospital frontend origins. |
| `PORT` | No | HTTP port for the backend. Defaults to `3000`. |
| `HOSPITAL_LAT` | Yes | Latitude advertised to the centralised API. |
| `HOSPITAL_LNG` | Yes | Longitude advertised to the centralised API. |
| `CENTRALISED_API_URL` | Yes in practice | Base URL used when registering this hospital with the central dispatch service. |
| `HOSPITAL_BASE_URL` | Optional but recommended for hosted setups | Public base URL the centralised API should store for this hospital instead of the request IP. |
| `SEED_ON_BOOT` | Optional | When `true` outside production, demo data is seeded automatically at boot. |

Example:

```bash
DATABASE_URL="file:./hospital.db"
JWT_SECRET="replace-with-a-long-random-secret"
REDIS_URL="redis://127.0.0.1:6379"
FRONTEND_ORIGIN="http://localhost:5173,http://127.0.0.1:5173"
PORT=3000
HOSPITAL_LAT=42.02352916358495
HOSPITAL_LNG=23.089823070487814
CENTRALISED_API_URL="http://localhost:3001/api"
HOSPITAL_BASE_URL="http://127.0.0.1:3000"
SEED_ON_BOOT=false
```

## Install And Run

```bash
npm install
npx prisma migrate dev
npm run seed
npm run start:dev
```

Useful endpoints after boot:

- Swagger: [http://localhost:3000/api](http://localhost:3000/api)
- Health check: [http://localhost:3000/health](http://localhost:3000/health)

## Demo Data

`npm run seed` creates a larger demo roster and active patient journeys for the MVP demo flow.

Starter accounts:

- `registry.admissions` / `RegistryDemo!24`
- `nurse.elena` / `NurseWard!24`
- `doctor.nikola` / `DoctorICU!24`
- `tester.lab` / `TesterLab!24`

The seed script also prints the full generated login list and seeded patient scenario summary to the console.

## Folder Relationships

| Path | Purpose | How it relates to the rest of the service |
| --- | --- | --- |
| `src/auth` | Login, guards, roles, cookie/JWT config | Gates every authenticated route and drives staff identity |
| `src/patient` | Patient intake, checkout, detail lookup, public data, archives | Core patient lifecycle and public-facing patient endpoints |
| `src/workflow` | Queue storage helpers and legacy workflow actions | Works with Redis and matcher logic to move patients through care |
| `src/workspace` | Rich staff workspace bootstrap and queue actions | Powers the hospital frontend's doctor/nurse/registry experience |
| `src/service` | Prisma, Redis, matching, and stream services | Shared infrastructure used by patient, auth, workspace, and workflow layers |
| `src/admin` | Staff management endpoints and payload validation | Supports admin UI operations in the hospital frontend |
| `prisma` | Schema, migrations, seed data, and seed runner | Defines durable backend data and demo bootstrap |
| `scripts` | Helper scripts such as archive extraction | Operational tooling around archived data |
| `archives` | Generated archive bundles | Output of archive snapshots consumed by archive lookup endpoints |
| `test` | End-to-end Jest tests | Validates top-level backend behavior, though currently not green |

## API By Capability

### Authentication

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

### Patient intake and live patient records

- `POST /patient/check-in`
- `GET /patient/all`
- `PATCH /patient/:patient_id`
- `DELETE /patient/check-out/:patient_id`
- `GET /patient/details/:patient_id`
- `POST /patient/note/:patient_id`

### Public patient tracking

- `GET /public/patient/:patient_phonenumber`
- `GET /public/stream?patient_id=...`

### Workspace bootstrap and notifications

- `GET /workspace/bootstrap`
- `POST /workspace/notifications/:notificationId/read`

### Workflow actions used by the staff UI

- `POST /workflow/patients/:patientId/assignments`
- `POST /workflow/patients/:patientId/notes`
- `POST /workflow/doctor-visits/:visitId/start`
- `POST /workflow/doctor-visits/accept-next`
- `POST /workflow/doctor-visits/:visitId/not-here`
- `POST /workflow/doctor-visits/:visitId/complete`
- `POST /workflow/lab-items/:itemId/start`
- `POST /workflow/lab-items/accept-next`
- `POST /workflow/lab-items/:itemId/not-here`
- `POST /workflow/lab-items/:itemId/taken`
- `POST /workflow/lab-items/:itemId/results-ready`
- `POST /workflow/lab-batches/:batchId/results-ready`

### Doctor availability helpers

- `POST /doctor/status`
- `POST /doctor/free`

### Admin

- `GET /admin/staff`
- `POST /admin/staff`
- `PATCH /admin/staff/:username`
- `DELETE /admin/staff/:username`

### Archive and operational endpoints

- `GET /patient/archive-now`
- `GET /patient/archive/:dateTime`
- `GET /health`
- `GET /stream`
- `GET /decentralized/current-load`

### Legacy workflow helpers still present in the API

- `POST /sendPatient`
- `POST /finishTest`

## Workflow, Matching, And Load Reporting

### How matching works

- Waiting patient assignments are stored in Redis sorted structures.
- Doctors can be marked offline and are excluded from matching.
- Specialty waterfalls from Prisma allow fallback specialty chains when exact matches are not available.
- Successful matching updates Redis, removes the queued assignment, and emits stream events so the frontend refreshes.

### What `current-load` means

`GET /decentralized/current-load` is the value the centralised API asks for when comparing hospitals.

The current implementation:

- reads live queue entries from Redis
- weights `GREEN` as `1`, `YELLOW` as `1.5`, and `RED` as `2`
- sums the queue intensity
- divides by the number of currently online doctors
- returns the raw intensity if no doctors are online

It is a practical load heuristic for the demo, not a full hospital-capacity model.

## Archive Flow

- The service can archive live data on demand through `GET /patient/archive-now`.
- A daily archive job also runs at midnight.
- Archives are written under `archives/` and can be read back with `GET /patient/archive/:dateTime`.
- `scripts/dearchive.mjs` exists for extracting archive bundles during local investigation.

## Useful Commands

```bash
npm run prisma:generate
npm run build
npm run lint
npm test
npm run test:e2e
npm run seed
```

## Current Validation Status

These commands were re-run against the current repository state:

- `npm test`: passes
- `npm run test:e2e`: fails

The current e2e failure is not a product regression in the README. It happens because `src/controller/decentralized.controller.ts` imports `src/patient/patient.service` via a path that Jest does not currently resolve in that test setup.
