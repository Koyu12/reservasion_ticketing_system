import 'dotenv/config';
import { Injectable } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class EmailService {
  async send(message: EmailMessage): Promise<{ id: string }> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
    if (!from) throw new Error('EMAIL_FROM is not configured');

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('Email delivery request failed');
    }
    if (!response.ok) {
      throw new Error(`Email delivery failed (HTTP ${response.status})`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error('Email provider returned an invalid response');
    }
    if (
      !data ||
      typeof data !== 'object' ||
      !('id' in data) ||
      typeof data.id !== 'string' ||
      !data.id.trim()
    ) {
      throw new Error('Email provider returned an invalid response');
    }
    return { id: data.id };
  }
}
