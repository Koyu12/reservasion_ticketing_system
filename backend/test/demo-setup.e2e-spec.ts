import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { verifyPassword } from 'better-auth/crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { EmailService } from '../src/email/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { seedDemo } from '../src/demo/seed-demo.js';
import type { DemoSetupInput } from '../src/demo/seed-demo.js';
import { requireTestDatabaseUrl } from './test-database.js';

describe('Repeatable local demo setup (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let adminId: string;
  const adminEmail = `demo-admin-${randomUUID()}@example.invalid`;
  const attendeeEmails = new Set<string>();
  const origin = 'http://localhost:5173';
  const previous: Record<string, string | undefined> = {};
  const now = new Date('2041-03-06T05:00:00Z');

  beforeAll(async () => {
    const settings = {
      DATABASE_URL: requireTestDatabaseUrl(
        process.env.TEST_DATABASE_URL,
        process.env.DATABASE_URL,
      ),
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: 'http://localhost:3000',
      FRONTEND_URL: origin,
      ORGANIZER_CONTACT_EMAIL: 'organizer@example.invalid',
      EMAIL_WORKER_ENABLED: 'false',
    };
    for (const [key, value] of Object.entries(settings)) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: () => Promise.resolve({ id: 'mock-email' }) })
      .compile();
    app = module.createNestApplication({ bodyParser: false });
    prisma = app.get(PrismaService);
    await app.init();
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', origin)
      .send({
        name: 'Private demo admin',
        email: adminEmail,
        password: 'Private-admin-test-123!',
      })
      .expect(200);
    adminId = (response.body as { user: { id: string } }).user.id;
    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'ADMIN', emailVerified: true },
    });
  });
  afterEach(async () => {
    const event = { createdById: adminId };
    await prisma.emailJob.deleteMany({ where: { reservation: { event } } });
    await prisma.reservation.deleteMany({ where: { event } });
    await prisma.eventChange.deleteMany({ where: { event } });
    await prisma.event.deleteMany({ where: event });
    await prisma.user.deleteMany({
      where: { email: { in: [...attendeeEmails] } },
    });
    attendeeEmails.clear();
    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'ADMIN', emailVerified: true },
    });
  });
  afterAll(async () => {
    try {
      await prisma?.user.deleteMany({ where: { id: adminId } });
    } finally {
      await app?.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  function config(): DemoSetupInput {
    const attendeeEmail = `demo-attendee-${randomUUID()}@example.invalid`;
    attendeeEmails.add(attendeeEmail);
    return {
      adminEmail,
      attendeeEmail,
      attendeePassword: 'Sample-attendee-password-123!',
    };
  }
  function workshops() {
    return prisma.event.findMany({
      where: { createdById: adminId },
      orderBy: { startsAt: 'asc' },
    });
  }

  it('creates a verified attendee and three correctly scheduled published samples', async () => {
    const input = config();
    const result = await seedDemo(prisma, input, now);
    expect(result).toMatchObject({
      attendeeCreated: true,
      workshopsCreated: 3,
    });
    const attendee = await prisma.user.findUniqueOrThrow({
      where: { email: input.attendeeEmail },
      include: { account: true },
    });
    expect(attendee).toMatchObject({ role: 'ATTENDEE', emailVerified: true });
    expect(attendee.account).toHaveLength(1);
    expect(
      await verifyPassword({
        hash: attendee.account[0].password!,
        password: input.attendeePassword,
      }),
    ).toBe(true);
    const samples = await workshops();
    expect(samples).toHaveLength(3);
    samples.forEach((event, index) => {
      const local = new Date(event.startsAt.getTime() + 7 * 3_600_000);
      expect(event.status).toBe('PUBLISHED');
      expect(event.startsAt.getTime()).toBeGreaterThan(now.getTime());
      expect(local.getUTCHours()).toBe(9);
      expect(local.getUTCDay()).toBe(1 + 2 * index);
      expect(event.endsAt.getTime() - event.startsAt.getTime()).toBe(
        3 * 3_600_000,
      );
      expect(
        event.startsAt.getTime() - event.registrationClosesAt.getTime(),
      ).toBe(15 * 3_600_000);
      expect(event.description).toContain('demonstration content');
    });
  });

  it('reruns preserve credentials, edited workshops, reservations, and notification history', async () => {
    const input = config();
    await seedDemo(prisma, input, now);
    const attendee = await prisma.user.findUniqueOrThrow({
      where: { email: input.attendeeEmail },
      include: { account: true },
    });
    const sample = (await workshops())[0];
    await prisma.event.update({
      where: { id: sample.id },
      data: { title: 'Organizer edited this sample', capacity: 30 },
    });
    const reservation = await prisma.reservation.create({
      data: {
        eventId: sample.id,
        userId: attendee.id,
        bookingReference: randomUUID(),
        bookedRevision: 0,
      },
    });
    const notification = await prisma.emailJob.create({
      data: {
        reservationId: reservation.id,
        type: 'BOOKING_CONFIRMED',
        recipientEmail: input.attendeeEmail,
        deduplicationKey: `BOOKING_CONFIRMED:${reservation.id}`,
        nextAttemptAt: new Date(),
      },
    });
    const first = await workshops();
    expect(
      await seedDemo(
        prisma,
        { ...input, attendeePassword: 'Different-unused-password-123!' },
        new Date(now.getTime() + 86_400_000),
      ),
    ).toMatchObject({ attendeeCreated: false, workshopsCreated: 0 });
    expect(await workshops()).toEqual(first);
    expect(
      await prisma.user.findUnique({
        where: { id: attendee.id },
        include: { account: true },
      }),
    ).toEqual(attendee);
    expect(
      await prisma.reservation.findUnique({ where: { id: reservation.id } }),
    ).toEqual(reservation);
    expect(
      await prisma.emailJob.findUnique({ where: { id: notification.id } }),
    ).toEqual(notification);
  });

  it('later-week setup adds upcoming samples while preserving all older records', async () => {
    const input = config();
    await seedDemo(prisma, input, now);
    const older = await workshops();
    expect(
      (await seedDemo(prisma, input, new Date(now.getTime() + 7 * 86_400_000)))
        .workshopsCreated,
    ).toBe(3);
    const all = await workshops();
    expect(all).toHaveLength(6);
    expect(all.slice(0, 3)).toEqual(older);
  });

  it('uses WIB week boundaries even while the UTC calendar still says Sunday', async () => {
    const input = config();
    await seedDemo(prisma, input, now);
    const samples = await workshops();
    const monday = new Date(
      `${(await seedDemo(prisma, input, now)).weekOf}T00:00:00+07:00`,
    );
    const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);
    const before = await seedDemo(
      prisma,
      input,
      new Date(nextMonday.getTime() - 1),
    );
    expect(before.workshopsCreated).toBe(0);
    const after = await seedDemo(prisma, input, nextMonday);
    expect(after.workshopsCreated).toBe(3);
    expect((await workshops()).slice(0, 3)).toEqual(samples);
  });

  it('concurrent setup remains repeatable', async () => {
    const input = config();
    const results = await Promise.all([
      seedDemo(prisma, input, now),
      seedDemo(prisma, input, now),
    ]);
    expect(results.map((result) => result.workshopsCreated).sort()).toEqual([
      0, 3,
    ]);
    expect(
      await prisma.user.count({ where: { email: input.attendeeEmail } }),
    ).toBe(1);
    expect(await workshops()).toHaveLength(3);
  });

  it.each(['missing', 'unverified', 'attendee'])(
    'requires an existing verified admin: %s',
    async (kind) => {
      const input = config();
      if (kind === 'missing')
        input.adminEmail = 'missing-admin@example.invalid';
      if (kind === 'unverified')
        await prisma.user.update({
          where: { id: adminId },
          data: { emailVerified: false },
        });
      if (kind === 'attendee')
        await prisma.user.update({
          where: { id: adminId },
          data: { role: 'ATTENDEE' },
        });
      await expect(seedDemo(prisma, input, now)).rejects.toThrow(
        'existing verified private admin',
      );
      expect(await workshops()).toHaveLength(0);
      expect(
        await prisma.user.findUnique({ where: { email: input.attendeeEmail } }),
      ).toBeNull();
    },
  );

  it.each(['admin', 'unverified', 'no-password'])(
    'refuses incompatible existing attendee accounts: %s',
    async (kind) => {
      const input = config();
      const existing = await prisma.user.create({
        data: {
          id: randomUUID(),
          name: 'Preserve me',
          email: input.attendeeEmail,
          role: kind === 'admin' ? 'ADMIN' : 'ATTENDEE',
          emailVerified: kind !== 'unverified',
        },
      });
      await expect(seedDemo(prisma, input, now)).rejects.toThrow(
        'Existing sample email',
      );
      expect(
        await prisma.user.findUnique({ where: { id: existing.id } }),
      ).toEqual(existing);
      expect(await workshops()).toHaveLength(0);
    },
  );

  it('rejects missing settings and using the admin as the sample attendee', async () => {
    const input = config();
    await expect(
      seedDemo(prisma, { ...input, attendeePassword: '' }, now),
    ).rejects.toThrow('DEMO_ATTENDEE_PASSWORD');
    await expect(
      seedDemo(prisma, { ...input, attendeeEmail: adminEmail }, now),
    ).rejects.toThrow('separate from the private admin');
    expect(await workshops()).toHaveLength(0);
  });

  it('the sample attendee can sign in, book, view history, cancel and cannot manage events', async () => {
    const input = config();
    await seedDemo(prisma, input, now);
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email: input.attendeeEmail, password: input.attendeePassword })
      .expect(200);
    const cookie = (response.headers['set-cookie'] as unknown as string[]).map(
      (value) => value.split(';')[0],
    );
    const event = (await workshops())[0];
    const booking = await request(app.getHttpServer())
      .post('/api/reservations')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ eventId: event.id })
      .expect(201);
    const id = (booking.body as { reservation: { id: string } }).reservation.id;
    const list = await request(app.getHttpServer())
      .get('/api/reservations')
      .set('Cookie', cookie)
      .expect(200);
    expect((list.body as { current: { id: string }[] }).current).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
    await request(app.getHttpServer())
      .get('/api/admin/events')
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/notifications/failed')
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/reservations/${id}/cancel`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({})
      .expect(200);
    const history = await request(app.getHttpServer())
      .get('/api/reservations')
      .set('Cookie', cookie)
      .expect(200);
    expect(
      (history.body as { history: { id: string; status: string }[] }).history,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, status: 'CANCELLED' }),
      ]),
    );
  });
});
