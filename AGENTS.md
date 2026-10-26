# AGENTS.md

## Working style (applies to every project)
- One feature per task. Do not add anything outside the PRD scope.
- If something is ambiguous, ask first. Do not guess.
- Tell me directly what to add or change. No long testing/verification loops on small iterations.
- Keep code minimal: no unnecessary abstraction, short inline comments.
- Do not add dependencies or change the schema without asking.
- If there is a trade-off or a better approach, say so. Do not just comply.
- Do not create files or infra I did not ask for (Docker, CI, etc.).

## Project
Reservation ticketing system: users browse and book tickets, admins manage events and capacity.
Detailed requirements: `PRD.md`

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
- One module per feature: controller -> service -> Prisma
- Business logic lives in services, not controllers
- DTO validation: [Zod | class-validator]
- Errors go through NestJS exception filters, never return raw errors
- Schema source of truth: `prisma/schema.prisma`

## Other docs
- `PRD.md`: read before starting any new feature
- `ARCHITECTURE.md`: layers and request flow
- `DATABASE.md`: ERD and relation design rationale
- `TASKS.md`: progress tracking