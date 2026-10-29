import { jest } from '@jest/globals';
import { EmailService } from './email.service.js';
import { EMAIL_DELIVERY_POLICY } from './delivery-policy.js';

describe('Email delivery policy', () => {
  it('provides increasing delays for every retry and a lease longer than the request', () => {
    const policy = EMAIL_DELIVERY_POLICY;
    expect(policy.retryDelaysMs).toHaveLength(policy.maxAttemptsPerCycle - 1);
    let previousDelay = 0;
    for (const delay of policy.retryDelaysMs) {
      expect(delay).toBeGreaterThan(previousDelay);
      previousDelay = delay;
    }
    expect(policy.pollIntervalMs).toBeGreaterThan(0);
    expect(policy.requestTimeoutMs).toBeGreaterThan(0);
    expect(policy.claimTtlMs).toBeGreaterThan(policy.requestTimeoutMs);
    expect(policy.idempotencyWindowMs).toBeGreaterThan(0);
  });
});

describe('EmailService', () => {
  const message = {
    to: 'recipient@example.invalid',
    subject: 'Test message',
    text: 'Email delivery test',
  };
  let service: EmailService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.EMAIL_FROM = 'Workshop App <onboarding@resend.dev>';
    service = new EmailService();
    fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock.mockRejectedValue(new Error('Unexpected HTTP request'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
  });

  it('sends the configured sender and message and returns the provider ID', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(Response.json({ id: 'test-message-id' }));

    await expect(service.send(message)).resolves.toEqual({
      id: 'test-message-id',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Workshop App <onboarding@resend.dev>',
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(timeout).toHaveBeenCalledWith(
      EMAIL_DELIVERY_POLICY.requestTimeoutMs,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['RESEND_API_KEY', 'EMAIL_FROM'])(
    'rejects missing %s before making an HTTP request',
    async (key) => {
      delete process.env[key];
      await expect(service.send(message)).rejects.toThrow(
        `${key} is not configured`,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 429, 500])(
    'sanitizes an HTTP %i rejection',
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json({ message: 'Sensitive provider response' }, { status }),
      );
      await expect(service.send(message)).rejects.toThrow(
        `Email delivery failed (HTTP ${status})`,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    new Error('Sensitive network details'),
    new DOMException('Sensitive timeout details', 'TimeoutError'),
  ])('sanitizes a network or timeout failure: %s', async (error) => {
    fetchMock.mockRejectedValue(error);
    await expect(service.send(message)).rejects.toThrow(
      'Email delivery request failed',
    );
  });

  it.each([{}, { id: '' }, { id: 123 }, null])(
    'rejects an invalid success response: %p',
    async (body) => {
      fetchMock.mockResolvedValue(Response.json(body));
      await expect(service.send(message)).rejects.toThrow(
        'Email provider returned an invalid response',
      );
    },
  );

  it('sanitizes a response that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('Sensitive malformed response'));
    await expect(service.send(message)).rejects.toThrow(
      'Email provider returned an invalid response',
    );
  });

  it('sanitizes an interrupted response body without retrying', async () => {
    const response = Response.json({ id: 'test-message-id' });
    jest
      .spyOn(response, 'json')
      .mockRejectedValue(
        new DOMException('Sensitive body details', 'TimeoutError'),
      );
    fetchMock.mockResolvedValue(response);

    await expect(service.send(message)).rejects.toThrow(
      'Email provider returned an invalid response',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the supplied stable idempotency identity', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'accepted' }));
    await service.send({ ...message, idempotencyKey: 'email-job/test-job' });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      'Idempotency-Key': 'email-job/test-job',
    });
  });

  it.each([
    [408, 'request_timeout', true],
    [500, 'application_error', true],
    [429, 'rate_limit_exceeded', true],
    [409, 'concurrent_idempotent_requests', true],
    [429, 'daily_quota_exceeded', false],
    [429, 'monthly_quota_exceeded', false],
    [409, 'invalid_idempotent_request', false],
    [409, 'unknown', false],
    [401, 'validation_error', false],
    [403, 'validation_error', false],
    [422, 'validation_error', false],
  ])('classifies HTTP %s / %s', async (status, name, retryable) => {
    fetchMock.mockResolvedValue(
      Response.json(
        { name, message: 'Sensitive provider text' },
        { status: Number(status) },
      ),
    );
    await expect(service.send(message)).rejects.toMatchObject({ retryable });
  });

  it.each([
    ['90', 90_000],
    ['0', 0],
    ['1.5', 1500],
    ['-1', 0],
    ['', 0],
    ['tomorrow', 0],
    ['Infinity', 0],
    ['1e100', 0],
  ])('interprets retry-after %s as %s ms', async (header, expected) => {
    fetchMock.mockResolvedValue(
      Response.json(
        { name: 'rate_limit_exceeded' },
        {
          status: 429,
          headers: { 'retry-after': String(header) },
        },
      ),
    );
    await expect(service.send(message)).rejects.toMatchObject({
      retryAfterMs: expected,
    });
  });
});
