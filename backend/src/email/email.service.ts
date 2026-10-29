import 'dotenv/config';
import { Injectable } from '@nestjs/common';
import { EMAIL_DELIVERY_POLICY } from './delivery-policy.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
}

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}

@Injectable()
export class EmailService {
  async send(message: EmailMessage): Promise<{ id: string }> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey)
      throw new EmailDeliveryError('RESEND_API_KEY is not configured', false);
    if (!from)
      throw new EmailDeliveryError('EMAIL_FROM is not configured', false);

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(message.idempotencyKey
            ? { 'Idempotency-Key': message.idempotencyKey }
            : {}),
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(EMAIL_DELIVERY_POLICY.requestTimeoutMs),
      });
    } catch {
      throw new EmailDeliveryError('Email delivery request failed', true);
    }
    if (!response.ok) {
      let name: unknown;
      try {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && 'name' in body)
          name = body.name;
      } catch {
        // Raw provider responses must never enter logs or stored errors.
      }
      const quota =
        name === 'daily_quota_exceeded' || name === 'monthly_quota_exceeded';
      const retryable =
        !quota &&
        (response.status === 408 ||
          response.status === 429 ||
          response.status >= 500 ||
          (response.status === 409 &&
            name === 'concurrent_idempotent_requests'));
      const header = response.headers.get('retry-after')?.trim();
      const seconds =
        header && /^\d+(\.\d+)?$/.test(header) ? Number(header) : NaN;
      const retryAfterMs =
        Number.isFinite(seconds) && seconds * 1000 <= 8.64e15 - Date.now()
          ? seconds * 1000
          : 0;
      throw new EmailDeliveryError(
        `Email delivery failed (HTTP ${response.status})${quota ? ': sending quota exhausted' : name === 'invalid_idempotent_request' ? ': idempotency payload conflict' : ''}`,
        retryable,
        retryable ? retryAfterMs : 0,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new EmailDeliveryError(
        'Email provider returned an invalid response',
        true,
      );
    }
    if (
      !data ||
      typeof data !== 'object' ||
      !('id' in data) ||
      typeof data.id !== 'string' ||
      !data.id.trim()
    ) {
      throw new EmailDeliveryError(
        'Email provider returned an invalid response',
        true,
      );
    }
    return { id: data.id };
  }
}
