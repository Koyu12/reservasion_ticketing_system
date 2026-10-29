# Design System — Reservation Ticketing System

**Version:** 0.2  
**Design Direction:** Midnight Social  
**Status:** Working Draft — Pending Visual Review  
**Theme:** Dark-first

## 1. Purpose

This document defines the shared visual identity, design tokens, and reusable UI components for the Reservation Ticketing System.

It is the source of truth for visual design in Pen.dev and frontend implementation.

### Document Responsibilities

| Document | Responsibility |
|---|---|
| PRD.md | Features and business rules |
| UX_SPEC.md | User flows, layouts, and interactions |
| DESIGN_SYSTEM.md | Visual identity, tokens, and UI components |
| ARCHITECTURE.md | Technical implementation and system architecture |

**Rules:**
- Never override PRD or UX_SPEC requirements.
- Never introduce new product features through visual design.
- Do not modify approved documents without explicit approval.
- Maintain consistency across customer and admin interfaces.

---

## 2. Visual Identity

### Concept: Midnight Social

A minimal, modern, dark-first visual identity inspired by premium event platforms such as Luma.

The goal is to make event discovery feel elegant, professional, and welcoming without unnecessary visual decoration.

### Characteristics

- Deep neutral backgrounds
- Elevated dark surfaces
- Soft off-white typography
- Subtle borders
- Restrained lavender accents
- Photography-led event cards
- Spacious, readable layouts
- Minimal visual noise

### Design Principles

1. Content over decoration.
2. Event imagery provides most of the visual personality.
3. Primary actions should be immediately recognizable.
4. Consistency across all screens.
5. Accessibility over aesthetics.
6. Clear hierarchy and predictable interactions.
7. Reuse components instead of creating one-off designs.

### Avoid

- Neon colors and excessive glowing effects
- Heavy gradients and glassmorphism
- Unnecessary decorative illustrations
- Excessive shadows
- Oversized rounded corners
- Generic AI-generated SaaS aesthetics
- Unnecessary animations
- Copying Luma's layouts or branding directly

---

## 3. Color System

### 3.1 Core Color Palette

| Token | Hex | Usage |
|---|---|---|
| `bg-primary` | `#111316` | Main application background |
| `bg-surface` | `#1D2025` | Cards, panels, inputs |
| `bg-elevated` | `#292D34` | Dropdowns, dialogs, elevated surfaces |
| `text-primary` | `#F5F5F4` | Main text and headings |
| `text-secondary` | `#A8ADB6` | Secondary information |
| `accent` | `#B7AEFF` | Selected states, links, subtle emphasis |
| `border-default` | `#363A42` | Dividers, card and input borders |

These colors form the proposed Midnight Social palette.

### 3.2 Action Colors

| Token | Hex | Usage |
|---|---|---|
| `button-primary` | `#F5F5F4` | Primary action background |
| `button-primary-text` | `#111316` | Primary action text |
| `button-primary-hover` | `#DDDDE0` | Primary hover |
| `button-secondary` | `#292D34` | Secondary action background |
| `button-secondary-text` | `#F5F5F4` | Secondary action text |
| `focus-ring` | `#B7AEFF` | Keyboard focus indication |

Do not use lavender for every primary button. Reserve accent colors for meaningful highlights and selected states.

### 3.3 Semantic Colors

Proposed colors:

| Token | Hex | Meaning |
|---|---|---|
| `success` | `#62C79E` | Confirmed, available, completed |
| `warning` | `#E4B36C` | Low availability, caution |
| `error` | `#F1848C` | Cancellation, failed action, errors |
| `info` | `#89B5EF` | Informational notices |

Use semantic colors sparingly and always provide text labels.

### Accessibility

- Maintain at least 4.5:1 contrast for normal text.
- Maintain at least 3:1 contrast for large text and meaningful UI boundaries where applicable.
- Never rely exclusively on color to communicate status.
- Use clearly visible keyboard focus indicators.
- Verify final color combinations during high-fidelity review.

---

## 4. Typography

### Font Family — Proposed

**Primary:** Inter  
**Fallback:** system-ui, sans-serif

Use one primary font family for both customer and admin interfaces.

### Typography Scale

| Style | Desktop | Mobile | Weight |
|---|---|---|---|
| H1 | 36 / 44px | 28 / 36px | 700 |
| H2 | 30 / 38px | 26 / 34px | 600 |
| H3 | 24 / 32px | 22 / 30px | 600 |
| H4 | 20 / 28px | 20 / 28px | 600 |
| Body | 16 / 24px | 16 / 24px | 400 |
| Body Small | 14 / 20px | 14 / 20px | 400 |
| Caption | 12 / 16px | 12 / 16px | 400 |
| Button | 14 / 20px | 14 / 20px | 600 |

Values are font size / line height.

### Typography Rules

- Use clear heading hierarchy.
- Prefer sentence case for UI labels.
- Avoid unnecessary bold text.
- Secondary information must remain readable.
- Use consistent text styles across all pages.
- Event titles should be more prominent than their metadata.

---

## 5. Spacing System

Use a 4px-based spacing scale.

