import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');
export interface AppConfig {
  readonly organizerContactEmail: string;
}

export function createAppConfig(): AppConfig {
  const result = z.email().safeParse(process.env.ORGANIZER_CONTACT_EMAIL);
  if (!result.success) throw new Error('ORGANIZER_CONTACT_EMAIL is missing or invalid.');
  return Object.freeze({ organizerContactEmail: result.data });
}
