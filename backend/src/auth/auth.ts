import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { PrismaService } from '../prisma/prisma.service.js';
import { Logger } from '@nestjs/common';
import type { EmailService } from '../email/email.service.js';

export function getAuthOrigins(): string[] {
  const production = process.env.NODE_ENV === 'production';
  const backend =
    process.env.BETTER_AUTH_URL || (!production && 'http://localhost:3000');
  const frontend =
    process.env.FRONTEND_URL || (!production && 'http://localhost:5173');
  if (!backend || !frontend) {
    throw new Error(
      'BETTER_AUTH_URL and FRONTEND_URL must be configured in production',
    );
  }
  return [new URL(backend).origin, new URL(frontend).origin];
}

export function createAuth(prisma: PrismaService, emailService: EmailService) {
  const origins = getAuthOrigins();
  const logger = new Logger('AuthEmail');
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const googleConfigured = Boolean(googleClientId && googleClientSecret);
  return betterAuth({
    baseURL: origins[0],
    basePath: '/api/auth',
    trustedOrigins: origins,
    onAPIError: { errorURL: `${origins[1]}/login` },
    socialProviders: {
      google: {
        enabled: googleConfigured,
        clientId: googleClientId ?? '',
        clientSecret: googleClientSecret ?? '',
        accessType: 'online',
        includeGrantedScopes: false,
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: true,
        trustedProviders: [],
        allowDifferentEmails: false,
      },
    },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    emailAndPassword: {
      enabled: true,
      resetPasswordTokenExpiresIn: 3600, // 60 minutes
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => {
        void emailService
          .send({
            to: user.email,
            subject: 'Reset your password',
            text: `Reset your reservation account password:\n\n${url}\n\nThis link expires in one hour and can be used once. If you did not request a reset, ignore this email. Your password will remain unchanged.`,
          })
          .catch(() => {
            logger.warn(
              'Password reset email delivery failed; request a new link.',
            );
          });
        return Promise.resolve();
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 3600,
      autoSignInAfterVerification: false,
      sendVerificationEmail: ({ user, url }) => {
        void emailService
          .send({
            to: user.email,
            subject: 'Verify your email address',
            text: `Verify your email address to book workshops.\n\n${url}\n\nThis link expires in one hour. If you did not request this email, you can ignore it.`,
          })
          .catch(() => {
            logger.warn(
              'Verification email delivery failed; request a new link.',
            );
          });
        return Promise.resolve();
      },
    },
    session: { cookieCache: { enabled: false } },
    hooks: {
      before: createAuthMiddleware((context) => {
        const body: unknown = context.body;
        if (
          context.path === '/sign-in/social' &&
          body &&
          typeof body === 'object' &&
          'provider' in body &&
          body.provider === 'google' &&
          !googleConfigured
        ) {
          throw new APIError('SERVICE_UNAVAILABLE', {
            code: 'GOOGLE_NOT_CONFIGURED',
            message: 'Google sign-in is not configured',
          });
        }
        if (
          context.path === '/sign-up/email' &&
          body &&
          typeof body === 'object' &&
          'role' in body
        ) {
          throw new APIError('BAD_REQUEST', {
            message: 'Role cannot be supplied during registration',
          });
        }
        return Promise.resolve();
      }),
    },
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
      transaction: true,
    }),
    user: {
      additionalFields: {
        role: {
          type: ['ATTENDEE', 'ADMIN'],
          required: true,
          defaultValue: 'ATTENDEE',
          input: false,
        },
      },
    },
  });
}
