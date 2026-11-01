import { createLogger } from 'winston';
import { createLoggerOptions } from '../common/logger.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaService } from '../common/prisma.service.js';

class AdminPromotionError extends Error {}

export async function promoteAdmin(prisma: Pick<PrismaService, 'user'>, email: string): Promise<'promoted' | 'already-admin'> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new AdminPromotionError('An email is required');
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, role: true, emailVerified: true } });
  if (!user) throw new AdminPromotionError('User not found');
  if (!user.emailVerified) {
    throw new AdminPromotionError('Verify the email before promoting this user');
  }
  if (user.role === 'ADMIN') return 'already-admin';
  const result = await prisma.user.updateMany({
    where: { id: user.id, email: normalizedEmail, emailVerified: true, role: 'ATTENDEE' },
    data: { role: 'ADMIN' },
  });
  if (result.count !== 1) {
    throw new AdminPromotionError('User eligibility changed; retry the promotion');
  }
  return 'promoted';
}

async function main() {
  const logger = createLogger(createLoggerOptions()).child({ context: 'AdminPromotion' });
  let prisma: PrismaService | undefined;
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !args[0].trim()) {
      throw new AdminPromotionError('Usage: npm run admin:promote -- <verified-email>');
    }
    if (!process.env.DATABASE_URL) throw new AdminPromotionError('DATABASE_URL is not configured');
    const target = new URL(process.env.DATABASE_URL);
    if (!['postgresql:', 'postgres:'].includes(target.protocol) || target.pathname === '/') {
      throw new AdminPromotionError('DATABASE_URL must name a PostgreSQL database');
    }
    logger.info('Target database', { database: decodeURIComponent(target.pathname.slice(1)) });
    prisma = new PrismaService();
    const result = await promoteAdmin(prisma, args[0]);
    logger.info(result === 'promoted' ? 'User promoted to ADMIN.' : 'User is already ADMIN.');
  } catch (error) {
    logger.error(
      error instanceof AdminPromotionError ? error.message : 'Admin promotion failed. Check the database configuration and connection.',
    );
    process.exitCode = 1;
  } finally {
    try {
      await prisma?.$disconnect();
    } catch {
      logger.error('Failed to close the database connection.');
      process.exitCode = 1;
    }
    logger.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
