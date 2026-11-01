import { APP_CONFIG } from '../common/config.js';
import type { AppConfig } from '../common/config.js';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { ReservationsValidation } from './reservations.validation.js';
import type {
  BookReservationInput,
  AdminCancelReservationInput,
  BookingResponse,
  ReservationResponse,
  ReservationListResponse,
  CancelReservationResponse,
  AdminCancelReservationResponse,
  EventReservationsResponse,
} from './reservations.validation.js';
import { ValidationService } from '../common/validation.service.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

const bookingSelect = { id: true, eventId: true, bookingReference: true, status: true, createdAt: true } satisfies Prisma.ReservationSelect;

const adminCancellationSelect = {
  ...bookingSelect,
  cancelledAt: true,
  cancelledById: true,
  cancellationSource: true,
  cancellationReason: true,
} satisfies Prisma.ReservationSelect;

const detailSelect = {
  ...bookingSelect,
  bookedRevision: true,
  cancelledAt: true,
  event: {
    select: {
      id: true,
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
      venueName: true,
      venueAddress: true,
      registrationClosesAt: true,
      scheduleRevision: true,
      cancelledAt: true,
      cancellationReason: true,
    },
  },
} satisfies Prisma.ReservationSelect;
type ReservationDetails = Prisma.ReservationGetPayload<{ select: typeof detailSelect }>;

function presentBooking(reservation: Prisma.ReservationGetPayload<{ select: typeof bookingSelect }>) {
  return {
    id: reservation.id,
    eventId: reservation.eventId,
    bookingReference: reservation.bookingReference,
    status: reservation.status,
    createdAt: reservation.createdAt,
  };
}
function presentCancelled(reservation: Prisma.ReservationGetPayload<{ select: typeof bookingSelect }> & { cancelledAt: Date | null }) {
  return { ...presentBooking(reservation), cancelledAt: reservation.cancelledAt };
}
function presentAdminCancellation(reservation: Prisma.ReservationGetPayload<{ select: typeof adminCancellationSelect }>) {
  return {
    ...presentCancelled(reservation),
    cancelledById: reservation.cancelledById,
    cancellationSource: reservation.cancellationSource,
    cancellationReason: reservation.cancellationReason,
  };
}

