# Hospital Backend

NestJS backend for the MVP hospital demo. Authentication is cookie-based JWT auth backed by SQLite through Prisma.

## Environment

Copy `.env.example` to `.env` and set:

```bash
DATABASE_URL="file:./hospital.db"
JWT_SECRET="replace-with-a-long-random-secret"
FRONTEND_ORIGIN="http://localhost:5173"
PORT=3000
```

`JWT_SECRET` is required at startup.

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

## Demo Users

- `registry.admissions` / `RegistryDemo!24`
- `nurse.elena` / `NurseWard!24`
- `nurse.martin` / `NurseShift!24`
- `doctor.nikola` / `DoctorICU!24`
- `doctor.petrova` / `DoctorCardio!24`
- `tester.lab` / `TesterLab!24`
- `tester.scan` / `TesterScan!24`

## Useful Commands

```bash
npm run build
npm run lint
npm run test:e2e
npm run seed
```
