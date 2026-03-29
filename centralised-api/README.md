# Centralised API

`centralised-api` is the dispatch-side registry service. Hospitals register themselves here, the service keeps a simple CSV-backed list of known hospital instances, and the ambulance frontend asks this service for a nearby hospital candidate.

## Deployment Note

The intended production model is self-hosted deployment for hospitals. For demo purposes, the centralised API is also hosted at:

- API: [centralised-api-production.up.railway.app](https://centralised-api-production.up.railway.app)
- Example lookup: [centralised-api-production.up.railway.app/api/find-best-fit-hospital?lat=42.02352916358495&lng=23.089823070487814](https://centralised-api-production.up.railway.app/api/find-best-fit-hospital?lat=42.02352916358495&lng=23.089823070487814)

## What This Service Does

- Accepts hospital self-registration through `/api/add-instance`
- Stores registered hospital instances in `data/instances.csv`
- Filters hospitals by geographic radius
- Calls each nearby hospital's `/decentralized/current-load` endpoint
- Returns a hospital candidate to the ambulance-side frontend

## Important Behavior Notes

This service is intentionally simple and the README describes the implementation faithfully.

- Hospitals are filtered to a `20 km` radius around the requested ambulance coordinates.
- For each nearby hospital, the service calls that hospital's `/decentralized/current-load` endpoint.
- The response currently returns the first record from that resulting list.
- The current implementation does **not** sort the candidates into a richer ranking by load, travel time, or distance before returning the match.

That means `/api/find-best-fit-hospital` is currently a nearby-hospital lookup with per-hospital load probing, not yet a full ranking engine.

## Environment Variables

Copy `.env.example` to `.env`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port for this service. Defaults to `3001`. |
| `HOSPITAL_NODE_PORT` | Optional | Port appended when stored hospital addresses do not already include one. Useful for local hospital instances. |
| `INSTANCE_STORE_DIR` | Optional | Directory used for the CSV-backed instance store. Defaults to `./data`. |

Example:

```bash
PORT=3001
HOSPITAL_NODE_PORT=3000
INSTANCE_STORE_DIR=./data
```

## Install And Run

```bash
npm install
cp .env.example .env
npm run start:dev
```

The service defaults to port `3001`.

## API Surface

### `GET /api/add-instance`

Registers or replaces a hospital record.

Query parameters:

- `lat`
- `lng`
- `baseUrl` (optional but recommended for hosted deployments)

Behavior:

- validates latitude and longitude
- normalizes `baseUrl` if provided
- otherwise falls back to the request IP for local scenarios
- stores the resulting instance record in the CSV file

### `GET /api/find-best-fit-hospital`

Accepts ambulance coordinates:

- `lat`
- `lng`

Behavior:

- loads the known hospital list from CSV
- filters hospitals within `20 km`
- asks each nearby hospital for `/decentralized/current-load`
- returns the first candidate from the resulting list

If a hospital cannot be reached, the service logs the failure and assigns that hospital a synthetic `load: Infinity` in the intermediate result.

## Data Store

Registered hospitals are stored in `data/instances.csv`.

Current local example:

```csv
ip,lat,lng
http://127.0.0.1,42.02352916358495,23.089823070487814
```

The service ensures the CSV file and header exist on startup.

## Folder Relationships

| Path | Purpose | Relationship |
| --- | --- | --- |
| `src` | NestJS controller, service, and bootstrap code | Contains the registration and lookup logic |
| `data` | CSV-backed hospital registry store | Runtime persistence for registered hospital instances |
| `test` | End-to-end Jest tests | Currently only contains the scaffolded e2e test |

## Operational Notes

- CORS is enabled for the whole service.
- Requests are wrapped with a `10 second` timeout middleware.
- The data store can also live on a mounted volume by changing `INSTANCE_STORE_DIR`.

## Useful Commands

```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

## Current Validation Status

These commands were re-run against the current repository state:

- `npm test`: fails because Jest does not discover any unit specs in the current source layout
- `npm run test:e2e`: fails because `test/app.e2e-spec.ts` still expects `GET /` to return `Hello World!`, but the current controller only exposes `/api/add-instance` and `/api/find-best-fit-hospital`
