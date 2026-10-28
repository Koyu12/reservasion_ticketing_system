import 'dotenv/config';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { EmailService } from '../src/email/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { requireTestDatabaseUrl } from './test-database.js';

describe('Google OAuth callback and account linking (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let email: string;
  let otherEmail: string;
  let subject: string;
  let stateIdentifiers: string[];
  let claims: Record<string, unknown>;
  let googleFetch: jest.SpiedFunction<typeof fetch>;
  let previousContactEmail: string | undefined;
  const origin = 'http://localhost:5173';
  const password = 'Test-password-12345!';
  const clientId = 'test-google-client';
  const sendEmail = jest.fn<EmailService['send']>();
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });

  beforeAll(async () => {
    const url = requireTestDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    const settings = {
      DATABASE_URL: url,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: 'http://localhost:3000',
      FRONTEND_URL: origin,
      GOOGLE_CLIENT_ID: clientId,
      GOOGLE_CLIENT_SECRET: 'dummy-google-secret',
      ORGANIZER_CONTACT_EMAIL: 'organizer@example.invalid',
    };
    const previous: Record<string, string | undefined> = {};
    try {
      for (const [key, value] of Object.entries(settings)) {
        previous[key] = process.env[key];
        process.env[key] = value;
      }
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(EmailService)
        .useValue({ send: sendEmail })
        .compile();
      app = module.createNestApplication({ bodyParser: false });
      prisma = app.get(PrismaService);
      const target = await prisma.$queryRaw<
        { database: string }[]
      >`SELECT current_database() AS database`;
      expect(target[0].database).toBe('reservation_ticketing_system_test');
      await app.init();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  beforeEach(() => {
    previousContactEmail = process.env.ORGANIZER_CONTACT_EMAIL;
    process.env.ORGANIZER_CONTACT_EMAIL = 'organizer@example.invalid';
    email = `google-test-${randomUUID()}@example.invalid`;
    otherEmail = `other-${email}`;
    subject = randomUUID();
    stateIdentifiers = [];
    claims = {
      sub: subject,
      email,
      email_verified: true,
      name: 'Google attendee',
      role: 'ADMIN',
    };
    sendEmail.mockReset().mockResolvedValue({ id: 'mock-message-id' });
    googleFetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === 'https://oauth2.googleapis.com/token') {
          const now = Math.floor(Date.now() / 1000);
          const header = Buffer.from(
            JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }),
          ).toString('base64url');
          const payload = Buffer.from(
            JSON.stringify({
              iss: 'https://accounts.google.com',
              aud: clientId,
              iat: now,
              exp: now + 3600,
              ...claims,
            }),
          ).toString('base64url');
          const content = `${header}.${payload}`;
          const signature = sign(
            'RSA-SHA256',
            Buffer.from(content),
            keys.privateKey,
          ).toString('base64url');
          return Promise.resolve(
            Response.json({
              access_token: 'mock-access-token',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'openid email profile',
              id_token: `${content}.${signature}`,
            }),
          );
        }
        if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
          return Promise.resolve(
            Response.json({
              keys: [
                {
                  ...keys.publicKey.export({ format: 'jwk' }),
                  kid: 'test-key',
                  alg: 'RS256',
                  use: 'sig',
                },
              ],
            }),
          );
        }
        return Promise.reject(
          new Error('Unexpected outbound request in Google test'),
        );
      });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (previousContactEmail === undefined)
      delete process.env.ORGANIZER_CONTACT_EMAIL;
    else process.env.ORGANIZER_CONTACT_EMAIL = previousContactEmail;
    if (prisma && email) {
      const event = { createdBy: { email: { in: [email, otherEmail] } } };
      await prisma.emailJob.deleteMany({ where: { reservation: { event } } });
      await prisma.reservation.deleteMany({ where: { event } });
      await prisma.eventChange.deleteMany({ where: { event } });
      await prisma.event.deleteMany({ where: event });
      await prisma.verification.deleteMany({
        where: { identifier: { in: stateIdentifiers } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [email, otherEmail] } },
      });
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  function cookies(response: request.Response) {
    return ((response.headers['set-cookie'] ?? []) as unknown as string[]).map(
      (value) => value.split(';')[0],
    );
  }

  async function beginGoogle() {
    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-in/social')
      .set('Origin', origin)
      .send({
        provider: 'google',
        callbackURL: `${origin}/events`,
        errorCallbackURL: `${origin}/login`,
        disableRedirect: true,
      })
      .expect(200);
    const body = response.body as { url: string };
    const url = new URL(body.url);
    const state = url.searchParams.get('state')!;
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback/google',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual([
      'email',
      'openid',
      'profile',
    ]);
    stateIdentifiers.push(`auth-state:${state}`);
    return { state, cookie: cookies(response) };
  }

  async function completeGoogle() {
    const flow = await beginGoogle();
    return request(app.getHttpServer())
      .get('/api/auth/callback/google')
      .set('Cookie', flow.cookie)
      .query({ state: flow.state, code: 'mock-authorization-code' })
      .expect(302);
  }

  async function localUser(verified = true) {
    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', origin)
      .send({ name: 'Local attendee', email, password })
      .expect(200);
    const user = await prisma.user.update({
      where: { email },
      data: { emailVerified: verified },
    });
    sendEmail.mockClear();
    return user;
  }

  it('creates one verified attendee without verification email or provider-supplied admin role', async () => {
    const response = await completeGoogle();
    expect(response.headers.location).toBe(`${origin}/events`);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { account: true },
    });
    expect(user.role).toBe('ATTENDEE');
    expect(user.emailVerified).toBe(true);
    expect(user.account).toHaveLength(1);
    expect(user.account[0].providerId).toBe('google');
    expect(user.account[0].password).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
    const session = await request(app.getHttpServer())
      .get('/api/session')
      .set('Cookie', cookies(response))
      .expect(200);
    expect(session.body).toMatchObject({
      user: { id: user.id, role: 'ATTENDEE', emailVerified: true },
    });
  });

  it('verified_google_links_existing_user and both sign-in methods retain the same identity', async () => {
    const existing = await localUser();
    const event = await prisma.event.create({
      data: {
        createdById: existing.id,
        title: 'Existing booking workshop',
        description: 'Test workshop',
        venueName: 'Hall',
        venueAddress: '10 Example Road',
        capacity: 5,
        status: 'PUBLISHED',
        startsAt: new Date(Date.now() + 3 * 86400000),
        endsAt: new Date(Date.now() + 3 * 86400000 + 3600000),
        registrationClosesAt: new Date(Date.now() + 2 * 86400000),
      },
    });
    const old = await prisma.reservation.create({
      data: {
        eventId: event.id,
        userId: existing.id,
        bookingReference: randomUUID(),
        bookedRevision: 0,
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: existing.id,
        cancellationSource: 'SELF_SERVICE',
      },
    });
    const active = await prisma.reservation.create({
      data: {
        eventId: event.id,
        userId: existing.id,
        bookingReference: randomUUID(),
        bookedRevision: 0,
      },
    });
    const response = await completeGoogle();
    expect(response.headers.location).toBe(`${origin}/events`);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { account: true },
    });
    expect(user.id).toBe(existing.id);
    expect(user.account).toHaveLength(2);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    const login = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    expect(login.body).toMatchObject({ user: { id: existing.id } });
    const session = await request(app.getHttpServer())
      .get('/api/session')
      .set('Cookie', cookies(response))
      .expect(200);
    expect(session.body).toMatchObject({ user: { id: existing.id } });
    type Listed = {
      current: { id: string; bookingReference: string }[];
      history: { id: string; bookingReference: string }[];
    };
    const passwordList = await request(app.getHttpServer())
      .get('/api/reservations')
      .set('Cookie', cookies(login))
      .expect(200);
    const googleList = await request(app.getHttpServer())
      .get('/api/reservations')
      .set('Cookie', cookies(response))
      .expect(200);
    expect(googleList.body).toEqual(passwordList.body);
    const reservations = googleList.body as Listed;
    expect(
      reservations.current.map((booking) => [
        booking.id,
        booking.bookingReference,
      ]),
    ).toEqual([[active.id, active.bookingReference]]);
    expect(
      reservations.history.map((booking) => [
        booking.id,
        booking.bookingReference,
      ]),
    ).toEqual([[old.id, old.bookingReference]]);
    for (const booking of [old, active]) {
      const detail = await request(app.getHttpServer())
        .get(`/api/reservations/${booking.id}`)
        .set('Cookie', cookies(response))
        .expect(200);
      expect(detail.body).toMatchObject({
        reservation: {
          id: booking.id,
          bookingReference: booking.bookingReference,
        },
      });
    }
    const stranger = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', origin)
      .send({ name: 'Other attendee', email: otherEmail, password })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/reservations/${active.id}`)
      .set('Cookie', cookies(stranger))
      .expect(404);
  });

  it('unverified_identity_is_not_implicitly_linked when the local account is unverified', async () => {
    const existing = await localUser(false);
    const response = await completeGoogle();
    expect(new URL(response.headers.location).searchParams.get('error')).toBe(
      'account_not_linked',
    );
    expect(
      await prisma.account.count({
        where: { userId: existing.id, providerId: 'google' },
      }),
    ).toBe(0);
    await request(app.getHttpServer())
      .get('/api/session')
      .set('Cookie', cookies(response))
      .expect(401);
  });

  it('does not trust an unverified Google email for automatic linking', async () => {
    const existing = await localUser();
    claims.email_verified = false;
    const response = await completeGoogle();
    expect(new URL(response.headers.location).searchParams.get('error')).toBe(
      'account_not_linked',
    );
    expect(
      await prisma.account.count({
        where: { userId: existing.id, providerId: 'google' },
      }),
    ).toBe(0);
  });

  it('keeps different emails as separate users', async () => {
    const existing = await localUser();
    claims.email = otherEmail;
    const response = await completeGoogle();
    expect(response.headers.location).toBe(`${origin}/events`);
    const other = await prisma.user.findUniqueOrThrow({
      where: { email: otherEmail },
    });
    expect(other.id).not.toBe(existing.id);
    expect(
      await prisma.account.count({
        where: { userId: existing.id, providerId: 'google' },
      }),
    ).toBe(0);
  });

  it('keeps a new unverified Google identity unverified and requests email verification', async () => {
    claims.email_verified = false;
    const response = await completeGoogle();
    expect(response.headers.location).toBe(`${origin}/events`);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(false);
    expect(user.role).toBe('ATTENDEE');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: email,
      subject: 'Verify your email address',
    });
  });

  it('preserves an existing server-assigned admin role when linking', async () => {
    const existing = await localUser();
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN' },
    });
    const response = await completeGoogle();
    expect(response.headers.location).toBe(`${origin}/events`);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { email } })).role,
    ).toBe('ADMIN');
  });

  it('does not create a user or session when Google authorization is cancelled', async () => {
    const flow = await beginGoogle();
    const response = await request(app.getHttpServer())
      .get('/api/auth/callback/google')
      .set('Cookie', flow.cookie)
      .query({ state: flow.state, error: 'access_denied' })
      .expect(302);
    expect(new URL(response.headers.location).searchParams.get('error')).toBe(
      'access_denied',
    );
    expect(googleFetch).not.toHaveBeenCalled();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('rejects a mismatched state before exchanging the Google code', async () => {
    const flow = await beginGoogle();
    const response = await request(app.getHttpServer())
      .get('/api/auth/callback/google')
      .set('Cookie', flow.cookie)
      .query({ state: `${flow.state}-wrong`, code: 'mock-authorization-code' })
      .expect(302);
    const destination = new URL(response.headers.location);
    expect(destination.origin + destination.pathname).toBe(`${origin}/login`);
    expect(googleFetch).not.toHaveBeenCalled();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('requires the original browser state cookie before exchanging the Google code', async () => {
    const flow = await beginGoogle();
    const response = await request(app.getHttpServer())
      .get('/api/auth/callback/google')
      .query({ state: flow.state, code: 'mock-authorization-code' })
      .expect(302);
    expect(new URL(response.headers.location).searchParams.get('error')).toBe(
      'state_mismatch',
    );
    expect(googleFetch).not.toHaveBeenCalled();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});
