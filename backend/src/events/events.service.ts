import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  CancelEventInput,
  CreateEventInput,
  PublicEventQuery,
  UpdateEventInput,
} from './events.schemas.js';

const publicSelect = {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  venueName: true,
  registrationClosesAt: true,
  status: true,
  capacity: true,
  _count: { select: { reservationn: { where: { status: 'CONFIRMED' } } } },
} satisfies Prisma.EventSelect;
type PublicEvent = Prisma.EventGetPayload<{ select: typeof publicSelect }>;

function presentPublic(event: PublicEvent, now: number) {
  const confirmedCount = event._count.reservationn;
  const availability =
    event.status === 'CANCELLED'
      ? 'CANCELLED'
      : now >= event.endsAt.getTime()
        ? 'ENDED'
        : now >= event.startsAt.getTime()
          ? 'STARTED'
          : now >= event.registrationClosesAt.getTime()
            ? 'REGISTRATION_CLOSED'
            : confirmedCount >= event.capacity
              ? 'FULL'
              : 'AVAILABLE';
  return {
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venueName: event.venueName,
    registrationClosesAt: event.registrationClosesAt,
    status: event.status,
    capacity: event.capacity,
    confirmedCount,
    remainingPlaces: Math.max(0, event.capacity - confirmedCount),
    availability,
  };
}

const editorSelect = {
  id: true,
  title: true,
  description: true,
  venueName: true,
  venueAddress: true,
  startsAt: true,
  endsAt: true,
  registrationClosesAt: true,
  capacity: true,
  status: true,
  scheduleRevision: true,
  cancelledAt: true,
  cancelledById: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { reservationn: { where: { status: 'CONFIRMED' } } } },
} satisfies Prisma.EventSelect;
type EditorEvent = Prisma.EventGetPayload<{ select: typeof editorSelect }>;

function present(event: EditorEvent) {
  const { _count, ...fields } = event;
  return { ...fields, confirmedCount: _count.reservationn };
}

