# UX Decision Summary — Reservation Ticketing System

**Status:** UX Interview Completed — Q01–Q40  
**Product:** Free In-Person Workshops &amp; Seminars  
**Version:** V1 · Single Organizer  
**Design Direction:** Sunlit Social  
**PRD:** Alignment review pending; original approved documents unchanged.

## 1. Product Direction

The Reservation Ticketing System allows visitors to discover workshops, register for free events, manage reservations, and receive important updates. A single organization manages event publishing, capacity, attendees, cancellations, and significant changes.

The V1 design targets **0–4 active events initially**, without imposing a database limit on the total number of events.

### Visual identity

- Warm, friendly, approachable, and mature.
- Apricot/coral primary (`#EB9478`), warm ivory canvas (`#FBF7F1`), and charcoal typography (`#202323`).
- Eventbrite-inspired image-first Event Discovery.
- Responsive public pages with mobile-first reservation interactions.
- Clean layouts, consistent component placement, and no unnecessary visual complexity.

## 2. Final UX Decisions — Q01–Q40

### A. Event Discovery — Q01–Q06


| ID  | Approved decision                     | Implementation notes                                                                                                                             |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q01 | Search &amp; Discover First           | Homepage prioritizes heading, filters, and events rather than a large promotional hero.                                                          |
| Q02 | Small Event Catalog                   | V1 initially targets 0–4 active events; handle empty and small collections. This is not a database limit. **Revised.**                           |
| Q03 | Upcoming Soonest First                | Sort upcoming events by ascending start date and time.                                                                                           |
| Q04 | Show Available, Full, and Closed      | Keep these events discoverable; exclude cancelled events from the primary catalog, but retain their direct detail pages and reservation history. |
| Q05 | Optional Cover Image                  | Use an uploaded image where provided, or a branded visual fallback. Requires PRD alignment.                                                      |
| Q06 | Balanced, Fully Clickable Event Cards | Display cover, title, date/time, brief venue, and one contextual status badge; no separate action button inside a card.                          |


### B. Authentication &amp; Booking — Q07–Q13


| ID  | Approved decision                   | Implementation notes                                                                                                                                                                        |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q07 | Dedicated Login/Register            | Preserve the event destination through authentication. Do not automatically reserve afterward.                                                                                              |
| Q08 | Return After Verification           | Return the verified attendee to the event when possible; booking still requires a manual action.                                                                                            |
| Q09 | Dedicated Booking Success Page      | Show confirmed status, unique booking reference, event details, and View My Reservation.                                                                                                    |
| Q10 | Booking Failure Feedback            | Display a clear error and update persistent availability after a capacity race. Distinguish network, duplicate, and eligibility errors.                                                     |
| Q11 | Reservation Confirmation Dialog     | Review event details and cancellation policy before confirming. No additional checkbox or artificial seat hold.                                                                             |
| Q12 | Cancellation Confirmation Dialog    | After successful cancellation, remain in My Reservations with a toast and persistent Cancelled status.                                                                                      |
| Q13 | Consistent Late-Cancellation Action | Keep Cancel Reservation in the same location but disable it with an explanation and Contact Organizer link when the ordinary cutoff applies. Preserve the exception for affected attendees. |


### C. My Reservations &amp; Event Changes — Q14–Q18


| ID  | Approved decision                            | Implementation notes                                                                                                     |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Q14 | Active / History Tabs                        | Use compact reservation cards without cover images. Include title, date, and status.                                     |
| Q15 | Dedicated Reservation Detail                 | Separate from Booking Success; show current event data, booking reference, policy, contact, and relevant actions.        |
| Q16 | Compact Change Summary in Reservation Detail | Show original schedule crossed out and revised schedule clearly, without an additional modal.                            |
| Q17 | Inline Change Summary on Reservation Card    | Show changes in a separate row after a divider; no tinted background.                                                    |
| Q18 | Soft Cancellation Notice                     | Organizer-cancelled events show a subtle muted-red notice. User-cancelled reservations use an ordinary Cancelled status. |


**Important distinction:** Q17 and Q18 deliberately use different visual treatments. A schedule change is informative; organizer cancellation is a stronger interruption.

### D. Navigation, Search &amp; Filters — Q19–Q25


