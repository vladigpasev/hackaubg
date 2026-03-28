# Architecture Notes

## Data Ownership

- PostgreSQL stores users, profiles, roles, and user-role relationships.
- Redis is reserved for transient operational state such as triage queues, status updates, alerts, and short-lived sessions.

## Backend Boundaries

- `auth`: JWT login and current-user lookup
- `users`: user retrieval for authenticated flows
- `profiles`: profile read model for authenticated users
- `roles`: role listing and RBAC metadata
- `health`: PostgreSQL and Redis readiness
- `redis`: Redis client and reserved key namespaces
- `triage`: placeholder module for queue and patient-flow logic
- `hospital-integration`: placeholder module for future external system integration

## Frontend Scope

- Client-side rendered React app only
- Health and auth smoke routes to verify backend connectivity
- No domain workflows implemented yet
