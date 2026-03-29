# Ambulance Frontend

`centralized-frontend` is the ambulance-facing client in the HackAUBG demo. It asks the browser for the ambulance's live location, sends that location to the centralised API, and visualizes the returned hospital candidate on a Leaflet map with a direct handoff to Google Maps directions.

## Deployment Note

The intended production model is for us to host the system on-site inside hospitals. For demo purposes, the ambulance frontend is also hosted at [centralized-frontend-production.up.railway.app](https://centralized-frontend-production.up.railway.app).

## What This App Does

- Requests browser geolocation with high accuracy enabled
- Calls the centralised API's `/api/find-best-fit-hospital` endpoint
- Draws the ambulance and hospital locations on a Leaflet map
- Fits the map viewport around both points when both are available
- Computes a simple point-to-point distance estimate for the UI
- Builds a Google Maps driving directions link for the selected hospital

## Runtime Flow

1. The user opens the ambulance UI.
2. The browser requests location access.
3. The app sends `lat` and `lng` to the centralised API.
4. The centralised API returns a hospital candidate.
5. The app renders both markers, a route line, distance information, and a directions link.

## Environment Variables

Copy `.env.example` to `.env`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_CENTRALISED_API_BASE_URL` | Yes | Base URL of the dispatch registry service |
| `PORT` | No | Preview/start port used by the Vite preview script |

Example:

```bash
VITE_CENTRALISED_API_BASE_URL=http://localhost:3001
PORT=4174
```

## Install And Run

```bash
npm install
cp .env.example .env
npm run dev
```

The centralised API must be reachable at `VITE_CENTRALISED_API_BASE_URL`.

## Folder Relationships

| Path | Purpose | Relationship |
| --- | --- | --- |
| `src/App.tsx` | Main ambulance flow and map logic | Handles geolocation, API calls, banners, and rendered map state |
| `src/App.css` | App-specific styling for the ambulance experience | Styles the map layout, panels, and custom markers |
| `src/index.css` | Global CSS | Base page-level styling and shared variables |
| `src/assets` | Image assets | Decorative and static assets used by the app |
| `public` | Static public files | Served directly by Vite |

## Map And Lookup Notes

- The map is built with `react-leaflet` and Leaflet.
- Custom HTML marker icons are used for the ambulance and hospital pins.
- When both points exist, the app fits the map bounds around them with padding.
- If only one point exists, the app flies to that location.
- The displayed distance is a simple great-circle estimate, not a routed road distance.
- The directions handoff uses Google Maps with `travelmode=driving`.

## Useful Commands

```bash
npm run dev
npm run build
npm run lint
```

## Current Validation Status

These commands were re-run against the current repository state:

- `npm run build`: passes

There is currently no automated test suite in this app. Build verification is the active validation path today.