function presentReservation(reservation: ReservationDetails) {
  const { bookedRevision, event } = reservation;
  const affectedByChange = event.scheduleRevision > bookedRevision;
  return {
    ...presentCancelled(reservation),
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      registrationClosesAt: event.registrationClosesAt,
      scheduleRevision: event.scheduleRevision,
      cancelledAt: event.cancelledAt,
      cancellationReason: event.cancellationReason,
    },
    affectedByChange,
    cancellationClosesAt: new Date(event.startsAt.getTime() - (affectedByChange ? 0 : 86400000)),
  };
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly validationService: ValidationService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private generateBookingReference() {
    return randomBytes(12).toString('hex').toUpperCase();
  }

  async book(request: BookReservationInput, userId: string): Promise<BookingResponse> {
    const { eventId } = this.validationService.validate(ReservationsValidation.BOOK, request);
    this.logger.debug('Booking reservation', { context: ReservationsService.name, eventId });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const reservation = await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
            const event = await tx.event.findUnique({ where: { id: eventId } });
            if (!event || event.status === 'DRAFT') throw new NotFoundException('Workshop not found.');
            const now = Date.now();
            const attendee = await tx.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
            if (!attendee) throw new UnauthorizedException();
            if (!attendee.emailVerified)
              throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before booking.' });
            const existing = await tx.reservation.findFirst({ where: { eventId, userId, status: 'CONFIRMED' }, select: { id: true } });
            if (existing)
              throw new ConflictException({
                code: 'ALREADY_RESERVED',
                message: 'You already have a place at this workshop.',
                reservationId: existing.id,
              });
            if (event.status === 'CANCELLED')
              throw new ConflictException({ code: 'EVENT_CANCELLED', message: 'This workshop has been cancelled.' });
            if (now >= event.startsAt.getTime())
              throw new ConflictException({ code: 'EVENT_STARTED', message: 'This workshop has already started.' });
            if (now >= event.registrationClosesAt.getTime())
              throw new ConflictException({ code: 'REGISTRATION_CLOSED', message: 'Registration for this workshop has closed.' });
            const count = await tx.reservation.count({ where: { eventId, status: 'CONFIRMED' } });
            if (count >= event.capacity) throw new ConflictException({ code: 'EVENT_FULL', message: 'This workshop is fully booked.' });
            const booked = await tx.reservation.create({
              data: { eventId, userId, bookedRevision: event.scheduleRevision, bookingReference: this.generateBookingReference() },
              select: bookingSelect,
            });
            await this.notifications.enqueue(tx, { type: 'BOOKING_CONFIRMED', reservationId: booked.id });
            return booked;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        this.logger.info('Reservation booked', { context: ReservationsService.name, reservationId: reservation.id });
        return { reservation: presentBooking(reservation) };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002' || error.meta?.modelName !== 'Reservation')
          throw error;
        const referenceCollision = z
          .object({
            cause: z.object({
              kind: z.literal('UniqueConstraintViolation'),
              constraint: z.object({ index: z.literal('Reservation_bookingReference_key') }),
            }),
          })
          .safeParse(error.meta.driverAdapterError);
        if (!referenceCollision.success) throw error;
      }
    }
    throw new ServiceUnavailableException({
      code: 'REFERENCE_UNAVAILABLE',
      message: 'Unable to create a booking reference. Please try again.',
    });
  }

  async get(id: string, userId: string): Promise<ReservationResponse> {
    id = this.validationService.validate(ReservationsValidation.ID, id);
    this.logger.debug('Fetching reservation', { context: ReservationsService.name });
    const reservation = await this.prisma.reservation.findFirst({ where: { id, userId }, select: detailSelect });
    if (!reservation) throw new NotFoundException('Reservation not found.');
    return { reservation: presentReservation(reservation), organizerContactEmail: this.config.organizerContactEmail };
  }

  async cancel(id: string, userId: string, body: Record<string, never>): Promise<CancelReservationResponse> {
    id = this.validationService.validate(ReservationsValidation.ID, id);
    this.validationService.validate(ReservationsValidation.EMPTY, body);
    this.logger.debug('Cancelling reservation', { context: ReservationsService.name });
    const owned = await this.prisma.reservation.findFirst({ where: { id, userId }, select: { eventId: true } });
    if (!owned) throw new NotFoundException('Reservation not found.');
    const select = { ...bookingSelect, cancelledAt: true };
    const reservation = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${owned.eventId}::uuid FOR UPDATE`;
        const current = await tx.reservation.findFirst({ where: { id, userId }, select: detailSelect });
        if (!current) throw new NotFoundException('Reservation not found.');
        if (current.status === 'CANCELLED') return tx.reservation.findUniqueOrThrow({ where: { id }, select });

        const now = new Date(Date.now());
        if (current.event.status !== 'PUBLISHED' || now >= presentReservation(current).cancellationClosesAt)
          throw new ConflictException({
            code: 'CANCELLATION_CLOSED',
            message: 'Self-service cancellation has closed. Contact the organizer and include your booking reference.',
          });

        const cancelled = await tx.reservation.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelledById: userId,
            cancellationSource: 'SELF_SERVICE',
            cancellationReason: null,
          },
          select,
        });
        await this.notifications.enqueue(tx, { type: 'RESERVATION_CANCELLED', reservationId: id });
        return cancelled;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    this.logger.info('Reservation cancellation completed', { context: ReservationsService.name, reservationId: reservation.id });
    return { reservation: presentCancelled(reservation) };
  }

  async listForEvent(eventId: string, query: Record<string, never>): Promise<EventReservationsResponse> {
    eventId = this.validationService.validate(ReservationsValidation.ID, eventId);
    this.validationService.validate(ReservationsValidation.EMPTY, query);
    this.logger.debug('Fetching workshop reservations', { context: ReservationsService.name });
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        status: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        reservationn: {
          select: {
            ...adminCancellationSelect,
            attendee: { select: { name: true, email: true } },
            cancelledBy: { select: { id: true, name: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!event) throw new NotFoundException('Workshop not found.');
    const reservations = event.reservationn.map((row) => ({
      ...presentAdminCancellation(row),
      attendee: { name: row.attendee.name, email: row.attendee.email },
      cancelledBy: row.cancelledBy ? { id: row.cancelledBy.id, name: row.cancelledBy.name } : null,
    }));
    const confirmed = reservations.filter((row) => row.status === 'CONFIRMED');
    return {
      event: {
        id: event.id,
        title: event.title,
        status: event.status,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        capacity: event.capacity,
      },
      confirmedCount: confirmed.length,
      confirmed,
      cancelled: reservations.filter((row) => row.status === 'CANCELLED'),
    };
  }

  async cancelAsAdmin(id: string, actorId: string, request: AdminCancelReservationInput): Promise<AdminCancelReservationResponse> {
    id = this.validationService.validate(ReservationsValidation.ID, id);
    const input = this.validationService.validate(ReservationsValidation.ADMIN_CANCEL, request);
    this.logger.debug('Cancelling reservation as admin', { context: ReservationsService.name, reservationId: id });
    const existing = await this.prisma.reservation.findUnique({ where: { id }, select: { eventId: true } });
    if (!existing) throw new NotFoundException('Reservation not found.');
    const reservation = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${existing.eventId}::uuid FOR UPDATE`;
        const current = await tx.reservation.findUnique({ where: { id }, select: adminCancellationSelect });
        if (!current) throw new NotFoundException('Reservation not found.');
        if (current.status === 'CANCELLED') return current;
        const cancelled = await tx.reservation.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(Date.now()),
            cancelledById: actorId,
            cancellationSource: 'ADMIN',
            cancellationReason: input.reason,
          },
          select: adminCancellationSelect,
        });
        await this.notifications.enqueue(tx, { type: 'RESERVATION_CANCELLED', reservationId: id });
        return cancelled;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    this.logger.info('Admin reservation cancellation completed', { context: ReservationsService.name, reservationId: reservation.id });
    return { reservation: presentAdminCancellation(reservation) };
  }

  async list(userId: string, query: Record<string, never>): Promise<ReservationListResponse> {
    this.validationService.validate(ReservationsValidation.EMPTY, query);
    this.logger.debug('Fetching personal reservations', { context: ReservationsService.name });
    const reservations = await this.prisma.reservation.findMany({
      where: { userId },
      select: detailSelect,
      orderBy: [{ event: { startsAt: 'asc' } }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    const now = Date.now();
    const isCurrent = (reservation: ReservationDetails) =>
      reservation.status === 'CONFIRMED' && reservation.event.status !== 'CANCELLED' && reservation.event.endsAt.getTime() > now;
    return {
      current: reservations.filter(isCurrent).map(presentReservation),
      history: reservations
        .filter((reservation) => !isCurrent(reservation))
        .sort((a, b) => b.event.startsAt.getTime() - a.event.startsAt.getTime())
        .map(presentReservation),
      organizerContactEmail: this.config.organizerContactEmail,
    };
  }
}
