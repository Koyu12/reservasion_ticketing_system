# Product Requirements Document

## 1. Overview

The Reservation Ticketing System is a web application for one organization to publish free, in-person workshops and seminars with limited capacity. Attendees discover events, reserve a place, and manage their reservations. Admins manage events, capacity, registration deadlines, and attendee lists.

The first version is a public portfolio demo using sample events. It should demonstrate a complete attendee journey and private admin workflows, supported by reliable reservation rules.

### Problem

Attendees need a clear way to discover relevant workshops, understand availability, and know whether they have a confirmed place. They also need to learn about changes that affect their attendance.

Organizers need an accurate registration list, control over limited capacity and registration deadlines, and a consistent process for cancellations and event changes.

The central product promise is that every confirmed reservation has capacity behind it.

## 2. Goals and Success Criteria

| Goal | Success criteria |
| --- | --- |
| Make workshop discovery and registration straightforward | A visitor can find an upcoming workshop, view its details, sign in, reserve a place, and find the confirmation in My reservations. |
| Keep reservations reliable | Confirmed reservations never exceed capacity, including when attendees attempt to book the last place simultaneously. One account cannot hold duplicate active reservations for the same event. |
| Give organizers useful controls | An admin can publish a workshop, manage its capacity and deadline, view registrations, and handle cancellations or significant changes. |
| Make booking conditions and changes clear | Attendees can see registration and cancellation deadlines, current reservation details, and receive essential emails. |
| Deliver a demonstrable portfolio project | The hosted demo supports the attendee journey with sample events and a preverified sample attendee account. Admin access remains private. |

## 3. Non-goals for V1

- Paid tickets, checkout payments, refunds, and financial reporting.
- Multiple independent organizers or an organizer marketplace.
- Group bookings, multiple ticket categories, and assigned seats.
- Waitlists and automatic allocation of cancelled places.
- Online workshops.
- QR tickets, ticket scanning, and admission check-in.
- Automated penalties or account restrictions for late cancellation or non-attendance.
- A separate notification inbox or scheduled reminder campaigns.

Waitlists may be considered after V1. Their priority, offers, expiry, and allocation rules must be discussed before implementation.

## 4. Users and Roles

| Role | Capabilities |
| --- | --- |
| Visitor | Browse upcoming workshops, search by title, filter by date, and view event details without signing in. |
| Attendee | Sign in, reserve a place, view current and past reservations, and cancel according to the event's policy. |
| Admin | All attendee capabilities plus creating, editing, publishing, rescheduling, and cancelling workshops; managing capacity and deadlines; viewing attendee lists; handling reservation cancellations. |

Public registration creates attendee accounts. A sign-in method does not grant admin permissions. Admin access is controlled privately; the public demo does not expose an editable admin account.

Admins may book personally using the same account and attendee flow. Their personal bookings follow the same verification, capacity, duplicate-booking, deadline, and self-service cancellation rules. Management actions use separate protected operations and record the acting admin.

## 5. Core Features

### 5.1 Accounts and Authentication

- Support email/password registration and login, Google sign-in, logout, and password recovery.
- Require email/password attendees to verify their email before making a reservation. Browsing does not require an account.
- Accept a trusted, verified email supplied by Google without sending another verification email.
- Provide a verification screen and a way to resend the verification email.
- Provide a preverified sample attendee account so portfolio reviewers can try the booking journey quickly.
- Use Better Auth as the selected authentication direction. Review its required dependencies and data models before implementation.

Automatically link Google sign-in to an existing account only when both identities have the same verified email. Preserve the existing attendee identity, reservations, and permissions. Unverified or different-email identities do not qualify for automatic linking.

### 5.2 Workshop Discovery

- Display upcoming published workshops.
- Support title search and date filtering.
- Provide an event detail page with the title, description, start and end times, physical venue and address, availability, registration deadline, and cancellation policy.
- Clearly distinguish available events, fully booked events, closed registration, and cancelled events.
- Event Cover Images
  - Events may have an optional cover image uploaded by an admin.
  - Display the event cover on discovery cards and the event detail page.
  - If no cover image is provided, display a consistent branded fallback image.
  - Missing cover images must not prevent event creation or publication.
  ### Event Sharing
  - Allow visitors and attendees to share the public event URL from Event Details.
  - Provide a secondary Share Event action on the Booking Success page.
  - Use native device/browser sharing when available, with Copy Link as a fallback.
  - Shared links must never expose private reservation details or booking references.
  ### Event-Specific Link Preview
  - Public event links should provide event-specific preview metadata, including title, description, URL, and image.
  - Use the uploaded event cover for the preview image when available.
  - Otherwise, use a shared branded fallback image.
  - Preview metadata must be accessible to supported social link crawlers.
  ### Venue &amp; Location
  - Display the venue name and full physical address.
  - Support an optional embedded Google Maps preview.
  - Provide an Open in Google Maps link.
  - The address and external Maps link must remain usable when the embedded map is missing or unavailable.
  ### Remaining Capacity Indicator
  - Display the number of remaining spots on Event Details only when capacity is low.
  - Show "Only X spots left" when the remaining count is greater than zero, no more than 5, and no more than 20% of total capacity.
  - Do not show scarcity messaging for attendees with an active reservation or when the event is fully booked, registration is closed, or the event is cancelled.
  - Displayed availability is informational and does not guarantee a reservation.

