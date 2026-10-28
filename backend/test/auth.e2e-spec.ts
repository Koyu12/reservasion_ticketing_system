import 'dotenv/config';
import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { jest } from '@jest/globals';
import { createEmailVerificationToken } from 'better-auth/api';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { requireTestDatabaseUrl } from './test-database.js';
import { EmailService } from '../src/email/email.service.js';
import type { EmailMessage } from '../src/email/email.service.js';
import { VerifiedEmailGuard } from '../src/auth/verified-email.guard.js';
import { promoteAdmin } from '../src/auth/promote-admin.js';

@Controller('api/test-json')
class JsonProbeController {
  @Post()
  echo(@Body() body: Record<string, unknown>) {
    return body;
  }

  @Post('booking-eligibility')
  @UseGuards(VerifiedEmailGuard)
  checkBookingEligibility() {
    return { eligible: true };
  }
}

describe('Email/password authentication (PostgreSQL)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let email: string;
  let authSecret: string;
  const sendEmail =
    jest.fn<(message: EmailMessage) => Promise<{ id: string }>>();
  const origin = 'http://localhost:5173';
  const password = 'Test-password-12345!';

  beforeAll(async () => {
    const url = requireTestDatabaseUrl(
      process.env.TEST_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    authSecret = randomBytes(32).toString('hex');
    const settings = {
      DATABASE_URL: url,
      BETTER_AUTH_SECRET: authSecret,
      BETTER_AUTH_URL: 'http://localhost:3000',
      FRONTEND_URL: origin,
    };
    const previous: Record<string, string | undefined> = {};
    try {
      for (const [key, value] of Object.entries(settings)) {
        previous[key] = process.env[key];
        process.env[key] = value;
      }
      const module = await Test.createTestingModule({
        imports: [AppModule],
        controllers: [JsonProbeController],
      })
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
    email = `auth-test-${randomUUID()}@example.invalid`;
    sendEmail.mockReset().mockResolvedValue({ id: 'mock-message-id' });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (prisma && email) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.verification.deleteMany({
          where: {
            value: user.id,
            identifier: { startsWith: 'reset-password:' },
          },
        });
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  function signup(extra: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', origin)
      .send({ name: 'Test attendee', email, password, ...extra });
  }
  function cookies(response: request.Response) {
    const values = response.headers['set-cookie'] as unknown as string[];
    expect(values).toBeDefined();
    return values.map((value) => value.split(';')[0]);
  }

  function verificationLink() {
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0][0];
    expect(message.to).toBe(email);
    expect(message.subject).toBe('Verify your email address');
    const match = message.text.match(/https?:\/\/\S+/);
    expect(match).not.toBeNull();
    return new URL(match![0]);
  }

  function checkBooking(cookie: string[]) {
    return request(app.getHttpServer())
      .post('/api/test-json/booking-eligibility')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({});
  }

  function requestReset(redirectTo = `${origin}/reset-password`) {
    return request(app.getHttpServer())
      .post('/api/auth/request-password-reset')
      .set('Origin', origin)
      .send({ email, redirectTo });
  }

  function resetLink() {
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0][0];
    expect(message.to).toBe(email);
    expect(message.subject).toBe('Reset your password');
    const match = message.text.match(/https?:\/\/\S+/);
    expect(match).not.toBeNull();
    return new URL(match![0]);
  }

  function resetPassword(
    token: string,
    newPassword = 'Replacement-password-12345!',
  ) {
    return request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .set('Origin', origin)
      .send({ token, newPassword });
  }

  it('register_as_attendee: stores credentials and an HTTP-only database session', async () => {
    const response = await signup().expect(200);
    expect(response.body).toMatchObject({
      user: { email, role: 'ATTENDEE', emailVerified: false },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { account: true, session: true },
    });
    expect(user.role).toBe('ATTENDEE');
    expect(user.account[0].password).toBeTruthy();
    expect(user.account[0].password).not.toBe(password);
    expect(user.session).toHaveLength(1);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/HttpOnly/i)]),
    );
  });

  it('login_restores_database_session: authenticates again after logout and survives another request', async () => {
    const registered = await signup().expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/sign-out')
      .set('Origin', origin)
      .set('Cookie', cookies(registered))
      .send({})
      .expect(200);
    const login = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    for (let i = 0; i < 2; i++) {
      const session = await request(app.getHttpServer())
        .get('/api/session')
        .set('Cookie', cookies(login))
        .expect(200);
      expect(session.body).toMatchObject({ user: { email, role: 'ATTENDEE' } });
      expect(session.body).not.toHaveProperty('session');
    }
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { session: true },
    });
    expect(user.session).toHaveLength(1);
  });

  it('logout_ends_session: revokes the stored session and rejects the old cookie', async () => {
    const registered = await signup().expect(200);
    const cookie = cookies(registered);
    await request(app.getHttpServer())
      .post('/api/auth/sign-out')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/session')
      .set('Cookie', cookie)
      .expect(401);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
  });

  it('rejects role injection during public registration', async () => {
    await signup({ role: 'ADMIN' }).expect(400);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('rejects the cookie once its database session is revoked', async () => {
    const registered = await signup().expect(200);
    await prisma.session.deleteMany({ where: { user: { email } } });
    await request(app.getHttpServer())
      .get('/api/session')
      .set('Cookie', cookies(registered))
      .expect(401);
  });

  it('rejects role injection through profile updates', async () => {
    const registered = await signup().expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/update-user')
      .set('Origin', origin)
      .set('Cookie', cookies(registered))
      .send({ role: 'ADMIN' })
      .expect(400);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.role).toBe('ATTENDEE');
  });

  it('rejects a wrong password', async () => {
    await signup().expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('does not authenticate an anonymous session request', async () => {
    await request(app.getHttpServer()).get('/api/session').expect(401);
  });

  it('rejects sign-up from an untrusted origin', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', 'https://untrusted.example')
      .send({ name: 'Test', email, password })
      .expect(403);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('parses JSON for authenticated application routes after auth is mounted', async () => {
    const registered = await signup().expect(200);
    const response = await request(app.getHttpServer())
      .post('/api/test-json')
      .set('Origin', origin)
      .set('Cookie', cookies(registered))
      .send({ message: 'JSON still works' })
      .expect(201);
    expect(response.body).toEqual({ message: 'JSON still works' });
  });

  it.each([undefined, 'https://untrusted.example'])(
    'rejects cookie-authenticated application mutations with origin %s',
    async (requestOrigin) => {
      const registered = await signup().expect(200);
      const mutation = request(app.getHttpServer())
        .post('/api/test-json')
        .set('Cookie', cookies(registered));
      if (requestOrigin) mutation.set('Origin', requestOrigin);
      await mutation.send({ message: 'must not execute' }).expect(403);
    },
  );

  it('requests a verification email after signup without creating an EmailJob', async () => {
    await signup({ callbackURL: `${origin}/verify-email` }).expect(200);
    const link = verificationLink();
    expect(link.origin).toBe('http://localhost:3000');
    expect(link.pathname).toBe('/api/auth/verify-email');
    expect(link.searchParams.get('callbackURL')).toBe(`${origin}/verify-email`);
    expect(link.searchParams.get('token')).toBeTruthy();
    expect(
      await prisma.emailJob.count({ where: { recipientEmail: email } }),
    ).toBe(0);
  });

  it('unverified_user_cannot_book: permits a session but rejects the booking guard', async () => {
    const response = await signup().expect(200);
    await request(app.getHttpServer())
      .get('/api/session')
      .set('Cookie', cookies(response))
      .expect(200);
    await checkBooking(cookies(response)).expect(403);
    await request(app.getHttpServer()).get('/').expect(200);
  });

  it('verified_user_is_eligible: follows the link and refreshes the existing session', async () => {
    const response = await signup({
      callbackURL: `${origin}/verify-email`,
    }).expect(200);
    const link = verificationLink();
    await request(app.getHttpServer())
      .get(link.pathname + link.search)
      .expect(302)
      .expect('Location', `${origin}/verify-email`);
    const session = await request(app.getHttpServer())
      .get('/api/session')
      .set('Cookie', cookies(response))
      .expect(200);
    expect(session.body).toMatchObject({
      user: { email, emailVerified: true },
    });
    await checkBooking(cookies(response)).expect(201, { eligible: true });
  });

  it('resends a link for an existing unverified account', async () => {
    const response = await signup().expect(200);
    sendEmail.mockClear();
    await request(app.getHttpServer())
      .post('/api/auth/send-verification-email')
      .set('Origin', origin)
      .set('Cookie', cookies(response))
      .send({ email, callbackURL: `${origin}/verify-email` })
      .expect(200);
    expect(verificationLink().searchParams.get('token')).toBeTruthy();
  });

  it('rejects an invalid token without verifying the user', async () => {
    const response = await signup().expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/verify-email')
      .query({ token: 'invalid-token', callbackURL: `${origin}/verify-email` })
      .expect(302)
      .expect('Location', `${origin}/verify-email?error=INVALID_TOKEN`);
    await checkBooking(cookies(response)).expect(403);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified,
    ).toBe(false);
  });

  it('rejects an expired token and allows requesting another link', async () => {
    const response = await signup().expect(200);
    const token = await createEmailVerificationToken(
      authSecret,
      email,
      undefined,
      -1,
    );
    await request(app.getHttpServer())
      .get('/api/auth/verify-email')
      .query({ token, callbackURL: `${origin}/verify-email` })
      .expect(302)
      .expect('Location', `${origin}/verify-email?error=TOKEN_EXPIRED`);
    await checkBooking(cookies(response)).expect(403);
    sendEmail.mockClear();
    await request(app.getHttpServer())
      .post('/api/auth/send-verification-email')
      .set('Origin', origin)
      .set('Cookie', cookies(response))
      .send({ email, callbackURL: `${origin}/verify-email` })
      .expect(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('keeps the account after delivery failure and supports resend without leaking details', async () => {
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    sendEmail.mockRejectedValueOnce(new Error('Sensitive provider details'));
    const response = await signup().expect(200);
    expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
    expect(warning).toHaveBeenCalledWith(
      'Verification email delivery failed; request a new link.',
    );
    expect(JSON.stringify(response.body)).not.toContain(
      'Sensitive provider details',
    );
    sendEmail.mockClear();
    await request(app.getHttpServer())
      .post('/api/auth/send-verification-email')
      .set('Origin', origin)
      .set('Cookie', cookies(response))
      .send({ email, callbackURL: `${origin}/verify-email` })
      .expect(200);
    verificationLink();
  });

  it('returns the same recovery response for existing and nonexistent accounts', async () => {
    await signup().expect(200);
    sendEmail.mockClear();
    const existing = await requestReset().expect(200);
    const link = resetLink();
    expect(link.origin).toBe('http://localhost:3000');
    expect(link.pathname.startsWith('/api/auth/reset-password/')).toBe(true);
    expect(link.searchParams.get('callbackURL')).toBe(
      `${origin}/reset-password`,
    );
    sendEmail.mockClear();
    const unknown = await request(app.getHttpServer())
      .post('/api/auth/request-password-reset')
      .set('Origin', origin)
      .send({
        email: `missing-${email}`,
        redirectTo: `${origin}/reset-password`,
      })
      .expect(200);
    expect(unknown.body).toEqual(existing.body);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(
      await prisma.emailJob.count({ where: { recipientEmail: email } }),
    ).toBe(0);
  });

  it('resets the password, revokes every session, and rejects reuse of the link', async () => {
    const registered = await signup().expect(200);
    const login = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(2);
    sendEmail.mockClear();
    await requestReset().expect(200);
    const link = resetLink();
    const callback = await request(app.getHttpServer())
      .get(link.pathname + link.search)
      .expect(302);
    const destination = new URL(callback.headers.location);
    expect(destination.origin + destination.pathname).toBe(
      `${origin}/reset-password`,
    );
    const token = destination.searchParams.get('token')!;
    expect(token).toBeTruthy();
    await resetPassword(token).expect(200);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
    for (const response of [registered, login]) {
      await request(app.getHttpServer())
        .get('/api/session')
        .set('Cookie', cookies(response))
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password: 'Replacement-password-12345!' })
      .expect(200);
    await resetPassword(token).expect(400);
  });

  it('rejects invalid reset tokens without changing the existing password', async () => {
    await signup().expect(200);
    await resetPassword('invalid-token').expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
  });

  it('rejects expired reset links and keeps the old password usable', async () => {
    await signup().expect(200);
    sendEmail.mockClear();
    await requestReset().expect(200);
    const link = resetLink();
    const token = link.pathname.split('/').at(-1)!;
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const changed = await prisma.verification.updateMany({
      where: { value: user.id, identifier: { startsWith: 'reset-password:' } },
      data: { expiresAt: new Date(0) },
    });
    expect(changed.count).toBe(1);
    await request(app.getHttpServer())
      .get(link.pathname + link.search)
      .expect(302)
      .expect('Location', `${origin}/reset-password?error=INVALID_TOKEN`);
    await resetPassword(token).expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
  });

  it('does not consume a reset token when the new password is rejected', async () => {
    await signup().expect(200);
    sendEmail.mockClear();
    await requestReset().expect(200);
    const token = resetLink().pathname.split('/').at(-1)!;
    await resetPassword(token, 'short').expect(400);
    await resetPassword(token).expect(200);
  });

  it('rejects untrusted password-reset redirects without requesting delivery', async () => {
    await signup().expect(200);
    sendEmail.mockClear();
    await requestReset('https://untrusted.example/reset-password').expect(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sanitizes recovery delivery failures and permits requesting a new link', async () => {
    await signup().expect(200);
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    sendEmail.mockClear();
    sendEmail.mockRejectedValueOnce(
      new Error('Sensitive reset-provider details'),
    );
    const response = await requestReset().expect(200);
    expect(JSON.stringify(response.body)).not.toContain(
      'Sensitive reset-provider details',
    );
    expect(warning).toHaveBeenCalledWith(
      'Password reset email delivery failed; request a new link.',
    );
    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    sendEmail.mockClear();
    await requestReset().expect(200);
    resetLink();
  });

  it('refuses to provision an admin for a nonexistent user', async () => {
    await expect(promoteAdmin(prisma, email)).rejects.toThrow('User not found');
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('refuses to promote an unverified attendee', async () => {
    await signup().expect(200);
    await expect(promoteAdmin(prisma, email)).rejects.toThrow(
      'Verify the email before promoting this user',
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { email } })).role,
    ).toBe('ATTENDEE');
  });

  it('promotes only the role, normalizes the email, and is safe to repeat', async () => {
    await signup().expect(200);
    const before = await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
      include: { account: true, session: true },
    });
    await expect(
      promoteAdmin(prisma, ` ${email.toUpperCase()} `),
    ).resolves.toBe('promoted');
    const after = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { account: true, session: true },
    });
    expect(after).toMatchObject({
      id: before.id,
      name: before.name,
      email: before.email,
      emailVerified: true,
      role: 'ADMIN',
      createdAt: before.createdAt,
    });
    expect(after.account).toEqual(before.account);
    expect(after.session).toEqual(before.session);
    await expect(promoteAdmin(prisma, email)).resolves.toBe('already-admin');
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('rejects anonymous admin access', async () => {
    await request(app.getHttpServer()).get('/api/admin/access').expect(401);
  });

  it('rejects attendee admin access', async () => {
    const response = await signup().expect(200);
    await request(app.getHttpServer())
      .get('/api/admin/access')
      .set('Cookie', cookies(response))
      .expect(403);
  });

  it('permits an admin and immediately rejects the same session after demotion', async () => {
    const response = await signup().expect(200);
    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });
    await promoteAdmin(prisma, email);
    const cookie = cookies(response);
    await request(app.getHttpServer())
      .get('/api/admin/access')
      .set('Cookie', cookie)
      .expect(200, { allowed: true });
    const session = await request(app.getHttpServer())
      .get('/api/session')
      .set('Cookie', cookie)
      .expect(200);
    expect(session.body).toMatchObject({ user: { email, role: 'ADMIN' } });
    await checkBooking(cookie).expect(201, { eligible: true });
    await prisma.user.update({
      where: { email },
      data: { emailVerified: false },
    });
    await checkBooking(cookie).expect(403);
    await prisma.user.update({ where: { email }, data: { role: 'ATTENDEE' } });
    await request(app.getHttpServer())
      .get('/api/admin/access')
      .set('Cookie', cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/session')
      .set('Cookie', cookie)
      .expect(200);
  });
});