| ID  | Approved decision                        | Implementation notes                                                                                                           |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Q19 | Responsive Top Navigation                | Events and My Reservations remain discoverable on desktop and mobile. Mobile can use two header rows.                          |
| Q20 | Always-Visible Filters                   | Show title search and From/To date fields without hiding them behind a filter dialog.                                          |
| Q21 | Unified Date-Range Calendar              | From and To share a range-picker interaction, with highlighted intermediate dates and clear-date functionality.                |
| Q22 | Automatic Filtering After Complete Range | Apply the date range after both endpoints are selected; preserve currently applied results during an incomplete edit.          |
| Q23 | Live Title Search                        | Filter while typing, using debouncing and stale-request protection when searching the server. No autocomplete dropdown for V1. |
| Q24 | Contextual Empty State                   | Explain when no events match filters and offer Clear Dates or Clear All. Distinguish this from having no upcoming events.      |
| Q25 | Simple Event Grid                        | **Revised:** postpone infinite scrolling and pagination for the initial small catalog. Retain the ability to scale later.      |


### E. Event Details &amp; Reservation Actions — Q26–Q30


| ID  | Approved decision                    | Implementation notes                                                                                                                                          |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q26 | Content + Reservation Sidebar        | Two-column desktop layout; single-column mobile layout.                                                                                                       |
| Q27 | Sticky Bottom Reservation Bar        | Keep the main reservation action accessible while scrolling on mobile.                                                                                        |
| Q28 | Contextual Status Replacement        | Replace unavailable booking actions with clear explanations for Fully Booked, Registration Closed, or Event Cancelled.                                        |
| Q29 | Registered + View My Reservation     | An attendee with an active reservation sees confirmation and a direct route to their reservation, not another Reserve button.                                 |
| Q30 | Replace Availability with Registered | Event cards show one contextual status badge. A registered attendee sees Registered rather than two competing badges. **Recommendation revised from A to B.** |


**Additional approved decision:** The Event Details description uses a **Responsive Description Modal**. Display a short excerpt with Read full description. Desktop opens a centered dialog; mobile uses a larger responsive dialog. The main page does not expand or shift downward.

Organizer cancellation overrides Registered when the reservation is no longer valid. An attendee who previously cancelled can rebook only when the event remains eligible; a new booking reference is created.

### F. Sharing &amp; Marketing — Q31–Q36


| ID  | Approved decision                        | Implementation notes                                                                                           |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Q31 | Share Event on Details + Booking Success | Do not add Share buttons to discovery cards. Share the public event URL only.                                  |
| Q32 | Native Share + Copy Link Fallback        | Use browser/device sharing where available, otherwise provide a copyable public URL.                           |
| Q33 | Event-Specific Link Preview              | Include event-specific Open Graph title, description, URL, and image metadata.                                 |
| Q34 | Universal Branded Fallback               | Use one static branded social image when an event lacks its own cover.                                         |
| Q35 | Show Remaining Seats When Low            | Only display truthful remaining-seat information when capacity is low and new bookings are allowed.            |
| Q36 | Conservative Hybrid Threshold            | Show the low-seat message when remaining seats are positive, no more than 5, and no more than 20% of capacity. |


The low-seat message is informative, not a reservation guarantee. Do not introduce fake scarcity, urgency countdowns, or seat holds before confirmation.

### G. Venue &amp; Admin Experience — Q37–Q40


| ID  | Approved decision                               | Implementation notes                                                                                                                                     |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q37 | C-Lite: Manual Google Maps Embed + Open in Maps | Show full address, optional embedded map, and external Maps link. Validate the stored embed URL.                                                         |
| Q38 | Sectioned Single-Page Create Event Form         | Group basic information, schedule/location, and registration settings on one page. No wizard or collapsed sections.                                      |
| Q39 | Admin Event Cards                               | Display cover, title, schedule, publication status, and Manage Event. **Chosen instead of a recommended table to support immediate visual recognition.** |
| Q40 | Compact Attendee Table                          | Show attendee names, emails, booking statuses, confirmed count, and access to reservation details. No advanced analytics or bulk actions.                |


## 3. Important Revisions