### 5.3 Reservations

- Allow an eligible signed-in attendee to reserve one place in an event while registration is open and capacity remains.
- Immediately confirm a successful free reservation and provide a unique booking reference.
- Provide My reservations with reservation status and current event details.
- Clearly explain unsuccessful attempts, such as an event becoming full, registration closing, an unverified email, or an existing active reservation.
- Apply capacity and duplicate checks when accepting the reservation; displayed availability alone is not sufficient.
- Allow self-service rebooking after cancellation while registration is open and capacity remains. Give the new reservation a new booking reference and retain the earlier cancellation in history.

### 5.4 Admin Event and Reservation Management

- Create and edit workshop details and publish events for public discovery.
- Set event capacity and an event-specific registration deadline.
- View the attendee list and confirmed reservation count for each event.
- Update descriptions and adjust capacity within the business rules.
- Change the date or venue while retaining existing bookings and notifying affected attendees.
- Cancel an event and notify its attendees.
- Cancel an attendee's reservation when handling a request directly, including requests within the self-service cutoff.
- Require an admin reason for reservation/event cancellation and significant schedule/venue changes. Retain the admin, time, and previous/new details for significant changes; a separate history dashboard is outside V1.
- Allow schedule and venue changes only before the workshop starts. Allow event cancellation before the scheduled end, including during the session, preserving the original schedule and recording the actual cancellation time.
- Event Media &amp; Location
  - Allow admins to upload, replace, or remove an optional event cover image.
  - Validate uploaded images before storing them.
  - Allow admins to enter or update an optional Google Maps embed URL for the event venue.
  - Accept only validated, approved Google Maps embed URLs, not arbitrary iframe HTML.
  - Events remain valid without a cover image or embedded map.

### 5.5 Essential Communication

- Send emails for booking confirmation, reservation cancellation, event cancellation, and significant date or venue changes.
- Send the authentication emails required for verification and password recovery.
- Keep current event and reservation information available on the website.
- Display the cancellation deadline and organizer contact information so attendees know how to request a late cancellation.
- Persist pending booking and event notifications with their business changes, then deliver them in the background with bounded automatic retries.
- Provide a private admin failed-email list and a manual retry action. Retrying a message must not repeat its booking or event operation.
- Skip queued notifications already made obsolete by cancellation or a later event change, recording the skip reason. Skipped messages are not delivery failures. Still-valid confirmations use current event details, and cancellation notices remain tied to their original booking reference.
- Send verification and password-reset emails through Better Auth callbacks and the selected provider, using resend/recovery flows for failures. Authentication links are not stored in the booking/event email queue.
- Use one organization-wide contact email from application configuration for questions and late cancellations; each admin retains an individual login.
- Use English for the interface and essential emails. Display event times and deadlines explicitly as WIB (`Asia/Jakarta`), with timestamps stored in UTC. V1 has no timezone settings screen.

Email provider selection and precise delivery/retry settings remain implementation decisions. Provider acceptance does not guarantee inbox delivery, and an email failure does not invalidate a confirmed booking. Messages already being sent cannot reliably be recalled. The technical boundaries are described in [ARCHITECTURE.md](ARCHITECTURE.md), with data definitions in [DATABASE.md](DATABASE.md).

## 6. Business Rules

### Capacity and Booking

- Each workshop has one capacity pool and one ticket category.
- Stored event states are draft, published, and cancelled; full, closed, and ended conditions are calculated. Reservations are confirmed or cancelled, with cancelled history preserved.
- Confirmed reservations must never exceed the event's capacity, including under simultaneous booking requests.
- An account may hold at most one active reservation per event. This is an individual-enrollment rule, not proof that each account represents a unique person.
- Cancelled reservations remain in history. A later eligible rebooking creates a new reservation and reference.
- Capacity may increase or decrease, but it must not fall below the number of confirmed reservations.
- New reservations close at the admin-defined registration deadline. Full, cancelled, or started events cannot accept new reservations.

### Attendee Cancellation

- Attendees may cancel through the website more than 24 hours before the event starts.
- At or within 24 hours before the start, attendees contact the organizer and an admin handles the cancellation.
- Show the policy before booking and the actual cancellation deadline in reservation details.
- A cancelled reservation releases its place. That place is available for new reservations only if registration remains open.
- The cancellation deadline and registration deadline are separate rules.
- A cancellation cutoff helps organizers manage changes; it does not guarantee attendance or eliminate no-shows.

### Significant Event Changes

