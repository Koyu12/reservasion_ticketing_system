import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';

const inputSchema = z.strictObject({
  adminEmail: z.string().trim().toLowerCase().pipe(z.email()),
  attendeeEmail: z.string().trim().toLowerCase().pipe(z.email()),
  attendeePassword: z.string().min(8).max(128),
});
export type DemoSetupInput = z.infer<typeof inputSchema>;
class DemoSetupError extends Error {}

export async function seedDemo(
  prisma: PrismaService,
  input: DemoSetupInput,
  now = new Date(),
) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new DemoSetupError(
      'Set DEMO_ADMIN_EMAIL, DEMO_ATTENDEE_EMAIL and DEMO_ATTENDEE_PASSWORD (8–128 characters).',
    );
  const config = parsed.data;
  if (config.adminEmail === config.attendeeEmail)
    throw new DemoSetupError(
      'The sample attendee must be separate from the private admin.',
    );
  const dayMs = 86_400_000;
  const monday = new Date(now.getTime() + 7 * 3_600_000);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weekOf = monday.toISOString().slice(0, 10);
  const titles = [
    'Introduction to Web Accessibility',
    'Practical TypeScript',
    'Designing Reliable APIs',
  ];

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`demo-attendee:${config.attendeeEmail}`}))`;
      const admin = await tx.user.findUnique({
        where: { email: config.adminEmail },
      });
      if (!admin || admin.role !== 'ADMIN' || !admin.emailVerified)
        throw new DemoSetupError(
          'DEMO_ADMIN_EMAIL must identify an existing verified private admin.',
        );
      const attendee = await tx.user.findUnique({
        where: { email: config.attendeeEmail },
        include: {
          account: {
            where: { providerId: 'credential' },
            select: { password: true },
          },
        },
      });
      const attendeeCreated = !attendee;
      if (
        attendee &&
        (attendee.role !== 'ATTENDEE' ||
          !attendee.emailVerified ||
          !attendee.account.some((account) => Boolean(account.password)))
      )
        throw new DemoSetupError(
          'Existing sample email must belong to a verified attendee with password access. No account was changed.',
        );
      if (!attendee) {
        const id = randomUUID();
        await tx.user.create({
          data: {
            id,
            name: 'Sample Attendee',
            email: config.attendeeEmail,
            emailVerified: true,
            role: 'ATTENDEE',
            account: {
              create: {
                id: randomUUID(),
                providerId: 'credential',
                accountId: id,
                password: await hashPassword(config.attendeePassword),
              },
            },
          },
        });
      }
      const workshops = titles.map((title, index) => {
        const digest = createHash('sha256')
          .update(`demo-workshop/${admin.id}/${weekOf}/${index}`)
          .digest('hex');
        const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
        const startsAt = new Date(
          monday.getTime() + (7 + index * 2) * dayMs + 2 * 3_600_000,
        );
        return {
          id,
          createdById: admin.id,
          title,
          description: `Sample workshop for the local reservation demo. Explore ${title.toLowerCase()} through practical exercises. This is demonstration content, not a real scheduled event.`,
          venueName: 'Demo Learning Studio',
          venueAddress:
            'Sample venue, Jakarta, Indonesia. Replace before a real event.',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3 * 3_600_000),
          registrationClosesAt: new Date(startsAt.getTime() - 15 * 3_600_000),
          capacity: 12 + index * 4,
          status: 'PUBLISHED' as const,
        };
      });
      const result = await tx.event.createMany({
        data: workshops,
        skipDuplicates: true,
      });
      return { attendeeCreated, workshopsCreated: result.count, weekOf };
    },
    { isolationLevel: 'ReadCommitted' },
  );
}

async function main() {
  let prisma: PrismaService | undefined;
  try {
    if (process.argv.length > 2)
      throw new DemoSetupError(
        'Use backend environment variables; this command takes no arguments.',
      );
    if (!process.env.DATABASE_URL)
      throw new DemoSetupError('DATABASE_URL is not configured.');
    const target = new URL(process.env.DATABASE_URL);
    if (
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      target.pathname === '/'
    )
      throw new DemoSetupError(
        'DATABASE_URL must name the intended PostgreSQL development database.',
      );
    console.log(
      'Target database:',
      decodeURIComponent(target.pathname.slice(1)),
    );
    prisma = new PrismaService();
    const result = await seedDemo(prisma, {
      adminEmail: process.env.DEMO_ADMIN_EMAIL ?? '',
      attendeeEmail: process.env.DEMO_ATTENDEE_EMAIL ?? '',
      attendeePassword: process.env.DEMO_ATTENDEE_PASSWORD ?? '',
    });
    console.log(
      result.attendeeCreated
        ? 'Created a preverified sample attendee.'
        : 'Reused the existing sample attendee; credentials unchanged.',
    );
    console.log(
      `Created ${result.workshopsCreated} upcoming sample workshops for demo week ${result.weekOf}. Existing records were preserved.`,
    );
  } catch (error) {
    console.error(
      error instanceof DemoSetupError
        ? error.message
        : 'Sample setup failed. Check configuration and database access.',
    );
    process.exitCode = 1;
  } finally {
    try {
      await prisma?.$disconnect();
    } catch {
      console.error('Failed to close the database connection.');
      process.exitCode = 1;
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  void main();