| Question      | Earlier direction                                  | Final decision                                        |
| ------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Q02           | Support a wide range of catalog sizes immediately  | Optimize V1 for 0–4 active events; no hard data limit |
| Q17           | Earlier consideration of a soft notice for changes | Plain inline schedule-change summary                  |
| Q25           | Infinite scrolling                                 | Simple grid without infinite scroll or pagination     |
| Q26 extension | Inline Read More considered                        | Responsive Description Modal                          |
| Q30           | Availability + Registered simultaneously           | Replace availability badge with Registered            |
| Q37           | Address + Open in Maps                             | Manual embedded map + Open in Maps                    |
| Q39           | Compact Event Table recommended                    | Admin Event Cards for visual recognition              |


These revisions supersede their earlier alternatives.

## 4. PRD Gap Review

The existing PRD already covers the essential business capabilities: discovery, authentication, free reservations, capacity management, duplicate prevention, cancellations, rescheduling, administrative operations, and essential notifications.

The UX interview introduces the following potential additions or clarifications.


| Priority | Proposed PRD alignment                            | Source        | Impact                                                                                    |
| -------- | ------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| High     | Optional event cover upload                       | Q05           | Adds image handling, storage, validation, and fallback behavior                           |
| High     | Public Share Event action                         | Q31–Q32       | Adds sharing on Event Details and Booking Success                                         |
| Medium   | Event-specific social metadata                    | Q33–Q34       | Requires server-readable metadata and a publicly accessible fallback image                |
| Medium   | Optional Google Maps embed URL                    | Q37           | Adds admin input, URL validation, iframe rendering, and external directions link          |
| Low      | Conditional remaining-seat messaging              | Q35–Q36       | Uses existing capacity data and adds a display threshold                                  |
| Low      | Small initial catalog and no infinite scroll      | Q02/Q25       | Primarily a UX specification and implementation simplification, not a database constraint |
| Low      | Responsive description modal and layout decisions | Q26 extension | Belongs primarily in the UX/UI specification rather than core product requirements        |


**Scope interpretation:** These items are approved UX decisions, but are **not automatically approved modifications to the existing PRD, [DATABASE.md](http://DATABASE.md), [ARCHITECTURE.md](http://ARCHITECTURE.md), or [TASKS.md](http://TASKS.md)**.

The cover upload and manual map URL deserve particular attention because they introduce new data inputs. Public event sharing and Open Graph metadata require implementation work but do not change reservation business rules.

## 5. Existing PRD Requirements That Must Remain

The UX interview did not replace or remove these previously established requirements:

- Email/password and Google sign-in, verified email before reserving, password recovery, and private admin access.
- Atomic capacity-safe booking, one active reservation per attendee per event, booking references, and eligible rebooking after cancellation.
- Self-service cancellation more than 24 hours before event start, plus the exception for attendees affected by significant schedule/venue changes.
- Admin reasons and historical records for significant changes and relevant cancellation actions.
- Essential notification emails, persistent booking/event notification processing, retry behavior, and admin visibility of failed delivery.
- Free in-person events only: no paid tickets, waitlists, multi-organizer marketplace, QR tickets, scanning, or check-in in V1.
- English interface copy, WIB display times, and UTC timestamp storage.

## 6. Proposed V1 Information Architecture

### Public / Attendee

1. Event Discovery
2. Event Details
3. Login / Register / Email Verification / Password Recovery
4. Booking Success
5. My Reservations — Active / History
6. Reservation Details

Supporting interactions: reservation confirmation, cancellation confirmation, description modal, event sharing, and conditional status feedback.

### Admin

1. Manage Events — visual event cards
2. Create / Edit Event — sectioned single-page form
3. Event Management — publication, schedule changes, capacity, cancellation
4. Attendee Management — compact table
5. Reservation Detail / Administrative Actions
6. Failed Notification Management — required by the existing PRD

This is a proposed page-level organization, not a final route contract. Screens may be combined where doing so simplifies implementation without removing required functions.

## 7. Next Design Deliverables

The interview phase is complete. The next design work should follow this order:

1. **Information Architecture Review** — finalize page relationships, route destinations, and user journeys.
2. **Low-Fidelity Wireframes** — build the page structures and major interactions.
3. **High-Fidelity Design** — apply Sunlit Social's visual system.
4. **Responsive &amp; State Review** — validate mobile/desktop layouts, availability states, errors, and accessibility.
5. **PRD Synchronization** — update approved documentation only after explicit approval of the proposed changes.

**Final interview status:** Q01–Q40 completed. No additional discovery questions are required to begin wireframing.