- Changing the date or venue does not require cancelling and recreating the event.
- Significant changes to schedule or venue close when the workshop starts and require a recorded admin reason and before/after history.
- Existing bookings remain attached to the event, and affected attendees must be notified.
- Affected attendees may cancel before the revised event start time, overriding the ordinary 24-hour self-service cutoff.
- Record the event revision at booking to distinguish affected attendees from those who book or rebook after a change.
- Cancelling an event stops new reservations and makes the cancellation clear to existing attendees.
- Event cancellation is permitted before the scheduled end, requires an admin reason, and cancels the remaining confirmed reservations while retaining their history. Cancellation at or after the end is locked.

## 7. High-level Technical Direction

- Frontend: React and TypeScript with Vite.
- Backend: NestJS and TypeScript.
- Database access: Prisma with PostgreSQL.
- Authentication: Better Auth, supporting email/password and Google sign-in.
- Application request validation: Zod schemas.
- Feature organization: controller -> service -> Prisma, with business logic in services.

This document defines product behavior. [ARCHITECTURE.md](ARCHITECTURE.md) records the agreed sibling backend/frontend layout, React Router and TanStack Query, same-origin application deployment, and Railway deployment direction. [DATABASE.md](DATABASE.md) defines the approved models, fields, relationships, and constraints; implementing them in Prisma remains separate work. API payloads, dependency versions, hosting plans, and spending limits remain implementation decisions. A modest paid running budget is acceptable for the public demo.

Supporting documents will be created separately:

- `ARCHITECTURE.md`: application boundaries, module responsibilities, integrations, and request flow.
- `DATABASE.md`: entities, relationships, constraints, history, and data-model rationale. `prisma/schema.prisma` remains the implemented schema source of truth.
- `TASKS.md`: ordered implementation tasks and completion criteria for the phases below.

## 8. Development Phases

| Phase | Intended outcome |
| --- | --- |
| 1. Accounts and event publishing | Account access, verification and recovery emails, private admin access, event creation and publishing, and public workshop discovery. |
| 2. Reliable reservations | Capacity-safe booking, duplicate prevention, booking references, and My reservations with current and past bookings. |
| 3. Organizer operations and demo readiness | Cancellation policies, rescheduling, essential booking and event emails, attendee management, and public deployment with sample events and a preverified attendee account. |

All three phases form the complete V1. `TASKS.md` will detail implementation order and dependencies; it must not defer capacity correctness until after booking is implemented.

## 9. Open Questions and Decision Timing

The architecture and database discussions resolved account linking, admin attendee capabilities, rebooking/history, fixed WIB time handling, English copy, required admin reasons, significant-change history, shared contact email, event-cancellation timing, and booking/event notification persistence, retries, skipping, and admin visibility. Authentication emails are excluded from the persistent business-notification queue. These decisions are reflected above and in the supporting documents.

Remaining open questions are not permission to invent behavior. Resolve each question before finalizing the affected design or implementing the dependent feature. Unrelated work can continue.

| Question | Resolve before |
| --- | --- |
| Which compatible Better Auth version and generated schema should be used? | Installing authentication dependencies and implementing its approved models. |
| What are the precise retry limits, intervals, claim-recovery settings, and provider-idempotency behavior? | Implementing notification processing using the approved delivery records. |
| Which email delivery provider fits the project's budget and required flows? | Implementing verification, recovery, and notification emails. |
| Which Railway plans, database configuration, and spending limit should the public demo use? | Deployment planning, or earlier if service constraints affect database design. |

## 10. References

References inform specific product decisions; they do not bring the platforms' full feature sets into scope.

- [UAL Creative Computing Institute: workshop booking and cancellation](https://wiki.cci.arts.ac.uk/books/etextiles-lab/page/inductions-workshops-and-booking-equipment) — reference for self-service cancellation more than 24 hours ahead and staff contact for late cancellations. The event-change exception is a separate decision for this project.
- [Ticket Tailor: limiting ticket quantities](https://help.tickettailor.com/en/articles/1549434-how-do-i-limit-the-quantity-of-tickets) — reference for capacity controls and protecting already issued tickets when changing limits.
- [Humanitix: cancelling or postponing events](https://help.humanitix.com/en/articles/8893210-i-need-to-cancel-and-or-refund-my-event) — reference for attendee communication and retaining bookings when postponing an event.
- [Better Auth: email and password](https://better-auth.com/docs/authentication/email-password) and [Google sign-in](https://better-auth.com/docs/authentication/google) — references for the selected sign-in methods and account-support capabilities.
- [Better Auth: NestJS integration](https://better-auth.com/docs/integrations/nestjs) and [Prisma adapter](https://better-auth.com/docs/adapters/prisma) — integration references for architecture and database planning. The documented NestJS integration is community maintained.
- [Better Auth pricing](https://better-auth.com/pricing) — the authentication framework is free and open source; optional managed services and external hosting or email delivery have separate costs.
