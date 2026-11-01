import { Test } from '@nestjs/testing';
import { CommonModule } from '../common.module.js';
import { APP_CONFIG } from '../config.js';
import type { AppConfig } from '../config.js';
import { PrismaService } from '../prisma.service.js';

describe('Startup configuration', () => {
  const previous = process.env.ORGANIZER_CONTACT_EMAIL;
  afterEach(() => {
    if (previous === undefined) delete process.env.ORGANIZER_CONTACT_EMAIL;
    else process.env.ORGANIZER_CONTACT_EMAIL = previous;
  });
  function context() {
    return Test.createTestingModule({ imports: [CommonModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
  }
  it.each([undefined, '', 'invalid-secret-value'])('rejects invalid contact config before application startup: %s', async (value) => {
    if (value === undefined) delete process.env.ORGANIZER_CONTACT_EMAIL;
    else process.env.ORGANIZER_CONTACT_EMAIL = value;
    try {
      await context();
      throw new Error('Expected startup failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('ORGANIZER_CONTACT_EMAIL is missing or invalid.');
      expect((error as Error).message).not.toContain('invalid-secret-value');
    }
  });
  it('registers one immutable config and ignores subsequent environment changes', async () => {
    process.env.ORGANIZER_CONTACT_EMAIL = 'organizer@example.com';
    const module = await context();
    try {
      await module.init();
      const config = module.get<AppConfig>(APP_CONFIG);
      expect(Object.isFrozen(config)).toBe(true);
      process.env.ORGANIZER_CONTACT_EMAIL = 'invalid';
      expect(module.get<AppConfig>(APP_CONFIG)).toBe(config);
      expect(config.organizerContactEmail).toBe('organizer@example.com');
    } finally {
      await module.close();
    }
  });
});