| Token | Value |
|---|---|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-12` | 48px |
| `space-16` | 64px |

### Layout Guidelines

- Mobile horizontal page padding: 16px.
- Desktop horizontal page padding: 24–32px.
- Desktop content max-width: approximately 1200px.
- Card padding: 16–24px.
- Use consistent spacing between related elements.
- Use whitespace to establish hierarchy instead of decorative separators.

---

## 6. Borders, Radius & Elevation

### Border Radius

| Component | Radius |
|---|---|
| Buttons | 10px |
| Inputs | 10px |
| Cards | 14px |
| Dialogs | 16px |
| Status badges | Pill / 999px |

### Surface Rules

- Prefer subtle 1px borders instead of strong shadows.
- Cards should be distinguishable from the main background.
- Dialogs may use elevated surfaces and dimmed backdrops.
- Avoid visual elevation without a functional reason.

---

## 7. Reusable Components

Create reusable Pen.dev components rather than designing unique versions for every page.

### 7.1 Buttons

Variants:
- Primary
- Secondary
- Ghost / Text
- Destructive

States:
- Default
- Hover
- Focus
- Disabled
- Loading

Use off-white primary buttons with dark text by default.

Destructive buttons should communicate risk without becoming visually dominant unless the action requires special attention.

### 7.2 Form Controls

Shared components:
- Text input
- Search input
- Date-range picker
- Textarea
- Select
- Validation message

Rules:
- Visible labels
- Clear selected states
- Consistent heights and padding
- Readable placeholder colors
- Appropriate error messages
- Accessible focus indicators

### 7.3 Event Cards

The Event Card must follow UX_SPEC.md.

Content:
- Event cover or fallback
- Event title
- Date and time
- Brief venue information
- One contextual status badge

Rules:
- Entire card is clickable.
- No extra action button inside discovery cards.
- Event cover is the main visual element.
- Consistent image proportions.
- Proposed cover aspect ratio: 16:9.
- Keep metadata concise.
- Do not add promotional elements or fake urgency.

### 7.4 Status Badges

Supported labels include:
- Available
- Fully Booked
- Registration Closed
- Registered
- Cancelled
- Confirmed

Use subtle tinted surfaces or borders with readable text.

Follow status priority and replacement behavior defined in UX_SPEC.md.

For example, Registered replaces ordinary availability on discovery cards; organizer cancellation takes precedence where relevant.

### 7.5 Navigation

- Consistent dark navigation surfaces.
- Events and My Reservations remain visible as required by UX_SPEC.
- Account access remains available.
- Maintain readable responsive navigation.
- Avoid adding unnecessary menu items.

### 7.6 Dialogs

Shared dialog structure:
- Clear title
- Supporting description
- Primary and secondary actions
- Appropriate close behavior
- Visible keyboard focus

Use approved interaction patterns for:
- Booking confirmation
- Cancellation confirmation
- Full event description

### 7.7 Admin Components

Reusable admin components include:
- Event cards
- Sectioned forms
- Attendee tables
- Status indicators
- Confirmation dialogs
- Failed email management states

Keep admin pages consistent with Midnight Social while prioritizing readability and operational efficiency.

Admin tables should not sacrifice scanability for visual decoration.

---

## 8. Images and Media

### Event Cover Guidelines

- Use realistic event photography.
- Let images add color to the dark interface.
- Maintain consistent cover proportions.
- Crop thoughtfully without losing important subjects.
- Use a branded dark fallback when no cover exists.
- Avoid generic or unrelated AI imagery.

Do not use images to replace essential event information.

### Google Maps

- The map should visually fit within the dark interface.
- Preserve full venue and address readability.
- The external Open in Maps action must remain clear.
- Do not assume Google Maps embeds support custom dark styling.

---

## 9. Responsive Design

### Reference Frames

- Desktop: 1440px
- Mobile: 390px

These are reference dimensions, not fixed supported viewport sizes.

### Customer Pages

- Support desktop and mobile.
- Prioritize mobile usability.
- Preserve approved responsive navigation behavior.
- Preserve the Event Details sticky reservation bar on mobile.
- Adapt layouts, not simply scale desktop components down.

### Admin Pages

- Desktop-first.
- Remain usable on narrow screens.
- Preserve table readability.
- Avoid unnecessary horizontal overflow.

### Accessibility

- Aim for comfortable interactive targets, approximately 44 × 44px where practical.
- Maintain readable font sizes.
- Preserve visible keyboard focus states.
- Respect reduced-motion preferences.

---

## 10. Interaction & Feedback

Visual behavior must reflect PRD.md and UX_SPEC.md.

### Required Component States

- Default
- Hover
- Focus
- Active / Selected
- Disabled
- Loading
- Success
- Error
- Empty

### Feedback Rules

- Use clear text for errors and successful actions.
- Avoid misleading loading or success states.
- Keep booking and cancellation confirmations understandable.
- Use subtle feedback rather than decorative animation.
- Do not introduce new flows through UI styling.

---

## 11. Pen.dev Workflow

### Phase 1 — Low-Fidelity

- Create grayscale wireframes.
- Follow PRD.md and UX_SPEC.md.
- Validate structure, navigation, and content hierarchy.
- Review desktop and mobile layouts.
- Preserve approved low-fidelity frames.

### Phase 2 — High-Fidelity

- Duplicate approved wireframes.
- Never overwrite the low-fidelity originals.
- Apply Midnight Social colors and typography.
- Refine spacing, borders, and component hierarchy.
- Add realistic event images.
- Reuse shared components.
- Preserve approved flows and functionality.

### Phase 3 — Design Review

Check:
- Visual consistency