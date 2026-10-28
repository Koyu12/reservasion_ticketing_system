import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  let service: PrismaService;
  let module: TestingModule | undefined;
  let previousUrl: string | undefined;

  beforeEach(async () => {
    previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      'postgresql://test:test@localhost:5432/reservation_ticketing_system_unit_test';
    module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    try {
      await module?.close();
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
