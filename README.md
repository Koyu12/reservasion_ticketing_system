# Reservation Ticketing System

A reservation system for one organization to publish free, in-person workshops and seminars with limited capacity. Attendees will discover events, reserve a place, and manage their reservations. Admins will manage events, availability, and attendee lists.

This is a portfolio and learning project. Its central product promise is that every confirmed reservation has capacity behind it.

## Current status

The project is in the planning and backend foundation stage.

- The PRD, architecture, database design, and implementation tracker are written.
- A NestJS starter exists under `backend/`, with starter tests and Prisma packages/configuration.
- The Prisma schema has no application models, and database access is not integrated into the running application.
- Authentication, reservation workflows, email delivery, and the frontend are pending.

The features and engineering guarantees below describe the V1 target. They are not implemented or verified yet.

## Planned features

- Browse upcoming workshops anonymously, search by title, and filter by date.
- Register and sign in with email/password or Google; verify email before booking.
- Reserve one place per account/event, receive immediate confirmation and a unique booking reference, and view reservation history.
- Cancel according to the event policy and rebook when registration and capacity permit.
- Let admins publish events, manage capacity and registration deadlines, view attendees, and handle cancellations or schedule/venue changes.
- Send essential booking and event emails, with persistent delivery jobs and admin retry controls for failed messages.

V1 uses English and displays times in `Asia/Jakarta` (WIB). It covers one organization and one capacity pool per event. Payments, assigned seats, temporary seat holds, group bookings, waitlists, and admission scanning are outside V1.

## Engineering focus

| Planned guarantee | Intended approach |
| --- | --- |
| Confirmed reservations stay within event capacity, including simultaneous attempts at the last place. | PostgreSQL event-row locks, transactional checks, and a fresh deadline check after acquiring the lock. |
| An account has at most one confirmed reservation per event. | A database partial unique index, backed by service-level validation. |
| Cancellation and rebooking preserve earlier history. | Retain cancelled reservations and create a new reservation/reference when rebooking; retain significant event revisions. |
| Booking/event changes and their pending emails commit together. | Persist email jobs in the same transaction, then send outside the transaction with retries and claim recovery. |
| Protected actions respect roles and reservation ownership. | Server-side session, verification, role, and ownership checks. |

These guarantees will need focused tests before being claimed as working. Email delivery is designed for at-least-once processing; it does not promise exactly-once delivery or arrival in an inbox.

## Technology

| Area | Current state | Planned direction |
| --- | --- | --- |
| Backend | NestJS 11 and TypeScript starter | Feature modules with controller -> service -> Prisma boundaries. |
| Database | Prisma 7, PostgreSQL adapter/driver, and an empty application schema | PostgreSQL-backed authentication, events, reservations, and email jobs. |
| Authentication and validation | Not integrated | Better Auth and Zod. |
| Frontend | Not created | React, TypeScript, Vite, React Router, TanStack Query, and native `fetch`. |
| Deployment | Not configured | One Railway application serving the frontend, API, and email sender, plus PostgreSQL. |

## Repository structure

```text
reservation_ticketcing_system/
|-- AGENTS.md
|-- PRD.md
|-- ARCHITECTURE.md
|-- DATABASE.md
|-- README.md
|-- TASKS.md
`-- backend/
    |-- src/
    |-- test/
    |-- prisma/
    |   `-- schema.prisma
    |-- prisma7.config.ts
    |-- package.json
    `-- package-lock.json
```

This shows the current key locations. The planned `frontend/` will be a sibling of `backend/`.

## Local development

Install Node.js and npm before starting. The exact supported runtime will be recorded during the dependency compatibility task.

From the repository root:

```powershell
cd backend
npm ci
npm run start:dev
```

The current starter serves `GET /` at [localhost:3000](http://localhost:3000). It returns the NestJS starter response. Set `PORT` in the process environment to use a different port. The planned `/api` routes are not available yet.

### Environment and database

The starter currently runs without a database connection. When database integration begins, PostgreSQL and a `DATABASE_URL` pointing to the intended development database will be required.

The existing `backend/prisma7.config.ts` loads dotenv and reads `DATABASE_URL`. Local database configuration belongs in `backend/.env`; keep credentials out of version control. The current NestJS bootstrap does not load that file itself.

There is no `.env.example` yet. Application models, migrations, seed data, and frontend setup are pending, so they are not part of the current startup instructions.

### Existing commands

Run these from `backend/`:

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Start the backend in watch mode. |
| `npm run build` | Compile the backend. |
| `npm run start:prod` | Run the compiled backend after building. |
| `npm test -- --runInBand` | Run the existing unit tests. |
| `npm run test:e2e -- --runInBand` | Run the existing HTTP end-to-end tests. |

The existing tests cover the starter only; they do not verify the planned reservation rules.

## Documentation

- [PRD](PRD.md): problem, scope, roles, features, and business rules.
- [Architecture](ARCHITECTURE.md): application structure, boundaries, and deployment direction.
- [Database design](DATABASE.md): ER diagram, models, relations, constraints, and history rules.
- [Implementation tasks](TASKS.md): ordered work, decision checkpoints, and completion criteria.
- [Repository instructions](AGENTS.md): working conventions for contributors and coding agents.
