# AGENTS.md

## Working style
- One feature per task. Stay within the PRD and approved task scope.
- If something is ambiguous, ask first. Do not guess.
- Tell me directly what to add or change.
- Keep verification proportional to the change. Avoid long testing loops on small iterations.
- Keep code minimal: no unnecessary abstractions, short inline comments.
- Explain material trade-offs or better approaches before implementing them.
- Do not create files or infrastructure outside the approved task.
- Leave unrelated issues and existing user changes untouched.

## File-change approval
- Ask before making changes unless I have explicitly instructed you to implement the task.
- Approval to implement a task covers only its necessary code, tests, and configuration.
- Adding dependencies or changing the database schema requires explicit approval for those changes.
- Documentation requires separate approval naming the specific files, except for the limited TASKS.md updates below.
- Implementing a feature does not authorize edits to README.md, ARCHITECTURE.md, DATABASE.md, PRD.md, or AGENTS.md.
- Reading a document does not authorize editing it.
- If documentation becomes inaccurate, describe the proposed correction and ask before editing it.
- Do not treat cleanup, consistency, or outdated content as permission to expand the task.

## Task updates
- Treat TASKS.md as an execution checklist.
- During an approved task, update only verified checkboxes and concise blockers directly related to that task.
- Preserve task wording, scope, dependencies, and acceptance criteria.
- Ask before restructuring TASKS.md or making other changes to it.
- Keep conversation summaries, dated approval notes, and repeated technical decisions out of TASKS.md.

## Project
Reservation ticketing system: users browse and book tickets; admins manage events and capacity.
Detailed requirements: `PRD.md`.

## Stack
- Backend: NestJS + TypeScript, Prisma, PostgreSQL
- Frontend: React + TypeScript (Vite)

## Commands
- Dev backend: `npm run start:dev`
- Dev frontend: `npm run dev`
- Test: `npm run test`
- Migrate: `npx prisma migrate dev`
- Lint: `npm run lint`

## Conventions
- One module per feature: controller -> service -> Prisma.
- Business logic lives in services, not controllers.
- DTO validation: [Zod | class-validator].
- Errors go through NestJS exception filters; never return raw errors.
- Schema source of truth: `prisma/schema.prisma`.
- Keep installed dependency versions in package.json and lockfiles.
- If a technical decision needs documenting, propose the relevant documentation update and obtain approval first.

## Reference documents
These are read-only references unless edits are explicitly approved:
- `PRD.md`: read before starting a new feature.
- `ARCHITECTURE.md`: consult for layers, integrations, and request flow.
- `DATABASE.md`: consult for schema, constraints, and relation design.
- `TASKS.md`: consult for task scope, dependencies, and acceptance criteria; apply only the limited updates permitted above.