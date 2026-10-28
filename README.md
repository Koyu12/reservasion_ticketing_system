# Reservation Ticketing System

A reservation system for one organization to publish free, in-person workshops and seminars with limited capacity. Attendees will discover events, reserve a place, and manage their reservations. Admins will manage events, availability, and attendee lists.

This is a portfolio and learning project. Its central product promise is that every confirmed reservation has capacity behind it.

## Current status

The project is implementing its authentication foundation.

- The PRD, architecture, database design, and implementation tracker are written.
- A NestJS starter exists under `backend/`, with starter tests and Prisma packages/configuration.
- The eight Prisma models, initial migration, native constraints, and shared PostgreSQL connection have focused integration checks.
- Email/password authentication, database sessions, basic React account forms, and Resend delivery are implemented. The final account-form browser walkthrough remains pending.
- Email verification, recovery, Google sign-in, and reservation/event workflows remain in their later tasks.

The features and engineering guarantees below describe the full V1 target; implemented foundations do not yet establish the complete booking workflow.

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
| Database | Prisma 7, PostgreSQL models, migrations, and constraint checks | Transactional event/reservation workflows. |
| Authentication and validation | Better Auth email/password and sessions | Verification, recovery, Google sign-in, and application Zod validation. |
| Frontend | React/Vite shell and account forms | Workshop, reservation, and admin workflows. |
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

This shows the backend's key locations. The React application lives in sibling `frontend/`.

## Local development

Use Node.js 24 and npm. The backend uses ESM and generates its Prisma client inside `src/generated/prisma`.

From the repository root:

```powershell
cd backend
npm ci
npx prisma generate
npm run start:dev
```

The public starter remains at `GET /` on [localhost:3000](http://localhost:3000). Better Auth handles `/api/auth/*`, and authenticated `GET /api/session` returns the current user's public profile. Set `PORT` in the process environment to use a different port and update the URL configuration below accordingly.

### Environment and database

Set `DATABASE_URL` in `backend/.env` to the intended PostgreSQL development connection before starting. Startup checks that it is present; connections are opened lazily when a database operation occurs. Starting the server alone does not verify connectivity or apply migrations.

The existing `backend/prisma7.config.ts` and runtime PrismaService load dotenv and read `DATABASE_URL`. Keep local credentials in the ignored `backend/.env` file.

There is no `.env.example` yet. Migration review, database verification, and seed data are pending; do not run migrations without confirming the target and reviewing the required native constraints.

### Existing commands

Run these from `backend/`:

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Start the backend in watch mode. |
| `npm run build` | Compile the backend. |
| `npm run start:prod` | Run the compiled backend after building. |
| `npm test -- --runInBand` | Run the existing unit tests. |
| `npm run test:e2e -- --runInBand` | Run the HTTP and PostgreSQL integration tests. |

Jest runs with Node's ESM VM-module flag, which may print an experimental-feature notice.

### PostgreSQL integration tests

Set `TEST_DATABASE_URL` in the ignored `backend/.env` to the separate, already migrated test database:

```dotenv
TEST_DATABASE_URL="postgresql://postgres@localhost:5432/reservation_ticketing_system_test?schema=public"
```

Keep `DATABASE_URL` pointed at the development database. The suite requires the exact database name `reservation_ticketing_system_test` and the `public` schema, and rejects a target matching `DATABASE_URL`. Missing configuration fails the tests rather than skipping them. It does not create databases, apply migrations, truncate tables, or reset data.

Run from `backend/`:

```sh
npm run test:e2e -- --runInBand
```

`test/database.e2e-spec.ts` verifies the real NestJS Prisma connection, transaction access, shutdown, native checks, booking uniqueness/rebooking, and restrictive deletion. Constraint tests use PostgreSQL directly because these are database rules; they do not test future booking services, authorization, or capacity locking. Each constraint test creates random fixture identifiers inside a transaction, rolls back afterward, and checks that its test user was removed. The existing HTTP test still overrides Prisma and does not query PostgreSQL.

### Email/password authentication

Run the backend with `npm run start:dev` in `backend/` and Vite with `npm run dev` in `frontend/`. Open [localhost:5173/register](http://localhost:5173/register) or [localhost:5173/login](http://localhost:5173/login). Vite proxies `/api` to the backend; the React client uses that same browser origin and HTTP-only session cookies, without storing tokens in localStorage.

Keep `BETTER_AUTH_SECRET` as a private, high-entropy value of at least 32 characters in `backend/.env`. Development defaults are:

```dotenv
BETTER_AUTH_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:5173"
```

These URLs must be explicit in production. If development ports change, update these URLs and Vite's proxy target together. Use `localhost` consistently. Production requires HTTPS; Better Auth manages secure cookie settings.

Public signup always creates `ATTENDEE` users; supplied roles are rejected. Better Auth's global guard protects NestJS routes unless marked anonymous. `GET /api/session` exposes only the user profile, not the session token. Auth-origin/CSRF checks remain enabled. Other cookie-authenticated POST/PUT/PATCH/DELETE routes require an exact trusted `Origin`, or a trusted `Referer` when Origin is absent; missing/untrusted origins return 403.

`test/auth.e2e-spec.ts` runs actual auth HTTP requests against the explicitly guarded test database. It checks signup, hashed credentials, persistent/revocable sessions, logout, wrong passwords, role injection, origin protection, and application JSON parsing. Its requests commit normally; cleanup removes only the randomly named test user and its auth dependents. It never resets the database or sends verification email.

Manual account-form acceptance: register, confirm the signed-in name, reload and confirm the session remains, sign out, then sign back in. Registration/login are available before email verification in P1-07; verification before booking belongs to P1-08. Recovery and Google sign-in remain later tasks.

### Email delivery

The backend exports `EmailService` through `EmailModule`. Its `send({ to, subject, text })` method uses Resend's HTTPS API and returns `{ id }` after provider acceptance. It uses Node's built-in `fetch`, a 10-second timeout, and sanitized errors. It does not send during startup or retry automatically. Better Auth email callbacks are connected in their later tasks.

Configure these variables in the ignored `backend/.env`:

```dotenv
RESEND_API_KEY="your-private-api-key"
EMAIL_FROM="Workshop App <onboarding@resend.dev>"
EMAIL_TEST_TO="your-resend-account-email@example.com"
```

`EMAIL_TEST_TO` selects the recipient for an explicit manual smoke test; normal messages use the recipient supplied to `send`. The `resend.dev` test sender can only send to the address associated with your Resend account. Public-demo delivery to other recipients requires a verified sender domain. Keep credentials and email contents out of logs and frontend configuration.

`src/email/email.service.spec.ts` mocks HTTP calls and checks successful requests, missing configuration, HTTP rejection, network/timeout errors, and invalid responses. Run `npm test -- --runInBand` from `backend/`; automated tests never send real email. Provider acceptance alone does not establish inbox delivery.

## Documentation

- [PRD](PRD.md): problem, scope, roles, features, and business rules.
- [Architecture](ARCHITECTURE.md): application structure, boundaries, and deployment direction.
- [Database design](DATABASE.md): ER diagram, models, relations, constraints, and history rules.
- [Implementation tasks](TASKS.md): ordered work, decision checkpoints, and completion criteria.
- [Repository instructions](AGENTS.md): working conventions for contributors and coding agents.
