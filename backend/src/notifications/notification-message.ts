import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { EmailDeliveryError } from '../email/email.service.js';

export type NotificationContext = Prisma.EmailJobGetPayload<{
  include: { reservation: { include: { event: true } }; eventChange: true };
}>;

const wib = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'full',
  timeStyle: 'short',
});
const time = (date: Date) => `${wib.format(date)} WIB`;

export function obsoleteReason(job: NotificationContext): string | null {
  const { reservation: booking, eventChange: change } = job;
  const event = booking.event;
  if (job.type === 'BOOKING_CONFIRMED' || job.type === 'EVENT_CHANGED') {
    if (event.status === 'CANCELLED') return 'Workshop was cancelled.';
    if (booking.status === 'CANCELLED') return 'Reservation was cancelled.';
    if (
      job.type === 'EVENT_CHANGED' &&
      change &&
      change.revision < event.scheduleRevision
    )
      return 'A later workshop revision superseded this change.';
  }
  return null;
}

export function notificationMessage(job: NotificationContext) {
  const contact = z.email().safeParse(process.env.ORGANIZER_CONTACT_EMAIL);
  if (!contact.success)
    throw new EmailDeliveryError(
      'ORGANIZER_CONTACT_EMAIL is not configured',
      false,
    );
  const { reservation: booking, eventChange: change } = job;
  const event = booking.event;
  const details = `${event.title}\nBooking reference: ${booking.bookingReference}\nStarts: ${time(event.startsAt)}\nEnds: ${time(event.endsAt)}\nVenue: ${event.venueName}\nAddress: ${event.venueAddress}`;
  let subject: string;
  let text: string;
  switch (job.type) {
    case 'BOOKING_CONFIRMED': {
      const affected = booking.bookedRevision < event.scheduleRevision;
      const cutoff = affected
        ? event.startsAt
        : new Date(event.startsAt.getTime() - 86_400_000);
      subject = `Booking confirmed: ${event.title}`;
      text = `Your place is confirmed.\n\n${details}\n\n${affected ? 'Your workshop has changed. You may cancel before its revised start' : 'Self-service cancellation is available strictly before'}: ${time(cutoff)}. For later requests, contact the organizer.`;
      break;
    }
    case 'RESERVATION_CANCELLED':
      subject = `Reservation cancelled: ${event.title}`;
      text = `Your reservation is cancelled.\n\n${details}\nCancelled: ${time(booking.cancelledAt!)}${booking.cancellationReason ? `\nReason: ${booking.cancellationReason}` : ''}\n\nThis notice applies only to the booking reference above. Any later booking has a different reference.`;
      break;
    case 'EVENT_CANCELLED':
      subject = `Workshop cancelled: ${event.title}`;
      text = `The workshop and this reservation were cancelled. The schedule below is the original scheduled session.\n\n${details}\nCancelled: ${time(booking.cancelledAt!)}\nReason: ${booking.cancellationReason}\n\nThis notice applies to the booking reference above.`;
      break;
    case 'EVENT_CHANGED':
      if (!change || change.eventId !== event.id)
        throw new EmailDeliveryError(
          'Notification change context is invalid',
          false,
        );
      subject = `Workshop updated: ${event.title}`;
      text = `Your reservation remains confirmed.\n\n${details}\n\nPrevious schedule: ${time(change.oldStartsAt)} to ${time(change.oldEndsAt)}\nPrevious venue: ${change.oldVenueName}, ${change.oldVenueAddress}\nRevised schedule: ${time(change.newStartsAt)} to ${time(change.newEndsAt)}\nRevised venue: ${change.newVenueName}, ${change.newVenueAddress}\nReason: ${change.reason}\n\nYou may cancel before the revised start: ${time(event.startsAt)}, including within the ordinary 24-hour cutoff.`;
      break;
  }
  return {
    to: job.recipientEmail,
    subject,
    text: `${text}\n\nOrganizer contact: ${contact.data}\nCurrent details and reservations are available on the workshop website.`,
    idempotencyKey: `email-job/${job.id}`,
  };
}
