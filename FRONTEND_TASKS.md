
# Frontend redesign and integration

Backend code, API contracts, configuration, schema, migrations, dependencies and lockfiles remain unchanged. Real API values replace design samples; missing display data uses placeholders. Reference: `design/reservation.pen`.

## Shared foundation
- [x] Shared Midnight Social layout, account navigation, controls, dialogs and request states.
- [x] Reusable cover/map placeholders and public-event sharing.

## Public pages
- [x] Event discovery: redesign and real API integration.
- [x] Event discovery: filtering, availability, loading, error and empty-state checks.
- [x] Event discovery: whole-card hover/focus highlight with a click-through overlay and reduced-motion support; build, lint and generated CSS verified.
- [x] Event discovery: hovered/focused cards grow 2% and render above neighboring cards without layout shifts; build, lint and generated CSS verified.
- [ ] Event discovery: manually verify hover over nested elements, keyboard focus and card navigation in a permitted browser.
- [x] Event details: redesign and real API integration.
- [ ] Event details: booking confirmation, sharing, maps and availability checks.

## Account pages
- [x] Login: redesign and existing Better Auth integration.
- [x] Registration: redesign and existing Better Auth integration.
- [x] Email verification: pending, unavailable link and verified states.
- [x] Forgot password: form, request feedback and existing integration.
- [x] Reset password: form, invalid link, completion and existing integration.
- [ ] Account pages: validation, safe destinations and recovery checks.

## Reservation pages
- [x] Booking success: redesign and real reservation integration.
- [x] My Reservations: Active/History tabs, cards and real API integration.
- [x] Reservation details: new frontend route, real API integration and cancellation dialog.
- [ ] Reservation pages: changed, late-cancellation, cancelled and missing-record checks.

## Admin pages
- [x] Workshop list: redesign; preserve existing API operations.
- [x] Create workshop: redesign; preserve existing API operations.
- [x] Edit workshop: redesign; preserve publishing, changes and cancellation operations.
- [x] Attendees: redesign; preserve reason-required cancellation.
- [x] Failed emails: redesign; preserve manual retry.
- [ ] Admin pages: access, validation, pending, failure and empty-state checks.

## Final verification
- [ ] Not-found, access-denied and expired-session presentation.
- [x] Frontend production build, lint and focused automated checks.
- [ ] Desktop (1440px), mobile (390px), intermediate-width and keyboard browser checks.
- [ ] Live backend reads and attendee/admin workflows in an appropriate test environment.
- [x] Confirm backend and dependency files match their starting hashes.

## Placeholder register
| UI area | Missing backend value | Frontend treatment |
| --- | --- | --- |
| Event cover / row imagery | Cover URL | Branded image placeholder |
| Venue map preview | Approved map embed URL | Map placeholder; working Maps link from actual address |
| Schedule change summary | Original schedule / venue | Current values; previous-details-unavailable placeholder |
| Reservation cancellation attribution | Attendee-facing cancellation actor/reason | Neutral cancelled copy; event cancellation shown only when known |

## Blockers
- Visual/keyboard verification remains pending: Pencil browser capture timed out, Chrome Computer Use was not approved, and the later Pencil browser read was cancelled. Native Pen capture returned another application's window, so it could not verify the frontend.
- Live authenticated attendee/admin, Google and email workflows remain unverified. No test accounts, bookings, events, emails, configuration or database contents were changed.

## Verified results
- Production frontend build and ESLint pass.
- 13 automated tests pass: real API-to-UI mapping, WIB filters, availability boundaries, safe destinations, and response-fixture rendering across public, account, reservation and admin pages. These render checks do not simulate browser clicks or prove visual fidelity.
- Live reads through `http://localhost:5173`: public events return 200 with an empty catalog, a missing event returns 404, and anonymous reservation/admin access returns 401. Authentication session lookup returns no signed-in session.
- All 143 starting hashes (141 backend files plus the frontend dependency manifest and lockfile) match. Backend operations, schema and configuration are unchanged.
- Design detector reports only its generic Inter-font warning; Inter is the supplied `.pen` font and was preserved.
