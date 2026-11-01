import { z } from 'zod';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
}

export interface EmailResponse {
  id: string;
}
export class EmailValidation {
  static readonly PROVIDER_RESPONSE = z.object({ id: z.string().refine((value) => Boolean(value.trim())) });
}
