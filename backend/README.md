# Hospital Backend

NestJS backend for the MVP hospital demo. Authentication is cookie-based JWT auth backed by SQLite through Prisma.

## Environment

Copy `.env.example` to `.env` and set:

```bash
DATABASE_URL="file:./hospital.db"
JWT_SECRET="replace-with-a-long-random-secret"
REDIS_URL="redis://127.0.0.1:6379"
FRONTEND_ORIGIN="http://localhost:5173"
PORT=3000
```

`JWT_SECRET` and `REDIS_URL` are required at startup.

## Install and Run

```bash
npm install
npx prisma migrate dev
npm run seed
npm run start:dev
```

Swagger is available at [http://localhost:3000/api](http://localhost:3000/api).

## Auth API

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

The backend sets an `HttpOnly` cookie named `hospital_auth`. The cookie expires after 8 hours. In production it is marked `Secure`.

## Protected Patient API

- `POST /patient/check-in` (`registry`)
- `GET /patient/all` (authenticated users)
- `DELETE /patient/check-out/:patient_id` (`registry`)
- `PATCH /patient/:patient_id` (`registry`, `nurse`)
- `GET /patient/details/:patient_id` (authenticated users)
- `POST /patient/note/:patient_id` (authenticated users)
- `GET /stream` (authenticated users)

## Demo Users

`npm run seed` now creates a larger demo roster across `registry`, `nurse`, `doctor`, and tester accounts, plus active Redis-backed patient journeys. The seed command prints the full login list after it finishes.

Starter accounts:

- `registry.admissions` / `RegistryDemo!24`
- `nurse.elena` / `NurseWard!24`
- `doctor.nikola` / `DoctorICU!24`
- `tester.lab` / `TesterLab!24`

## Useful Commands

```bash
npm run build
npm run lint
npm run test:e2e
npm run seed
```