function validateSchedule(event: CreateEventInput) {
  const fieldErrors: { field: string; message: string }[] = [];
  if (event.endsAt <= event.startsAt)
    fieldErrors.push({
      field: 'endsAt',
      message: 'End must be after the start.',
    });
  if (event.registrationClosesAt > event.startsAt)
    fieldErrors.push({
      field: 'registrationClosesAt',
      message: 'Registration must close no later than the start.',
    });
  if (fieldErrors.length)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Check the highlighted fields.',
      fieldErrors,
    });
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listPublic(query: PublicEventQuery) {
    const organizerContactEmail = this.contactEmail();
    const now = Date.now();
    const startsAt: Prisma.DateTimeFilter = { gt: new Date(now) };
    if (query.from) {
      const dayStart = new Date(`${query.from}T00:00:00+07:00`);
      if (dayStart.getTime() > now) startsAt.gte = dayStart;
    }
    if (query.to) {
      const dayStart = new Date(`${query.to}T00:00:00+07:00`);
      startsAt.lt = new Date(dayStart.getTime() + 86400000);
      if (startsAt.lt.getTime() <= now)
        return { events: [], organizerContactEmail };
    }
    const events = await this.prisma.event.findMany({
      where: {
        status: 'PUBLISHED',
        startsAt,
        ...(query.q
          ? {
              title: {
                contains: query.q.replace(/[\\%_]/g, '\\$&'),
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: publicSelect,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return {
      events: events.map((event) => presentPublic(event, now)),
      organizerContactEmail,
    };
  }

  async getPublic(id: string) {
    const organizerContactEmail = this.contactEmail();
    const event = await this.prisma.event.findFirst({
      where: { id, status: { in: ['PUBLISHED', 'CANCELLED'] } },
      select: {
        ...publicSelect,
        description: true,
        venueAddress: true,
        cancelledAt: true,
        cancellationReason: true,
      },
    });
    if (!event) throw new NotFoundException('Workshop not found.');
    return {
      event: {
        ...presentPublic(event, Date.now()),
        description: event.description,
        venueAddress: event.venueAddress,
        cancelledAt: event.cancelledAt,
        cancellationReason: event.cancellationReason,
        cancellationClosesAt: new Date(event.startsAt.getTime() - 86400000),
      },
      organizerContactEmail,
    };
  }

  private contactEmail() {
    const contact = z.email().safeParse(process.env.ORGANIZER_CONTACT_EMAIL);
    if (!contact.success)
      throw new ServiceUnavailableException(
        'Organizer contact email is not configured. Contact the administrator.',
      );
    return contact.data;
  }

  async list() {
    const organizerContactEmail = this.contactEmail();
    const events = await this.prisma.event.findMany({
      select: editorSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { events: events.map(present), organizerContactEmail };
  }

  async get(id: string) {
    const organizerContactEmail = this.contactEmail();
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: editorSelect,
    });
    if (!event) throw new NotFoundException('Workshop not found.');
    return { event: present(event), organizerContactEmail };
  }

  async create(input: CreateEventInput, actorId: string) {
    const organizerContactEmail = this.contactEmail();
    validateSchedule(input);
    if (input.startsAt.getTime() <= Date.now())
      throw new ConflictException('The workshop must start in the future.');
    const event = await this.prisma.event.create({
      data: { ...input, createdById: actorId },
      select: editorSelect,
    });
    return { event: present(event), organizerContactEmail };
  }

  async update(id: string, input: UpdateEventInput, actorId: string) {
    const organizerContactEmail = this.contactEmail();
    const event = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const current = await tx.event.findUnique({
          where: { id },
          select: editorSelect,
        });
        if (!current) throw new NotFoundException('Workshop not found.');
        const now = Date.now();
        if (current.status === 'CANCELLED' || current.startsAt.getTime() <= now)
          throw new ConflictException(
            'This workshop is read-only because it has started or was cancelled.',
          );
        const { reason, ...changes } = input;
        const next = { ...current, ...changes };
        validateSchedule(next);
        const significant =
          current.startsAt.getTime() !== next.startsAt.getTime() ||
          current.endsAt.getTime() !== next.endsAt.getTime() ||
          current.venueName !== next.venueName ||
          current.venueAddress !== next.venueAddress;
        if (significant && !reason)
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'A reason is required for schedule or venue changes.',
            fieldErrors: [
              {
                field: 'reason',
                message: 'Explain the schedule or venue change.',
              },
            ],
          });
        if (next.startsAt.getTime() <= now)
          throw new ConflictException(
            'The revised workshop must start in the future.',
          );
        const confirmedCount = current._count.reservationn;
        if (next.capacity < confirmedCount)
          throw new ConflictException(
            `Capacity cannot be below the ${confirmedCount} confirmed reservations.`,
          );
        if (significant) {
          const change = await tx.eventChange.create({
            data: {
              eventId: id,
              revision: current.scheduleRevision + 1,
              oldStartsAt: current.startsAt,
              oldEndsAt: current.endsAt,
              newStartsAt: next.startsAt,
              newEndsAt: next.endsAt,
              oldVenueName: current.venueName,
              oldVenueAddress: current.venueAddress,
              newVenueName: next.venueName,
              newVenueAddress: next.venueAddress,
              changedById: actorId,
              reason: reason!,
              createdAt: new Date(now),
            },
          });
          if (current.status === 'PUBLISHED') {
            const reservations = await tx.reservation.findMany({
              where: { eventId: id, status: 'CONFIRMED' },
              select: { id: true },
            });
            for (const reservation of reservations) {
              await this.notifications.enqueue(tx, {
                type: 'EVENT_CHANGED',
                reservationId: reservation.id,
                eventChangeId: change.id,
              });
            }
          }
        }
        return tx.event.update({
          where: { id },
          data: {
            ...changes,
            ...(significant
              ? { scheduleRevision: current.scheduleRevision + 1 }
              : {}),
          },
          select: editorSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    return { event: present(event), organizerContactEmail };
  }

  async cancel(id: string, input: CancelEventInput, actorId: string) {
    const organizerContactEmail = this.contactEmail();
    const reason = input.reason.trim();
    if (!reason)
      throw new BadRequestException('A cancellation reason is required.');
    const event = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const current = await tx.event.findUnique({
          where: { id },
          select: editorSelect,
        });
        if (!current) throw new NotFoundException('Workshop not found.');
        if (current.status === 'CANCELLED') return current;
        if (current.status !== 'PUBLISHED')
          throw new ConflictException({
            code: 'EVENT_NOT_PUBLISHED',
            message: 'Only published workshops can be cancelled.',
          });
        const now = new Date(Date.now());
        if (now >= current.endsAt)
          throw new ConflictException({
            code: 'EVENT_ENDED',
            message: 'This workshop has ended and can no longer be cancelled.',
          });
        const reservations = await tx.reservation.findMany({
          where: { eventId: id, status: 'CONFIRMED' },
          select: { id: true },
        });
        await tx.reservation.updateMany({
          where: { eventId: id, status: 'CONFIRMED' },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelledById: actorId,
            cancellationSource: 'EVENT_CANCELLED',
            cancellationReason: reason,
          },
        });
        const cancelled = await tx.event.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelledById: actorId,
            cancellationReason: reason,
          },
          select: editorSelect,
        });
        for (const reservation of reservations) {
          await this.notifications.enqueue(tx, {
            type: 'EVENT_CANCELLED',
            reservationId: reservation.id,
          });
        }
        return cancelled;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    return { event: present(event), organizerContactEmail };
  }

  async publish(id: string) {
    const organizerContactEmail = this.contactEmail();
    const event = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const current = await tx.event.findUnique({
          where: { id },
          select: editorSelect,
        });
        if (!current) throw new NotFoundException('Workshop not found.');
        if (current.status === 'PUBLISHED') return current;
        if (current.status === 'CANCELLED')
          throw new ConflictException(
            'Cancelled workshops cannot be published.',
          );
        validateSchedule(current);
        const now = Date.now();
        if (
          current.startsAt.getTime() <= now ||
          current.registrationClosesAt.getTime() <= now
        )
          throw new ConflictException(
            'Publication requires a future start and open registration.',
          );
        return tx.event.update({
          where: { id },
          data: { status: 'PUBLISHED' },
          select: editorSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    return { event: present(event), organizerContactEmail };
  }
}
