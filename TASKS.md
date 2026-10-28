# Reservation Ticketing System Implementation Plan

> For implementers: read the linked specifications and repository instructions, then work on one task at a time. Creating this tracker does not implement or complete any of the tasks below.

**Goal:** Deliver the public V1 portfolio demo: free in-person workshops, reliable individual reservations, private admin management, and essential emails.

**Architecture:** One NestJS application with feature modules, one React frontend, and PostgreSQL. Business operations use Prisma transactions and event-row locks; booking/event notifications are saved atomically and delivered by a background sender in the same application process.

**Tech stack:** NestJS 11, TypeScript, Prisma 7, PostgreSQL, Better Auth, Zod, React/Vite, React Router, TanStack Query, and native `fetch`.

**Specifications:** [PRD.md](PRD.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [DATABASE.md](DATABASE.md). Follow [AGENTS.md](AGENTS.md).

## How to Use This Tracker

- Checkboxes track verified completion. The existing backend starter, installed packages, and completed design documents do not mean an application feature is complete.
- Keep updates to completion, concise blockers, agreed scope changes, and necessary corrections. Keep approval dates and conversation summaries out of this checklist; selected versions awaiting installation and technical decisions belong in the relevant `ARCHITECTURE.md` section. Installed versions remain in package manifests and lockfiles.
- Check a task only after its deliverable and focused checks pass. If external credentials or a decision are missing, leave it unchecked and record the blocker beneath that task.
- Follow dependencies. A pending decision does not prevent unrelated tasks from progressing.
- For each application feature, settle its route/payload/Zod/error contract before implementing the controller and consuming it in the frontend, as the architecture requires. Record the contract in its schemas/types/tests rather than creating another planning document.
- Use focused checks for the changed feature. Add meaningful regression tests for business rules, security, transactions, and delivery behavior; avoid repeated whole-project test loops for small edits.
- Scope a change to one task. Update this tracker as work finishes; a later task must not silently be included in the same change.

## Global Constraints

- One organization; free in-person workshops; one confirmed place per account/event.
- Admins have attendee capabilities, and their personal bookings follow the same rules.
- Keep NestJS 11 and Prisma 7. Preserve already approved technology choices; review concrete dependency/version additions or schema/migration changes and obtain approval where the current task/session has not already authorized them.
- Use controller -> service -> Prisma. Business logic and transaction ownership belong in services; validate application inputs with Zod and return errors through exception filters.
- Expose application APIs under `/api` and Better Auth under `/api/auth/*`; enforce authorization on the backend.
- Automatic linking requires matching verified emails on both identities. Public/provider input cannot grant admin access.
- Store UTC instants; interpret input/date filters and display times in `Asia/Jakarta` (WIB). Interface and emails use English.
- Self-service cancellation requires more than 24 hours before start, except affected bookings can cancel before a revised start. Significant schedule/venue changes close at start; event cancellation closes at scheduled end.
- Admin cancellations and significant changes require reasons. Keep cancellation/rebooking history and significant event revisions.
- Queue booking/event notifications only. Better Auth verification/recovery emails go directly through the provider and use resend/recovery flows.
- Target one Railway app serving React, the API, and the sender, with application sleeping disabled. Agree on the actual plans and spending limit before deployment.
- Payments, waitlists, group bookings, ticket tiers, seating, online events, admission scanning, a history dashboard, and automatic no-show penalties remain outside V1.
- No extra Docker, CI, execution frameworks, infrastructure, or documentation files are included by this plan.

## Implementation Areas

The backend starter is already under `backend/`; P1-02 still tracks the remaining layout checks. Other locations are targets; create files only as the owning task needs them.

| Area | Target location / responsibility |
| --- | --- |
| Backend application | `backend/src/`; existing NestJS application and configuration move under `backend/`. |
| Authentication | `backend/src/auth/`; Better Auth integration, session access, verification/role guards. |
| Events | `backend/src/events/`; publishing, discovery, capacity/deadlines, changes, cancellation. |
| Reservations | `backend/src/reservations/`; booking, ownership, personal/admin cancellation, history. |
| Email delivery | `backend/src/email/`; shared provider delivery function for authentication and business messages. |
| Notifications | `backend/src/notifications/`; transactional enqueueing, sender, failed-email operations. |
| Prisma | `backend/prisma/` and a shared client provider under `backend/src/prisma/`; approved models, migrations, and connection lifecycle. |
| Backend verification | Existing Jest unit/service tests near their feature and Supertest/PostgreSQL integration tests under `backend/test/`. |
| Frontend | `frontend/src/`; application/router/auth/API setup and feature-local event, reservation, and admin components. |
| Project documents | Keep the existing Markdown documents at repository root; update commands in the existing README/instructions when the layout actually changes. |

## Decision Checkpoints

| Checkpoint | Owning task | Must be settled before |
| --- | --- | --- |
| D1: Compatible runtime and package versions, Better Auth integration/generation configuration, required additions and existing approvals | P1-01 | Installing new packages or generating the authentication schema. |
| D2: Intended development and isolated PostgreSQL test connections | P1-04 | Applying migrations or running database checks. Do not assume an environment URL is safe to reset. |
| D3: Transactional email provider, sender/domain requirements, contact address, credentials, and costs | P1-06 | Verification/recovery email implementation. |
| D4: Retry-cycle limit, retry delays, provider timeout, claim duration, worker polling interval, and provider idempotency/error behavior | P3-05 | Background sender and manual retry implementation. |
| D5: Railway app/database plans, region/configuration, actual monthly spending limit, and public base URL | P3-09 | Public deployment and production configuration. |

Google client credentials and allowed callback URLs are an external prerequisite for P1-10. Review the concrete setup with the user when that task begins; never invent credentials or expose secrets in output.

## Review Focus

- A request waits for a database lock across a deadline: evaluate the current instant after acquiring the lock, not the transaction-start time. Covered in P2-02 and P3-01.
- An attendee manipulates a reservation ID, role field, or raw admin request: ownership and server-controlled permissions must still hold. Covered in P1-11, P2-03, and P3-02.
- A workshop is changed twice or restored to its original schedule: preserve revisions and distinguish affected bookings from later rebookings. Covered in P3-01 and P3-03.
- A worker dies or a manual retry overlaps recovery: stale claims cannot overwrite newer results or repeat a booking operation. Covered in P3-06 and P3-07.
- A reviewer opens a nested page directly or requests an unknown API path: SPA navigation works, while `/api` retains JSON errors and auth/business request parsing still works. Covered in P1-07, P1-12, P3-10, and P3-11.

## Phase 1 — Accounts and Event Publishing

### P1-01 — Confirm compatible dependencies and runtime

**Depends on:** None. **Area:** Backend/frontend manifests, existing TypeScript configuration, Better Auth integration choices.

- [x] Resolve D1 using current primary documentation and the installed package/lockfile state. Select compatible versions for the already chosen libraries, including the NestJS Better Auth integration and later static serving; retain NestJS 11 and Prisma 7.
- [x] Present any concrete additions or changes not already authorized. Record selected package/runtime choices and Better Auth configuration in the relevant `ARCHITECTURE.md` section before dependent installation/generation work.

**Done when:** Required versions, runtime/module compatibility, and approvals are recorded; no major upgrade or additional framework is assumed.

Selected setup: [Runtime and Dependency Choices](ARCHITECTURE.md#runtime-and-dependency-choices).

### P1-02 — Move the existing backend into its target folder

**Depends on:** None. **Area:** Existing `src/`, `test/`, Prisma/configuration, manifests, ignore rules, and existing command documentation.

- [X] Move the existing backend into `backend/`, preserving source, tests, lockfile, ignored configuration, and intended database connection. Make the moved Prisma configuration discoverable; update relative schema/client/migration paths and ignore rules.
- [X] Update the existing README and applicable command/path instructions. Check that the moved starter builds and its existing tests still pass from the new directory.

**Done when:** NestJS and Prisma paths resolve from `backend/`; secrets remain ignored; no business models or features are claimed complete.

### P1-03 — Establish the React application and navigation

**Depends on:** P1-01, P1-02. **Area:** `frontend/` Vite/React setup, application router, query client, and API request functions.

- [X] Add the approved React/TypeScript/Vite application with React Router, TanStack Query, and native `fetch`. Configure a local `/api` proxy to NestJS; frontend environment values contain only public configuration.
- [X] Establish the public/attendee/admin route structure and shared loading/error presentation needed by the actual feature pages. Verify development startup and a production frontend build.

**Done when:** The frontend runs beside NestJS and requests `/api` through its own development origin; feature pages and authentication are still pending their tasks.

### P1-04 — Implement the approved database models and constraints

**Depends on:** P1-01, P1-02; D2 for applying/checking migrations. **Area:** Prisma schema, generated authentication models, migrations, and isolated database verification.

- [X] Confirm D2 without printing connection secrets. Prepare and review the eight models, enums, timestamp/identifier types, foreign keys, and indexes from `DATABASE.md`, including the chosen Better Auth-generated schema.
- [X] Include native SQL checks and the confirmed-reservation partial unique index in reviewed migrations, with schema comments identifying native constraints. Apply only to the intended authorized database.
- [X] Check clean migration application and inspect the applied types, foreign keys, indexes, and native checks on the isolated database. Execute the constraint regression cases in P1-05 once its test setup is ready.

**Done when:** A clean database built from migrations has all eight models and native constraints. No preview-feature switch or unreviewed schema deviation is introduced.

### P1-05 — Connect Prisma and establish safe database checks

**Depends on:** P1-04. **Area:** Shared Prisma provider/module and existing Jest/Supertest integration configuration.

- [X] Reuse one Prisma client with the PostgreSQL adapter and application lifecycle handling; use the same intended connection configuration for runtime and CLI work.
- [X] Configure isolated PostgreSQL integration checks with explicit test connection selection. Refuse destructive test setup against the development/production target. Verify a real database operation and clean application shutdown.
- [X] Against that test database, verify a second confirmed booking fails, multiple cancelled rows plus a rebooking succeed, null required cancellation reasons fail, invalid delivery metadata fails, and referenced history cannot cascade away.

**Done when:** Feature services can use Prisma and its transaction client; database checks use PostgreSQL without Docker or an in-memory substitute being added implicitly.

`backend/test/database.e2e-spec.ts` checks explicit test-target selection, real Prisma transaction access/shutdown, all 15 native checks, booking uniqueness/rebooking, and restrictive business-history deletion. Run `npm --prefix backend run test:e2e -- --runInBand` with `TEST_DATABASE_URL` pointing at the migrated test database. Fixtures roll back after each test; the suite does not reset or migrate databases.

### P1-06 — Select and connect the email provider

**Depends on:** P1-01, P1-02. **Area:** Notification provider delivery function and backend-only configuration.

- [ ] Resolve D3: select the provider, confirm public-demo sending/domain restrictions and budget, and obtain sender/contact configuration through the user where required.
- [X] Implement one provider delivery function reusable by Better Auth callbacks and the later business sender. Keep credentials and sensitive links out of logs and the frontend; expose sanitized provider outcomes internally.

**Done when:** An authorized test message reaches the controlled test recipient, or a concrete external prerequisite is recorded and this task remains unchecked. No persistent authentication-email queue is created.

D3 remains open for public-demo sender-domain readiness, budget, and organizer contact configuration. Delivery configuration and provider choices are recorded in `ARCHITECTURE.md`.

### P1-07 — Add email/password access and database sessions

**Depends on:** P1-03, P1-05. **Area:** Authentication configuration/integration and registration/login/logout pages.

- [X] Configure Better Auth and its React client for registration, login, logout, and database-backed cookie sessions under `/api/auth/*`. Register attendee roles as server-owned fields from the first signup implementation.
- [X] Provide the account forms/session-aware navigation and backend session access. Retain origin protections and define application mutation CSRF checks; configure development base/callback origins.
- [X] Verify `register_as_attendee`, `login_restores_database_session`, `logout_ends_session`, and rejection of role injection. Check that auth-handler body parsing does not break later application JSON routes.

**Done when:** Email/password users can enter and leave a session through the real UI/API. Verification eligibility is completed in P1-08, not silently bypassed for later booking.

Implementation and 12 PostgreSQL-backed auth HTTP checks pass.

### P1-08 — Verify email before booking

**Depends on:** P1-06, P1-07. **Area:** Better Auth verification callbacks, verification/resend screen, and backend verified-email guard.

- [ ] Send verification links directly through the provider; handle successful, invalid/expired, and resend flows using Better Auth. Permit anonymous browsing and enforce verification at the booking boundary.
- [X] Verify `unverified_user_cannot_book`, `verified_user_is_eligible`, and invalid/expired-link behavior without storing links in `EmailJob`. Keep the controlled credential/database test setup independent of real outbound email.

**Done when:** A fresh email/password attendee can verify and become booking-eligible; resend behavior and errors are understandable.

Pending: attach the exported verification guard to reservation creation when the real booking endpoint is implemented. Its test-only route checks pass.

### P1-09 — Add password recovery

**Depends on:** P1-06, P1-07. **Area:** Better Auth recovery callbacks and request/reset-password pages.

- [X] Implement the direct-provider recovery flow with Better Auth-owned token validation and safe user-facing responses; preserve its supported session-revocation behavior.
- [X] Verify a valid reset, expired/invalid links, and that an old password no longer signs in after a successful reset. Confirm recovery secrets do not enter business jobs or logs.

**Done when:** A credential user can recover access through the UI and controlled email flow.

### P1-10 — Add Google sign-in and verified account linking

**Depends on:** P1-07, P1-08; valid Google client configuration. **Area:** Better Auth Google configuration and sign-in UI.

- [X] Configure the approved Google provider and callback URLs; support a new Google attendee without an extra verification email when Google supplies a trusted verified address.
- [X] Enforce automatic linking only for the same verified email on both identities. Preserve the existing user/role/history, and keep unverified/different-email cases out of automatic linking.
- [X] Verify `verified_google_links_existing_user` and `unverified_identity_is_not_implicitly_linked`. At P2-03, extend the identity check to existing reservation history. Manually check a real controlled Google callback before marking this complete.

**Done when:** Both sign-in methods reach the same eligible identity where the policy permits, and Google cannot grant an admin role.

Reservation-history checks remain scheduled for P2-03.

### P1-11 — Protect admin operations and provision private access

**Depends on:** P1-07, P1-08. **Area:** Role guards, protected admin routes, private admin provisioning, and frontend admin navigation.

- [X] Provision the authorized private admin through a controlled setup path, with no public promotion endpoint or exposed admin credentials. Enforce current server-side admin permission and attendee ownership checks as applicable.
- [X] Verify anonymous and attendee rejection on admin operations, role/profile injection rejection, and admin access. Preserve admin eligibility for the ordinary attendee flow without granting booking-rule bypasses.

**Done when:** Hiding/showing navigation reflects permissions, and direct HTTP calls still enforce them. Reuse this access setup for the later demo seed.

### P1-12 — Create, edit, and publish workshops

**Depends on:** P1-03, P1-05, P1-11. **Area:** Events controller/service/Zod schemas, application exception filter, and admin workshop forms.

- [X] Define the event-management API contract and implement complete required drafts, ordinary edits, publication, capacity, deadlines, fixed WIB input, and shared organizer contact display. Add the small Zod pipe and safe application error handling with these real endpoints.
- [X] Apply the event-lock protocol from the first capacity/deadline implementation. Significant draft schedule/venue edits require a reason and immutable before/after revision history. Reject significant published-event edits until P3-03 implements their complete mutation/history/notification operation; ordinary published edits remain available within their rules.
- [X] Verify invalid fields/unknown server-owned input, start/end/deadline checks, admin-only access, capacity below seeded confirmed counts, nonblank reasons, revision consistency, and ordinary JSON parsing alongside Better Auth.

**Done when:** An admin can publish a valid workshop through the UI, and application errors are useful without exposing ORM errors or secrets.

### P1-13 — Browse and find published workshops

**Depends on:** P1-03, P1-12. **Area:** Public event list/detail API and React pages.

- [X] Implement upcoming published events, title search, WIB date filtering in URL parameters, and event details with schedule, venue/address, availability, deadlines, policy, and contact email.
- [X] Handle available/full/registration-closed/cancelled conditions and loading/empty/error states. Protect drafts from anonymous discovery; keep cancelled details clear to an attendee following an existing event link.
- [ ] Verify title filtering, WIB day boundaries from a differently configured browser timezone, draft visibility, and availability/deadline labels using controlled records.

Manual browser verification is pending because browser automation is unavailable.

**Done when:** A visitor can find and understand a workshop without signing in. The API remains authoritative for subsequent booking.

**Phase 1 outcome:** Working account flows, private event publishing, and public discovery. Reservations, cancellation operations, and business-email delivery remain pending until their tasks finish.

## Phase 2 — Reliable Reservations

### P2-01 — Enqueue business notifications transactionally

**Depends on:** P1-05. **Area:** Notification service enqueue operations and shared transaction-client use.

- [ ] Implement the typed enqueue operation consumed by business services: caller-owned Prisma transaction plus notification type, reservation ID, and optional event-change ID. Capture recipient email and derive the unique logical deduplication key.
- [ ] Validate change/event pairing and type-specific relationships, initialize a pending job, and avoid provider calls. Verify `business_rollback_removes_pending_job`, `duplicate_action_does_not_duplicate_job`, and `mismatched_event_change_is_rejected`.

**Done when:** Business services can save jobs using their own transaction client. No independent nested transaction or unpersisted background send replaces this operation.

### P2-02 — Reserve one place safely

**Depends on:** P1-08, P1-12, P1-13, P2-01. **Area:** Reservation controller/service/Zod contract and event-page booking/confirmation UI.

- [ ] Implement booking with session identity, verified email, event row lock at `READ COMMITTED`, current time after lock acquisition, current eligibility/count checks, a cryptographically random unique reference, and recorded event revision.
- [ ] Save the reservation and `BOOKING_CONFIRMED` job atomically; the UI shows the successful reference or a useful conflict and refreshes affected queries. Handle a reference collision by safely retrying the rolled-back creation.
- [ ] Verify `two_requests_for_last_place_create_one_booking`, `duplicate_requests_create_one_confirmed_booking`, `deadline_crossed_while_waiting_rejects_booking`, and rejection of unpublished/cancelled/started/full/closed events. Confirm no orphan job survives a failed booking and admin personal bookings obey the same rules.

**Done when:** The complete booking action is capacity-safe from its first implementation, with a durable pending notification. Actual background delivery is P3-06.

### P2-03 — Show personal reservations and history

**Depends on:** P2-02. **Area:** Owned reservation reads, My reservations, and booking details.

- [ ] Expose only the signed-in user's current/past reservations, preserving cancelled entries, references, current event information, cancellation deadlines, and shared late-cancellation contact instructions.
- [ ] Verify `another_attendees_id_does_not_reveal_booking`, history visibility, empty/error states, and refresh after booking. Complete the linked-Google identity check from P1-10 against real existing reservations when its credentials are available.

**Done when:** An attendee can return to their booking through either permitted linked sign-in method, and references do not substitute for authorization.

**Phase 2 outcome:** An eligible attendee can browse, reserve, receive an on-screen reference, and find their own history. Correctness does not depend on displayed availability or a future hardening task.

## Phase 3 — Organizer Operations and Demo Readiness

### P3-01 — Self-service cancellation and rebooking

**Depends on:** P2-03. **Area:** Reservation cancellation operation and attendee controls.

- [ ] Cancel an owned confirmed reservation under the event lock, enforce the more-than-24-hours rule or affected-revision exception, retain actor/time/source, and enqueue its cancellation notice atomically.
- [ ] Allow a later eligible booking through the existing booking operation, creating a new reference/row at the latest revision. Show contact instructions when self-service cancellation is closed.
- [ ] Verify just before, exactly at, and just after the 24-hour cutoff; a lock wait crossing the cutoff; revised-start boundaries; and `cancel_rebook_cancel_preserves_all_history`. Repeated cancellation must not release twice or enqueue another logical notice.

**Done when:** Places are released correctly and only reopened to new bookings while registration is still open. Rebooking does not inherit an earlier booking's change exception.

### P3-02 — Let admins handle individual cancellations

**Depends on:** P1-11, P3-01. **Area:** Admin attendee list, protected reservation cancellation operation, and reason form.

- [ ] Provide the event's attendee/confirmed-reservation list and an explicit admin cancellation flow, including late requests. Require a nonblank reason and record the real admin, source, and time.
- [ ] Verify ordinary attendees cannot call the operation, the required reason cannot be omitted, the locked transition and job commit together, and prior cancelled records remain unchanged. Keep the admin's personal cancellation UI on ordinary attendee rules.

**Done when:** An organizer can handle a contact request without rewriting booking history or using a public management credential.

### P3-03 — Reschedule or change a venue with attendee notice

**Depends on:** P1-12, P2-01, P3-01. **Area:** Published-event change operation and admin edit/reason UI.

- [ ] Reuse significant-change history under the event lock: require a reason, capture old/new values, increment the revision once, retain existing bookings, validate the revised schedule/deadline, and enqueue one `EVENT_CHANGED` job per confirmed reservation.
- [ ] Reject significant changes at or after the current start; leave ordinary description/capacity/deadline changes outside revision advancement. Explain updated details and cancellation eligibility on attendee pages.
- [ ] Verify before/at/after start, combined/no-op edits, booking/change concurrency, two consecutive changes, restoration of the original schedule, and that bookings/rebookings after a change do not inherit the earlier exception.

**Done when:** Affected attendees are distinguishable from later bookings, with coherent history and pending notices committed together.

### P3-04 — Cancel an entire workshop

**Depends on:** P3-02, P3-03. **Area:** Event cancellation service/controller and admin confirmation/reason UI.

- [ ] Permit cancellation before scheduled end, including during the session. Lock the event, require a reason, preserve its schedule, record cancellation metadata, cancel remaining confirmed reservations, and enqueue their `EVENT_CANCELLED` notices in one transaction.
- [ ] Verify cancellation before/during the session, rejection exactly at/after end, competing booking/cancellation requests, rollback, preserved earlier cancellations, and repeat-action deduplication. Refresh public and attendee views so cancellation is explicit.

**Done when:** No new reservations can succeed after cancellation, and all affected booking history and notices agree with the event state.

### P3-05 — Set the delivery/retry policy

**Depends on:** P1-06. **Area:** Existing notification design/configuration and provider-specific behavior.

- [ ] Resolve D4 with concrete numeric values for attempts, delays, polling, request timeout, and claim expiry; define permanent versus retryable failures and the selected provider's idempotency window/limitations.
- [ ] Record the approved values in existing architecture/runtime configuration and use them as exact inputs to the sender checks. Ensure claims outlive bounded provider attempts and no promise of exactly-once/inbox delivery is introduced.

**Done when:** P3-06 has no invented operational defaults. This decision does not add another settings entity or UI.

### P3-06 — Deliver queued business emails in the background

**Depends on:** P1-06, P2-01, P3-04, P3-05. **Area:** Background sender, claim/recovery operations, and the four English business-email templates.

- [ ] Claim eligible jobs with PostgreSQL row locking/`SKIP LOCKED`, release the claim transaction before network calls, check obsolescence, count attempts, send through the existing provider function, and condition updates on claim ownership.
- [ ] Implement bounded retries, expired-claim recovery including final-attempt interruption, stable provider idempotency identity where supported, and clean sender lifecycle within NestJS. Never rerun the business operation during delivery.
- [ ] Implement `SKIPPED` decisions for cancelled confirmations and superseded changes. Preserve cancellation notices for their original reference after rebooking; use current details in still-valid confirmations. Authentication emails remain outside this queue.
- [ ] Verify success, transient/permanent errors, ambiguous timeout, restart recovery, competing claims, stale-owner rejection, exhausted attempts, and all skip cases. Confirm provider acceptance is represented as sent without claiming inbox delivery; redact sensitive errors.

**Done when:** Pending jobs survive interruption and are sent, retried, failed, or skipped according to the approved policy, with no provider request inside the business transaction.

### P3-07 — Inspect and manually retry failed messages

**Depends on:** P1-03, P1-11, P3-06. **Area:** Protected notification endpoints and admin failed-email list.

- [ ] Show useful failed-message metadata, latest sanitized error, and attempt information. Permit manual retry only from `FAILED`, retaining job/deduplication identity and total attempts while resetting the retry-cycle count and recording the admin/time.
- [ ] Reuse normal claiming/obsolescence rules. Verify permissions, a manual retry racing recovery/another retry, stale-owner protection, and rejection of retries for sent/skipped messages. No credentials or authentication links appear in responses.

**Done when:** An admin can diagnose/retry a failed notification without repeating its reservation/event action or treating a skipped message as a failure.

### P3-08 — Prepare sample events and reviewer access

**Depends on:** P1-10, P3-04, P3-07. **Area:** Existing seed/provisioning setup, sample content, and demo instructions.

- [ ] Add controlled sample workshops and a preverified attendee account; retain private admin provisioning. Make setup repeatable without deleting live reservations or silently resetting an existing user's credentials.
- [ ] Verify the sample attendee can demonstrate booking/history and cannot manage events. Document public attendee access and private admin demonstration separately in the existing README; keep admin secrets outside source and frontend bundles.

**Done when:** A reviewer can try the attendee journey quickly and the owner can demonstrate management with a separate private login.

### P3-09 — Confirm the deployment configuration and budget

**Depends on:** P3-06. **Area:** Railway app/database and email-provider configuration decisions.

- [ ] Resolve D5 with the user: actual app/database services and region, usage expectations/spending limit, stable public URL, HTTPS, sender/contact configuration, and Google/Better Auth callbacks.
- [ ] Keep the app running for idle-time email processing by disabling optional sleeping. Confirm development/test data and secrets are separate from the deployment target; record the chosen values in existing deployment instructions without exposing secrets.

**Done when:** Release preparation has explicit targets and cost limits. A small paid budget does not imply an unlimited budget or a guaranteed monthly total.

### P3-10 — Prepare the single-deployment release

**Depends on:** P3-08, P3-09. **Area:** Existing build/start configuration, NestJS static serving, and README deployment commands.

- [ ] Build the React app and NestJS backend into a runnable release. Serve browser routes through the React entry point while `/api`, including unknown API paths, retains API responses. Include the in-process sender and compatible static-serving integration.
- [ ] Prepare environment settings and the reviewed production migration procedure for the selected database. Check migrations/constraints on an isolated clean database before proposing application to the production target.
- [ ] Verify the release build/start, a direct nested browser URL, `/api` JSON parsing/404 behavior, auth callback routing, and sender startup/recovery. Keep secrets out of build artifacts and instructions.

**Done when:** A concrete runnable release and target-specific commands are reviewable. No Docker/CI or unrelated infrastructure is needed to complete this task.

### P3-11 — Deploy and complete the V1 acceptance check

**Depends on:** P3-10 and completion of the earlier feature tasks. **Area:** Approved public deployment and existing README/task status.

- [ ] With deployment authorized in the active execution task/session, apply the reviewed migration/setup to the confirmed target and deploy the prepared release. Configure HTTPS, secure cookies, trusted origins/callbacks, and the selected running/cost settings.
- [ ] Perform one complete controlled attendee journey and private admin journey, including verification/recovery/Google access, booking/history, cancellations/rebooking, rescheduling, and essential emails. Check direct page navigation, unauthorized management requests, and failed-email retry.
- [ ] Collect passing checks/builds for this exact release from the owning tasks and run any outstanding acceptance checks. Rerun affected checks after fixes or source/configuration changes, rather than repeating passing checks for an unchanged release. Confirm PostgreSQL concurrency/native-constraint checks and restart recovery have passed.
- [ ] Finish the existing README with setup/start/test/build commands, required environment variable names, sample attendee access, and deployment limitations. Mark tasks complete only where their actual checks/external flows were verified.

**Done when:** The public demo meets the PRD's attendee/admin acceptance criteria, retains the agreed scope, and has reproducible setup instructions.

## Working Commands After the Folder Move

Run only the commands relevant to the active task, with its intended environment loaded. Backend commands apply to the existing `backend/` directory. Frontend commands become available after P1-03 establishes `frontend/`.

| Purpose | Command |
| --- | --- |
| Backend development | `npm --prefix backend run start:dev` |
| Frontend development | `npm --prefix frontend run dev` |
| Backend unit/service checks | `npm --prefix backend run test -- --runInBand` |
| Focused backend check | Append `--testNamePattern` or `--runTestsByPath` for the active feature to the backend Jest command. |
| Backend API/PostgreSQL checks | `npm --prefix backend run test:e2e -- --runInBand`, with the explicitly selected isolated test database. |
| Backend build | `npm --prefix backend run build` |
| Frontend build | `npm --prefix frontend run build` |
| Migration execution | Use the installed Prisma 7 CLI from `backend/` with its reviewed/discoverable configuration, confirmed target, and task authorization. |

The starter's `lint` script uses `--fix`; it rewrites files. Use the task-appropriate lint invocation deliberately and review any resulting changes. Do not run migration/reset commands merely to check documentation or because an environment URL is available.

## Current Progress

P1-01 is complete. P1-02 remains unchecked: the backend folder exists and its build and Prisma config discovery passed, but the remaining preservation, ignore-rule, documentation, and starter-test checks are pending. P1-03 through P3-11 remain pending.
